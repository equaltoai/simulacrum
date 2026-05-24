import { readFile } from 'node:fs/promises';

import {
	buildStrictCspHeader,
	createFaceApp,
	externalHydrationForEntry,
	handleLambdaUrlEvent,
	type LambdaUrlEvent,
	type LambdaUrlResult,
	type Query,
	type ViteManifest,
	viteAssetsForEntry,
} from '@theory-cloud/facetheory';
import { createSvelteFace } from '@theory-cloud/facetheory/svelte';

import App from './App.svelte';
import { queryFromSearchString } from './query-parser';
import {
	resolveConversationComposeActorId,
	resolvePage,
	resolveIdentityAgentHint,
	resolveProfileActorId,
	resolveProfileIdentifier,
	resolveStatusId,
	stripBasePath,
} from './routing';

const CLIENT_ENTRY = 'src/facetheory/entry-client.ts';
const CLIENT_ASSET_BASE = '/l/_assets/';
const HYDRATION_DATA_PATH = '/_facetheory/hydration';
const PUBLIC_HYDRATION_DATA_PATH = `/l${HYDRATION_DATA_PATH}`;
const STRICT_CSP = {
	inlineScripts: false,
	inlineStyles: false,
	rawHead: false,
} as const;

type InitialRouteProps = {
	initialPage: ReturnType<typeof resolvePage>;
	initialAgentHint: string | null;
	initialComposeActorId: string | null;
	initialStatusId: string | null;
	initialProfileIdentifier: string | null;
	initialProfileActorId: string | null;
};

const manifestPromise = loadClientManifest();

async function loadClientManifest(): Promise<ViteManifest> {
	const manifestUrl = new URL('./client-manifest.json', import.meta.url);
	const raw = await readFile(manifestUrl, 'utf8');
	return JSON.parse(raw) as ViteManifest;
}

function createInitialRouteProps(path: string, query?: Query): InitialRouteProps {
	return {
		initialPage: resolvePage(path),
		initialAgentHint: resolveIdentityAgentHint(path),
		initialComposeActorId: resolveConversationComposeActorId(path),
		initialStatusId: resolveStatusId(path),
		initialProfileIdentifier: resolveProfileIdentifier(path),
		initialProfileActorId: resolveProfileActorId(query),
	};
}

function queryToSearchString(query?: Query): string {
	const params = new URLSearchParams();
	for (const key of Object.keys(query ?? {}).sort()) {
		for (const value of query?.[key] ?? []) {
			params.append(key, value);
		}
	}
	return params.toString();
}

function hydrationDataUrlForRequest(path: string, query?: Query): string {
	const params = new URLSearchParams();
	params.set('path', path || '/');
	const search = queryToSearchString(query);
	if (search) params.set('search', search);
	return `${PUBLIC_HYDRATION_DATA_PATH}?${params.toString()}`;
}

function createFaceForRoute(route: string) {
	const face = createSvelteFace({
		route,
		mode: 'ssr',
		load: async (ctx) => createInitialRouteProps(ctx.request.path, ctx.request.query),
		render: async (_ctx, data) => ({
			component: App,
			props: data as InitialRouteProps,
		}),
		renderOptions: async (ctx, data) => {
			const manifest = await manifestPromise;
			const assets = viteAssetsForEntry(manifest, CLIENT_ENTRY, {
				base: CLIENT_ASSET_BASE,
				includeAssets: true,
			});
			const props = data as InitialRouteProps;
			const hydration = externalHydrationForEntry(manifest, CLIENT_ENTRY, props, {
				base: CLIENT_ASSET_BASE,
				includeAssets: true,
				dataUrl: hydrationDataUrlForRequest(ctx.request.path, ctx.request.query),
			});

			const page = props.initialPage;

			return {
				csp: STRICT_CSP,
				headers: {
					'content-security-policy': buildStrictCspHeader(),
				},
				head: {
					title: `${page.title} | Simulacrum`,
				},
				headTags: [
					{ type: 'meta', attrs: { charset: 'utf-8' } },
					{
						type: 'meta',
						attrs: { name: 'viewport', content: 'width=device-width, initial-scale=1' },
					},
					{
						type: 'meta',
						attrs: { name: 'description', content: page.summary },
					},
					...assets.headTags,
				],
				hydration,
			};
		},
	});

	return {
		...face,
		render: async (
			ctx: Parameters<typeof face.render>[0],
			data: Parameters<typeof face.render>[1]
		) => {
			try {
				return await face.render(ctx, data);
			} catch (error) {
				console.error('[facetheory] render failed', {
					route,
					path: ctx.request.path,
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : null,
				});
				throw error;
			}
		},
	};
}

function hydrationJsonResult(event: LambdaUrlEvent): LambdaUrlResult {
	const params = new URLSearchParams(event.rawQueryString ?? '');
	const path = stripBasePath(params.get('path') ?? '/');
	const search = params.get('search') ?? '';
	const props = createInitialRouteProps(path, queryFromSearchString(search));

	return {
		statusCode: 200,
		headers: {
			'cache-control': 'no-store',
			'content-security-policy': buildStrictCspHeader(),
			'content-type': 'application/json; charset=utf-8',
			'x-content-type-options': 'nosniff',
		},
		body: `${JSON.stringify(props)}\n`,
		isBase64Encoded: false,
	};
}

const app = createFaceApp({
	faces: [
		createFaceForRoute('/'),
		createFaceForRoute('/souls'),
		createFaceForRoute('/souls/genesis'),
		createFaceForRoute('/approvals'),
		createFaceForRoute('/identity'),
		createFaceForRoute('/auth/callback'),
		createFaceForRoute('/{proxy+}'),
	],
});

function normalizeEvent(event: LambdaUrlEvent): LambdaUrlEvent {
	const rawPath = stripBasePath(event.rawPath ?? event.requestContext?.http?.path ?? '/');

	return {
		...event,
		rawPath,
		requestContext: {
			...event.requestContext,
			http: {
				...event.requestContext?.http,
				path: rawPath,
			},
		},
	};
}

export async function handler(event: LambdaUrlEvent) {
	const normalizedEvent = normalizeEvent(event);
	if ((normalizedEvent.rawPath ?? '/') === HYDRATION_DATA_PATH) {
		return hydrationJsonResult(normalizedEvent);
	}
	return handleLambdaUrlEvent(app, normalizedEvent);
}
