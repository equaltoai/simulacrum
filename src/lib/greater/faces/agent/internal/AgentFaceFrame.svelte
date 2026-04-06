<script lang="ts">
	import type { Snippet } from 'svelte';
	import type {
		AgentFaceAction,
		AgentFaceBrand,
		AgentFaceHero,
		AgentFaceMetric,
		AgentFaceNavItem,
		AgentFaceStatusChip,
	} from '../types.js';

	interface Props {
		hero: AgentFaceHero;
		brand?: AgentFaceBrand;
		navItems?: readonly AgentFaceNavItem[];
		actions?: readonly AgentFaceAction[];
		statusChips?: readonly AgentFaceStatusChip[];
		metrics?: readonly AgentFaceMetric[];
		heroTestId?: string;
		children?: Snippet;
		side?: Snippet;
		class?: string;
	}

	let {
		hero,
		brand,
		navItems = [],
		actions = [],
		statusChips = [],
		metrics = [],
		heroTestId,
		children,
		side,
		class: className = '',
	}: Props = $props();

	function actionClass(tone: AgentFaceAction['tone'] = 'secondary'): string {
		return `agent-face-frame__action agent-face-frame__action--${tone}`;
	}

	function chipClass(tone: AgentFaceStatusChip['tone'] = 'neutral'): string {
		return `agent-face-frame__chip agent-face-frame__chip--${tone}`;
	}
</script>

