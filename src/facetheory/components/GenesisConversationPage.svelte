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
	let draft = $state('');
	let loading = $state(true);
	let sending = $state(false);
	let polling = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let pollTimer: ReturnType<typeof setTimeout> | null = null;

	const chatMessages = $derived((conversation?.messages ?? []).map(toChatMessage));
	const hasPendingAssistant = $derived(
		(conversation?.messages ?? []).some(
			(message) =>
				message.role === 'assistant' &&
				(message.status === 'pending' || message.status === 'streaming')
		)
	);
	const statusLabel = $derived(statusCopy(conversation?.turnStatus ?? 'ready'));
	const statusColor = $derived(statusBadgeColor(conversation?.turnStatus ?? 'ready'));
	const connectionStatus = $derived(loading || sending || polling ? 'connecting' : 'connected');
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
		void loadOrStartConversation();
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

	async function loadOrStartConversation() {
		if (!api) return;
		loading = true;
		error = null;
		try {
			conversation = (await api.loadActiveConversation()) ?? (await startNewConversation());
			if (conversation?.turnStatus === 'waiting') {
				schedulePoll();
			}
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Failed to load the genesis conversation.';
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
		notice = 'Started a new local genesis conversation.';
		return next;
	}

	async function handleNewConversation() {
		if (!api) return;
		loading = true;
		error = null;
		try {
			conversation = await startNewConversation();
			draft = '';
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Failed to start a new conversation.';
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
			const active = conversation ?? (await startNewConversation());
			if (!active) throw new Error('Genesis conversation is not available.');
			conversation = await api.sendMessage({
				conversationId: active.id,
				content: trimmed,
			});
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
						<Chat.Messages
							welcomeTitle="Start the soul declaration"
							welcomeMessage="Describe purpose, boundaries, and continuity. The local mock keeps the transcript resumable."
							suggestions={STARTER_PROMPTS}
							onSuggestionClick={handleSuggestion}
						/>
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
						disabled={loading || sending || hasPendingAssistant}
						maxLength={1200}
						placeholder="Type a genesis message…"
					/>
				</Chat.Container>
			</Card>
		</div>
	{/snippet}
</AgentFaceFrame>

<style>
	.genesis-conversation {
		display: grid;
		gap: var(--gr-spacing-scale-5, 1.25rem);
		min-height: min(72vh, 56rem);
	}

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

	.genesis-conversation__recovery {
		display: flex;
		justify-content: flex-end;
		gap: var(--gr-spacing-scale-2, 0.5rem);
		padding: var(--gr-spacing-scale-2, 0.5rem) var(--gr-spacing-scale-4, 1rem);
		border-top: 1px solid var(--gr-semantic-border-default);
		background: color-mix(in srgb, var(--gr-semantic-background-secondary) 58%, transparent);
	}

	@media (max-width: 720px) {
		.genesis-conversation__context,
		.genesis-conversation__recovery {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
