import { print } from 'graphql';

import {
	AdminAgentPolicyDocument,
	AdminSuspendAgentDocument,
	AdminUnverifyAgentDocument,
	AdminVerifyAgentDocument,
	AgentActivityDocument,
	AgentByUsernameDocument,
	AgentsDocument,
	DeleteAgentDocument,
	DelegateToAgentDocument,
	MyAgentsDocument,
	RevokeAgentTokenDocument,
	UpdateAdminAgentPolicyDocument,
	UpdateAgentDocument,
	ActorByUsernameDocument,
	AddCommunityNoteDocument,
	AddAccountsToListDocument,
	BlockActorDocument,
	ClearNotificationsDocument,
	CreateListDocument,
	DeleteListDocument,
	FlagObjectDocument,
	FollowedHashtagsDocument,
	FollowHashtagDocument,
	DismissNotificationDocument,
	ListDocument,
	ListsDocument,
	MuteActorDocument,
	MuteHashtagDocument,
	ObjectWithQuotesDocument,
	UpdateProfileDocument,
	UpdateQuotePermissionsDocument,
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
	TrustGraphDocument,
	UnfollowHashtagDocument,
	UpdateListDocument,
	UpdateUserPreferencesDocument,
	UserPreferencesDocument,
	VoteCommunityNoteDocument,
	type ActorByUsernameQuery,
	type ActorByUsernameQueryVariables,
	type AdminAgentPolicyQuery,
	type AdminAgentPolicyQueryVariables,
	type AdminSuspendAgentMutation,
	type AdminSuspendAgentMutationVariables,
	type AdminUnverifyAgentMutation,
	type AdminUnverifyAgentMutationVariables,
	type AdminVerifyAgentMutation,
	type AdminVerifyAgentMutationVariables,
	type AddCommunityNoteMutation,
	type AddCommunityNoteMutationVariables,
	type AddAccountsToListMutation,
	type AddAccountsToListMutationVariables,
	type AgentActivityQuery,
	type AgentActivityQueryVariables,
	type AgentByUsernameQuery,
	type AgentByUsernameQueryVariables,
	type AgentsQuery,
	type AgentsQueryVariables,
	type BlockActorMutation,
	type BlockActorMutationVariables,
	type BookmarkObjectMutation,
	type BookmarkObjectMutationVariables,
	type ClearNotificationsMutation,
	type ClearNotificationsMutationVariables,
	type CreateListMutation,
	type CreateListMutationVariables,
	type CreateNoteMutationVariables,
	type DeleteAgentMutation,
	type DeleteAgentMutationVariables,
	type DeleteListMutation,
	type DeleteListMutationVariables,
	type DeleteObjectMutation,
	type DeleteObjectMutationVariables,
	type DelegateToAgentMutation,
	type DelegateToAgentMutationVariables,
	type DismissNotificationMutation,
	type DismissNotificationMutationVariables,
	type FlagObjectMutation,
	type FlagObjectMutationVariables,
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
	type MyAgentsQuery,
	type MyAgentsQueryVariables,
	type MuteActorMutation,
	type MuteActorMutationVariables,
	type MuteHashtagMutation,
	type MuteHashtagMutationVariables,
	type NotificationsQuery,
	type NotificationsQueryVariables,
	type ObjectWithQuotesQuery,
	type ObjectWithQuotesQueryVariables,
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
	type TrustCategory,
	type TrustGraphQuery,
	type TrustGraphQueryVariables,
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
	type UpdateQuotePermissionsMutation,
	type UpdateQuotePermissionsMutationVariables,
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
	type VoteCommunityNoteMutation,
	type VoteCommunityNoteMutationVariables,
	type Poll as GraphQLPoll,
	type RevokeAgentTokenMutation,
	type RevokeAgentTokenMutationVariables,
	type UpdateAdminAgentPolicyMutation,
	type UpdateAdminAgentPolicyMutationVariables,
	type UpdateAgentMutation,
	type UpdateAgentMutationVariables,
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
		isAgent: boolean;
		agentInfo?: {
			id: string;
			agentType: string;
			verified: boolean;
			verifiedAt?: string | null;
		} | null;
		tipAddress?: string | null;
		tipChainId?: number | null;
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
		isAgent
		agentInfo {
			id
			agentType
			verified
			verifiedAt
		}
		tipAddress
		tipChainId
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
	$excludeAgents: Boolean = false
) {
	timeline(type: $type, first: $first, after: $after, hashtag: $hashtag, listId: $listId, actorId: $actorId, mediaOnly: $mediaOnly, excludeAgents: $excludeAgents) {
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
	excludeAgents,
	signal,
}: {
	type: TimelineType;
	first?: number;
	after?: string;
	actorId?: string;
	hashtag?: string;
	listId?: string;
	mediaOnly?: boolean;
	excludeAgents?: boolean;
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
		excludeAgents,
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
	excludeAgents,
	signal,
}: {
	first?: number;
	after?: string;
	excludeAgents?: boolean;
	signal?: AbortSignal;
} = {}): Promise<{
	items: Status[];
	pageInfo: { endCursor: string | null; hasNextPage: boolean };
}> {
	return fetchTimeline({ type: 'HOME', first, after, excludeAgents, signal });
}

export async function fetchLocalTimeline({
	first = 20,
	after,
	excludeAgents,
	signal,
}: {
	first?: number;
	after?: string;
	excludeAgents?: boolean;
	signal?: AbortSignal;
} = {}): Promise<{
	items: Status[];
	pageInfo: { endCursor: string | null; hasNextPage: boolean };
}> {
	return fetchTimeline({ type: 'LOCAL', first, after, excludeAgents, signal });
}

