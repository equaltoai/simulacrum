import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { queryFromSearchString } from '../../../src/facetheory/query-parser.ts';
import { redactTokenLikeStrings, redactUnknown } from './redact.mjs';
import { EvidenceWriter } from './evidence.mjs';

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


test('browser Host workflow bridge cannot be enabled with build-time env', async () => {
	const flagsSource = await readFile(new URL('../../../src/facetheory/flags.ts', import.meta.url), 'utf8');
	const loaderSource = await readFile(new URL('../../../src/facetheory/loaders.ts', import.meta.url), 'utf8');
	const appSource = await readFile(new URL('../../../src/facetheory/App.svelte', import.meta.url), 'utf8');
	const rolloutSource = await readFile(
		new URL('../../../docs/drones/agent-first-rollout.md', import.meta.url),
		'utf8'
	);

	assert.match(flagsSource, /export const HOST_WORKFLOW_BRIDGE_ENABLED = false;/);
	assert.doesNotMatch(flagsSource, /import\.meta\.env/);
	assert.doesNotMatch(flagsSource, /VITE_SIMULACRUM_ENABLE_HOST_WORKFLOW_BRIDGE/);
	assert.doesNotMatch(flagsSource, /normalizeBooleanEnv/);
	assert.match(flagsSource, /lesser#1154/);
	assert.match(flagsSource, /lesser-host#703/);
	assert.match(flagsSource, /Greater exposes the generated client\s+\*\s*adapters/);
	assert.match(flagsSource, /will not ask the browser for lesser-host control-plane credentials/);

	assert.doesNotMatch(
		loaderSource,
		/Connect a lesser-host control-plane token to start the Simulacrum-led hosted\/off-chain creation lane/
	);
	assert.match(loaderSource, /Lesser instance-trust creation bridge and Greater adapters/);
	assert.match(loaderSource, /will not ask the browser for lesser-host control-plane credentials/);
	assert.doesNotMatch(loaderSource, /This build keeps the host workflow bridge deliberately gated/);
	assert.doesNotMatch(loaderSource, /Host bridge disabled for this build/);
	assert.doesNotMatch(loaderSource, /Streaming lane deliberately gated/);

	assert.match(appSource, /Instance-trust bridge pending/);
	assert.match(appSource, /Soul creation is waiting on Lesser and Greater/);
	assert.doesNotMatch(appSource, /Deliberate enablement/);
	assert.doesNotMatch(appSource, /Host workflow bridge is disabled/);

	assert.doesNotMatch(rolloutSource, /VITE_SIMULACRUM_ENABLE_HOST_WORKFLOW_BRIDGE/);
	assert.doesNotMatch(rolloutSource, /When the flag is enabled/);
	assert.doesNotMatch(rolloutSource, /prefer enabling the host workflow bridge/);
	assert.match(rolloutSource, /same-origin instance-trust creation bridge/);
	assert.match(rolloutSource, /Greater exposes adapters/);
	assert.match(rolloutSource, /no deploy\/install environment variable is a supported way/);
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

test('CSR-023: OAuth callback binds client fingerprint across login/callback lifecycle', async () => {
	const source = await readFile(new URL('../../../src/lib/auth/session.ts', import.meta.url), 'utf8');

	// Login-time: only the random nonce is stored; the client fingerprint travels in OAuth state.
	assert.match(source, /const stateNonce = generateRandomString\(16\)/);
	assert.match(source, /const state = createOAuthState\(/);
	assert.match(source, /sessionStorage\.setItem\(STORAGE_KEYS\.oauthState, stateNonce\)/);
	assert.match(source, /await digestOAuthClientBinding\(\{ state: stateNonce, clientId: client\.clientId \}\)/);

	// Callback: returned OAuth state is parsed and the random nonce is checked against storage.
	assert.match(source, /const parsedState = parseOAuthState\(state\)/);
	assert.match(source, /parsedState\.stateNonce !== expectedState/);

	// Callback: mismatched client fingerprint fails closed before token exchange.
	assert.match(
		source,
		/state: parsedState\.stateNonce,\s*clientId: client\.clientId,/s
	);
	assert.match(source, /clientBinding !== parsedState\.clientBinding/);
	assert.match(source, /OAuth client identifier mismatch/);

	// Defense-in-depth: both timing guard and identity guard are present
	assert.match(source, /client\.createdAt > clientNotAfter/);
	assert.match(source, /clientBinding !== parsedState\.clientBinding/);

	// CodeQL guard: do not store the raw client_id in sessionStorage.
	assert.doesNotMatch(source, /oauthClientId: 'simulacrum:oauth_client_id'/);
	assert.doesNotMatch(source, /oauthClientBinding: 'simulacrum:oauth_client_binding'/);
	assert.doesNotMatch(source, /sessionStorage\.setItem\(STORAGE_KEYS\.oauthClientId, client\.clientId\)/);
});

// CSR-016: API evidence runner must not leak secrets in plain-text request bodies
test('CSR-016: redact module exports redactTokenLikeStrings', () => {
	assert.equal(typeof redactTokenLikeStrings, 'function');
});

test('CSR-016: redactUnknown catches plain-text hex token in request body', () => {
	const hexToken = 'abcdef0123456789abcdef0123456789'; // 32 hex chars
	const output = redactUnknown(hexToken);

	assert.match(output, /<redacted\.hex>/);
	assert.doesNotMatch(output, /abcdef0123456789abcdef0123456789/);
});

test('CSR-016: redactUnknown catches API-key-like string in plain text body', () => {
	const body = 'sk_example_abc123def4567890ghijklmnopqrst';
	const output = redactUnknown(body);

	assert.match(output, /<redacted\.key>/);
	assert.doesNotMatch(output, /sk_example_abc123/);
});

test('CSR-016: redactUnknown catches long base64url token', () => {
	const token = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH'; // 46 chars
	const output = redactUnknown(token);

	assert.match(output, /<redacted\.token>/);
});

test('CSR-016: redactUnknown catches hex token in nested object under non-sensitive key', () => {
	const nested = {
		proof: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
		data: { challenge: 'deadbeefcafebabe0123456789abcdef' },
	};
	const output = redactUnknown(nested);

	assert.match(output.proof, /<redacted\.hex>/);
	assert.match(output.data.challenge, /<redacted\.hex>/);
});

test('CSR-016: EvidenceWriter JSON output does not contain unredacted hex token', async () => {
	const runDir = path.join(tmpdir(), `csr016-evidence-${Date.now()}`);
	const writer = new EvidenceWriter({
		runDir,
		meta: { runId: 'csr016-test', baseUrl: 'https://example.com', profile: 'test', startedAt: new Date().toISOString() },
	});
	await writer.init();

	try {
		// Simulate recording a request with a plain-text hex token body
		await writer.recordRequest({
			name: 'csr016-raw-token',
			kind: 'rest',
			request: {
				method: 'POST',
				url: 'https://example.com/api/submit',
				headers: {},
				body: redactUnknown('abcdef0123456789abcdef0123456789'),
			},
			response: {
				status: 200,
				headers: {},
				body: {},
				durationMs: 10,
			},
			correlation: {},
			openapi: null,
		});

		// Read back the written evidence file
		const files = await readFile(path.join(runDir, 'requests', '001-csr016-raw-token.rest.json'), 'utf8');
		const parsed = JSON.parse(files);

		// The raw hex token must not appear in the evidence file
		assert.doesNotMatch(JSON.stringify(parsed), /abcdef0123456789abcdef0123456789/);
		// The redacted marker must appear
		assert.match(JSON.stringify(parsed), /<redacted\.hex>/);
	} finally {
		await rm(runDir, { recursive: true, force: true });
	}
});

test('CSR-016: EvidenceWriter JSON output does not contain unredacted API key', async () => {
	const runDir = path.join(tmpdir(), `csr016-evidence-${Date.now()}`);
	const writer = new EvidenceWriter({
		runDir,
		meta: { runId: 'csr016-test2', baseUrl: 'https://example.com', profile: 'test', startedAt: new Date().toISOString() },
	});
	await writer.init();

	try {
		await writer.recordRequest({
			name: 'csr016-api-key',
			kind: 'rest',
			request: {
				method: 'POST',
				url: 'https://example.com/api/submit',
				headers: {},
				body: redactUnknown('sk_example_abc123def4567890ghijklmnopqrstuvwxyz'),
			},
			response: {
				status: 200,
				headers: {},
				body: {},
				durationMs: 10,
			},
			correlation: {},
			openapi: null,
		});

		const files = await readFile(path.join(runDir, 'requests', '001-csr016-api-key.rest.json'), 'utf8');
		const parsed = JSON.parse(files);

		assert.doesNotMatch(JSON.stringify(parsed), /sk_example_abc123def4567890ghijklmnopqrstuvwxyz/);
		assert.match(JSON.stringify(parsed), /<redacted\.key>/);
	} finally {
		await rm(runDir, { recursive: true, force: true });
	}
});

test('CSR-016: natural-language strings survive redactUnknown unchanged', () => {
	const content = 'This is a status update with normal text. Nothing secret here!';
	const output = redactUnknown(content);

	assert.equal(output, content);
});
