<script lang="ts">
	import {
		AgentIdentityCard,
		ContinuityPanel,
		DeclarationPreviewCard,
		formatAgentWorkflowLabel,
	} from '$lib/components/agent';
	import { resolveMcpTransport } from '$lib/mcp';
	import { BestWayToContact, ChannelsDisplay } from '$lib/components/soul';
	import AgentFaceFrame from './internal/AgentFaceFrame.svelte';
	import type { AgentFaceTimelineMoment, IdentityNexusData } from './types.js';

	interface Props {
		data: IdentityNexusData;
		class?: string;
	}

	let { data, class: className = '' }: Props = $props();

	let copiedField = $state<string | null>(null);
	function copyToClipboard(value: string, field: string) {
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			navigator.clipboard.writeText(value).then(() => {
				copiedField = field;
				setTimeout(() => { copiedField = null; }, 1500);
			});
		}
	}

	function tomlString(value: string): string {
		return JSON.stringify(value);
	}

	const normalizedTransport = $derived.by(() => {
		if (!data.mcpAccess || !data.agentUsername) return null;

		try {
			return resolveMcpTransport(new URL(data.mcpAccess.mcpURL).origin, data.agentUsername);
		} catch {
			return null;
		}
	});

	const displayedMcpURL = $derived.by(
		() => normalizedTransport?.endpoint ?? data.mcpAccess?.mcpURL ?? ''
	);
	const displayedProtectedResourceURL = $derived.by(
		() => normalizedTransport?.oauthDiscoveryUrl ?? data.mcpAccess?.protectedResourceURL ?? ''
	);

	const mcpConfigSnippet = $derived.by(() => {
		if (!data.agentUsername || !displayedMcpURL) return null;
		return JSON.stringify(
			{
				mcpServers: {
					[data.agentUsername]: {
						type: 'http',
						url: displayedMcpURL,
					},
				},
			},
			null,
			2
		);
	});

	const codexConfigSnippet = $derived.by(() => {
		if (!data.agentUsername || !displayedMcpURL) return null;
		const scopes = data.mcpAccess?.scopes?.length ? data.mcpAccess.scopes : ['read', 'write'];

		return [
			`[mcp_servers.${tomlString(data.agentUsername)}]`,
			`url = ${tomlString(displayedMcpURL)}`,
			`oauth_resource = ${tomlString(displayedMcpURL)}`,
			`scopes = [${scopes.map((scope) => tomlString(scope)).join(', ')}]`,
		].join('\n');
	});

	const continuityTimeline = $derived.by((): readonly AgentFaceTimelineMoment[] =>
		data.timeline?.length
			? data.timeline
			: (data.continuity?.followUps ?? []).map<AgentFaceTimelineMoment>((followUp) => ({
					id: followUp.id,
					title: followUp.title,
					summary: followUp.summary,
					meta: followUp.cadence
						? `${followUp.owner.name} · ${followUp.cadence}`
						: followUp.owner.name,
					tone: 'accent' as const,
				}))
	);
</script>

<AgentFaceFrame
	hero={data.hero}
	brand={data.brand}
	navItems={data.navItems}
	actions={data.actions}
	statusChips={data.statusChips}
	metrics={data.metrics}
	class={className}
