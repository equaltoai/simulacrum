import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ command, isSsrBuild }) => {
	const ssr = Boolean(isSsrBuild);

	return {
		appType: ssr ? 'custom' : 'spa',
		base: !ssr && command === 'build' ? '/l/_assets/' : '/',
		plugins: [svelte()],
		resolve: {
			alias: {
				$lib: path.resolve(root, 'src/lib'),
				'$app/environment': path.resolve(root, 'src/facetheory/shims/app-environment.ts'),
				'$app/paths': path.resolve(root, 'src/facetheory/shims/app-paths.ts'),
			},
		},
		ssr: {
			noExternal: true,
		},
		build: {
			outDir: ssr ? 'build/server' : 'build/client',
			emptyOutDir: !ssr,
			assetsInlineLimit: 0,
			manifest: ssr ? false : '.vite/manifest.json',
			ssr: ssr ? path.resolve(root, 'src/facetheory/entry-server.ts') : false,
			rollupOptions: {
				input: ssr
					? path.resolve(root, 'src/facetheory/entry-server.ts')
					: path.resolve(root, 'src/facetheory/entry-client.ts'),
				output: ssr
					? {
							format: 'esm',
							entryFileNames: 'handler.mjs',
							chunkFileNames: 'chunks/[name]-[hash].mjs',
							assetFileNames: 'assets/[name]-[hash][extname]',
						}
					: {
							entryFileNames: 'assets/[name]-[hash].js',
							chunkFileNames: 'assets/[name]-[hash].js',
							assetFileNames: 'assets/[name]-[hash][extname]',
						},
			},
		},
	};
});
