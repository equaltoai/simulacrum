export type McpToolScope = 'read' | 'write';
export type McpToolCategory = 'Core' | 'Social' | 'Communication' | 'Identity' | 'Memory';

export type KnownMcpTool = {
	name: string;
	description: string;
	scope: McpToolScope;
	category: McpToolCategory;
};

export type McpResourceHint = {
	uri: string;
	title: string;
};

export type McpPromptHint = {
	name: string;
	description: string;
};

export type McpTransportConfig = {
	apiOrigin: string;
	endpoint: string;
	discoveryUrl: string;
	oauthDiscoveryUrl: string;
	resource: string;
};

export type McpWellKnownToolHint = {
	name?: string;
	description?: string;
};

export type McpWellKnownDocument = {
	name?: string;
	version?: string;
	endpoint?: string;
	capabilities?: {
		tools?: boolean;
		resources?: boolean;
		prompts?: boolean;
	};
	auth?: {
		type?: string;
		scopes?: string[];
		notes?: string;
	};
	tools?: McpWellKnownToolHint[];
};

export type OAuthProtectedResourceDocument = {
	resource?: string;
	authorization_servers?: string[];
	scopes_supported?: string[];
	bearer_methods_supported?: string[];
};

export type McpToolDefinition = {
	name: string;
	description?: string;
	inputSchema?: unknown;
};

export type McpCapabilitiesSnapshot = {
	scopes: string[];
	tools: string[];
	resources: string[];
	prompts: string[];
};

export type McpInspection = {
	sessionId: string | null;
	tools: McpToolDefinition[];
	capabilities: McpCapabilitiesSnapshot;
};

export type WwwAuthenticateChallenge = {
	scheme: string;
	realm?: string;
	scope?: string;
	error?: string;
	errorDescription?: string;
	resourceMetadata?: string;
};

export function parseWwwAuthenticate(header: string | null): WwwAuthenticateChallenge | null {
	if (!header) return null;
	const trimmed = header.trim();
	if (!trimmed) return null;

	const spaceIndex = trimmed.indexOf(' ');
	if (spaceIndex === -1) return { scheme: trimmed };

	const scheme = trimmed.slice(0, spaceIndex);
	const paramsString = trimmed.slice(spaceIndex + 1);

	const challenge: WwwAuthenticateChallenge = { scheme };
	const paramPattern = /(\w+)="([^"]*?)"/g;
	let match: RegExpExecArray | null;

	while ((match = paramPattern.exec(paramsString)) !== null) {
		const [, key, value] = match;
		switch (key) {
			case 'realm':
				challenge.realm = value;
				break;
			case 'scope':
				challenge.scope = value;
				break;
			case 'error':
				challenge.error = value;
				break;
			case 'error_description':
				challenge.errorDescription = value;
				break;
			case 'resource_metadata':
				challenge.resourceMetadata = value;
				break;
		}
	}

	return challenge;
}

export class McpClientError extends Error {
	readonly status?: number;
	readonly code?: number | string;
	readonly details?: unknown;
	readonly challenge?: WwwAuthenticateChallenge;

	constructor(
		message: string,
		options: {
			status?: number;
			code?: number | string;
			details?: unknown;
			challenge?: WwwAuthenticateChallenge;
		} = {}
	) {
		super(message);
		this.name = 'McpClientError';
		this.status = options.status;
		this.code = options.code;
		this.details = options.details;
		this.challenge = options.challenge;
	}
}

