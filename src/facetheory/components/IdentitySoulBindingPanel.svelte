<script lang="ts">
	import { api, type SoulInventoryItem } from '$lib/api';

	import { getPageHref } from '../routing';

	interface Props {
		username?: string | null;
		displayName?: string | null;
		boundSoulAgentId?: string | null;
		onUpdated?: () => Promise<void> | void;
	}

	let { username = null, displayName = null, boundSoulAgentId = null, onUpdated }: Props = $props();

	let souls = $state<SoulInventoryItem[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let bindLoadingSoulId = $state<string | null>(null);
	let lastLoadedAt = $state<string | null>(null);

	const currentUsername = $derived(normalizeText(username));
	const currentDisplayName = $derived(normalizeText(displayName) ?? currentUsername ?? 'this drone body');
	const boundSoulHere = $derived(
		souls.find((item) => isBoundToUsername(item, currentUsername)) ?? null
	);
	const readySoulCount = $derived(souls.filter((item) => isReadyForBinding(item)).length);

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

	function boundAgentUsername(item: SoulInventoryItem): string | null {
		return normalizeText(item.binding?.agentUsername);
	}

	function isBound(item: SoulInventoryItem): boolean {
		return item.bindingState === 'BOUND' && Boolean(boundAgentUsername(item));
	}

	function isBoundToUsername(item: SoulInventoryItem, targetUsername?: string | null): boolean {
		if (!targetUsername) return false;
		return normalizeLower(boundAgentUsername(item)) === normalizeLower(targetUsername);
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

	function readinessLabel(item: SoulInventoryItem): string {
		const boundUsername = boundAgentUsername(item);
		if (isBoundToUsername(item, currentUsername)) return 'Currently bound here';
		if (boundUsername) return `Bound to @${boundUsername}`;
		if (needsMintExecution(item)) return 'Pending mint execution';
		if (needsProfileSetup(item)) return 'Pending profile/self-description';
		if (isReadyForBinding(item)) return `Ready to bind to @${currentUsername ?? 'this body'}`;
		return 'Unavailable on this instance';
	}

	function readinessDescription(item: SoulInventoryItem): string {
		const boundUsername = boundAgentUsername(item);
		if (isBoundToUsername(item, currentUsername)) {
			return `${item.agent.localId} is the soul currently bound to this drone body.`;
		}
		if (boundUsername) {
			return `${item.agent.localId} is already bound to local drone body @${boundUsername}.`;
		}
		if (needsMintExecution(item)) {
			return 'The soul record exists, but mint execution has not been recorded here yet.';
		}
		if (needsProfileSetup(item)) {
			return 'Minting is recorded, but the soul still needs its self-description before incorporation is ready.';
		}
		if (isReadyForBinding(item)) {
			return `This soul is ready to bind directly to @${currentUsername ?? 'this drone body'}.`;
		}
		return 'This soul belongs to your principal, but it is not currently available for incorporation on this instance.';
	}

	function soulStateTone(item: SoulInventoryItem): 'success' | 'warning' | 'neutral' {
		if (isBoundToUsername(item, currentUsername)) return 'success';
		if (isBound(item)) return 'neutral';
		if (needsMintExecution(item) || needsProfileSetup(item)) return 'warning';
		return 'neutral';
	}

	function statusTone(item: SoulInventoryItem): 'success' | 'warning' | 'neutral' {
		const normalized = normalizeLower(item.agent.status) || normalizeLower(item.agent.lifecycleStatus);
		if (normalized === 'active') return 'success';
		if (normalized === 'pending') return 'warning';
		return 'neutral';
	}

	function soulSortRank(item: SoulInventoryItem): number {
		if (isBoundToUsername(item, currentUsername)) return 0;
		if (isReadyForBinding(item)) return 1;
		if (!isBound(item) && (needsMintExecution(item) || needsProfileSetup(item))) return 2;
		if (isBound(item)) return 3;
		return 4;
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

	function canBindToCurrentBody(item: SoulInventoryItem): boolean {
		return Boolean(currentUsername) && isReadyForBinding(item) && (!boundSoulHere || boundSoulHere.agent.agentId === item.agent.agentId);
	}

	async function loadSouls(signal?: AbortSignal) {
		if (!currentUsername) {
			souls = [];
			loading = false;
			error = null;
			lastLoadedAt = null;
			return;
		}

		loading = true;
		error = null;

		try {
			const result = await api.fetchMySouls({ signal });
			if (signal?.aborted) return;

			souls = sortSouls(result);
			lastLoadedAt = new Date().toISOString();
		} catch (loadFailure) {
			if (loadFailure instanceof DOMException && loadFailure.name === 'AbortError') return;
			error = loadFailure instanceof Error ? loadFailure.message : String(loadFailure);
			souls = [];
			lastLoadedAt = null;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		const targetUsername = currentUsername;
		error = null;
		success = null;
		bindLoadingSoulId = null;

		if (!targetUsername) {
			souls = [];
			loading = false;
			lastLoadedAt = null;
			return;
		}

		const controller = new AbortController();
		void loadSouls(controller.signal);
		return () => controller.abort();
	});

	async function handleBindSoul(item: SoulInventoryItem) {
		if (!currentUsername || bindLoadingSoulId || !canBindToCurrentBody(item)) return;

		bindLoadingSoulId = item.agent.agentId;
		error = null;
		success = null;

		try {
			const updated = await api.incorporateSoul({
				agentId: item.agent.agentId,
				targetAgentUsername: currentUsername,
			});
			souls = sortSouls(souls.map((entry) => (entry.agent.agentId === updated.agent.agentId ? updated : entry)));
			success = `Soul ${updated.agent.localId} is now bound to @${currentUsername}.`;
			await onUpdated?.();
		} catch (bindFailure) {
			error = bindFailure instanceof Error ? bindFailure.message : String(bindFailure);
		} finally {
			bindLoadingSoulId = null;
		}
	}
</script>

<section class="ft-panel">
	<header class="ft-panel__header">
		<div>
			<p class="ft-panel__eyebrow">Soul attachment</p>
			<h2>Bind a soul to {currentDisplayName}</h2>
		</div>
		<span class:ft-panel__badge--success={Boolean(boundSoulHere || boundSoulAgentId)} class="ft-panel__badge">
			{#if boundSoulHere || boundSoulAgentId}
				Bound
			{:else}
				Waiting for soul
			{/if}
		</span>
	</header>

	{#if currentUsername}
		<p class="ft-panel__copy">
			Identity is the canonical place to inspect the souls already available to this instance and explicitly bind one
			to @{currentUsername}.
		</p>

		<div class="identity-soul-panel__stats">
			<div>
				<strong>{souls.length}</strong>
				<span>souls visible here</span>
			</div>
			<div>
				<strong>{readySoulCount}</strong>
				<span>ready to bind</span>
			</div>
			<div>
				<strong>{boundSoulHere ? boundSoulHere.agent.localId : 'none'}</strong>
				<span>currently attached</span>
			</div>
		</div>

		<div class="ft-panel__actions">
			<button
				class="ft-button"
				disabled={loading || bindLoadingSoulId !== null}
				onclick={() => void loadSouls()}
				type="button"
			>
				Refresh souls
			</button>
			<a class="ft-button" href={getPageHref('drones')}>
				Open Drones
			</a>
		</div>

		{#if lastLoadedAt}
			<p class="identity-soul-panel__meta">Last refreshed {formatDateTime(lastLoadedAt)}</p>
		{/if}

		{#if boundSoulHere}
			<p class="ft-panel__message ft-panel__message--success">
				@{currentUsername} is currently powered by soul <strong>{boundSoulHere.agent.localId}</strong>.
			</p>
		{:else if readySoulCount > 0}
			<p class="ft-panel__message">
				Choose one of your ready souls below to bind it directly to @{currentUsername}.
			</p>
		{/if}

		{#if success}
			<p class="ft-panel__message ft-panel__message--success">{success}</p>
		{/if}
		{#if error}
			<p class="ft-panel__message ft-panel__message--error" role="alert">{error}</p>
		{/if}

		{#if loading && souls.length === 0}
			<p class="ft-panel__message">Loading soul inventory...</p>
		{:else if souls.length === 0}
			<div class="identity-soul-panel__empty">
				<p class="ft-panel__copy">
					No souls matched to your linked wallets on this instance yet. Link the minting wallet first, then
					refresh this panel.
				</p>
				<div class="ft-panel__actions">
					<a class="ft-button ft-button--primary" href="/auth/wallet">Manage linked wallets</a>
				</div>
			</div>
		{:else}
			<ul class="identity-soul-panel__list">
				{#each souls as soul (soul.agent.agentId)}
					{@const boundUsername = boundAgentUsername(soul)}
					<li class="identity-soul-panel__card">
						<div class="identity-soul-panel__card-header">
							<div>
								<h3>{soul.agent.localId}</h3>
								<p>
									Soul ID <code>{soul.agent.agentId}</code>
								</p>
							</div>
							<div class="identity-soul-panel__badges">
								<span class={`identity-soul-panel__badge identity-soul-panel__badge--${soulStateTone(soul)}`}>
									{readinessLabel(soul)}
								</span>
								<span class={`identity-soul-panel__badge identity-soul-panel__badge--${statusTone(soul)}`}>
									Status {humanize(soul.agent.status)}
								</span>
							</div>
						</div>

						<p class="identity-soul-panel__copy">{readinessDescription(soul)}</p>

						<dl class="identity-soul-panel__details">
							<div>
								<dt>Lifecycle</dt>
								<dd>{humanize(soul.agent.lifecycleStatus)}</dd>
							</div>
							<div>
								<dt>Bound body</dt>
								<dd>{boundUsername ? `@${boundUsername}` : '—'}</dd>
							</div>
							<div>
								<dt>Domain</dt>
								<dd>{soul.agent.domain}</dd>
							</div>
							<div>
								<dt>ENS</dt>
								<dd>{#if soul.agent.ensName}<code>{soul.agent.ensName}</code>{:else}—{/if}</dd>
							</div>
							<div>
								<dt>Wallet</dt>
								<dd><code>{soul.agent.wallet}</code></dd>
							</div>
							<div>
								<dt>Principal</dt>
								<dd>{#if soul.agent.principalAddress}<code>{soul.agent.principalAddress}</code>{:else}—{/if}</dd>
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
								<dt>Capabilities</dt>
								<dd>{soul.agent.capabilities.length ? soul.agent.capabilities.join(', ') : '—'}</dd>
							</div>
						</dl>

						<div class="identity-soul-panel__actions">
							{#if isBoundToUsername(soul, currentUsername)}
								<button class="ft-button" disabled type="button">Currently bound here</button>
							{:else if canBindToCurrentBody(soul)}
								<button
									class="ft-button ft-button--primary"
									disabled={bindLoadingSoulId !== null}
									onclick={() => void handleBindSoul(soul)}
									type="button"
								>
									{#if bindLoadingSoulId === soul.agent.agentId}
										Binding soul...
									{:else}
										Bind to @{currentUsername}
									{/if}
								</button>
							{:else if isReadyForBinding(soul) && boundSoulHere}
								<button class="ft-button" disabled type="button">This body already has a soul</button>
							{/if}

							{#if boundUsername && !isBoundToUsername(soul, currentUsername)}
								<a class="ft-button" href={getPageHref('identity', boundUsername)}>
									Open @{boundUsername}
								</a>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{:else}
		<p class="ft-panel__copy">
			Choose a local drone body first. Binding now happens from that body's identity page so the soul attachment is
			visible in context.
		</p>
		<div class="ft-panel__actions">
			<a class="ft-button ft-button--primary" href={getPageHref('drones')}>Open Drones</a>
		</div>
	{/if}
</section>

<style>
	.identity-soul-panel__stats,
	.identity-soul-panel__list,
	.identity-soul-panel__badges,
	.identity-soul-panel__actions {
		display: grid;
		gap: 0.75rem;
	}

	.identity-soul-panel__stats {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin-top: 0.5rem;
	}

	.identity-soul-panel__stats div {
		display: grid;
		gap: 0.2rem;
		padding: 0.85rem 0.95rem;
		border-radius: 0.95rem;
		background: rgba(255, 255, 255, 0.72);
	}

	.identity-soul-panel__stats strong {
		font-size: 1rem;
	}

	.identity-soul-panel__stats span,
	.identity-soul-panel__meta,
	.identity-soul-panel__card-header p,
	.identity-soul-panel__copy,
	.identity-soul-panel__details dt {
		color: var(--gr-semantic-foreground-secondary);
	}

	.identity-soul-panel__meta,
	.identity-soul-panel__card-header p {
		margin: 0;
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.identity-soul-panel__empty {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.68);
	}

	.identity-soul-panel__card {
		display: grid;
		gap: 0.85rem;
		padding: 1rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.72);
		box-shadow: 0 18px 44px rgba(123, 70, 27, 0.08);
	}

	.identity-soul-panel__card-header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.identity-soul-panel__card-header h3,
	.identity-soul-panel__copy {
		margin: 0;
	}

	.identity-soul-panel__badges,
	.identity-soul-panel__actions {
		grid-template-columns: repeat(auto-fit, minmax(10rem, max-content));
	}

	.identity-soul-panel__badge {
		display: inline-flex;
		align-items: center;
		padding: 0.35rem 0.7rem;
		border-radius: 999px;
		font-size: 0.85rem;
		background: rgba(255, 255, 255, 0.72);
	}

	.identity-soul-panel__badge--success {
		background: color-mix(in srgb, var(--gr-color-success-100) 72%, white 28%);
		color: var(--gr-color-success-800);
	}

	.identity-soul-panel__badge--warning {
		background: color-mix(in srgb, var(--gr-color-warning-100) 72%, white 28%);
		color: var(--gr-color-warning-800);
	}

	.identity-soul-panel__badge--neutral {
		color: var(--gr-semantic-foreground-secondary);
	}

	.identity-soul-panel__details {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem 1rem;
		margin: 0;
	}

	.identity-soul-panel__details div {
		display: grid;
		gap: 0.2rem;
	}

	.identity-soul-panel__details dt,
	.identity-soul-panel__details dd {
		margin: 0;
	}

	@media (max-width: 960px) {
		.identity-soul-panel__stats,
		.identity-soul-panel__details {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
