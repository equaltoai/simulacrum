import { assertEqual, assertOk } from './_harness/assert.mjs';

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

			assertEqual(res.status, 200, 'Expected POST /api/graphql to return 200');
			assertOk(res.body?.data?.viewer?.id, 'Expected viewer.id');
			assertOk(res.body?.data?.viewer?.username, 'Expected viewer.username');

			if (Array.isArray(res.body?.errors) && res.body.errors.length) {
				throw new Error(`Expected GraphQL viewer query to succeed (got errors: ${res.body.errors.length})`);
			}
		},
	},
	{
		slug: 'rest.wallet_list',
		name: 'REST: /auth/wallet/list returns linked wallets (or empty list)',
		tags: ['smoke', 'rest', 'wallet'],
		requiresAuth: true,
		async run({ rest }) {
			const res = await rest('wallet_list', { path: '/auth/wallet/list' });
			assertEqual(res.status, 200, 'Expected GET /auth/wallet/list to return 200');

			const wallets = res.body?.wallets;
			if (wallets !== undefined) {
				assertOk(Array.isArray(wallets), 'Expected wallet list response to include wallets array');
			}
		},
	},
];
