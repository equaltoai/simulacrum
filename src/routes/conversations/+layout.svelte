<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';

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

	type RouteMessagesHandlers = MessagesHandlers & {
		onFetchConversation?: (conversationId: string) => Promise<MessagesConversation | null>;
	};

	type LesserConversation = NonNullable<Awaited<ReturnType<LesserGraphQLAdapter['getConversation']>>>;
	type LesserConversationParticipant = LesserConversation['accounts'][number];
	type LesserConversationMessage = NonNullable<LesserConversation['lastStatus']>;

	function mapConversationParticipant(account: LesserConversationParticipant): MessagesParticipant {
		return {
			id: account.id,
			username: account.username,
			displayName: account.displayName ?? account.username,
			avatar: account.avatar ?? undefined,
		};
	}

	function mapConversationMessage(
		message: LesserConversationMessage,
		conversationId: string
	): MessagesDirectMessage {
		return {
			id: message.id,
			conversationId,
			sender: mapConversationParticipant(message.actor),
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
			participants: conversation.accounts.map(mapConversationParticipant),
			lastMessage: conversation.lastStatus
				? mapConversationMessage(conversation.lastStatus, conversation.id)
				: undefined,
			unreadCount: conversation.unread ? 1 : 0,
			updatedAt: conversation.updatedAt,
		};
	}

	async function fetchConversation(
		adapter: LesserGraphQLAdapter,
		conversationId: string
	): Promise<MessagesConversation | null> {
		const conversation = await adapter.getConversation(conversationId);
		return conversation ? mapConversation(conversation as LesserConversation) : null;
	}

	let { children } = $props<{ children?: Snippet }>();

	let handlers = $state<RouteMessagesHandlers>({});
	let viewerId = $state<string | null>(null);
	let error = $state<string | null>(null);

	function handleConversationCreated(conversationId: string) {
		void goto(`${base}/conversations/${encodeURIComponent(conversationId)}`);
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

		const baseHandlers = createLesserMessagesHandlers({ adapter }) as unknown as MessagesHandlers;
		const baseOnDeleteConversation = baseHandlers.onDeleteConversation;

		const nextHandlers: RouteMessagesHandlers = {
			...baseHandlers,
			onFetchConversation: async (conversationId) => fetchConversation(adapter, conversationId),
			onConversationClick: (conversation) => {
				void goto(`${base}/conversations/${encodeURIComponent(conversation.id)}`);
			},
		};

		if (baseOnDeleteConversation) {
			nextHandlers.onDeleteConversation = async (conversationId) => {
				const ok = await baseOnDeleteConversation(conversationId);
				if (ok === false) return false;

				void goto(`${base}/conversations`);
				return ok;
			};
		}

		handlers = nextHandlers;

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

{#if !$authSession}
	<section class="page">
		<h1>Conversations</h1>
		<p>Sign in to view conversations.</p>
	</section>
{:else}
	<section class="messages-page">
		<h1 class="sr-only">Conversations</h1>

		{#if error}
			<div class="page__notice page__notice--error" role="alert">{error}</div>
		{/if}

		<div class="messages-page__body">
			<Messages.Root {handlers}>
				<MessagesFallbackPolling />
				{#if children}
					{@render children()}
				{/if}

				<Messages.NewConversation onConversationCreated={handleConversationCreated} />
				<Messages.Conversations currentUserId={viewerId ?? 'me'} />

				<div class="messages-page__thread">
					<Messages.Thread currentUserId={viewerId ?? 'me'} />
					<Messages.Composer />
				</div>
			</Messages.Root>
		</div>
	</section>
{/if}
