<script lang="ts">
	import { onMount, untrack } from 'svelte';

	import {
		AgentGenesisWorkspace,
		GraduationApprovalThread,
		IdentityNexus,
		NexusDashboard,
		SoulRequestCenter,
	} from '$lib/greater/faces/agent';
	import TimelinePage from '$lib/greater/faces/agent/TimelinePage.svelte';
	import ConversationsPage from '$lib/greater/faces/agent/ConversationsPage.svelte';
	import ExplorePage from '$lib/greater/faces/agent/ExplorePage.svelte';
	import ProfilePage from '$lib/greater/faces/agent/ProfilePage.svelte';
	import StatusPage from '$lib/greater/faces/agent/StatusPage.svelte';
	import type { AgentFaceBaseData } from '$lib/greater/faces/agent';
	import {
		authSession,
		clearAuthSession,
		completeOAuthCallback,
		initAuthFromStorage,
		startOAuthLogin,
		type AuthSession,
	} from '$lib/auth/session';

	import FinalizeSigningPanel from './components/FinalizeSigningPanel.svelte';
	import DronesPage from './components/DronesPage.svelte';
	import HostedBoundSoulActivationPanel from './components/HostedBoundSoulActivationPanel.svelte';
	import HostTokenPanel from './components/HostTokenPanel.svelte';
	import IdentityQuarantinePanel from './components/IdentityQuarantinePanel.svelte';
	import IdentitySoulBindingPanel from './components/IdentitySoulBindingPanel.svelte';
	import MintConversationPanel from './components/MintConversationPanel.svelte';
	import NotificationsPage from './components/NotificationsPage.svelte';
	import SoulRequestActionPanel from './components/SoulRequestActionPanel.svelte';
	import {
		HOST_WORKFLOW_BRIDGE_DISABLED_NOTE,
		HOST_WORKFLOW_BRIDGE_ENABLED,
	} from './flags';
	import { createPreviewAppState, loadClientAppState } from './loaders';
	import {
		resolveConversationComposeActorId,
		resolveProfileActorId,
		resolveProfileIdentifier,
		resolveWindowAgentHint,
		resolveWindowPage,
		resolveStatusId,
	} from './routing';
	import type { AppPageDescriptor, ClientAppState } from './types';

	const HOST_TOKEN_STORAGE_KEY = 'simulacrum:lesser_host_workflow_token';

	interface Props {
		initialPage: AppPageDescriptor;
		initialAgentHint?: string | null;
		initialComposeActorId?: string | null;
		initialStatusId?: string | null;
		initialProfileIdentifier?: string | null;
		initialProfileActorId?: string | null;
	}

	let {
		initialPage,
		initialAgentHint = null,
		initialComposeActorId = null,
		initialStatusId = null,
		initialProfileIdentifier = null,
		initialProfileActorId = null,
	}: Props = $props();

	const initialPageValue = untrack(() => initialPage);
	const initialAgentHintValue = untrack(() => initialAgentHint);
	const initialComposeActorIdValue = untrack(() => initialComposeActorId);
	const initialStatusIdValue = untrack(() => initialStatusId);
	const initialProfileIdentifierValue = untrack(() => initialProfileIdentifier);
	const initialProfileActorIdValue = untrack(() => initialProfileActorId);
	const initialState = createPreviewAppState({
		page: initialPageValue,
		agentHint: initialAgentHintValue,
	});

	let currentPage = $state<AppPageDescriptor>(initialPageValue);
	let currentAgentHint = $state<string | null>(initialAgentHintValue);
	let currentComposeActorId = $state<string | null>(initialComposeActorIdValue);
	let session = $state<AuthSession | null>(null);
	let appState = $state<ClientAppState>(initialState);
	let hostToken = $state('');
	let lastSessionAccessToken = $state<string | null>(null);
	let busy = $state(false);
	let authError = $state<string | null>(null);
	let loadError = $state<string | null>(null);
	let currentStatusId = $state<string | null>(initialStatusIdValue);
	let currentProfileIdentifier = $state<string | null>(initialProfileIdentifierValue);
	let currentProfileActorId = $state<string | null>(initialProfileActorIdValue);

	const isAuthenticated = $derived(Boolean(session?.accessToken));
	const showAuthPreviewNotice = $derived(!isAuthenticated && currentPage.requiresAuth !== false);
	const showBlockingLoadError = $derived(Boolean(isAuthenticated && loadError));

	const socialBaseData = $derived({
		hero: {
			eyebrow: currentPage.eyebrow,
			title: currentPage.title,
			summary: currentPage.summary,
		},
		brand: appState.faces.dashboard.brand,
		navItems: appState.faces.dashboard.navItems,
		actions: [],
		statusChips: [],
		metrics: [],
	});

	const dronesPageData = $derived({
		hero: {
			eyebrow: currentPage.eyebrow,
			title: currentPage.title,
			summary: currentPage.summary,
		},
		brand: appState.faces.dashboard.brand,
		navItems: appState.faces.dashboard.navItems,
		actions: appState.faces.dashboard.actions,
		statusChips: appState.faces.dashboard.statusChips,
		metrics: appState.faces.dashboard.metrics,
		agentCount: appState.agentCount,
		soulCount: appState.soulCount,
		currentUserName: appState.currentUserName,
	} satisfies AgentFaceBaseData & { agentCount: number; soulCount: number; currentUserName?: string });

	$effect(() => {
		if (!isAuthenticated) {
			appState = createPreviewAppState({ page: currentPage, agentHint: currentAgentHint });
		}
	});

	function readStoredHostToken(): string {
		if (!HOST_WORKFLOW_BRIDGE_ENABLED) return '';
		if (typeof window === 'undefined') return '';
		return sessionStorage.getItem(HOST_TOKEN_STORAGE_KEY) ?? '';
	}

	function writeStoredHostToken(next: string): void {
		if (!HOST_WORKFLOW_BRIDGE_ENABLED) return;
		if (typeof window === 'undefined') return;
		const trimmed = next.trim();
		if (trimmed) {
			sessionStorage.setItem(HOST_TOKEN_STORAGE_KEY, trimmed);
			return;
		}
		sessionStorage.removeItem(HOST_TOKEN_STORAGE_KEY);
	}

	function currentLocation(): string {
		if (typeof window === 'undefined') {
			return '/l/';
		}
		return `${window.location.pathname}${window.location.search}${window.location.hash}`;
	}

	function stripLegacyAgentQueryParam() {
		if (typeof window === 'undefined') return;
		const search = new URLSearchParams(window.location.search);
		if (!search.has('agent')) return;
		search.delete('agent');
		const nextSearch = search.toString();
		const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
		window.history.replaceState(window.history.state, '', nextUrl);
	}

	async function refreshLiveState() {
		if (!session?.accessToken) return;

		busy = true;
		loadError = null;

		try {
			appState = await loadClientAppState({
				page: currentPage,
				agentHint: currentAgentHint,
				hostToken,
			});
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Failed to load the live Simulacrum state.';
		} finally {
			busy = false;
		}
	}

	async function handleLogin() {
		authError = null;
		await startOAuthLogin({ returnTo: currentLocation() });
	}

	function handleLogout() {
		clearAuthSession();
		writeStoredHostToken('');
		hostToken = '';
		session = null;
		loadError = null;
	}

	async function handleHostTokenSave(nextToken: string) {
		writeStoredHostToken(nextToken);
		hostToken = nextToken.trim();
		await refreshLiveState();
	}

	async function handleHostTokenClear() {
		writeStoredHostToken('');
		hostToken = '';
		await refreshLiveState();
	}

	async function handleAuthCallback() {
		if (typeof window === 'undefined') return;

		const result = await completeOAuthCallback(new URLSearchParams(window.location.search));
		if (result.ok) {
			window.location.replace(result.returnTo);
			return;
		}

		authError = result.error;
	}

	onMount(() => {
		stripLegacyAgentQueryParam();
		currentPage = resolveWindowPage();
		currentAgentHint = resolveWindowAgentHint();
		currentComposeActorId = resolveConversationComposeActorId(window.location.pathname);
		currentStatusId = resolveStatusId(window.location.pathname);
		currentProfileIdentifier = resolveProfileIdentifier(window.location.pathname);
		currentProfileActorId = resolveProfileActorId(new URLSearchParams(window.location.search));
		hostToken = readStoredHostToken();
		initAuthFromStorage();

		const unsubscribe = authSession.subscribe((value) => {
			const nextAccessToken = value?.accessToken ?? null;
			if (!nextAccessToken || (lastSessionAccessToken && lastSessionAccessToken !== nextAccessToken)) {
				writeStoredHostToken('');
				hostToken = '';
			}
			lastSessionAccessToken = nextAccessToken;
			session = value;
			if (value && currentPage.key !== 'auth-callback') {
				void refreshLiveState();
			}
		});

		if (currentPage.key === 'auth-callback') {
			void handleAuthCallback();
		}

		return unsubscribe;
	});
