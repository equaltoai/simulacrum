import { print } from 'graphql';

import {
	ActorByUsernameDocument,
	AddAccountsToListDocument,
	ClearNotificationsDocument,
	CreateListDocument,
	DeleteListDocument,
	FollowedHashtagsDocument,
	FollowHashtagDocument,
	DismissNotificationDocument,
	ListDocument,
	ListsDocument,
	MuteHashtagDocument,
	UpdateProfileDocument,
	NotificationsDocument,
	ObjectFieldsFragmentDoc,
	LikeObjectDocument,
	UnlikeObjectDocument,
	BookmarkObjectDocument,
	UnbookmarkObjectDocument,
	RemoveAccountsFromListDocument,
	SearchDocument,
	ShareObjectDocument,
	UnshareObjectDocument,
	PinObjectDocument,
	UnpinObjectDocument,
	DeleteObjectDocument,
	UnfollowHashtagDocument,
	UpdateListDocument,
	UpdateUserPreferencesDocument,
	UserPreferencesDocument,
	type ActorByUsernameQuery,
	type ActorByUsernameQueryVariables,
	type AddAccountsToListMutation,
	type AddAccountsToListMutationVariables,
	type BookmarkObjectMutation,
	type BookmarkObjectMutationVariables,
	type ClearNotificationsMutation,
	type ClearNotificationsMutationVariables,
	type CreateListMutation,
	type CreateListMutationVariables,
	type CreateNoteMutationVariables,
	type DeleteListMutation,
	type DeleteListMutationVariables,
	type DeleteObjectMutation,
	type DeleteObjectMutationVariables,
	type DismissNotificationMutation,
	type DismissNotificationMutationVariables,
	type FollowedHashtagsQuery,
	type FollowedHashtagsQueryVariables,
	type FollowHashtagMutation,
	type FollowHashtagMutationVariables,
	type LikeObjectMutation,
	type LikeObjectMutationVariables,
	type ListQuery,
	type ListQueryVariables,
	type ListsQuery,
	type ListsQueryVariables,
	type MuteHashtagMutation,
	type MuteHashtagMutationVariables,
	type NotificationsQuery,
	type NotificationsQueryVariables,
	type ObjectByIdQueryVariables,
	type ObjectFieldsFragment,
	type NotificationLevel,
	type HashtagNotificationSettingsInput,
	type PinObjectMutation,
	type PinObjectMutationVariables,
	type ShareObjectMutation,
	type ShareObjectMutationVariables,
	type RepliesPolicy,
	type SearchQuery,
	type SearchQueryVariables,
	type TimelineQueryVariables,
	type TimelineType,
	type UnlikeObjectMutation,
	type UnlikeObjectMutationVariables,
	type UnbookmarkObjectMutation,
	type UnbookmarkObjectMutationVariables,
	type UnfollowHashtagMutation,
	type UnfollowHashtagMutationVariables,
	type UnpinObjectMutation,
	type UnpinObjectMutationVariables,
	type UnshareObjectMutation,
	type UnshareObjectMutationVariables,
	type UploadMediaInput,
	UploadMediaDocument,
	type UploadMediaMutation,
	type UploadMediaMutationVariables,
	type RemoveAccountsFromListMutation,
	type RemoveAccountsFromListMutationVariables,
	type UpdateListMutation,
	type UpdateListMutationVariables,
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
	hashtag,
	listId,
	mediaOnly,
	signal,
}: {
	type: TimelineType;
	first?: number;
	after?: string;
	actorId?: string;
	hashtag?: string;
	listId?: string;
	mediaOnly?: boolean;
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
		hashtag,
		listId,
		mediaOnly,
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

export async function fetchHashtagTimeline({
	hashtag,
	first = 20,
	after,
	signal,
}: {
	hashtag: string;
	first?: number;
	after?: string;
	signal?: AbortSignal;
}): Promise<{
	items: Status[];
	pageInfo: { endCursor: string | null; hasNextPage: boolean };
}> {
	return fetchTimeline({ type: 'HASHTAG', hashtag, first, after, signal });
}

export async function fetchListTimeline({
	listId,
	first = 20,
	after,
	signal,
}: {
	listId: string;
	first?: number;
	after?: string;
	signal?: AbortSignal;
}): Promise<{
	items: Status[];
	pageInfo: { endCursor: string | null; hasNextPage: boolean };
}> {
	return fetchTimeline({ type: 'LIST', listId, first, after, signal });
}

export type SearchResults = {
	accounts: Account[];
	statuses: Status[];
	hashtags: Array<{ name: string; url: string }>;
};

export async function search({
	query,
	type,
	first = 20,
	after,
	signal,
}: {
	query: string;
	type?: string;
	first?: number;
	after?: string;
	signal?: AbortSignal;
}): Promise<SearchResults> {
	const token = requireAccessToken();

	const variables: SearchQueryVariables = {
		query,
		type,
		first,
		after,
	};

	const data = await graphqlRequest<SearchQuery, SearchQueryVariables>({
		document: SearchDocument,
		variables,
		token,
		signal,
	});

	return {
		accounts: data.search.accounts.map((account) => toAccount(account)),
		statuses: data.search.statuses.map((status) => toStatus(status)),
		hashtags: data.search.hashtags.map((tag) => ({ name: tag.name, url: tag.url })),
	};
}

export async function searchAccounts({
	query,
	first = 20,
	after,
	signal,
}: {
	query: string;
	first?: number;
	after?: string;
	signal?: AbortSignal;
}): Promise<Account[]> {
	const results = await search({ query, first, after, signal });
	return results.accounts;
}

export type TrendingTag = {
	name: string;
	url: string;
	uses: number;
	accounts: number;
	history: number[];
};

export type TrendingLink = {
	url: string;
	title: string;
	description: string;
	authorName: string;
	shares: number;
	image: string;
	type: string;
};

export type TrendingStatus = {
	id: string;
	url: string;
	content: string;
	engagements: number;
	publishedAt: string;
	authorId: string;
};

const TRENDS_QUERY = `
query ExploreTrends($limit: Int) {
	trendingTags(limit: $limit) {
		name
		url
		uses
		accounts
		history
	}
	trendingLinks(limit: $limit) {
		url
		title
		description
		authorName
		shares
		image
		type
	}
	trendingStatuses(limit: $limit) {
		id
		url
		content
		engagements
		publishedAt
		authorId
	}
}
`;

export async function fetchTrends({
	limit = 10,
	signal,
}: {
	limit?: number;
	signal?: AbortSignal;
} = {}): Promise<{ tags: TrendingTag[]; links: TrendingLink[]; statuses: TrendingStatus[] }> {
	const token = requireAccessToken();

	const data = await graphqlRequest<
		{
			trendingTags: TrendingTag[];
			trendingLinks: TrendingLink[];
			trendingStatuses: TrendingStatus[];
		},
		{ limit?: number }
	>({
		document: TRENDS_QUERY,
		variables: { limit },
		token,
		signal,
	});

	return {
		tags: data.trendingTags ?? [],
		links: data.trendingLinks ?? [],
		statuses: data.trendingStatuses ?? [],
	};
}

export type HashtagNotificationSettings = {
	level: NotificationLevel;
	muted: boolean;
	mutedUntil?: string | null;
};

export type HashtagInfo = {
	name: string;
	displayName: string;
	url: string;
	isFollowing: boolean;
	followedAt?: string | null;
	followerCount: number;
	postCount: number;
	trendingScore: number;
	notificationSettings?: HashtagNotificationSettings | null;
	relatedHashtags: Array<{ name: string; url: string }>;
};

const HASHTAG_QUERY = `
query HashtagPage($name: String!) {
	hashtag(name: $name) {
		name
		displayName
		url
		isFollowing
		followedAt
		followerCount
		postCount
		trendingScore
		notificationSettings {
			level
			muted
			mutedUntil
		}
		relatedHashtags {
			name
			url
		}
	}
}
`;

export async function fetchHashtag({
	name,
	signal,
}: {
	name: string;
	signal?: AbortSignal;
}): Promise<HashtagInfo | null> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ hashtag?: HashtagInfo | null }, { name: string }>({
		document: HASHTAG_QUERY,
		variables: { name },
		token,
		signal,
	});

	return data.hashtag ?? null;
}

