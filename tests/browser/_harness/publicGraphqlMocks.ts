import type { Page, Route } from '@playwright/test';

type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends (infer U)[]
		? DeepPartial<U>[]
		: T[K] extends object | null | undefined
			? DeepPartial<NonNullable<T[K]>>
			: T[K];
};

type GraphQLMockOperation = 'timeline' | 'actorProfile' | 'threadContext';

type GraphQLMockScenario = {
	timeline?: {
		statuses: MockStatus[];
		hasNextPage?: boolean;
		endCursor?: string | null;
	};
	actorProfile?: {
		actor: MockActor | null;
	};
	actorTimeline?: {
		statuses: MockStatus[];
		hasNextPage?: boolean;
		endCursor?: string | null;
	};
	threadContext?: {
		rootNote: MockStatus | null;
		ancestors?: MockStatus[];
		descendants?: MockStatus[];
	};
};

type MockActor = {
	id: string;
	username: string;
	domain: string | null;
	displayName: string;
	summary: string;
	avatar: string;
	header: string;
	followers: number;
	following: number;
	statusesCount: number;
	bot: boolean;
	locked: boolean;
	createdAt: string;
	updatedAt: string;
	trustScore: number;
	fields: Array<{ name: string; value: string; verifiedAt?: string | null }>;
	reputation?: null;
	vouches?: [];
};

type MockStatus = {
	id: string;
	actor: MockActor;
	content: string;
	contentHash: string;
	createdAt: string;
	updatedAt: string;
	sensitive: boolean;
	spoilerText: string | null;
	visibility: 'PUBLIC' | 'UNLISTED' | 'FOLLOWERS' | 'DIRECT';
	repliesCount: number;
	sharesCount: number;
	likesCount: number;
	attachments: Array<{
		id: string;
		type: string;
		url: string;
		preview: string | null;
		description: string | null;
		blurhash: string | null;
		width: number | null;
		height: number | null;
		duration: number | null;
	}>;
	mentions: Array<{
		id: string;
		username: string;
		domain: string | null;
		url: string;
	}>;
	tags: Array<{ name: string; url: string }>;
	communityNotes: Array<{
		id: string;
		content: string;
		helpful: number;
		notHelpful: number;
		createdAt: string;
		author: MockActor;
	}>;
	inReplyTo: { id: string; actor: MockActor } | null;
	estimatedCost: number;
	moderationScore: number | null;
	quoteable: boolean;
	quoteCount: number;
	quoteUrl: string | null;
	quotePermissions: 'EVERYONE' | 'FOLLOWERS' | 'MENTIONED_ONLY' | 'NO_ONE';
	viewerFavourited: boolean;
	viewerBookmarked: boolean;
	viewerPinned: boolean;
	boostedObject?: null;
	poll?: null;
};

const DEFAULT_ACTOR_HOST = '127.0.0.1:4173';
const DEFAULT_TIMESTAMP = '2026-04-05T12:00:00Z';

function mergeDefined<T>(base: T, patch?: DeepPartial<T>): T {
	if (!patch) return structuredClone(base);

	if (Array.isArray(base)) {
		return (patch as T | undefined) ?? structuredClone(base);
	}

	if (typeof base !== 'object' || base === null) {
		return (patch as T | undefined) ?? base;
	}

	const result: Record<string, unknown> = { ...base } as Record<string, unknown>;
	for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
		if (value === undefined) continue;
		const current = result[key];
		if (
			current &&
			value &&
			typeof current === 'object' &&
			!Array.isArray(current) &&
			typeof value === 'object' &&
			!Array.isArray(value)
		) {
			result[key] = mergeDefined(current, value);
		} else {
			result[key] = value;
		}
	}

	return result as T;
}

export function buildMockActor(overrides?: DeepPartial<MockActor>): MockActor {
	const username = overrides?.username ?? 'harness-profile';
	const domain = overrides?.domain === undefined ? DEFAULT_ACTOR_HOST : overrides.domain;
	const base: MockActor = {
		id: `https://${domain ?? DEFAULT_ACTOR_HOST}/users/${username}`,
		username,
		domain,
		displayName: 'Harness Profile',
		summary: 'Deterministic browser test actor',
		avatar: '',
		header: '',
		followers: 7,
		following: 3,
		statusesCount: 2,
		bot: true,
		locked: false,
		createdAt: DEFAULT_TIMESTAMP,
		updatedAt: DEFAULT_TIMESTAMP,
		trustScore: 0,
		fields: [],
		reputation: null,
		vouches: [],
	};

	return mergeDefined(base, overrides);
}

