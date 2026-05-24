import assert from 'node:assert/strict';
import test from 'node:test';

import { redactFormUrlEncoded, redactHeaders, redactJwtLikeStrings, redactTokenLikeStrings, redactUnknown, redactUrl } from './redact.mjs';

test('redactHeaders redacts authorization + cookie', () => {
	const output = redactHeaders({
		Authorization: 'Bearer secret-token',
		cookie: 'session=secret',
		'x-other': 'ok',
	});

	assert.equal(output.Authorization, '<redacted>');
	assert.equal(output.cookie, '<redacted>');
	assert.equal(output['x-other'], 'ok');
});

test('redactJwtLikeStrings truncates JWT-like tokens', () => {
	const input = 'aaaaaaaa.bbbbbbbb.cccccccc';
	const output = redactJwtLikeStrings(input);
	assert.notEqual(output, input);
	assert.match(output, /…/);
});

test('redactUnknown redacts common token keys (including nested)', () => {
	const input = {
		access_token: 'access',
		id_token: 'id',
		refreshToken: 'refresh',
		password: 'secret-password',
		nested: {
			token: 'token',
			client_secret: 'secret',
			code: 'code',
			signature: 'sig',
			other: 'aaaaaaaa.bbbbbbbb.cccccccc',
		},
	};

	const output = redactUnknown(input);

	assert.equal(output.access_token, '<redacted>');
	assert.equal(output.id_token, '<redacted>');
	assert.equal(output.refreshToken, '<redacted>');
	assert.equal(output.password, '<redacted>');
	assert.equal(output.nested.token, '<redacted>');
	assert.equal(output.nested.client_secret, '<redacted>');
	assert.equal(output.nested.code, '<redacted>');
	assert.equal(output.nested.signature, '<redacted>');
	assert.notEqual(output.nested.other, input.nested.other);
});

test('redactFormUrlEncoded redacts sensitive fields in form bodies', () => {
	const input =
		'grant_type=refresh_token&client_id=lesser-agent-delegation&refresh_token=something&token=another';
	const output = redactFormUrlEncoded(input);

	assert.match(output, /grant_type=refresh_token/);
	assert.match(output, /client_id=lesser-agent-delegation/);
	assert.match(output, /refresh_token=<redacted>/);
	assert.match(output, /token=<redacted>/);
});

test('redactUnknown redacts sensitive fields inside form-like strings', () => {
	const input = 'code=abc123&code_verifier=verifier&client_id=client&password=pw&id_token=id';
	const output = redactUnknown(input);

	assert.match(output, /code=<redacted>/);
	assert.match(output, /code_verifier=<redacted>/);
	assert.match(output, /password=<redacted>/);
	assert.match(output, /id_token=<redacted>/);
});

test('redactUnknown redacts JSON carried as a plain text request body', () => {
	const input = JSON.stringify({
		access_token: 'access-secret',
		nested: { client_secret: 'client-secret', keep: 'ok' },
	});
	const output = redactUnknown(input);

	assert.equal(typeof output, 'string');
	assert.doesNotMatch(output, /access-secret/);
	assert.doesNotMatch(output, /client-secret/);
	assert.match(output, /"access_token":"<redacted>"/);
	assert.match(output, /"client_secret":"<redacted>"/);
	assert.match(output, /"keep":"ok"/);
});

test('redactUnknown redacts multiline plain text secret bodies', () => {
	const input = [
		'grant_type=authorization_code',
		'code=abc123',
		'Authorization: Bearer abcdefghijklmnop',
		'note=ok',
	].join('\n');
	const output = redactUnknown(input);

	assert.doesNotMatch(output, /abc123/);
	assert.doesNotMatch(output, /abcdefghijklmnop/);
	assert.match(output, /code=<redacted>/);
	assert.match(output, /Authorization: Bearer <redacted>/);
	assert.match(output, /note=ok/);
});

test('redactUnknown redacts multiline plaintext authorization and cookie form fields', () => {
	const output = redactUnknown(['authorization=abcdefghijklmnop', 'cookie=sessionidabcdefghijklmnop', 'note=ok'].join('\n'));

	assert.doesNotMatch(output, /abcdefghijklmnop/);
	assert.doesNotMatch(output, /sessionidabcdefghijklmnop/);
	assert.match(output, /authorization=<redacted>/);
	assert.match(output, /cookie=<redacted>/);
	assert.match(output, /note=ok/);
});

test('redactUrl redacts sensitive query params', () => {
	const input = 'https://example.com/callback?code=abc123&access_token=secret&ok=1';
	const output = redactUrl(input);

	assert.match(output, /code=<redacted>/);
	assert.match(output, /access_token=<redacted>/);
	assert.match(output, /ok=1/);
});

