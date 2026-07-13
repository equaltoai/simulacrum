<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import * as Chat from '$lib/components/chat';
	import type {
		ChatMessage,
		ChatMessageMoment,
		ChatMessageWorkflowMetadata,
	} from '$lib/components/chat';
	import {
		createGenesisConversationGraphQLApi,
		createGenesisConversationMockApi,
		type GenesisConversationApi,
		type GenesisConversationMessage,
		type GenesisConversationMessageMoment,
		type GenesisConversationRecord,
		type GenesisConversationSummary,
	} from '$lib/api/genesisConversation';
	import { Badge, Button, Card } from '$lib/greater/primitives';
	import type { AgentFaceBaseData } from '$lib/greater/faces/agent';
	import AgentFaceFrame from '$lib/greater/faces/agent/internal/AgentFaceFrame.svelte';

	interface GenesisAgentOption {
		username: string;
		displayName: string;
	}

	interface GenesisConversationPageData extends AgentFaceBaseData {
		activeBodyId?: string | null;
		activeDroneUsername?: string | null;
		currentUserName?: string | null;
		liveStateReady?: boolean;
		agentRoster?: readonly GenesisAgentOption[];
	}

	interface Props {
		data: GenesisConversationPageData;
		class?: string;
	}

	const STARTER_PROMPTS = [
		'Help me write a soul declaration for a research drone.',
		'Start with purpose, boundaries, and continuity.',
		'Name one boundary this soul should never cross.',
	];

	/**
	 * When true the page uses the local mock API (browser tests set this via
	 * window.__SIM_USE_GENESIS_MOCK). When false the page uses the real Lesser
	 * same-origin GraphQL API through HostedSoulBootstrapClient.
	 */
	const USE_MOCK_API =
		typeof window !== 'undefined' &&
		(window as unknown as { __SIM_USE_GENESIS_MOCK?: boolean }).__SIM_USE_GENESIS_MOCK === true;

	const POLL_DELAY_MS = USE_MOCK_API ? 80 : 2_500;

	let { data, class: className = '' }: Props = $props();

	let api = $state.raw<GenesisConversationApi | null>(null);
	let apiGeneration = 0;
	let conversation = $state<GenesisConversationRecord | null>(null);
	let conversations = $state<GenesisConversationSummary[]>([]);
	let draft = $state('');
	let loading = $state(true);
	let loadingList = $state(true);
	let sending = $state(false);
	let polling = $state(false);
	let error = $state<string | null>(null);
	let listError = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let pollTimer: ReturnType<typeof setTimeout> | null = null;

	// True when the real GraphQL API is active but no drone agent username is
	// available. The page shows an agent chooser or "create a drone body" prompt.
	const agentRoster = $derived(data.agentRoster ?? []);
	const liveStateReady = $derived(USE_MOCK_API || data.liveStateReady === true);
	let selectedAgentUsername = $state<string | null>(null);
	let hasExplicitAgentSelection = $state(false);
	const noDroneAgent = $derived(!USE_MOCK_API && liveStateReady && agentRoster.length === 0);

	// The mock and the real GraphQL API both support a conversation list
	// sidebar (Lesser v1.5.12 exposes listHostedGenesisConversations).
	const listSupported = true;
	// Lesser currently lists hosted conversation summaries but cannot load an
	// arbitrary conversation by id. Keep real history visible but read-only
	// rather than presenting a resume control that cannot fulfill its promise.
	const conversationSelectionSupported = USE_MOCK_API;

	const chatMessages = $derived((conversation?.messages ?? []).map(toChatMessage));
	const activeConversationId = $derived(
		conversation?.remoteConversationId ?? conversation?.id ?? null
	);
	const hasPendingAssistant = $derived(
		(conversation?.messages ?? []).some(
			(message) =>
				message.role === 'assistant' &&
				(message.status === 'pending' || message.status === 'streaming')
		)
	);
	const statusLabel = $derived(
		conversation ? statusCopy(conversation.turnStatus) : 'No conversation selected'
	);
	const statusColor = $derived(
		conversation ? statusBadgeColor(conversation.turnStatus) : ('gray' as const)
	);
	const connectionStatus = $derived(
		loading || loadingList || sending || polling ? 'connecting' : 'connected'
	);
	const canRecover = $derived(Boolean(conversation && conversation.turnStatus === 'stuck'));
	const canPoll = $derived(Boolean(conversation && (hasPendingAssistant || polling)));
	const canSendMessage = $derived(Boolean(conversation?.canSendMessage));
	const canStartConversation = $derived(
		Boolean(api && liveStateReady && (USE_MOCK_API || !conversation))
	);
	const transcriptTruncated = $derived(Boolean(
		conversation?.messagesTruncated || conversation?.messages.some((message) => message.truncated)
	));
	const subtitle = $derived(
		USE_MOCK_API
			? conversation?.activeDroneUsername
				? `Local mock for @${conversation.activeDroneUsername}`
				: data.activeDroneUsername
					? `Local mock for @${data.activeDroneUsername}`
					: 'Local mock conversation contract'
			: conversation?.activeDroneUsername
				? `Genesis conversation for @${conversation.activeDroneUsername}`
				: selectedAgentUsername
					? `Genesis conversation for @${selectedAgentUsername}`
					: 'Hosted genesis conversation'
	);

	onMount(() => {
		if (USE_MOCK_API) {
			apiGeneration += 1;
			api = createGenesisConversationMockApi();
			void loadInitialConversations();
		}
	});

	// The first hydrated render contains preview data. Wait for App to confirm
	// that authenticated live state has replaced it before selecting a drone or
	// issuing any hosted-genesis GraphQL requests. Preserve an explicit chooser
	// selection while that drone remains in the live roster.
	$effect(() => {
		if (USE_MOCK_API) return;

		const ready = data.liveStateReady === true;
		const roster = agentRoster;
		const activeUsername = data.activeDroneUsername ?? null;
		if (!ready) {
			resetGraphQLConversationState();
			selectedAgentUsername = null;
			hasExplicitAgentSelection = false;
			return;
		}

		const selectedStillAvailable = roster.some(
			(agent) => agent.username === selectedAgentUsername
		);
		if (hasExplicitAgentSelection && selectedStillAvailable) return;

		const nextUsername = activeUsername && roster.some((agent) => agent.username === activeUsername)
			? activeUsername
			: null;
		if (nextUsername === selectedAgentUsername) return;

		resetGraphQLConversationState();
		selectedAgentUsername = nextUsername;
		hasExplicitAgentSelection = false;
	});

	// For the real GraphQL API, defer creation until a drone agent is selected.
	// The soulBootstrap query and hosted bootstrap mutations require the drone
	// agent's username (not the viewer's name). The roster loads asynchronously
	// after mount; the effect re-runs when selectedAgentUsername becomes available.
	$effect(() => {
		if (USE_MOCK_API) return;
		if (!liveStateReady) return;
		if (api) return;
		const username = selectedAgentUsername ?? '';
		if (!username) return;
		apiGeneration += 1;
		api = createGenesisConversationGraphQLApi({ username });
		void loadInitialConversations();
	});

	onDestroy(() => {
		apiGeneration += 1;
		clearPollTimer();
	});

	function toChatMessage(message: GenesisConversationMessage): ChatMessage {
		return {
			id: message.id,
			role: message.role,
			content: message.content,
			timestamp: new Date(message.createdAt),
			status: message.status,
			error: message.error,
			moments: message.moments?.map(toChatMoment),
			workflowMetadata: message.workflowMetadata as ChatMessageWorkflowMetadata[] | undefined,
		};
	}

	function toChatMoment(moment: GenesisConversationMessageMoment): ChatMessageMoment {
		if (moment.kind === 'checkpoint') {
			return {
				id: moment.id,
				kind: 'checkpoint',
				title: moment.title,
				summary: moment.summary,
				phase: moment.phase,
				tone: moment.tone,
				status: moment.status ?? 'queued',
				detail: moment.detail,
			};
		}
		if (moment.kind === 'action-request') {
			return {
				id: moment.id,
				kind: 'action-request',
				title: moment.title,
				summary: moment.summary,
				phase: moment.phase,
				tone: moment.tone,
				actionLabel: moment.actionLabel ?? 'Continue conversation',
			};
		}
		return {
			id: moment.id,
			kind: 'artifact',
			title: moment.title,
			summary: moment.summary,
			phase: moment.phase,
			tone: moment.tone,
			artifactLabel: moment.artifactLabel,
			facts: moment.facts,
		};
	}

	function statusCopy(status: GenesisConversationRecord['turnStatus']): string {
		switch (status) {
			case 'waiting':
				return 'Assistant responding';
			case 'stuck':
				return 'Turn needs recovery';
			case 'error':
				return 'Conversation error';
			case 'ready':
			default:
				return 'Ready for next turn';
		}
	}

	function statusBadgeColor(status: GenesisConversationRecord['turnStatus']) {
		switch (status) {
			case 'waiting':
				return 'info' as const;
			case 'stuck':
				return 'warning' as const;
			case 'error':
				return 'error' as const;
			case 'ready':
			default:
				return 'success' as const;
		}
	}

	function messageCountCopy(count: number): string {
		return count === 1 ? '1 message' : `${count} messages`;
	}

	function formatUpdatedAt(updatedAt: string): string {
		const date = new Date(updatedAt);
		if (Number.isNaN(date.getTime())) return 'recently';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		}).format(date);
	}

	function conversationListItemClass(conversationId: string): string {
		return conversationId === activeConversationId
			? 'genesis-conversation__list-item genesis-conversation__list-item--active'
			: 'genesis-conversation__list-item';
	}

	function clearPollTimer() {
		if (!pollTimer) return;
		clearTimeout(pollTimer);
		pollTimer = null;
	}

	function resetGraphQLConversationState() {
		apiGeneration += 1;
		clearPollTimer();
		api = null;
		conversation = null;
		conversations = [];
		draft = '';
		sending = false;
		polling = false;
		error = null;
		listError = null;
		notice = null;
		loading = false;
		loadingList = false;
	}

	function isCurrentApi(client: GenesisConversationApi, generation: number): boolean {
		return api === client && apiGeneration === generation;
	}

	function schedulePoll(delayMs = POLL_DELAY_MS) {
		clearPollTimer();
		pollTimer = setTimeout(() => {
			void pollForResponse();
		}, delayMs);
	}

	function handleSelectAgent(username: string) {
		if (username === selectedAgentUsername) return;
		resetGraphQLConversationState();
		hasExplicitAgentSelection = true;
		selectedAgentUsername = username;
		// The $effect above will fire when selectedAgentUsername changes,
		// creating the API and calling loadInitialConversations.
	}

	async function refreshConversationList(
		client: GenesisConversationApi | null = api,
		generation = apiGeneration
	) {
		if (!client || !listSupported || !isCurrentApi(client, generation)) return [];
		loadingList = true;
		try {
			const next = await client.listConversations();
			if (!isCurrentApi(client, generation)) return [];
			conversations = next;
			listError = null;
			return next;
		} catch (caught) {
			if (!isCurrentApi(client, generation)) return [];
			const detail = caught instanceof Error ? caught.message : 'Unknown history error.';
			listError = `History is temporarily unavailable. ${detail}`;
			return [];
		} finally {
			if (isCurrentApi(client, generation)) loadingList = false;
		}
	}

	async function loadInitialConversations() {
		const client = api;
		const generation = apiGeneration;
		if (!client) return;
		loading = true;
		error = null;
		notice = null;
		try {
			const next = await client.loadActiveConversation();
			if (!isCurrentApi(client, generation)) return;
			conversation = next;
			await refreshConversationList(client, generation);
			if (isCurrentApi(client, generation) && next?.turnStatus === 'waiting') {
				schedulePoll();
			}
		} catch (caught) {
			if (!isCurrentApi(client, generation)) return;
			error = caught instanceof Error ? caught.message : 'Failed to load the genesis conversations.';
		} finally {
			if (isCurrentApi(client, generation)) loading = false;
		}
	}

	async function startNewConversation(client: GenesisConversationApi, generation: number) {
		clearPollTimer();
		const next = await client.startConversation({
			activeBodyId: data.activeBodyId,
			activeDroneUsername: selectedAgentUsername ?? data.activeDroneUsername,
		});
		if (!isCurrentApi(client, generation)) return null;
		conversation = next;
		notice = USE_MOCK_API
			? 'Started a new local genesis conversation.'
			: 'Started or resumed the hosted genesis conversation.';
		await refreshConversationList(client, generation);
		return next;
	}

	async function handleNewConversation() {
		const client = api;
		const generation = apiGeneration;
		if (!client) return;
		loading = true;
		error = null;
		try {
			await startNewConversation(client, generation);
			if (!isCurrentApi(client, generation)) return;
			draft = '';
		} catch (caught) {
			if (!isCurrentApi(client, generation)) return;
			error = caught instanceof Error ? caught.message : 'Failed to start a new conversation.';
		} finally {
			if (isCurrentApi(client, generation)) loading = false;
		}
	}

	async function handleSelectConversation(conversationId: string) {
		if (!conversationSelectionSupported) return;
		const client = api;
		const generation = apiGeneration;
		if (!client) return;
		if (conversationId === activeConversationId) return;
		clearPollTimer();
		loading = true;
		error = null;
		notice = null;
		try {
			const next = await client.loadConversation(conversationId);
			if (!isCurrentApi(client, generation)) return;
			if (!next) {
				error = 'The selected genesis conversation is no longer available.';
				await refreshConversationList(client, generation);
				return;
			}
			conversation = next;
			draft = '';
			await refreshConversationList(client, generation);
			if (isCurrentApi(client, generation) && next.turnStatus === 'waiting') {
				schedulePoll();
			}
		} catch (caught) {
			if (!isCurrentApi(client, generation)) return;
			error = caught instanceof Error ? caught.message : 'Failed to load the selected conversation.';
		} finally {
			if (isCurrentApi(client, generation)) loading = false;
		}
	}

	async function handleSend(content: string) {
		const client = api;
		const generation = apiGeneration;
		if (!client) return;
		const trimmed = content.trim();
		if (!trimmed) return;
		if (!canSendMessage) return;
		sending = true;
		error = null;
		notice = null;
		try {
			if (!conversation) throw new Error('Start or choose a genesis conversation first.');
			const next = await client.sendMessage({
				conversationId: conversation.remoteConversationId,
				content: trimmed,
			});
			if (!isCurrentApi(client, generation)) return;
			conversation = next;
			await refreshConversationList(client, generation);
			if (!isCurrentApi(client, generation)) return;
			schedulePoll();
		} catch (caught) {
			if (!isCurrentApi(client, generation)) return;
			error = caught instanceof Error ? caught.message : 'Failed to send the genesis message.';
			throw caught;
		} finally {
			if (isCurrentApi(client, generation)) sending = false;
		}
	}

	async function handleSuggestion(prompt: string) {
		await handleSend(prompt);
	}

	async function pollForResponse() {
		const client = api;
		const generation = apiGeneration;
		const conversationId = conversation?.remoteConversationId ?? conversation?.id;
		if (!client || !conversationId) return;
		polling = true;
		error = null;
		try {
			const next = await client.pollConversation(conversationId);
			if (!isCurrentApi(client, generation)) return;
			if (next) {
				conversation = next;
				await refreshConversationList(client, generation);
				if (isCurrentApi(client, generation) && next.turnStatus === 'waiting') {
					schedulePoll();
				}
			}
		} catch (caught) {
			if (!isCurrentApi(client, generation)) return;
			error = caught instanceof Error ? caught.message : 'Failed to poll the genesis conversation.';
		} finally {
			if (isCurrentApi(client, generation)) polling = false;
		}
	}

	async function recoverStuckTurn() {
		const client = api;
		const generation = apiGeneration;
		const conversationId = conversation?.remoteConversationId;
		if (!client || !conversationId) return;
		polling = true;
		error = null;
		notice = null;
		try {
			const next = await client.recoverStuckTurn(conversationId);
			if (!isCurrentApi(client, generation)) return;
			if (next) {
				conversation = next;
				notice = USE_MOCK_API
					? 'Recovered the stuck turn from the local transcript.'
					: 'Recovering the stuck turn via Lesser GraphQL…';
				await refreshConversationList(client, generation);
				if (!isCurrentApi(client, generation)) return;
				schedulePoll();
			}
		} catch (caught) {
			if (!isCurrentApi(client, generation)) return;
			error = caught instanceof Error ? caught.message : 'Failed to recover the stuck turn.';
		} finally {
			if (isCurrentApi(client, generation)) polling = false;
		}
	}