export async function fetchPublicTimeline({
	first = 20,
	after,
	excludeAgents,
	signal,
}: {
	first?: number;
	after?: string;
	excludeAgents?: boolean;
	signal?: AbortSignal;
} = {}): Promise<{
	items: Status[];
	pageInfo: { endCursor: string | null; hasNextPage: boolean };
}> {
	return fetchTimeline({ type: 'PUBLIC', first, after, excludeAgents, signal });
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

// ============================================================================
// Trust + moderation (user-facing)
// ============================================================================

export async function blockActor({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<BlockActorMutation['blockActor']> {
	const token = requireAccessToken();

	const variables: BlockActorMutationVariables = { id };

	const data = await graphqlRequest<BlockActorMutation, BlockActorMutationVariables>({
		document: BlockActorDocument,
		variables,
		token,
		signal,
	});

	return data.blockActor;
}

export async function muteActor({
	id,
	notifications,
	signal,
}: {
	id: string;
	notifications?: boolean;
	signal?: AbortSignal;
}): Promise<MuteActorMutation['muteActor']> {
	const token = requireAccessToken();

	const variables: MuteActorMutationVariables = { id, notifications };

	const data = await graphqlRequest<MuteActorMutation, MuteActorMutationVariables>({
		document: MuteActorDocument,
		variables,
		token,
		signal,
	});

	return data.muteActor;
}

export async function flagObject({
	input,
	signal,
}: {
	input: FlagObjectMutationVariables['input'];
	signal?: AbortSignal;
}): Promise<FlagObjectMutation['flagObject']> {
	const token = requireAccessToken();

	const variables: FlagObjectMutationVariables = { input };

	const data = await graphqlRequest<FlagObjectMutation, FlagObjectMutationVariables>({
		document: FlagObjectDocument,
		variables,
		token,
		signal,
	});

	return data.flagObject;
}

export async function addCommunityNote({
	input,
	signal,
}: {
	input: AddCommunityNoteMutationVariables['input'];
	signal?: AbortSignal;
}): Promise<AddCommunityNoteMutation['addCommunityNote']> {
	const token = requireAccessToken();

	const variables: AddCommunityNoteMutationVariables = { input };

	const data = await graphqlRequest<AddCommunityNoteMutation, AddCommunityNoteMutationVariables>({
		document: AddCommunityNoteDocument,
		variables,
		token,
		signal,
	});

	return data.addCommunityNote;
}

export async function voteCommunityNote({
	id,
	helpful,
	signal,
}: {
	id: string;
	helpful: boolean;
	signal?: AbortSignal;
}): Promise<VoteCommunityNoteMutation['voteCommunityNote']> {
	const token = requireAccessToken();

	const variables: VoteCommunityNoteMutationVariables = { id, helpful };

	const data = await graphqlRequest<VoteCommunityNoteMutation, VoteCommunityNoteMutationVariables>({
		document: VoteCommunityNoteDocument,
		variables,
		token,
		signal,
	});

	return data.voteCommunityNote;
}

export type StatusTranslation = {
	content: string;
	detectedLanguage: string;
	provider: string;
	spoilerText?: string | null;
};

const TRANSLATE_STATUS_QUERY = `
query TranslateStatus($id: ID!, $targetLanguage: String) {
	translateStatus(id: $id, targetLanguage: $targetLanguage) {
		content
		detectedLanguage
		provider
		spoilerText
	}
}
`;

export async function translateStatus({
	id,
	targetLanguage,
	signal,
}: {
	id: string;
	targetLanguage?: string;
	signal?: AbortSignal;
}): Promise<StatusTranslation> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ translateStatus: StatusTranslation }, { id: string; targetLanguage?: string }>({
		document: TRANSLATE_STATUS_QUERY,
		variables: { id, targetLanguage },
		token,
		signal,
	});

	return data.translateStatus;
}

export async function fetchTrustGraph({
	actorId,
	category,
	signal,
}: {
	actorId: string;
	category?: TrustCategory;
	signal?: AbortSignal;
}): Promise<Array<{ category: TrustCategory; score: number; updatedAt: string; from: Account; to: Account }>> {
	const token = requireAccessToken();

	const variables: TrustGraphQueryVariables = { actorId, category };

	const data = await graphqlRequest<TrustGraphQuery, TrustGraphQueryVariables>({
		document: TrustGraphDocument,
		variables,
		token,
		signal,
	});

	return data.trustGraph.map((edge) => ({
		category: edge.category,
		score: edge.score,
		updatedAt: edge.updatedAt,
		from: toAccount(edge.from),
		to: toAccount(edge.to),
	}));
}

export async function fetchObjectWithQuotes({
	id,
	first = 20,
	after,
	signal,
}: {
	id: string;
	first?: number;
	after?: string;
	signal?: AbortSignal;
}): Promise<{
	object: Status;
	quotes: Status[];
	pageInfo: { endCursor: string | null; hasNextPage: boolean };
	totalCount: number;
} | null> {
	const token = requireAccessToken();

	const variables: ObjectWithQuotesQueryVariables = { id, first, after };

	const data = await graphqlRequest<ObjectWithQuotesQuery, ObjectWithQuotesQueryVariables>({
		document: ObjectWithQuotesDocument,
		variables,
		token,
		signal,
	});

	if (!data.object) return null;

	return {
		object: toStatus(data.object),
		quotes: data.object.quotes.edges.map((edge) => toStatus(edge.node)),
		pageInfo: {
			endCursor: data.object.quotes.pageInfo.endCursor ?? null,
			hasNextPage: data.object.quotes.pageInfo.hasNextPage,
		},
		totalCount: data.object.quotes.totalCount,
	};
}

export async function updateQuotePermissions({
	noteId,
	quoteable,
	permission,
	signal,
}: {
	noteId: string;
	quoteable: boolean;
	permission: 'EVERYONE' | 'FOLLOWERS' | 'NONE';
	signal?: AbortSignal;
}): Promise<{ note: Status; success: boolean; affectedQuotes: number }> {
	const token = requireAccessToken();

	const variables: UpdateQuotePermissionsMutationVariables = { noteId, quoteable, permission };

	const data = await graphqlRequest<UpdateQuotePermissionsMutation, UpdateQuotePermissionsMutationVariables>({
		document: UpdateQuotePermissionsDocument,
		variables,
		token,
		signal,
	});

	return {
		note: toStatus(data.updateQuotePermissions.note),
		success: data.updateQuotePermissions.success,
		affectedQuotes: data.updateQuotePermissions.affectedQuotes,
	};
}

const ACTOR_PROFILE_QUERY = `
query ActorProfile($id: ID, $username: String) {
	actor(id: $id, username: $username) {
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
		reputation {
			actorId
			instance
			totalScore
			trustScore
			activityScore
			moderationScore
			communityScore
			calculatedAt
			version
			signature
			evidence {
				totalPosts
				totalFollowers
				accountAge
				vouchCount
				trustingActors
				averageTrustScore
			}
		}
		vouches {
			id
			confidence
			context
			voucherReputation
			createdAt
			expiresAt
			active
			revoked
			revokedAt
			from {
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
			}
			to {
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
			}
		}
	}
}
`;

export async function fetchActorProfile({
	id,
	username,
	signal,
}: {
	id?: string;
	username?: string;
	signal?: AbortSignal;
}): Promise<Account> {
	if (!id && !username) {
		throw new Error('fetchActorProfile requires an id or username');
	}

	const token = requireAccessToken();

	const data = await graphqlRequest<
		{ actor?: Parameters<typeof toAccount>[0] | null },
		{ id?: string; username?: string }
	>({
		document: ACTOR_PROFILE_QUERY,
		variables: { id, username },
		token,
		signal,
	});

	if (!data.actor) {
		throw new Error('Account not found');
	}

	return toAccount(data.actor);
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

const ADMIN_ACTOR_FIELDS = `
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
`;

type AdminActorFields = Omit<ViewerQueryData['viewer'], 'fields'>;

export type AdminReportStatus = 'OPEN' | 'RESOLVED' | 'REJECTED';
export type AdminReportAction = 'ASSIGN_TO_SELF' | 'UNASSIGN' | 'RESOLVE' | 'REOPEN';

export type AdminReportListItem = {
	id: string;
	category: string;
	comment?: string | null;
	createdAt: string;
	updatedAt: string;
	forwarded: boolean;
	actionTaken: boolean;
	actionTakenAt?: string | null;
	reporter: Account;
	target: Account;
	assignedAccount?: Account | null;
	statuses: Array<{ id: string }>;
};

export type AdminReportDetail = Omit<AdminReportListItem, 'statuses'> & {
	actionTakenBy?: Account | null;
	statuses: Status[];
};

const ADMIN_REPORTS_QUERY = `
query AdminReports($status: AdminReportStatus!, $first: Int = 50, $after: Cursor) {
	adminReports(status: $status, first: $first, after: $after) {
		reports {
			id
			category
			comment
			createdAt
			updatedAt
			forwarded
			actionTaken
			actionTakenAt
			reporter {
				${ADMIN_ACTOR_FIELDS}
			}
			target {
				${ADMIN_ACTOR_FIELDS}
			}
			assignedAccount {
				${ADMIN_ACTOR_FIELDS}
			}
			statuses {
				id
			}
		}
		nextCursor
	}
}
`;

export async function fetchAdminReports({
	status = 'OPEN',
	first = 50,
	after,
	signal,
}: {
	status?: AdminReportStatus;
	first?: number;
	after?: string;
	signal?: AbortSignal;
} = {}): Promise<{ reports: AdminReportListItem[]; nextCursor: string | null }> {
	const token = requireAccessToken();

	const data = await graphqlRequest<
		{
			adminReports: {
				reports: Array<{
					id: string;
					category: string;
					comment?: string | null;
					createdAt: string;
					updatedAt: string;
					forwarded: boolean;
					actionTaken: boolean;
					actionTakenAt?: string | null;
					reporter: AdminActorFields;
					target: AdminActorFields;
					assignedAccount?: AdminActorFields | null;
					statuses: Array<{ id: string }>;
				}>;
				nextCursor?: string | null;
			};
		},
		{ status: AdminReportStatus; first: number; after?: string }
	>({
		document: ADMIN_REPORTS_QUERY,
		variables: { status, first, after },
		token,
		signal,
	});

	return {
		reports: data.adminReports.reports.map((report) => ({
			id: report.id,
			category: report.category,
			comment: report.comment ?? null,
			createdAt: report.createdAt,
			updatedAt: report.updatedAt,
			forwarded: report.forwarded,
			actionTaken: report.actionTaken,
			actionTakenAt: report.actionTakenAt ?? null,
			reporter: toAccount(report.reporter),
			target: toAccount(report.target),
			assignedAccount: report.assignedAccount ? toAccount(report.assignedAccount) : null,
			statuses: report.statuses,
		})),
		nextCursor: data.adminReports.nextCursor ?? null,
	};
}

const ADMIN_REPORT_QUERY = `
query AdminReport($id: ID!) {
	adminReport(id: $id) {
		id
		category
		comment
		createdAt
		updatedAt
		forwarded
		actionTaken
		actionTakenAt
		reporter {
			${ADMIN_ACTOR_FIELDS}
		}
		target {
			${ADMIN_ACTOR_FIELDS}
		}
		assignedAccount {
			${ADMIN_ACTOR_FIELDS}
		}
		actionTakenBy {
			${ADMIN_ACTOR_FIELDS}
		}
		statuses {
			...ObjectFields
			${POLL_FIELDS}
		}
	}
}
${OBJECT_FIELDS_FRAGMENT}
`;

export async function fetchAdminReport({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<AdminReportDetail> {
	const token = requireAccessToken();

	const data = await graphqlRequest<
		{
			adminReport?: {
				id: string;
				category: string;
				comment?: string | null;
				createdAt: string;
				updatedAt: string;
				forwarded: boolean;
				actionTaken: boolean;
				actionTakenAt?: string | null;
				reporter: AdminActorFields;
				target: AdminActorFields;
				assignedAccount?: AdminActorFields | null;
				actionTakenBy?: AdminActorFields | null;
				statuses: Array<ObjectWithViewerStateAndPoll>;
			} | null;
		},
		{ id: string }
	>({
		document: ADMIN_REPORT_QUERY,
		variables: { id },
		token,
		signal,
	});

	if (!data.adminReport) {
		throw new Error('Report not found');
	}

	return {
		id: data.adminReport.id,
		category: data.adminReport.category,
		comment: data.adminReport.comment ?? null,
		createdAt: data.adminReport.createdAt,
		updatedAt: data.adminReport.updatedAt,
		forwarded: data.adminReport.forwarded,
		actionTaken: data.adminReport.actionTaken,
		actionTakenAt: data.adminReport.actionTakenAt ?? null,
		reporter: toAccount(data.adminReport.reporter),
		target: toAccount(data.adminReport.target),
		assignedAccount: data.adminReport.assignedAccount ? toAccount(data.adminReport.assignedAccount) : null,
		actionTakenBy: data.adminReport.actionTakenBy ? toAccount(data.adminReport.actionTakenBy) : null,
		statuses: data.adminReport.statuses.map((status) => toStatus(status)),
	};
}

const ADMIN_REPORT_ACTION_MUTATION = `
mutation AdminReportAction($id: ID!, $action: AdminReportAction!) {
	adminReportAction(id: $id, action: $action) {
		id
		updatedAt
	}
}
`;

export async function adminReportAction({
	id,
	action,
	signal,
}: {
	id: string;
	action: AdminReportAction;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ adminReportAction: { id: string } }, { id: string; action: AdminReportAction }>(
		{
			document: ADMIN_REPORT_ACTION_MUTATION,
			variables: { id, action },
			token,
			signal,
		}
	);

	return Boolean(data.adminReportAction?.id);
}

export type AdminAccountRole = {
	id: string;
	name: string;
	permissions: number;
};

export type AdminAccount = {
	id: string;
	username: string;
	createdAt: string;
	locale: string;
	role: AdminAccountRole;
	confirmed: boolean;
	approved: boolean;
	disabled: boolean;
	silenced: boolean;
	suspended: boolean;
	reportsCount: number;
	resolvedReportsCount: number;
	actor?: Account | null;
};

const ADMIN_ACCOUNTS_QUERY = `
query AdminAccounts($first: Int = 50, $after: Cursor) {
	adminAccounts(first: $first, after: $after) {
		accounts {
			id
			username
			createdAt
			locale
			confirmed
			approved
			disabled
			silenced
			suspended
			reportsCount
			resolvedReportsCount
			role {
				id
				name
				permissions
			}
			actor {
				${ADMIN_ACTOR_FIELDS}
			}
		}
		nextCursor
	}
}
`;

export async function fetchAdminAccounts({
	first = 50,
	after,
	signal,
}: {
	first?: number;
	after?: string;
	signal?: AbortSignal;
} = {}): Promise<{ accounts: AdminAccount[]; nextCursor: string | null }> {
	const token = requireAccessToken();

	const data = await graphqlRequest<
		{
			adminAccounts: {
				accounts: Array<{
					id: string;
					username: string;
					createdAt: string;
					locale: string;
					confirmed: boolean;
					approved: boolean;
					disabled: boolean;
					silenced: boolean;
					suspended: boolean;
					reportsCount: number;
					resolvedReportsCount: number;
					role: AdminAccountRole;
					actor?: AdminActorFields | null;
				}>;
				nextCursor?: string | null;
			};
		},
		{ first: number; after?: string }
	>({
		document: ADMIN_ACCOUNTS_QUERY,
		variables: { first, after },
		token,
		allowPartialData: true,
		signal,
	});

	return {
		accounts: data.adminAccounts.accounts.map((account) => ({
			id: account.id,
			username: account.username,
			createdAt: account.createdAt,
			locale: account.locale,
			role: account.role,
			confirmed: account.confirmed,
			approved: account.approved,
			disabled: account.disabled,
			silenced: account.silenced,
			suspended: account.suspended,
			reportsCount: account.reportsCount,
			resolvedReportsCount: account.resolvedReportsCount,
			actor: account.actor ? toAccount(account.actor) : null,
		})),
		nextCursor: data.adminAccounts.nextCursor ?? null,
	};
}

const ADMIN_ACCOUNT_QUERY = `
query AdminAccount($id: ID!) {
	adminAccount(id: $id) {
		id
		username
		createdAt
		locale
		confirmed
		approved
		disabled
		silenced
		suspended
		reportsCount
		resolvedReportsCount
		role {
			id
			name
			permissions
		}
		actor {
			${ADMIN_ACTOR_FIELDS}
		}
	}
}
`;

export async function fetchAdminAccount({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<AdminAccount | null> {
	const token = requireAccessToken();

	const data = await graphqlRequest<
		{
			adminAccount?: {
				id: string;
				username: string;
				createdAt: string;
				locale: string;
				confirmed: boolean;
				approved: boolean;
				disabled: boolean;
				silenced: boolean;
				suspended: boolean;
				reportsCount: number;
				resolvedReportsCount: number;
				role: AdminAccountRole;
				actor?: AdminActorFields | null;
			} | null;
		},
		{ id: string }
	>({
		document: ADMIN_ACCOUNT_QUERY,
		variables: { id },
		token,
		signal,
	});

	if (!data.adminAccount) return null;

	return {
		id: data.adminAccount.id,
		username: data.adminAccount.username,
		createdAt: data.adminAccount.createdAt,
		locale: data.adminAccount.locale,
		role: data.adminAccount.role,
		confirmed: data.adminAccount.confirmed,
		approved: data.adminAccount.approved,
		disabled: data.adminAccount.disabled,
		silenced: data.adminAccount.silenced,
		suspended: data.adminAccount.suspended,
		reportsCount: data.adminAccount.reportsCount,
		resolvedReportsCount: data.adminAccount.resolvedReportsCount,
		actor: data.adminAccount.actor ? toAccount(data.adminAccount.actor) : null,
	};
}

const ADMIN_ACCOUNT_ACTION_MUTATION = `
mutation AdminAccountAction($input: AdminAccountActionInput!) {
	adminAccountAction(input: $input)
}
`;

export async function adminAccountAction({
	id,
	type,
	text,
	signal,
}: {
	id: string;
	type: string;
	text?: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ adminAccountAction: boolean }, { input: { id: string; type: string; text?: string } }>(
		{
			document: ADMIN_ACCOUNT_ACTION_MUTATION,
			variables: { input: { id, type, ...(text ? { text } : {}) } },
			token,
			signal,
		}
	);

	return data.adminAccountAction;
}

export type AdminStatusFilter = {
	local?: boolean;
	remote?: boolean;
	byDomain?: string;
	visibility?: string;
	flagged?: boolean;
	reported?: boolean;
	media?: boolean;
	sensitive?: boolean;
	minDate?: string;
	maxDate?: string;
};

const ADMIN_STATUSES_QUERY = `
query AdminStatuses($filter: AdminStatusFilter, $first: Int = 20, $after: Cursor) {
	adminStatuses(filter: $filter, first: $first, after: $after) {
		statuses {
			...ObjectFields
			${POLL_FIELDS}
		}
		nextCursor
	}
}
${OBJECT_FIELDS_FRAGMENT}
`;

export async function fetchAdminStatuses({
	filter,
	first = 20,
	after,
	signal,
}: {
	filter?: AdminStatusFilter;
	first?: number;
	after?: string;
	signal?: AbortSignal;
} = {}): Promise<{ statuses: Status[]; nextCursor: string | null }> {
	const token = requireAccessToken();

	const data = await graphqlRequest<
		{ adminStatuses: { statuses: ObjectWithViewerStateAndPoll[]; nextCursor?: string | null } },
		{ filter?: AdminStatusFilter; first: number; after?: string }
	>({
		document: ADMIN_STATUSES_QUERY,
		variables: { filter, first, after },
		token,
		signal,
	});

	return {
		statuses: data.adminStatuses.statuses.map((status) => toStatus(status)),
		nextCursor: data.adminStatuses.nextCursor ?? null,
	};
}

const ADMIN_DELETE_STATUS_MUTATION = `
mutation AdminDeleteStatus($id: ID!) {
	adminDeleteStatus(id: $id)
}
`;

export async function adminDeleteStatus({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ adminDeleteStatus: boolean }, { id: string }>({
		document: ADMIN_DELETE_STATUS_MUTATION,
		variables: { id },
		token,
		signal,
	});

	return data.adminDeleteStatus;
}

const ADMIN_SET_STATUS_SENSITIVE_MUTATION = `
mutation AdminSetStatusSensitive($id: ID!, $sensitive: Boolean!) {
	adminSetStatusSensitive(id: $id, sensitive: $sensitive) {
		...ObjectFields
		${POLL_FIELDS}
	}
}
${OBJECT_FIELDS_FRAGMENT}
`;

export async function adminSetStatusSensitive({
	id,
	sensitive,
	signal,
}: {
	id: string;
	sensitive: boolean;
	signal?: AbortSignal;
}): Promise<Status> {
	const token = requireAccessToken();

	const data = await graphqlRequest<
		{ adminSetStatusSensitive: ObjectWithViewerStateAndPoll },
		{ id: string; sensitive: boolean }
	>({
		document: ADMIN_SET_STATUS_SENSITIVE_MUTATION,
		variables: { id, sensitive },
		token,
		signal,
	});

	return toStatus(data.adminSetStatusSensitive);
}

export type AdminDomainAllow = {
	id: string;
	domain: string;
	createdAt: string;
};

export type AdminDomainBlock = {
	id: string;
	domain: string;
	severity: string;
	rejectMedia: boolean;
	rejectReports: boolean;
	privateComment?: string | null;
	publicComment?: string | null;
	obfuscate: boolean;
	createdAt: string;
	updatedAt: string;
};

export type AdminEmailDomainBlock = {
	id: string;
	domain: string;
	createdAt: string;
};

const ADMIN_DOMAIN_ALLOWS_QUERY = `
query AdminDomainAllows($first: Int = 100, $after: Cursor) {
	adminDomainAllows(first: $first, after: $after) {
		allows {
			id
			domain
			createdAt
		}
		nextCursor
	}
}
`;

export async function fetchAdminDomainAllows({
	first = 100,
	after,
	signal,
}: {
	first?: number;
	after?: string;
	signal?: AbortSignal;
} = {}): Promise<{ allows: AdminDomainAllow[]; nextCursor: string | null }> {
	const token = requireAccessToken();

	const data = await graphqlRequest<
		{ adminDomainAllows: { allows: AdminDomainAllow[]; nextCursor?: string | null } },
		{ first: number; after?: string }
	>({
		document: ADMIN_DOMAIN_ALLOWS_QUERY,
		variables: { first, after },
		token,
		signal,
	});

	return { allows: data.adminDomainAllows.allows, nextCursor: data.adminDomainAllows.nextCursor ?? null };
}

const ADMIN_CREATE_DOMAIN_ALLOW_MUTATION = `
mutation AdminCreateDomainAllow($domain: String!) {
	adminCreateDomainAllow(domain: $domain) {
		id
		domain
		createdAt
	}
}
`;

export async function adminCreateDomainAllow({
	domain,
	signal,
}: {
	domain: string;
	signal?: AbortSignal;
}): Promise<AdminDomainAllow> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ adminCreateDomainAllow: AdminDomainAllow }, { domain: string }>({
		document: ADMIN_CREATE_DOMAIN_ALLOW_MUTATION,
		variables: { domain },
		token,
		signal,
	});

	return data.adminCreateDomainAllow;
}

const ADMIN_DELETE_DOMAIN_ALLOW_MUTATION = `
mutation AdminDeleteDomainAllow($id: ID!) {
	adminDeleteDomainAllow(id: $id)
}
`;

export async function adminDeleteDomainAllow({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ adminDeleteDomainAllow: boolean }, { id: string }>({
		document: ADMIN_DELETE_DOMAIN_ALLOW_MUTATION,
		variables: { id },
		token,
		signal,
	});

	return data.adminDeleteDomainAllow;
}

const ADMIN_DOMAIN_BLOCKS_QUERY = `
query AdminDomainBlocks($first: Int = 100, $after: Cursor) {
	adminDomainBlocks(first: $first, after: $after) {
		blocks {
			id
			domain
			severity
			rejectMedia
			rejectReports
			privateComment
			publicComment
			obfuscate
			createdAt
			updatedAt
		}
		nextCursor
	}
}
`;

export async function fetchAdminDomainBlocks({
	first = 100,
	after,
	signal,
}: {
	first?: number;
	after?: string;
	signal?: AbortSignal;
} = {}): Promise<{ blocks: AdminDomainBlock[]; nextCursor: string | null }> {
	const token = requireAccessToken();

	const data = await graphqlRequest<
		{ adminDomainBlocks: { blocks: AdminDomainBlock[]; nextCursor?: string | null } },
		{ first: number; after?: string }
	>({
		document: ADMIN_DOMAIN_BLOCKS_QUERY,
		variables: { first, after },
		token,
		signal,
	});

	return { blocks: data.adminDomainBlocks.blocks, nextCursor: data.adminDomainBlocks.nextCursor ?? null };
}

const ADMIN_CREATE_DOMAIN_BLOCK_MUTATION = `
mutation AdminCreateDomainBlock($input: AdminDomainBlockCreateInput!) {
	adminCreateDomainBlock(input: $input) {
		id
		domain
		severity
		rejectMedia
		rejectReports
		privateComment
		publicComment
		obfuscate
		createdAt
		updatedAt
	}
}
`;

export async function adminCreateDomainBlock({
	input,
	signal,
}: {
	input: {
		domain: string;
		severity?: string;
		rejectMedia?: boolean;
		rejectReports?: boolean;
		privateComment?: string;
		publicComment?: string;
		obfuscate?: boolean;
	};
	signal?: AbortSignal;
}): Promise<AdminDomainBlock> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ adminCreateDomainBlock: AdminDomainBlock }, { input: typeof input }>({
		document: ADMIN_CREATE_DOMAIN_BLOCK_MUTATION,
		variables: { input },
		token,
		signal,
	});

	return data.adminCreateDomainBlock;
}

const ADMIN_UPDATE_DOMAIN_BLOCK_MUTATION = `
mutation AdminUpdateDomainBlock($id: ID!, $input: AdminDomainBlockUpdateInput!) {
	adminUpdateDomainBlock(id: $id, input: $input) {
		id
		domain
		severity
		rejectMedia
		rejectReports
		privateComment
		publicComment
		obfuscate
		createdAt
		updatedAt
	}
}
`;

export async function adminUpdateDomainBlock({
	id,
	input,
	signal,
}: {
	id: string;
	input: {
		severity?: string;
		rejectMedia?: boolean;
		rejectReports?: boolean;
		privateComment?: string;
		publicComment?: string;
		obfuscate?: boolean;
	};
	signal?: AbortSignal;
}): Promise<AdminDomainBlock> {
	const token = requireAccessToken();

	const data = await graphqlRequest<
		{ adminUpdateDomainBlock: AdminDomainBlock },
		{ id: string; input: typeof input }
	>({
		document: ADMIN_UPDATE_DOMAIN_BLOCK_MUTATION,
		variables: { id, input },
		token,
		signal,
	});

	return data.adminUpdateDomainBlock;
}

const ADMIN_DELETE_DOMAIN_BLOCK_MUTATION = `
mutation AdminDeleteDomainBlock($id: ID!) {
	adminDeleteDomainBlock(id: $id)
}
`;

export async function adminDeleteDomainBlock({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ adminDeleteDomainBlock: boolean }, { id: string }>({
		document: ADMIN_DELETE_DOMAIN_BLOCK_MUTATION,
		variables: { id },
		token,
		signal,
	});

	return data.adminDeleteDomainBlock;
}

const ADMIN_EMAIL_DOMAIN_BLOCKS_QUERY = `
query AdminEmailDomainBlocks($first: Int = 100, $after: Cursor) {
	adminEmailDomainBlocks(first: $first, after: $after) {
		blocks {
			id
			domain
			createdAt
		}
		nextCursor
	}
}
`;

export async function fetchAdminEmailDomainBlocks({
	first = 100,
	after,
	signal,
}: {
	first?: number;
	after?: string;
	signal?: AbortSignal;
} = {}): Promise<{ blocks: AdminEmailDomainBlock[]; nextCursor: string | null }> {
	const token = requireAccessToken();

	const data = await graphqlRequest<
		{ adminEmailDomainBlocks: { blocks: AdminEmailDomainBlock[]; nextCursor?: string | null } },
		{ first: number; after?: string }
	>({
		document: ADMIN_EMAIL_DOMAIN_BLOCKS_QUERY,
		variables: { first, after },
		token,
		signal,
	});

	return { blocks: data.adminEmailDomainBlocks.blocks, nextCursor: data.adminEmailDomainBlocks.nextCursor ?? null };
}

const ADMIN_CREATE_EMAIL_DOMAIN_BLOCK_MUTATION = `
mutation AdminCreateEmailDomainBlock($domain: String!) {
	adminCreateEmailDomainBlock(domain: $domain) {
		id
		domain
		createdAt
	}
}
`;

export async function adminCreateEmailDomainBlock({
	domain,
	signal,
}: {
	domain: string;
	signal?: AbortSignal;
}): Promise<AdminEmailDomainBlock> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ adminCreateEmailDomainBlock: AdminEmailDomainBlock }, { domain: string }>({
		document: ADMIN_CREATE_EMAIL_DOMAIN_BLOCK_MUTATION,
		variables: { domain },
		token,
		signal,
	});

	return data.adminCreateEmailDomainBlock;
}