export const KNOWN_MCP_TOOLS: KnownMcpTool[] = [
	{
		name: 'echo',
		description: 'Echo back the provided message.',
		scope: 'read',
		category: 'Core',
	},
	{
		name: 'profile_read',
		description: "Read the authenticated agent's profile.",
		scope: 'read',
		category: 'Social',
	},
	{
		name: 'timeline_read',
		description: 'Read from home, local, or federated timeline.',
		scope: 'read',
		category: 'Social',
	},
	{
		name: 'post_search',
		description: 'Search posts.',
		scope: 'read',
		category: 'Social',
	},
	{
		name: 'followers_list',
		description: "List the agent's followers.",
		scope: 'read',
		category: 'Social',
	},
	{
		name: 'following_list',
		description: 'List accounts the agent follows.',
		scope: 'read',
		category: 'Social',
	},
	{
		name: 'notifications_read',
		description: 'Read recent notifications.',
		scope: 'read',
		category: 'Social',
	},
	{
		name: 'post_create',
		description: 'Create a new post.',
		scope: 'write',
		category: 'Social',
	},
	{
		name: 'post_boost',
		description: 'Boost/reblog a post.',
		scope: 'write',
		category: 'Social',
	},
	{
		name: 'post_favorite',
		description: 'Favorite a post.',
		scope: 'write',
		category: 'Social',
	},
	{
		name: 'follow',
		description: 'Follow an account.',
		scope: 'write',
		category: 'Social',
	},
	{
		name: 'unfollow',
		description: 'Unfollow an account.',
		scope: 'write',
		category: 'Social',
	},
	{
		name: 'profile_update',
		description: 'Update display name, bio, and avatar (best-effort).',
		scope: 'write',
		category: 'Social',
	},
	{
		name: 'email_send',
		description: "Send an email from the agent's address via lesser-host (no provider credentials).",
		scope: 'write',
		category: 'Communication',
	},
	{
		name: 'email_read',
		description: "Read recent emails delivered to the agent's inbox.",
		scope: 'read',
		category: 'Communication',
	},
	{
		name: 'email_search',
		description: "Search the agent's email (inbox abstraction).",
		scope: 'read',
		category: 'Communication',
	},
	{
		name: 'email_reply',
		description: 'Reply to a specific email message.',
		scope: 'write',
		category: 'Communication',
	},
	{
		name: 'email_delete',
		description: 'Delete or archive an email message.',
		scope: 'write',
		category: 'Communication',
	},
	{
		name: 'sms_send',
		description: "Send an SMS from the agent's number via lesser-host, including threaded replies.",
		scope: 'write',
		category: 'Communication',
	},
	{
		name: 'sms_read',
		description: 'Read received SMS messages delivered to the instance.',
		scope: 'read',
		category: 'Communication',
	},
	{
		name: 'phone_call',
		description: 'Request an outbound voice call via lesser-host; older hosts may return a host gap error.',
		scope: 'write',
		category: 'Communication',
	},
	{
		name: 'voicemail_read',
		description: 'Read voicemail transcriptions delivered to the instance.',
		scope: 'read',
		category: 'Communication',
	},
	{
		name: 'identity_whoami',
		description: "Return this agent's full identity including communication channels and preferences.",
		scope: 'read',
		category: 'Identity',
	},
	{
		name: 'identity_lookup',
		description: 'Look up an agent by ENS name, agentId, or email address.',
		scope: 'read',
		category: 'Identity',
	},
	{
		name: 'identity_verify',
		description: 'Verify that a recent communication matches a resolved soul identity.',
		scope: 'read',
		category: 'Identity',
	},
	{
		name: 'memory_append',
		description: "Append a memory event to the authenticated agent's memory timeline.",
		scope: 'write',
		category: 'Memory',
	},
	{
		name: 'memory_query',
		description: 'Query memory events for the authenticated agent.',
		scope: 'read',
		category: 'Memory',
	},
];

export const KNOWN_MCP_RESOURCES: McpResourceHint[] = [
	{ uri: 'agent://profile', title: 'Agent profile' },
	{ uri: 'agent://timeline/home', title: 'Home timeline' },
	{ uri: 'agent://timeline/local', title: 'Local timeline' },
	{ uri: 'agent://followers', title: 'Followers' },
	{ uri: 'agent://following', title: 'Following' },
	{ uri: 'agent://notifications', title: 'Notifications' },
	{ uri: 'agent://channels', title: 'Communication channels' },
	{ uri: 'agent://channels/preferences', title: 'Channel preferences' },
	{ uri: 'agent://email/inbox', title: 'Email inbox' },
	{ uri: 'agent://email/sent', title: 'Sent email' },
	{ uri: 'agent://sms/messages', title: 'SMS messages' },
	{ uri: 'agent://voicemail', title: 'Voicemail' },
	{ uri: 'agent://memory/recent', title: 'Recent memory events' },
	{ uri: 'agent://capabilities', title: 'Capabilities (best-effort)' },
	{ uri: 'agent://config', title: 'Instance configuration (non-sensitive)' },
];

