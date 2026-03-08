<script lang="ts">
	import { base } from '$app/paths';
	import { api, type SoulInventoryItem } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import type { Account } from '$lib/types';

	type BadgeColor = 'success' | 'warning' | 'error' | 'info' | 'gray';
	type BadgeVariant = 'filled' | 'outlined';

	let viewer = $state<Account | null>(null);
	let souls = $state<SoulInventoryItem[]>([]);
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);
	let actionLoadingId = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let actionMessage = $state<string | null>(null);
	let lastLoadedAt = $state<string | null>(null);

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

	function bodyHref(username: string): string {
		return `${base}/profile/${encodeURIComponent(username)}`;
	}

	function statusValue(item: SoulInventoryItem): string {
		return normalizeText(item.agent.status) ?? 'unknown';
	}

	function lifecycleValue(item: SoulInventoryItem): string | null {
		return normalizeText(item.agent.lifecycleStatus);
	}

	function isBound(item: SoulInventoryItem): boolean {
		return item.bindingState === 'BOUND' && Boolean(item.binding);
	}

	function needsMintExecution(item: SoulInventoryItem): boolean {
		const status = normalizeLower(item.agent.status);
		const lifecycle = normalizeLower(item.agent.lifecycleStatus);

		return (status === 'pending' || lifecycle === 'pending') && !normalizeText(item.agent.mintTxHash);
	}

	function needsProfileSetup(item: SoulInventoryItem): boolean {
		return !item.agent.selfDescriptionVersion;
	}

	function canIncorporate(item: SoulInventoryItem): boolean {
		return !isBound(item) && item.availableForIncorporation && !needsMintExecution(item) && !needsProfileSetup(item);
	}

	function soulStateLabel(item: SoulInventoryItem): string {
		if (isBound(item) && item.binding) return `Bound to @${item.binding.username}`;
		if (needsMintExecution(item) || needsProfileSetup(item)) return 'Pending soul setup';
		return 'Unbound';
	}

	function readinessLabel(item: SoulInventoryItem): string {
		if (isBound(item) && item.binding) {
			return item.availableForIncorporation
				? 'Already incorporated on your current body'
				: `Already incorporated on @${item.binding.username}`;
		}
		if (needsMintExecution(item)) return 'Pending mint execution';
		if (needsProfileSetup(item)) return 'Pending profile/self-description';
		if (item.availableForIncorporation) return 'Ready to incorporate';
		return 'Unavailable on this body';
	}

	function readinessDescription(item: SoulInventoryItem): string {
		if (isBound(item) && item.binding) {
			return `This soul is already incorporated into @${item.binding.username}. Souls stay separate from bodies until you take this explicit step.`;
		}
		if (needsMintExecution(item)) {
			return 'The soul record exists, but mint execution has not been recorded here yet.';
		}
		if (needsProfileSetup(item)) {
			return 'Minting is recorded, but the soul still needs its self-description/profile before incorporation is ready.';
		}
		if (item.availableForIncorporation) {
			return 'This soul matches one of your linked wallets and is ready for explicit incorporation into your local body.';
		}
		return 'This soul belongs to your principal, but it is not currently available to incorporate on this body.';
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
		if (canIncorporate(item)) return 0;
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

	async function loadSouls({ signal }: { signal?: AbortSignal } = {}) {
		if (!$authSession?.accessToken) return;

		isLoading = true;
		loadError = null;

		try {
			const [soulsResult, viewerResult] = await Promise.allSettled([
				api.fetchMySouls({ signal }),
				api.fetchViewer({ signal }),
			]);

			if (signal?.aborted) return;
			if (soulsResult.status === 'rejected') throw soulsResult.reason;

			souls = sortSouls(soulsResult.value);
			lastLoadedAt = new Date().toISOString();

			if (viewerResult.status === 'fulfilled') {
				viewer = viewerResult.value;
			} else if (!(viewerResult.reason instanceof DOMException && viewerResult.reason.name === 'AbortError')) {
				viewer = null;
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			loadError = err instanceof Error ? err.message : String(err);
			souls = [];
			lastLoadedAt = null;
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		viewer = null;
		souls = [];
		isLoading = false;
		loadError = null;
		actionLoadingId = null;
		actionError = null;
		actionMessage = null;
		lastLoadedAt = null;

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

		actionLoadingId = item.agent.agentId;
		actionError = null;
		actionMessage = null;

		try {
			const updated = await api.incorporateSoul({ agentId: item.agent.agentId });
			souls = sortSouls(
				souls.map((entry) => (entry.agent.agentId === updated.agent.agentId ? updated : entry))
			);
			actionMessage = updated.binding
				? `Soul ${updated.agent.localId} is now bound to @${updated.binding.username}.`
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
		<p>Sign in to browse souls available to your linked wallets on this instance.</p>
	{:else}
		<section class="page__notice">
			<div class="souls-panel__header">
				<div>
					<h2 class="souls-panel__title">Prototype constraints</h2>
					<p class="souls-panel__subtitle">
						Souls are principal-owned records. They do not become local bodies until you explicitly incorporate
						one.
					</p>
				</div>

				<div class="souls-panel__actions">
					<a class="gr-button gr-button--outline" href="/auth/wallet">Manage linked wallets</a>
				</div>
			</div>

			<ul class="souls-copy">
				<li>Souls belong to the principal that created them.</li>
				<li>Only your linked wallets can use a soul on this instance.</li>
				<li>
					In this prototype, incorporation explicitly binds a soul to
					{viewer ? `@${viewer.username}` : 'your current local body'}.
				</li>
			</ul>
		</section>

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

							<div class="souls-card__actions">
								{#if canIncorporate(soul)}
									<button
										type="button"
										class="gr-button gr-button--solid"
										onclick={() => void handleIncorporate(soul)}
										disabled={actionLoadingId !== null}
									>
										{#if actionLoadingId === soul.agent.agentId}
											Incorporating…
										{:else if viewer}
											Incorporate into @{viewer.username}
										{:else}
											Incorporate into my body
										{/if}
									</button>
								{/if}

								{#if soul.binding}
									<a class="gr-button gr-button--outline" href={bodyHref(soul.binding.username)}>Open body</a>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</section>
