import { createLesserGraphQLAdapter, type LesserGraphQLAdapter } from '$lib/greater/adapters/graphql';

let adapter: LesserGraphQLAdapter | null = null;
let adapterToken: string | null = null;
let adapterWsEndpoint: string | null = null;

function computeWsEndpoint(): string | null {
	if (typeof window === 'undefined') {
		return null;
	}

	const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
	const hostname = window.location.hostname;

	const isLocal =
		hostname === 'localhost' ||
		hostname === '127.0.0.1' ||
		hostname === '[::1]' ||
		hostname.endsWith('.localhost');

	if (isLocal) {
		const host = window.location.host;
		return `${protocol}://${host}/graphql`;
	}

	return `${protocol}://ws.${hostname}`;
}

export function getStreamingAdapter(token: string | null): LesserGraphQLAdapter | null {
	if (!token) {
		if (adapter) {
			adapter.close();
		}
		adapter = null;
		adapterToken = null;
		adapterWsEndpoint = null;
		return null;
	}

	if (!adapter) {
		adapterWsEndpoint = computeWsEndpoint();
		adapter = createLesserGraphQLAdapter({
			httpEndpoint: '/api/graphql',
			wsEndpoint: adapterWsEndpoint ?? undefined,
			token,
		});
		adapterToken = token;
		return adapter;
	}

	if (adapterToken !== token) {
		adapter.updateToken(token);
		adapterToken = token;
	}

	return adapter;
}

export function getStreamingWsEndpoint(): string | null {
	return adapterWsEndpoint;
}