export const KNOWN_MCP_PROMPTS: McpPromptHint[] = [
	{ name: 'compose_post', description: "Compose a post in the agent's voice." },
	{ name: 'summarize_timeline', description: 'Summarize recent timeline activity.' },
	{ name: 'draft_reply', description: 'Draft a reply to a specific post.' },
	{ name: 'reputation_report', description: 'Generate a human-readable reputation summary (best-effort).' },
	{ name: 'memory_reflect', description: 'Reflect on recent memory events to identify patterns.' },
	{ name: 'compose_email', description: 'Compose an email while respecting boundaries and preferences.' },
	{
		name: 'handle_inbound',
		description: 'Handle an inbound email, SMS, or voicemail while respecting boundaries and preferences.',
	},
	{
		name: 'respect_preferences',
		description: 'Choose how to contact a target agent based on their declared contact preferences.',
	},
];

function isLocalHostname(hostname: string): boolean {
	return (
		hostname === 'localhost' ||
		hostname === '127.0.0.1' ||
		hostname === '[::1]' ||
		hostname.endsWith('.localhost')
	);
}

function trimString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values: unknown): string[] {
	if (!Array.isArray(values)) return [];
	return [...new Set(values.map(trimString).filter(Boolean))];
}

async function parseResponseBody(response: Response): Promise<unknown> {
	const text = await response.text();
	if (!text) return null;

	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

function errorMessage(payload: unknown, fallback: string): string {
	if (typeof payload === 'string' && payload.trim()) {
		return payload.trim();
	}

	if (payload && typeof payload === 'object') {
		const message = trimString((payload as { message?: unknown }).message);
		if (message) return message;

		const error = (payload as { error?: unknown }).error;
		if (error && typeof error === 'object') {
			const rpcMessage = trimString((error as { message?: unknown }).message);
			if (rpcMessage) return rpcMessage;
		}
	}

	return fallback;
}

type JsonRpcEnvelope<T> = {
	result?: T;
	error?: {
		code?: number;
		message?: string;
		data?: unknown;
	};
};

export function resolveMcpTransport(origin: string, actor?: string): McpTransportConfig {
	const url = new URL(origin);

	let apiOrigin = origin;
	if (!isLocalHostname(url.hostname) && !url.hostname.startsWith('api.')) {
		const apiHost = `api.${url.hostname}`;
		apiOrigin = `${url.protocol}//${apiHost}${url.port ? `:${url.port}` : ''}`;
	}

	const mcpPath = actor ? `/mcp/${encodeURIComponent(actor)}` : '/mcp';
	const endpoint = new URL(mcpPath, `${apiOrigin}/`).toString();
	const oauthDiscoveryPath = actor
		? `/.well-known/oauth-protected-resource${mcpPath}`
		: '/.well-known/oauth-protected-resource';

	return {
		apiOrigin,
		endpoint,
		discoveryUrl: new URL('/.well-known/mcp.json', `${apiOrigin}/`).toString(),
		oauthDiscoveryUrl: new URL(oauthDiscoveryPath, `${apiOrigin}/`).toString(),
		resource: endpoint,
	};
}

export function knownToolMap(): Map<string, KnownMcpTool> {
	return new Map(KNOWN_MCP_TOOLS.map((tool) => [tool.name, tool]));
}

export async function fetchMcpWellKnown(discoveryUrl: string, signal?: AbortSignal): Promise<McpWellKnownDocument> {
	const response = await fetch(discoveryUrl, {
		headers: {
			accept: 'application/json',
		},
		signal,
	});
	const payload = await parseResponseBody(response);

	if (!response.ok) {
		throw new McpClientError(errorMessage(payload, `MCP discovery failed (${response.status})`), {
			status: response.status,
			details: payload,
		});
	}

	return (payload ?? {}) as McpWellKnownDocument;
}

export async function fetchOAuthProtectedResource(
	oauthDiscoveryUrl: string,
	signal?: AbortSignal
): Promise<OAuthProtectedResourceDocument> {
	const response = await fetch(oauthDiscoveryUrl, {
		headers: {
			accept: 'application/json',
		},
		signal,
	});
	const payload = await parseResponseBody(response);

	if (!response.ok) {
		throw new McpClientError(errorMessage(payload, `OAuth discovery failed (${response.status})`), {
			status: response.status,
			details: payload,
		});
	}

	return (payload ?? {}) as OAuthProtectedResourceDocument;
}

async function requestMcpRpc<T>({
	endpoint,
	token,
	method,
	params,
	sessionId,
	signal,
}: {
	endpoint: string;
	token: string;
	method: string;
	params?: Record<string, unknown>;
	sessionId?: string;
	signal?: AbortSignal;
}): Promise<{ result: T; sessionId: string | null }> {
	const headers = new Headers({
		accept: 'application/json',
		authorization: `Bearer ${token}`,
		'content-type': 'application/json',
	});
	if (sessionId) headers.set('mcp-session-id', sessionId);

	const response = await fetch(endpoint, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method,
			...(params ? { params } : {}),
		}),
		signal,
	});
	const payload = await parseResponseBody(response);

	if (!response.ok) {
		const challenge =
			response.status === 401 || response.status === 403
				? parseWwwAuthenticate(response.headers.get('www-authenticate')) ?? undefined
				: undefined;

		const fallback =
			response.status === 401
				? challenge?.errorDescription || 'Authentication required. Re-authorize with the requested scope.'
				: response.status === 403 && challenge?.error === 'insufficient_scope'
					? challenge.errorDescription ||
						`Insufficient scope. The server requires: ${challenge.scope || 'additional scopes'}.`
					: `MCP ${method} failed (${response.status})`;

		throw new McpClientError(errorMessage(payload, fallback), {
			status: response.status,
			details: payload,
			challenge,
		});
	}

	if (!payload || typeof payload !== 'object') {
		throw new McpClientError(`MCP ${method} returned an invalid response.`);
	}

	const rpc = payload as JsonRpcEnvelope<T>;
	if (rpc.error) {
		throw new McpClientError(trimString(rpc.error.message) || `MCP ${method} failed.`, {
			status: response.status,
			code: rpc.error.code,
			details: rpc.error.data,
		});
	}

	return {
		result: (rpc.result ?? {}) as T,
		sessionId: response.headers.get('mcp-session-id'),
	};
}

