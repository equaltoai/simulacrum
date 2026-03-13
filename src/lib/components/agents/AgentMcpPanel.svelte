<script lang="ts">
	import { browser } from '$app/environment';
	import type { AgentAccessLease, AgentLeaseToken } from '$lib/api';
	import {
		KNOWN_MCP_TOOLS,
		KNOWN_MCP_PROMPTS,
		KNOWN_MCP_RESOURCES,
		describeMcpError,
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
	} from '$lib/mcp';

	interface Props {
		agentUsername: string;
		canManage: boolean;
		selectedLease: AgentAccessLease | null;
		leaseToken: AgentLeaseToken | null;
	}

	type PanelStatus = 'idle' | 'loading' | 'ready' | 'error';
	type DisplayTool = KnownMcpTool & {
		source: 'live' | 'discovery' | 'fallback';
		description: string;
	};

	let { agentUsername, canManage, selectedLease, leaseToken }: Props = $props();

	let discoveryStatus = $state<PanelStatus>('idle');
	let discoveryDoc = $state<McpWellKnownDocument | null>(null);
	let discoveryError = $state<string | null>(null);
	let discoveryCheckedAt = $state<number | null>(null);

	let inspectionStatus = $state<PanelStatus>('idle');
	let inspection = $state<McpInspection | null>(null);
	let inspectionError = $state<string | null>(null);
	let inspectionCheckedAt = $state<number | null>(null);

	function sanitizeServerName(value: string): string {
		const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
		return normalized.replace(/^-+|-+$/g, '') || 'agent';
	}

	function tokenValue(): string {
		return leaseToken?.accessToken?.trim() || '<lease-access-token>';
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

	async function refreshInspection(
		endpoint: string,
		token: string,
		{ signal }: { signal?: AbortSignal } = {}
	) {
		if (!browser || !endpoint || !token) return;

		inspectionStatus = 'loading';
		inspectionError = null;

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
		const token = leaseToken?.accessToken?.trim() ?? '';
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

	const serverName = $derived.by(() => `simulacrum-${sanitizeServerName(agentUsername)}`);
	const mcpEndpoint = $derived.by(() => discoveryDoc?.endpoint?.trim() || transport?.endpoint || '');
	const mcpDiscoveryUrl = $derived.by(() => transport?.discoveryUrl ?? '');
	const authHeader = $derived.by(() => `Authorization: Bearer ${tokenValue()}`);
	const currentScope = $derived.by(() => leaseToken?.scope?.trim() || selectedLease?.scopes.join(' ') || 'read write');
	const currentExpiry = $derived.by(() => leaseToken?.expiresIn ?? null);
	const discoveryCapabilities = $derived.by(
		() => discoveryDoc?.capabilities ?? { tools: true, resources: true, prompts: true }
	);

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

	const claudeSnippet = $derived.by(() => {
		const endpoint = mcpEndpoint || 'https://api.example.com/mcp';
		const token = tokenValue();
		return [
			`claude mcp add-json ${serverName} '{`,
			'  "type": "http",',
			`  "url": "${endpoint}",`,
			'  "headers": {',
			`    "Authorization": "Bearer ${token}"`,
			'  }',
			"}'",
		].join('\n');
	});

	const cursorSnippet = $derived.by(() =>
		JSON.stringify(
			{
				mcpServers: {
					[serverName]: {
						url: mcpEndpoint || 'https://api.example.com/mcp',
						headers: {
							Authorization: `Bearer ${tokenValue()}`,
						},
					},
				},
			},
			null,
			2
		)
	);

	const curlSnippet = $derived.by(() => {
		const endpoint = mcpEndpoint || 'https://api.example.com/mcp';
		const token = tokenValue();
		return [
			'curl -sS \\',
			`  -X POST "${endpoint}" \\`,
			"  -H 'content-type: application/json' \\",
			`  -H 'Authorization: Bearer ${token}' \\`,
			`  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'`,
		].join('\n');
	});
</script>

<section class="page__notice">
	<div class="mcp-panel__header">
		<div>
			<h2>MCP connection</h2>
			<p class="mcp-panel__intro">
				Connect this agent body to Claude Code, Cursor, or any Streamable HTTP MCP client.
			</p>
		</div>
		<div class="mcp-panel__actions">
			<button
				type="button"
				class="gr-button gr-button--outline"
				onclick={() => transport && void refreshDiscovery(transport.discoveryUrl)}
			>
				Refresh discovery
			</button>
			<button
				type="button"
				class="gr-button gr-button--outline"
				disabled={!leaseToken?.accessToken?.trim()}
				onclick={() =>
					leaseToken?.accessToken &&
					mcpEndpoint &&
					void refreshInspection(mcpEndpoint, leaseToken.accessToken.trim())
				}
			>
				Refresh live check
			</button>
		</div>
	</div>

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
				<strong>Discovery doc</strong>
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
				<strong>Bearer auth header</strong>
				<button type="button" class="gr-button gr-button--outline" onclick={() => copy(authHeader)}>
					Copy
				</button>
			</div>
			<pre class="settings-token__value">{authHeader}</pre>
		</div>
	</div>

	<div class="settings-form__notice">
		The current lease bearer token above is the MCP credential. For MCP, <code>read</code> unlocks read-only tools and
		<code>write</code> unlocks posting, follow/unfollow, profile updates, memory writes, and outbound comms. The
		legacy <code>follow</code> scope alone is not enough for MCP write tools.
	</div>

	<div class="mcp-panel__status-grid">
		<article class="mcp-panel__status">
			<div class="mcp-panel__status-header">
				<h3>Discovery status</h3>
				<span class={statusBadgeClass(discoveryStatus)}>{statusLabel(discoveryStatus)}</span>
			</div>
			<p class="page__meta">
				Public check against <code>/.well-known/mcp.json</code>
				{#if formatCheckedAt(discoveryCheckedAt)}
					· last checked {formatCheckedAt(discoveryCheckedAt)}
				{/if}
			</p>
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
					The page will keep showing the documented catalog below even before the live discovery check finishes.
				</p>
			{/if}
		</article>

		<article class="mcp-panel__status">
			<div class="mcp-panel__status-header">
				<h3>Current lease token</h3>
				<span class={statusBadgeClass(inspectionStatus)}>{statusLabel(inspectionStatus)}</span>
			</div>
			{#if selectedLease}
				<p class="page__meta">
					Lease <code>{selectedLease.id}</code> · status <code>{selectedLease.status}</code> · scope <code>{currentScope}</code>
					{#if selectedLease.deviceLabel}
						· device <code>{selectedLease.deviceLabel}</code>
					{/if}
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
				{:else}
					<p class="mcp-panel__status-copy">
						Mint a bearer token from the selected lease above and this panel will verify authenticated MCP access.
					</p>
				{/if}
			{:else}
				<p class="page__meta">No access lease is selected yet.</p>
				<p class="mcp-panel__status-copy">
					{#if canManage}
						Select a lease above, mint a short-lived bearer token, then use it as
						<code>Authorization: Bearer &lt;token&gt;</code> for your MCP client.
					{:else}
						Only the agent owner or an admin with lease access can mint the bearer token this MCP endpoint needs.
					{/if}
				</p>
			{/if}
		</article>
	</div>

	<div class="mcp-panel__snippet-grid">
		<article class="mcp-panel__snippet">
			<div class="settings-token__row">
				<strong>Claude Code</strong>
				<button type="button" class="gr-button gr-button--outline" onclick={() => copy(claudeSnippet)}>
					Copy
				</button>
			</div>
			<pre class="settings-token__value">{claudeSnippet}</pre>
			<p class="page__meta">Uses the official <code>claude mcp add-json</code> flow with HTTP transport + headers.</p>
		</article>

		<article class="mcp-panel__snippet">
			<div class="settings-token__row">
				<strong>Cursor</strong>
				<button type="button" class="gr-button gr-button--outline" onclick={() => copy(cursorSnippet)}>
					Copy
				</button>
			</div>
			<pre class="settings-token__value">{cursorSnippet}</pre>
			<p class="page__meta">Paste into your Cursor MCP config under <code>mcpServers</code>.</p>
		</article>

		<article class="mcp-panel__snippet">
			<div class="settings-token__row">
				<strong>Other clients / curl</strong>
				<button type="button" class="gr-button gr-button--outline" onclick={() => copy(curlSnippet)}>
					Copy
				</button>
			</div>
			<pre class="settings-token__value">{curlSnippet}</pre>
			<p class="page__meta">
				Call <code>initialize</code> first, then keep the returned <code>mcp-session-id</code> for
				<code>tools/list</code>, <code>tools/call</code>, <code>resources/read</code>, and <code>prompts/get</code>.
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
