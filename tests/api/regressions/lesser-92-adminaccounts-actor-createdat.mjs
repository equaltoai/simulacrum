import { assertEqual, assertOk } from '../_harness/assert.mjs';
import { SkipTestError } from '../_harness/skip.mjs';

const ADMIN_ACCOUNTS_CREATED_AT_QUERY = `query AdminAccountsCreatedAtRegression {
  adminAccounts(first: 50) {
    accounts {
      id
      username
      actor {
        id
        username
        createdAt
      }
    }
    nextCursor
  }
}`;

export default [
	{
		slug: 'regression.lesser-92.adminAccounts-actor-createdAt',
		name: 'Regression (lesser#92): adminAccounts should not error on actor.createdAt',
		issue: { repo: 'equaltoai/lesser', number: 92 },
		tags: ['regression', 'graphql', 'admin', 'lesser-92'],
		requiresAuth: true,
		async run({ gql, profile }) {
			if (profile !== 'admin') throw new SkipTestError('Requires admin profile');

			const res = await gql('admin_accounts_createdAt_regression', {
				query: ADMIN_ACCOUNTS_CREATED_AT_QUERY,
				operationName: 'AdminAccountsCreatedAtRegression',
			});

			assertEqual(res.status, 200, 'Expected GraphQL adminAccounts query to return 200');

			if (Array.isArray(res.body?.errors) && res.body.errors.length) {
				const first = res.body.errors?.[0]?.message ?? 'unknown';
				throw new Error(`Expected no GraphQL errors (got ${res.body.errors.length}): ${first}`);
			}

			assertOk(Array.isArray(res.body?.data?.adminAccounts?.accounts), 'Expected adminAccounts.accounts array');
		},
	},
];