export function buildMockStatus(overrides?: DeepPartial<MockStatus>): MockStatus {
	const actor = buildMockActor(overrides?.actor);
	const id = overrides?.id ?? 'harness-status';
	const base: MockStatus = {
		id,
		actor,
		content: 'Deterministic browser test status',
		contentHash: `hash-${id}`,
		createdAt: DEFAULT_TIMESTAMP,
		updatedAt: DEFAULT_TIMESTAMP,
		sensitive: false,
		spoilerText: null,
		visibility: 'PUBLIC',
		repliesCount: 0,
		sharesCount: 0,
		likesCount: 0,
		attachments: [],
		mentions: [],
		tags: [],
		communityNotes: [],
		inReplyTo: null,
		estimatedCost: 1,
		moderationScore: null,
		quoteable: true,
		quoteCount: 0,
		quoteUrl: null,
		quotePermissions: 'EVERYONE',
		viewerFavourited: false,
		viewerBookmarked: false,
		viewerPinned: false,
		boostedObject: null,
		poll: null,
	};

	return mergeDefined(base, overrides);
}

function graphQlJson(body: Record<string, unknown>) {
	return {
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify(body),
	};
}

function timelinePayload(statuses: MockStatus[], hasNextPage = false, endCursor?: string | null) {
	return {
		timeline: {
			edges: statuses.map((status) => ({
				cursor: status.id,
				node: status,
			})),
			pageInfo: {
				hasNextPage,
				endCursor: endCursor ?? statuses.at(-1)?.id ?? null,
			},
			totalCount: statuses.length,
		},
	};
}

function actorProfilePayload(actor: MockActor | null) {
	return {
		actor,
	};
}

function threadContextPayload(input: NonNullable<GraphQLMockScenario['threadContext']>) {
	return {
		threadContext: input.rootNote
			? {
					rootNote: input.rootNote,
					ancestors: input.ancestors ?? [],
					descendants: input.descendants ?? [],
					replyCount: (input.ancestors?.length ?? 0) + (input.descendants?.length ?? 0),
					participantCount: 1,
					lastActivity: input.rootNote.updatedAt,
					missingPosts: [],
					syncStatus: 'COMPLETE',
				}
			: null,
	};
}

function matchOperation(query: string): GraphQLMockOperation | null {
	if (query.includes('query TimelineWithViewerState')) return 'timeline';
	if (query.includes('query ActorProfile')) return 'actorProfile';
	if (query.includes('query ThreadContextWithPosts')) return 'threadContext';
	return null;
}

async function fulfillOperation(route: Route, operation: GraphQLMockOperation, scenario: GraphQLMockScenario) {
	switch (operation) {
		case 'timeline': {
			const variables = route.request().postDataJSON()?.variables as
				| { actorId?: string; type?: string }
				| undefined;

			if (variables?.type === 'ACTOR') {
				const actorTimeline = scenario.actorTimeline ?? { statuses: [] };
				await route.fulfill(
					graphQlJson(
						{
							data: timelinePayload(
								actorTimeline.statuses,
								actorTimeline.hasNextPage,
								actorTimeline.endCursor
							),
						}
					)
				);
				return;
			}

			const timeline = scenario.timeline ?? { statuses: [] };
			await route.fulfill(
				graphQlJson({
					data: timelinePayload(timeline.statuses, timeline.hasNextPage, timeline.endCursor),
				})
			);
			return;
		}

		case 'actorProfile': {
			await route.fulfill(
				graphQlJson({
					data: actorProfilePayload(scenario.actorProfile?.actor ?? null),
				})
			);
			return;
		}

		case 'threadContext': {
			await route.fulfill(
				graphQlJson({
					data: threadContextPayload(
						scenario.threadContext ?? {
							rootNote: null,
							ancestors: [],
							descendants: [],
						}
					),
				})
			);
			return;
		}
	}
}

export async function mockPublicGraphQL(page: Page, scenario: GraphQLMockScenario) {
	await page.route('**/api/graphql', async (route) => {
		const postData = route.request().postDataJSON() as { query?: string } | null;
		const query = postData?.query ?? '';
		const operation = matchOperation(query);

		if (!operation) {
			await route.fulfill(
				graphQlJson({
					errors: [{ message: 'Unexpected GraphQL operation in deterministic browser test' }],
				})
			);
			return;
		}

		await fulfillOperation(route, operation, scenario);
	});
}
