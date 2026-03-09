<script lang="ts">
	import { base } from '$app/paths';
	import { api, type Agent, type SoulInventoryItem } from '$lib/api';
	import { authSession } from '$lib/auth/session';

	type BadgeColor = 'success' | 'warning' | 'error' | 'info' | 'gray';
	type BadgeVariant = 'filled' | 'outlined';

	let agentBodies = $state<Agent[]>([]);
	let souls = $state<SoulInventoryItem[]>([]);
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);
	let actionLoadingId = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let actionMessage = $state<string | null>(null);
	let lastLoadedAt = $state<string | null>(null);
	let selectedTargets = $state<Record<string, string>>({});

	function normalizeText(value?: string | null): string | null {
		const trimmed = value?.trim();
		return trimmed ? trimmed : null;
	}

	function normalizeLower(value?: string | null): string {
		return normalizeText(value)?.toLowerCase() ?? '';
	}

	function humanize(value?: string | null): string {
		const normalized = normalizeText(value);
		if (!normalized) return 'Unknown';

		return normalized
			.replace(/[_-]+/g, ' ')
			.toLowerCase()
			.replace(/\b\w/g, (char) => char.toUpperCase());
	}

	function formatDateTime(value?: string | null): string {
		const normalized = normalizeText(value);
		if (!normalized) return '—';

		const parsed = new Date(normalized);
		if (Number.isNaN(parsed.getTime())) return normalized;
		return parsed.toLocaleString();
	}

	function agentBodyHref(username: string): string {
		return `${base}/agents/${encodeURIComponent(username)}`;
	}

	function statusValue(item: SoulInventoryItem): string {
		return normalizeText(item.agent.status) ?? 'unknown';
	}

	function lifecycleValue(item: SoulInventoryItem): string | null {
		return normalizeText(item.agent.lifecycleStatus);
	}

	function boundAgentUsername(item: SoulInventoryItem): string | null {
		return normalizeText(item.binding?.agentUsername);
	}

	function isBound(item: SoulInventoryItem): boolean {
		return item.bindingState === 'BOUND' && Boolean(boundAgentUsername(item));
	}

	function needsMintExecution(item: SoulInventoryItem): boolean {
		const status = normalizeLower(item.agent.status);
		const lifecycle = normalizeLower(item.agent.lifecycleStatus);

		return (status === 'pending' || lifecycle === 'pending') && !normalizeText(item.agent.mintTxHash);
	}

	function needsProfileSetup(item: SoulInventoryItem): boolean {
		return !item.agent.selfDescriptionVersion;
	}

	function isReadyForBinding(item: SoulInventoryItem): boolean {
		return !isBound(item) && item.availableForIncorporation && !needsMintExecution(item) && !needsProfileSetup(item);
	}

	function soulStateLabel(item: SoulInventoryItem): string {
		const username = boundAgentUsername(item);
		if (username) return `Bound to @${username}`;
		if (needsMintExecution(item) || needsProfileSetup(item)) return 'Pending soul setup';
		return 'Unbound';
	}

	function readinessLabel(item: SoulInventoryItem): string {
		const username = boundAgentUsername(item);
		if (username) return `Already bound to agent body @${username}`;
		if (needsMintExecution(item)) return 'Pending mint execution';
		if (needsProfileSetup(item)) return 'Pending profile/self-description';
		if (isReadyForBinding(item)) return 'Ready to bind to an agent body';
		return 'Unavailable on this instance';
	}

	function readinessDescription(item: SoulInventoryItem): string {
		const username = boundAgentUsername(item);
		if (username) {
			return `This soul is already incorporated into agent body @${username}. Souls and bodies stay separate until you take this explicit step.`;
		}
		if (needsMintExecution(item)) {
			return 'The soul record exists, but mint execution has not been recorded here yet.';
		}
		if (needsProfileSetup(item)) {
			return 'Minting is recorded, but the soul still needs its self-description/profile before incorporation is ready.';
		}
		if (isReadyForBinding(item)) {
			return 'This soul matches one of your linked wallets and is ready for explicit binding to one of your local agent bodies.';
		}
		return 'This soul belongs to your principal, but it is not currently available to bind to an agent body on this instance.';
	}

	function statusBadgeColor(item: SoulInventoryItem): BadgeColor {
		const normalized = normalizeLower(item.agent.status) || normalizeLower(item.agent.lifecycleStatus);

		if (normalized === 'active') return 'success';
		if (normalized === 'pending') return 'warning';
		if (normalized === 'suspended' || normalized === 'self_suspended') return 'error';
		if (normalized === 'archived' || normalized === 'succeeded') return 'gray';
		return 'info';
	}

	function stateBadgeColor(item: SoulInventoryItem): BadgeColor {
		if (isBound(item)) return 'success';
		if (needsMintExecution(item) || needsProfileSetup(item)) return 'warning';
		return 'info';
	}

	function badgeClass(color: BadgeColor, variant: BadgeVariant): string {
		return `gr-badge gr-badge--sm gr-badge--${variant} gr-badge--${color}`;
	}

	function soulSortRank(item: SoulInventoryItem): number {
		if (isReadyForBinding(item)) return 0;
		if (!isBound(item) && (needsMintExecution(item) || needsProfileSetup(item))) return 1;
		if (isBound(item)) return 2;
		return 3;
	}

	function sortTimestamp(item: SoulInventoryItem): number {
		const value = normalizeText(item.agent.updatedAt) ?? normalizeText(item.agent.mintedAt);
		if (!value) return 0;
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? 0 : parsed;
	}

	function sortSouls(items: readonly SoulInventoryItem[]): SoulInventoryItem[] {
		return [...items].sort((left, right) => {
			const rank = soulSortRank(left) - soulSortRank(right);
			if (rank !== 0) return rank;

			const updated = sortTimestamp(right) - sortTimestamp(left);
			if (updated !== 0) return updated;

			return left.agent.localId.localeCompare(right.agent.localId);
		});
	}

	function sortAgentBodies(items: readonly Agent[]): Agent[] {
		return [...items].sort((left, right) => {
			const name = left.displayName.localeCompare(right.displayName);
			if (name !== 0) return name;
			return left.username.localeCompare(right.username);
		});
	}

	function selectableAgentBodies(
		item: SoulInventoryItem,
		inventory: readonly SoulInventoryItem[] = souls,
		candidates: readonly Agent[] = agentBodies
	): Agent[] {
		if (!isReadyForBinding(item)) return [];

		const claimedBodies = new Set<string>();
		for (const entry of inventory) {
			if (entry.agent.agentId === item.agent.agentId) continue;
			const username = boundAgentUsername(entry);
			if (username) claimedBodies.add(normalizeLower(username));
		}

		return candidates.filter((agent) => !claimedBodies.has(normalizeLower(agent.username)));
	}

	function selectedTargetUsername(item: SoulInventoryItem): string {
		const selected = normalizeText(selectedTargets[item.agent.agentId]);
		if (!selected) return '';

		return selectableAgentBodies(item).some((agent) => normalizeLower(agent.username) === normalizeLower(selected))
			? selected
			: '';
	}

	function setSelectedTarget(agentId: string, username: string) {
		const normalized = normalizeText(username);
		if (!normalized) {
			const { [agentId]: _ignored, ...rest } = selectedTargets;
			selectedTargets = rest;
			return;
		}

		selectedTargets = { ...selectedTargets, [agentId]: normalized };
	}

	function handleTargetSelection(item: SoulInventoryItem, event: Event) {
		const currentTarget = event.currentTarget;
		if (!(currentTarget instanceof HTMLSelectElement)) return;
		setSelectedTarget(item.agent.agentId, currentTarget.value);
	}

	function syncSelectedTargets(nextSouls: readonly SoulInventoryItem[], nextAgents: readonly Agent[]) {
		const nextSelections: Record<string, string> = {};

		for (const soul of nextSouls) {
			const current = normalizeText(selectedTargets[soul.agent.agentId]);
			if (!current) continue;

			const stillAvailable = selectableAgentBodies(soul, nextSouls, nextAgents).some(
				(agent) => normalizeLower(agent.username) === normalizeLower(current)
			);
			if (stillAvailable) nextSelections[soul.agent.agentId] = current;
		}

		selectedTargets = nextSelections;
	}

	function bindingHint(item: SoulInventoryItem): string {
		const selectableBodies = selectableAgentBodies(item);
		if (agentBodies.length === 0) {
			return 'Create a local agent body first. Souls can only be bound to agent bodies on this instance.';
		}
		if (selectableBodies.length === 0) {
			return 'All of your current agent bodies are already bound to souls. Create another agent body to use this soul.';
		}
		return 'A body is a local agent account in this prototype. Choose which agent this soul should explicitly power.';
	}

	async function loadSouls({ signal }: { signal?: AbortSignal } = {}) {
		if (!$authSession?.accessToken) return;

		isLoading = true;
		loadError = null;

		try {
			const [soulsResult, agentBodiesResult] = await Promise.allSettled([
				api.fetchMySouls({ signal }),
				api.fetchMyAgents({ signal }),
			]);

			if (signal?.aborted) return;
			if (soulsResult.status === 'rejected') throw soulsResult.reason;
			if (agentBodiesResult.status === 'rejected') throw agentBodiesResult.reason;

			const nextSouls = sortSouls(soulsResult.value);
			const nextAgentBodies = sortAgentBodies(agentBodiesResult.value);

			souls = nextSouls;
			agentBodies = nextAgentBodies;
			syncSelectedTargets(nextSouls, nextAgentBodies);
			lastLoadedAt = new Date().toISOString();
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			loadError = err instanceof Error ? err.message : String(err);
			agentBodies = [];
			souls = [];
			selectedTargets = {};
			lastLoadedAt = null;
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		agentBodies = [];
		souls = [];
		isLoading = false;
		loadError = null;
		actionLoadingId = null;
		actionError = null;
		actionMessage = null;
		lastLoadedAt = null;
		selectedTargets = {};

		if (!token) return;

		const controller = new AbortController();
		void loadSouls({ signal: controller.signal });

		return () => controller.abort();
	});

	async function handleRefresh() {
		actionError = null;
		actionMessage = null;
		await loadSouls();
	}

	async function handleIncorporate(item: SoulInventoryItem) {
		if (actionLoadingId) return;

		const targetAgentUsername = selectedTargetUsername(item);
		if (!targetAgentUsername) {
			actionError = 'Choose an agent body before binding this soul.';
			actionMessage = null;
			return;
		}

		actionLoadingId = item.agent.agentId;
		actionError = null;
		actionMessage = null;

		try {
			const updated = await api.incorporateSoul({
				agentId: item.agent.agentId,
				targetAgentUsername,
			});
			const nextSouls = sortSouls(
				souls.map((entry) => (entry.agent.agentId === updated.agent.agentId ? updated : entry))
			);
			souls = nextSouls;
			syncSelectedTargets(nextSouls, agentBodies);
			actionMessage = updated.binding
				? `Soul ${updated.agent.localId} is now bound to agent body @${updated.binding.agentUsername}.`
				: `Soul ${updated.agent.localId} was incorporated.`;
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			actionLoadingId = null;
		}
	}
