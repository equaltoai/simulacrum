import {
	ActorByUsernameDocument,
	ClearNotificationsDocument,
	CreateNoteDocument,
	DismissNotificationDocument,
	NotificationsDocument,
	ObjectByIdDocument,
	TimelineDocument,
	type ActorByUsernameQuery,
	type ActorByUsernameQueryVariables,
	type ClearNotificationsMutation,
	type ClearNotificationsMutationVariables,
	type CreateNoteMutation,
	type CreateNoteMutationVariables,
	type DismissNotificationMutation,
	type DismissNotificationMutationVariables,
	type NotificationsQuery,
	type NotificationsQueryVariables,
	type ObjectByIdQuery,
	type ObjectByIdQueryVariables,
	type TimelineQuery,
	type TimelineQueryVariables,
	type TimelineType,
	type Visibility,
} from '$lib/greater/adapters/graphql';
import type { Account, Notification, Status } from '$lib/types';
import { getAccessToken } from './auth';
import { toAccount, toNotification, toStatus } from './adapters';
import { graphqlRequest } from './graphql';
import { restRequest } from './rest';
import type { MastodonStatusContext } from './mastodon';
import { toMastodonStatus } from './mastodon';

type ViewerQueryData = {
	viewer: {
		id: string;
		username: string;
		domain?: string | null;
		displayName?: string | null;
		summary?: string | null;
		avatar?: string | null;
		header?: string | null;
		followers: number;
		following: number;
		statusesCount: number;
		bot: boolean;
		locked: boolean;
		createdAt: string;
		updatedAt: string;
		trustScore: number;
		fields: Array<{ name: string; value: string; verifiedAt?: string | null }>;
	};
};

const VIEWER_QUERY = `
query Viewer {
	viewer {
		id
		username
		domain
		displayName
		summary
		avatar
		header
		followers
		following
		statusesCount
		bot
		locked
		createdAt
		updatedAt
		trustScore
		fields {
			name
			value
			verifiedAt
		}
	}
}
`;

export async function fetchViewer({ signal }: { signal?: AbortSignal } = {}): Promise<Account> {
	const token = getAccessToken();
	if (!token) {
		throw new Error('Not authenticated');
	}

	const data = await graphqlRequest<ViewerQueryData>({
		document: VIEWER_QUERY,
		token,
		signal,
	});

	return toAccount(data.viewer);
}

function requireAccessToken(): string {
	const token = getAccessToken();
	if (!token) throw new Error('Not authenticated');
	return token;
}

async function fetchTimeline({
	type,
	first = 20,
	after,
	actorId,
	signal,
}: {
	type: TimelineType;
	first?: number;
	after?: string;
	actorId?: string;
	signal?: AbortSignal;
}): Promise<{
	items: Status[];
	pageInfo: { endCursor: string | null; hasNextPage: boolean };
}> {
	const token = requireAccessToken();

	const variables: TimelineQueryVariables = {
		type,
		first,
		after,
		actorId,
	};

	const data = await graphqlRequest<TimelineQuery, TimelineQueryVariables>({
		document: TimelineDocument,
		variables,
		token,
		signal,
	});

	return {
		items: data.timeline.edges.map((edge) => toStatus(edge.node)),
		pageInfo: {
			endCursor: data.timeline.pageInfo.endCursor ?? null,
			hasNextPage: data.timeline.pageInfo.hasNextPage,
		},
	};
}

export async function fetchHomeTimeline({
	first = 20,
	after,
	signal,
}: {
	first?: number;
	after?: string;
	signal?: AbortSignal;
} = {}): Promise<{
	items: Status[];
	pageInfo: { endCursor: string | null; hasNextPage: boolean };
}> {
	return fetchTimeline({ type: 'HOME', first, after, signal });
}

export async function fetchLocalTimeline({
	first = 20,
	after,
	signal,
}: {
	first?: number;
	after?: string;
	signal?: AbortSignal;
} = {}): Promise<{
	items: Status[];
	pageInfo: { endCursor: string | null; hasNextPage: boolean };
}> {
	return fetchTimeline({ type: 'LOCAL', first, after, signal });
}

export async function fetchPublicTimeline({
	first = 20,
	after,
	signal,
}: {
	first?: number;
	after?: string;
	signal?: AbortSignal;
} = {}): Promise<{
	items: Status[];
	pageInfo: { endCursor: string | null; hasNextPage: boolean };
}> {
	return fetchTimeline({ type: 'PUBLIC', first, after, signal });
}

export async function createNote({
	content,
	visibility = 'PUBLIC',
	signal,
}: {
	content: string;
	visibility?: Visibility;
	signal?: AbortSignal;
}): Promise<Status> {
	const token = requireAccessToken();

	const variables: CreateNoteMutationVariables = {
		input: {
			content,
			visibility,
		},
	};

	const data = await graphqlRequest<CreateNoteMutation, CreateNoteMutationVariables>({
		document: CreateNoteDocument,
		variables,
		token,
		signal,
	});

	return toStatus(data.createNote.object);
}

