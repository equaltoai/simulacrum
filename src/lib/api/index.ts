import { TimelineDocument, type TimelineQuery, type TimelineQueryVariables } from '$lib/greater/adapters/graphql';
import type { Account, Status } from '$lib/types';
import { getAccessToken } from './auth';
import { toAccount, toStatus } from './adapters';
import { graphqlRequest } from './graphql';
import { restRequest } from './rest';

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
	const token = getAccessToken();
	if (!token) {
		throw new Error('Not authenticated');
	}

	const variables: TimelineQueryVariables = {
		type: 'HOME',
		first,
		after,
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

export const api = {
	graphqlRequest,
	restRequest,
	fetchViewer,
	fetchHomeTimeline,
} as const;

