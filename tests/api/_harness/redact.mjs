const SENSITIVE_KEY_SET = new Set([
	'accesstoken',
	'access_token',
	'refreshtoken',
	'refresh_token',
	'clientsecret',
	'client_secret',
	'code',
	'codeverifier',
	'code_verifier',
	'signature',
]);

const SENSITIVE_QUERY_KEYS = new Set(['access_token', 'refresh_token', 'client_secret', 'code', 'code_verifier', 'signature']);

const JWT_LIKE_REGEX = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

function normalizeKey(key) {
	return String(key).toLowerCase().replace(/[^a-z0-9_]+/g, '');
}

export function redactJwtLikeStrings(text) {
	return String(text).replace(JWT_LIKE_REGEX, (match) => {
		const parts = match.split('.');
		if (parts.length !== 3) return '<redacted.jwt>';
		return parts.map((p) => `${p.slice(0, 8)}…`).join('.');
	});
}

export function redactUrl(url) {
	try {
		const parsed = new URL(url);
		for (const [key] of parsed.searchParams) {
			if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
				parsed.searchParams.set(key, '<redacted>');
			}
		}
		return parsed.toString();
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

export function redactUnknown(value) {
	if (value === null || value === undefined) return value;

	if (typeof value === 'string') return redactJwtLikeStrings(value);
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