>
	{#snippet children()}
		<div class="identity-nexus">
			<div class="identity-nexus__hero-grid">
				<AgentIdentityCard identity={data.identity} />
				{#if data.declaration}
					<DeclarationPreviewCard declaration={data.declaration} />
				{:else if data.declarationNotice}
					<section class="identity-nexus__panel identity-nexus__panel--notice">
						<header class="identity-nexus__panel-header">
							<p>Declaration authority</p>
							<h2>{data.declarationNotice.title}</h2>
						</header>
						<p class="identity-nexus__notice-copy">{data.declarationNotice.message}</p>
					</section>
				{/if}
			</div>

			{#if data.reachabilityNotice}
				<section class="identity-nexus__panel identity-nexus__panel--notice">
					<header class="identity-nexus__panel-header">
						<p>Reachability authority</p>
						<h2>{data.reachabilityNotice.title}</h2>
					</header>
					<p class="identity-nexus__notice-copy">{data.reachabilityNotice.message}</p>
				</section>
			{/if}

			{#if data.showReachability}
				<ChannelsDisplay
					agentId={data.boundSoulAgentId}
					channels={data.channels}
					title="Reachability ledger"
					updatedAt={data.channelsUpdatedAt}
				/>
				<BestWayToContact channels={data.channels} preferences={data.preferences} />
			{/if}

			{#if data.mcpAccess}
				<section class="identity-nexus__panel">
					<header class="identity-nexus__panel-header">
						<p>Agent access</p>
						<h2>MCP Configuration</h2>
					</header>
					<div class="identity-nexus__mcp-details">
						<div class="identity-nexus__mcp-fields">
							<div class="identity-nexus__mcp-field">
								<span class="identity-nexus__mcp-label">MCP Endpoint</span>
								<div class="identity-nexus__mcp-value">
									<code>{displayedMcpURL}</code>
									<button type="button" class="identity-nexus__mcp-copy" onclick={() => copyToClipboard(displayedMcpURL, 'mcpURL')}>
										{copiedField === 'mcpURL' ? 'Copied' : 'Copy'}
									</button>
								</div>
							</div>
							<div class="identity-nexus__mcp-field">
								<span class="identity-nexus__mcp-label">Authorization Server</span>
								<div class="identity-nexus__mcp-value">
									<code>{data.mcpAccess.authorizationServerURL}</code>
									<button type="button" class="identity-nexus__mcp-copy" onclick={() => copyToClipboard(data.mcpAccess!.authorizationServerURL, 'authURL')}>
										{copiedField === 'authURL' ? 'Copied' : 'Copy'}
									</button>
								</div>
							</div>
							<div class="identity-nexus__mcp-field">
								<span class="identity-nexus__mcp-label">Registration Endpoint</span>
								<div class="identity-nexus__mcp-value">
									<code>{data.mcpAccess.registrationURL}</code>
									<button type="button" class="identity-nexus__mcp-copy" onclick={() => copyToClipboard(data.mcpAccess!.registrationURL, 'regURL')}>
										{copiedField === 'regURL' ? 'Copied' : 'Copy'}
									</button>
								</div>
							</div>
							<div class="identity-nexus__mcp-field">
								<span class="identity-nexus__mcp-label">Protected Resource</span>
								<div class="identity-nexus__mcp-value">
									<code>{displayedProtectedResourceURL}</code>
									<button type="button" class="identity-nexus__mcp-copy" onclick={() => copyToClipboard(displayedProtectedResourceURL, 'resURL')}>
										{copiedField === 'resURL' ? 'Copied' : 'Copy'}
									</button>
								</div>
							</div>
							{#if data.mcpAccess.scopes.length}
								<div class="identity-nexus__mcp-field">
									<span class="identity-nexus__mcp-label">Scopes</span>
									<div class="identity-nexus__mcp-scopes">
										{#each data.mcpAccess.scopes as scope}
											<span class="identity-nexus__mcp-scope">{scope}</span>
										{/each}
									</div>
								</div>
							{/if}
						</div>

						{#if data.mcpAccess.guidance.length}
							<div class="identity-nexus__mcp-guidance">
								{#each data.mcpAccess.guidance as note}
									<p>{note}</p>
								{/each}
							</div>
						{/if}

						{#if mcpConfigSnippet}
							<div class="identity-nexus__mcp-config">
								<div class="identity-nexus__mcp-config-header">
									<span class="identity-nexus__mcp-label">Claude Code <code>.mcp.json</code></span>
									<button type="button" class="identity-nexus__mcp-copy" onclick={() => copyToClipboard(mcpConfigSnippet!, 'config')}>
										{copiedField === 'config' ? 'Copied' : 'Copy config'}
									</button>
								</div>
								<pre class="identity-nexus__mcp-pre">{mcpConfigSnippet}</pre>
							</div>
						{/if}

						{#if codexConfigSnippet}
							<div class="identity-nexus__mcp-config">
								<div class="identity-nexus__mcp-config-header">
									<span class="identity-nexus__mcp-label">Codex <code>config.toml</code></span>
									<button type="button" class="identity-nexus__mcp-copy" onclick={() => copyToClipboard(codexConfigSnippet!, 'codex-config')}>
										{copiedField === 'codex-config' ? 'Copied' : 'Copy config'}
									</button>
								</div>
								<pre class="identity-nexus__mcp-pre">{codexConfigSnippet}</pre>
							</div>
						{/if}
					</div>
				</section>
			{/if}

			{#if data.attributions?.length}
				<section class="identity-nexus__panel">
					<header class="identity-nexus__panel-header">
						<p>Attribution ledger</p>
						<h2>Identity and ownership changes</h2>
					</header>
					<div class="identity-nexus__ledger">
						{#each data.attributions as attribution (attribution.id)}
							<article
								class={`identity-nexus__ledger-card identity-nexus__ledger-card--${attribution.tone ?? 'neutral'}`}
							>
								<div class="identity-nexus__ledger-header">
									<h3>{attribution.title}</h3>
									{#if attribution.timestampLabel}
										<small>{attribution.timestampLabel}</small>
									{/if}
								</div>
								<p>{attribution.summary}</p>
								<div class="identity-nexus__ledger-meta">
									{#if attribution.sourceLabel}
										<span>From {attribution.sourceLabel}</span>
									{/if}
									{#if attribution.targetLabel}
										<span>To {attribution.targetLabel}</span>
									{/if}
								</div>
							</article>
						{/each}
					</div>
				</section>
			{/if}

			{#if continuityTimeline.length}
				<section class="identity-nexus__panel">
					<header class="identity-nexus__panel-header">
						<p>Continuity moments</p>
						<h2>Post-graduation timeline</h2>
					</header>
					<div class="identity-nexus__timeline">
						{#each continuityTimeline as moment (moment.id)}
							<article
								class={`identity-nexus__timeline-card identity-nexus__timeline-card--${moment.tone ?? 'neutral'}`}
							>
								<div class="identity-nexus__timeline-header">
									<h3>{moment.title}</h3>
									{#if moment.phase}
										<span class="identity-nexus__phase-pill">
											{formatAgentWorkflowLabel(moment.phase)}
										</span>
									{/if}
								</div>
								<p>{moment.summary}</p>
								{#if moment.meta}
									<small>{moment.meta}</small>
								{/if}
							</article>
						{/each}
					</div>
				</section>
			{/if}

			{#if data.evidence?.length}
				<section class="identity-nexus__panel">
					<header class="identity-nexus__panel-header">
						<p>Identity evidence</p>
						<h2>Declaration references</h2>
					</header>
					<div class="identity-nexus__evidence">
						{#each data.evidence as artifact (artifact.id)}
							<article class="identity-nexus__artifact">
								<h3>{artifact.title}</h3>
								{#if artifact.description}
									<p>{artifact.description}</p>
								{/if}
							</article>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	{/snippet}

	{#snippet side()}
		{#if data.roster?.length}
			<nav class="identity-nexus__roster">
				<header class="identity-nexus__panel-header">
					<p>Agent identities</p>
					<h2>All agents</h2>
				</header>
				{#each data.roster as agent (agent.id)}
					<a
						class="identity-nexus__roster-link"
						class:identity-nexus__roster-link--active={agent.handle === `@${data.agentUsername}`}
						href={agent.href ?? `/l/identity/${encodeURIComponent(agent.handle?.replace(/^@/, '') ?? agent.id)}`}
					>
						<span class="identity-nexus__roster-name">{agent.name}</span>
						{#if agent.handle}
							<span class="identity-nexus__roster-handle">{agent.handle}</span>
						{/if}
					</a>
				{/each}
			</nav>
		{/if}
		{#if data.continuity}
			<ContinuityPanel panel={data.continuity} />
		{/if}
	{/snippet}
</AgentFaceFrame>

<style>
	.identity-nexus,
	.identity-nexus__evidence,
	.identity-nexus__hero-grid,
	.identity-nexus__ledger,
	.identity-nexus__timeline {
		display: grid;
		gap: 0.75rem;
	}

	.identity-nexus {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.identity-nexus__panel {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.6);
		min-width: 0;
	}

	.identity-nexus__panel--notice {
		align-content: start;
	}

	.identity-nexus__panel-header p,
	.identity-nexus__panel-header h2,
	.identity-nexus__artifact h3,
	.identity-nexus__artifact p,
	.identity-nexus__artifact small,
	.identity-nexus__ledger-card h3,
	.identity-nexus__ledger-card p,
	.identity-nexus__ledger-card small,
	.identity-nexus__timeline-card h3,
	.identity-nexus__timeline-card p,
	.identity-nexus__timeline-card small {
		margin: 0;
	}

	.identity-nexus__panel-header p,
	.identity-nexus__artifact small,
	.identity-nexus__ledger-card small,
	.identity-nexus__timeline-card small {
		font-size: 0.78rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gr-semantic-foreground-tertiary);
	}

	.identity-nexus__panel-header h2 {
		margin-top: 0.25rem;
		font-size: 1.1rem;
	}

	.identity-nexus__notice-copy {
		margin: 0;
		line-height: 1.6;
		color: var(--gr-semantic-foreground-secondary);
	}

	.identity-nexus__evidence {
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
	}

	.identity-nexus__hero-grid {
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		align-items: start;
	}

	.identity-nexus__ledger,
	.identity-nexus__timeline {
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
	}

	.identity-nexus__artifact {
		display: grid;
		gap: 0.35rem;
		padding: 1rem;
		border-radius: 1rem;
		background: color-mix(in srgb, var(--gr-semantic-background-secondary) 82%, white 18%);
	}

	.identity-nexus__artifact p {
		line-height: 1.5;
		color: var(--gr-semantic-foreground-secondary);
	}

	.identity-nexus__ledger-card,
	.identity-nexus__timeline-card {
		display: grid;
		gap: 0.45rem;
		padding: 1rem;
		border-radius: 0.75rem;
		background: color-mix(in srgb, var(--gr-semantic-background-secondary) 82%, white 18%);
		min-width: 0;
	}

	.identity-nexus__ledger-card p,
	.identity-nexus__timeline-card p,
	.identity-nexus__ledger-meta {
		line-height: 1.5;
		color: var(--gr-semantic-foreground-secondary);
	}

	.identity-nexus__ledger-card--accent,
	.identity-nexus__timeline-card--accent {
		border-left: 3px solid color-mix(in srgb, var(--gr-color-primary-300) 65%, white 35%);
	}

	.identity-nexus__ledger-card--success,
	.identity-nexus__timeline-card--success {
		border-left: 3px solid color-mix(in srgb, var(--gr-color-success-300) 65%, white 35%);
	}

	.identity-nexus__ledger-card--warning,
	.identity-nexus__timeline-card--warning {
		border-left: 3px solid color-mix(in srgb, var(--gr-color-warning-300) 65%, white 35%);
	}

	.identity-nexus__ledger-card--critical,
	.identity-nexus__timeline-card--critical {
		border-left: 3px solid color-mix(in srgb, var(--gr-color-error-300) 65%, white 35%);
	}

	.identity-nexus__ledger-header,
	.identity-nexus__timeline-header {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		align-items: flex-start;
	}

	.identity-nexus__ledger-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.identity-nexus__phase-pill {
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.82);
		font-size: 0.74rem;
		font-weight: 700;
	}

	/* ── Roster sidebar ── */
	.identity-nexus__roster {
		display: grid;
		gap: 0.25rem;
		padding: 1rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.6);
	}

	.identity-nexus__roster .identity-nexus__panel-header {
		margin-bottom: 0.25rem;
	}

	.identity-nexus__roster-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.65rem;
		border-radius: 0.5rem;
		text-decoration: none;
		color: inherit;
		transition: background 0.15s ease;
	}

	.identity-nexus__roster-link:hover {
		background: color-mix(in srgb, var(--gr-semantic-background-secondary) 68%, white 32%);
	}

	.identity-nexus__roster-link--active {
		background: color-mix(in srgb, var(--gr-semantic-background-secondary) 82%, white 18%);
		font-weight: 600;
	}

	.identity-nexus__roster-name {
		font-size: 0.88rem;
	}

	.identity-nexus__roster-handle {
		font-size: 0.78rem;
		color: var(--gr-semantic-foreground-tertiary);
	}

	/* ── MCP Details ── */
	.identity-nexus__mcp-details {
		display: grid;
		gap: 1rem;
	}

	.identity-nexus__mcp-fields {
		display: grid;
		gap: 0.75rem;
	}

	.identity-nexus__mcp-field {
		display: grid;
		gap: 0.25rem;
	}

	.identity-nexus__mcp-label {
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--gr-semantic-foreground-secondary);
	}

	.identity-nexus__mcp-value {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--gr-semantic-background-secondary) 82%, white 18%);
		overflow: hidden;
	}

	.identity-nexus__mcp-value code {
		flex: 1;
		font-size: 0.82rem;
		word-break: break-all;
		color: var(--gr-semantic-foreground-primary);
	}

	.identity-nexus__mcp-copy {
		flex-shrink: 0;
		padding: 0.25rem 0.6rem;
		border-radius: 0.4rem;
		border: 1px solid color-mix(in srgb, var(--gr-semantic-border-subtle) 65%, white 35%);
		background: rgba(255, 255, 255, 0.82);
		font: inherit;
		font-size: 0.74rem;
		font-weight: 600;
		cursor: pointer;
		color: var(--gr-semantic-foreground-secondary);
	}

	.identity-nexus__mcp-copy:hover {
		background: rgba(255, 255, 255, 1);
	}

	.identity-nexus__mcp-scopes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.identity-nexus__mcp-scope {
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.82);
		font-size: 0.78rem;
		font-weight: 600;
	}

	.identity-nexus__mcp-guidance {
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		border-left: 3px solid color-mix(in srgb, var(--gr-color-warning-300) 65%, white 35%);
		background: color-mix(in srgb, var(--gr-semantic-background-secondary) 82%, white 18%);
	}

	.identity-nexus__mcp-guidance p {
		margin: 0;
		line-height: 1.5;
		color: var(--gr-semantic-foreground-secondary);
	}

	.identity-nexus__mcp-config {
		display: grid;
		gap: 0.5rem;
	}

	.identity-nexus__mcp-config-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.identity-nexus__mcp-config-header .identity-nexus__mcp-label {
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--gr-semantic-foreground-secondary);
	}

	.identity-nexus__mcp-config-header code {
		font-size: 0.78rem;
	}

	.identity-nexus__mcp-pre {
		margin: 0;
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		background: color-mix(in srgb, var(--gr-semantic-background-secondary) 90%, black 10%);
		font-size: 0.78rem;
		line-height: 1.55;
		overflow-x: auto;
		white-space: pre;
	}
</style>
