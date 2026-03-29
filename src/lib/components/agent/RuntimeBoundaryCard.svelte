<script lang="ts">
	import type { AgentRuntimeBoundaryData } from './surfaces.js';

	interface Props {
		boundary: AgentRuntimeBoundaryData;
		class?: string;
	}

	let { boundary, class: className = '' }: Props = $props();

	function capabilityTone(state: AgentRuntimeBoundaryData['capabilities'][number]['state']): string {
		switch (state) {
			case 'available':
				return 'success';
			case 'restricted':
				return 'warning';
			case 'locked':
			default:
				return 'critical';
		}
	}
</script>

<article class={`runtime-boundary-card ${className}`}>
	<div class="runtime-boundary-card__header">
		<div>
			<p class="runtime-boundary-card__eyebrow">Runtime boundary</p>
			<h3>{boundary.title}</h3>
		</div>
	</div>

	<p class="runtime-boundary-card__summary">{boundary.summary}</p>

	<div class="runtime-boundary-card__signals">
		<div>
			<p class="runtime-boundary-card__signal-label">Moderation</p>
			<p>{boundary.moderationLabel}</p>
		</div>
		<div>
			<p class="runtime-boundary-card__signal-label">Attribution</p>
			<p>{boundary.attributionLabel}</p>
		</div>
		<div>
			<p class="runtime-boundary-card__signal-label">Continuity</p>
			<p>{boundary.continuitySummary}</p>
		</div>
		{#if boundary.expectedWallet}
			<div>
				<p class="runtime-boundary-card__signal-label">Registered wallet</p>
				<p>{boundary.expectedWallet}</p>
			</div>
		{/if}
	</div>

	<div class="runtime-boundary-card__capabilities">
		{#each boundary.capabilities as capability (capability.id)}
			<div class={`runtime-boundary-card__capability runtime-boundary-card__capability--${capabilityTone(capability.state)}`}>
				<div class="runtime-boundary-card__capability-header">
					<strong>{capability.label}</strong>
					<span>{capability.state}</span>
				</div>
				<p>{capability.detail}</p>
			</div>
		{/each}
	</div>

	{#if boundary.delegatedScopes?.length}
		<div class="runtime-boundary-card__meta">
			<p class="runtime-boundary-card__signal-label">Delegated scopes</p>
			<div class="runtime-boundary-card__chips">
				{#each boundary.delegatedScopes as scope (scope)}
					<span>{scope}</span>
				{/each}
			</div>
		</div>
	{/if}

	{#if boundary.mcpGuidance?.length}
		<div class="runtime-boundary-card__meta">
			<p class="runtime-boundary-card__signal-label">MCP guidance</p>
			<ul>
				{#each boundary.mcpGuidance as note, noteIndex (`${note}-${noteIndex}`)}
					<li>{note}</li>
				{/each}
			</ul>
			{#if boundary.mcpUrl}
				<p class="runtime-boundary-card__endpoint">{boundary.mcpUrl}</p>
			{/if}
		</div>
	{/if}
</article>

<style>
	.runtime-boundary-card {
		display: grid;
		gap: 1rem;
		padding: 1.35rem;
		border-radius: 1.2rem;
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--gr-color-warning-100) 42%, white 58%), white),
			var(--gr-semantic-background-primary);
		border: 1px solid color-mix(in srgb, var(--gr-color-warning-300) 58%, white 42%);
		box-shadow: 0 16px 32px rgba(62, 34, 0, 0.08);
	}

	.runtime-boundary-card__eyebrow,
	.runtime-boundary-card__signal-label,
	.runtime-boundary-card__endpoint,
	.runtime-boundary-card li,
	.runtime-boundary-card__capability p {
		margin: 0;
		color: var(--gr-semantic-foreground-tertiary);
	}

	.runtime-boundary-card__header h3,
	.runtime-boundary-card__summary,
	.runtime-boundary-card__signal-label + p,
	.runtime-boundary-card__capability strong,
	.runtime-boundary-card__capability span,
	.runtime-boundary-card__meta ul {
		margin: 0;
	}

	.runtime-boundary-card__eyebrow,
	.runtime-boundary-card__signal-label {
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.runtime-boundary-card__summary {
		line-height: 1.55;
		color: var(--gr-semantic-foreground-secondary);
	}

	.runtime-boundary-card__signals,
	.runtime-boundary-card__capabilities {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 0.75rem;
	}

	.runtime-boundary-card__signals > div,
	.runtime-boundary-card__capability,
	.runtime-boundary-card__meta {
		padding: 0.9rem 1rem;
		border-radius: 1rem;
		background: color-mix(in srgb, var(--gr-semantic-background-secondary) 86%, white 14%);
	}

	.runtime-boundary-card__capability-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.runtime-boundary-card__capability span {
		font-size: 0.8rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.runtime-boundary-card__capability--success span {
		color: var(--gr-color-success-700);
	}

	.runtime-boundary-card__capability--warning span {
		color: var(--gr-color-warning-700);
	}

	.runtime-boundary-card__capability--critical span {
		color: var(--gr-color-danger-700);
	}

	.runtime-boundary-card__chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.runtime-boundary-card__chips span {
		padding: 0.3rem 0.65rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--gr-color-secondary-100) 72%, white 28%);
		color: var(--gr-color-secondary-700);
		font-size: 0.82rem;
		font-weight: 600;
	}

	.runtime-boundary-card__meta ul {
		padding-left: 1rem;
		display: grid;
		gap: 0.45rem;
	}

	.runtime-boundary-card__endpoint {
		margin-top: 0.75rem;
		font-size: 0.82rem;
		word-break: break-all;
	}
</style>