export async function fetchActorByUsername({
	username,
	signal,
}: {
	username: string;
	signal?: AbortSignal;
}): Promise<Account> {
	const token = requireAccessToken();

	const variables: ActorByUsernameQueryVariables = { username };

	const data = await graphqlRequest<ActorByUsernameQuery, ActorByUsernameQueryVariables>({
		document: ActorByUsernameDocument,
		variables,
		token,
		signal,
	});

	if (!data.actor) {
		throw new Error('Account not found');
	}

	return toAccount(data.actor);
}

export async function fetchActorTimeline({
	actorId,
	first = 20,
	after,
	signal,
}: {
	actorId: string;
	first?: number;
	after?: string;
	signal?: AbortSignal;
}): Promise<{
	items: Status[];
	pageInfo: { endCursor: string | null; hasNextPage: boolean };
}> {
	return fetchTimeline({ type: 'ACTOR', actorId, first, after, signal });
}

export async function fetchObjectById({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<Status | null> {
	const token = requireAccessToken();

	const variables: ObjectByIdQueryVariables = { id };

	const data = await graphqlRequest<ObjectByIdQuery, ObjectByIdQueryVariables>({
		document: ObjectByIdDocument,
		variables,
		token,
		signal,
	});

	return data.object ? toStatus(data.object) : null;
}

export async function fetchNotifications({
	first = 20,
	after,
	signal,
}: {
	first?: number;
	after?: string;
	signal?: AbortSignal;
} = {}): Promise<{
	items: Notification[];
	pageInfo: { endCursor: string | null; hasNextPage: boolean };
	unreadCount: number;
}> {
	const token = requireAccessToken();

	const variables: NotificationsQueryVariables = {
		first,
		after,
	};

	const data = await graphqlRequest<NotificationsQuery, NotificationsQueryVariables>({
		document: NotificationsDocument,
		variables,
		token,
		signal,
	});

	const items: Notification[] = data.notifications.edges.map((edge) =>
		toNotification({
			id: edge.node.id,
			type: edge.node.type,
			read: edge.node.read,
			createdAt: edge.node.createdAt,
			account: {
				...edge.node.account,
				createdAt: edge.node.account.updatedAt,
			},
			status: edge.node.status ?? null,
		})
	);

	// We don't have a dedicated unread count in the GraphQL response; derive it.
	const unreadCount = items.reduce((count, n) => count + (n.read ? 0 : 1), 0);

	return {
		items,
		unreadCount,
		pageInfo: {
			endCursor: data.notifications.pageInfo.endCursor ?? null,
			hasNextPage: data.notifications.pageInfo.hasNextPage,
		},
	};
}

export async function dismissNotification({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const variables: DismissNotificationMutationVariables = { id };

	const data = await graphqlRequest<DismissNotificationMutation, DismissNotificationMutationVariables>({
		document: DismissNotificationDocument,
		variables,
		token,
		signal,
	});

	return data.dismissNotification;
}

export async function clearNotifications({ signal }: { signal?: AbortSignal } = {}): Promise<boolean> {
	const token = requireAccessToken();

	const data = await graphqlRequest<ClearNotificationsMutation, ClearNotificationsMutationVariables>({
		document: ClearNotificationsDocument,
		variables: {},
		token,
		signal,
	});

	return data.clearNotifications;
}

export async function fetchStatusById({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<Status> {
	const token = requireAccessToken();

	const data = await restRequest<import('./mastodon').MastodonStatus>({
		path: `/api/v1/statuses/${encodeURIComponent(id)}`,
		token,
		signal,
	});

	return toMastodonStatus(data);
}

export async function fetchStatusContext({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<{ ancestors: Status[]; descendants: Status[] }> {
	const token = requireAccessToken();

	const data = await restRequest<MastodonStatusContext>({
		path: `/api/v1/statuses/${encodeURIComponent(id)}/context`,
		token,
		signal,
	});

	return {
		ancestors: Array.isArray(data?.ancestors) ? data.ancestors.map(toMastodonStatus) : [],
		descendants: Array.isArray(data?.descendants) ? data.descendants.map(toMastodonStatus) : [],
	};
}

export const api = {
	graphqlRequest,
	restRequest,
	fetchViewer,
	fetchHomeTimeline,
	fetchLocalTimeline,
	fetchPublicTimeline,
	createNote,
	fetchActorByUsername,
	fetchActorTimeline,
	fetchObjectById,
	fetchNotifications,
	dismissNotification,
	clearNotifications,
	fetchStatusById,
	fetchStatusContext,
} as const;