const ADMIN_DELETE_EMAIL_DOMAIN_BLOCK_MUTATION = `
mutation AdminDeleteEmailDomainBlock($id: ID!) {
	adminDeleteEmailDomainBlock(id: $id)
}
`;

export async function adminDeleteEmailDomainBlock({
	id,
	signal,
}: {
	id: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ adminDeleteEmailDomainBlock: boolean }, { id: string }>({
		document: ADMIN_DELETE_EMAIL_DOMAIN_BLOCK_MUTATION,
		variables: { id },
		token,
		signal,
	});

	return data.adminDeleteEmailDomainBlock;
}

export type AnnouncementReaction = {
	name: string;
	count: number;
	me: boolean;
	url?: string | null;
	staticUrl?: string | null;
};

export type Announcement = {
	id: string;
	content: string;
	text: string;
	publishedAt: string;
	updatedAt: string;
	allDay: boolean;
	startsAt?: string | null;
	endsAt?: string | null;
	read: boolean;
	reactions: AnnouncementReaction[];
};

const ANNOUNCEMENTS_QUERY = `
query Announcements {
	announcements {
		id
		content
		text
		publishedAt
		updatedAt
		allDay
		startsAt
		endsAt
		read
		reactions {
			name
			count
			me
			url
			staticUrl
		}
	}
}
`;

