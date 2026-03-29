<script lang="ts">
	import { onMount, untrack } from 'svelte';

	import {
		AgentGenesisWorkspace,
		GraduationApprovalThread,
		IdentityNexus,
		NexusDashboard,
		SoulRequestCenter,
	} from '$lib/greater/faces/agent';
	import {
		authSession,
		clearAuthSession,
		completeOAuthCallback,
		initAuthFromStorage,
		startOAuthLogin,
		type AuthSession,
	} from '$lib/auth/session';

	import FinalizeSigningPanel from './components/FinalizeSigningPanel.svelte';
	import HostTokenPanel from './components/HostTokenPanel.svelte';
	import MintConversationPanel from './components/MintConversationPanel.svelte';
	import SoulRequestActionPanel from './components/SoulRequestActionPanel.svelte';
	import { createPreviewAppState, loadClientAppState } from './loaders';
	import { resolveWindowAgentHint, resolveWindowPage } from './routing';
	import type { AppPageDescriptor, ClientAppState } from './types';

	const HOST_TOKEN_STORAGE_KEY = 'simulacrum:lesser_host_workflow_token';

	interface Props {
		initialPage: AppPageDescriptor;
		initialAgentHint?: string | null;
	}

	let { initialPage, initialAgentHint = null }: Props = $props();

	const initialPageValue = untrack(() => initialPage);
	const initialAgentHintValue = untrack(() => initialAgentHint);
	const initialState = createPreviewAppState({
		page: initialPageValue,
		agentHint: initialAgentHintValue,
	});

	let currentPage = $state<AppPageDescriptor>(initialPageValue);
	let currentAgentHint = $state<string | null>(initialAgentHintValue);
	let session = $state<AuthSession | null>(null);
	let appState = $state<ClientAppState>(initialState);
	let hostToken = $state('');
	let busy = $state(false);
	let authError = $state<string | null>(null);
	let loadError = $state<string | null>(null);

	const isAuthenticated = $derived(Boolean(session?.accessToken));

	$effect(() => {
		if (!isAuthenticated) {
			appState = createPreviewAppState({ page: currentPage, agentHint: currentAgentHint });
		}
	});

	function readStoredHostToken(): string {
		if (typeof window === 'undefined') return '';
		return sessionStorage.getItem(HOST_TOKEN_STORAGE_KEY) ?? '';
	}

	function writeStoredHostToken(next: string): void {
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
			appState = createPreviewAppState({ page: currentPage, agentHint: currentAgentHint });
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
		currentPage = resolveWindowPage();
		currentAgentHint = resolveWindowAgentHint();
		hostToken = readStoredHostToken();
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
		<div>
			<p class="ft-shell__eyebrow">Simulacrum / FaceTheory</p>
			<h1>{currentPage.title}</h1>
			<p class="ft-shell__summary">
				{currentPage.summary}
			</p>
		</div>

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
		{#if !isAuthenticated}
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
						<p class="ft-panel__eyebrow">Live load fallback</p>
						<h2>Showing the preview shell</h2>
					</div>
				</header>
				<p class="ft-panel__message ft-panel__message--error">{loadError}</p>
			</section>
		{/if}

		<div class="ft-shell__stage">
			{#if currentPage.key === 'dashboard' || currentPage.key === 'not-found'}
				<NexusDashboard data={appState.faces.dashboard} />
			{:else if currentPage.key === 'souls'}
				<SoulRequestCenter data={appState.faces.souls} />
			{:else if currentPage.key === 'genesis'}
				<AgentGenesisWorkspace data={appState.faces.genesis} />
			{:else if currentPage.key === 'approvals'}
				<GraduationApprovalThread data={appState.faces.approvals} />
			{:else if currentPage.key === 'identity'}
				<IdentityNexus data={appState.faces.identity} />
			{/if}
		</div>

		<section class="ft-shell__panels">
			{#if isAuthenticated}
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

				{#if currentPage.key === 'souls'}
						<SoulRequestActionPanel
							activeRequest={appState.workflow?.request ?? null}
							latestReview={appState.workflow?.review ?? null}
							onUpdated={refreshLiveState}
							username={appState.actionContext.activeUsername}
						/>
				{/if}

				{#if currentPage.key === 'genesis'}
						<MintConversationPanel
							agentId={appState.actionContext.activeAgentId}
							conversationStatus={appState.hostWorkflow.selectedConversation?.status ?? null}
							hostToken={hostToken}
							initialConversationId={appState.actionContext.activeConversationId}
							initialTranscript={appState.hostWorkflow.transcript}
							onUpdated={refreshLiveState}
						/>
				{/if}

				{#if currentPage.key === 'approvals'}
						<FinalizeSigningPanel
							activeSoulAgentId={appState.actionContext.activeSoulAgentId}
							agentId={appState.actionContext.activeAgentId}
							conversationId={appState.actionContext.activeConversationId}
							expectedWallet={appState.actionContext.expectedWallet}
							hostToken={hostToken}
							onUpdated={refreshLiveState}
							username={appState.actionContext.activeUsername}
							workflow={appState.workflow}
						/>
				{/if}
			{/if}
		</section>
	{/if}
</div>
