import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			fallback: 'index.html'
		}),
		appDir: '_assets',
		paths: {
			base: '/l'
		},
		inlineStyleThreshold: 0
	}
};

export default config;