export async function fetchAnnouncements({
	signal,
}: {
	signal?: AbortSignal;
} = {}): Promise<Announcement[]> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ announcements: Announcement[] }>({
		document: ANNOUNCEMENTS_QUERY,
		token,
		signal,
	});

	return data.announcements;
}

const ADMIN_CREATE_ANNOUNCEMENT_MUTATION = `
mutation AdminCreateAnnouncement($input: AdminCreateAnnouncementInput!) {
	adminCreateAnnouncement(input: $input) {
		id
		content
		text
		publishedAt
		updatedAt
		allDay
		startsAt
		endsAt
		read
		reactions {
			name
			count
			me
			url
			staticUrl
		}
	}
}
`;

export async function adminCreateAnnouncement({
	input,
	signal,
}: {
	input: { text: string; allDay?: boolean; startsAt?: string; endsAt?: string };
	signal?: AbortSignal;
}): Promise<Announcement> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ adminCreateAnnouncement: Announcement }, { input: typeof input }>({
		document: ADMIN_CREATE_ANNOUNCEMENT_MUTATION,
		variables: { input },
		token,
		signal,
	});

	return data.adminCreateAnnouncement;
}

const ADD_ANNOUNCEMENT_REACTION_MUTATION = `
mutation AddAnnouncementReaction($id: ID!, $name: String!) {
	addAnnouncementReaction(id: $id, name: $name)
}
`;