function parseCapabilities(result: { contents?: Array<{ text?: string }> }): McpCapabilitiesSnapshot {
	const text = result.contents?.find((content) => trimString(content?.text))?.text;
	if (!text) {
		return {
			scopes: [],
			tools: [],
			resources: [],
			prompts: [],
		};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new McpClientError('MCP capabilities returned invalid JSON.');
	}

	return {
		scopes: uniqueStrings((parsed as { scopes?: unknown }).scopes),
		tools: uniqueStrings((parsed as { tools?: unknown }).tools),
		resources: uniqueStrings((parsed as { resources?: unknown }).resources),
		prompts: uniqueStrings((parsed as { prompts?: unknown }).prompts),
	};
}

export async function inspectMcpServer({
	endpoint,
	token,
	signal,
}: {
	endpoint: string;
	token: string;
	signal?: AbortSignal;
}): Promise<McpInspection> {
	const initialized = await requestMcpRpc<Record<string, unknown>>({
		endpoint,
		token,
		method: 'initialize',
		signal,
	});

	const listed = await requestMcpRpc<{ tools?: Array<{ name?: string; description?: string; inputSchema?: unknown }> }>({
		endpoint,
		token,
		method: 'tools/list',
		sessionId: initialized.sessionId ?? undefined,
		signal,
	});

	const capabilities = await requestMcpRpc<{ contents?: Array<{ text?: string }> }>({
		endpoint,
		token,
		method: 'resources/read',
		params: { uri: 'agent://capabilities' },
		sessionId: listed.sessionId ?? initialized.sessionId ?? undefined,
		signal,
	});

	const tools = Array.isArray(listed.result.tools)
		? listed.result.tools
				.map((tool) => ({
					name: trimString(tool?.name),
					description: trimString(tool?.description) || undefined,
					inputSchema: tool?.inputSchema,
				}))
				.filter((tool) => tool.name)
		: [];

	return {
		sessionId: capabilities.sessionId ?? listed.sessionId ?? initialized.sessionId,
		tools,
		capabilities: parseCapabilities(capabilities.result),
	};
}

export function isInsufficientScopeError(error: unknown): boolean {
	return (
		error instanceof McpClientError &&
		error.status === 403 &&
		error.challenge?.error === 'insufficient_scope'
	);
}

export function requiredScopeFromError(error: unknown): string | null {
	if (error instanceof McpClientError && error.challenge?.scope) {
		return error.challenge.scope;
	}
	return null;
}

export function describeMcpError(error: unknown): string {
	if (error instanceof McpClientError) {
		if (error.challenge?.scope && error.status === 401) {
			return `${error.message} Required scope: ${error.challenge.scope}`;
		}
		if (error.challenge?.error === 'insufficient_scope' && error.challenge.scope) {
			return `${error.message} Required scope: ${error.challenge.scope}`;
		}
		return error.message;
	}
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
