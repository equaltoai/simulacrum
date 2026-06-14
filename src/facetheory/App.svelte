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

	import DronesPage from './components/DronesPage.svelte';
	import HostedSoulBootstrapPanel from './components/HostedSoulBootstrapPanel.svelte';
	import HostedBoundSoulActivationPanel from './components/HostedBoundSoulActivationPanel.svelte';
	import IdentityQuarantinePanel from './components/IdentityQuarantinePanel.svelte';
	import IdentitySoulBindingPanel from './components/IdentitySoulBindingPanel.svelte';
	import NotificationsPage from './components/NotificationsPage.svelte';
	import SoulBootstrapSigningPanel from './components/SoulBootstrapSigningPanel.svelte';
	import SoulRequestActionPanel from './components/SoulRequestActionPanel.svelte';
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
	let authError = $state<string | null>(null);
	let loadError = $state<string | null>(null);
	let currentStatusId = $state<string | null>(initialStatusIdValue);
	let currentProfileIdentifier = $state<string | null>(initialProfileIdentifierValue);
	let currentProfileActorId = $state<string | null>(initialProfileActorIdValue);

	const isAuthenticated = $derived(Boolean(session?.accessToken));
	const showAuthPreviewNotice = $derived(!isAuthenticated && currentPage.requiresAuth !== false);
	const showBlockingLoadError = $derived(Boolean(isAuthenticated && loadError));
	const showLegacySigningPanel = $derived(Boolean(
		appState.hostWorkflow.state?.bootstrapMode === 'WALLET_PRINCIPAL' ||
		appState.hostWorkflow.signingCheckpoints.length > 0
	));

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

		loadError = null;

		try {
			appState = await loadClientAppState({
				page: currentPage,
				agentHint: currentAgentHint,
			});
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Failed to load the live Simulacrum state.';
		}
	}

	async function handleLogin() {
		authError = null;
		await startOAuthLogin({ returnTo: currentLocation() });
	}

	function handleLogout() {
		clearAuthSession();
		session = null;
		loadError = null;
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
		initAuthFromStorage();

		const unsubscribe = authSession.subscribe((value) => {
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
					{#if currentPage.key === 'identity' || currentPage.key === 'genesis' || currentPage.key === 'approvals'}
						<section class="ft-panel" data-testid="soul-bootstrap-lane">
							<header class="ft-panel__header">
								<div>
									<p class="ft-panel__eyebrow">Same-origin bootstrap boundary</p>
									<h2>{appState.hostWorkflow.bootstrap.title}</h2>
								</div>
							</header>
							<p class="ft-panel__copy">{appState.hostWorkflow.bootstrap.summary}</p>
							<p class="ft-panel__message">
								{appState.hostWorkflow.bootstrap.stateLabel} · {appState.hostWorkflow.bootstrap.statusDetail}
							</p>
							{#if appState.hostWorkflow.bootstrap.issue === 'body_required'}
								<a class="ft-button ft-button--primary" href={appState.hostWorkflow.bootstrap.actionHref}>
									{appState.hostWorkflow.bootstrap.actionLabel}
								</a>
							{/if}
						</section>
						{#if showLegacySigningPanel}
							<SoulBootstrapSigningPanel
								result={appState.hostWorkflow.result}
								onUpdated={refreshLiveState}
							/>
						{:else}
							<HostedSoulBootstrapPanel
								result={appState.hostWorkflow.result}
								onUpdated={refreshLiveState}
							/>
						{/if}
					{/if}

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

					{#if currentPage.key === 'souls'}
						<SoulRequestActionPanel
							activeRequest={appState.workflow?.request ?? null}
							latestReview={appState.workflow?.review ?? null}
							onUpdated={refreshLiveState}
							username={appState.actionContext.activeUsername}
						/>
					{/if}

				{/if}
			</section>
		{/if}
	{/if}
</div>
