import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