export async function addAnnouncementReaction({
	id,
	name,
	signal,
}: {
	id: string;
	name: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ addAnnouncementReaction: boolean }, { id: string; name: string }>({
		document: ADD_ANNOUNCEMENT_REACTION_MUTATION,
		variables: { id, name },
		token,
		signal,
	});

	return data.addAnnouncementReaction;
}

const REMOVE_ANNOUNCEMENT_REACTION_MUTATION = `
mutation RemoveAnnouncementReaction($id: ID!, $name: String!) {
	removeAnnouncementReaction(id: $id, name: $name)
}
`;

export async function removeAnnouncementReaction({
	id,
	name,
	signal,
}: {
	id: string;
	name: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ removeAnnouncementReaction: boolean }, { id: string; name: string }>({
		document: REMOVE_ANNOUNCEMENT_REACTION_MUTATION,
		variables: { id, name },
		token,
		signal,
	});

	return data.removeAnnouncementReaction;
}

export async function createEmoji({
	input,
	signal,
}: {
	input: { shortcode: string; image: string; category?: string; visibleInPicker?: boolean };
	signal?: AbortSignal;
}): Promise<CustomEmoji> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ createEmoji: CustomEmoji }, { input: typeof input }>({
		document: `
mutation CreateEmoji($input: CreateEmojiInput!) {
	createEmoji(input: $input) {
		id
		shortcode
		url
		staticUrl
		category
		visibleInPicker
		domain
	}
}
`,
		variables: { input },
		token,
		signal,
	});

	return data.createEmoji;
}

