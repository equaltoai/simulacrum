<script lang="ts">
	import { browser } from '$app/environment';
	import type { AgentAccessLease, AgentConnectorRegistration, AgentLeaseToken } from '$lib/api';
	import {
		KNOWN_MCP_TOOLS,
		KNOWN_MCP_PROMPTS,
		KNOWN_MCP_RESOURCES,
		describeMcpError,
		isInsufficientScopeError,
		requiredScopeFromError,
		fetchOAuthProtectedResource,
		fetchMcpWellKnown,
		inspectMcpServer,
		knownToolMap,
		resolveMcpTransport,
		type KnownMcpTool,
		type McpInspection,
		type McpPromptHint,
		type McpResourceHint,
		type McpToolDefinition,
		type McpTransportConfig,
		type McpWellKnownDocument,
		type OAuthProtectedResourceDocument,
	} from '$lib/mcp';

	interface Props {
		canManage: boolean;
		latestConnector: AgentConnectorRegistration | null;
		connectorSessionCount: number;
		selectedLease: AgentAccessLease | null;
		leaseToken: AgentLeaseToken | null;
	}

	type PanelStatus = 'idle' | 'loading' | 'ready' | 'error';
	type ActiveCredential = {
		accessToken: string;
		scope: string;
		expiresIn: number | null;
		metaLabel: string;
	};
	type DisplayTool = KnownMcpTool & {
		source: 'live' | 'discovery' | 'fallback';
		description: string;
	};

	let {
		canManage,
		latestConnector,
		connectorSessionCount,
		selectedLease,
		leaseToken,
	}: Props = $props();

	let discoveryStatus = $state<PanelStatus>('idle');
	let discoveryDoc = $state<McpWellKnownDocument | null>(null);
	let discoveryError = $state<string | null>(null);
	let discoveryCheckedAt = $state<number | null>(null);
	let oauthDiscoveryStatus = $state<PanelStatus>('idle');
	let oauthDiscoveryDoc = $state<OAuthProtectedResourceDocument | null>(null);
	let oauthDiscoveryError = $state<string | null>(null);
	let oauthDiscoveryCheckedAt = $state<number | null>(null);

	let inspectionStatus = $state<PanelStatus>('idle');
	let inspection = $state<McpInspection | null>(null);
	let inspectionError = $state<string | null>(null);
	let inspectionCheckedAt = $state<number | null>(null);
	let inspectionRawError = $state<unknown>(null);

	function tokenValue(): string {
		return activeCredential?.accessToken?.trim() || '<advanced-access-token>';
	}

	function statusLabel(status: PanelStatus): string {
		switch (status) {
			case 'loading':
				return 'Checking';
			case 'ready':
				return 'Reachable';
			case 'error':
				return 'Problem';
			default:
				return 'Waiting';
		}
	}

	function statusBadgeClass(status: PanelStatus): string {
		if (status === 'ready') return 'gr-badge gr-badge--sm gr-badge--outlined gr-badge--success';
		if (status === 'error') return 'gr-badge gr-badge--sm gr-badge--outlined gr-badge--error';
		if (status === 'loading') return 'gr-badge gr-badge--sm gr-badge--outlined gr-badge--info';
		return 'gr-badge gr-badge--sm gr-badge--outlined gr-badge--gray';
	}

	function formatCheckedAt(value: number | null): string | null {
		if (!value) return null;
		return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	}

	async function copy(value: string) {
		if (typeof navigator === 'undefined' || !navigator.clipboard) return;
		await navigator.clipboard.writeText(value);
	}

	async function refreshDiscovery(
		discoveryUrl: string,
		{ signal }: { signal?: AbortSignal } = {}
	) {
		if (!browser || !discoveryUrl) return;

		discoveryStatus = 'loading';
		discoveryError = null;

		try {
			discoveryDoc = await fetchMcpWellKnown(discoveryUrl, signal);
			discoveryStatus = 'ready';
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			discoveryDoc = null;
			discoveryStatus = 'error';
			discoveryError = describeMcpError(error);
		} finally {
			discoveryCheckedAt = Date.now();
		}
	}

	async function refreshOAuthDiscovery(
		oauthDiscoveryUrl: string,
		{ signal }: { signal?: AbortSignal } = {}
	) {
		if (!browser || !oauthDiscoveryUrl) return;

		oauthDiscoveryStatus = 'loading';
		oauthDiscoveryError = null;

		try {
			oauthDiscoveryDoc = await fetchOAuthProtectedResource(oauthDiscoveryUrl, signal);
			oauthDiscoveryStatus = 'ready';
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			oauthDiscoveryDoc = null;
			oauthDiscoveryStatus = 'error';
			oauthDiscoveryError = describeMcpError(error);
		} finally {
			oauthDiscoveryCheckedAt = Date.now();
		}
	}

	async function refreshInspection(
		endpoint: string,
		token: string,
		{ signal }: { signal?: AbortSignal } = {}
	) {
		if (!browser || !endpoint || !token) return;

		inspectionStatus = 'loading';
		inspectionError = null;
		inspectionRawError = null;

		try {
			inspection = await inspectMcpServer({
				endpoint,
				token,
				signal,
			});
			inspectionStatus = 'ready';
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			inspection = null;
			inspectionStatus = 'error';
			inspectionError = describeMcpError(error);
			inspectionRawError = error;
		} finally {
			inspectionCheckedAt = Date.now();
		}
	}

	const transport = $derived.by<McpTransportConfig | null>(() =>
		browser ? resolveMcpTransport(window.location.origin) : null
	);

	$effect(() => {
		const discoveryUrl = transport?.discoveryUrl ?? '';
		if (!browser || !discoveryUrl) return;

		const controller = new AbortController();
		void refreshDiscovery(discoveryUrl, { signal: controller.signal });

		return () => controller.abort();
	});

	$effect(() => {
		const oauthDiscoveryUrl = transport?.oauthDiscoveryUrl ?? '';
		if (!browser || !oauthDiscoveryUrl) return;

		const controller = new AbortController();
		void refreshOAuthDiscovery(oauthDiscoveryUrl, { signal: controller.signal });

		return () => controller.abort();
	});

	$effect(() => {
		const token = activeCredential?.accessToken?.trim() ?? '';
		const endpoint = discoveryDoc?.endpoint?.trim() || transport?.endpoint || '';

		inspection = null;
		inspectionError = null;
		inspectionCheckedAt = null;

		if (!token || !endpoint) {
			inspectionStatus = 'idle';
			return;
		}

		const controller = new AbortController();
		void refreshInspection(endpoint, token, { signal: controller.signal });

		return () => controller.abort();
	});

	const mcpEndpoint = $derived.by(() => discoveryDoc?.endpoint?.trim() || transport?.endpoint || '');
	const mcpDiscoveryUrl = $derived.by(() => transport?.discoveryUrl ?? '');
	const oauthDiscoveryUrl = $derived.by(() => transport?.oauthDiscoveryUrl ?? '');
	const activeCredential = $derived.by<ActiveCredential | null>(() => {
		const leaseAccessToken = leaseToken?.accessToken?.trim();
		if (leaseAccessToken) {
			return {
				accessToken: leaseAccessToken,
				scope: leaseToken?.scope?.trim() || selectedLease?.scopes.join(' ') || 'read write',
				expiresIn: leaseToken?.expiresIn ?? null,
				metaLabel: selectedLease?.deviceLabel?.trim() || 'Advanced lease',
			};
		}

		return null;
	});
	const authHeader = $derived.by(() => `Authorization: Bearer ${tokenValue()}`);
	const currentScope = $derived.by(() => activeCredential?.scope || 'read write');
	const currentExpiry = $derived.by(() => activeCredential?.expiresIn ?? null);
	const discoveryCapabilities = $derived.by(
		() => discoveryDoc?.capabilities ?? { tools: true, resources: true, prompts: true }
	);
	const oauthDiscoverySummary = $derived.by(() => {
		const authorizationServers = oauthDiscoveryDoc?.authorization_servers?.filter(Boolean) ?? [];
		const scopes = oauthDiscoveryDoc?.scopes_supported?.filter(Boolean) ?? [];
		const methods = oauthDiscoveryDoc?.bearer_methods_supported?.filter(Boolean) ?? [];
		return {
			authorizationServers,
			scopes,
			methods,
		};
	});
	const claudeAiClientId = $derived.by(() =>
		latestConnector?.clientPreset === 'claude_ai'
			? latestConnector.clientId
			: '<client-id from Claude.ai connector>'
	);
	const claudeAiClientSecret = $derived.by(() =>
		latestConnector?.clientPreset === 'claude_ai'
			? latestConnector.clientSecret
			: '<client-secret from Claude.ai connector>'
	);
	const claudeCodeClientId = $derived.by(() =>
		latestConnector?.clientPreset === 'claude_code'
			? latestConnector.clientId
			: '<client-id from Claude Code connector>'
	);
	const claudeCodeClientSecret = $derived.by(() =>
		latestConnector?.clientPreset === 'claude_code'
			? latestConnector.clientSecret
			: '<client-secret from Claude Code connector>'
	);
	const headlessClientId = $derived.by(() =>
		latestConnector?.clientPreset === 'headless'
			? latestConnector.clientId
			: '<client-id from headless connector>'
	);
	const headlessClientSecret = $derived.by(() =>
		latestConnector?.clientPreset === 'headless'
			? latestConnector.clientSecret
			: '<client-secret from headless connector>'
	);
	const discoveryOverviewStatus = $derived.by<PanelStatus>(() => {
		if (oauthDiscoveryStatus === 'error' || discoveryStatus === 'error') return 'error';
		if (oauthDiscoveryStatus === 'loading' || discoveryStatus === 'loading') return 'loading';
		if (oauthDiscoveryStatus === 'ready' && discoveryStatus === 'ready') return 'ready';
		return 'idle';
	});

	const displayedTools = $derived.by<DisplayTool[]>(() => {
		const toolsByName = knownToolMap();
		const seeds =
			inspection?.tools && inspection.tools.length > 0
				? inspection.tools.map((tool) => ({ tool, source: 'live' as const }))
				: discoveryDoc?.tools && discoveryDoc.tools.length > 0
					? discoveryDoc.tools
							.map((tool) => ({
								tool: {
									name: tool.name?.trim() ?? '',
									description: tool.description?.trim(),
								} satisfies McpToolDefinition,
								source: 'discovery' as const,
							}))
							.filter((entry) => entry.tool.name)
					: [];

		if (seeds.length === 0) {
			return [...KNOWN_MCP_TOOLS].sort((left, right) => left.name.localeCompare(right.name)).map((tool) => ({
				...tool,
				source: 'fallback',
				description: tool.description,
			}));
		}

		return seeds
			.map(({ tool, source }) => {
				const known = toolsByName.get(tool.name);
				return {
					name: tool.name,
					description: tool.description?.trim() || known?.description || 'Tool exposed by the MCP server.',
					scope: known?.scope ?? 'read',
					category: known?.category ?? 'Core',
					source,
				} satisfies DisplayTool;
			})
			.sort((left, right) => {
				if (left.category !== right.category) return left.category.localeCompare(right.category);
				return left.name.localeCompare(right.name);
			});
	});

	const displayedResources = $derived.by<McpResourceHint[]>(() => {
		const live = inspection?.capabilities.resources ?? [];
		if (live.length === 0) return KNOWN_MCP_RESOURCES;

		const known = new Map(KNOWN_MCP_RESOURCES.map((resource) => [resource.uri, resource]));
		return live.map((uri) => known.get(uri) ?? { uri, title: 'MCP resource' });
	});

	const displayedPrompts = $derived.by<McpPromptHint[]>(() => {
		const live = inspection?.capabilities.prompts ?? [];
		if (live.length === 0) return KNOWN_MCP_PROMPTS;

		const known = new Map(KNOWN_MCP_PROMPTS.map((prompt) => [prompt.name, prompt]));
		return live.map((name) => known.get(name) ?? { name, description: 'Prompt exposed by the MCP server.' });
	});

	const claudeAiSnippet = $derived.by(() => {
		const discovery = oauthDiscoveryUrl || 'https://api.example.com/.well-known/oauth-protected-resource';
		return [
			'Preset: Claude.ai',
			`OAuth Discovery URL: ${discovery}`,
			'Redirect URI: https://claude.ai/api/mcp/auth_callback',
			`Client ID: ${claudeAiClientId}`,
			`Client Secret: ${claudeAiClientSecret}`,
		].join('\n');
	});

	const claudeCodeSnippet = $derived.by(() => {
		const discovery = oauthDiscoveryUrl || 'https://api.example.com/.well-known/oauth-protected-resource';
		return [
			'Preset: Claude Code',
			`OAuth Discovery URL: ${discovery}`,
			'Redirect URI: http://localhost:8787/callback',
			`Client ID: ${claudeCodeClientId}`,
			`Client Secret: ${claudeCodeClientSecret}`,
		].join('\n');
	});

	const headlessSnippet = $derived.by(() => {
		const discovery = oauthDiscoveryUrl || 'https://api.example.com/.well-known/oauth-protected-resource';
		return [
			'Grant type: client_credentials',
			`OAuth Discovery URL: ${discovery}`,
			'Client redirect URI in MCP client: none',
			`Client ID: ${headlessClientId}`,
			`Client Secret: ${headlessClientSecret}`,
		].join('\n');
	});