<section class={`agent-face-frame ${side ? 'agent-face-frame--with-rail' : ''} ${className}`}>
	<div class="agent-face-frame__backdrop" aria-hidden="true"></div>

	{#if brand || navItems.length}
		<aside class="agent-face-frame__sidebar" aria-label="Agent face navigation">
			{#if brand}
				<header class="agent-face-frame__brand">
					<p class="agent-face-frame__brand-mark">{brand.name}</p>
					{#if brand.editionLabel}
						<p class="agent-face-frame__brand-copy">{brand.editionLabel}</p>
					{/if}
					{#if brand.environmentLabel}
						<p class="agent-face-frame__brand-meta">{brand.environmentLabel}</p>
					{/if}
				</header>
			{/if}

			{#if navItems.length}
				<nav class="agent-face-frame__nav">
					{#each navItems as item (item.id)}
						{#if item.id === 'nav-divider'}
							<hr class="agent-face-frame__nav-divider" />
						{:else}
							<a
								class:agent-face-frame__nav-link--active={item.active}
								class="agent-face-frame__nav-link"
								href={item.href ?? '#'}
							>
								{#if item.icon}
									<span class="agent-face-frame__nav-icon material-symbols-outlined">{item.icon}</span>
								{/if}
								<span>{item.label}</span>
								{#if item.badge}
									<span class="agent-face-frame__nav-badge">{item.badge}</span>
								{/if}
							</a>
						{/if}
					{/each}
				</nav>
			{/if}

			{#if brand?.supportLabel}
				<p class="agent-face-frame__support">{brand.supportLabel}</p>
			{/if}
		</aside>
	{/if}

	<div class="agent-face-frame__content">
		<header class="agent-face-frame__hero" data-testid={heroTestId}>
			<div class="agent-face-frame__hero-copy">
				<p class="agent-face-frame__eyebrow">{hero.eyebrow}</p>
				<h1>{hero.title}</h1>
				<p class="agent-face-frame__summary">{hero.summary}</p>
			</div>

			{#if actions.length}
				<div class="agent-face-frame__actions">
					{#each actions as action (`${action.label}-${action.href ?? 'button'}`)}
						{#if action.href}
							<a class={actionClass(action.tone)} href={action.href}>
								<span>{action.label}</span>
								{#if action.detail}
									<small>{action.detail}</small>
								{/if}
							</a>
						{:else}
							<button class={actionClass(action.tone)} type="button">
								<span>{action.label}</span>
								{#if action.detail}
									<small>{action.detail}</small>
								{/if}
							</button>
						{/if}
					{/each}
				</div>
			{/if}
		</header>

		{#if statusChips.length}
			<div class="agent-face-frame__chips" aria-label="Workflow status">
				{#each statusChips as chip, chipIndex (`${chip.label}-${chip.detail ?? chipIndex}`)}
					<div class={chipClass(chip.tone)}>
						<strong>{chip.label}</strong>
						{#if chip.detail}
							<span>{chip.detail}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if metrics.length}
			<div class="agent-face-frame__metrics">
				{#each metrics as metric (metric.id)}
					<article
						class={`agent-face-frame__metric agent-face-frame__metric--${metric.tone ?? 'neutral'}`}
					>
						<p class="agent-face-frame__metric-value">{metric.value}</p>
						<p class="agent-face-frame__metric-label">{metric.label}</p>
						{#if metric.detail}
							<p class="agent-face-frame__metric-detail">{metric.detail}</p>
						{/if}
					</article>
				{/each}
			</div>
		{/if}

		<div class="agent-face-frame__main">
			{#if children}
				{@render children()}
			{/if}
		</div>
	</div>

	{#if side}
		<aside class="agent-face-frame__rail">
			{@render side()}
		</aside>
	{/if}
</section>

<style>
	/* ── Frame: 3-column grid (sidebar | content | rail) ── */
	.agent-face-frame {
		position: relative;
		display: grid;
		grid-template-columns: minmax(14rem, 16rem) minmax(0, 1fr);
		min-height: 100vh;
		background:
			radial-gradient(circle at top right, rgba(226, 155, 254, 0.18), transparent 28rem),
			radial-gradient(circle at bottom left, rgba(255, 159, 84, 0.18), transparent 26rem),
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--gr-semantic-background-secondary) 72%, white 28%),
				color-mix(in srgb, var(--gr-semantic-background-primary) 88%, white 12%)
			);
	}

	.agent-face-frame--with-rail {
		grid-template-columns: minmax(14rem, 16rem) minmax(0, 1fr) minmax(16rem, 22rem);
	}

	.agent-face-frame__backdrop {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(135deg, rgba(255, 255, 255, 0.28), transparent 35%),
			linear-gradient(320deg, rgba(255, 183, 131, 0.22), transparent 30%);
		pointer-events: none;
	}

	/* ── Sidebar: glass + icon nav ── */
	.agent-face-frame__sidebar,
	.agent-face-frame__content,
	.agent-face-frame__rail {
		position: relative;
		z-index: 1;
	}

	.agent-face-frame__sidebar {
		grid-column: 1;
		grid-row: 1 / -1;
		position: sticky;
		top: 0;
		height: 100vh;
		overflow-y: auto;
		display: grid;
		gap: 1.5rem;
		align-content: start;
		padding: 1.75rem 1.25rem;
		background: rgba(255, 251, 245, 0.8);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
	}

	.agent-face-frame__brand-mark,
	.agent-face-frame__brand-copy,
	.agent-face-frame__brand-meta,
	.agent-face-frame__support,
	.agent-face-frame__summary,
	.agent-face-frame__metric-label,
	.agent-face-frame__metric-detail {
		margin: 0;
	}

	.agent-face-frame__brand-mark {
		font-size: 1.55rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	.agent-face-frame__brand-copy {
		margin-top: 0.3rem;
		color: var(--gr-semantic-foreground-secondary);
	}

	.agent-face-frame__brand-meta,
	.agent-face-frame__support {
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gr-semantic-foreground-tertiary);
	}

	.agent-face-frame__nav {
		display: grid;
		gap: 0.4rem;
	}

	.agent-face-frame__nav-link {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.7rem 0.85rem;
		border-radius: 0.75rem;
		color: inherit;
		text-decoration: none;
		background: transparent;
		transition:
			transform 140ms ease,
			background 140ms ease;
	}

	.agent-face-frame__nav-link:hover {
		transform: translateX(0.15rem);
		background: rgba(255, 255, 255, 0.55);
	}

	.agent-face-frame__nav-link--active {
		background: color-mix(in srgb, var(--gr-color-secondary-100) 55%, white 45%);
		color: var(--gr-color-secondary-800);
		font-weight: 700;
	}

	.agent-face-frame__nav-divider {
		border: none;
		height: 1px;
		background: color-mix(in srgb, var(--gr-semantic-border-subtle) 40%, transparent 60%);
		margin: 0.35rem 0;
	}

	.agent-face-frame__nav-icon {
		font-size: 1.25rem;
		font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
	}

	.agent-face-frame__nav-link--active .agent-face-frame__nav-icon {
		font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
	}

	.agent-face-frame__nav-badge {
		margin-left: auto;
		padding: 0.18rem 0.45rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.82);
		font-size: 0.72rem;
		font-weight: 700;
	}

	/* ── Content: center column ── */
	.agent-face-frame__content {
		grid-column: 2;
		grid-row: 1 / -1;
		display: grid;
		gap: 1rem;
		align-content: start;
		padding: 1.5rem;
	}

	.agent-face-frame__hero {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1.5rem;
	}

	.agent-face-frame__eyebrow {
		margin: 0 0 0.6rem;
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--gr-semantic-foreground-tertiary);
	}

	.agent-face-frame__hero h1 {
		margin: 0;
		font-size: clamp(2.3rem, 4vw, 4rem);
		line-height: 0.98;
	}

	.agent-face-frame__summary {
		max-width: 46rem;
		margin-top: 0.9rem;
		font-size: 1rem;
		line-height: 1.65;
		color: var(--gr-semantic-foreground-secondary);
	}

	.agent-face-frame__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		justify-content: flex-end;
	}

	.agent-face-frame__action {
		display: inline-flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		padding: 0.9rem 1rem;
		border-radius: 1rem;
		border: 0;
		text-decoration: none;
		font: inherit;
		cursor: pointer;
	}

	.agent-face-frame__action span,
	.agent-face-frame__action small {
		color: inherit;
	}

	.agent-face-frame__action small {
		font-size: 0.76rem;
		opacity: 0.8;
	}

	.agent-face-frame__action--primary {
		background: linear-gradient(135deg, var(--gr-color-primary-600), var(--gr-color-primary-500));
		color: white;
		box-shadow: 0 18px 40px rgba(148, 74, 0, 0.18);
	}

	.agent-face-frame__action--secondary {
		background: rgba(255, 255, 255, 0.82);
		color: var(--gr-semantic-foreground-primary);
		border: 1px solid color-mix(in srgb, var(--gr-semantic-border-subtle) 65%, white 35%);
	}

	.agent-face-frame__action--ghost {
		background: transparent;
		color: var(--gr-semantic-foreground-secondary);
		border: 1px dashed color-mix(in srgb, var(--gr-semantic-border-subtle) 82%, white 18%);
	}

	/* ── Chips & Metrics: auto-fill with max cap ── */
	.agent-face-frame__chips,
	.agent-face-frame__metrics {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.625rem;
	}

	.agent-face-frame__chip,
	.agent-face-frame__metric {
		display: grid;
		gap: 0.2rem;
		padding: 1rem 1.05rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.72);
	}

	.agent-face-frame__chip strong,
	.agent-face-frame__chip span,
	.agent-face-frame__metric-value {
		margin: 0;
	}

	.agent-face-frame__chip span {
		font-size: 0.86rem;
		color: var(--gr-semantic-foreground-secondary);
	}

	.agent-face-frame__chip--accent,
	.agent-face-frame__metric--accent {
		border-left: 3px solid color-mix(in srgb, var(--gr-color-primary-300) 65%, white 35%);
	}

	.agent-face-frame__chip--success,
	.agent-face-frame__metric--success {
		border-left: 3px solid color-mix(in srgb, var(--gr-color-success-300) 65%, white 35%);
	}

	.agent-face-frame__chip--warning,
	.agent-face-frame__metric--warning {
		border-left: 3px solid color-mix(in srgb, var(--gr-color-warning-300) 65%, white 35%);
	}

	.agent-face-frame__chip--critical,
	.agent-face-frame__metric--critical {
		border-left: 3px solid color-mix(in srgb, var(--gr-color-error-300) 65%, white 35%);
	}

	.agent-face-frame__metric-value {
		font-size: 1.4rem;
		font-weight: 700;
	}

	.agent-face-frame__metric-label {
		font-weight: 600;
	}

	.agent-face-frame__metric-detail {
		font-size: 0.85rem;
		color: var(--gr-semantic-foreground-secondary);
	}

	/* ── Main: page content slot ── */
	.agent-face-frame__main {
		display: grid;
		gap: 1rem;
		align-content: start;
	}

	/* ── Rail: sticky right sidebar ── */
	.agent-face-frame__rail {
		grid-column: 3;
		grid-row: 1 / -1;
		position: sticky;
		top: 0;
		height: 100vh;
		overflow-y: auto;
		padding: 1.5rem 1rem;
		display: grid;
		gap: 0.75rem;
		align-content: start;
		background: color-mix(in srgb, var(--gr-semantic-background-secondary) 60%, white 40%);
	}

	/* ── Responsive ── */
	@media (max-width: 960px) {
		.agent-face-frame,
		.agent-face-frame--with-rail {
			grid-template-columns: 1fr;
		}

		.agent-face-frame__sidebar {
			position: static;
			height: auto;
			grid-column: auto;
			grid-row: auto;
		}

		.agent-face-frame__content {
			grid-column: auto;
			grid-row: auto;
		}

		.agent-face-frame__rail {
			position: static;
			height: auto;
			grid-column: auto;
			grid-row: auto;
		}
	}

	@media (max-width: 720px) {
		.agent-face-frame__content {
			padding: 1.25rem;
		}

		.agent-face-frame__hero {
			flex-direction: column;
		}

		.agent-face-frame__actions {
			width: 100%;
			justify-content: flex-start;
		}
	}
</style>