export async function updateEmoji({
	shortcode,
	input,
	signal,
}: {
	shortcode: string;
	input: { category?: string; visibleInPicker?: boolean };
	signal?: AbortSignal;
}): Promise<CustomEmoji> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ updateEmoji: CustomEmoji }, { shortcode: string; input: typeof input }>({
		document: `
mutation UpdateEmoji($shortcode: String!, $input: UpdateEmojiInput!) {
	updateEmoji(shortcode: $shortcode, input: $input) {
		id
		shortcode
		url
		staticUrl
		category
		visibleInPicker
		domain
	}
}
`,
		variables: { shortcode, input },
		token,
		signal,
	});

	return data.updateEmoji;
}

export async function deleteEmoji({
	shortcode,
	signal,
}: {
	shortcode: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const data = await graphqlRequest<{ deleteEmoji: boolean }, { shortcode: string }>({
		document: `
mutation DeleteEmoji($shortcode: String!) {
	deleteEmoji(shortcode: $shortcode)
}
`,
		variables: { shortcode },
		token,
		signal,
	});

	return data.deleteEmoji;
}

export type Agent = NonNullable<AgentByUsernameQuery['agent']>;
export type AgentConnection = AgentsQuery['agents'];
export type AgentActivityConnection = AgentActivityQuery['agentActivity'];
export type AgentDelegation = DelegateToAgentMutation['delegateToAgent'];
export type AdminAgentPolicy = AdminAgentPolicyQuery['adminAgentPolicy'];

export async function fetchAgentByUsername({
	username,
	signal,
}: {
	username: string;
	signal?: AbortSignal;
}): Promise<Agent | null> {
	const token = requireAccessToken();

	const data = await graphqlRequest<AgentByUsernameQuery, AgentByUsernameQueryVariables>({
		document: AgentByUsernameDocument,
		variables: { username },
		token,
		signal,
	});

	return data.agent ?? null;
}

export async function fetchAgents({
	first = 20,
	after,
	type,
	query,
	verified,
	ownerUsername,
	signal,
}: AgentsQueryVariables & { signal?: AbortSignal } = {}): Promise<AgentConnection> {
	const token = requireAccessToken();

	const data = await graphqlRequest<AgentsQuery, AgentsQueryVariables>({
		document: AgentsDocument,
		variables: { first, after, type, query, verified, ownerUsername },
		token,
		signal,
	});

	return data.agents;
}

export async function fetchMyAgents({ signal }: { signal?: AbortSignal } = {}): Promise<MyAgentsQuery['myAgents']> {
	const token = requireAccessToken();

	const data = await graphqlRequest<MyAgentsQuery, MyAgentsQueryVariables>({
		document: MyAgentsDocument,
		variables: {},
		token,
		signal,
	});

	return data.myAgents;
}

export async function fetchAgentActivity({
	username,
	first = 20,
	after,
	signal,
}: AgentActivityQueryVariables & { signal?: AbortSignal }): Promise<AgentActivityConnection> {
	const token = requireAccessToken();

	const data = await graphqlRequest<AgentActivityQuery, AgentActivityQueryVariables>({
		document: AgentActivityDocument,
		variables: { username, first, after },
		token,
		signal,
	});

	return data.agentActivity;
}

export async function delegateToAgent({
	input,
	signal,
}: {
	input: DelegateToAgentMutationVariables['input'];
	signal?: AbortSignal;
}): Promise<AgentDelegation> {
	const token = requireAccessToken();

	const data = await graphqlRequest<DelegateToAgentMutation, DelegateToAgentMutationVariables>({
		document: DelegateToAgentDocument,
		variables: { input },
		token,
		signal,
	});

	return data.delegateToAgent;
}

export async function revokeAgentToken({
	username,
	signal,
}: {
	username: string;
	signal?: AbortSignal;
}): Promise<boolean> {
	const token = requireAccessToken();

	const data = await graphqlRequest<RevokeAgentTokenMutation, RevokeAgentTokenMutationVariables>({
		document: RevokeAgentTokenDocument,
		variables: { username },
		token,
		signal,
	});

	return data.revokeAgentToken;
}

export async function updateAgent({
	username,
	input,
	signal,
}: {
	username: string;
	input: UpdateAgentMutationVariables['input'];
	signal?: AbortSignal;
}): Promise<UpdateAgentMutation['updateAgent']> {
	const token = requireAccessToken();

	const data = await graphqlRequest<UpdateAgentMutation, UpdateAgentMutationVariables>({
		document: UpdateAgentDocument,
		variables: { username, input },
		token,
		signal,
	});

	return data.updateAgent;
}

export async function deleteAgent({
	username,
	signal,
}: {
	username: string;
	signal?: AbortSignal;
}): Promise<DeleteAgentMutation['deleteAgent']> {
	const token = requireAccessToken();

	const data = await graphqlRequest<DeleteAgentMutation, DeleteAgentMutationVariables>({
		document: DeleteAgentDocument,
		variables: { username },
		token,
		signal,
	});

	return data.deleteAgent;
}

export async function fetchAdminAgentPolicy({ signal }: { signal?: AbortSignal } = {}): Promise<AdminAgentPolicy> {
	const token = requireAccessToken();

	const data = await graphqlRequest<AdminAgentPolicyQuery, AdminAgentPolicyQueryVariables>({
		document: AdminAgentPolicyDocument,
		variables: {},
		token,
		signal,
	});

	return data.adminAgentPolicy;
}

export async function updateAdminAgentPolicy({
	input,
	signal,
}: {
	input: UpdateAdminAgentPolicyMutationVariables['input'];
	signal?: AbortSignal;
}): Promise<UpdateAdminAgentPolicyMutation['updateAdminAgentPolicy']> {
	const token = requireAccessToken();

	const data = await graphqlRequest<UpdateAdminAgentPolicyMutation, UpdateAdminAgentPolicyMutationVariables>({
		document: UpdateAdminAgentPolicyDocument,
		variables: { input },
		token,
		signal,
	});

	return data.updateAdminAgentPolicy;
}

export async function adminVerifyAgent({
	username,
	input,
	signal,
}: {
	username: string;
	input?: AdminVerifyAgentMutationVariables['input'];
	signal?: AbortSignal;
}): Promise<AdminVerifyAgentMutation['adminVerifyAgent']> {
	const token = requireAccessToken();

	const data = await graphqlRequest<AdminVerifyAgentMutation, AdminVerifyAgentMutationVariables>({
		document: AdminVerifyAgentDocument,
		variables: { username, input },
		token,
		signal,
	});

	return data.adminVerifyAgent;
}

export async function adminUnverifyAgent({
	username,
	input,
	signal,
}: {
	username: string;
	input?: AdminUnverifyAgentMutationVariables['input'];
	signal?: AbortSignal;
}): Promise<AdminUnverifyAgentMutation['adminUnverifyAgent']> {
	const token = requireAccessToken();

	const data = await graphqlRequest<AdminUnverifyAgentMutation, AdminUnverifyAgentMutationVariables>({
		document: AdminUnverifyAgentDocument,
		variables: { username, input },
		token,
		signal,
	});

	return data.adminUnverifyAgent;
}

export async function adminSuspendAgent({
	username,
	signal,
}: {
	username: string;
	signal?: AbortSignal;
}): Promise<AdminSuspendAgentMutation['adminSuspendAgent']> {
	const token = requireAccessToken();

	const data = await graphqlRequest<AdminSuspendAgentMutation, AdminSuspendAgentMutationVariables>({
		document: AdminSuspendAgentDocument,
		variables: { username },
		token,
		signal,
	});

	return data.adminSuspendAgent;
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

export type LinkedWallet = {
	id: string;
	address: string;
	chainId: number;
	walletType: string;
	verified: boolean;
	linkedAt: string;
	lastUsed: string;
	ens?: string;
	name?: string;
};

type WalletListResponse = {
	wallets: Array<{
		id: string;
		address: string;
		chain_id: number;
		wallet_type: string;
		verified: boolean;
		linked_at: string;
		last_used: string;
		ens?: string;
		name?: string;
	} | null>;
	count: number;
};

export async function fetchLinkedWallets({
	signal,
}: {
	signal?: AbortSignal;
} = {}): Promise<LinkedWallet[]> {
	const token = requireAccessToken();

	const data = await restRequest<WalletListResponse>({
		path: '/auth/wallet/list',
		token,
		signal,
	});

	return (data.wallets ?? [])
		.filter((w): w is NonNullable<typeof w> => !!w)
		.map((w) => ({
			id: w.id,
			address: w.address,
			chainId: w.chain_id,
			walletType: w.wallet_type,
			verified: w.verified,
			linkedAt: w.linked_at,
			lastUsed: w.last_used,
			ens: w.ens ?? undefined,
			name: w.name ?? undefined,
		}));
}

type WalletChallenge = {
	id: string;
	address: string;
	chain_id: number;
	username: string;
	message: string;
};

export async function createWalletChallenge({
	address,
	username,
	chainId,
	signal,
}: {
	address: string;
	username: string;
	chainId?: number;
	signal?: AbortSignal;
}): Promise<WalletChallenge> {
	return restRequest<WalletChallenge>({
		path: '/auth/wallet/challenge',
		method: 'POST',
		body: {
			address,
			username,
			...(chainId ? { chainId } : {}),
		},
		signal,
	});
}

type WalletVerifyResponse = {
	verified: boolean;
	message: string;
};

export async function verifyWalletSignature({
	address,
	challengeId,
	message,
	signature,
	signal,
}: {
	address: string;
	challengeId: string;
	message: string;
	signature: string;
	signal?: AbortSignal;
}): Promise<WalletVerifyResponse> {
	return restRequest<WalletVerifyResponse>({
		path: '/auth/wallet/verify',
		method: 'POST',
		body: {
			address,
			challengeId,
			message,
			signature,
		},
		signal,
	});
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
	blockActor,
	muteActor,
	flagObject,
	addCommunityNote,
	voteCommunityNote,
	translateStatus,
	fetchTrustGraph,
	fetchObjectWithQuotes,
	updateQuotePermissions,
	fetchActorProfile,
	fetchAdminModerationReviewers,
	fetchAdminReports,
	fetchAdminReport,
	adminReportAction,
	fetchAdminAccounts,
	fetchAdminAccount,
	adminAccountAction,
	fetchAdminStatuses,
	adminDeleteStatus,
	adminSetStatusSensitive,
	fetchAdminDomainAllows,
	adminCreateDomainAllow,
	adminDeleteDomainAllow,
	fetchAdminDomainBlocks,
	adminCreateDomainBlock,
	adminUpdateDomainBlock,
	adminDeleteDomainBlock,
	fetchAdminEmailDomainBlocks,
	adminCreateEmailDomainBlock,
	adminDeleteEmailDomainBlock,
	fetchAnnouncements,
	adminCreateAnnouncement,
	addAnnouncementReaction,
	removeAnnouncementReaction,
	createEmoji,
	updateEmoji,
	deleteEmoji,
	fetchAgentByUsername,
	fetchAgents,
	fetchMyAgents,
	fetchAgentActivity,
	delegateToAgent,
	revokeAgentToken,
	updateAgent,
	deleteAgent,
	fetchAdminAgentPolicy,
	updateAdminAgentPolicy,
	adminVerifyAgent,
	adminUnverifyAgent,
	adminSuspendAgent,
	fetchInstanceVapidKey,
	fetchLinkedWallets,
	createWalletChallenge,
	verifyWalletSignature,
} as const;
