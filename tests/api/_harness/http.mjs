import { redactHeaders, redactUnknown, redactUrl, redactJwtLikeStrings, truncateText } from './redact.mjs';

function pickCorrelation(headers) {
	const pick = (key) => headers.get(key) ?? headers.get(key.toLowerCase()) ?? null;
	return {
		'x-request-id': pick('x-request-id'),
		'x-amzn-requestid': pick('x-amzn-requestid'),
		'x-amzn-trace-id': pick('x-amzn-trace-id'),
		'x-amz-cf-id': pick('x-amz-cf-id'),
	};
}

function pickResponseHeaders(headers) {
	const output = {};
	for (const key of ['content-type', 'cache-control', 'x-request-id', 'x-amzn-requestid', 'x-amzn-trace-id', 'x-amz-cf-id']) {
		const value = headers.get(key);
		if (value) output[key] = redactJwtLikeStrings(value);
	}
	return output;
}

async function readResponseBody(response) {
	const text = await response.text();
	const { value } = truncateText(text);
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

export function createRestClient({ baseUrl, token, evidence, openapi }) {
	return async function restRequest(name, { method = 'GET', path, headers = {}, body, token: tokenOverride } = {}) {
		const url = new URL(path, baseUrl).toString();
		const pathname = new URL(url).pathname;

		const requestHeaders = { accept: 'application/json', ...headers };
		const resolvedToken = tokenOverride === undefined ? token : tokenOverride;
		if (resolvedToken) requestHeaders.authorization = `Bearer ${resolvedToken}`;

		let requestBody = undefined;
		if (body !== undefined) {
			if (typeof body === 'string') {
				requestBody = body;
				requestHeaders['content-type'] = requestHeaders['content-type'] ?? 'text/plain';
			} else {
				requestBody = JSON.stringify(body);
				requestHeaders['content-type'] = requestHeaders['content-type'] ?? 'application/json';
			}
		}

		const started = Date.now();

		try {
			const response = await fetch(url, {
				method,
				headers: requestHeaders,
				body: requestBody,
			});

			const responseBody = await readResponseBody(response);
			const durationMs = Date.now() - started;
			const openapiResult = openapi?.validateRest
				? openapi.validateRest({
						method,
						pathname,
						status: response.status,
						contentType: response.headers.get('content-type'),
						body: responseBody,
					})
				: null;

			await evidence.recordRequest({
				name,
				kind: 'rest',
				request: {
					method,
					url: redactUrl(url),
					headers: redactHeaders(requestHeaders),
					body: redactUnknown(body),
				},
				response: {
					status: response.status,
					headers: pickResponseHeaders(response.headers),
					body: redactUnknown(responseBody),
					durationMs,
				},
				correlation: pickCorrelation(response.headers),
				openapi: openapiResult,
			});

			return { status: response.status, headers: response.headers, body: responseBody, openapi: openapiResult };
		} catch (error) {
			const durationMs = Date.now() - started;
			await evidence.recordRequest({
				name,
				kind: 'rest',
				request: {
					method,
					url: redactUrl(url),
					headers: redactHeaders(requestHeaders),
					body: redactUnknown(body),
				},
				response: {
					status: null,
					headers: {},
					body: { error: error?.message ?? String(error) },
					durationMs,
				},
				correlation: {},
				openapi: null,
			});
			throw error;
		}
	};
}

export function createGraphQLClient({ baseUrl, token, evidence }) {
	return async function graphqlRequest(name, { query, variables, operationName, token: tokenOverride } = {}) {
		const url = new URL('/api/graphql', baseUrl).toString();

		const payload = { query, variables: variables ?? undefined, operationName: operationName ?? undefined };

		const requestHeaders = { accept: 'application/json', 'content-type': 'application/json' };
		const resolvedToken = tokenOverride === undefined ? token : tokenOverride;
		if (resolvedToken) requestHeaders.authorization = `Bearer ${resolvedToken}`;

		const started = Date.now();

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: requestHeaders,
				body: JSON.stringify(payload),
			});

			const responseBody = await readResponseBody(response);
			const durationMs = Date.now() - started;

			await evidence.recordRequest({
				name,
				kind: 'graphql',
				request: {
					method: 'POST',
					url: redactUrl(url),
					headers: redactHeaders(requestHeaders),
					body: redactUnknown(payload),
				},
				response: {
					status: response.status,
					headers: pickResponseHeaders(response.headers),
					body: redactUnknown(responseBody),
					durationMs,
				},
				correlation: pickCorrelation(response.headers),
			});

			return { status: response.status, headers: response.headers, body: responseBody };
		} catch (error) {
			const durationMs = Date.now() - started;
			await evidence.recordRequest({
				name,
				kind: 'graphql',
				request: {
					method: 'POST',
					url: redactUrl(url),
					headers: redactHeaders(requestHeaders),
					body: redactUnknown(payload),
				},
				response: {
					status: null,
					headers: {},
					body: { error: error?.message ?? String(error) },
					durationMs,
				},
				correlation: {},
			});
			throw error;
		}
	};
}
