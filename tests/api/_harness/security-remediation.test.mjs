import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { queryFromSearchString } from '../../../src/facetheory/query-parser.ts';

test('FaceTheory reachability uses host workflow tokens, not Lesser OAuth tokens', async () => {
	const appSource = await readFile(new URL('../../../src/facetheory/App.svelte', import.meta.url), 'utf8');
	const loaderSource = await readFile(new URL('../../../src/facetheory/loaders.ts', import.meta.url), 'utf8');

	assert.doesNotMatch(appSource, /authToken:\s*session\.accessToken/);
	assert.doesNotMatch(loaderSource, /authToken\?:\s*string/);
	assert.doesNotMatch(loaderSource, /loadChannels\([^)]*authToken/);
	assert.match(loaderSource, /const reachabilityToken = hostToken\?\.trim\(\) \?\? '';/);
	assert.match(loaderSource, /SOUL_WORKFLOW_HOST_AUTH_NOTE/);
	assert.match(loaderSource, /createControlPlaneLesserHostSoulClient/);
});

test('OAuth callback fails closed when the cached public client changes before callback', async () => {
	const source = await readFile(new URL('../../../src/lib/auth/session.ts', import.meta.url), 'utf8');

	assert.match(source, /oauthClientNotAfter: 'simulacrum:oauth_client_not_after'/);
	assert.match(source, /sessionStorage\.setItem\(STORAGE_KEYS\.oauthClientNotAfter, String\(Date\.now\(\)\)\)/);
	assert.match(source, /const clientNotAfter = Number\(sessionStorage\.getItem\(STORAGE_KEYS\.oauthClientNotAfter\)\)/);
	assert.match(source, /client\.createdAt > clientNotAfter/);
	assert.match(source, /OAuth client changed before callback/);
	assert.match(source, /client_id: client\.clientId/);
});

// CSR-021: hydration query parser must not crash on prototype-pollution keys
test('queryFromSearchString handles prototype keys (toString, constructor, __proto__) without crash', () => {
	// Each prototype-keyed search string must parse without throwing
	const cases = [
		{ search: 'toString=hello', key: 'toString', expected: ['hello'] },
		{ search: 'constructor=test', key: 'constructor', expected: ['test'] },
		{ search: '__proto__=bad', key: '__proto__', expected: ['bad'] },
		{ search: 'valueOf=nope', key: 'valueOf', expected: ['nope'] },
		{ search: 'hasOwnProperty=shadowed', key: 'hasOwnProperty', expected: ['shadowed'] },
		{ search: 'toString=hello&constructor=test&__proto__=bad', key: 'toString', expected: ['hello'] },
	];

	for (const { search, key, expected } of cases) {
		const result = queryFromSearchString(search);
		assert.ok(result, `queryFromSearchString("${search}") returned a truthy result`);
		assert.deepEqual(
			result[key],
			expected,
			`queryFromSearchString("${search}")['${key}'] should equal ${JSON.stringify(expected)}`
		);
	}

	// Canonical defense: result must be prototype-free (Object.create(null))
	const normal = queryFromSearchString('foo=bar');
	assert.equal(Object.getPrototypeOf(normal), null);
	assert.equal(normal.toString, undefined, 'toString should not be inherited from Object.prototype');
	assert.equal(normal.constructor, undefined);
	assert.equal(normal.__proto__, undefined);
	assert.equal(normal.hasOwnProperty, undefined);
});
