<script lang="ts">
	import {
		completeMintConversation,
		completeAgentMintConversation,
		isHostSoulAgentId,
		startMintConversationStream,
		startAgentMintConversationStream,
	} from '$lib/api/soulWorkflowHost';
	import type { MintTranscriptMessage } from '../types';

	interface Props {
		hostToken?: string;
		hostBaseUrl?: string | null;
		hostAgentId?: string | null;
		registrationId?: string | null;
		initialConversationId?: string | null;
		initialTranscript?: readonly MintTranscriptMessage[];
		conversationStatus?: string | null;
		onUpdated?: () => Promise<void> | void;
	}

	interface SseEvent {
		event: string;
		data: string;
	}

	let {
		hostToken = '',
		hostBaseUrl = null,
		hostAgentId = null,
		registrationId = null,
		initialConversationId = null,
		initialTranscript = [],
		conversationStatus = null,
		onUpdated,
	}: Props = $props();

	let conversationId: string | null = $state(null);
	let transcript: MintTranscriptMessage[] = $state([]);
	let message = $state('');
	let status = $state('idle');
	let loading = $state(false);
	let error: string | null = $state(null);
	let success: string | null = $state(null);

	const scopedRegistrationId = $derived(registrationId?.trim() || null);
	const scopedHostAgentId = $derived(
		isHostSoulAgentId(hostAgentId) ? hostAgentId.trim() : null
	);
	const useRegistrationScope = $derived(Boolean(scopedRegistrationId && !scopedHostAgentId));
	const canCallHost = $derived(
		Boolean(hostToken.trim() && hostBaseUrl?.trim() && (scopedHostAgentId || scopedRegistrationId))
	);

	$effect(() => {
		if (!loading) {
			conversationId = initialConversationId;
			transcript = [...initialTranscript];
			status = conversationStatus ?? 'idle';
		}
	});

	function pushTranscriptMessage(next: MintTranscriptMessage) {
		transcript = [...transcript, next];
	}

	function updateAssistantMessage(content: string) {
		const last = transcript.at(-1);
		if (last?.id === 'streaming-assistant') {
			transcript = [...transcript.slice(0, -1), { ...last, content }];
			return;
		}

		pushTranscriptMessage({
			id: 'streaming-assistant',
			role: 'assistant',
			label: 'Agent',
			content,
		});
	}

	function parseSseChunk(buffer: string): { remainder: string; events: SseEvent[] } {
		const events: SseEvent[] = [];
		let remainder = buffer;

		while (true) {
			const boundary = remainder.indexOf('\n\n');
			if (boundary === -1) break;

			const block = remainder.slice(0, boundary);
			remainder = remainder.slice(boundary + 2);

			let event = 'message';
			const dataLines: string[] = [];
			for (const line of block.split('\n')) {
				if (line.startsWith('event:')) {
					event = line.slice(6).trim();
				} else if (line.startsWith('data:')) {
					dataLines.push(line.slice(5).trim());
				}
			}

			events.push({ event, data: dataLines.join('\n') });
		}

		return { remainder, events };
	}

	async function submitTurn() {
		if (!canCallHost || !message.trim()) return;

		loading = true;
		error = null;
		success = null;
		status = 'streaming';

		const inputMessage = message.trim();
		message = '';
		pushTranscriptMessage({
			id: crypto.randomUUID(),
			role: 'user',
			label: 'Operator',
			content: inputMessage,
		});

		let buffer = '';
		let assistantText = '';

		try {
			const input = {
				conversation_id: conversationId ?? undefined,
				message: inputMessage,
			};
			const stream = useRegistrationScope
				? startMintConversationStream({
						token: hostToken,
						baseUrl: hostBaseUrl ?? undefined,
						registrationId: scopedRegistrationId ?? '',
						input,
					})
				: startAgentMintConversationStream({
						token: hostToken,
						baseUrl: hostBaseUrl ?? undefined,
						agentId: scopedHostAgentId ?? '',
						input,
					});

			const reader = stream.getReader();

			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += value;
				const parsed = parseSseChunk(buffer);
				buffer = parsed.remainder;

				for (const event of parsed.events) {
					const payload = event.data ? (JSON.parse(event.data) as Record<string, unknown>) : {};
					if (event.event === 'conversation_start') {
						const nextConversationId = payload.conversation_id;
						if (typeof nextConversationId === 'string' && nextConversationId.trim()) {
							conversationId = nextConversationId.trim();
						}
					}

					if (event.event === 'delta') {
						const deltaText = typeof payload.text === 'string' ? payload.text : '';
						assistantText += deltaText;
						updateAssistantMessage(assistantText);
					}

					if (event.event === 'conversation_done') {
						const finalText =
							typeof payload.full_response === 'string' && payload.full_response.trim()
								? payload.full_response
								: assistantText;
						updateAssistantMessage(finalText);
						status = 'ready for completion';
						success = 'Conversation turn recorded from the genesis lane.';
						await onUpdated?.();
					}

					if (event.event === 'error') {
						const messageText =
							typeof payload.message === 'string'
								? payload.message
								: typeof payload.error === 'string'
									? payload.error
									: 'Mint conversation stream failed.';
						throw new Error(messageText);
					}
				}
			}
		} catch (streamError) {
			error =
				streamError instanceof Error
					? streamError.message
					: 'Mint conversation stream failed.';
			status = 'error';
		} finally {
			loading = false;
		}
	}

	async function markConversationComplete() {
		if (!canCallHost || !conversationId) return;

		loading = true;
		error = null;
		success = null;

		try {
			if (useRegistrationScope) {
				await completeMintConversation({
					token: hostToken,
					baseUrl: hostBaseUrl ?? undefined,
					registrationId: scopedRegistrationId ?? '',
					conversationId,
				});
			} else {
				await completeAgentMintConversation({
					token: hostToken,
					baseUrl: hostBaseUrl ?? undefined,
					agentId: scopedHostAgentId ?? '',
					conversationId,
				});
			}
			status = 'completed';
			success = 'Conversation marked complete and ready for finalize.';
			await onUpdated?.();
		} catch (completionError) {
			error =
				completionError instanceof Error
					? completionError.message
					: 'Failed to mark the conversation complete.';
		} finally {
			loading = false;
		}
	}
