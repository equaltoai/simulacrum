import { print } from 'graphql';

import {
	ActorByUsernameDocument,
	ClearNotificationsDocument,
	DismissNotificationDocument,
	UpdateProfileDocument,
	NotificationsDocument,
	ObjectFieldsFragmentDoc,
	LikeObjectDocument,
	UnlikeObjectDocument,
	BookmarkObjectDocument,
	UnbookmarkObjectDocument,
	ShareObjectDocument,
	UnshareObjectDocument,
	PinObjectDocument,
	UnpinObjectDocument,
	DeleteObjectDocument,
	UpdateUserPreferencesDocument,
	UserPreferencesDocument,
	type ActorByUsernameQuery,
	type ActorByUsernameQueryVariables,
	type BookmarkObjectMutation,
	type BookmarkObjectMutationVariables,
	type ClearNotificationsMutation,
	type ClearNotificationsMutationVariables,
	type CreateNoteMutationVariables,
	type DeleteObjectMutation,
	type DeleteObjectMutationVariables,
	type DismissNotificationMutation,
	type DismissNotificationMutationVariables,
	type LikeObjectMutation,
	type LikeObjectMutationVariables,
	type NotificationsQuery,
	type NotificationsQueryVariables,
	type ObjectByIdQueryVariables,
	type ObjectFieldsFragment,
	type PinObjectMutation,
	type PinObjectMutationVariables,
	type ShareObjectMutation,
	type ShareObjectMutationVariables,
	type TimelineQueryVariables,
	type TimelineType,
	type UnlikeObjectMutation,
	type UnlikeObjectMutationVariables,
	type UnbookmarkObjectMutation,
	type UnbookmarkObjectMutationVariables,
	type UnpinObjectMutation,
	type UnpinObjectMutationVariables,
	type UnshareObjectMutation,
	type UnshareObjectMutationVariables,
	type UploadMediaInput,
	UploadMediaDocument,
	type UploadMediaMutation,
	type UploadMediaMutationVariables,
	type UpdateProfileMutation,
	type UpdateProfileMutationVariables,
	type UpdateStatusInput,
	type UpdateUserPreferencesMutation,
	type UpdateUserPreferencesMutationVariables,
	type UserPreferencesQuery,
	type UserPreferencesQueryVariables,
	type Visibility,
	type Poll as GraphQLPoll,
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

type ViewerObjectState = {
	viewerFavourited?: boolean;
	viewerBookmarked?: boolean;
	viewerPinned?: boolean;
};

type ObjectWithViewerState = ObjectFieldsFragment &
	ViewerObjectState & {
		boostedObject?: (NonNullable<ObjectFieldsFragment['boostedObject']> & ViewerObjectState) | null;
	};

const OBJECT_FIELDS_FRAGMENT = print(ObjectFieldsFragmentDoc);

type ObjectWithViewerStateAndPoll = ObjectWithViewerState & {
	poll?: GraphQLPoll | null;
	boostedObject?: (NonNullable<ObjectWithViewerState['boostedObject']> & { poll?: GraphQLPoll | null }) | null;
};

const POLL_FIELDS = `
poll {
	id
	expiresAt
	expired
	multiple
	voted
	ownVotes
	votersCount
	votesCount
	hideTotals
	options {
		title
		votesCount
	}
}
`;

const TIMELINE_WITH_VIEWER_STATE_QUERY = `
${OBJECT_FIELDS_FRAGMENT}
query TimelineWithViewerState(
	$type: TimelineType!
	$first: Int = 20
	$after: Cursor
	$hashtag: String
	$listId: ID
	$actorId: ID
	$mediaOnly: Boolean = false
) {
	timeline(type: $type, first: $first, after: $after, hashtag: $hashtag, listId: $listId, actorId: $actorId, mediaOnly: $mediaOnly) {
		edges {
			cursor
			node {
				...ObjectFields
				${POLL_FIELDS}
				viewerFavourited
				viewerBookmarked
				viewerPinned
				boostedObject {
					${POLL_FIELDS}
					viewerFavourited
					viewerBookmarked
					viewerPinned
				}
			}
		}
		pageInfo {
			hasNextPage
			endCursor
		}
		totalCount
	}
}
`;

const OBJECT_BY_ID_WITH_VIEWER_STATE_QUERY = `
${OBJECT_FIELDS_FRAGMENT}
query ObjectByIdWithViewerState($id: ID!) {
	object(id: $id) {
		...ObjectFields
		${POLL_FIELDS}
		viewerFavourited
		viewerBookmarked
		viewerPinned
		boostedObject {
			${POLL_FIELDS}
			viewerFavourited
			viewerBookmarked
			viewerPinned
		}
	}
}
`;

const THREAD_CONTEXT_WITH_POSTS_QUERY = `
${OBJECT_FIELDS_FRAGMENT}
query ThreadContextWithPosts($noteId: ID!) {
	threadContext(noteId: $noteId) {
		rootNote {
			...ObjectFields
			${POLL_FIELDS}
			viewerFavourited
			viewerBookmarked
			viewerPinned
			boostedObject {
				${POLL_FIELDS}
				viewerFavourited
				viewerBookmarked
				viewerPinned
			}
		}
		ancestors {
			...ObjectFields
			${POLL_FIELDS}
			viewerFavourited
			viewerBookmarked
			viewerPinned
			boostedObject {
				${POLL_FIELDS}
				viewerFavourited
				viewerBookmarked
				viewerPinned
			}
		}
		descendants {
			...ObjectFields
			${POLL_FIELDS}
			viewerFavourited
			viewerBookmarked
			viewerPinned
			boostedObject {
				${POLL_FIELDS}
				viewerFavourited
				viewerBookmarked
				viewerPinned
			}
		}
		replyCount
		participantCount
		lastActivity
		missingPosts
		syncStatus
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

	const data = await graphqlRequest<
		{
			timeline: {
				edges: Array<{ cursor: string; node: ObjectWithViewerStateAndPoll }>;
				pageInfo: { endCursor?: string | null; hasNextPage: boolean };
			};
		},
		TimelineQueryVariables
	>({
		document: TIMELINE_WITH_VIEWER_STATE_QUERY,
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
	inReplyToId,
	quoteId,
	poll,
	sensitive,
	spoilerText,
	attachmentIds,
	signal,
}: {
	content: string;
	visibility?: Visibility;
	inReplyToId?: string;
	quoteId?: string;
	poll?: CreateNoteMutationVariables['input']['poll'];
	sensitive?: boolean;
	spoilerText?: string;
	attachmentIds?: string[];
	signal?: AbortSignal;
}): Promise<Status> {
	const token = requireAccessToken();

	const variables: CreateNoteMutationVariables = {
		input: {
			content,
			visibility,
			...(inReplyToId ? { inReplyToId } : {}),
			...(quoteId ? { quoteId } : {}),
			...(poll ? { poll } : {}),
			...(typeof sensitive === 'boolean' ? { sensitive } : {}),
			...(typeof spoilerText === 'string' ? { spoilerText } : {}),
			...(attachmentIds && attachmentIds.length > 0 ? { attachmentIds } : {}),
		},
	};

	const data = await graphqlRequest<
		{ createNote: { object: ObjectWithViewerStateAndPoll } },
		CreateNoteMutationVariables
	>({
		document: `
${OBJECT_FIELDS_FRAGMENT}
mutation CreateNoteWithExtras($input: CreateNoteInput!) {
	createNote(input: $input) {
		object {
			...ObjectFields
			${POLL_FIELDS}
			viewerFavourited
			viewerBookmarked
			viewerPinned
			boostedObject {
				${POLL_FIELDS}
				viewerFavourited
				viewerBookmarked
				viewerPinned
			}
		}
	}
}
`,
		variables,
		token,
		signal,
	});

	return toStatus(data.createNote.object);
}

export async function updateStatus({
	id,
	input,
	signal,
}: {
	id: string;
	input: UpdateStatusInput;
	signal?: AbortSignal;
}): Promise<Status> {
	const token = requireAccessToken();

	const data = await graphqlRequest<
		{ updateStatus: ObjectWithViewerStateAndPoll },
		{ id: string; input: UpdateStatusInput }
	>({
		document: `
${OBJECT_FIELDS_FRAGMENT}
mutation UpdateStatusWithExtras($id: ID!, $input: UpdateStatusInput!) {
	updateStatus(id: $id, input: $input) {
		...ObjectFields
		${POLL_FIELDS}
		viewerFavourited
		viewerBookmarked
		viewerPinned
		boostedObject {
			${POLL_FIELDS}
			viewerFavourited
			viewerBookmarked
			viewerPinned
		}
	}
}
`,
		variables: { id, input },
		token,
		signal,
	});

	return toStatus(data.updateStatus);
}

export async function uploadMedia({
	input,
	signal,
}: {
	input: UploadMediaInput;
	signal?: AbortSignal;
}): Promise<UploadMediaMutation['uploadMedia']> {
	const token = requireAccessToken();

	const { file, ...rest } = input;

	const inferredFilename =
		(typeof rest.filename === 'string' && rest.filename.trim().length > 0 ? rest.filename : undefined) ??
		(typeof File !== 'undefined' && file instanceof File ? file.name : undefined) ??
		'upload.bin';

	const operations: { query: string; variables: UploadMediaMutationVariables } = {
		query: print(UploadMediaDocument),
		variables: {
			input: {
				...rest,
				filename:
					rest.filename ??
					(typeof File !== 'undefined' && file instanceof File ? file.name : undefined),
				sensitive: rest.sensitive ?? false,
				spoilerText: rest.spoilerText ?? null,
				mediaType: rest.mediaType ?? null,
				file: null,
			} as unknown as UploadMediaMutationVariables['input'],
		},
	};

	const formData = new FormData();
	formData.append('operations', JSON.stringify(operations));
	formData.append('map', JSON.stringify({ 0: ['variables.input.file'] }));
	formData.append('0', file as unknown as Blob, inferredFilename);

	const response = await fetch('/api/graphql', {
		method: 'POST',
		headers: {
			accept: 'application/json',
			authorization: `Bearer ${token}`,
		},
		body: formData,
		signal,
	});

	const payload = (await response.json().catch(() => null)) as {
		data?: UploadMediaMutation;
		errors?: Array<{ message: string }>;
	} | null;

	if (!response.ok) {
		const message = payload?.errors?.[0]?.message ?? `Upload failed (${response.status})`;
		throw new Error(message);
	}

	if (payload?.errors?.length) {
		throw new Error(payload.errors.map((error) => error.message).join('; '));
	}

	const uploadPayload = payload?.data?.uploadMedia;
	if (!uploadPayload) {
		throw new Error('Upload media mutation returned no payload.');
	}

	return uploadPayload;
}

type CustomEmoji = {
	id: string;
	shortcode: string;
	url: string;
	staticUrl: string;
	category?: string | null;
	visibleInPicker: boolean;
	domain?: string | null;
};

const CUSTOM_EMOJIS_QUERY = `
query CustomEmojis {
	customEmojis {
		id
		shortcode
		url
		staticUrl
		category
		visibleInPicker
		domain
	}
}
`;

export async function fetchCustomEmojis({
	signal,
}: {
	signal?: AbortSignal;
} = {}): Promise<CustomEmoji[]> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ customEmojis: CustomEmoji[] }>({
		document: CUSTOM_EMOJIS_QUERY,
		token,
		signal,
	});

	return data.customEmojis;
}

export async function likeObject({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<LikeObjectMutation['likeObject']> {
	const token = requireAccessToken();

	const variables: LikeObjectMutationVariables = { id };

	const data = await graphqlRequest<LikeObjectMutation, LikeObjectMutationVariables>({
		document: LikeObjectDocument,
		variables,
		token,
		signal,
	});

	return data.likeObject;
}

export async function unlikeObject({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const variables: UnlikeObjectMutationVariables = { id };

	const data = await graphqlRequest<UnlikeObjectMutation, UnlikeObjectMutationVariables>({
		document: UnlikeObjectDocument,
		variables,
		token,
		signal,
	});

	return data.unlikeObject;
}

export async function bookmarkObject({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<Status> {
	const token = requireAccessToken();

	const variables: BookmarkObjectMutationVariables = { id };

	const data = await graphqlRequest<BookmarkObjectMutation, BookmarkObjectMutationVariables>({
		document: BookmarkObjectDocument,
		variables,
		token,
		signal,
	});

	return toStatus(data.bookmarkObject);
}

export async function unbookmarkObject({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const variables: UnbookmarkObjectMutationVariables = { id };

	const data = await graphqlRequest<UnbookmarkObjectMutation, UnbookmarkObjectMutationVariables>({
		document: UnbookmarkObjectDocument,
		variables,
		token,
		signal,
	});

	return data.unbookmarkObject;
}

export async function shareObject({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<Status> {
	const token = requireAccessToken();

	const variables: ShareObjectMutationVariables = { id };

	const data = await graphqlRequest<ShareObjectMutation, ShareObjectMutationVariables>({
		document: ShareObjectDocument,
		variables,
		token,
		signal,
	});

	return toStatus(data.shareObject);
}

export async function unshareObject({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<Status> {
	const token = requireAccessToken();

	const variables: UnshareObjectMutationVariables = { id };

	const data = await graphqlRequest<UnshareObjectMutation, UnshareObjectMutationVariables>({
		document: UnshareObjectDocument,
		variables,
		token,
		signal,
	});

	return toStatus(data.unshareObject);
}

export async function pinObject({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<Status> {
	const token = requireAccessToken();

	const variables: PinObjectMutationVariables = { id };

	const data = await graphqlRequest<PinObjectMutation, PinObjectMutationVariables>({
		document: PinObjectDocument,
		variables,
		token,
		signal,
	});

	return toStatus(data.pinObject);
}

export async function unpinObject({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const variables: UnpinObjectMutationVariables = { id };

	const data = await graphqlRequest<UnpinObjectMutation, UnpinObjectMutationVariables>({
		document: UnpinObjectDocument,
		variables,
		token,
		signal,
	});

	return data.unpinObject;
}

export async function deleteObject({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const variables: DeleteObjectMutationVariables = { id };

	const data = await graphqlRequest<DeleteObjectMutation, DeleteObjectMutationVariables>({
		document: DeleteObjectDocument,
		variables,
		token,
		signal,
	});

	return data.deleteObject;
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

	const data = await graphqlRequest<
		{ object?: ObjectWithViewerStateAndPoll | null },
		ObjectByIdQueryVariables
	>({
		document: OBJECT_BY_ID_WITH_VIEWER_STATE_QUERY,
		variables,
		token,
		signal,
	});

	return data.object ? toStatus(data.object) : null;
}

export async function fetchThreadContext({
	noteId,
	signal,
}: {
	noteId: string;
	signal?: AbortSignal;
}): Promise<{ rootNote: Status; ancestors: Status[]; descendants: Status[] } | null> {
	const token = requireAccessToken();

	const data = await graphqlRequest<
		{
			threadContext?: {
				rootNote: ObjectWithViewerStateAndPoll;
				ancestors: ObjectWithViewerStateAndPoll[];
				descendants: ObjectWithViewerStateAndPoll[];
			} | null;
		},
		{ noteId: string }
	>({
		document: THREAD_CONTEXT_WITH_POSTS_QUERY,
		variables: { noteId },
		token,
		signal,
	});

	if (!data.threadContext) return null;

	return {
		rootNote: toStatus(data.threadContext.rootNote),
		ancestors: data.threadContext.ancestors.map((item) => toStatus(item)),
		descendants: data.threadContext.descendants.map((item) => toStatus(item)),
	};
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

export async function updateProfile({
	input,
	signal,
}: {
	input: UpdateProfileMutationVariables['input'];
	signal?: AbortSignal;
}): Promise<Account> {
	const token = requireAccessToken();

	const variables: UpdateProfileMutationVariables = { input };

	const data = await graphqlRequest<UpdateProfileMutation, UpdateProfileMutationVariables>({
		document: UpdateProfileDocument,
		variables,
		token,
		signal,
	});

	return toAccount({
		...data.updateProfile,
		createdAt: data.updateProfile.updatedAt,
	});
}

export type UserPreferences = UserPreferencesQuery['userPreferences'];

export async function fetchUserPreferences({
	signal,
}: {
	signal?: AbortSignal;
} = {}): Promise<UserPreferences> {
	const token = requireAccessToken();

	const data = await graphqlRequest<UserPreferencesQuery, UserPreferencesQueryVariables>({
		document: UserPreferencesDocument,
		variables: {},
		token,
		signal,
	});

	return data.userPreferences;
}

export async function updateUserPreferences({
	input,
	signal,
}: {
	input: UpdateUserPreferencesMutationVariables['input'];
	signal?: AbortSignal;
}): Promise<UserPreferences> {
	const token = requireAccessToken();

	const variables: UpdateUserPreferencesMutationVariables = { input };

	const data = await graphqlRequest<UpdateUserPreferencesMutation, UpdateUserPreferencesMutationVariables>({
		document: UpdateUserPreferencesDocument,
		variables,
		token,
		signal,
	});

	return data.updateUserPreferences;
}

type AdminReviewer = {
	id: string;
	username: string;
	role: string;
	totalReviews: number;
	accurateReviews: number;
	accuracyRate: number;
	lastReviewAt?: string | null;
};

const ADMIN_REVIEWERS_QUERY = `
query AdminModerationReviewers {
	adminModerationReviewers {
		id
		username
		role
		totalReviews
		accurateReviews
		accuracyRate
		lastReviewAt
	}
}
`;

export async function fetchAdminModerationReviewers({
	signal,
}: {
	signal?: AbortSignal;
} = {}): Promise<AdminReviewer[]> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ adminModerationReviewers: AdminReviewer[] }>({
		document: ADMIN_REVIEWERS_QUERY,
		token,
		signal,
	});

	return data.adminModerationReviewers;
}

export const api = {
	graphqlRequest,
	restRequest,
	fetchViewer,
	fetchHomeTimeline,
	fetchLocalTimeline,
	fetchPublicTimeline,
	createNote,
	updateStatus,
	uploadMedia,
	fetchCustomEmojis,
	likeObject,
	unlikeObject,
	bookmarkObject,
	unbookmarkObject,
	shareObject,
	unshareObject,
	pinObject,
	unpinObject,
	deleteObject,
	fetchActorByUsername,
	fetchActorTimeline,
	fetchObjectById,
	fetchThreadContext,
	fetchNotifications,
	dismissNotification,
	clearNotifications,
	fetchStatusById,
	fetchStatusContext,
	updateProfile,
	fetchUserPreferences,
	updateUserPreferences,
	fetchAdminModerationReviewers,
} as const;
