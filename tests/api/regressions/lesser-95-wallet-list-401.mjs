import { assertEqual, assertOk } from '../_harness/assert.mjs';

export default [
	{
		slug: 'rest.wallet_list',
		name: 'REST (smoke): /auth/wallet/list should not 401 (regression lesser#95)',
		issue: { repo: 'equaltoai/lesser', number: 95 },
		tags: ['smoke', 'rest', 'wallet', 'regression', 'lesser-95'],
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

