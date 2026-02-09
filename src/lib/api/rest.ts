export class RestRequestError extends Error {
	readonly status: number;
	readonly body: unknown;

	constructor(message: string, { status, body }: { status: number; body?: unknown }) {
		super(message);
		this.name = 'RestRequestError';
		this.status = status;
		this.body = body;
	}
}

function isBodyInit(value: unknown): value is BodyInit {
	return (
		typeof value === 'string' ||
		value instanceof Blob ||
		value instanceof FormData ||
		value instanceof URLSearchParams ||
		value instanceof ArrayBuffer ||
		value instanceof ReadableStream
	);
}

export async function restRequest<TResponse = unknown>({
	path,
	method = 'GET',
	headers,
	body,
	token,
	signal,
}: {
	path: string;
	method?: string;
	headers?: Record<string, string>;
	body?: unknown;
	token?: string | null;
	signal?: AbortSignal;
}): Promise<TResponse> {
	const resolvedHeaders: Record<string, string> = { accept: 'application/json', ...(headers ?? {}) };

	const init: RequestInit = {
		method,
		headers: resolvedHeaders,
		signal,
	};

	if (token) {
		resolvedHeaders.authorization = `Bearer ${token}`;
	}

	if (body !== undefined) {
		if (isBodyInit(body)) {
			init.body = body;
		} else {
			resolvedHeaders['content-type'] = resolvedHeaders['content-type'] ?? 'application/json';
			init.body = JSON.stringify(body);
		}
	}

	const response = await fetch(path, init);

	const responseBody = (await response.json().catch(() => null)) as TResponse | null;

	if (!response.ok) {
		const message = `REST request failed (${response.status})`;
		throw new RestRequestError(message, { status: response.status, body: responseBody });
	}

	return (responseBody ?? ({} as TResponse)) as TResponse;
}

