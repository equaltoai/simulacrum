<script lang="ts">
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import {
		api,
		type Agent,
		type AgentAccessLease,
		type AgentAccessLeaseChallenge,
		type AgentConnectorClientPreset,
		type AgentConnectorGrantProfile,
		type AgentActivityConnection,
		type AgentConnectorRegistration,
		type AgentConnectorRotationStatus,
		type AgentLeaseToken,
		type AgentRuntimeSession,
		type LinkedWallet,
		type SoulInventoryItem,
	} from '$lib/api';
	import {
		clearStoredLeaseSessionKey,
		clearStoredLeaseToken,
		generateStoredLeaseSessionKey,
		readStoredLeaseSessionKey,
		readStoredLeaseToken,
		signLeaseSessionMessage,
		signLeaseTypedDataWithWallet,
		type StoredLeaseSessionKey,
		WalletSwitchRequiredError,
		writeStoredLeaseSessionKey,
		writeStoredLeaseToken,
	} from '$lib/agents/accessLease';
	import { authSession } from '$lib/auth/session';
	import { hasAdminScope } from '$lib/auth/scopes';
	import AgentMcpPanel from '$lib/components/agents/AgentMcpPanel.svelte';
	import { resolveMcpTransport } from '$lib/mcp';
	import { getAccounts, getInjectedProvider } from '$lib/tips';
	import type { Account } from '$lib/types';
	import { getStreamingAdapter } from '$lib/realtime/adapter';
	import type { AgentType } from '$lib/greater/adapters/graphql';

	const AGENT_TYPES: Array<{ value: AgentType; label: string }> = [
		{ value: 'ASSISTANT', label: 'Assistant' },
		{ value: 'CURATOR', label: 'Curator' },
		{ value: 'MODERATOR', label: 'Moderator' },
		{ value: 'RESEARCHER', label: 'Researcher' },
		{ value: 'BRIDGE', label: 'Bridge' },
		{ value: 'CUSTOM', label: 'Custom' },
	];

	const CLAUDE_AI_REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
	const CLAUDE_CODE_REDIRECT_URI = 'http://localhost:8787/callback';
	const HEADLESS_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';
	const CONNECTOR_SESSION_EXPIRING_SOON_MS = 6 * 60 * 60 * 1000;
	const CONNECTOR_CLIENT_PRESETS: Array<{
		value: Exclude<AgentConnectorClientPreset, 'headless'>;
		label: string;
	}> = [
		{ value: 'claude_ai', label: 'Claude.ai' },
		{ value: 'claude_code', label: 'Claude Code' },
		{ value: 'custom', label: 'Custom' },
	];

	function formatAgentType(value: AgentType) {
		return AGENT_TYPES.find((entry) => entry.value === value)?.label ?? value;
	}

	function isConnectorGrantProfile(value: unknown): value is AgentConnectorGrantProfile {
		return value === 'authorization_code' || value === 'client_credentials';
	}

	function isConnectorClientPreset(value: unknown): value is AgentConnectorClientPreset {
		return value === 'claude_ai' || value === 'claude_code' || value === 'custom' || value === 'headless';
	}

	function connectorGrantTypes(profile: AgentConnectorGrantProfile): string[] {
		return profile === 'client_credentials'
			? ['client_credentials']
			: ['authorization_code', 'refresh_token'];
	}

	function connectorGrantProfileLabel(profile: AgentConnectorGrantProfile): string {
		return profile === 'client_credentials' ? 'Client credentials' : 'Authorization code';
	}

	function connectorClientPresetLabel(preset: AgentConnectorClientPreset): string {
		switch (preset) {
			case 'claude_ai':
				return 'Claude.ai';
			case 'claude_code':
				return 'Claude Code';
			case 'headless':
				return 'Headless connector';
			default:
				return 'Custom client';
		}
	}

	function formatGrantTypes(grantTypes: readonly string[]): string {
		return grantTypes.join(', ') || 'authorization_code, refresh_token';
	}

	function defaultConnectorRedirectUriForPreset(
		preset: Exclude<AgentConnectorClientPreset, 'headless'>
	): string {
		if (preset === 'claude_ai') return CLAUDE_AI_REDIRECT_URI;
		if (preset === 'claude_code') return CLAUDE_CODE_REDIRECT_URI;
		return '';
	}

	function inferConnectorGrantProfile(grantTypes: readonly string[] = []): AgentConnectorGrantProfile {
		return grantTypes.includes('client_credentials') ? 'client_credentials' : 'authorization_code';
	}

	function inferConnectorClientPreset({
		redirectUri,
		grantProfile,
	}: {
		redirectUri: string;
		grantProfile: AgentConnectorGrantProfile;
	}): AgentConnectorClientPreset {
		if (grantProfile === 'client_credentials' || redirectUri === HEADLESS_REDIRECT_URI) {
			return 'headless';
		}

		const normalized = redirectUri.trim().toLowerCase();
		if (normalized === CLAUDE_AI_REDIRECT_URI) return 'claude_ai';
		if (
			normalized.startsWith('http://localhost:') ||
			normalized.startsWith('http://127.0.0.1:') ||
			normalized.startsWith('https://localhost:') ||
			normalized.startsWith('https://127.0.0.1:')
		) {
			return 'claude_code';
		}
		return 'custom';
	}

	function profileHref(username: string, domain?: string | null) {
		const acct = domain ? `${username}@${domain}` : username;
		return `${base}/profile/${encodeURIComponent(acct)}`;
	}

	function normalizeUsername(value?: string | null) {
		const trimmed = value?.trim();
		if (!trimmed) return '';
		return trimmed.replace(/^@/, '').toLowerCase();
	}

	function normalizeAcct(value?: string | null) {
		return normalizeUsername(value);
	}

	function normalizeAddress(value?: string | null) {
		const trimmed = value?.trim();
		return trimmed ? trimmed.toLowerCase() : '';
	}

	function formatDateTime(value?: string | null): string {
		const trimmed = value?.trim();
		if (!trimmed) return '—';

		const parsed = new Date(trimmed);
		if (Number.isNaN(parsed.getTime())) return trimmed;
		return parsed.toLocaleString();
	}

	function formatLeaseHours(value?: number | null): string {
		if (!value || value <= 0) return '—';
		if (value % 24 === 0) return `${value}h (${value / 24}d)`;
		return `${value}h`;
	}

	function formatWalletAddress(value?: string | null): string {
		const trimmed = value?.trim();
		if (!trimmed) return '—';
		if (trimmed.length <= 16) return trimmed;
		return `${trimmed.slice(0, 8)}...${trimmed.slice(-6)}`;
	}

	function parseOptionalPositiveInt(value: string): number | undefined {
		const trimmed = value.trim();
		if (!trimmed) return undefined;

		const parsed = Number.parseInt(trimmed, 10);
		if (!Number.isFinite(parsed) || parsed <= 0) {
			throw new Error('Lease timing values must be positive whole numbers.');
		}

		return parsed;
	}

	function parseDateMs(value?: string | null): number {
		const parsed = Date.parse(value?.trim() ?? '');
		return Number.isFinite(parsed) ? parsed : 0;
	}

	function sortLeases(items: readonly AgentAccessLease[]): AgentAccessLease[] {
		return [...items].sort((left, right) => {
			const leftStatus = left.status.trim().toLowerCase();
			const rightStatus = right.status.trim().toLowerCase();
			const leftRank = leftStatus === 'active' ? 0 : leftStatus === 'expired' ? 1 : 2;
			const rightRank = rightStatus === 'active' ? 0 : rightStatus === 'expired' ? 1 : 2;
			if (leftRank !== rightRank) return leftRank - rightRank;

			return parseDateMs(right.updatedAt) - parseDateMs(left.updatedAt);
		});
	}

	function sortRuntimeSessions(items: readonly AgentRuntimeSession[]): AgentRuntimeSession[] {
		return [...items].sort((left, right) => {
			if (left.revoked !== right.revoked) return left.revoked ? 1 : -1;

			const lastUsedDelta = parseDateMs(right.lastUsedAt) - parseDateMs(left.lastUsedAt);
			if (lastUsedDelta !== 0) return lastUsedDelta;

			return parseDateMs(right.createdAt) - parseDateMs(left.createdAt);
		});
	}

	function isAgentOwner(agent: Agent | null, viewer: Account | null) {
		if (!viewer?.id || !agent) return false;

		if (agent.ownerActor?.id && agent.ownerActor.id === viewer.id) return true;

		const viewerAcct = normalizeAcct(viewer.acct || viewer.username);
		if (!viewerAcct) return false;

		if (agent.ownerActor?.username) {
			const ownerAcct = normalizeAcct(
				agent.ownerActor.domain
					? `${agent.ownerActor.username}@${agent.ownerActor.domain}`
					: agent.ownerActor.username
			);
			if (ownerAcct && ownerAcct === viewerAcct) return true;
		}

		const agentOwner = normalizeAcct(agent.agentOwner);
		if (!agentOwner) return false;
		if (agentOwner.includes('@')) return agentOwner === viewerAcct;

		return !viewerAcct.includes('@') && agentOwner === normalizeUsername(viewer.username);
	}

	type PendingLeaseEnrollment = {
		pendingSessionKey: StoredLeaseSessionKey | null;
		principalChallenge: AgentAccessLeaseChallenge;
		agentChallenge: AgentAccessLeaseChallenge;
		principalSignature: `0x${string}` | null;
		agentSignature: `0x${string}` | null;
	};

	type StoredAgentConnector = {
		id: string;
		name: string;
		clientId: string;
		redirectUri: string;
		website?: string | null;
		createdAt: number;
		grantTypes: string[];
		tokenEndpointAuthMethod: string | null;
		grantProfile: AgentConnectorGrantProfile;
		clientPreset: AgentConnectorClientPreset;
		rotation: AgentConnectorRotationStatus;
		clientSecretExpiresAt: number | null;
	};

	const AGENT_CONNECTOR_STORAGE_PREFIX = 'simulacrum:agent-connectors:';

	function agentConnectorStorageKey(username: string): string {
		return `${AGENT_CONNECTOR_STORAGE_PREFIX}${normalizeUsername(username)}`;
	}

	function emptyConnectorRotationStatus(): AgentConnectorRotationStatus {
		return {
			rotatedAt: null,
			forcedInvalidation: false,
			gracePeriodSeconds: null,
			previousSecretValidUntil: null,
			lastError: null,
			lastErrorAt: null,
		};
	}

	function normalizeConnectorRotationStatus(value: unknown): AgentConnectorRotationStatus {
		if (!value || typeof value !== 'object') return emptyConnectorRotationStatus();

		const rotation = value as {
			rotatedAt?: unknown;
			forcedInvalidation?: unknown;
			gracePeriodSeconds?: unknown;
			previousSecretValidUntil?: unknown;
			lastError?: unknown;
			lastErrorAt?: unknown;
		};

		return {
			rotatedAt: typeof rotation.rotatedAt === 'string' ? rotation.rotatedAt : null,
			forcedInvalidation: rotation.forcedInvalidation === true,
			gracePeriodSeconds:
				typeof rotation.gracePeriodSeconds === 'number' ? rotation.gracePeriodSeconds : null,
			previousSecretValidUntil:
				typeof rotation.previousSecretValidUntil === 'string'
					? rotation.previousSecretValidUntil
					: null,
			lastError: typeof rotation.lastError === 'string' ? rotation.lastError : null,
			lastErrorAt: typeof rotation.lastErrorAt === 'string' ? rotation.lastErrorAt : null,
		};
	}

	function normalizeStoredAgentConnector(value: unknown): StoredAgentConnector | null {
		if (!value || typeof value !== 'object') return null;

		const connector = value as {
			id?: unknown;
			name?: unknown;
			clientId?: unknown;
			redirectUri?: unknown;
			website?: unknown;
			createdAt?: unknown;
			grantTypes?: unknown;
			tokenEndpointAuthMethod?: unknown;
			grantProfile?: unknown;
			clientPreset?: unknown;
			rotation?: unknown;
			clientSecretExpiresAt?: unknown;
		};

		if (
			typeof connector.id !== 'string' ||
			typeof connector.name !== 'string' ||
			typeof connector.clientId !== 'string' ||
			typeof connector.redirectUri !== 'string'
		) {
			return null;
		}

		const parsedGrantTypes = Array.isArray(connector.grantTypes)
			? connector.grantTypes.filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
			: [];
		const grantProfile = isConnectorGrantProfile(connector.grantProfile)
			? connector.grantProfile
			: inferConnectorGrantProfile(parsedGrantTypes);
		const clientPreset = isConnectorClientPreset(connector.clientPreset)
			? connector.clientPreset
			: inferConnectorClientPreset({
					redirectUri: connector.redirectUri,
					grantProfile,
				});

		return {
			id: connector.id,
			name: connector.name,
			clientId: connector.clientId,
			redirectUri: connector.redirectUri,
			website: typeof connector.website === 'string' ? connector.website : null,
			createdAt: typeof connector.createdAt === 'number' ? connector.createdAt : Date.now(),
			grantTypes: parsedGrantTypes.length > 0 ? parsedGrantTypes : connectorGrantTypes(grantProfile),
			tokenEndpointAuthMethod:
				typeof connector.tokenEndpointAuthMethod === 'string'
					? connector.tokenEndpointAuthMethod
					: 'client_secret_post',
			grantProfile,
			clientPreset,
			rotation: normalizeConnectorRotationStatus(connector.rotation),
			clientSecretExpiresAt:
				typeof connector.clientSecretExpiresAt === 'number' ? connector.clientSecretExpiresAt : null,
		};
	}

	function readStoredAgentConnectors(username: string): StoredAgentConnector[] {
		if (!browser || !username) return [];

		try {
			const raw = localStorage.getItem(agentConnectorStorageKey(username));
			if (!raw) return [];

			const parsed = JSON.parse(raw) as unknown[];
			if (!Array.isArray(parsed)) return [];

			return parsed
				.map((connector) => normalizeStoredAgentConnector(connector))
				.filter((connector): connector is StoredAgentConnector => connector !== null);
		} catch {
			return [];
		}
	}

	function writeStoredAgentConnectors(username: string, connectors: readonly StoredAgentConnector[]) {
		if (!browser || !username) return;

		try {
			localStorage.setItem(agentConnectorStorageKey(username), JSON.stringify(connectors));
		} catch (error) {
			console.warn('Failed to persist agent connector metadata:', error);
		}
	}

	function upsertStoredAgentConnector(
		username: string,
		connector: StoredAgentConnector
	): StoredAgentConnector[] {
		const nextConnectors = [
			connector,
			...readStoredAgentConnectors(username).filter((existing) => existing.clientId !== connector.clientId),
		];
		writeStoredAgentConnectors(username, nextConnectors);
		return nextConnectors;
	}

	function rememberAgentConnector(
		username: string,
		registration: AgentConnectorRegistration
	): StoredAgentConnector[] {
		const nextConnector: StoredAgentConnector = {
			id: registration.id,
			name: registration.name,
			clientId: registration.clientId,
			redirectUri: registration.redirectUri,
			website: registration.website,
			createdAt: Date.now(),
			grantTypes: registration.grantTypes,
			tokenEndpointAuthMethod: registration.tokenEndpointAuthMethod,
			grantProfile: registration.grantProfile,
			clientPreset: registration.clientPreset,
			rotation: registration.rotation,
			clientSecretExpiresAt: registration.clientSecretExpiresAt,
		};

		return upsertStoredAgentConnector(username, nextConnector);
	}

	let viewer = $state<Account | null>(null);
	let agent = $state<Agent | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	let activity = $state<AgentActivityConnection | null>(null);
	let activityItems = $state<AgentActivityConnection['edges']>([]);
	let activityLoading = $state(false);
	let activityError = $state<string | null>(null);

	let canAdmin = $derived(hasAdminScope($authSession?.scope));
	let isOwner = $derived(isAgentOwner(agent, viewer));
	let canManage = $derived(isOwner || canAdmin);
	let canEnrollLease = $derived(isOwner);

	async function refreshAgent({ signal }: { signal?: AbortSignal } = {}) {
		const token = $authSession?.accessToken ?? null;
		const username = $page.params.username;
		if (!token || !username) return;

		isLoading = true;
		error = null;

		try {
			const [nextViewer, nextAgent] = await Promise.all([
				api.fetchViewer({ signal }),
				api.fetchAgentByUsername({ username, signal }),
			]);

			viewer = nextViewer;
			agent = nextAgent;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			error = err instanceof Error ? err.message : String(err);
			viewer = null;
			agent = null;
		} finally {
			isLoading = false;
		}
	}

	async function refreshActivity({ signal }: { signal?: AbortSignal } = {}) {
		const token = $authSession?.accessToken ?? null;
		const username = $page.params.username;
		if (!token || !username) return;

		activityLoading = true;
		activityError = null;

		try {
			const result = await api.fetchAgentActivity({ username, first: 30, signal });
			activity = result;
			activityItems = result.edges;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			activityError = err instanceof Error ? err.message : String(err);
			activity = null;
			activityItems = [];
		} finally {
			activityLoading = false;
		}
	}

	async function loadMoreActivity() {
		const username = $page.params.username;
		if (!username) return;
		if (!activity?.pageInfo?.hasNextPage) return;
		const after = activity.pageInfo.endCursor ?? undefined;
		if (!after) return;

		activityLoading = true;
		activityError = null;

		try {
			const result = await api.fetchAgentActivity({ username, first: 30, after });
			activity = result;
			activityItems = [...activityItems, ...result.edges];
		} catch (err) {
			activityError = err instanceof Error ? err.message : String(err);
		} finally {
			activityLoading = false;
		}
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		const username = $page.params.username;

		viewer = null;
		agent = null;
		error = null;
		isLoading = false;

		activity = null;
		activityItems = [];
		activityError = null;
		activityLoading = false;

		connectorRegistrations = [];
		latestConnector = null;
		connectorClientName = '';
		connectorGrantProfile = 'authorization_code';
		connectorClientPreset = 'claude_ai';
		connectorRedirectUri = CLAUDE_AI_REDIRECT_URI;
		connectorWebsite = browser ? window.location.origin : '';
		connectorScopes = { read: true, write: true, follow: true };
		connectorLoading = false;
		connectorRotateClientId = null;
		connectorError = null;
		connectorMessage = null;

		updateError = null;
		updateMessage = null;

		if (!token || !username) return;

		const controller = new AbortController();
		void refreshAgent({ signal: controller.signal });
		void refreshActivity({ signal: controller.signal });

		return () => controller.abort();
	});

	$effect(() => {
		if (!agent) return;

		connectorRegistrations = readStoredAgentConnectors(agent.username);
		if (!connectorClientName) {
			connectorClientName = `${agent.displayName || agent.username} connector`;
		}
		if (connectorGrantProfile === 'authorization_code' && !connectorRedirectUri) {
			connectorRedirectUri = defaultConnectorRedirectUriForPreset(
				connectorClientPreset === 'headless' ? 'claude_ai' : connectorClientPreset
			);
		}
		if (!connectorWebsite && browser) {
			connectorWebsite = window.location.origin;
		}
	});

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		const username = $page.params.username;
		if (!token || !username) return;

		const adapter = getStreamingAdapter(token);
		if (!adapter) return;

		const subscription = adapter.subscribeToAgentActivityUpdates({ username }).subscribe({
			next: (result) => {
				const event = result.data?.agentActivity;
				if (!event) return;
				const nextEdge = { __typename: 'AgentActivityEdge' as const, cursor: event.eventId, node: event };
				activityItems = [
					nextEdge,
					...activityItems.filter((edge) => edge.node.eventId !== event.eventId),
				].slice(0, 200);
			},
			error: (err) => {
				console.warn('Agent activity subscription failed:', err);
			},
		});

		return () => subscription.unsubscribe();
	});

	$effect(() => {
		const provider = getInjectedProvider();
		if (!provider) {
			injectedWalletAddress = null;
			return;
		}

		void refreshInjectedWallet();

		const handleAccountsChanged = (accounts: unknown) => {
			if (Array.isArray(accounts) && accounts.every((item) => typeof item === 'string')) {
				injectedWalletAddress = (accounts[0] as string | undefined) ?? null;
				return;
			}

			void refreshInjectedWallet();
		};

		provider.on?.('accountsChanged', handleAccountsChanged);

		return () => provider.removeListener?.('accountsChanged', handleAccountsChanged);
	});

	// OAuth connector registration
	let connectorRegistrations = $state<StoredAgentConnector[]>([]);
	let latestConnector = $state<AgentConnectorRegistration | null>(null);
	type TokenEndpointAuthMethod = 'client_secret_post' | 'client_secret_basic' | 'none';
	const TOKEN_ENDPOINT_AUTH_METHODS: Array<{ value: TokenEndpointAuthMethod; label: string }> = [
		{ value: 'client_secret_post', label: 'client_secret_post (default)' },
		{ value: 'client_secret_basic', label: 'client_secret_basic (HTTP Basic)' },
		{ value: 'none', label: 'none (public client)' },
	];

	let connectorClientName = $state('');
	let connectorGrantProfile = $state<AgentConnectorGrantProfile>('authorization_code');
	let connectorClientPreset = $state<AgentConnectorClientPreset>('claude_ai');
	let connectorRedirectUri = $state('');
	let connectorWebsite = $state('');
	let connectorAuthMethod = $state<TokenEndpointAuthMethod>('client_secret_post');
	let connectorScopes = $state({ read: true, write: true, follow: true });
	let connectorLoading = $state(false);
	let connectorRotateClientId = $state<string | null>(null);
	let connectorError = $state<string | null>(null);
	let connectorMessage = $state<string | null>(null);

	const connectorTransport = $derived.by(() =>
		browser ? resolveMcpTransport(window.location.origin, agent?.username) : null
	);

	// Runtime session inventory for connector diagnostics and cleanup
	let runtimeSessions = $state<AgentRuntimeSession[]>([]);
	let runtimeLoading = $state(false);
	let runtimeRevokeAllLoading = $state(false);
	let runtimeRevokeSessionId = $state<string | null>(null);
	let runtimeLoadError = $state<string | null>(null);
	let runtimeActionError = $state<string | null>(null);
	let runtimeActionMessage = $state<string | null>(null);

	const knownConnectorClientIds = $derived.by(
		() => new Set(connectorRegistrations.map((connector) => connector.clientId))
	);
	const connectorSessionGroups = $derived.by(() =>
		connectorRegistrations.map((connector) => ({
			connector,
			sessions: runtimeSessions.filter((session) => session.clientID === connector.clientId),
		}))
	);
	const connectorSessionCount = $derived.by(() =>
		connectorSessionGroups.reduce((count, group) => count + group.sessions.length, 0)
	);
	const otherRuntimeSessions = $derived.by(() =>
		runtimeSessions.filter((session) => !knownConnectorClientIds.has(session.clientID))
	);

	function selectedConnectorScopes(): string[] {
		const scopes: string[] = [];
		if (connectorScopes.read) scopes.push('read');
		if (connectorScopes.write) scopes.push('write');
		if (connectorScopes.follow) scopes.push('follow');
		return scopes;
	}

	function setConnectorGrantProfile(profile: AgentConnectorGrantProfile) {
		connectorGrantProfile = profile;
		if (profile === 'client_credentials') {
			connectorClientPreset = 'headless';
			return;
		}

		if (connectorClientPreset === 'headless') {
			connectorClientPreset = 'claude_ai';
			connectorRedirectUri = CLAUDE_AI_REDIRECT_URI;
		}
	}

	function setConnectorClientPreset(preset: Exclude<AgentConnectorClientPreset, 'headless'>) {
		connectorClientPreset = preset;
		connectorRedirectUri = defaultConnectorRedirectUriForPreset(preset);
	}

	function connectorRotationSummary(rotation: AgentConnectorRotationStatus): string {
		if (rotation.lastError) {
			return `Last rotation failed ${formatDateTime(rotation.lastErrorAt)}: ${rotation.lastError}`;
		}
		if (!rotation.rotatedAt) {
			return 'Secret has not been rotated from this browser yet.';
		}
		if (rotation.forcedInvalidation) {
			return `Rotated ${formatDateTime(rotation.rotatedAt)} with immediate invalidation.`;
		}
		if (rotation.previousSecretValidUntil) {
			return `Rotated ${formatDateTime(rotation.rotatedAt)}. Previous secret valid until ${formatDateTime(rotation.previousSecretValidUntil)}.`;
		}
		if (rotation.gracePeriodSeconds && rotation.gracePeriodSeconds > 0) {
			return `Rotated ${formatDateTime(rotation.rotatedAt)} with a ${rotation.gracePeriodSeconds}s grace window.`;
		}
		return `Rotated ${formatDateTime(rotation.rotatedAt)}.`;
	}

	function connectorSecretExpirySummary(expiresAt: number | null): string | null {
		if (!expiresAt || expiresAt === 0) return null;
		const expiresMs = expiresAt * 1000;
		const now = Date.now();
		if (expiresMs <= now) return 'Client secret has expired. Rotate the secret to restore access.';
		const hoursRemaining = Math.floor((expiresMs - now) / (60 * 60 * 1000));
		if (hoursRemaining < 24) return `Client secret expires in ${hoursRemaining}h. Consider rotating soon.`;
		const daysRemaining = Math.floor(hoursRemaining / 24);
		if (daysRemaining <= 7) return `Client secret expires in ${daysRemaining}d.`;
		return null;
	}

	type ConnectorSessionHealth =
		| 'healthy'
		| 'expiring_soon'
		| 'refresh_needed'
		| 'auth_failure'
		| 'revoked';

	function formatDuration(ms: number): string {
		if (!Number.isFinite(ms)) return '—';
		if (ms <= 0) return 'expired';

		const totalMinutes = Math.ceil(ms / 60000);
		if (totalMinutes < 60) return `${totalMinutes}m`;

		const totalHours = Math.ceil(totalMinutes / 60);
		if (totalHours < 48) return `${totalHours}h`;

		const days = Math.floor(totalHours / 24);
		const hours = totalHours % 24;
		return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
	}

	function connectorSessionRemainingMs(session: AgentRuntimeSession): number {
		const idleRemaining = parseDateMs(session.idleExpiresAt) - Date.now();
		const absoluteRemaining = parseDateMs(session.absoluteExpiresAt) - Date.now();
		return Math.min(idleRemaining, absoluteRemaining);
	}

	function connectorSessionDiagnosticStatusLabel(status: string): string {
		switch (status) {
			case 'FAILED':
				return 'failed';
			case 'EXPIRED':
				return 'expired';
			case 'REVOKED':
				return 'revoked';
			default:
				return 'healthy';
		}
	}

	function connectorSessionFailureDetail(session: AgentRuntimeSession): string | null {
		const failureCode = session.authDiagnostic?.failureCode?.trim();
		const failureMessage = session.authDiagnostic?.failureMessage?.trim();
		if (failureCode && failureMessage) return `${failureCode}: ${failureMessage}`;
		return failureMessage || failureCode || null;
	}

	function connectorSessionHealth(session: AgentRuntimeSession): ConnectorSessionHealth {
		switch (session.authDiagnostic?.status) {
			case 'REVOKED':
				return 'revoked';
			case 'FAILED':
				return 'auth_failure';
			case 'EXPIRED':
				return 'refresh_needed';
		}

		if (session.revoked) return 'revoked';

		const remainingMs = connectorSessionRemainingMs(session);
		if (remainingMs <= 0) return 'refresh_needed';
		if (remainingMs <= CONNECTOR_SESSION_EXPIRING_SOON_MS) return 'expiring_soon';
		return 'healthy';
	}

	function connectorSessionHealthLabel(status: ConnectorSessionHealth): string {
		switch (status) {
			case 'revoked':
				return 'Revoked';
			case 'auth_failure':
				return 'Auth failed';
			case 'refresh_needed':
				return 'Refresh needed';
			case 'expiring_soon':
				return 'Expiring soon';
			default:
				return 'Healthy';
		}
	}

	function connectorSessionHealthClass(status: ConnectorSessionHealth): string {
		switch (status) {
			case 'healthy':
				return 'gr-badge gr-badge--sm gr-badge--outlined gr-badge--success';
			case 'expiring_soon':
				return 'gr-badge gr-badge--sm gr-badge--outlined gr-badge--info';
			case 'auth_failure':
				return 'gr-badge gr-badge--sm gr-badge--outlined gr-badge--error';
			case 'refresh_needed':
				return 'gr-badge gr-badge--sm gr-badge--outlined gr-badge--error';
			default:
				return 'gr-badge gr-badge--sm gr-badge--outlined gr-badge--gray';
		}
	}

	function connectorSessionHealthSummary(session: AgentRuntimeSession): string {
		const status = connectorSessionHealth(session);
		const failureDetail = connectorSessionFailureDetail(session);
		const lastSuccessAt = session.authDiagnostic?.lastSuccessAt
			? ` Last successful OAuth exchange was ${formatDateTime(session.authDiagnostic.lastSuccessAt)}.`
			: '';
		const remaining = formatDuration(connectorSessionRemainingMs(session));

		if (status === 'revoked') {
			return session.revokedReason?.trim()
				? `Revoked ${formatDateTime(session.revokedAt)} (${session.revokedReason}). Reconnect this connector in your MCP client.`
				: `Revoked ${formatDateTime(session.revokedAt)}. Reconnect this connector in your MCP client.`;
		}
		if (status === 'auth_failure') {
			if (failureDetail) {
				return `OAuth token exchange failed${session.authDiagnostic?.failureAt ? ` at ${formatDateTime(session.authDiagnostic.failureAt)}` : ''}: ${failureDetail}. Update the connector credentials or reconnect it in your MCP client.${lastSuccessAt}`;
			}
			return `OAuth token exchange is failing${session.authDiagnostic?.failureAt ? ` as of ${formatDateTime(session.authDiagnostic.failureAt)}` : ''}. Update the connector credentials or reconnect it in your MCP client.${lastSuccessAt}`;
		}
		if (status === 'refresh_needed') {
			if (failureDetail) {
				return `${failureDetail}${session.authDiagnostic?.failureAt ? ` (${formatDateTime(session.authDiagnostic.failureAt)})` : ''}. Reconnect the connector in your MCP client.${lastSuccessAt}`;
			}
			return `This connector session has expired or gone idle. Reconnect the connector in your MCP client.${lastSuccessAt}`;
		}
		if (status === 'expiring_soon') {
			return `Action soon: the current session window closes in ${remaining}. Let the client refresh or reconnect it if it stops reconnecting.${lastSuccessAt}`;
		}
		return `Healthy. Current session window closes in ${remaining}. No operator action is needed right now.${lastSuccessAt}`;
	}

	function ensureAbsoluteUrl(value: string, fieldLabel: string): string {
		const trimmed = value.trim();
		if (!trimmed) {
			throw new Error(`${fieldLabel} is required.`);
		}

		try {
			return new URL(trimmed).toString();
		} catch {
			throw new Error(`${fieldLabel} must be an absolute URL.`);
		}
	}

	async function handleRegisterConnector() {
		if (!agent) return;
		if (!isOwner) return;
		if (connectorLoading) return;

		const clientName = connectorClientName.trim();
		if (!clientName) {
			connectorError = 'Connector name is required.';
			return;
		}

		const scopes = selectedConnectorScopes();
		if (scopes.length === 0) {
			connectorError = 'Select at least one connector scope.';
			return;
		}

		let redirectUri = '';
		let website: string | undefined;
		const grantTypes = connectorGrantTypes(connectorGrantProfile);
		const clientPreset =
			connectorGrantProfile === 'client_credentials' ? 'headless' : connectorClientPreset;

		try {
			redirectUri =
				connectorGrantProfile === 'client_credentials'
					? HEADLESS_REDIRECT_URI
					: ensureAbsoluteUrl(connectorRedirectUri, 'Redirect URI');
			const trimmedWebsite = connectorWebsite.trim();
			website = trimmedWebsite ? ensureAbsoluteUrl(trimmedWebsite, 'Website URL') : undefined;
		} catch (error) {
			connectorError = error instanceof Error ? error.message : String(error);
			return;
		}

		connectorLoading = true;
		connectorError = null;
		connectorMessage = null;

		try {
			const registration = await api.registerAgentConnector({
				username: agent.username,
				clientName,
				redirectUri,
				scopes: scopes.join(' '),
				grantTypes,
				tokenEndpointAuthMethod: connectorAuthMethod,
				grantProfile: connectorGrantProfile,
				clientPreset,
				website,
			});

			latestConnector = registration;
			connectorRegistrations = rememberAgentConnector(agent.username, registration);
			connectorMessage = `Connector registered for ${connectorClientPresetLabel(registration.clientPreset)} using ${connectorGrantProfileLabel(registration.grantProfile).toLowerCase()}.`;
		} catch (error) {
			connectorError = error instanceof Error ? error.message : String(error);
		} finally {
			connectorLoading = false;
		}
	}

	function connectorTitle(connector: StoredAgentConnector, fallbackSession?: AgentRuntimeSession | null): string {
		return connector.name.trim() || fallbackSession?.deviceLabel?.trim() || connector.clientId;
	}

	async function handleRotateConnectorSecret(
		connector: StoredAgentConnector,
		{ forceInvalidate }: { forceInvalidate: boolean }
	) {
		if (!agent) return;
		if (!isOwner) return;
		if (connectorRotateClientId) return;

		const prompt = forceInvalidate
			? `Rotate the secret for ${connectorTitle(connector)} and invalidate the previous secret immediately? Existing bearer access tokens remain valid until expiry, but new client-authenticated exchanges will require the replacement secret right away.`
			: `Rotate the secret for ${connectorTitle(connector)} with Lesser's standard grace window? Existing bearer access tokens stay valid and the previous secret will keep working only until the grace period ends.`;
		if (typeof window !== 'undefined' && !window.confirm(prompt)) {
			return;
		}

		connectorRotateClientId = connector.clientId;
		connectorError = null;
		connectorMessage = null;

		try {
			const rotation = await api.rotateAgentConnectorSecret({
				connectorId: connector.id,
				forceInvalidate,
			});
			const nextConnector: StoredAgentConnector = {
				...connector,
				tokenEndpointAuthMethod:
					rotation.tokenEndpointAuthMethod ?? connector.tokenEndpointAuthMethod ?? 'client_secret_post',
				rotation: rotation.rotation,
			};
			connectorRegistrations = upsertStoredAgentConnector(agent.username, nextConnector);
			latestConnector = {
				id: connector.id,
				name: connector.name,
				clientId: rotation.clientId,
				clientSecret: rotation.clientSecret,
				redirectUri: connector.redirectUri,
				website: connector.website ?? null,
				vapidKey: latestConnector?.clientId === connector.clientId ? latestConnector.vapidKey : null,
				grantTypes: connector.grantTypes,
				responseTypes: latestConnector?.clientId === connector.clientId ? latestConnector.responseTypes : [],
				tokenEndpointAuthMethod:
					rotation.tokenEndpointAuthMethod ?? connector.tokenEndpointAuthMethod ?? 'client_secret_post',
				grantProfile: connector.grantProfile,
				clientPreset: connector.clientPreset,
				rotation: rotation.rotation,
				logoUri: latestConnector?.clientId === connector.clientId ? latestConnector.logoUri : null,
				contacts: latestConnector?.clientId === connector.clientId ? latestConnector.contacts : [],
				tosUri: latestConnector?.clientId === connector.clientId ? latestConnector.tosUri : null,
				policyUri: latestConnector?.clientId === connector.clientId ? latestConnector.policyUri : null,
				clientIdIssuedAt: latestConnector?.clientId === connector.clientId ? latestConnector.clientIdIssuedAt : null,
				clientSecretExpiresAt: latestConnector?.clientId === connector.clientId ? latestConnector.clientSecretExpiresAt : null,
				scope: latestConnector?.clientId === connector.clientId ? latestConnector.scope : null,
				softwareId: latestConnector?.clientId === connector.clientId ? latestConnector.softwareId : null,
				softwareVersion: latestConnector?.clientId === connector.clientId ? latestConnector.softwareVersion : null,
			};
			connectorMessage = forceInvalidate
				? 'Connector secret rotated with immediate invalidation. Distribute the replacement secret before the client reconnects.'
				: 'Connector secret rotated. The replacement secret is shown once below while Lesser keeps a grace window for the previous secret.';
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			connectorError = message;
			const nextConnector: StoredAgentConnector = {
				...connector,
				rotation: {
					...connector.rotation,
					lastError: message,
					lastErrorAt: new Date().toISOString(),
				},
			};
			connectorRegistrations = upsertStoredAgentConnector(agent.username, nextConnector);
		} finally {
			connectorRotateClientId = null;
		}
	}

	function upsertRuntimeSession(nextSession: AgentRuntimeSession) {
		runtimeSessions = sortRuntimeSessions([
			nextSession,
			...runtimeSessions.filter((existingSession) => existingSession.sessionID !== nextSession.sessionID),
		]);
	}

	async function loadRuntimeSessions({ signal }: { signal?: AbortSignal } = {}) {
		if (!agent || !canManage) return;

		runtimeLoading = true;
		runtimeLoadError = null;

		try {
			const nextSessions = sortRuntimeSessions(
				await api.fetchAgentRuntimeSessions({ username: agent.username, signal })
			);
			runtimeSessions = nextSessions;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			runtimeLoadError = err instanceof Error ? err.message : String(err);
			runtimeSessions = [];
		} finally {
			runtimeLoading = false;
		}
	}

	async function handleRevokeRuntimeSession(session: AgentRuntimeSession) {
		if (!agent) return;
		if (!canManage) return;
		if (runtimeRevokeSessionId) return;
		if (typeof window !== 'undefined') {
			const ok = window.confirm(`Revoke runtime session ${session.sessionID} for @${agent.username}?`);
			if (!ok) return;
		}

		runtimeRevokeSessionId = session.sessionID;
		runtimeActionError = null;
		runtimeActionMessage = null;

		try {
			const updatedSession = await api.revokeAgentRuntimeSession({
				username: agent.username,
				sessionID: session.sessionID,
				reason: 'operator_revoked_runtime_session',
			});
			upsertRuntimeSession(updatedSession);
			runtimeActionMessage = `Runtime session ${session.sessionID} revoked.`;
		} catch (err) {
			runtimeActionError = err instanceof Error ? err.message : String(err);
		} finally {
			runtimeRevokeSessionId = null;
		}
	}

	async function handleRevokeAllRuntimeSessions() {
		if (!agent) return;
		if (!canManage) return;
		if (runtimeRevokeAllLoading) return;
		if (typeof window !== 'undefined') {
			const ok = window.confirm(`Revoke all runtime sessions for @${agent.username}?`);
			if (!ok) return;
		}

		runtimeRevokeAllLoading = true;
		runtimeActionError = null;
		runtimeActionMessage = null;

		try {
			await api.revokeAgentToken({ username: agent.username });
			await loadRuntimeSessions();
			runtimeActionMessage = 'All agent runtime sessions were revoked.';
		} catch (err) {
			runtimeActionError = err instanceof Error ? err.message : String(err);
		} finally {
			runtimeRevokeAllLoading = false;
		}
	}

	// Agent access leases
	let linkedWallets = $state<LinkedWallet[]>([]);
	let mySouls = $state<SoulInventoryItem[]>([]);
	let leases = $state<AgentAccessLease[]>([]);
	let selectedLeaseId = $state('');
	let currentLeaseToken = $state<AgentLeaseToken | null>(null);
	let storedSessionLeaseIds = $state<string[]>([]);
	let leaseDeviceLabel = $state('simulacrum-browser');
	let leasePrincipalWallet = $state('');
	let leaseAgentWallet = $state('');
	let leaseIdleHours = $state('');
	let leaseAbsoluteHours = $state('');
	let leaseScopes = $state({ read: true, write: true, follow: true });
	let attachBrowserSessionKey = $state(true);
	let revokeReason = $state('');
	let leaseLoading = $state(false);
	let leaseEnrollLoading = $state(false);
	let leaseTokenLoading = $state(false);
	let leaseSessionKeyLoading = $state(false);
	let revokeLeaseId = $state<string | null>(null);
	let leaseLoadError = $state<string | null>(null);
	let leaseActionError = $state<string | null>(null);
	let leaseActionMessage = $state<string | null>(null);
	let injectedWalletAddress = $state<string | null>(null);
	let pendingLeaseEnrollment = $state<PendingLeaseEnrollment | null>(null);

	const boundSoul = $derived.by(() => {
		if (!agent) return null;
		const agentUsername = normalizeUsername(agent.username);
		return (
			mySouls.find((item) => normalizeUsername(item.binding?.agentUsername) === agentUsername) ?? null
		);
	});
	const selectedLease = $derived.by(
		() => leases.find((lease) => lease.id === selectedLeaseId) ?? null
	);
	const selectedLeaseHasStoredSessionKey = $derived.by(
		() => !!selectedLease && storedSessionLeaseIds.includes(selectedLease.id)
	);
	const leaseTokenValue = $derived.by(
		() =>
			currentLeaseToken?.accessToken?.trim() ||
			(leaseTokenLoading ? 'Minting advanced bearer token…' : 'Mint a bearer token from the selected advanced lease.')
	);
	const pendingLeaseSigner = $derived.by(() => {
		if (!pendingLeaseEnrollment) return null;
		if (!pendingLeaseEnrollment.principalSignature) return 'principal';
		if (!pendingLeaseEnrollment.agentSignature) return 'agent';
		return 'finalize';
	});
	const pendingLeaseWallet = $derived.by(() => {
		if (!pendingLeaseEnrollment || pendingLeaseSigner === 'finalize') return null;
		return pendingLeaseSigner === 'principal'
			? pendingLeaseEnrollment.principalChallenge.walletAddress
			: pendingLeaseEnrollment.agentChallenge.walletAddress;
	});
	const leaseCreateButtonLabel = $derived.by(() => {
		if (leaseEnrollLoading) {
			if (pendingLeaseSigner === 'principal') return 'Waiting for principal signature…';
			if (pendingLeaseSigner === 'agent') return 'Waiting for agent signature…';
			if (pendingLeaseSigner === 'finalize') return 'Finalizing lease…';
			return 'Creating lease…';
		}
		if (pendingLeaseSigner === 'principal') return 'Continue with principal wallet';
		if (pendingLeaseSigner === 'agent') return 'Continue with agent wallet';
		if (pendingLeaseSigner === 'finalize') return 'Finalize advanced lease';
		return 'Create advanced lease';
	});

	function selectedScopes(): string[] {
		const scopes: string[] = [];
		if (leaseScopes.read) scopes.push('read');
		if (leaseScopes.write) scopes.push('write');
		if (leaseScopes.follow) scopes.push('follow');
		return scopes;
	}

	function refreshStoredLeaseSessionIds(username: string, nextLeases: readonly AgentAccessLease[] = leases) {
		storedSessionLeaseIds = nextLeases
			.filter((lease) => readStoredLeaseSessionKey(username, lease.id))
			.map((lease) => lease.id);
	}

	function upsertLease(nextLease: AgentAccessLease) {
		const nextLeases = sortLeases([
			nextLease,
			...leases.filter((existingLease) => existingLease.id !== nextLease.id),
		]);
		leases = nextLeases;
		selectedLeaseId = nextLease.id;
		refreshStoredLeaseSessionIds(nextLease.username, nextLeases);
	}

	async function copy(value: string) {
		if (typeof navigator === 'undefined' || !navigator.clipboard) return;
		await navigator.clipboard.writeText(value);
	}

	function requireInjectedWallet() {
		const provider = getInjectedProvider();
		if (!provider) {
			throw new Error('No injected wallet provider detected (for example MetaMask).');
		}
		return provider;
	}

	async function signWalletChallenge(
		provider: ReturnType<typeof getInjectedProvider>,
		address: string,
		challenge: { typedDataJson?: string | null }
	): Promise<`0x${string}`> {
		if (!provider) throw new Error('No injected wallet provider detected.');
		const typedDataJson = challenge.typedDataJson?.trim();
		if (!typedDataJson) {
			throw new Error('The wallet challenge did not include typed data to sign.');
		}

		return signLeaseTypedDataWithWallet(provider, {
			address: address as `0x${string}`,
			typedDataJson,
		});
	}

	async function refreshInjectedWallet() {
		const provider = getInjectedProvider();
		if (!provider) {
			injectedWalletAddress = null;
			return;
		}

		const selected = provider.selectedAddress?.trim();
		if (selected) {
			injectedWalletAddress = selected;
			return;
		}

		try {
			const [connected] = await getAccounts(provider);
			injectedWalletAddress = connected ?? null;
		} catch {
			injectedWalletAddress = null;
		}
	}

	function resetPendingLeaseEnrollment(message?: string) {
		pendingLeaseEnrollment = null;
		if (message) leaseActionMessage = message;
	}

	function leaseChallengeExpired(challenge: AgentAccessLeaseChallenge): boolean {
		const expiresAt = Date.parse(challenge.expiresAt);
		return Number.isFinite(expiresAt) && expiresAt <= Date.now();
	}

	function expectedWalletSwitchMessage(
		role: 'principal' | 'agent',
		address: string,
		{ signatureCaptured = false }: { signatureCaptured?: boolean } = {}
	): string {
		const prefix = signatureCaptured
			? `${role === 'principal' ? 'Principal' : 'Agent'} signature recorded. `
			: '';
		return `${prefix}Switch the connected wallet to ${address} and click "${role === 'principal' ? 'Continue with principal wallet' : 'Continue with agent wallet'}".`;
	}

	async function continuePendingLeaseEnrollment(pending: PendingLeaseEnrollment) {
		if (!agent) throw new Error('Agent details are unavailable.');
		if (leaseChallengeExpired(pending.principalChallenge) || leaseChallengeExpired(pending.agentChallenge)) {
			resetPendingLeaseEnrollment();
			throw new Error('The pending lease challenges expired. Create a new access lease and sign again.');
		}

		const provider = requireInjectedWallet();

		if (!pending.principalSignature) {
			try {
				const principalSignature = await signWalletChallenge(
					provider,
					pending.principalChallenge.walletAddress,
					pending.principalChallenge
				);
				const nextPending = {
					...pending,
					principalSignature,
				};
				pendingLeaseEnrollment = nextPending;
				pending = nextPending;
				leaseActionMessage = null;
				await refreshInjectedWallet();
			} catch (error) {
				if (error instanceof WalletSwitchRequiredError) {
					leaseActionError = null;
					leaseActionMessage = expectedWalletSwitchMessage(
						'principal',
						pending.principalChallenge.walletAddress
					);
					await refreshInjectedWallet();
					return;
				}
				throw error;
			}
		}

		if (!pending.agentSignature) {
			try {
				const agentSignature = await signWalletChallenge(
					provider,
					pending.agentChallenge.walletAddress,
					pending.agentChallenge
				);
				const nextPending = {
					...pending,
					agentSignature,
				};
				pendingLeaseEnrollment = nextPending;
				pending = nextPending;
				leaseActionMessage = null;
				await refreshInjectedWallet();
			} catch (error) {
				if (error instanceof WalletSwitchRequiredError) {
					leaseActionError = null;
					leaseActionMessage = expectedWalletSwitchMessage(
						'agent',
						pending.agentChallenge.walletAddress,
						{ signatureCaptured: !!pending.principalSignature }
					);
					await refreshInjectedWallet();
					return;
				}
				throw error;
			}
		}

		const nextLease = await api.createAgentAccessLease({
			username: agent.username,
			input: {
				principalChallengeID: pending.principalChallenge.id,
				principalSignature: pending.principalSignature!,
				agentChallengeID: pending.agentChallenge.id,
				agentSignature: pending.agentSignature!,
			},
		});

		upsertLease(nextLease);

		if (pending.pendingSessionKey) {
			writeStoredLeaseSessionKey(nextLease.username, nextLease.id, pending.pendingSessionKey);
			refreshStoredLeaseSessionIds(nextLease.username);
		}

		resetPendingLeaseEnrollment();

		try {
			await mintLeaseToken(nextLease, { announce: false });
			leaseActionMessage = pending.pendingSessionKey
				? 'Access lease created, browser session key attached, and bearer token minted.'
				: 'Access lease created and bearer token minted.';
		} catch {
			leaseActionMessage = pending.pendingSessionKey
				? 'Access lease created and browser session key attached.'
				: 'Access lease created.';
		}
	}

	async function loadLeaseData({ signal }: { signal?: AbortSignal } = {}) {
		if (!agent || !canManage) return;

		leaseLoading = true;
		leaseLoadError = null;

		try {
			const [leaseResult, walletResult, soulResult] = await Promise.allSettled([
				api.fetchAgentAccessLeases({ username: agent.username, signal }),
				canEnrollLease
					? api.fetchLinkedWallets({ signal })
					: Promise.resolve([] as LinkedWallet[]),
				canEnrollLease ? api.fetchMySouls({ signal }) : Promise.resolve([] as SoulInventoryItem[]),
			]);

			if (signal?.aborted) return;
			if (leaseResult.status === 'rejected') throw leaseResult.reason;

			const nextLeases = sortLeases(leaseResult.value);
			leases = nextLeases;
			selectedLeaseId =
				selectedLeaseId && nextLeases.some((lease) => lease.id === selectedLeaseId)
					? selectedLeaseId
					: nextLeases[0]?.id ?? '';
			refreshStoredLeaseSessionIds(agent.username, nextLeases);

			if (walletResult.status === 'fulfilled') {
				linkedWallets = walletResult.value;
			} else if (!(walletResult.reason instanceof DOMException && walletResult.reason.name === 'AbortError')) {
				linkedWallets = [];
				leaseLoadError =
					walletResult.reason instanceof Error ? walletResult.reason.message : String(walletResult.reason);
			}

			if (soulResult.status === 'fulfilled') {
				mySouls = [...soulResult.value];
			} else if (!(soulResult.reason instanceof DOMException && soulResult.reason.name === 'AbortError')) {
				mySouls = [];
				leaseLoadError =
					leaseLoadError ??
					(soulResult.reason instanceof Error ? soulResult.reason.message : String(soulResult.reason));
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			leaseLoadError = err instanceof Error ? err.message : String(err);
			leases = [];
			linkedWallets = [];
			mySouls = [];
			selectedLeaseId = '';
			storedSessionLeaseIds = [];
		} finally {
			leaseLoading = false;
		}
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		const username = agent?.username ?? '';

		runtimeSessions = [];
		runtimeLoading = false;
		runtimeRevokeAllLoading = false;
		runtimeRevokeSessionId = null;
		runtimeLoadError = null;
		runtimeActionError = null;
		runtimeActionMessage = null;

		if (!token || !username || !canManage) return;

		const controller = new AbortController();
		void loadRuntimeSessions({ signal: controller.signal });

		return () => controller.abort();
	});

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		const username = agent?.username ?? '';

		linkedWallets = [];
		mySouls = [];
		leases = [];
		selectedLeaseId = '';
		currentLeaseToken = null;
		storedSessionLeaseIds = [];
		leaseLoadError = null;
		leaseActionError = null;
		leaseActionMessage = null;
		pendingLeaseEnrollment = null;
		leaseLoading = false;
		leaseEnrollLoading = false;
		leaseTokenLoading = false;
		leaseSessionKeyLoading = false;
		revokeLeaseId = null;
		revokeReason = '';

		if (!token || !username || !canManage) return;

		const controller = new AbortController();
		void loadLeaseData({ signal: controller.signal });

		return () => controller.abort();
	});

	$effect(() => {
		if (!agent || !selectedLeaseId) {
			currentLeaseToken = null;
			return;
		}

		currentLeaseToken = readStoredLeaseToken(agent.username, selectedLeaseId);
	});

	$effect(() => {
		if (!canEnrollLease) return;

		const suggestedPrincipal =
			linkedWallets.find(
				(wallet) => normalizeAddress(wallet.address) === normalizeAddress(boundSoul?.agent.principalAddress)
			)?.address ??
			linkedWallets[0]?.address ??
			'';

		if (!leasePrincipalWallet && suggestedPrincipal) {
			leasePrincipalWallet = suggestedPrincipal;
		}

		if (!leaseAgentWallet && boundSoul?.agent.wallet) {
			leaseAgentWallet = boundSoul.agent.wallet;
		}
	});

	async function mintLeaseToken(lease: AgentAccessLease, { announce = true }: { announce?: boolean } = {}) {
		leaseTokenLoading = true;
		leaseActionError = null;
		if (announce) leaseActionMessage = null;

		try {
			const challenge = await api.createAgentAccessLeaseRenewChallenge({
				username: lease.username,
				leaseID: lease.id,
			});

			let signature: string;
			if (challenge.action === 'renew_session') {
				const sessionKey = readStoredLeaseSessionKey(lease.username, lease.id);
				if (!sessionKey) {
					throw new Error(
						'This lease expects a browser session key, but none is stored in this browser. Re-authorize the session key first.'
					);
				}
				signature = await signLeaseSessionMessage(sessionKey, challenge.message);
			} else {
				const provider = requireInjectedWallet();
				signature = await signWalletChallenge(provider, lease.agentWallet, challenge);
			}

			const nextToken = await api.exchangeAgentAccessLeaseToken({
				username: lease.username,
				leaseID: lease.id,
				input: {
					challengeID: challenge.id,
					signature,
				},
			});

			currentLeaseToken = nextToken;
			writeStoredLeaseToken(lease.username, lease.id, nextToken);
			selectedLeaseId = lease.id;

			if (announce) {
				leaseActionMessage = 'Short-lived bearer token minted from the selected advanced lease.';
			}

			return nextToken;
		} catch (err) {
			leaseActionError = err instanceof Error ? err.message : String(err);
			throw err;
		} finally {
			leaseTokenLoading = false;
		}
	}

	async function handleCreateLease() {
		if (!agent) return;
		if (!canEnrollLease) return;
		if (leaseEnrollLoading) return;

		if (pendingLeaseEnrollment) {
			leaseEnrollLoading = true;
			leaseActionError = null;
			try {
				await continuePendingLeaseEnrollment(pendingLeaseEnrollment);
			} catch (err) {
				leaseActionError = err instanceof Error ? err.message : String(err);
			} finally {
				leaseEnrollLoading = false;
			}
			return;
		}

		const principalWallet = leasePrincipalWallet.trim();
		const agentWallet = leaseAgentWallet.trim();
		const deviceLabel = leaseDeviceLabel.trim() || 'simulacrum-browser';
		const scopes = selectedScopes();

		if (!principalWallet) {
			leaseActionError = 'Choose one of your linked principal wallets.';
			return;
		}
		if (!agentWallet) {
			leaseActionError = 'Provide the agent wallet linked to this agent body.';
			return;
		}
		if (scopes.length === 0) {
			leaseActionError = 'Select at least one lease scope.';
			return;
		}

		leaseEnrollLoading = true;
		leaseActionError = null;
		leaseActionMessage = null;

		try {
			await refreshInjectedWallet();
			requireInjectedWallet();
			const pendingSessionKey = attachBrowserSessionKey ? await generateStoredLeaseSessionKey() : null;
			const idleTimeoutHours = parseOptionalPositiveInt(leaseIdleHours);
			const absoluteTTLHours = parseOptionalPositiveInt(leaseAbsoluteHours);
			const challengeInput = {
				principalWallet,
				agentWallet,
				scopes,
				deviceLabel,
				...(pendingSessionKey ? { sessionPublicKey: pendingSessionKey.publicKey } : {}),
				...(idleTimeoutHours ? { idleTimeoutHours } : {}),
				...(absoluteTTLHours ? { absoluteTTLHours } : {}),
			};

			const principalChallenge = await api.createAgentAccessLeasePrincipalChallenge({
				username: agent.username,
				input: challengeInput,
			});
			const agentChallenge = await api.createAgentAccessLeaseAgentChallenge({
				username: agent.username,
				input: {
					...challengeInput,
					leaseID: principalChallenge.leaseID,
				},
			});
			const pending: PendingLeaseEnrollment = {
				pendingSessionKey,
				principalChallenge,
				agentChallenge,
				principalSignature: null,
				agentSignature: null,
			};
			pendingLeaseEnrollment = pending;
			await continuePendingLeaseEnrollment(pending);
		} catch (err) {
			leaseActionError = err instanceof Error ? err.message : String(err);
		} finally {
			leaseEnrollLoading = false;
		}
	}

	async function handleAuthorizeSessionKey(lease: AgentAccessLease) {
		if (leaseSessionKeyLoading) return;

		leaseSessionKeyLoading = true;
		leaseActionError = null;
		leaseActionMessage = null;

		try {
			const provider = requireInjectedWallet();
			const sessionKey = await generateStoredLeaseSessionKey();
			const challenge = await api.createAgentAccessLeaseSessionKeyChallenge({
				username: lease.username,
				leaseID: lease.id,
				input: {
					sessionPublicKey: sessionKey.publicKey,
				},
			});

			const signature = await signWalletChallenge(provider, lease.agentWallet, challenge);
			const updatedLease = await api.authorizeAgentAccessLeaseSessionKey({
				username: lease.username,
				leaseID: lease.id,
				input: {
					challengeID: challenge.id,
					signature,
				},
			});

			writeStoredLeaseSessionKey(lease.username, lease.id, sessionKey);
			upsertLease(updatedLease);
			leaseActionMessage = 'Browser session key authorized for this lease.';
		} catch (err) {
			leaseActionError = err instanceof Error ? err.message : String(err);
		} finally {
			leaseSessionKeyLoading = false;
		}
	}

	async function handleRevokeLease(lease: AgentAccessLease) {
		if (!canManage) return;
		if (revokeLeaseId) return;
		if (typeof window !== 'undefined') {
			const ok = window.confirm(`Revoke access lease ${lease.id} for @${lease.username}?`);
			if (!ok) return;
		}

		revokeLeaseId = lease.id;
		leaseActionError = null;
		leaseActionMessage = null;

		try {
			const updatedLease = await api.revokeAgentAccessLease({
				username: lease.username,
				leaseID: lease.id,
				input: revokeReason.trim() ? { reason: revokeReason.trim() } : undefined,
			});

			upsertLease(updatedLease);
			clearStoredLeaseSessionKey(lease.username, lease.id);
			clearStoredLeaseToken(lease.username, lease.id);
			refreshStoredLeaseSessionIds(lease.username);

			if (selectedLeaseId === lease.id) {
				currentLeaseToken = null;
			}

			revokeReason = '';
			leaseActionMessage = `Lease ${lease.id} revoked.`;
		} catch (err) {
			leaseActionError = err instanceof Error ? err.message : String(err);
		} finally {
			revokeLeaseId = null;
		}
	}

	// Update agent
	let editDisplayName = $state('');
	let editBio = $state('');
	let editType = $state<AgentType>('ASSISTANT');
	let editVersion = $state('');
	let capabilityDraft = $state({
		canPost: true,
		canReply: true,
		canBoost: true,
		canFollow: true,
		canDM: false,
		maxPostsPerHour: 30,
		requiresApproval: false,
		restrictedDomains: '',
	});
	let exitQuarantine = $state(false);

	let updateLoading = $state(false);
	let updateError = $state<string | null>(null);
	let updateMessage = $state<string | null>(null);

	$effect(() => {
		if (!agent) return;
		editDisplayName = agent.displayName;
		editBio = agent.bio ?? '';
		editType = agent.agentType;
		editVersion = agent.agentVersion;
		capabilityDraft = {
			canPost: agent.agentCapabilities.canPost,
			canReply: agent.agentCapabilities.canReply,
			canBoost: agent.agentCapabilities.canBoost,
			canFollow: agent.agentCapabilities.canFollow,
			canDM: agent.agentCapabilities.canDM,
			maxPostsPerHour: agent.agentCapabilities.maxPostsPerHour,
			requiresApproval: agent.agentCapabilities.requiresApproval,
			restrictedDomains: (agent.agentCapabilities.restrictedDomains ?? []).join(', '),
		};
		exitQuarantine = false;
	});

	async function handleUpdateAgent() {
		if (!agent) return;
		if (!canManage) return;
		if (updateLoading) return;

		updateLoading = true;
		updateError = null;
		updateMessage = null;

		try {
			const restrictedDomains = capabilityDraft.restrictedDomains
				.split(',')
				.map((value) => value.trim())
				.filter(Boolean);

			const updated = await api.updateAgent({
				username: agent.username,
				input: {
					displayName: editDisplayName.trim() || undefined,
					bio: editBio.trim() || undefined,
					agentType: editType,
					agentVersion: editVersion.trim() || undefined,
					version: editVersion.trim() || undefined,
					exitQuarantine: exitQuarantine ? true : undefined,
					agentCapabilities: {
						canPost: capabilityDraft.canPost,
						canReply: capabilityDraft.canReply,
						canBoost: capabilityDraft.canBoost,
						canFollow: capabilityDraft.canFollow,
						canDM: capabilityDraft.canDM,
						maxPostsPerHour: capabilityDraft.maxPostsPerHour,
						requiresApproval: capabilityDraft.requiresApproval,
						restrictedDomains: restrictedDomains.length > 0 ? restrictedDomains : undefined,
					},
				},
			});

			agent = updated;
			updateMessage = 'Agent updated.';
		} catch (err) {
			updateError = err instanceof Error ? err.message : String(err);
		} finally {
			updateLoading = false;
		}
	}

	async function handleDeleteAgent() {
		if (!agent) return;
		if (!canManage) return;
		if (typeof window !== 'undefined') {
			const ok = window.confirm(`Delete agent @${agent.username}? This cannot be undone.`);
			if (!ok) return;
		}

		try {
			await api.deleteAgent({ username: agent.username });
			window.location.assign(`${base}/agents`);
		} catch (err) {
			updateError = err instanceof Error ? err.message : String(err);
		}
	}

	// Admin actions
	let adminMessage = $state<string | null>(null);
	let adminError = $state<string | null>(null);
	let adminLoading = $state(false);

	async function handleAdminVerify(verified: boolean) {
		if (!agent) return;
		if (!canAdmin) return;
		if (adminLoading) return;

		adminLoading = true;
		adminMessage = null;
		adminError = null;

		try {
			const reason = typeof window !== 'undefined' ? window.prompt('Reason (optional)') ?? '' : '';
			const exitQuarantine =
				typeof window !== 'undefined' ? window.confirm('Exit quarantine?') : false;

			agent = verified
				? await api.adminVerifyAgent({
						username: agent.username,
						input: {
							reason: reason.trim() || undefined,
							exitQuarantine: exitQuarantine ? true : undefined,
						},
					})
				: await api.adminUnverifyAgent({
						username: agent.username,
						input: {
							reason: reason.trim() || undefined,
						},
					});

			adminMessage = verified ? 'Agent verified.' : 'Agent unverified.';
		} catch (err) {
			adminError = err instanceof Error ? err.message : String(err);
		} finally {
			adminLoading = false;
		}
	}

	async function handleAdminSuspend() {
		if (!agent) return;
		if (!canAdmin) return;
		if (typeof window !== 'undefined') {
			const ok = window.confirm(`Suspend agent @${agent.username}?`);
			if (!ok) return;
		}

		adminLoading = true;
		adminMessage = null;
		adminError = null;

		try {
			agent = await api.adminSuspendAgent({ username: agent.username });
			adminMessage = 'Agent suspended.';
		} catch (err) {
			adminError = err instanceof Error ? err.message : String(err);
		} finally {
			adminLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Agent • {$page.params.username} • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Agent</h1>

	{#if !$authSession}
		<p>Sign in to view agent details.</p>
	{:else if error}
		<div class="page__notice page__notice--error" role="alert">{error}</div>
	{:else if isLoading}
		<div class="page__notice">Loading agent…</div>
	{:else if !agent}
		<div class="page__notice">Agent not found.</div>
	{:else}
		<header class="profile-card profile-card--no-avatar">
			<div class="profile-card__body">
				<div class="profile-card__heading">
					<h2 class="profile-card__name">{agent.displayName}</h2>
					<div class="profile-card__handle">@{agent.username}</div>
				</div>

				{#if agent.bio}
					<p class="page__meta">{agent.bio}</p>
				{/if}

				<div class="profile-card__stats" role="list" aria-label="Agent stats">
					<span role="listitem">
						<strong>{formatAgentType(agent.agentType)}</strong> type
					</span>
					<span role="listitem">
						<strong>{agent.agentVersion}</strong> version
					</span>
					<span role="listitem">
						<strong>{agent.activityCount}</strong> activity events
					</span>
					<span role="listitem">
						<strong>{agent.verified ? 'Yes' : 'No'}</strong> verified
					</span>
				</div>

				{#if agent.ownerActor}
					<p class="page__meta">
						Owner:{' '}
						<a href={profileHref(agent.ownerActor.username, agent.ownerActor.domain)}>
							@{agent.ownerActor.username}{agent.ownerActor.domain ? `@${agent.ownerActor.domain}` : ''}
						</a>
					</p>
				{/if}

					<section class="page__notice">
						<strong>Capabilities</strong>
						<ul class="settings-list">
							<li class="settings-list__item">
								<div class="settings-list__body">
									<span class="settings-list__title">Posting</span>
									<dl class="capability-list" aria-label="Posting capabilities">
										<div class="capability-list__row">
											<dt>Can post</dt>
											<dd
												class={`capability-list__value ${agent.agentCapabilities.canPost ? 'capability-list__value--yes' : 'capability-list__value--no'}`}
											>
												{agent.agentCapabilities.canPost ? '✓ Yes' : '✗ No'}
											</dd>
										</div>
										<div class="capability-list__row">
											<dt>Can reply</dt>
											<dd
												class={`capability-list__value ${agent.agentCapabilities.canReply ? 'capability-list__value--yes' : 'capability-list__value--no'}`}
											>
												{agent.agentCapabilities.canReply ? '✓ Yes' : '✗ No'}
											</dd>
										</div>
										<div class="capability-list__row">
											<dt>Can boost</dt>
											<dd
												class={`capability-list__value ${agent.agentCapabilities.canBoost ? 'capability-list__value--yes' : 'capability-list__value--no'}`}
											>
												{agent.agentCapabilities.canBoost ? '✓ Yes' : '✗ No'}
											</dd>
										</div>
									</dl>
								</div>
							</li>
							<li class="settings-list__item">
								<div class="settings-list__body">
									<span class="settings-list__title">Social</span>
									<dl class="capability-list" aria-label="Social capabilities">
										<div class="capability-list__row">
											<dt>Can follow</dt>
											<dd
												class={`capability-list__value ${agent.agentCapabilities.canFollow ? 'capability-list__value--yes' : 'capability-list__value--no'}`}
											>
												{agent.agentCapabilities.canFollow ? '✓ Yes' : '✗ No'}
											</dd>
										</div>
										<div class="capability-list__row">
											<dt>Can DM</dt>
											<dd
												class={`capability-list__value ${agent.agentCapabilities.canDM ? 'capability-list__value--yes' : 'capability-list__value--no'}`}
											>
												{agent.agentCapabilities.canDM ? '✓ Yes' : '✗ No'}
											</dd>
										</div>
									</dl>
								</div>
							</li>
							<li class="settings-list__item">
								<div class="settings-list__body">
									<span class="settings-list__title">Rate limits</span>
									<dl class="capability-list" aria-label="Rate limits">
										<div class="capability-list__row">
											<dt>Max posts per hour</dt>
											<dd class="capability-list__value capability-list__value--neutral">
												{agent.agentCapabilities.maxPostsPerHour} posts/hour
											</dd>
										</div>
										<div class="capability-list__row">
											<dt>Requires approval</dt>
											<dd
												class={`capability-list__value ${agent.agentCapabilities.requiresApproval ? 'capability-list__value--yes' : 'capability-list__value--no'}`}
											>
												{agent.agentCapabilities.requiresApproval ? '✓ Yes' : '✗ No'}
											</dd>
										</div>
									</dl>
								</div>
							</li>
							{#if (agent.agentCapabilities.restrictedDomains ?? []).length > 0}
								<li class="settings-list__item">
									<div class="settings-list__body">
										<span class="settings-list__title">Restricted domains</span>
										<dl class="capability-list" aria-label="Restricted domains">
											<div class="capability-list__row">
												<dt>Domains</dt>
												<dd class="capability-list__value capability-list__value--neutral">
													{(agent.agentCapabilities.restrictedDomains ?? []).join(', ')}
												</dd>
											</div>
										</dl>
									</div>
								</li>
							{/if}
						</ul>
					</section>
			</div>
		</header>

		<section class="page__notice">
			<div class="settings-token__row">
				<div>
					<h2>OAuth connectors</h2>
					<p class="page__meta">
						Register an external MCP connector for this agent, then copy the client credentials into Claude.ai
						or another OAuth-aware MCP client.
					</p>
				</div>
				{#if canManage}
					<button
						type="button"
						class="gr-button gr-button--outline"
						disabled={runtimeLoading || connectorLoading || runtimeRevokeAllLoading || runtimeRevokeSessionId !== null}
						onclick={() => void loadRuntimeSessions()}
					>
						Refresh sessions
					</button>
				{/if}
			</div>

			{#if !canManage}
				<p class="page__meta">
					You can view this agent, but only the owner or an admin can inspect connector sessions.
				</p>
			{:else}
				<div class="settings-form__notice">
					Connector client secrets are shown only when you register them here. Simulacrum keeps the non-secret
					client metadata in this browser so matching refresh-token sessions can be surfaced after OAuth
					authorization completes. Each connector stores a single redirect URI, so register separate connectors for
					Claude.ai, Claude Code, and any custom MCP clients you want to keep distinct.
				</div>

				{#if isOwner}
					<form
						class="settings-form"
						onsubmit={(event) => {
							event.preventDefault();
							void handleRegisterConnector();
						}}
					>
						<div class="settings-field">
							<label class="settings-field__label" for="agent-connector-name">Connector name</label>
							<input
								class="settings-field__input"
								id="agent-connector-name"
								type="text"
								placeholder="Claude connector"
								bind:value={connectorClientName}
							/>
						</div>

						<div class="settings-field">
							<label class="settings-field__label" for="agent-connector-grant">Grant type</label>
							<select
								class="settings-field__select"
								id="agent-connector-grant"
								bind:value={connectorGrantProfile}
								onchange={(event) =>
									setConnectorGrantProfile(
										(event.currentTarget as HTMLSelectElement).value as AgentConnectorGrantProfile
									)}
							>
								<option value="authorization_code">Authorization code</option>
								<option value="client_credentials">Client credentials</option>
							</select>
							<p class="page__meta">
								{#if connectorGrantProfile === 'client_credentials'}
									Use this for autonomous or headless connectors that do not need an interactive browser
									callback.
								{:else}
									Use this for OAuth-aware MCP clients that complete an interactive browser authorization
									flow.
								{/if}
							</p>
						</div>

						{#if connectorGrantProfile === 'authorization_code'}
							<div class="settings-field">
								<label class="settings-field__label" for="agent-connector-client">MCP client</label>
								<select
									class="settings-field__select"
									id="agent-connector-client"
									bind:value={connectorClientPreset}
									onchange={(event) =>
										setConnectorClientPreset(
											(event.currentTarget as HTMLSelectElement).value as Exclude<
												AgentConnectorClientPreset,
												'headless'
											>
										)}
								>
									{#each CONNECTOR_CLIENT_PRESETS as preset (preset.value)}
										<option value={preset.value}>{preset.label}</option>
									{/each}
								</select>
								<p class="page__meta">
									Simulacrum stores one redirect URI per connector. Add a separate connector for each hosted
									or local MCP client you use.
								</p>
							</div>

							<div class="settings-field">
								<label class="settings-field__label" for="agent-connector-redirect">
									Redirect URI from your MCP client
								</label>
								<input
									class="settings-field__input"
									id="agent-connector-redirect"
									type="url"
									placeholder={
										connectorClientPreset === 'claude_code'
											? 'http://localhost:8787/callback'
											: 'https://example.com/callback'
									}
									bind:value={connectorRedirectUri}
								/>
								<p class="page__meta">
									{#if connectorClientPreset === 'claude_ai'}
										Claude.ai currently uses <code>{CLAUDE_AI_REDIRECT_URI}</code>.
									{:else if connectorClientPreset === 'claude_code'}
										Claude Code typically uses a localhost callback such as <code>{CLAUDE_CODE_REDIRECT_URI}</code>.
										Adjust the port if your local client shows a different callback.
									{:else}
										Enter the exact callback URI your custom MCP client expects.
									{/if}
								</p>
							</div>
						{:else}
							<div class="settings-form__notice">
								Simulacrum will register <code>{HEADLESS_REDIRECT_URI}</code> behind the scenes because Lesser
								still requires a redirect URI at registration time, but the connector will only allow
								<code>client_credentials</code> token exchange.
							</div>
						{/if}

						<div class="settings-field">
							<label class="settings-field__label" for="agent-connector-website">
								Website URL
							</label>
							<input
								class="settings-field__input"
								id="agent-connector-website"
								type="url"
								placeholder="https://simulacrum.equalto.ai"
								bind:value={connectorWebsite}
							/>
							<p class="page__meta">Optional, but using this instance origin is a good default.</p>
						</div>

						<div class="settings-field">
							<span class="settings-field__label">Scopes</span>
							<div class="settings-scopes">
								<label class="settings-field__checkbox-label">
									<input class="settings-field__checkbox" type="checkbox" bind:checked={connectorScopes.read} />
									read
								</label>
								<label class="settings-field__checkbox-label">
									<input class="settings-field__checkbox" type="checkbox" bind:checked={connectorScopes.write} />
									write
								</label>
								<label class="settings-field__checkbox-label">
									<input class="settings-field__checkbox" type="checkbox" bind:checked={connectorScopes.follow} />
									follow
								</label>
							</div>
							<p class="page__meta">
								Most MCP clients should request at least <code>read write</code>. Stored grants:
								<code>{formatGrantTypes(connectorGrantTypes(connectorGrantProfile))}</code> with
								<code>{connectorAuthMethod}</code>.
							</p>
						</div>

						<div class="settings-field">
							<label class="settings-field__label" for="agent-connector-auth-method">
								Token endpoint auth method
							</label>
							<select
								class="settings-field__select"
								id="agent-connector-auth-method"
								bind:value={connectorAuthMethod}
							>
								{#each TOKEN_ENDPOINT_AUTH_METHODS as method (method.value)}
									<option value={method.value}>{method.label}</option>
								{/each}
							</select>
							<p class="page__meta">
								{#if connectorAuthMethod === 'client_secret_basic'}
									The MCP client sends credentials via HTTP Basic authentication header instead of the
									request body. Some clients require this method.
								{:else if connectorAuthMethod === 'none'}
									Public client with no client secret. Use only when the client cannot securely store a
									secret, such as browser-only applications.
								{:else}
									The default method sends client credentials in the token request body. Compatible with
									most MCP clients including Claude.ai and Claude Code.
								{/if}
							</p>
						</div>

						<div class="settings-form__actions">
							<button type="submit" class="gr-button gr-button--solid" disabled={connectorLoading}>
								{connectorLoading ? 'Registering connector…' : 'Add connector'}
							</button>
							{#if latestConnector}
								<button
									type="button"
									class="gr-button gr-button--outline"
									onclick={() => {
										latestConnector = null;
										connectorError = null;
										connectorMessage = 'Connector secrets cleared from the page.';
									}}
								>
									Clear current secrets
								</button>
							{/if}
						</div>
					</form>
				{:else}
					<p class="page__meta">
						Admins can inspect and revoke connector sessions here, but only the agent owner can register new
						connectors.
					</p>
				{/if}

				{#if connectorError}
					<div class="settings-form__notice settings-form__notice--error" role="alert">{connectorError}</div>
				{/if}
				{#if connectorMessage}
					<div class="settings-form__notice" role="status">{connectorMessage}</div>
				{/if}
				{#if runtimeLoadError}
					<div class="settings-form__notice settings-form__notice--error" role="alert">{runtimeLoadError}</div>
				{/if}

				<div class="settings-token">
					<div class="settings-token__row">
						<strong>Current connector client ID</strong>
						<button
							type="button"
							class="gr-button gr-button--outline"
							disabled={!latestConnector?.clientId}
							onclick={() => latestConnector?.clientId && copy(latestConnector.clientId)}
						>
							Copy
						</button>
					</div>
					<pre class="settings-token__value">
						{latestConnector?.clientId || 'Register a connector above to reveal OAuth client credentials.'}
					</pre>

					<div class="settings-token__row">
						<strong>Current connector client secret</strong>
						<button
							type="button"
							class="gr-button gr-button--outline"
							disabled={!latestConnector?.clientSecret?.trim()}
							onclick={() => latestConnector?.clientSecret && copy(latestConnector.clientSecret)}
						>
							Copy
						</button>
					</div>
					<pre class="settings-token__value">
						{latestConnector?.clientSecret ||
							(latestConnector
								? 'No client secret was returned by the server.'
								: 'Client secrets are shown only once, immediately after registration.')}
					</pre>

					<div class="settings-token__row">
						<strong>OAuth discovery URL</strong>
						<button
							type="button"
							class="gr-button gr-button--outline"
							disabled={!connectorTransport?.oauthDiscoveryUrl}
							onclick={() =>
								connectorTransport?.oauthDiscoveryUrl && copy(connectorTransport.oauthDiscoveryUrl)}
						>
							Copy
						</button>
					</div>
					<pre class="settings-token__value">{connectorTransport?.oauthDiscoveryUrl ?? 'Loading…'}</pre>

					<div class="settings-token__row">
						<strong>MCP transport discovery</strong>
						<button
							type="button"
							class="gr-button gr-button--outline"
							disabled={!connectorTransport?.discoveryUrl}
							onclick={() => connectorTransport?.discoveryUrl && copy(connectorTransport.discoveryUrl)}
						>
							Copy
						</button>
					</div>
					<pre class="settings-token__value">{connectorTransport?.discoveryUrl ?? 'Loading…'}</pre>

					<div class="settings-token__row">
						<strong>Endpoint URL</strong>
						<button
							type="button"
							class="gr-button gr-button--outline"
							disabled={!connectorTransport?.endpoint}
							onclick={() => connectorTransport?.endpoint && copy(connectorTransport.endpoint)}
						>
							Copy
						</button>
					</div>
					<pre class="settings-token__value">{connectorTransport?.endpoint ?? 'Loading…'}</pre>

					{#if latestConnector}
						<div class="settings-token__meta">
							{connectorClientPresetLabel(latestConnector.clientPreset)} •
							{connectorGrantProfileLabel(latestConnector.grantProfile)} • grants
							{formatGrantTypes(latestConnector.grantTypes)} • auth
							{latestConnector.tokenEndpointAuthMethod ?? 'client_secret_post'}
							<span>
								• redirect {latestConnector.redirectUri}
							</span>
							{#if latestConnector.website}
								<span> • website {latestConnector.website}</span>
							{/if}
						</div>
						<div class="page__meta">{connectorRotationSummary(latestConnector.rotation)}</div>
						{#if connectorSecretExpirySummary(latestConnector.clientSecretExpiresAt)}
							<div class="settings-form__notice settings-form__notice--error" role="alert">
								{connectorSecretExpirySummary(latestConnector.clientSecretExpiresAt)}
							</div>
						{/if}
					{/if}
				</div>

				{#if connectorRegistrations.length > 0}
					<h3>Registered connectors</h3>
					<ul class="settings-list">
						{#each connectorRegistrations as connector (connector.clientId)}
							<li class="settings-list__item">
								<div class="settings-list__body">
									<div class="settings-list__title">{connectorTitle(connector)}</div>
									<div class="settings-list__meta">
										Client <code>{connector.clientId}</code>
										<span> • {connectorClientPresetLabel(connector.clientPreset)}</span>
										<span> • {connectorGrantProfileLabel(connector.grantProfile)}</span>
										<span> • grants {formatGrantTypes(connector.grantTypes)}</span>
										<span> • auth {connector.tokenEndpointAuthMethod ?? 'client_secret_post'}</span>
										<span> • redirect <code>{connector.redirectUri}</code></span>
										<span> • added {new Date(connector.createdAt).toLocaleString()}</span>
										<span>
											• {connectorSessionGroups.find((group) => group.connector.clientId === connector.clientId)?.sessions.length ?? 0}
											session(s)
										</span>
									</div>
									<div class="page__meta">{connectorRotationSummary(connector.rotation)}</div>
									{#if connectorSecretExpirySummary(connector.clientSecretExpiresAt)}
										<div class="settings-form__notice settings-form__notice--error" role="alert">
											{connectorSecretExpirySummary(connector.clientSecretExpiresAt)}
										</div>
									{/if}
								</div>
								<div class="settings-form__actions">
									<button
										type="button"
										class="gr-button gr-button--outline"
										onclick={() => copy(connector.clientId)}
									>
										Copy client ID
									</button>
									{#if latestConnector?.clientId === connector.clientId && latestConnector.clientSecret}
										<button
											type="button"
											class="gr-button gr-button--outline"
											onclick={() => {
												const secret = latestConnector?.clientSecret;
												if (secret) void copy(secret);
											}}
										>
											Copy current secret
										</button>
									{/if}
									{#if isOwner}
										<button
											type="button"
											class="gr-button gr-button--outline"
											disabled={connectorRotateClientId === connector.clientId}
											onclick={() => void handleRotateConnectorSecret(connector, { forceInvalidate: false })}
										>
											{connectorRotateClientId === connector.clientId ? 'Rotating…' : 'Rotate secret'}
										</button>
										<button
											type="button"
											class="gr-button gr-button--outline"
											disabled={connectorRotateClientId === connector.clientId}
											onclick={() => void handleRotateConnectorSecret(connector, { forceInvalidate: true })}
										>
											Force invalidate
										</button>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="page__notice">No connectors have been registered from this browser yet.</div>
				{/if}

				<h3>Connector sessions</h3>
				<p class="page__meta">
					Authorized refresh-token sessions are matched to the connectors registered from this browser by client
					ID. Health below uses Lesser auth diagnostics when available and falls back to expiry and revocation
					signals on older stages.
				</p>

				{#if runtimeLoading}
					<div class="page__notice">Loading connector sessions…</div>
				{:else if connectorSessionCount === 0}
					<div class="page__notice">No connector sessions have been authorized yet.</div>
				{:else}
					<ul class="settings-list">
						{#each connectorSessionGroups as group (group.connector.clientId)}
							{#each group.sessions as session (session.sessionID)}
								{@const health = connectorSessionHealth(session)}
								{@const diagnostic = session.authDiagnostic}
								<li class="settings-list__item">
									<div class="settings-list__body">
										<div class="settings-list__title">
											{connectorTitle(group.connector, session)}
											<span class={connectorSessionHealthClass(health)}>
												{connectorSessionHealthLabel(health)}
											</span>
										</div>
										<div class="settings-list__meta">
											Client <code>{session.clientID}</code> • session <code>{session.sessionID}</code>
											<span> • scope {session.scope}</span>
											<span> • created {formatDateTime(session.createdAt)}</span>
											<span> • last used {formatDateTime(session.lastUsedAt)}</span>
											<span> • idle {formatDateTime(session.idleExpiresAt)}</span>
											<span> • absolute {formatDateTime(session.absoluteExpiresAt)}</span>
											<span> • window {formatDuration(connectorSessionRemainingMs(session))}</span>
											{#if session.revokedAt}
												<span> • revoked {formatDateTime(session.revokedAt)}</span>
											{/if}
											{#if session.revokedReason}
												<span> • reason {session.revokedReason}</span>
											{/if}
										</div>
										<div class="page__meta">{connectorSessionHealthSummary(session)}</div>
										{#if diagnostic}
											<div class="page__meta">
												<span>Auth {connectorSessionDiagnosticStatusLabel(diagnostic.status)}</span>
												{#if diagnostic.lastSuccessAt}
													<span> • last success {formatDateTime(diagnostic.lastSuccessAt)}</span>
												{/if}
												{#if diagnostic.failureAt}
													<span> • last failure {formatDateTime(diagnostic.failureAt)}</span>
												{/if}
												{#if diagnostic.failureCode}
													<span> • code <code>{diagnostic.failureCode}</code></span>
												{/if}
												{#if diagnostic.failureMessage}
													<span> • {diagnostic.failureMessage}</span>
												{/if}
											</div>
										{/if}
									</div>
									<div class="settings-form__actions">
										<button
											type="button"
											class="gr-button gr-button--outline"
											disabled={runtimeRevokeSessionId === session.sessionID || session.revoked}
											onclick={() => void handleRevokeRuntimeSession(session)}
										>
											{runtimeRevokeSessionId === session.sessionID ? 'Revoking…' : 'Revoke'}
										</button>
									</div>
								</li>
							{/each}
						{/each}
					</ul>
				{/if}
			{/if}
		</section>

		{#if canManage}
			<section class="page__notice">
				<div class="settings-token__row">
					<div>
						<h2>Session cleanup</h2>
						<p class="page__meta">
							Connector sessions are surfaced above. Any unmatched sessions below were created outside the
							connector flow or before this prototype switched to OAuth-first setup.
						</p>
					</div>
					<div class="settings-form__actions">
						<button
							type="button"
							class="gr-button gr-button--outline"
							disabled={runtimeLoading || runtimeRevokeAllLoading || runtimeRevokeSessionId !== null}
							onclick={() => void loadRuntimeSessions()}
						>
							Refresh inventory
						</button>
						<button
							type="button"
							class="gr-button gr-button--outline"
							disabled={runtimeRevokeAllLoading || runtimeSessions.length === 0}
							onclick={() => void handleRevokeAllRuntimeSessions()}
						>
							{runtimeRevokeAllLoading ? 'Revoking all…' : 'Revoke all sessions'}
						</button>
					</div>
				</div>

				<div class="settings-form__notice">
					Use this section only to audit or revoke older sessions. New agent setup should happen through OAuth
					connectors above, with lease auth kept below as an advanced debugging fallback.
				</div>

				{#if runtimeLoadError}
					<div class="settings-form__notice settings-form__notice--error" role="alert">{runtimeLoadError}</div>
				{/if}
				{#if runtimeActionError}
					<div class="settings-form__notice settings-form__notice--error" role="alert">{runtimeActionError}</div>
				{/if}
				{#if runtimeActionMessage}
					<div class="settings-form__notice" role="status">{runtimeActionMessage}</div>
				{/if}

				{#if runtimeLoading}
					<div class="page__notice">Loading session inventory…</div>
				{:else if otherRuntimeSessions.length === 0}
					<div class="page__notice">No unmatched runtime sessions are present outside the connector sessions above.</div>
				{:else}
					<ul class="settings-list">
						{#each otherRuntimeSessions as session (session.sessionID)}
							<li class="settings-list__item">
								<div class="settings-list__body">
									<div class="settings-list__title">{session.deviceLabel || session.clientID}</div>
									<div class="settings-list__meta">
										Session <code>{session.sessionID}</code> • {session.revoked ? 'revoked' : 'active'}
										<span> • client <code>{session.clientID}</code></span>
										<span> • scope {session.scope}</span>
										<span> • created {formatDateTime(session.createdAt)}</span>
										<span> • last used {formatDateTime(session.lastUsedAt)}</span>
										<span> • idle {formatDateTime(session.idleExpiresAt)}</span>
										<span> • absolute {formatDateTime(session.absoluteExpiresAt)}</span>
										{#if session.revokedAt}
											<span> • revoked {formatDateTime(session.revokedAt)}</span>
										{/if}
										{#if session.revokedReason}
											<span> • reason {session.revokedReason}</span>
										{/if}
									</div>
								</div>
								<div class="settings-form__actions">
									<button
										type="button"
										class="gr-button gr-button--outline"
										disabled={runtimeRevokeSessionId === session.sessionID || session.revoked}
										onclick={() => void handleRevokeRuntimeSession(session)}
									>
										{runtimeRevokeSessionId === session.sessionID ? 'Revoking…' : 'Revoke'}
									</button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<AgentMcpPanel
			{canManage}
			agentUsername={agent?.username ?? ''}
			{latestConnector}
			storedConnectors={connectorRegistrations}
			{connectorSessionCount}
			selectedLease={selectedLease}
			leaseToken={currentLeaseToken}
		/>

		<section class="page__notice">
			<div class="settings-token__row">
				<div>
						<h2>Lease-based auth (advanced)</h2>
						<p class="page__meta">
							OAuth connectors above are the standard setup path. Use wallet-backed leases only when you
							specifically need a browser-assisted authenticated probe or another manual debugging flow.
						</p>
					</div>
				{#if canManage}
					<button
						type="button"
						class="gr-button gr-button--outline"
						disabled={leaseLoading || leaseEnrollLoading || leaseTokenLoading || leaseSessionKeyLoading || revokeLeaseId !== null}
						onclick={() => void loadLeaseData()}
					>
						Refresh
					</button>
				{/if}
			</div>

			{#if !canManage}
				<p class="page__meta">You can view this agent, but only the owner or an admin can inspect its access leases.</p>
			{:else}
				{#if canEnrollLease}
					<form
						class="settings-form"
						onsubmit={(event) => {
							event.preventDefault();
							void handleCreateLease();
						}}
					>
						<div class="settings-field">
							<label class="settings-field__label" for="agent-lease-wallet">Principal wallet</label>
							<select
								class="settings-field__select"
								id="agent-lease-wallet"
								bind:value={leasePrincipalWallet}
								disabled={linkedWallets.length === 0 || pendingLeaseEnrollment !== null}
							>
								<option value="">Select one of your linked wallets</option>
								{#each linkedWallets as wallet (wallet.id)}
									<option value={wallet.address}>
										{wallet.name ? `${wallet.name} · ` : ''}{formatWalletAddress(wallet.address)}
										{wallet.verified ? ' · verified' : ''}
									</option>
								{/each}
							</select>
							<p class="page__meta">This must be one of the owner account’s linked wallets.</p>
						</div>

						<div class="settings-field">
							<label class="settings-field__label" for="agent-lease-agent-wallet">Agent wallet</label>
							<input
								class="settings-field__input"
								id="agent-lease-agent-wallet"
								type="text"
								placeholder="0x..."
								bind:value={leaseAgentWallet}
								disabled={pendingLeaseEnrollment !== null}
							/>
							{#if boundSoul}
								<p class="page__meta">
									Bound soul suggests agent wallet <code>{boundSoul.agent.wallet}</code> and principal
									<code>{boundSoul.agent.principalAddress}</code>.
								</p>
							{:else}
								<p class="page__meta">
									Enter the wallet linked to the agent account. If this body was created from a soul, the Souls page
									shows the expected wallet address.
								</p>
							{/if}
						</div>

						<div class="settings-field">
							<label class="settings-field__label" for="agent-lease-label">Device label</label>
							<input
								class="settings-field__input"
								id="agent-lease-label"
								type="text"
								placeholder="simulacrum-browser"
								bind:value={leaseDeviceLabel}
								disabled={pendingLeaseEnrollment !== null}
							/>
						</div>

						<div class="settings-field">
							<label class="settings-field__label" for="agent-lease-idle">Idle timeout (hours)</label>
							<input
								class="settings-field__input"
								id="agent-lease-idle"
								type="number"
								min="1"
								step="1"
								placeholder="defaults to 168"
								bind:value={leaseIdleHours}
								disabled={pendingLeaseEnrollment !== null}
							/>
						</div>

						<div class="settings-field">
							<label class="settings-field__label" for="agent-lease-absolute">Absolute max age (hours)</label>
							<input
								class="settings-field__input"
								id="agent-lease-absolute"
								type="number"
								min="1"
								step="1"
								placeholder="defaults to 2160"
								bind:value={leaseAbsoluteHours}
								disabled={pendingLeaseEnrollment !== null}
							/>
						</div>

						<div class="settings-field">
							<span class="settings-field__label">Scopes</span>
							<div class="settings-scopes">
								<label class="settings-field__checkbox-label">
									<input
										class="settings-field__checkbox"
										type="checkbox"
										bind:checked={leaseScopes.read}
										disabled={pendingLeaseEnrollment !== null}
									/>
									read
								</label>
								<label class="settings-field__checkbox-label">
									<input
										class="settings-field__checkbox"
										type="checkbox"
										bind:checked={leaseScopes.write}
										disabled={pendingLeaseEnrollment !== null}
									/>
									write
								</label>
								<label class="settings-field__checkbox-label">
									<input
										class="settings-field__checkbox"
										type="checkbox"
										bind:checked={leaseScopes.follow}
										disabled={pendingLeaseEnrollment !== null}
									/>
									follow
								</label>
							</div>
							<p class="page__meta">
								MCP write tools require <code>write</code>. <code>follow</code> alone is not enough.
							</p>
						</div>

						<div class="settings-field">
							<label class="settings-field__checkbox-label" for="agent-lease-session-key">
								<input
									class="settings-field__checkbox"
									id="agent-lease-session-key"
									type="checkbox"
									bind:checked={attachBrowserSessionKey}
									disabled={pendingLeaseEnrollment !== null}
								/>
								Attach a browser session key so renewal can happen without another wallet signature
							</label>
							<p class="page__meta">
								If the principal and agent wallets differ, you will sign twice. After switching wallet
								accounts, click the lease button again to continue from the pending step.
							</p>
							<p class="page__meta">
								Injected wallet currently selected:
								{#if injectedWalletAddress}
									<code>{injectedWalletAddress}</code>
								{:else}
									none
								{/if}
							</p>
						</div>

						{#if pendingLeaseEnrollment}
							<div class="settings-form__notice" role="status">
								{#if pendingLeaseSigner === 'principal'}
									Lease challenges are ready. Connect principal wallet
									<code>{pendingLeaseWallet}</code> and continue signing.
								{:else if pendingLeaseSigner === 'agent'}
									Principal signature recorded. Switch to agent wallet
									<code>{pendingLeaseWallet}</code> and continue signing.
								{:else}
									Both signatures are captured. Finalize the advanced lease to mint its first bearer token.
								{/if}
							</div>
						{/if}

						{#if linkedWallets.length === 0}
							<div class="settings-form__notice settings-form__notice--error" role="alert">
								No linked principal wallets were found. Link a wallet in <a href="/auth/wallet">auth</a> before
								creating a lease.
							</div>
						{/if}

						<div class="settings-form__actions">
							<button
								type="submit"
								class="gr-button gr-button--solid"
								disabled={leaseEnrollLoading || (!pendingLeaseEnrollment && linkedWallets.length === 0)}
							>
								{leaseCreateButtonLabel}
							</button>
							{#if pendingLeaseEnrollment}
								<button
									type="button"
									class="gr-button gr-button--outline"
									disabled={leaseEnrollLoading}
									onclick={() => {
										leaseActionError = null;
										resetPendingLeaseEnrollment('Pending lease signing discarded.');
									}}
								>
									Discard pending signing
								</button>
							{/if}
						</div>
					</form>
				{:else}
					<p class="page__meta">
						Admins can inspect and revoke leases here, but only the agent owner can create one because enrollment
						requires wallet signatures from both the owner and the agent body.
					</p>
				{/if}

				{#if leaseLoadError}
					<div class="settings-form__notice settings-form__notice--error" role="alert">{leaseLoadError}</div>
				{/if}
				{#if leaseActionError}
					<div class="settings-form__notice settings-form__notice--error" role="alert">{leaseActionError}</div>
				{/if}
				{#if leaseActionMessage}
					<div class="settings-form__notice" role="status">{leaseActionMessage}</div>
				{/if}

				{#if leaseLoading}
					<div class="page__notice">Loading access leases…</div>
				{:else if leases.length === 0}
					<div class="page__notice">No access leases exist for this agent yet.</div>
				{:else}
					<ul class="settings-list">
						{#each leases as lease (lease.id)}
							<li class="settings-list__item">
								<div class="settings-list__body">
									<div class="settings-list__title">{lease.deviceLabel}</div>
									<div class="settings-list__meta">
										Lease <code>{lease.id}</code> • {lease.status}
										<span> • scope {lease.scopes.join(' ')}</span>
										<span> • idle {formatDateTime(lease.idleExpiresAt)}</span>
										<span> • absolute {formatDateTime(lease.absoluteExpiresAt)}</span>
										{#if lease.sessionPublicKey}
											<span> • session key attached</span>
											{#if storedSessionLeaseIds.includes(lease.id)}
												<span> • in this browser</span>
											{/if}
										{/if}
									</div>
								</div>
								<button
									type="button"
									class="gr-button gr-button--outline"
									onclick={() => {
										selectedLeaseId = lease.id;
										leaseActionError = null;
										leaseActionMessage = null;
									}}
								>
									{selectedLeaseId === lease.id ? 'Selected' : 'Select'}
								</button>
							</li>
						{/each}
					</ul>
				{/if}

				{#if selectedLease}
					<div class="settings-token">
						<div class="settings-token__row">
							<strong>Current advanced bearer token</strong>
							<button
								type="button"
								class="gr-button gr-button--outline"
								disabled={!currentLeaseToken?.accessToken?.trim()}
								onclick={() => currentLeaseToken?.accessToken && copy(currentLeaseToken.accessToken)}
							>
								Copy
							</button>
						</div>
						<pre class="settings-token__value">{leaseTokenValue}</pre>
						<div class="settings-token__meta">
							Lease <code>{selectedLease.id}</code> • status {selectedLease.status} • scope{' '}
							{currentLeaseToken?.scope ?? selectedLease.scopes.join(' ')}
							{#if currentLeaseToken}
								<span> • token expires in {currentLeaseToken.expiresIn}s</span>
							{/if}
						</div>
						<div class="settings-token__meta">
							Principal {formatWalletAddress(selectedLease.principalWallet)} • Agent {formatWalletAddress(selectedLease.agentWallet)}
							• idle {formatLeaseHours(selectedLease.idleTimeoutHours)} • last used {formatDateTime(selectedLease.lastUsedAt)}
						</div>
						<div class="settings-token__meta">
							Session key:
							{#if selectedLeaseHasStoredSessionKey}
								authorized in this browser
							{:else if selectedLease.sessionPublicKey}
								authorized on lease, but not stored in this browser
							{:else}
								not attached
							{/if}
						</div>
					</div>

					<div class="settings-form">
						<div class="settings-field">
							<label class="settings-field__label" for="agent-lease-revoke-reason">Revoke reason (optional)</label>
							<input
								class="settings-field__input"
								id="agent-lease-revoke-reason"
								type="text"
								placeholder="optional"
								bind:value={revokeReason}
							/>
						</div>

						<div class="settings-form__actions">
							{#if canEnrollLease}
								<button
									type="button"
									class="gr-button gr-button--solid"
									disabled={leaseTokenLoading || selectedLease.status.trim().toLowerCase() !== 'active'}
									onclick={() => void mintLeaseToken(selectedLease)}
								>
									{leaseTokenLoading ? 'Minting token…' : 'Mint bearer token'}
								</button>
								<button
									type="button"
									class="gr-button gr-button--outline"
									disabled={leaseSessionKeyLoading || selectedLease.status.trim().toLowerCase() !== 'active'}
									onclick={() => void handleAuthorizeSessionKey(selectedLease)}
								>
									{leaseSessionKeyLoading
										? 'Authorizing session key…'
										: selectedLease.sessionPublicKey
											? 'Rotate browser session key'
											: 'Attach browser session key'}
								</button>
							{/if}
							<button
								type="button"
								class="gr-button gr-button--outline"
								disabled={revokeLeaseId === selectedLease.id || selectedLease.status.trim().toLowerCase() === 'revoked'}
								onclick={() => void handleRevokeLease(selectedLease)}
							>
								{revokeLeaseId === selectedLease.id ? 'Revoking…' : 'Revoke lease'}
							</button>
						</div>
					</div>
				{/if}
			{/if}
		</section>

		<section class="page__notice">
			<h2>Manage agent</h2>
			{#if !canManage}
				<p class="page__meta">Only the agent owner (or admin) can update metadata and capabilities.</p>
			{:else}
				<form
					class="settings-form"
					onsubmit={(event) => {
						event.preventDefault();
						void handleUpdateAgent();
					}}
				>
					<div class="settings-field">
						<label class="settings-field__label" for="agent-edit-name">Display name</label>
						<input class="settings-field__input" id="agent-edit-name" type="text" bind:value={editDisplayName} />
					</div>
					<div class="settings-field">
						<label class="settings-field__label" for="agent-edit-bio">Bio</label>
						<textarea class="settings-field__textarea" id="agent-edit-bio" rows="3" bind:value={editBio}></textarea>
					</div>
					<div class="settings-field">
						<label class="settings-field__label" for="agent-edit-type">Type</label>
						<select class="settings-field__select" id="agent-edit-type" bind:value={editType}>
							{#each AGENT_TYPES as entry (entry.value)}
								<option value={entry.value}>{entry.label}</option>
							{/each}
						</select>
					</div>
					<div class="settings-field">
						<label class="settings-field__label" for="agent-edit-version">Version</label>
						<input class="settings-field__input" id="agent-edit-version" type="text" bind:value={editVersion} />
					</div>

					<div class="settings-field">
						<span class="settings-field__label">Capabilities</span>
						<div class="settings-scopes">
							<label class="settings-field__checkbox-label">
								<input class="settings-field__checkbox" type="checkbox" bind:checked={capabilityDraft.canPost} />
								canPost
							</label>
							<label class="settings-field__checkbox-label">
								<input class="settings-field__checkbox" type="checkbox" bind:checked={capabilityDraft.canReply} />
								canReply
							</label>
							<label class="settings-field__checkbox-label">
								<input class="settings-field__checkbox" type="checkbox" bind:checked={capabilityDraft.canBoost} />
								canBoost
							</label>
							<label class="settings-field__checkbox-label">
								<input class="settings-field__checkbox" type="checkbox" bind:checked={capabilityDraft.canFollow} />
								canFollow
							</label>
							<label class="settings-field__checkbox-label">
								<input class="settings-field__checkbox" type="checkbox" bind:checked={capabilityDraft.canDM} />
								canDM
							</label>
							<label class="settings-field__checkbox-label">
								<input
									class="settings-field__checkbox"
									type="checkbox"
									bind:checked={capabilityDraft.requiresApproval}
								/>
								requiresApproval
							</label>
						</div>
					</div>

					<div class="settings-field">
						<label class="settings-field__label" for="agent-edit-max">Max posts per hour</label>
						<input
							class="settings-field__input"
							id="agent-edit-max"
							type="number"
							min="0"
							step="1"
							bind:value={capabilityDraft.maxPostsPerHour}
						/>
					</div>

					<div class="settings-field">
						<label class="settings-field__label" for="agent-edit-domains">Restricted domains (comma-separated)</label>
						<input
							class="settings-field__input"
							id="agent-edit-domains"
							type="text"
							bind:value={capabilityDraft.restrictedDomains}
							placeholder="example.com, spam.tld"
						/>
					</div>

					<div class="settings-field">
						<label class="settings-field__checkbox-label" for="agent-exit-quarantine">
							<input
								class="settings-field__checkbox"
								id="agent-exit-quarantine"
								type="checkbox"
								bind:checked={exitQuarantine}
							/>
							Exit quarantine (if applicable)
						</label>
					</div>

					{#if updateError}
						<div class="settings-form__notice settings-form__notice--error" role="alert">{updateError}</div>
					{:else if updateMessage}
						<div class="settings-form__notice">{updateMessage}</div>
					{/if}

					<div class="settings-form__actions">
						<button type="submit" class="gr-button gr-button--solid" disabled={updateLoading}>
							{updateLoading ? 'Saving…' : 'Save changes'}
						</button>
						<button type="button" class="gr-button gr-button--outline" onclick={handleDeleteAgent}>
							Delete agent
						</button>
					</div>
				</form>
			{/if}
		</section>

		{#if canAdmin}
			<section class="page__notice">
				<h2>Admin actions</h2>
				{#if adminError}
					<div class="page__notice page__notice--error" role="alert">{adminError}</div>
				{:else if adminMessage}
					<div class="page__notice">{adminMessage}</div>
				{/if}

				<div class="settings-form__actions">
					<button
						type="button"
						class="gr-button gr-button--outline"
						onclick={() => handleAdminVerify(true)}
						disabled={adminLoading}
					>
						Verify
					</button>
					<button
						type="button"
						class="gr-button gr-button--outline"
						onclick={() => handleAdminVerify(false)}
						disabled={adminLoading}
					>
						Unverify
					</button>
					<button
						type="button"
						class="gr-button gr-button--outline"
						onclick={handleAdminSuspend}
						disabled={adminLoading}
					>
						Suspend
					</button>
				</div>
			</section>
		{/if}

		<section class="page__notice">
			<h2>Activity log</h2>
			{#if activityError}
				<div class="page__notice page__notice--error" role="alert">{activityError}</div>
			{:else if activityLoading && activityItems.length === 0}
				<div class="page__notice">Loading activity…</div>
			{:else if activityItems.length === 0}
				<div class="page__notice">No activity events yet.</div>
			{:else}
				<ul class="settings-list">
					{#each activityItems as edge (edge.node.eventId)}
						<li class="settings-list__item">
							<div class="settings-list__body">
								<div class="settings-list__title">{edge.node.action}</div>
								<div class="settings-list__meta">
									{new Date(edge.node.timestamp).toLocaleString()}
									{#if edge.node.targetId}
										<span> • {edge.node.targetId}</span>
									{/if}
								</div>
								{#if edge.node.metadataJson}
									<details>
										<summary>Metadata</summary>
										<pre class="settings-token__value">{edge.node.metadataJson}</pre>
									</details>
								{/if}
							</div>
						</li>
					{/each}
				</ul>

				{#if activity?.pageInfo?.hasNextPage}
					<div class="settings-form__actions">
						<button type="button" class="gr-button gr-button--outline" onclick={loadMoreActivity} disabled={activityLoading}>
							Load more
						</button>
					</div>
				{/if}
			{/if}
		</section>
	{/if}
</section>
