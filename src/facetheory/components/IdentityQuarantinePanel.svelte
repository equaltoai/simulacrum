<script lang="ts">
	import { api, type DroneAgentState } from '$lib/api';

	import { getPageHref } from '../routing';

	interface Props {
		agent?: DroneAgentState | null;
		onUpdated?: () => Promise<void> | void;
	}

	let { agent = null, onUpdated }: Props = $props();

	let dismissing = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);

	const currentUsername = $derived(normalizeText(agent?.username));
	const currentDisplayName = $derived(
		normalizeText(agent?.displayName) ?? currentUsername ?? 'this drone body'
	);
	const quarantineStatus = $derived(normalizeText(agent?.quarantineStatus));
	const quarantineActive = $derived(Boolean(agent?.quarantineActive));
	const statusLabel = $derived(resolveStatusLabel(agent));
	const statusDetail = $derived(resolveStatusDetail(agent));
	const statusTone = $derived(resolveStatusTone(agent));

	function normalizeText(value?: string | null): string | null {
		const trimmed = value?.trim();
		return trimmed ? trimmed : null;
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

	function resolveStatusLabel(target?: DroneAgentState | null): string {
		if (target?.quarantineActive) return 'Quarantine active';

		const normalized = normalizeText(target?.quarantineStatus)?.toLowerCase();
		if (normalized === 'approved') return 'Quarantine cleared';
		if (normalized === 'expired') return 'Quarantine expired';
		if (normalized) return humanize(normalized);
		return 'No quarantine';
	}

	function resolveStatusDetail(target?: DroneAgentState | null): string {
		if (!target) return 'Choose a local drone body to inspect its publishing restrictions.';

		if (target.quarantineActive) {
			return target.quarantineEnd
				? `Public posting remains restricted until ${formatDateTime(target.quarantineEnd)}.`
				: 'Public posting remains restricted until the owner dismisses quarantine.';
		}

		const normalized = normalizeText(target.quarantineStatus)?.toLowerCase();
		if (normalized === 'approved') {
			return target.quarantineApprovedAt
				? `The publishing hold was cleared ${formatDateTime(target.quarantineApprovedAt)}.`
				: 'The publishing hold has already been cleared.';
		}
		if (normalized === 'expired') {
			return target.quarantineEnd
				? `The original quarantine window ended ${formatDateTime(target.quarantineEnd)}.`
				: 'The original quarantine window has ended.';
		}

		return 'No active publishing hold is recorded for this body.';
	}

	function resolveStatusTone(
		target?: DroneAgentState | null
	): 'success' | 'warning' | 'neutral' {
		if (target?.quarantineActive) return 'warning';

		const normalized = normalizeText(target?.quarantineStatus)?.toLowerCase();
		if (normalized === 'approved') return 'success';
		return 'neutral';
	}

	async function handleDismiss() {
		if (!currentUsername || dismissing || !quarantineActive) return;

		dismissing = true;
		error = null;
		success = null;

		try {
			await api.updateAgent({
				username: currentUsername,
				input: { exitQuarantine: true },
			});
			success = `Quarantine dismissed for @${currentUsername}.`;
			await onUpdated?.();
		} catch (dismissFailure) {
			error = dismissFailure instanceof Error ? dismissFailure.message : String(dismissFailure);
		} finally {
			dismissing = false;
		}
	}
</script>

<section class="ft-panel">
	<header class="ft-panel__header">
		<div>
			<p class="ft-panel__eyebrow">Publishing restrictions</p>
			<h2>Quarantine on {currentDisplayName}</h2>
		</div>
		<span class={`identity-quarantine-panel__badge identity-quarantine-panel__badge--${statusTone}`}>
			{statusLabel}
		</span>
	</header>

	{#if currentUsername}
		<p class="ft-panel__copy">
			Quarantine visibility now comes from Lesser directly, so this panel reflects the live publishing hold on
			@{currentUsername} and lets the owner dismiss it intentionally when the body is ready for public posting.
		</p>

		<div class="identity-quarantine-panel__stats">
			<div>
				<strong>{statusLabel}</strong>
				<span>current state</span>
			</div>
			<div>
				<strong>{agent?.quarantineEnd ? formatDateTime(agent.quarantineEnd) : '—'}</strong>
				<span>restriction ends</span>
			</div>
			<div>
				<strong>{agent?.quarantineApprovedBy ? `@${agent.quarantineApprovedBy}` : '—'}</strong>
				<span>last cleared by</span>
			</div>
		</div>

		<p class:identity-quarantine-panel__notice--warning={quarantineActive} class="identity-quarantine-panel__notice">
			{statusDetail}
		</p>

		<dl class="identity-quarantine-panel__details">
			<div>
				<dt>Status token</dt>
				<dd>{quarantineStatus ? humanize(quarantineStatus) : '—'}</dd>
			</div>
			<div>
				<dt>Active now</dt>
				<dd>{quarantineActive ? 'Yes' : 'No'}</dd>
			</div>
			<div>
				<dt>Started</dt>
				<dd>{formatDateTime(agent?.quarantineStart)}</dd>
			</div>
			<div>
				<dt>Ends</dt>
				<dd>{formatDateTime(agent?.quarantineEnd)}</dd>
			</div>
			<div>
				<dt>Approved by</dt>
				<dd>{agent?.quarantineApprovedBy ? `@${agent.quarantineApprovedBy}` : '—'}</dd>
			</div>
			<div>
				<dt>Approved at</dt>
				<dd>{formatDateTime(agent?.quarantineApprovedAt)}</dd>
			</div>
		</dl>

		<div class="ft-panel__actions">
			{#if quarantineActive}
				<button
					class="ft-button ft-button--primary"
					disabled={dismissing}
					onclick={() => void handleDismiss()}
					type="button"
				>
					{#if dismissing}
						Dismissing quarantine...
					{:else}
						Dismiss quarantine
					{/if}
				</button>
			{/if}
			<a class="ft-button" href={getPageHref('drones')}>Open Drones</a>
		</div>

		{#if success}
			<p class="ft-panel__message ft-panel__message--success">{success}</p>
		{/if}
		{#if error}
			<p class="ft-panel__message ft-panel__message--error" role="alert">{error}</p>
		{/if}
	{:else}
		<p class="ft-panel__copy">
			Choose a local drone body first. Quarantine is shown on the identity page for the active body so visibility
			and dismissal stay together.
		</p>
		<div class="ft-panel__actions">
			<a class="ft-button ft-button--primary" href={getPageHref('drones')}>Open Drones</a>
		</div>
	{/if}
</section>

<style>
	.identity-quarantine-panel__stats,
	.identity-quarantine-panel__details {
		display: grid;
		gap: 0.75rem;
	}

	.identity-quarantine-panel__stats {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.identity-quarantine-panel__stats div,
	.identity-quarantine-panel__details div {
		display: grid;
		gap: 0.2rem;
		padding: 0.85rem 0.95rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.72);
	}

	.identity-quarantine-panel__stats span,
	.identity-quarantine-panel__details dt {
		color: var(--gr-semantic-foreground-secondary);
	}

	.identity-quarantine-panel__badge {
		display: inline-flex;
		align-items: center;
		padding: 0.3rem 0.7rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.72);
		font-size: 0.8rem;
		font-weight: 700;
	}

	.identity-quarantine-panel__badge--success {
		background: color-mix(in srgb, var(--gr-color-success-100) 72%, white 28%);
		color: var(--gr-color-success-800);
	}

	.identity-quarantine-panel__badge--warning {
		background: color-mix(in srgb, var(--gr-color-warning-100) 72%, white 28%);
		color: var(--gr-color-warning-800);
	}

	.identity-quarantine-panel__badge--neutral {
		color: var(--gr-semantic-foreground-secondary);
	}

	.identity-quarantine-panel__notice {
		margin: 0;
		padding: 0.85rem 1rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.72);
		color: var(--gr-semantic-foreground-secondary);
	}

	.identity-quarantine-panel__notice--warning {
		background: color-mix(in srgb, var(--gr-color-warning-100) 72%, white 28%);
		color: var(--gr-color-warning-800);
	}

	.identity-quarantine-panel__details {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin: 0;
	}

	.identity-quarantine-panel__details dt,
	.identity-quarantine-panel__details dd {
		margin: 0;
	}

	@media (max-width: 960px) {
		.identity-quarantine-panel__stats,
		.identity-quarantine-panel__details {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
