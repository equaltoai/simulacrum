<script lang="ts">
	import { authSession } from '$lib/auth/session';
	import { getStreamingAdapter } from '$lib/realtime/adapter';
	import { createLesserMessagesHandlers } from '$lib/greater/adapters';
	import type { LesserGraphQLAdapter } from '$lib/greater/adapters/graphql';
	import * as Messages from '$lib/components/messaging';
	import type {
		Conversation as MessagesConversation,
		ConversationFolder,
		DirectMessage as MessagesDirectMessage,
		MessageParticipant as MessagesParticipant,
		MessagesHandlers,
	} from '$lib/components/messaging';
	import MessagesFallbackPolling from '$lib/patterns/MessagesFallbackPolling.svelte';
	import AgentFaceFrame from './internal/AgentFaceFrame.svelte';
	import type { AgentFaceBaseData } from './types.js';

	type LesserConversation = NonNullable<Awaited<ReturnType<LesserGraphQLAdapter['getConversation']>>>;
	type LesserConversationParticipant = LesserConversation['accounts'][number];
	type LesserConversationMessage = NonNullable<LesserConversation['lastStatus']>;

	interface Props {
		data: AgentFaceBaseData;
		class?: string;
	}

	let { data, class: className = '' }: Props = $props();

	let handlers = $state<MessagesHandlers>({});
	let viewerId = $state<string | null>(null);
	let error = $state<string | null>(null);

	function mapParticipant(account: LesserConversationParticipant): MessagesParticipant {
		return {
			id: account.id,
			username: account.username,
			displayName: account.displayName ?? account.username,
			avatar: account.avatar ?? undefined,
		};
	}

	function mapMessage(
		message: LesserConversationMessage,
		conversationId: string
	): MessagesDirectMessage {
		return {
			id: message.id,
			conversationId,
			sender: mapParticipant(message.actor),
			content: message.content,
			createdAt: message.createdAt,
			read: true,
			mediaAttachments: message.attachments.map((attachment) => ({
				url: attachment.url,
				type: attachment.type,
				previewUrl: attachment.preview ?? undefined,
				description: attachment.description ?? undefined,
			})),
		};
	}

	function mapConversation(conversation: LesserConversation): MessagesConversation {
		const requestState = conversation.viewerMetadata.requestState;
		const folder: ConversationFolder = requestState === 'PENDING' ? 'REQUESTS' : 'INBOX';
		return {
			id: conversation.id,
			folder,
			requestState,
			requestedAt: conversation.viewerMetadata.requestedAt ?? null,
			acceptedAt: conversation.viewerMetadata.acceptedAt ?? null,
			declinedAt: conversation.viewerMetadata.declinedAt ?? null,
			participants: conversation.accounts.map(mapParticipant),
			lastMessage: conversation.lastStatus
				? mapMessage(conversation.lastStatus, conversation.id)
				: undefined,
			unreadCount: conversation.unread ? 1 : 0,
			updatedAt: conversation.updatedAt,
		};
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		handlers = {};
		viewerId = null;
		error = null;

		if (!token) return;

		const adapter = getStreamingAdapter(token);
		if (!adapter) {
			error = 'GraphQL adapter unavailable.';
			return;
		}

		handlers = createLesserMessagesHandlers({ adapter }) as unknown as MessagesHandlers;

		void (async () => {
			try {
				const viewer = await adapter.verifyCredentials();
				viewerId = viewer.id;
			} catch (err) {
				error = err instanceof Error ? err.message : String(err);
			}
		})();
	});
</script>

<AgentFaceFrame
	hero={data.hero}
	brand={data.brand}
	navItems={data.navItems}
	actions={data.actions}
	statusChips={data.statusChips}
	metrics={data.metrics}
	class={className}
>
	{#snippet children()}
		<div class="conversations-page">
			{#if error}
				<div class="conversations-page__notice conversations-page__notice--error" role="alert">
					{error}
				</div>
			{/if}

			<Messages.Root {handlers}>
				<MessagesFallbackPolling />
				<Messages.NewConversation />
				<Messages.Conversations currentUserId={viewerId ?? 'me'} />

				<div class="conversations-page__thread">
					<Messages.Thread currentUserId={viewerId ?? 'me'} />
					<Messages.Composer />
				</div>
			</Messages.Root>
		</div>
	{/snippet}
</AgentFaceFrame>

<style>
	.conversations-page {
		display: grid;
		gap: 0.75rem;
		min-width: 0;
		min-height: 60vh;
	}

	.conversations-page__thread {
		display: grid;
		gap: 0.5rem;
		min-height: 0;
	}

	.conversations-page__notice {
		padding: 1rem;
		border-radius: 0.75rem;
		background: rgba(255, 255, 255, 0.6);
		color: var(--gr-semantic-foreground-secondary);
	}

	.conversations-page__notice--error {
		background: color-mix(in srgb, var(--gr-color-error-100) 72%, white 28%);
		color: var(--gr-color-error-800);
	}
</style>
