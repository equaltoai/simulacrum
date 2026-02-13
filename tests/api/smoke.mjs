import { assertEqual, assertOk } from './_harness/assert.mjs';
import { SkipTestError } from './_harness/skip.mjs';

function assertGraphqlOk(res, message) {
	assertEqual(res.status, 200, message ?? 'Expected POST /api/graphql to return 200');
	if (Array.isArray(res.body?.errors) && res.body.errors.length) {
		const first = res.body.errors?.[0]?.message;
		throw new Error(`GraphQL returned errors (${res.body.errors.length})${first ? `: ${first}` : ''}`);
	}
}

function shouldSkipAgents(res) {
	if (!Array.isArray(res.body?.errors)) return false;
	return res.body.errors.some((e) => typeof e?.message === 'string' && e.message.toLowerCase().includes('agents are disabled'));
}

export default [
	{
		slug: 'rest.instance',
		name: 'REST: /api/v1/instance returns instance metadata',
		tags: ['smoke', 'rest'],
		async run({ rest, evidence }) {
			const res = await rest('instance', { path: '/api/v1/instance' });
			assertEqual(res.status, 200, 'Expected GET /api/v1/instance to return 200');

			const version =
				typeof res.body?.version === 'string'
					? res.body.version
					: typeof res.body?.configuration?.version === 'string'
						? res.body.configuration.version
						: null;

			if (version) {
				evidence.updateMeta({ lesserVersion: version });
			}
		},
	},
	{
		slug: 'rest.verify_credentials',
		name: 'REST: /api/v1/accounts/verify_credentials returns account',
		tags: ['smoke', 'rest', 'auth'],
		requiresAuth: true,
		async run({ rest }) {
			const res = await rest('verify_credentials', { path: '/api/v1/accounts/verify_credentials' });
			assertEqual(res.status, 200, 'Expected GET /api/v1/accounts/verify_credentials to return 200');
			assertOk(res.body?.id, 'Expected verify_credentials response to include id');
			assertOk(res.body?.username, 'Expected verify_credentials response to include username');
		},
	},
	{
		slug: 'rest.home_timeline',
		name: 'REST: /api/v1/timelines/home returns status list',
		tags: ['smoke', 'rest', 'timeline', 'auth'],
		requiresAuth: true,
		async run({ rest }) {
			const res = await rest('home_timeline', { path: '/api/v1/timelines/home?limit=1' });
			assertEqual(res.status, 200, 'Expected GET /api/v1/timelines/home to return 200');
			assertOk(Array.isArray(res.body), 'Expected home timeline response to be an array');
		},
	},
	{
		slug: 'rest.search_v2',
		name: 'REST: /api/v2/search returns results object',
		tags: ['smoke', 'rest', 'search', 'auth'],
		requiresAuth: true,
		async run({ rest }) {
			const res = await rest('search_v2', { path: '/api/v2/search?q=test&type=accounts&limit=1' });
			assertEqual(res.status, 200, 'Expected GET /api/v2/search to return 200');
			assertOk(res.body && typeof res.body === 'object', 'Expected search response to be an object');

			if (res.body.accounts !== undefined) assertOk(Array.isArray(res.body.accounts), 'Expected search.accounts to be an array');
			if (res.body.statuses !== undefined) assertOk(Array.isArray(res.body.statuses), 'Expected search.statuses to be an array');
			if (res.body.hashtags !== undefined) assertOk(Array.isArray(res.body.hashtags), 'Expected search.hashtags to be an array');
		},
	},
	{
		slug: 'gql.viewer',
		name: 'GraphQL: viewer query returns id + username',
		tags: ['smoke', 'graphql', 'auth'],
		requiresAuth: true,
		async run({ gql }) {
			const res = await gql('viewer', {
				query: `query Viewer { viewer { id username } }`,
				operationName: 'Viewer',
			});

			assertGraphqlOk(res);
			assertOk(res.body?.data?.viewer?.id, 'Expected viewer.id');
			assertOk(res.body?.data?.viewer?.username, 'Expected viewer.username');
		},
	},
	{
		slug: 'gql.timeline_home',
		name: 'GraphQL: timeline(HOME) returns connection metadata',
		tags: ['smoke', 'graphql', 'timeline', 'auth'],
		requiresAuth: true,
		async run({ gql }) {
			const res = await gql('timeline_home', {
				query: `query TimelineSmoke($type: TimelineType!, $first: Int = 1) {
  timeline(type: $type, first: $first) {
    totalCount
    edges { cursor }
    pageInfo { hasNextPage endCursor }
  }
}`,
				operationName: 'TimelineSmoke',
				variables: { type: 'HOME', first: 1 },
			});

			assertGraphqlOk(res);
			assertOk(typeof res.body?.data?.timeline?.totalCount === 'number', 'Expected timeline.totalCount');
			assertOk(Array.isArray(res.body?.data?.timeline?.edges), 'Expected timeline.edges array');
			assertOk(typeof res.body?.data?.timeline?.pageInfo?.hasNextPage === 'boolean', 'Expected timeline.pageInfo.hasNextPage');
		},
	},
	{
		slug: 'gql.timeline_local',
		name: 'GraphQL: timeline(LOCAL) returns connection metadata',
		tags: ['smoke', 'graphql', 'timeline', 'auth'],
		requiresAuth: true,
		async run({ gql }) {
			const res = await gql('timeline_local', {
				query: `query TimelineSmoke($type: TimelineType!, $first: Int = 1) {
  timeline(type: $type, first: $first) {
    totalCount
    edges { cursor }
    pageInfo { hasNextPage endCursor }
  }
}`,
				operationName: 'TimelineSmoke',
				variables: { type: 'LOCAL', first: 1 },
			});

			assertGraphqlOk(res);
			assertOk(typeof res.body?.data?.timeline?.totalCount === 'number', 'Expected timeline.totalCount');
			assertOk(Array.isArray(res.body?.data?.timeline?.edges), 'Expected timeline.edges array');
			assertOk(typeof res.body?.data?.timeline?.pageInfo?.hasNextPage === 'boolean', 'Expected timeline.pageInfo.hasNextPage');
		},
	},
	{
		slug: 'gql.timeline_public',
		name: 'GraphQL: timeline(PUBLIC) returns connection metadata',
		tags: ['smoke', 'graphql', 'timeline', 'auth'],
		requiresAuth: true,
		async run({ gql }) {
			const res = await gql('timeline_public', {
				query: `query TimelineSmoke($type: TimelineType!, $first: Int = 1) {
  timeline(type: $type, first: $first) {
    totalCount
    edges { cursor }
    pageInfo { hasNextPage endCursor }
  }
}`,
				operationName: 'TimelineSmoke',
				variables: { type: 'PUBLIC', first: 1 },
			});

			assertGraphqlOk(res);
			assertOk(typeof res.body?.data?.timeline?.totalCount === 'number', 'Expected timeline.totalCount');
			assertOk(Array.isArray(res.body?.data?.timeline?.edges), 'Expected timeline.edges array');
			assertOk(typeof res.body?.data?.timeline?.pageInfo?.hasNextPage === 'boolean', 'Expected timeline.pageInfo.hasNextPage');
		},
	},
	{
		slug: 'gql.notifications',
		name: 'GraphQL: notifications returns connection metadata',
		tags: ['smoke', 'graphql', 'notifications', 'auth'],
		requiresAuth: true,
		async run({ gql }) {
			const res = await gql('notifications', {
				query: `query NotificationsSmoke($first: Int = 1) {
  notifications(first: $first) {
    totalCount
    edges { cursor }
    pageInfo { hasNextPage endCursor }
  }
}`,
				operationName: 'NotificationsSmoke',
				variables: { first: 1 },
			});

			assertGraphqlOk(res);
			assertOk(typeof res.body?.data?.notifications?.totalCount === 'number', 'Expected notifications.totalCount');
			assertOk(Array.isArray(res.body?.data?.notifications?.edges), 'Expected notifications.edges array');
			assertOk(typeof res.body?.data?.notifications?.pageInfo?.hasNextPage === 'boolean', 'Expected notifications.pageInfo.hasNextPage');
		},
	},
	{
		slug: 'gql.my_agents',
		name: 'GraphQL: myAgents returns agent list',
		tags: ['smoke', 'graphql', 'agents', 'auth'],
		requiresAuth: true,
		async run({ gql }) {
			const res = await gql('my_agents', {
				query: `query MyAgentsSmoke {
  myAgents {
    username
    verified
    agentType
  }
}`,
				operationName: 'MyAgentsSmoke',
			});

			if (shouldSkipAgents(res)) {
				throw new SkipTestError('agents are disabled');
			}

			assertGraphqlOk(res);
			assertOk(Array.isArray(res.body?.data?.myAgents), 'Expected myAgents array');
		},
	},
	{
		slug: 'gql.agent',
		name: 'GraphQL: agent(username) returns agent details',
		tags: ['smoke', 'graphql', 'agents', 'auth'],
		requiresAuth: true,
		async run({ gql }) {
			const listRes = await gql('my_agents_for_lookup', {
				query: `query MyAgentsForLookup {
  myAgents { username }
}`,
				operationName: 'MyAgentsForLookup',
			});

			if (shouldSkipAgents(listRes)) {
				throw new SkipTestError('agents are disabled');
			}

			assertGraphqlOk(listRes);
			const agents = listRes.body?.data?.myAgents;
			assertOk(Array.isArray(agents), 'Expected myAgents array');

			const username = agents?.[0]?.username;
			if (!username) {
				throw new SkipTestError('no agents exist for lookup');
			}

			const res = await gql('agent_lookup', {
				query: `query AgentSmoke($username: String!) {
  agent(username: $username) {
    username
    verified
    agentType
    agentCapabilities { canPost }
  }
}`,
				operationName: 'AgentSmoke',
				variables: { username },
			});

			assertGraphqlOk(res);
			assertOk(res.body?.data?.agent?.username, 'Expected agent.username');
			assertEqual(res.body.data.agent.username, username, 'Expected agent.username to match lookup username');
			assertOk(typeof res.body?.data?.agent?.verified === 'boolean', 'Expected agent.verified boolean');
		},
	},
];
