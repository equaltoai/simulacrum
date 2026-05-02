import { readFile } from 'node:fs/promises';

import {
	createFaceApp,
	handleLambdaUrlEvent,
	type LambdaUrlEvent,
	type ViteManifest,
	viteAssetsForEntry,
} from '@theory-cloud/facetheory';
import { createSvelteFace } from '@theory-cloud/facetheory/svelte';

import App from './App.svelte';
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

const manifestPromise = loadClientManifest();

async function loadClientManifest(): Promise<ViteManifest> {
	const manifestUrl = new URL('./client-manifest.json', import.meta.url);
	const raw = await readFile(manifestUrl, 'utf8');
	return JSON.parse(raw) as ViteManifest;
}

function createFaceForRoute(route: string) {
	const face = createSvelteFace({
		route,
		mode: 'ssr',
		load: async (ctx) => ({
			initialPage: resolvePage(ctx.request.path),
			initialAgentHint: resolveIdentityAgentHint(ctx.request.path),
			initialComposeActorId: resolveConversationComposeActorId(ctx.request.path),
			initialStatusId: resolveStatusId(ctx.request.path),
			initialProfileIdentifier: resolveProfileIdentifier(ctx.request.path),
			initialProfileActorId: resolveProfileActorId(ctx.request.query),
		}),
		render: async (_ctx, data) => ({
			component: App,
			props: data as {
				initialPage: ReturnType<typeof resolvePage>;
				initialAgentHint: string | null;
				initialComposeActorId: string | null;
				initialStatusId: string | null;
				initialProfileIdentifier: string | null;
				initialProfileActorId: string | null;
			},
		}),
		renderOptions: async (_ctx, data) => {
			const manifest = await manifestPromise;
			const assets = viteAssetsForEntry(manifest, CLIENT_ENTRY, {
				base: CLIENT_ASSET_BASE,
				includeAssets: true,
			});

			const page = (data as { initialPage: ReturnType<typeof resolvePage> }).initialPage;

			return {
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
					{
						type: 'script',
						attrs: { type: 'module', src: assets.bootstrapModule },
					},
				],
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
	return handleLambdaUrlEvent(app, normalizeEvent(event));
}