</script>

<AgentFaceFrame
	hero={data.hero}
	brand={data.brand}
	navItems={data.navItems}
	actions={data.actions}
	statusChips={data.statusChips}
	metrics={data.metrics}
	class={className}
	heroTestId="genesis-conversation-hero"
>
	{#snippet children()}
	<div class="genesis-conversation" data-testid="genesis-conversation-page">
		<div class="genesis-conversation__layout" class:genesis-conversation__layout--no-sidebar={!listSupported}>
			{#if listSupported}
				<Card variant="elevated" padding="none" class="genesis-conversation__sidebar-card">
					<aside class="genesis-conversation__sidebar" aria-label="Genesis conversations">
						<div class="genesis-conversation__sidebar-header">
							<div>
								<p class="genesis-conversation__eyebrow">
									{conversationSelectionSupported ? 'Resume' : 'History'}
								</p>
								<h2>Conversations</h2>
							</div>
							<Button
								variant="outline"
								size="sm"
								onclick={handleNewConversation}
								disabled={loading || sending || polling || !canStartConversation}
								data-testid="genesis-conversation-new-sidebar"
							>
								{USE_MOCK_API ? 'New' : 'Start or resume'}
							</Button>
						</div>

						{#if loadingList && conversations.length === 0}
							<p class="genesis-conversation__list-empty">Loading saved conversations…</p>
						{:else if listError}
							<p
								class="genesis-conversation__list-empty"
								role="status"
								data-testid="genesis-conversation-history-error"
							>
								{listError} The active conversation remains available.
							</p>
						{:else if conversations.length === 0}
							<div class="genesis-conversation__list-empty" data-testid="genesis-conversation-list-empty">
								<p>No saved genesis conversations yet.</p>
								<p>
									{conversationSelectionSupported
										? 'Start a local mock conversation, then it will appear here for resume testing.'
										: 'Start a hosted conversation, then its Lesser summary will appear here.'}
								</p>
							</div>
						{:else}
							{#if !conversationSelectionSupported}
								<p
									class="genesis-conversation__list-empty"
									data-testid="genesis-conversation-history-readonly"
								>
									Lesser exposes hosted conversation history summaries, but not load-by-id yet.
									The active conversation is shown in the workspace; older entries remain read-only.
								</p>
							{/if}
							<ol class="genesis-conversation__list" data-testid="genesis-conversation-list">
								{#each conversations as item (item.id)}
									<li>
										<button
											type="button"
											class={conversationListItemClass(item.id)}
											onclick={() => handleSelectConversation(item.id)}
											disabled={loading || sending || polling || !conversationSelectionSupported}
											title={conversationSelectionSupported
												? undefined
												: 'Hosted conversation history is read-only until Lesser exposes load-by-id.'}
											aria-current={item.id === activeConversationId ? 'true' : undefined}
											data-testid="genesis-conversation-list-item"
										>
											<span class="genesis-conversation__list-title">{item.title}</span>
											<span class="genesis-conversation__list-status">
												<Badge
													variant="dot"
													color={statusBadgeColor(item.turnStatus)}
													label={statusCopy(item.turnStatus)}
													size="sm"
												/>
											</span>
											<span class="genesis-conversation__list-meta">
												<span>{messageCountCopy(item.messageCount)}</span>
												<time datetime={item.updatedAt}>Updated {formatUpdatedAt(item.updatedAt)}</time>
											</span>
											{#if item.activeDroneUsername}
												<span class="genesis-conversation__list-drone">@{item.activeDroneUsername}</span>
											{/if}
										</button>
									</li>
								{/each}
							</ol>
						{/if}
					</aside>
				</Card>
			{/if}

			<Card variant="elevated" padding="none" class="genesis-conversation__card">
					<Chat.Container
						messages={chatMessages}
						streaming={hasPendingAssistant}
						loading={loading}
						connectionStatus={connectionStatus}
						fillHeight
						class="genesis-conversation__chat"
					>
						<Chat.Header
							title="Genesis conversation"
							{subtitle}
							connectionStatus={connectionStatus}
							showClearButton={false}
						>
							{#snippet actions()}
								<span
									class="genesis-conversation__status-badge"
									role="status"
									aria-live="polite"
									data-testid="genesis-conversation-status"
								>
									<Badge variant="dot" color={statusColor} label={statusLabel} />
								</span>
								<Button
									variant="outline"
									size="sm"
									onclick={handleNewConversation}
									disabled={loading || sending || polling || !canStartConversation}
									data-testid="genesis-conversation-new"
								>
									{USE_MOCK_API ? 'New conversation' : 'Start or resume'}
								</Button>
							{/snippet}
						</Chat.Header>

					<div class="genesis-conversation__context" data-testid="genesis-conversation-contract">
							{#if !USE_MOCK_API && liveStateReady && agentRoster.length > 0}
							<div class="genesis-conversation__agent-chooser" data-testid="genesis-conversation-agent-chooser">
								<label for="genesis-agent-select">Drone body</label>
								<select
									id="genesis-agent-select"
									value={selectedAgentUsername ?? ''}
									onchange={(e) => handleSelectAgent(e.currentTarget.value)}
									disabled={loading || sending || polling}
								>
									{#each agentRoster as agent (agent.username)}
										<option value={agent.username}>{agent.displayName} (@{agent.username})</option>
									{/each}
								</select>
							</div>
						{/if}
						{#if USE_MOCK_API}
							<p>
								Local mock contract: start, send, poll, resume, follow up, and recover without
								Lesser, Host, AWS, raw endpoint, token, or credential calls.
							</p>
						{:else}
							<p>
								Hosted genesis conversation through Lesser same-origin GraphQL. Simulacrum never
								calls Host, AWS, or third-party endpoints from the browser.
							</p>
						{/if}
							{#if conversation?.remoteConversationId}
								<p>
									Conversation <strong>{conversation.remoteConversationId}</strong>
									{#if conversation.activeBodyId}
										<span> · body {conversation.activeBodyId}</span>
									{/if}
								</p>
							{:else if conversation?.registrationId}
								<p data-testid="genesis-conversation-registration-ready">
									Hosted registration <strong>{conversation.registrationId}</strong> is ready for the
									first message.
								</p>
							{:else}
								<p>Choose an existing conversation or start a new one.</p>
							{/if}
						</div>

						{#if error}
							<div class="genesis-conversation__alert genesis-conversation__alert--error" role="alert">
								{error}
							</div>
						{/if}

						{#if notice}
							<div class="genesis-conversation__alert genesis-conversation__alert--success" role="status">
								{notice}
							</div>
						{/if}

						<div
							class="genesis-conversation__transcript"
							data-testid="genesis-conversation-transcript"
						>
							{#if conversation}
							<Chat.Messages
								welcomeTitle="Start the soul declaration"
								welcomeMessage={USE_MOCK_API
									? 'Describe purpose, boundaries, and continuity. The local mock keeps the transcript resumable.'
									: 'Describe purpose, boundaries, and continuity. The hosted genesis conversation runs through Lesser GraphQL.'}
								suggestions={STARTER_PROMPTS}
								onSuggestionClick={handleSuggestion}
							/>
							{#if conversation.reconciliationPending}
								<div
									class="genesis-conversation__alert genesis-conversation__alert--warning"
									role="status"
									data-testid="genesis-conversation-send-reconciliation"
								>
									The last send outcome is ambiguous. Simulacrum is polling Lesser before it will
									allow another message; do not resend the turn.
								</div>
							{/if}
							{#if transcriptTruncated}
								<div
									class="genesis-conversation__alert genesis-conversation__alert--warning"
									role="status"
									data-testid="genesis-conversation-transcript-truncated"
								>
									Lesser returned a bounded or truncated transcript. Refresh through Lesser and
									confirm the complete record before treating this genesis conversation as complete.
								</div>
							{/if}
							{:else if !liveStateReady}
								<div class="genesis-conversation__start-prompt" data-testid="genesis-conversation-loading">
									<p>Loading live drone state…</p>
								</div>
							{:else if noDroneAgent}
								<div class="genesis-conversation__start-prompt" data-testid="genesis-conversation-no-agent">
									<p class="genesis-conversation__eyebrow">No drone body</p>
									<h2>Create a drone body first</h2>
									<p>
										A hosted genesis conversation requires a drone agent. Create a drone body
										on the Drones page, then return here to start the soul declaration
										conversation.
									</p>
									<Button variant="solid" onclick={() => window.location.assign('/l/drones')} data-testid="genesis-conversation-go-to-drones">
										Go to Drones
									</Button>
								</div>
							{:else if !USE_MOCK_API && !selectedAgentUsername && agentRoster.length > 0}
								<div class="genesis-conversation__start-prompt" data-testid="genesis-conversation-select-agent">
									<p class="genesis-conversation__eyebrow">Select a drone body</p>
									<h2>Choose a drone for genesis</h2>
									<p>
										Select which drone body should run the hosted genesis conversation from the
										dropdown above.
									</p>
								</div>
							{:else if loading}
								<div class="genesis-conversation__start-prompt" data-testid="genesis-conversation-loading">
									<p>Loading genesis conversations…</p>
								</div>
							{:else}
							<div class="genesis-conversation__start-prompt" data-testid="genesis-conversation-start-prompt">
								<p class="genesis-conversation__eyebrow">{USE_MOCK_API ? 'Local mock ready' : 'Hosted genesis ready'}</p>
								<h2>Start or resume a genesis conversation</h2>
								<p>
									{#if USE_MOCK_API}
										Use the conversation list to resume a stored transcript, or start a new local
										mock thread to shape purpose, boundaries, and continuity.
									{:else}
										Start or resume the hosted genesis conversation to shape purpose, boundaries, and
										continuity through Lesser's same-origin GraphQL surface.
									{/if}
								</p>
									<Button
										variant="solid"
										onclick={handleNewConversation}
										disabled={!canStartConversation}
										data-testid="genesis-conversation-start-new"
									>
										{USE_MOCK_API ? 'Start new conversation' : 'Start or resume conversation'}
									</Button>
								</div>
							{/if}
						</div>

						{#if canRecover || canPoll}
							<div class="genesis-conversation__recovery">
								<Button
									variant="ghost"
									size="sm"
									onclick={pollForResponse}
									disabled={!conversation || polling}
									loading={polling && !canRecover}
								>
									Check for response
								</Button>
								{#if canRecover}
									<Button
										variant="outline"
										size="sm"
										onclick={recoverStuckTurn}
										disabled={polling}
										loading={polling}
										data-testid="genesis-conversation-recover"
									>
										Retry assistant turn
									</Button>
								{/if}
							</div>
						{/if}

						<Chat.Input
							bind:value={draft}
							onSend={handleSend}
							disabled={loading || sending || hasPendingAssistant || !conversation || !canSendMessage}
							placeholder="Type a genesis message…"
						/>
					</Chat.Container>
				</Card>
			</div>
		</div>
	{/snippet}
</AgentFaceFrame>

<style>
	.genesis-conversation {
		display: grid;
		gap: var(--gr-spacing-scale-5, 1.25rem);
		min-height: min(72vh, 56rem);
	}

	.genesis-conversation__layout {
		display: grid;
		grid-template-columns: minmax(16rem, 20rem) minmax(0, 1fr);
		gap: var(--gr-spacing-scale-5, 1.25rem);
		align-items: stretch;
	}

	.genesis-conversation__layout--no-sidebar {
		grid-template-columns: minmax(0, 1fr);
	}

	:global(.genesis-conversation__sidebar-card.gr-card),
	:global(.genesis-conversation__card.gr-card) {
		overflow: hidden;
		background:
			linear-gradient(
				145deg,
				color-mix(in srgb, var(--gr-semantic-background-primary) 88%, white 12%),
				color-mix(in srgb, var(--gr-color-primary-50, #eef2ff) 42%, white 58%)
			);
		border: 1px solid color-mix(in srgb, var(--gr-semantic-border-default) 82%, white 18%);
		box-shadow: var(--gr-shadows-lg, 0 24px 48px rgb(15 23 42 / 0.12));
	}

	.genesis-conversation__sidebar {
		display: flex;
		flex-direction: column;
		min-height: min(72vh, 56rem);
		background: color-mix(in srgb, var(--gr-semantic-background-primary) 86%, transparent);
	}

	.genesis-conversation__sidebar-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--gr-spacing-scale-3, 0.75rem);
		padding: var(--gr-spacing-scale-4, 1rem);
		border-bottom: 1px solid var(--gr-semantic-border-default);
	}

	.genesis-conversation__sidebar-header h2,
	.genesis-conversation__start-prompt h2 {
		margin: 0;
		font-family: var(--gr-typography-fontFamily-serif, serif);
		font-size: var(--gr-typography-fontSize-xl, 1.25rem);
		line-height: 1.15;
		color: var(--gr-semantic-foreground-primary);
	}

	.genesis-conversation__eyebrow {
		margin: 0 0 var(--gr-spacing-scale-1, 0.25rem);
		color: var(--gr-color-primary-700, #4338ca);
		font-size: var(--gr-typography-fontSize-xs, 0.75rem);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.genesis-conversation__list {
		display: grid;
		gap: var(--gr-spacing-scale-2, 0.5rem);
		margin: 0;
		padding: var(--gr-spacing-scale-3, 0.75rem);
		list-style: none;
		overflow: auto;
	}

	.genesis-conversation__list-item {
		display: grid;
		width: 100%;
		gap: var(--gr-spacing-scale-2, 0.5rem);
		padding: var(--gr-spacing-scale-3, 0.75rem);
		text-align: left;
		color: var(--gr-semantic-foreground-secondary);
		background: color-mix(in srgb, var(--gr-semantic-background-primary) 72%, transparent);
		border: 1px solid color-mix(in srgb, var(--gr-semantic-border-default) 88%, transparent);
		border-radius: var(--gr-radii-lg, 0.75rem);
		box-shadow: var(--gr-shadows-sm, 0 1px 2px rgb(15 23 42 / 0.08));
		cursor: pointer;
		transition:
			background-color 0.16s ease,
			border-color 0.16s ease,
			box-shadow 0.16s ease,
			transform 0.16s ease;
	}

	.genesis-conversation__list-item:hover,
	.genesis-conversation__list-item:focus-visible {
		background: color-mix(in srgb, var(--gr-color-primary-50, #eef2ff) 56%, white 44%);
		border-color: color-mix(in srgb, var(--gr-color-primary-500, #6366f1) 42%, white 58%);
		box-shadow: var(--gr-shadows-md, 0 8px 20px rgb(15 23 42 / 0.12));
		transform: translateY(-1px);
		outline: none;
	}

	.genesis-conversation__list-item--active,
	.genesis-conversation__list-item--active:hover,
	.genesis-conversation__list-item--active:focus-visible {
		color: var(--gr-semantic-foreground-primary);
		background:
			linear-gradient(
				135deg,
				color-mix(in srgb, var(--gr-color-primary-50, #eef2ff) 78%, white 22%),
				color-mix(in srgb, var(--gr-color-warning-50, #fffbeb) 48%, white 52%)
			);
		border-color: color-mix(in srgb, var(--gr-color-primary-500, #6366f1) 58%, white 42%);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gr-color-primary-500, #6366f1) 30%, transparent);
	}

	.genesis-conversation__list-item:disabled {
		cursor: wait;
		opacity: 0.76;
		transform: none;
	}

	.genesis-conversation__list-title {
		color: var(--gr-semantic-foreground-primary);
		font-weight: 700;
		line-height: 1.25;
	}

	.genesis-conversation__list-status {
		display: inline-flex;
		align-items: center;
	}

	.genesis-conversation__list-meta {
		display: grid;
		gap: var(--gr-spacing-scale-1, 0.25rem);
		font-size: var(--gr-typography-fontSize-xs, 0.75rem);
	}

	.genesis-conversation__list-drone {
		font-size: var(--gr-typography-fontSize-xs, 0.75rem);
		font-weight: 700;
		color: var(--gr-color-primary-700, #4338ca);
	}

	.genesis-conversation__list-empty {
		display: grid;
		gap: var(--gr-spacing-scale-2, 0.5rem);
		margin: 0;
		padding: var(--gr-spacing-scale-4, 1rem);
		color: var(--gr-semantic-foreground-secondary);
		font-size: var(--gr-typography-fontSize-sm, 0.875rem);
	}

	.genesis-conversation__list-empty p {
		margin: 0;
	}

	:global(.genesis-conversation__chat.chat-container) {
		min-height: min(72vh, 56rem);
		background: color-mix(in srgb, var(--gr-semantic-background-primary) 84%, transparent);
	}

	.genesis-conversation__context {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--gr-spacing-scale-2, 0.5rem) var(--gr-spacing-scale-4, 1rem);
		padding: var(--gr-spacing-scale-3, 0.75rem) var(--gr-spacing-scale-4, 1rem);
		color: var(--gr-semantic-foreground-secondary);
		background: color-mix(in srgb, var(--gr-color-warning-50, #fffbeb) 42%, transparent);
		border-bottom: 1px solid var(--gr-semantic-border-default);
		font-size: var(--gr-typography-fontSize-sm, 0.875rem);
	}

	.genesis-conversation__context p {
		margin: 0;
	}

	.genesis-conversation__agent-chooser {
		display: flex;
		align-items: center;
		gap: var(--gr-spacing-scale-2, 0.5rem);
	}

	.genesis-conversation__agent-chooser label {
		font-size: var(--gr-typography-fontSize-xs, 0.75rem);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--gr-color-primary-700, #4338ca);
	}

	.genesis-conversation__agent-chooser select {
		padding: var(--gr-spacing-scale-1, 0.25rem) var(--gr-spacing-scale-2, 0.5rem);
		font-size: var(--gr-typography-fontSize-sm, 0.875rem);
		border: 1px solid var(--gr-semantic-border-default);
		border-radius: var(--gr-radii-sm, 0.375rem);
		background: var(--gr-semantic-background-primary);
		color: var(--gr-semantic-foreground-primary);
		cursor: pointer;
	}

	.genesis-conversation__status-badge {
		display: inline-flex;
		align-items: center;
	}

	.genesis-conversation__alert {
		margin: var(--gr-spacing-scale-3, 0.75rem) var(--gr-spacing-scale-4, 1rem) 0;
		padding: var(--gr-spacing-scale-3, 0.75rem);
		border-radius: var(--gr-radii-md, 0.5rem);
		font-size: var(--gr-typography-fontSize-sm, 0.875rem);
	}

	.genesis-conversation__alert--error {
		color: var(--gr-color-error-700, #b91c1c);
		background: var(--gr-color-error-50, #fef2f2);
		border: 1px solid var(--gr-color-error-200, #fecaca);
	}

	.genesis-conversation__alert--success {
		color: var(--gr-color-success-700, #047857);
		background: var(--gr-color-success-50, #ecfdf5);
		border: 1px solid var(--gr-color-success-200, #a7f3d0);
	}

	.genesis-conversation__alert--warning {
		color: var(--gr-color-warning-800, #92400e);
		background: var(--gr-color-warning-50, #fffbeb);
		border: 1px solid var(--gr-color-warning-200, #fde68a);
	}

	.genesis-conversation__transcript {
		display: flex;
		flex: 1;
		min-height: 24rem;
		min-width: 0;
	}

	.genesis-conversation__transcript :global(.chat-messages) {
		width: 100%;
		background:
			radial-gradient(circle at top left, rgba(255, 183, 131, 0.13), transparent 22rem),
			radial-gradient(circle at bottom right, rgba(226, 155, 254, 0.12), transparent 24rem);
	}

	.genesis-conversation__start-prompt {
		display: grid;
		place-content: center;
		justify-items: center;
		width: 100%;
		gap: var(--gr-spacing-scale-4, 1rem);
		padding: var(--gr-spacing-scale-6, 1.5rem);
		text-align: center;
		color: var(--gr-semantic-foreground-secondary);
		background:
			radial-gradient(circle at top left, rgba(255, 183, 131, 0.13), transparent 22rem),
			radial-gradient(circle at bottom right, rgba(226, 155, 254, 0.12), transparent 24rem);
	}

	.genesis-conversation__start-prompt p {
		max-width: 34rem;
		margin: 0;
	}

	.genesis-conversation__recovery {
		display: flex;
		justify-content: flex-end;
		gap: var(--gr-spacing-scale-2, 0.5rem);
		padding: var(--gr-spacing-scale-2, 0.5rem) var(--gr-spacing-scale-4, 1rem);
		border-top: 1px solid var(--gr-semantic-border-default);
		background: color-mix(in srgb, var(--gr-semantic-background-secondary) 58%, transparent);
	}

	@media (max-width: 900px) {
		.genesis-conversation__layout {
			grid-template-columns: 1fr;
		}

		.genesis-conversation__sidebar {
			min-height: auto;
		}

		.genesis-conversation__list {
			grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
			max-height: 22rem;
		}
	}

	@media (max-width: 720px) {
		.genesis-conversation__context,
		.genesis-conversation__recovery {
			flex-direction: column;
			align-items: stretch;
		}

		.genesis-conversation__sidebar-header {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
