import { assertEqual, assertOk } from './_harness/assert.mjs';
import { SkipTestError } from './_harness/skip.mjs';

function requireUnsafe(unsafe) {
	if (!unsafe) {
		throw new SkipTestError('Unsafe mode required (pass --unsafe)');
	}
}

function requireRefreshToken(refreshToken) {
	if (!refreshToken) {
		throw new SkipTestError('Missing refresh token env var for this profile');
	}
}

function requireClientId(clientId) {
	if (!clientId) {
		throw new SkipTestError('Missing OAuth client_id (set API_TEST_OAUTH_CLIENT_ID or use a JWT access token with client_id claim)');
	}
}

export default [
	{
		slug: 'rest.oauth_refresh',
		name: 'REST: refresh token returns a new access token',
		tags: ['rest', 'oauth', 'unsafe'],
		async run({ rest, tokens, unsafe }) {
			requireUnsafe(unsafe);
			requireRefreshToken(tokens.refreshToken);
			requireClientId(tokens.clientId);

			const form = new URLSearchParams({
				client_id: tokens.clientId,
				grant_type: 'refresh_token',
				refresh_token: tokens.refreshToken,
			});

			const res = await rest('oauth_token_refresh', {
				method: 'POST',
				path: '/oauth/token',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: form.toString(),
				token: null,
			});

			assertEqual(res.status, 200, 'Expected POST /oauth/token (refresh) to return 200');
			assertOk(typeof res.body?.access_token === 'string', 'Expected access_token in OAuth token response');
			assertOk(typeof res.body?.token_type === 'string', 'Expected token_type in OAuth token response');

			if (res.body.access_token === tokens.accessToken) {
				throw new Error('Expected refresh to return a new access token');
			}
		},
	},
	{
		slug: 'rest.oauth_revoke_access_token',
		name: 'REST: revoke access token invalidates it',
		tags: ['rest', 'oauth', 'unsafe'],
		async run({ rest, tokens, unsafe }) {
			requireUnsafe(unsafe);
			requireRefreshToken(tokens.refreshToken);
			requireClientId(tokens.clientId);

			const refreshForm = new URLSearchParams({
				client_id: tokens.clientId,
				grant_type: 'refresh_token',
				refresh_token: tokens.refreshToken,
			});

			const refreshed = await rest('oauth_token_refresh_for_revoke', {
				method: 'POST',
				path: '/oauth/token',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: refreshForm.toString(),
				token: null,
			});

			assertEqual(refreshed.status, 200, 'Expected refresh to succeed before revocation');
			const newAccessToken = refreshed.body?.access_token;
			assertOk(typeof newAccessToken === 'string' && newAccessToken.length > 0, 'Expected refreshed access_token');

			const revokeForm = new URLSearchParams({
				client_id: tokens.clientId,
				token: newAccessToken,
				token_type_hint: 'access_token',
			});

			const revoked = await rest('oauth_revoke_access_token', {
				method: 'POST',
				path: '/oauth/revoke',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: revokeForm.toString(),
				token: null,
			});

			assertEqual(revoked.status, 200, 'Expected POST /oauth/revoke to return 200');

			const verify = await rest('verify_credentials_with_revoked_token', {
				path: '/api/v1/accounts/verify_credentials',
				token: newAccessToken,
			});

			if (verify.status === 200) {
				throw new Error('Expected revoked access token to fail verify_credentials');
			}
		},
	},
];

