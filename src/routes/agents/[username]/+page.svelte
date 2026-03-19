<script lang="ts">
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import {
		api,
		type Agent,
		type AgentAccessLease,
		type AgentAccessLeaseChallenge,
		type AgentActivityConnection,
		type AgentConnectorRegistration,
		type AgentDelegation,
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

	function formatAgentType(value: AgentType) {
		return AGENT_TYPES.find((entry) => entry.value === value)?.label ?? value;
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
		const viewerUsername = normalizeUsername(viewer?.username);
		if (!viewerUsername || !agent) return false;

		return [agent.agentOwner, agent.ownerActor?.username].some(
			(candidate) => normalizeUsername(candidate) === viewerUsername
		);
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
	};

	const AGENT_CONNECTOR_STORAGE_PREFIX = 'simulacrum:agent-connectors:';

	function agentConnectorStorageKey(username: string): string {
		return `${AGENT_CONNECTOR_STORAGE_PREFIX}${normalizeUsername(username)}`;
	}

	function readStoredAgentConnectors(username: string): StoredAgentConnector[] {
		if (!browser || !username) return [];

		try {
			const raw = localStorage.getItem(agentConnectorStorageKey(username));
			if (!raw) return [];

			const parsed = JSON.parse(raw) as StoredAgentConnector[];
			if (!Array.isArray(parsed)) return [];

			return parsed
				.filter((connector) => connector && typeof connector === 'object')
				.filter(
					(connector) =>
						typeof connector.clientId === 'string' &&
						typeof connector.name === 'string' &&
						typeof connector.redirectUri === 'string'
				);
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
		};

		const nextConnectors = [
			nextConnector,
			...readStoredAgentConnectors(username).filter(
				(connector) => connector.clientId !== registration.clientId
			),
		];

		writeStoredAgentConnectors(username, nextConnectors);
		return nextConnectors;
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
		connectorRedirectUri = '';
		connectorWebsite = browser ? window.location.origin : '';
		connectorScopes = { read: true, write: true, follow: true };
		connectorLoading = false;
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
	let connectorClientName = $state('');
	let connectorRedirectUri = $state('');
	let connectorWebsite = $state('');
	let connectorScopes = $state({ read: true, write: true, follow: true });
	let connectorLoading = $state(false);
	let connectorError = $state<string | null>(null);
	let connectorMessage = $state<string | null>(null);

	const connectorTransport = $derived.by(() =>
		browser ? resolveMcpTransport(window.location.origin) : null
	);

	// Standard runtime bearer + refresh sessions
	let runtimeSessions = $state<AgentRuntimeSession[]>([]);
	let selectedRuntimeSessionId = $state('');
	let runtimeCredentials = $state<AgentDelegation | null>(null);
	let runtimeScopes = $state({ read: true, write: true, follow: true });
	let runtimeExpiresIn = $state('');
	let runtimeLoading = $state(false);
	let runtimeIssueLoading = $state(false);
	let runtimeRevokeAllLoading = $state(false);
	let runtimeRevokeSessionId = $state<string | null>(null);
	let runtimeLoadError = $state<string | null>(null);
	let runtimeActionError = $state<string | null>(null);
	let runtimeActionMessage = $state<string | null>(null);

	const selectedRuntimeSession = $derived.by(
		() => runtimeSessions.find((session) => session.sessionID === selectedRuntimeSessionId) ?? null
	);
	const runtimeTokenValue = $derived.by(
		() =>
			runtimeCredentials?.accessToken?.trim() ||
			(runtimeIssueLoading ? 'Issuing runtime credentials…' : 'Issue runtime credentials to reveal an access token.')
	);
	const runtimeRefreshValue = $derived.by(
		() =>
			runtimeCredentials?.refreshToken?.trim() ||
			(runtimeIssueLoading ? 'Issuing runtime credentials…' : 'Refresh tokens are shown only after issuing a runtime session.')
	);
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

	function selectedRuntimeScopes(): string[] {
		const scopes: string[] = [];
		if (runtimeScopes.read) scopes.push('read');
		if (runtimeScopes.write) scopes.push('write');
		if (runtimeScopes.follow) scopes.push('follow');
		return scopes;
	}

	function selectedConnectorScopes(): string[] {
		const scopes: string[] = [];
		if (connectorScopes.read) scopes.push('read');
		if (connectorScopes.write) scopes.push('write');
		if (connectorScopes.follow) scopes.push('follow');
		return scopes;
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

		try {
			redirectUri = ensureAbsoluteUrl(connectorRedirectUri, 'Redirect URI');
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
				website,
			});

			latestConnector = registration;
			connectorRegistrations = rememberAgentConnector(agent.username, registration);
			connectorMessage =
				'Connector registered. Paste the client credentials into your MCP client and finish OAuth authorization there.';
		} catch (error) {
			connectorError = error instanceof Error ? error.message : String(error);
		} finally {
			connectorLoading = false;
		}
	}

	function connectorTitle(connector: StoredAgentConnector, fallbackSession?: AgentRuntimeSession | null): string {
		return connector.name.trim() || fallbackSession?.deviceLabel?.trim() || connector.clientId;
	}

	function refreshSelectedRuntimeSessionId(nextSessions: readonly AgentRuntimeSession[] = runtimeSessions) {
		selectedRuntimeSessionId =
			selectedRuntimeSessionId && nextSessions.some((session) => session.sessionID === selectedRuntimeSessionId)
				? selectedRuntimeSessionId
				: nextSessions[0]?.sessionID ?? '';
	}

	function upsertRuntimeSession(nextSession: AgentRuntimeSession) {
		const nextSessions = sortRuntimeSessions([
			nextSession,
			...runtimeSessions.filter((existingSession) => existingSession.sessionID !== nextSession.sessionID),
		]);
		runtimeSessions = nextSessions;
		selectedRuntimeSessionId = nextSession.sessionID;
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
			refreshSelectedRuntimeSessionId(nextSessions);
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			runtimeLoadError = err instanceof Error ? err.message : String(err);
			runtimeSessions = [];
			selectedRuntimeSessionId = '';
		} finally {
			runtimeLoading = false;
		}
	}

	async function handleIssueRuntimeCredentials() {
		if (!agent) return;
		if (!isOwner) return;
		if (runtimeIssueLoading) return;

		const scopes = selectedRuntimeScopes();
		if (scopes.length === 0) {
			runtimeActionError = 'Select at least one runtime scope.';
			return;
		}

		const expiresInRaw = runtimeExpiresIn.trim();
		const parsedExpiresIn = expiresInRaw ? Number.parseInt(expiresInRaw, 10) : null;
		if (expiresInRaw && (parsedExpiresIn === null || !Number.isFinite(parsedExpiresIn) || parsedExpiresIn <= 0)) {
			runtimeActionError = 'Runtime access token TTL must be a positive whole number of seconds.';
			return;
		}

		runtimeIssueLoading = true;
		runtimeActionError = null;
		runtimeActionMessage = null;

		try {
			runtimeCredentials = await api.delegateToAgent({
				input: {
					agentUsername: agent.username,
					displayName: agent.displayName,
					bio: agent.bio ?? undefined,
					scopes,
					expiresIn: parsedExpiresIn !== null && Number.isFinite(parsedExpiresIn) ? parsedExpiresIn : undefined,
					agentType: agent.agentType,
					agentVersion: agent.agentVersion,
					version: agent.agentVersion,
				},
			});

			await loadRuntimeSessions();
			runtimeActionMessage =
				'Runtime credentials issued. Copy the refresh token into your local runtime; it is not stored outside this page.';
		} catch (err) {
			runtimeActionError = err instanceof Error ? err.message : String(err);
		} finally {
			runtimeIssueLoading = false;
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
		selectedRuntimeSessionId = '';
		runtimeCredentials = null;
		runtimeScopes = { read: true, write: true, follow: true };
		runtimeExpiresIn = '';
		runtimeLoading = false;
		runtimeIssueLoading = false;
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
		if (!agent) return;
		const allowedScopes = new Set(agent.delegatedScopes.map((scope) => scope.trim().toLowerCase()));
		if (allowedScopes.size === 0) return;

		runtimeScopes = {
			read: allowedScopes.has('read'),
			write: allowedScopes.has('write'),
			follow: allowedScopes.has('follow'),
		};
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
					authorization completes.
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
							<label class="settings-field__label" for="agent-connector-redirect">
								Redirect URI from your MCP client
							</label>
							<input
								class="settings-field__input"
								id="agent-connector-redirect"
								type="url"
								placeholder="https://claude.ai/api/mcp/auth_callback"
								bind:value={connectorRedirectUri}
							/>
							<p class="page__meta">
								Claude.ai currently uses <code>https://claude.ai/api/mcp/auth_callback</code>.
							</p>
						</div>

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
								Most MCP clients should request at least <code>read write</code>.
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

				<div class="settings-token" aria-live="polite">
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
						<strong>Discovery URL</strong>
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
							Redirect URI: {latestConnector.redirectUri}
							{#if latestConnector.website}
								<span> • website {latestConnector.website}</span>
							{/if}
						</div>
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
										<span> • redirect <code>{connector.redirectUri}</code></span>
										<span> • added {new Date(connector.createdAt).toLocaleString()}</span>
										<span>
											• {connectorSessionGroups.find((group) => group.connector.clientId === connector.clientId)?.sessions.length ?? 0}
											session(s)
										</span>
									</div>
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
					ID.
				</p>

				{#if runtimeLoading}
					<div class="page__notice">Loading connector sessions…</div>
				{:else if connectorSessionCount === 0}
					<div class="page__notice">No connector sessions have been authorized yet.</div>
				{:else}
					<ul class="settings-list">
						{#each connectorSessionGroups as group (group.connector.clientId)}
							{#each group.sessions as session (session.sessionID)}
								<li class="settings-list__item">
									<div class="settings-list__body">
										<div class="settings-list__title">{connectorTitle(group.connector, session)}</div>
										<div class="settings-list__meta">
											Client <code>{session.clientID}</code> • session <code>{session.sessionID}</code>
											<span> • {session.revoked ? 'revoked' : 'active'}</span>
											<span> • scope {session.scope}</span>
											<span> • created {formatDateTime(session.createdAt)}</span>
											<span> • last used {formatDateTime(session.lastUsedAt)}</span>
											{#if session.revokedAt}
												<span> • revoked {formatDateTime(session.revokedAt)}</span>
											{/if}
										</div>
									</div>
									<div class="settings-form__actions">
										<button
											type="button"
											class="gr-button gr-button--outline"
											onclick={() => {
												selectedRuntimeSessionId = session.sessionID;
												runtimeActionError = null;
												runtimeActionMessage = null;
											}}
										>
											{selectedRuntimeSessionId === session.sessionID ? 'Selected' : 'Select'}
										</button>
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

		<section class="page__notice">
			<div class="settings-token__row">
				<div>
					<h2>Runtime sessions</h2>
					<p class="page__meta">
						Issue direct bearer + refresh credentials for local runtimes, CLI tools, or advanced debugging.
						OAuth connectors above remain the recommended path for hosted MCP clients.
					</p>
				</div>
				{#if canManage}
					<button
						type="button"
						class="gr-button gr-button--outline"
						disabled={runtimeLoading || runtimeIssueLoading || runtimeRevokeAllLoading || runtimeRevokeSessionId !== null}
						onclick={() => void loadRuntimeSessions()}
					>
						Refresh
					</button>
				{/if}
			</div>

			{#if !canManage}
				<p class="page__meta">
					You can view this agent, but only the owner or an admin can inspect its runtime sessions.
				</p>
			{:else}
				<div class="settings-form__notice">
					Use these direct bearer credentials only when you need a local runtime bootstrap or a manual MCP/debug
					session. Keep the refresh token only in the runtime that will rotate it.
				</div>

				{#if isOwner}
					<form
						class="settings-form"
						onsubmit={(event) => {
							event.preventDefault();
							void handleIssueRuntimeCredentials();
						}}
					>
						<div class="settings-field">
							<label class="settings-field__label" for="agent-runtime-expires">
								Access token TTL override (seconds)
							</label>
							<input
								class="settings-field__input"
								id="agent-runtime-expires"
								type="number"
								min="60"
								step="60"
								placeholder="optional"
								bind:value={runtimeExpiresIn}
							/>
							<p class="page__meta">
								Leave blank unless you want a shorter-lived bearer token for a one-off local bootstrap.
							</p>
						</div>

						<div class="settings-field">
							<span class="settings-field__label">Scopes</span>
							<div class="settings-scopes">
								<label class="settings-field__checkbox-label">
									<input class="settings-field__checkbox" type="checkbox" bind:checked={runtimeScopes.read} />
									read
								</label>
								<label class="settings-field__checkbox-label">
									<input class="settings-field__checkbox" type="checkbox" bind:checked={runtimeScopes.write} />
									write
								</label>
								<label class="settings-field__checkbox-label">
									<input class="settings-field__checkbox" type="checkbox" bind:checked={runtimeScopes.follow} />
									follow
								</label>
							</div>
							<p class="page__meta">
								MCP write tools require <code>write</code>. <code>follow</code> alone is not enough.
							</p>
						</div>

						<div class="settings-form__actions">
							<button type="submit" class="gr-button gr-button--solid" disabled={runtimeIssueLoading}>
								{runtimeIssueLoading ? 'Issuing runtime credentials…' : 'Issue runtime credentials'}
							</button>
							{#if runtimeCredentials}
								<button
									type="button"
									class="gr-button gr-button--outline"
									onclick={() => {
										runtimeCredentials = null;
										runtimeActionError = null;
										runtimeActionMessage = 'Runtime secrets cleared from the page.';
									}}
								>
									Clear current secrets
								</button>
							{/if}
							<button
								type="button"
								class="gr-button gr-button--outline"
								disabled={runtimeRevokeAllLoading || runtimeSessions.length === 0}
								onclick={() => void handleRevokeAllRuntimeSessions()}
							>
								{runtimeRevokeAllLoading ? 'Revoking all…' : 'Revoke all agent sessions'}
							</button>
						</div>
					</form>
				{:else}
					<p class="page__meta">
						Admins can inspect and revoke runtime sessions here, but only the agent owner can issue new runtime
						credentials.
					</p>
				{/if}

				{#if runtimeLoadError}
					<div class="settings-form__notice settings-form__notice--error" role="alert">{runtimeLoadError}</div>
				{/if}
				{#if runtimeActionError}
					<div class="settings-form__notice settings-form__notice--error" role="alert">{runtimeActionError}</div>
				{/if}
				{#if runtimeActionMessage}
					<div class="settings-form__notice" role="status">{runtimeActionMessage}</div>
				{/if}

				<div class="settings-token" aria-live="polite">
					<div class="settings-token__row">
						<strong>Current runtime access token</strong>
						<button
							type="button"
							class="gr-button gr-button--outline"
							disabled={!runtimeCredentials?.accessToken?.trim()}
							onclick={() => runtimeCredentials?.accessToken && copy(runtimeCredentials.accessToken)}
						>
							Copy
						</button>
					</div>
					<pre class="settings-token__value">{runtimeTokenValue}</pre>

					<div class="settings-token__row">
						<strong>Current runtime refresh token</strong>
						<button
							type="button"
							class="gr-button gr-button--outline"
							disabled={!runtimeCredentials?.refreshToken?.trim()}
							onclick={() => runtimeCredentials?.refreshToken && copy(runtimeCredentials.refreshToken)}
						>
							Copy
						</button>
					</div>
					<pre class="settings-token__value">{runtimeRefreshValue}</pre>

					{#if runtimeCredentials}
						<div class="settings-token__meta">
							Scope: {runtimeCredentials.scope} • Access token expires in {runtimeCredentials.expiresIn}s
							{#if selectedRuntimeSession}
								<span> • session <code>{selectedRuntimeSession.sessionID}</code></span>
							{/if}
						</div>
					{/if}
				</div>

				{#if runtimeLoading}
					<div class="page__notice">Loading runtime sessions…</div>
				{:else if otherRuntimeSessions.length === 0}
					<div class="page__notice">No local runtime sessions exist outside the connector sessions above.</div>
				{:else}
					<ul class="settings-list">
						{#each otherRuntimeSessions as session (session.sessionID)}
							<li class="settings-list__item">
								<div class="settings-list__body">
									<div class="settings-list__title">{session.deviceLabel || session.clientID}</div>
									<div class="settings-list__meta">
										Session <code>{session.sessionID}</code> • {session.revoked ? 'revoked' : 'active'}
										<span> • scope {session.scope}</span>
										<span> • created {formatDateTime(session.createdAt)}</span>
										<span> • last used {formatDateTime(session.lastUsedAt)}</span>
										<span> • idle {formatDateTime(session.idleExpiresAt)}</span>
										<span> • absolute {formatDateTime(session.absoluteExpiresAt)}</span>
										{#if session.revokedAt}
											<span> • revoked {formatDateTime(session.revokedAt)}</span>
										{/if}
									</div>
								</div>
								<div class="settings-form__actions">
									<button
										type="button"
										class="gr-button gr-button--outline"
										onclick={() => {
											selectedRuntimeSessionId = session.sessionID;
											runtimeActionError = null;
											runtimeActionMessage = null;
										}}
									>
										{selectedRuntimeSessionId === session.sessionID ? 'Selected' : 'Select'}
									</button>
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
			{/if}
		</section>

		<AgentMcpPanel
			agentUsername={agent.username}
			{canManage}
			canIssueRuntimeCredentials={isOwner}
			{latestConnector}
			{connectorSessionCount}
			{runtimeCredentials}
			{selectedRuntimeSession}
			selectedLease={selectedLease}
			leaseToken={currentLeaseToken}
		/>

		<section class="page__notice">
			<div class="settings-token__row">
				<div>
						<h2>Lease-based auth (advanced)</h2>
						<p class="page__meta">
							OAuth connectors above are the standard hosted-client path, and direct runtime sessions above are the
							normal local bearer path. Use wallet-backed leases only when you specifically need a browser-assisted,
							wallet-mediated bearer flow; each renewal here mints a short-lived bearer token from the selected
							lease.
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
					<div class="settings-token" aria-live="polite">
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