export type FollowedHashtag = {
	name: string;
	url: string;
	isFollowing: boolean;
	followedAt?: string | null;
	notificationSettings?: HashtagNotificationSettings | null;
};

export async function fetchFollowedHashtags({
	first = 20,
	after,
	signal,
}: {
	first?: number;
	after?: string;
	signal?: AbortSignal;
} = {}): Promise<FollowedHashtag[]> {
	const token = requireAccessToken();

	const variables: FollowedHashtagsQueryVariables = { first, after };

	const data = await graphqlRequest<FollowedHashtagsQuery, FollowedHashtagsQueryVariables>({
		document: FollowedHashtagsDocument,
		variables,
		token,
		signal,
	});

	return data.followedHashtags.edges.map((edge) => ({
		name: edge.node.name,
		url: edge.node.url,
		isFollowing: edge.node.isFollowing,
		followedAt: edge.node.followedAt ?? null,
		notificationSettings: edge.node.notificationSettings
			? {
					level: edge.node.notificationSettings.level,
					muted: edge.node.notificationSettings.muted,
					mutedUntil: edge.node.notificationSettings.mutedUntil ?? null,
				}
			: null,
	}));
}

export async function followHashtag({
	hashtag,
	notifyLevel,
	signal,
}: {
	hashtag: string;
	notifyLevel?: NotificationLevel;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const variables: FollowHashtagMutationVariables = { hashtag, notifyLevel };

	const data = await graphqlRequest<FollowHashtagMutation, FollowHashtagMutationVariables>({
		document: FollowHashtagDocument,
		variables,
		token,
		signal,
	});

	return data.followHashtag.success;
}

export async function unfollowHashtag({
	hashtag,
	signal,
}: {
	hashtag: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const variables: UnfollowHashtagMutationVariables = { hashtag };

	const data = await graphqlRequest<UnfollowHashtagMutation, UnfollowHashtagMutationVariables>({
		document: UnfollowHashtagDocument,
		variables,
		token,
		signal,
	});

	return data.unfollowHashtag.success;
}

export async function muteHashtag({
	hashtag,
	until,
	signal,
}: {
	hashtag: string;
	until?: string;
	signal?: AbortSignal;
}): Promise<{ success: boolean; mutedUntil?: string | null }> {
	const token = requireAccessToken();

	const variables: MuteHashtagMutationVariables = { hashtag, until };

	const data = await graphqlRequest<MuteHashtagMutation, MuteHashtagMutationVariables>({
		document: MuteHashtagDocument,
		variables,
		token,
		signal,
	});

	return { success: data.muteHashtag.success, mutedUntil: data.muteHashtag.mutedUntil ?? null };
}

const UPDATE_HASHTAG_NOTIFICATIONS_MUTATION = `
mutation UpdateHashtagNotifications($hashtag: String!, $settings: HashtagNotificationSettingsInput!) {
	updateHashtagNotifications(hashtag: $hashtag, settings: $settings) {
		success
		settings {
			level
			muted
			mutedUntil
		}
	}
}
`;

export async function updateHashtagNotifications({
	hashtag,
	settings,
	signal,
}: {
	hashtag: string;
	settings: HashtagNotificationSettingsInput;
	signal?: AbortSignal;
}): Promise<{ success: boolean; settings?: HashtagNotificationSettings | null }> {
	const token = requireAccessToken();

	const data = await graphqlRequest<
		{
			updateHashtagNotifications: {
				success: boolean;
				settings: HashtagNotificationSettings;
			};
		},
		{ hashtag: string; settings: HashtagNotificationSettingsInput }
	>({
		document: UPDATE_HASHTAG_NOTIFICATIONS_MUTATION,
		variables: { hashtag, settings },
		token,
		signal,
	});

	return {
		success: data.updateHashtagNotifications.success,
		settings: data.updateHashtagNotifications.settings,
	};
}

export async function unmuteHashtag({
	hashtag,
	level = 'ALL',
	signal,
}: {
	hashtag: string;
	level?: NotificationLevel;
	signal?: AbortSignal;
}): Promise<{ success: boolean; settings?: HashtagNotificationSettings | null }> {
	return updateHashtagNotifications({
		hashtag,
		settings: {
			level,
			muted: false,
			mutedUntil: null,
		},
		signal,
	});
}

export type LesserList = {
	id: string;
	title: string;
	repliesPolicy: RepliesPolicy;
	exclusive: boolean;
	accountCount: number;
	createdAt: string;
	updatedAt: string;
	accounts?: Account[];
};

function toLesserListSummary(list: {
	id: string;
	title: string;
	repliesPolicy: RepliesPolicy;
	exclusive: boolean;
	accountCount: number;
	createdAt: string;
	updatedAt: string;
}): LesserList {
	return {
		id: list.id,
		title: list.title,
		repliesPolicy: list.repliesPolicy,
		exclusive: list.exclusive,
		accountCount: list.accountCount,
		createdAt: list.createdAt,
		updatedAt: list.updatedAt,
	};
}

export async function fetchLists({
	signal,
}: {
	signal?: AbortSignal;
} = {}): Promise<LesserList[]> {
	const token = requireAccessToken();

	const data = await graphqlRequest<ListsQuery, ListsQueryVariables>({
		document: ListsDocument,
		token,
		signal,
	});

	return data.lists.map((list) => toLesserListSummary(list));
}

export async function fetchList({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<LesserList | null> {
	const token = requireAccessToken();

	const variables: ListQueryVariables = { id };

	const data = await graphqlRequest<ListQuery, ListQueryVariables>({
		document: ListDocument,
		variables,
		token,
		signal,
	});

	if (!data.list) return null;

	return {
		...toLesserListSummary(data.list),
		accounts: data.list.accounts.map((account) => toAccount(account)),
	};
}

export async function createList({
	input,
	signal,
}: {
	input: CreateListMutationVariables['input'];
	signal?: AbortSignal;
}): Promise<LesserList> {
	const token = requireAccessToken();

	const variables: CreateListMutationVariables = { input };

	const data = await graphqlRequest<CreateListMutation, CreateListMutationVariables>({
		document: CreateListDocument,
		variables,
		token,
		signal,
	});

	return toLesserListSummary(data.createList);
}

export async function updateList({
	id,
	input,
	signal,
}: {
	id: string;
	input: UpdateListMutationVariables['input'];
	signal?: AbortSignal;
}): Promise<LesserList> {
	const token = requireAccessToken();

	const variables: UpdateListMutationVariables = { id, input };

	const data = await graphqlRequest<UpdateListMutation, UpdateListMutationVariables>({
		document: UpdateListDocument,
		variables,
		token,
		signal,
	});

	return toLesserListSummary(data.updateList);
}

export async function deleteList({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const variables: DeleteListMutationVariables = { id };

	const data = await graphqlRequest<DeleteListMutation, DeleteListMutationVariables>({
		document: DeleteListDocument,
		variables,
		token,
		signal,
	});

	return data.deleteList;
}

export async function addAccountsToList({
	id,
	accountIds,
	signal,
}: {
	id: string;
	accountIds: string[];
	signal?: AbortSignal;
}): Promise<{ accountCount: number; accounts: Account[] }> {
	const token = requireAccessToken();

	const variables: AddAccountsToListMutationVariables = { id, accountIds };

	const data = await graphqlRequest<AddAccountsToListMutation, AddAccountsToListMutationVariables>({
		document: AddAccountsToListDocument,
		variables,
		token,
		signal,
	});

	return {
		accountCount: data.addAccountsToList.accountCount,
		accounts: data.addAccountsToList.accounts.map((account) => toAccount(account)),
	};
}

export async function removeAccountsFromList({
	id,
	accountIds,
	signal,
}: {
	id: string;
	accountIds: string[];
	signal?: AbortSignal;
}): Promise<{ accountCount: number; accounts: Account[] }> {
	const token = requireAccessToken();

	const variables: RemoveAccountsFromListMutationVariables = { id, accountIds };

	const data = await graphqlRequest<
		RemoveAccountsFromListMutation,
		RemoveAccountsFromListMutationVariables
	>({
		document: RemoveAccountsFromListDocument,
		variables,
		token,
		signal,
	});

	return {
		accountCount: data.removeAccountsFromList.accountCount,
		accounts: data.removeAccountsFromList.accounts.map((account) => toAccount(account)),
	};
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

export async function fetchInstanceVapidKey({
	signal,
}: {
	signal?: AbortSignal;
} = {}): Promise<string> {
	const data = await restRequest<{ vapid_key?: string | null }>({
		path: '/api/v1/instance',
		signal,
	});

	const key = typeof data.vapid_key === 'string' ? data.vapid_key.trim() : '';
	if (!key) {
		throw new Error('Instance did not provide a VAPID public key.');
	}

	return key;
}

export const api = {
	graphqlRequest,
	restRequest,
	fetchViewer,
	fetchHomeTimeline,
	fetchLocalTimeline,
	fetchPublicTimeline,
	fetchHashtagTimeline,
	fetchListTimeline,
	search,
	searchAccounts,
	fetchTrends,
	fetchHashtag,
	fetchFollowedHashtags,
	followHashtag,
	unfollowHashtag,
	muteHashtag,
	updateHashtagNotifications,
	unmuteHashtag,
	fetchLists,
	fetchList,
	createList,
	updateList,
	deleteList,
	addAccountsToList,
	removeAccountsFromList,
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
	fetchInstanceVapidKey,
} as const;