</script>

<section class="page__notice">
	<div class="mcp-panel__header">
		<div>
			<h2>MCP connection</h2>
			<p class="mcp-panel__intro">
				Register an OAuth connector above for Claude.ai or any other hosted MCP client, then use the OAuth
				discovery URL and client credentials there. The MCP transport discovery document and direct endpoint stay
				available below for debugging only.
			</p>
		</div>
		<div class="mcp-panel__actions">
			<button
				type="button"
				class="gr-button gr-button--outline"
				onclick={() => {
					if (!transport) return;
					void refreshOAuthDiscovery(transport.oauthDiscoveryUrl);
					void refreshDiscovery(transport.discoveryUrl);
				}}
			>
				Refresh discovery checks
			</button>
			<button
				type="button"
				class="gr-button gr-button--outline"
				disabled={!activeCredential?.accessToken?.trim()}
				onclick={() =>
					activeCredential?.accessToken &&
					mcpEndpoint &&
					void refreshInspection(mcpEndpoint, activeCredential.accessToken.trim())
				}
			>
				Refresh live check
			</button>
		</div>
	</div>

	<article class="mcp-panel__setup">
		<div class="mcp-panel__status-header">
			<h3>Recommended setup</h3>
			<span class="gr-badge gr-badge--sm gr-badge--outlined gr-badge--success">OAuth first</span>
		</div>
		<ol class="mcp-panel__steps">
			<li>Use <strong>Add connector</strong> above to register an OAuth client for this agent.</li>
			<li>Copy the matching connector’s Client ID, Client Secret, and OAuth Discovery URL into your MCP client’s connector dialog.</li>
			<li>Authorize as the principal for this agent inside that MCP client.</li>
			<li>After OAuth completes, the connector session list above will show the active refresh-token session.</li>
		</ol>
		<p class="page__meta">
			{#if latestConnector}
				Latest connector <code>{latestConnector.name}</code> · client <code>{latestConnector.clientId}</code>
			{:else}
				No connector has been registered from this browser in the current session yet.
			{/if}
			· matched connector sessions {connectorSessionCount}
		</p>
	</article>

	<div class="mcp-panel__facts">
		<div class="mcp-panel__fact">
			<div class="settings-token__row">
				<strong>Endpoint URL</strong>
				<button type="button" class="gr-button gr-button--outline" onclick={() => mcpEndpoint && copy(mcpEndpoint)}>
					Copy
				</button>
			</div>
			<pre class="settings-token__value">{mcpEndpoint || 'Loading…'}</pre>
		</div>

		<div class="mcp-panel__fact">
			<div class="settings-token__row">
				<strong>OAuth Discovery</strong>
				<button
					type="button"
					class="gr-button gr-button--outline"
					onclick={() => oauthDiscoveryUrl && copy(oauthDiscoveryUrl)}
				>
					Copy
				</button>
			</div>
			<pre class="settings-token__value">{oauthDiscoveryUrl || 'Loading…'}</pre>
		</div>

		<div class="mcp-panel__fact">
			<div class="settings-token__row">
				<strong>MCP Transport Discovery</strong>
				<button
					type="button"
					class="gr-button gr-button--outline"
					onclick={() => mcpDiscoveryUrl && copy(mcpDiscoveryUrl)}
				>
					Copy
				</button>
			</div>
			<pre class="settings-token__value">{mcpDiscoveryUrl || 'Loading…'}</pre>
		</div>

		<div class="mcp-panel__fact">
			<div class="settings-token__row">
				<strong>Advanced auth header</strong>
				<button type="button" class="gr-button gr-button--outline" onclick={() => copy(authHeader)}>
					Copy
				</button>
			</div>
			<pre class="settings-token__value">{authHeader}</pre>
		</div>
	</div>

	<div class="settings-form__notice">
		OAuth connectors are the first-class setup path here. Use the OAuth discovery URL above for hosted MCP clients,
		then rely on the connector session health list on the agent page for day-to-day diagnostics. The advanced auth
		header and live inspection below are optional manual probes that use a lease token, not the normal setup flow.
	</div>

	<div class="mcp-panel__status-grid">
		<article class="mcp-panel__status">
			<div class="mcp-panel__status-header">
				<h3>Discovery status</h3>
				<span class={statusBadgeClass(discoveryOverviewStatus)}>{statusLabel(discoveryOverviewStatus)}</span>
			</div>
			<p class="page__meta">
				Public checks against <code>/.well-known/oauth-protected-resource</code> and
				<code>/.well-known/mcp.json</code>.
			</p>
			<div class="mcp-panel__status-copy">
				<strong>OAuth Discovery</strong>
				<span class={statusBadgeClass(oauthDiscoveryStatus)}>{statusLabel(oauthDiscoveryStatus)}</span>
				{#if formatCheckedAt(oauthDiscoveryCheckedAt)}
					<span> · last checked {formatCheckedAt(oauthDiscoveryCheckedAt)}</span>
				{/if}
			</div>
			{#if oauthDiscoveryStatus === 'ready'}
				<p class="mcp-panel__status-copy">
					{#if oauthDiscoverySummary.authorizationServers.length > 0}
						Authorization servers <strong>{oauthDiscoverySummary.authorizationServers.length}</strong>
					{:else}
						OAuth discovery responded
					{/if}
					{#if oauthDiscoverySummary.scopes.length > 0}
						· scopes <strong>{oauthDiscoverySummary.scopes.join(', ')}</strong>
					{/if}
				</p>
			{:else if oauthDiscoveryError}
				<p class="mcp-panel__status-copy">{oauthDiscoveryError}</p>
			{:else}
				<p class="mcp-panel__status-copy">Waiting for the OAuth protected-resource document.</p>
			{/if}

			<div class="mcp-panel__status-copy">
				<strong>MCP Transport Discovery</strong>
				<span class={statusBadgeClass(discoveryStatus)}>{statusLabel(discoveryStatus)}</span>
				{#if formatCheckedAt(discoveryCheckedAt)}
					<span> · last checked {formatCheckedAt(discoveryCheckedAt)}</span>
				{/if}
			</div>
			{#if discoveryStatus === 'ready'}
				<p class="mcp-panel__status-copy">
					Server advertises
					<strong>{discoveryCapabilities.tools ? 'tools' : 'no tools'}</strong>,
					<strong>{discoveryCapabilities.resources ? 'resources' : 'no resources'}</strong>, and
					<strong>{discoveryCapabilities.prompts ? 'prompts' : 'no prompts'}</strong>.
				</p>
			{:else if discoveryError}
				<p class="mcp-panel__status-copy">{discoveryError}</p>
			{:else}
				<p class="mcp-panel__status-copy">
					The page will keep showing the documented catalog below even before the MCP transport discovery check
					finishes.
				</p>
			{/if}
		</article>

		<article class="mcp-panel__status">
			<div class="mcp-panel__status-header">
				<h3>Authenticated inspection</h3>
				<span class={statusBadgeClass(inspectionStatus)}>{statusLabel(inspectionStatus)}</span>
			</div>
			{#if activeCredential}
				<p class="page__meta">
					{#if selectedLease}
						Lease <code>{selectedLease.id}</code> · status <code>{selectedLease.status}</code>
					{/if}
					· scope <code>{currentScope}</code>
					· label <code>{activeCredential.metaLabel}</code>
					{#if currentExpiry}
						· expires in {currentExpiry}s
					{/if}
					{#if formatCheckedAt(inspectionCheckedAt)}
						· last checked {formatCheckedAt(inspectionCheckedAt)}
					{/if}
				</p>
				{#if inspectionStatus === 'ready'}
					<p class="mcp-panel__status-copy">
						<code>initialize</code>, <code>tools/list</code>, and <code>agent://capabilities</code> all succeeded.
						{#if inspection?.sessionId}
							Session <code>{inspection.sessionId}</code>.
						{/if}
					</p>
				{:else if inspectionError}
					<p class="mcp-panel__status-copy">{inspectionError}</p>
					{#if isInsufficientScopeError(inspectionRawError)}
						<p class="mcp-panel__status-copy">
							The token's granted scopes do not cover this operation. Re-authorize the connector
							with the required scope{requiredScopeFromError(inspectionRawError) ? ` (${requiredScopeFromError(inspectionRawError)})` : ''} to
							resolve this. MCP clients should retry authorization no more than a few times to avoid loops.
						</p>
					{/if}
				{:else}
					<p class="mcp-panel__status-copy">
						This advanced lease token is ready. Run a live check to verify authenticated MCP access.
					</p>
				{/if}
			{:else}
				<p class="page__meta">No advanced inspection token is loaded yet.</p>
				<p class="mcp-panel__status-copy">
					{#if canManage}
						OAuth connectors above handle the normal hosted-client flow. Mint an advanced lease token below only
						if you want this page to run a direct authenticated MCP probe.
					{:else}
						Only the agent owner or an admin can run an authenticated MCP inspection from this page.
					{/if}
				</p>
			{/if}
		</article>
	</div>

	<div class="mcp-panel__snippet-grid">
		<article class="mcp-panel__snippet">
			<div class="settings-token__row">
				<strong>Claude.ai preset</strong>
				<button type="button" class="gr-button gr-button--outline" onclick={() => copy(claudeAiSnippet)}>
					Copy
				</button>
			</div>
			<pre class="settings-token__value">{claudeAiSnippet}</pre>
			<p class="page__meta">
				Register a dedicated Claude.ai connector above, then paste these values into Claude.ai’s MCP connector dialog.
			</p>
		</article>

		<article class="mcp-panel__snippet">
			<div class="settings-token__row">
				<strong>Claude Code preset</strong>
				<button type="button" class="gr-button gr-button--outline" onclick={() => copy(claudeCodeSnippet)}>
					Copy
				</button>
			</div>
			<pre class="settings-token__value">{claudeCodeSnippet}</pre>
			<p class="page__meta">
				Register a dedicated Claude Code connector above, then use these values in the local MCP connector setup.
			</p>
		</article>

		<article class="mcp-panel__snippet">
			<div class="settings-token__row">
				<strong>Headless connector</strong>
				<button type="button" class="gr-button gr-button--outline" onclick={() => copy(headlessSnippet)}>
					Copy
				</button>
			</div>
			<pre class="settings-token__value">{headlessSnippet}</pre>
			<p class="page__meta">
				Use this when the connector above is registered with the <code>client_credentials</code> grant for a
				service-style MCP client.
			</p>
		</article>
	</div>

	<div class="mcp-panel__catalog">
		<div class="mcp-panel__catalog-header">
			<div>
				<h3>MCP tool catalog</h3>
				<p class="page__meta">
					{#if inspection?.tools.length}
						Live from the current lease token.
					{:else if discoveryDoc?.tools?.length}
						Live from the public discovery document.
					{:else}
						Expected catalog from the checked-in <code>lesser-body</code> server implementation.
					{/if}
				</p>
			</div>
			{#if !canManage}
				<p class="page__meta">Only the owner or an admin can manage leases here, but discovery stays public.</p>
			{/if}
		</div>

		<ul class="mcp-panel__tool-list">
			{#each displayedTools as tool (tool.name)}
				<li class="mcp-panel__tool">
					<div class="mcp-panel__tool-header">
						<div class="mcp-panel__tool-title">
							<code>{tool.name}</code>
							<span class="gr-badge gr-badge--sm gr-badge--outlined gr-badge--gray">{tool.category}</span>
							<span class={`gr-badge gr-badge--sm gr-badge--outlined gr-badge--${tool.scope === 'write' ? 'warning' : 'info'}`}>
								{tool.scope}
							</span>
						</div>
						<span class="mcp-panel__tool-source">{tool.source}</span>
					</div>
					<p>{tool.description}</p>
				</li>
			{/each}
		</ul>
	</div>

	<div class="mcp-panel__extras">
		<article class="mcp-panel__extra">
			<h3>Resources</h3>
			<ul class="mcp-panel__chip-list">
				{#each displayedResources as resource (resource.uri)}
					<li class="mcp-panel__chip">
						<code>{resource.uri}</code>
						<span>{resource.title}</span>
					</li>
				{/each}
			</ul>
		</article>

		<article class="mcp-panel__extra">
			<h3>Prompts</h3>
			<ul class="mcp-panel__chip-list">
				{#each displayedPrompts as prompt (prompt.name)}
					<li class="mcp-panel__chip">
						<code>{prompt.name}</code>
						<span>{prompt.description}</span>
					</li>
				{/each}
			</ul>
		</article>
	</div>
</section>

<style>
	.mcp-panel__header,
	.mcp-panel__catalog-header,
	.mcp-panel__status-header,
	.mcp-panel__tool-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--gr-spacing-scale-3);
	}

	.mcp-panel__intro,
	.mcp-panel__status-copy {
		margin: var(--gr-spacing-scale-2) 0 0;
		color: var(--gr-semantic-foreground-secondary);
	}

	.mcp-panel__actions,
	.mcp-panel__tool-title {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gr-spacing-scale-2);
	}

	.mcp-panel__facts,
	.mcp-panel__setup,
	.mcp-panel__status-grid,
	.mcp-panel__snippet-grid,
	.mcp-panel__extras {
		display: grid;
		gap: var(--gr-spacing-scale-4);
		margin-top: var(--gr-spacing-scale-4);
	}

	.mcp-panel__facts,
	.mcp-panel__status-grid,
	.mcp-panel__extras {
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
	}

	.mcp-panel__snippet-grid {
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
	}

	.mcp-panel__fact,
	.mcp-panel__setup,
	.mcp-panel__status,
	.mcp-panel__snippet,
	.mcp-panel__extra,
	.mcp-panel__tool {
		padding: var(--gr-spacing-scale-4);
		border-radius: var(--gr-radii-lg);
		border: 1px solid var(--gr-semantic-border-default);
		background: var(--gr-semantic-background-base);
	}

	.mcp-panel__catalog {
		margin-top: var(--gr-spacing-scale-4);
	}

	.mcp-panel__tool-list,
	.mcp-panel__chip-list {
		list-style: none;
		padding: 0;
		margin: var(--gr-spacing-scale-4) 0 0;
		display: flex;
		flex-direction: column;
		gap: var(--gr-spacing-scale-3);
	}

	.mcp-panel__tool p,
	.mcp-panel__chip {
		margin: 0;
	}

	.mcp-panel__tool-source {
		text-transform: capitalize;
		color: var(--gr-semantic-foreground-secondary);
		font-size: var(--gr-typography-fontSize-sm);
	}

	.mcp-panel__steps {
		margin: var(--gr-spacing-scale-3) 0 0;
		padding-left: 1.25rem;
		display: grid;
		gap: var(--gr-spacing-scale-2);
	}

	.mcp-panel__chip {
		display: flex;
		flex-direction: column;
		gap: var(--gr-spacing-scale-1);
		padding: var(--gr-spacing-scale-3);
		border-radius: var(--gr-radii-md);
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.03);
	}

	@media (max-width: 720px) {
		.mcp-panel__header,
		.mcp-panel__catalog-header,
		.mcp-panel__status-header,
		.mcp-panel__tool-header {
			flex-direction: column;
		}
	}
</style>
