import assert from 'node:assert/strict';
import test from 'node:test';

import { redactFormUrlEncoded, redactHeaders, redactJwtLikeStrings, redactUnknown, redactUrl } from './redact.mjs';

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