</script>

<section class="ft-panel">
	<header class="ft-panel__header">
		<div>
			<p class="ft-panel__eyebrow">Streaming mint conversation</p>
			<h2>Conversation actions</h2>
		</div>
		<span class="ft-panel__badge">{useRegistrationScope ? 'registration-scoped' : status}</span>
	</header>

	<p class="ft-panel__copy">
		Run the conversation directly from the genesis workspace, keep the transcript visible, and then promote the completed packet into the approval lane.
	</p>

	<div class="ft-transcript">
		{#if transcript.length}
			{#each transcript as item (item.id)}
				<article class:ft-transcript__item--assistant={item.role === 'assistant'} class="ft-transcript__item">
					<p class="ft-transcript__label">{item.label}</p>
					<p>{item.content}</p>
				</article>
			{/each}
		{:else}
			<p class="ft-panel__copy">No transcript loaded yet.</p>
		{/if}
	</div>

	<label class="ft-field">
		<span>Next turn</span>
		<textarea
			bind:value={message}
			disabled={!canCallHost || loading}
			placeholder="Describe the declaration, continuity, or boundary you want the mint conversation to explore."
			rows="4"
		></textarea>
	</label>

	<div class="ft-panel__actions">
		<button
			class="ft-button ft-button--primary"
			disabled={!canCallHost || !message.trim() || loading}
			onclick={submitTurn}
			type="button"
		>
			Send turn
		</button>
		<button
			class="ft-button"
			disabled={!canCallHost || !conversationId || loading}
			onclick={markConversationComplete}
			type="button"
		>
			Mark complete
		</button>
	</div>

	{#if success}
		<p class="ft-panel__message ft-panel__message--success">{success}</p>
	{/if}
	{#if error}
		<p class="ft-panel__message ft-panel__message--error">{error}</p>
	{/if}
</section>