</script>

<div class="ft-shell">
	<header class="ft-shell__topbar">
		<p class="ft-shell__eyebrow">Simulacrum / FaceTheory</p>

		<div class="ft-shell__actions">
			{#if isAuthenticated}
				<p class="ft-shell__identity">
					Signed in as <strong>{appState.currentUserName}</strong>
				</p>
				<button class="ft-button" onclick={refreshLiveState} type="button">
					Refresh
				</button>
				<button class="ft-button" onclick={handleLogout} type="button">
					Sign out
				</button>
			{:else}
				<button class="ft-button ft-button--primary" onclick={handleLogin} type="button">
					Sign in with Lesser
				</button>
			{/if}
		</div>
	</header>

	{#if currentPage.key === 'auth-callback'}
		<section class="ft-panel ft-shell__auth-panel">
			<header class="ft-panel__header">
				<div>
					<p class="ft-panel__eyebrow">OAuth callback</p>
					<h2>Completing sign-in</h2>
				</div>
			</header>
			<p class="ft-panel__copy">
				Simulacrum is finishing the Lesser PKCE flow and returning to the requested agent-first surface.
			</p>
			{#if authError}
				<p class="ft-panel__message ft-panel__message--error">{authError}</p>
			{/if}
		</section>
	{:else}
		{#if showAuthPreviewNotice}
			<section class="ft-panel ft-shell__notice">
				<header class="ft-panel__header">
					<div>
						<p class="ft-panel__eyebrow">Preview mode</p>
						<h2>Agent-first shell is rendered without live auth</h2>
					</div>
				</header>
				<p class="ft-panel__copy">
					The current page is server-rendered from the new FaceTheory route map so the Souls lifecycle stays discoverable before sign-in. Sign in to load live GraphQL workflow state and continue the canonical in-instance request, review, and continuity flow.
				</p>
			</section>
		{/if}

		{#if loadError}
			<section class="ft-panel ft-shell__notice">
				<header class="ft-panel__header">
					<div>
						<p class="ft-panel__eyebrow">Live load failed</p>
						<h2>Simulacrum stopped on an API error</h2>
					</div>
				</header>
				<p class="ft-panel__message ft-panel__message--error">{loadError}</p>
			</section>
		{/if}

		{#if !showBlockingLoadError}
			<div class="ft-shell__stage">
				{#if currentPage.key === 'dashboard' || currentPage.key === 'not-found'}
					<NexusDashboard data={appState.faces.dashboard} />
				{:else if currentPage.key === 'drones'}
					<DronesPage data={dronesPageData} onUpdated={refreshLiveState} />
				{:else if currentPage.key === 'souls'}
					<SoulRequestCenter data={appState.faces.souls} />
				{:else if currentPage.key === 'genesis'}
					<AgentGenesisWorkspace data={appState.faces.genesis} />
				{:else if currentPage.key === 'approvals'}
					<GraduationApprovalThread data={appState.faces.approvals} />
				{:else if currentPage.key === 'identity'}
					<IdentityNexus data={appState.faces.identity} />
				{:else if currentPage.key === 'timeline'}
					<TimelinePage data={socialBaseData} />
				{:else if currentPage.key === 'conversations'}
					<ConversationsPage data={socialBaseData} composeActorId={currentComposeActorId} />
				{:else if currentPage.key === 'notifications'}
					<NotificationsPage data={socialBaseData} />
				{:else if currentPage.key === 'explore'}
					<ExplorePage data={socialBaseData} />
				{:else if currentPage.key === 'profile'}
					<ProfilePage
						data={socialBaseData}
						profileIdentifier={currentProfileIdentifier}
						profileId={currentProfileActorId}
					/>
				{:else if currentPage.key === 'status' && currentStatusId}
					<StatusPage data={socialBaseData} statusId={currentStatusId} />
				{/if}
			</div>

			<section class="ft-shell__panels">
				{#if isAuthenticated}
					{#if currentPage.key === 'identity'}
						<IdentityQuarantinePanel agent={appState.activeAgent} onUpdated={refreshLiveState} />
						<HostedBoundSoulActivationPanel
							agentUsername={appState.actionContext.activeUsername}
							anchorAssurance={appState.activationDisclosure.anchorAssurance}
							boundSoulAgentId={appState.actionContext.activeSoulAgentId}
							channels={appState.faces.identity.channels}
							showReachability={Boolean(appState.faces.identity.showReachability)}
						/>
						<IdentitySoulBindingPanel
							boundSoulAgentId={appState.actionContext.activeSoulAgentId}
							displayName={appState.activeAgent?.displayName ?? null}
							onUpdated={refreshLiveState}
							username={appState.actionContext.activeUsername}
						/>
					{/if}

					{#if HOST_WORKFLOW_BRIDGE_ENABLED}
						<HostTokenPanel
							busy={busy}
							configured={appState.hostWorkflow.tokenConfigured}
							conversationCount={appState.hostWorkflow.conversations.length}
							lifecycleEventCount={appState.hostWorkflow.lifecycleEvents.length}
							note={appState.hostWorkflow.authNote}
							onClear={handleHostTokenClear}
							onSave={handleHostTokenSave}
							selectedConversationId={appState.actionContext.activeConversationId}
							token={hostToken}
						/>
					{:else if currentPage.key === 'genesis' || currentPage.key === 'approvals'}
						<section class="ft-panel">
							<header class="ft-panel__header">
								<div>
									<p class="ft-panel__eyebrow">Instance-trust bridge pending</p>
									<h2>Soul creation is waiting on Lesser and Greater</h2>
								</div>
							</header>
							<p class="ft-panel__copy">{HOST_WORKFLOW_BRIDGE_DISABLED_NOTE}</p>
						</section>
					{/if}

					{#if currentPage.key === 'souls'}
						<SoulRequestActionPanel
							activeRequest={appState.workflow?.request ?? null}
							latestReview={appState.workflow?.review ?? null}
							onUpdated={refreshLiveState}
							username={appState.actionContext.activeUsername}
						/>
					{/if}

					{#if HOST_WORKFLOW_BRIDGE_ENABLED && currentPage.key === 'genesis'}
						<MintConversationPanel
							agentId={appState.actionContext.activeAgentId}
							conversationStatus={appState.hostWorkflow.selectedConversation?.status ?? null}
							hostBaseUrl={appState.hostWorkflow.baseUrl}
							hostToken={hostToken}
							initialConversationId={appState.actionContext.activeConversationId}
							initialTranscript={appState.hostWorkflow.transcript}
							onUpdated={refreshLiveState}
						/>
					{/if}

					{#if HOST_WORKFLOW_BRIDGE_ENABLED && currentPage.key === 'approvals'}
						<FinalizeSigningPanel
							activeSoulAgentId={appState.actionContext.activeSoulAgentId}
							agentId={appState.actionContext.activeAgentId}
							conversationId={appState.actionContext.activeConversationId}
							expectedWallet={appState.actionContext.expectedWallet}
							hostBaseUrl={appState.hostWorkflow.baseUrl}
							hostToken={hostToken}
							onUpdated={refreshLiveState}
							username={appState.actionContext.activeUsername}
							workflow={appState.workflow}
						/>
					{/if}
				{/if}
			</section>
		{/if}
	{/if}
</div>
