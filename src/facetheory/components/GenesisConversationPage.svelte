<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import * as Chat from '$lib/components/chat';
	import type {
		ChatMessage,
		ChatMessageMoment,
		ChatMessageWorkflowMetadata,
	} from '$lib/components/chat';
	import {
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

	interface GenesisConversationPageData extends AgentFaceBaseData {
		activeBodyId?: string | null;
		activeDroneUsername?: string | null;
		currentUserName?: string | null;
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

	let { data, class: className = '' }: Props = $props();

	let api: GenesisConversationApi | null = null;
	let conversation = $state<GenesisConversationRecord | null>(null);
	let conversations = $state<GenesisConversationSummary[]>([]);
	let draft = $state('');
	let loading = $state(true);
	let loadingList = $state(true);
	let sending = $state(false);
	let polling = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let pollTimer: ReturnType<typeof setTimeout> | null = null;

	const chatMessages = $derived((conversation?.messages ?? []).map(toChatMessage));
	const activeConversationId = $derived(conversation?.id ?? null);
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
	const subtitle = $derived(
		conversation?.activeDroneUsername
			? `Local mock for @${conversation.activeDroneUsername}`
			: data.activeDroneUsername
				? `Local mock for @${data.activeDroneUsername}`
				: 'Local mock conversation contract'
	);

	onMount(() => {
		api = createGenesisConversationMockApi();
		void loadInitialConversations();
	});

	onDestroy(() => {
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

	function schedulePoll(delayMs = 80) {
		clearPollTimer();
		pollTimer = setTimeout(() => {
			void pollForResponse();
		}, delayMs);
	}

	async function refreshConversationList() {
		if (!api) return [];
		loadingList = true;
		try {
			const next = await api.listConversations();
			conversations = next;
			return next;
		} finally {
			loadingList = false;
		}
	}

	async function loadInitialConversations() {
		if (!api) return;
		loading = true;
		error = null;
		notice = null;
		try {
			await refreshConversationList();
			conversation = await api.loadActiveConversation();
			await refreshConversationList();
			if (conversation?.turnStatus === 'waiting') {
				schedulePoll();
			}
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Failed to load the genesis conversations.';
		} finally {
			loading = false;
		}
	}

	async function startNewConversation() {
		if (!api) return null;
		clearPollTimer();
		const next = await api.startConversation({
			activeBodyId: data.activeBodyId,
			activeDroneUsername: data.activeDroneUsername,
		});
		conversation = next;
		notice = 'Started a new local genesis conversation.';
		await refreshConversationList();
		return next;
	}

	async function handleNewConversation() {
		if (!api) return;
		loading = true;
		error = null;
		try {
			await startNewConversation();
			draft = '';
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Failed to start a new conversation.';
		} finally {
			loading = false;
		}
	}

	async function handleSelectConversation(conversationId: string) {
		if (!api) return;
		if (conversationId === activeConversationId) return;
		clearPollTimer();
		loading = true;
		error = null;
		notice = null;
		try {
			const next = await api.loadConversation(conversationId);
			if (!next) {
				error = 'The selected genesis conversation is no longer available.';
				await refreshConversationList();
				return;
			}
			conversation = next;
			draft = '';
			await refreshConversationList();
			if (next.turnStatus === 'waiting') {
				schedulePoll();
			}
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Failed to load the selected conversation.';
		} finally {
			loading = false;
		}
	}

	async function handleSend(content: string) {
		if (!api) return;
		const trimmed = content.trim();
		if (!trimmed) return;
		sending = true;
		error = null;
		notice = null;
		try {
			if (!conversation) throw new Error('Start or choose a genesis conversation first.');
			conversation = await api.sendMessage({
				conversationId: conversation.id,
				content: trimmed,
			});
			await refreshConversationList();
			schedulePoll();
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Failed to send the genesis message.';
			throw caught;
		} finally {
			sending = false;
		}
	}

	async function handleSuggestion(prompt: string) {
		await handleSend(prompt);
	}

	async function pollForResponse() {
		if (!api || !conversation) return;
		polling = true;
		error = null;
		try {
			const next = await api.pollConversation(conversation.id);
			if (next) {
				conversation = next;
				await refreshConversationList();
				if (next.turnStatus === 'waiting') {
					schedulePoll();
				}
			}
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Failed to poll the local conversation.';
		} finally {
			polling = false;
		}
	}

	async function recoverStuckTurn() {
		if (!api || !conversation) return;
		polling = true;
		error = null;
		notice = null;
		try {
			const next = await api.recoverStuckTurn(conversation.id);
			if (next) {
				conversation = next;
				notice = 'Recovered the stuck turn from the local transcript.';
				await refreshConversationList();
				schedulePoll();
			}
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Failed to recover the stuck turn.';
		} finally {
			polling = false;
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
			<div class="genesis-conversation__layout">
				<Card variant="elevated" padding="none" class="genesis-conversation__sidebar-card">
					<aside class="genesis-conversation__sidebar" aria-label="Genesis conversations">
						<div class="genesis-conversation__sidebar-header">
							<div>
								<p class="genesis-conversation__eyebrow">Resume</p>
								<h2>Conversations</h2>
							</div>
							<Button
								variant="outline"
								size="sm"
								onclick={handleNewConversation}
								disabled={loading || sending || polling}
								data-testid="genesis-conversation-new-sidebar"
							>
								New
							</Button>
						</div>

						{#if loadingList && conversations.length === 0}
							<p class="genesis-conversation__list-empty">Loading saved conversations…</p>
						{:else if conversations.length === 0}
							<div class="genesis-conversation__list-empty" data-testid="genesis-conversation-list-empty">
								<p>No saved genesis conversations yet.</p>
								<p>Start a local mock conversation, then it will appear here for resume testing.</p>
							</div>
						{:else}
							<ol class="genesis-conversation__list" data-testid="genesis-conversation-list">
								{#each conversations as item (item.id)}
									<li>
										<button
											type="button"
											class={conversationListItemClass(item.id)}
											onclick={() => handleSelectConversation(item.id)}
											disabled={loading || sending || polling}
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
									disabled={loading || sending || polling}
									data-testid="genesis-conversation-new"
								>
									New conversation
								</Button>
							{/snippet}
						</Chat.Header>

						<div class="genesis-conversation__context" data-testid="genesis-conversation-contract">
							<p>
								Local mock contract: start, send, poll, resume, follow up, and recover without
								Lesser, Host, AWS, raw endpoint, token, or credential calls.
							</p>
							{#if conversation}
								<p>
									Conversation <strong>{conversation.id}</strong>
									{#if conversation.activeBodyId}
										<span> · body {conversation.activeBodyId}</span>
									{/if}
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
									welcomeMessage="Describe purpose, boundaries, and continuity. The local mock keeps the transcript resumable."
									suggestions={STARTER_PROMPTS}
									onSuggestionClick={handleSuggestion}
								/>
							{:else if loading}
								<div class="genesis-conversation__start-prompt" data-testid="genesis-conversation-loading">
									<p>Loading genesis conversations…</p>
								</div>
							{:else}
								<div class="genesis-conversation__start-prompt" data-testid="genesis-conversation-start-prompt">
									<p class="genesis-conversation__eyebrow">Local mock ready</p>
									<h2>Start or resume a genesis conversation</h2>
									<p>
										Use the conversation list to resume a stored transcript, or start a new local
										mock thread to shape purpose, boundaries, and continuity.
									</p>
									<Button variant="solid" onclick={handleNewConversation} data-testid="genesis-conversation-start-new">
										Start new conversation
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
							disabled={loading || sending || hasPendingAssistant || !conversation}
							maxLength={1200}
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
