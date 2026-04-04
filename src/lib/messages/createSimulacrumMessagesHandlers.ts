import type {
	Conversation,
	ConversationFolder,
	DirectMessage,
	DmRequestState,
	MessageParticipant,
	MessagesHandlers,
} from '$lib/components/messaging';
import { graphqlRequest } from '$lib/api/graphql';
import { createLesserMessagesHandlers } from '$lib/greater/adapters';
import type { LesserGraphQLAdapter } from '$lib/greater/adapters/graphql';
import {
	ConversationsDocument,
	type ActorSummaryFragment,
	type ConversationsQuery,
	type ConversationsQueryVariables,
	type ObjectFieldsFragment,
} from '$lib/greater/adapters/graphql/generated/types.js';

export interface SimulacrumMessagesHandlersConfig {
	adapter: LesserGraphQLAdapter;
	token: string;
	pageSize?: number;
	searchLimit?: number;
}

type LesserConversationLike = ConversationsQuery['conversations'][number];

function mapActorToConversationParticipant(actor: ActorSummaryFragment): MessageParticipant {
	return {
		id: actor.id,
		username: actor.username,
		displayName: actor.displayName ?? actor.username,
		avatar: actor.avatar ?? undefined,
	};
}

function normalizeLocalParticipantId(participantId: string): string {
	const trimmed = participantId.trim();
	if (!trimmed) return trimmed;

	try {
		const url = new URL(trimmed);
		if (typeof window === 'undefined' || url.origin !== window.location.origin) {
			return trimmed;
		}

		const userMatch = url.pathname.match(/^\/users\/([^/]+)$/);
		if (userMatch?.[1]) {
			return decodeURIComponent(userMatch[1]);
		}
	} catch {
		// Keep non-URL ids as-is.
	}

	return trimmed;
}

function mapActorToSearchParticipant(actor: ActorSummaryFragment): MessageParticipant {
	return {
		id: actor.domain ? actor.id : actor.username,
		username: actor.username,
		displayName: actor.displayName ?? actor.username,
		avatar: actor.avatar ?? undefined,
	};
}

function mapObjectToDirectMessage(
	object: ObjectFieldsFragment,
	conversationId: string
): DirectMessage {
	return {
		id: object.id,
		conversationId,
		sender: mapActorToConversationParticipant(object.actor),
		content: object.content,
		createdAt: object.createdAt,
		read: true,
		mediaAttachments: object.attachments.map((attachment) => ({
			url: attachment.url,
			type: attachment.type,
			previewUrl: attachment.preview ?? undefined,
			description: attachment.description ?? undefined,
		})),
	};
}

function mapConversationToUiConversation(
	conversation: LesserConversationLike,
	folder: ConversationFolder
): Conversation {
	const requestState = conversation.viewerMetadata.requestState as DmRequestState;

	return {
		id: conversation.id,
		folder,
		requestState,
		requestedAt: conversation.viewerMetadata.requestedAt ?? null,
		acceptedAt: conversation.viewerMetadata.acceptedAt ?? null,
		declinedAt: conversation.viewerMetadata.declinedAt ?? null,
		participants: conversation.accounts.map(mapActorToConversationParticipant),
		lastMessage: conversation.lastStatus
			? mapObjectToDirectMessage(conversation.lastStatus, conversation.id)
			: undefined,
		unreadCount: conversation.unread ? 1 : 0,
		updatedAt: conversation.updatedAt,
	};
}

export function createSimulacrumMessagesHandlers(
	config: SimulacrumMessagesHandlersConfig
): MessagesHandlers {
	const { adapter, token, pageSize = 20, searchLimit = 10 } = config;
	const baseHandlers = createLesserMessagesHandlers({
		adapter,
		pageSize,
		searchLimit,
	}) as MessagesHandlers;

	return {
		...baseHandlers,
		onFetchConversations: async (folder = 'INBOX') => {
			// Work around the vendored Apollo cache policy for Query.conversations until
			// greater-components ships a fix.
			const data = await graphqlRequest<ConversationsQuery, ConversationsQueryVariables>({
				document: ConversationsDocument,
				variables: {
					folder,
					first: pageSize,
				},
				token,
			});

			return data.conversations.map((conversation) =>
				mapConversationToUiConversation(conversation, folder)
			);
		},
		onSearchParticipants: async (query) => {
			const results = await adapter.search({
				query,
				type: 'accounts',
				first: searchLimit,
			});

			return results.accounts.map(mapActorToSearchParticipant);
		},
		onCreateConversation: async (participantIds) => {
			const normalizedIds = participantIds.map(normalizeLocalParticipantId);
			const createConversation = baseHandlers.onCreateConversation;
			if (!createConversation) {
				throw new Error('Conversation creation is unavailable.');
			}
			return createConversation(normalizedIds);
		},
	};
}