</script>

<svelte:head>
	<title>Souls • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Souls</h1>

	{#if !$authSession}
		<p>Sign in to browse souls available to your linked wallets and bind them to agent bodies on this instance.</p>
	{:else}
		<section class="page__notice">
			<div class="souls-panel__header">
				<div>
					<h2 class="souls-panel__title">Prototype constraints</h2>
					<p class="souls-panel__subtitle">
						Souls are principal-owned records. On Simulacrum, a body means a local agent account.
					</p>
				</div>

				<div class="souls-panel__actions">
					<a class="gr-button gr-button--outline" href="/auth/wallet">Manage linked wallets</a>
				</div>
			</div>

			<ul class="souls-copy">
				<li>Souls belong to the principal that created them.</li>
				<li>Only your linked wallets can use a soul on this instance.</li>
				<li>A soul does not become a body until you explicitly bind it to one of your agent bodies.</li>
				<li>Souls can only be bound to agent bodies, never directly to your signed-in viewer account.</li>
			</ul>
		</section>

		{#if !isLoading && !loadError && souls.some((soul) => isReadyForBinding(soul)) && agentBodies.length === 0}
			<section class="page__notice">
				<div class="souls-panel__header">
					<div>
						<h2 class="souls-panel__title">No agent bodies yet</h2>
						<p class="souls-panel__subtitle">
							Your souls are ready to bind, but this prototype only allows binding to local agent bodies.
						</p>
					</div>

					<div class="souls-panel__actions">
						<a class="gr-button gr-button--solid" href={`${base}/agents`}>Create or manage agent bodies</a>
					</div>
				</div>
			</section>
		{/if}

		<section class="page__notice">
			<div class="souls-panel__header">
				<div>
					<h2 class="souls-panel__title">My Souls Available to This Instance</h2>
					<p class="souls-panel__subtitle">
						Only souls already matched to your linked wallets appear here.
					</p>
				</div>

				<div class="souls-panel__actions">
					<button
						type="button"
						class="gr-button gr-button--outline"
						onclick={() => void handleRefresh()}
						disabled={isLoading || actionLoadingId !== null}
					>
						Refresh
					</button>
				</div>
			</div>

			{#if lastLoadedAt}
				<p class="page__meta">Last refreshed {formatDateTime(lastLoadedAt)}</p>
			{/if}

			{#if actionError}
				<div class="page__notice page__notice--error" role="alert">{actionError}</div>
			{:else if actionMessage}
				<div class="page__notice">{actionMessage}</div>
			{/if}

			{#if loadError}
				<div class="page__notice page__notice--error" role="alert">{loadError}</div>
			{:else if isLoading}
				<div class="page__notice">Loading souls…</div>
			{:else if souls.length === 0}
				<div class="souls-empty">
					<h3 class="souls-card__title">No souls found for your linked wallet on this instance yet.</h3>
					<p>Link the wallet that created your soul, or mint a soul first in lesser-host.</p>
					<div class="souls-card__actions">
						<a class="gr-button gr-button--solid" href="/auth/wallet">Link wallet in auth</a>
						<a class="gr-button gr-button--outline" href={`${base}/agents`}>Open agents</a>
					</div>
				</div>
			{:else}
				<ul class="souls-list">
					{#each souls as soul (soul.agent.agentId)}
						{@const boundUsername = boundAgentUsername(soul)}
						{@const selectableBodies = selectableAgentBodies(soul)}
						{@const selectedTarget = selectedTargetUsername(soul)}
						<li class="souls-card">
							<div class="souls-card__header">
								<div class="souls-card__heading">
									<h3 class="souls-card__title">{soul.agent.localId}</h3>
									<p class="souls-card__meta">
										Soul ID <code>{soul.agent.agentId}</code>
									</p>
								</div>

								<div class="souls-card__badges">
									<span class={badgeClass(stateBadgeColor(soul), 'outlined')}>{soulStateLabel(soul)}</span>
									<span class={badgeClass(statusBadgeColor(soul), 'filled')}>
										Status {humanize(statusValue(soul))}
									</span>
								</div>
							</div>

							<p class="souls-card__description">{readinessDescription(soul)}</p>

							<dl class="souls-card__details">
								<div>
									<dt>Readiness</dt>
									<dd>{readinessLabel(soul)}</dd>
								</div>
								<div>
									<dt>Agent body</dt>
									<dd>{boundUsername ? `@${boundUsername}` : '—'}</dd>
								</div>
								<div>
									<dt>Status</dt>
									<dd>{humanize(statusValue(soul))}</dd>
								</div>
								<div>
									<dt>Lifecycle</dt>
									<dd>{humanize(lifecycleValue(soul))}</dd>
								</div>
								<div>
									<dt>ENS</dt>
									<dd>{#if soul.agent.ensName}<code>{soul.agent.ensName}</code>{:else}—{/if}</dd>
								</div>
								<div>
									<dt>Minted</dt>
									<dd>{formatDateTime(soul.agent.mintedAt)}</dd>
								</div>
								<div>
									<dt>Updated</dt>
									<dd>{formatDateTime(soul.agent.updatedAt)}</dd>
								</div>
								<div>
									<dt>Wallet</dt>
									<dd><code>{soul.agent.wallet}</code></dd>
								</div>
								<div>
									<dt>Principal</dt>
									<dd>
										{#if soul.agent.principalAddress}
											<code>{soul.agent.principalAddress}</code>
										{:else}
											—
										{/if}
									</dd>
								</div>
							</dl>

							{#if isReadyForBinding(soul)}
								<div class="souls-card__bind">
									<label class="settings-field">
										<span class="settings-field__label">Target agent body</span>
										<select
											class="settings-field__select"
											value={selectedTarget}
											onchange={(event) => handleTargetSelection(soul, event)}
											disabled={actionLoadingId !== null || selectableBodies.length === 0}
										>
											<option value="">Select one of your agent bodies</option>
											{#each selectableBodies as body (body.id)}
												<option value={body.username}>@{body.username} · {body.displayName}</option>
											{/each}
										</select>
									</label>
									<p class="souls-card__hint">{bindingHint(soul)}</p>
								</div>
							{/if}

							<div class="souls-card__actions">
								{#if isReadyForBinding(soul)}
									{#if selectableBodies.length > 0}
										<button
											type="button"
											class="gr-button gr-button--solid"
											onclick={() => void handleIncorporate(soul)}
											disabled={actionLoadingId !== null || !selectedTarget}
										>
											{#if actionLoadingId === soul.agent.agentId}
												Binding soul…
											{:else if selectedTarget}
												Bind to @{selectedTarget}
											{:else}
												Choose an agent body
											{/if}
										</button>
									{:else}
										<a class="gr-button gr-button--outline" href={`${base}/agents`}>
											{agentBodies.length === 0 ? 'Create agent body' : 'Manage agent bodies'}
										</a>
									{/if}
								{/if}

								{#if boundUsername}
									<a class="gr-button gr-button--outline" href={agentBodyHref(boundUsername)}>Open agent body</a>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</section>