// CSR-016: plain-text secret strings
test('CSR-016: redactTokenLikeStrings redacts long hex tokens', () => {
	const input = 'abc123def4567890abc123def4567890'; // 32 hex chars
	const output = redactTokenLikeStrings(input);

	assert.match(output, /<redacted\.hex>/);
	assert.doesNotMatch(output, /abc123def4567890abc123def4567890/);
});

test('CSR-016: redactTokenLikeStrings redacts long base64url tokens', () => {
	const input = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF'; // 42 base64url chars
	const output = redactTokenLikeStrings(input);

	assert.match(output, /<redacted\.token>/);
});

test('CSR-016: redactTokenLikeStrings redacts API-key-prefixed strings', () => {
	const outputs = [
		redactTokenLikeStrings('sk-abc123def4567890ghijkl'),
		redactTokenLikeStrings('pk_example_abc123def4567890ghijkl'),
		redactTokenLikeStrings('api_abc123def4567890ghijkl'),
		redactTokenLikeStrings('key_abc123def4567890ghijklmnop'),
		redactTokenLikeStrings('token_abc123def4567890ghijkl'),
		redactTokenLikeStrings('secret_abc123def4567890ghijkl'),
		redactTokenLikeStrings('auth_abc123def4567890ghijklmn'),
		redactTokenLikeStrings('pat_abc123def4567890ghijklmnop'),
	];

	for (const output of outputs) {
		assert.match(output, /<redacted\.key>/);
	}
});

test('CSR-016: redactTokenLikeStrings preserves natural-language strings', () => {
	const natural = 'Hello this is a natural language sentence with spaces and punctuation!';
	const output = redactTokenLikeStrings(natural);

	assert.equal(output, natural);
});

test('CSR-016: redactTokenLikeStrings skips short tokens', () => {
	const shortHex = 'abc123de'; // 8 hex chars
	const shortBase64 = 'abc123def456'; // 12 base64url chars

	assert.equal(redactTokenLikeStrings(shortHex), shortHex);
	assert.equal(redactTokenLikeStrings(shortBase64), shortBase64);
});

test('CSR-016: redactUnknown redacts plain-text hex token body', () => {
	const hexToken = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'; // 32 hex chars
	const output = redactUnknown(hexToken);

	assert.match(output, /<redacted\.hex>/);
	assert.doesNotMatch(output, /a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/);
});

test('CSR-016: redactUnknown redacts API key in plain text body', () => {
	const body = 'sk_example_abc123def4567890ghijklmnopqrstuv';
	const output = redactUnknown(body);

	assert.match(output, /<redacted\.key>/);
	assert.doesNotMatch(output, /sk_example_abc123/);
});

test('CSR-016: redactUnknown redacts token-like strings nested in object under unknown keys', () => {
	const input = {
		proof: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', // hex token under non-sensitive key
		challenge: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF', // base64url token under non-sensitive key
		normalField: 'ok value',
	};
	const output = redactUnknown(input);

	assert.match(output.proof, /<redacted\.hex>/);
	assert.doesNotMatch(output.proof, /a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/);
	assert.match(output.challenge, /<redacted\.token>/);
	assert.doesNotMatch(output.challenge, /abcdefghijklmnopqrstuvwxyz0123456789ABCDEF/);
	assert.equal(output.normalField, 'ok value');
});

test('CSR-016: redactUnknown does not redact natural language in response bodies', () => {
	// Simulates a status content response — natural text should not be redacted
	const input = {
		content: 'This is a status update with normal text content that happens to be longer than forty characters but has spaces',
		id: '01JQ0EXYZW8RK9NRSDV83TBH5N', // 26-char ULID — below hex threshold (32)
	};
	const output = redactUnknown(input);

	assert.equal(output.content, input.content);
	assert.equal(output.id, input.id); // ULID is 26 chars, below 32-char hex threshold
});

test('CSR-016: redactUnknown redacts token-like values in GraphQL variable-like object', () => {
	// Simulates GraphQL variables with secret-like values under non-standard keys
	const variables = {
		input: {
			apiGatewayKey: 'sk_example_abc123def4567890ghijklmnopqrstuvwxyz',
			proof: 'abcdef0123456789abcdef0123456789', // 32 hex
			displayName: 'Test Bot',
		},
	};
	const output = redactUnknown(variables);

	assert.match(output.input.apiGatewayKey, /<redacted\.key>/);
	assert.match(output.input.proof, /<redacted\.hex>/);
	assert.equal(output.input.displayName, 'Test Bot');
});
