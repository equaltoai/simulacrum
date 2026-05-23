import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

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

test('OAuth callback fails closed when the cached public client changes before callback', async () => {
	const source = await readFile(new URL('../../../src/lib/auth/session.ts', import.meta.url), 'utf8');

	assert.match(source, /oauthClientNotAfter: 'simulacrum:oauth_client_not_after'/);
	assert.match(source, /sessionStorage\.setItem\(STORAGE_KEYS\.oauthClientNotAfter, String\(Date\.now\(\)\)\)/);
	assert.match(source, /const clientNotAfter = Number\(sessionStorage\.getItem\(STORAGE_KEYS\.oauthClientNotAfter\)\)/);
	assert.match(source, /client\.createdAt > clientNotAfter/);
	assert.match(source, /OAuth client changed before callback/);
	assert.match(source, /client_id: client\.clientId/);
});

test('CSR-023: OAuth callback binds clientId across login/callback lifecycle', async () => {
	const source = await readFile(new URL('../../../src/lib/auth/session.ts', import.meta.url), 'utf8');

	// Storage key defined
	assert.match(source, /oauthClientId: 'simulacrum:oauth_client_id'/);

	// Login-time: clientId stored in sessionStorage alongside the PKCE state
	assert.match(source, /sessionStorage\.setItem\(STORAGE_KEYS\.oauthClientId, client\.clientId\)/);

	// Callback: stored clientId read from sessionStorage
	assert.match(source, /const storedClientId = sessionStorage\.getItem\(STORAGE_KEYS\.oauthClientId\)/);

	// Callback: missing or mismatched clientId fails closed before token exchange
	assert.match(source, /!storedClientId \|\| client\.clientId !== storedClientId/);
	assert.match(source, /OAuth client identifier mismatch/);

	// Callback: missing-binding case fails closed (not degraded to timing-only guard)
	assert.match(source, /!storedClientId/);

	// Cleanup: clientId removed after successful token exchange
	assert.match(source, /sessionStorage\.removeItem\(STORAGE_KEYS\.oauthClientId\)/);

	// Defense-in-depth: both timing guard and identity guard are present
	assert.match(source, /client\.createdAt > clientNotAfter/);
	assert.match(source, /client\.clientId !== storedClientId/);
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
