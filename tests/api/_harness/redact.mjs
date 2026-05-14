const SENSITIVE_KEY_SET = new Set([
	'accesstoken',
	'access_token',
	'idtoken',
	'id_token',
	'refreshtoken',
	'refresh_token',
	'token',
	'password',
	'passcode',
	'apikey',
	'api_key',
	'authorization',
	'cookie',
	'clientsecret',
	'client_secret',
	'code',
	'codeverifier',
	'code_verifier',
	'signature',
]);

const SENSITIVE_QUERY_KEYS = new Set([
	'access_token',
	'id_token',
	'refresh_token',
	'token',
	'password',
	'api_key',
	'client_secret',
	'code',
	'code_verifier',
	'signature',
]);

const JWT_LIKE_REGEX = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_TOKEN_REGEX = /\bBearer\s+([A-Za-z0-9._~+/=-]{8,})\b/gi;
const FORM_LIKE_LINE_REGEX =
	/(^|[&\s])(?:access_token|id_token|refresh_token|token|password|client_secret|code|code_verifier|signature|api_key)\s*=/i;

function normalizeKey(key) {
	return String(key).toLowerCase().replace(/[^a-z0-9_]+/g, '');
}

function decodeRedactedAngleBrackets(text) {
	return String(text).replace(/%3Credacted%3E/gi, '<redacted>');
}

export function redactJwtLikeStrings(text) {
	return String(text)
		.replace(JWT_LIKE_REGEX, (match) => {
			const parts = match.split('.');
			if (parts.length !== 3) return '<redacted.jwt>';
			return parts.map((p) => `${p.slice(0, 8)}…`).join('.');
		})
		.replace(BEARER_TOKEN_REGEX, 'Bearer <redacted>');
}

export function redactUrl(url) {
	try {
		const parsed = new URL(url);
		for (const [key] of parsed.searchParams) {
			if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
				parsed.searchParams.set(key, '<redacted>');
			}
		}
		return decodeRedactedAngleBrackets(parsed.toString());
	} catch {
		return redactJwtLikeStrings(url);
	}
}

export function redactHeaders(headers) {
	const redacted = {};

	for (const [key, value] of Object.entries(headers ?? {})) {
		const lowered = key.toLowerCase();
		if (lowered === 'authorization' || lowered === 'cookie') {
			redacted[key] = '<redacted>';
			continue;
		}
		redacted[key] = redactJwtLikeStrings(value);
	}

	return redacted;
}

export function redactFormUrlEncoded(text) {
	if (typeof text !== 'string') return redactJwtLikeStrings(text);
	if (!text.includes('=')) return redactJwtLikeStrings(text);

	const params = new URLSearchParams(text.startsWith('?') ? text.slice(1) : text);
	let didChange = false;

	for (const [key, value] of params.entries()) {
		const lowered = key.toLowerCase();
		const normalized = normalizeKey(key);

		if (SENSITIVE_QUERY_KEYS.has(lowered) || SENSITIVE_KEY_SET.has(normalized)) {
			if (value !== '<redacted>') {
				params.set(key, '<redacted>');
				didChange = true;
			}
			continue;
		}

		const redactedValue = redactJwtLikeStrings(value);
		if (redactedValue !== value) {
			params.set(key, redactedValue);
			didChange = true;
		}
	}

	if (!didChange) return text;
	return decodeRedactedAngleBrackets(params.toString());
}

function redactJsonString(text) {
	try {
		const parsed = JSON.parse(text);
		const redacted = redactUnknown(parsed);
		return JSON.stringify(redacted);
	} catch {
		return null;
	}
}

function redactPlainTextBody(text) {
	const trimmed = text.trim();
	const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
	if (looksLikeJson) {
		const redactedJson = redactJsonString(trimmed);
		if (redactedJson !== null) return redactedJson;
	}

	if (FORM_LIKE_LINE_REGEX.test(text)) {
		return text
			.split(/(\r?\n)/)
			.map((part) => (part.includes('=') ? redactFormUrlEncoded(part) : redactJwtLikeStrings(part)))
			.join('');
	}

	return redactJwtLikeStrings(text);
}

export function redactUnknown(value) {
	if (value === null || value === undefined) return value;

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed.includes('=') && !trimmed.includes('\n')) {
			const redactedForm = redactFormUrlEncoded(trimmed);
			if (redactedForm !== trimmed) return redactedForm;
		}

		return redactPlainTextBody(value);
	}
	if (typeof value === 'number' || typeof value === 'boolean') return value;

	if (Array.isArray(value)) return value.map((v) => redactUnknown(v));

	if (typeof value === 'object') {
		const output = {};
		for (const [key, v] of Object.entries(value)) {
			const normalized = normalizeKey(key);
			if (SENSITIVE_KEY_SET.has(normalized)) {
				output[key] = '<redacted>';
			} else {
				output[key] = redactUnknown(v);
			}
		}
		return output;
	}

	return value;
}

export function truncateText(text, maxChars = 200_000) {
	const value = typeof text === 'string' ? text : String(text);
	if (value.length <= maxChars) return { value, truncated: false };
	return { value: `${value.slice(0, maxChars)}\n<truncated ${value.length - maxChars} chars>`, truncated: true };
}
