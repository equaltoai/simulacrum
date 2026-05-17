import { hydrate, mount } from 'svelte';

import App from './App.svelte';
import { readClientProps } from './dev';
import type { AppPageDescriptor } from './types';
import './styles.css';

interface InitialRouteProps {
	initialPage: AppPageDescriptor;
	initialAgentHint?: string | null;
	initialComposeActorId?: string | null;
	initialStatusId?: string | null;
	initialProfileIdentifier?: string | null;
	initialProfileActorId?: string | null;
}

function readExternalHydrationDataUrl(doc: Document): string | null {
	const byId = doc.getElementById('__FACETHEORY_DATA_URL__');
	if (byId?.tagName.toLowerCase() === 'link') {
		const href = byId.getAttribute('href');
		if (href) return href;
	}

	const byRel = doc.querySelector('link[rel="facetheory-hydration"]');
	return byRel?.getAttribute('href') || null;
}

function resolveHydrationDataUrl(doc: Document): URL | null {
	const href = readExternalHydrationDataUrl(doc);
	if (!href) return null;

	const win = doc.defaultView ?? window;
	const dataUrl = new URL(href, win.location.href);
	if (dataUrl.origin !== win.location.origin) {
		throw new Error('FaceTheory hydration data must be same-origin.');
	}
	return dataUrl;
}

async function loadExternalHydrationProps(doc: Document): Promise<InitialRouteProps | null> {
	const dataUrl = resolveHydrationDataUrl(doc);
	if (!dataUrl) return null;

	const response = await fetch(dataUrl.toString(), {
		credentials: 'same-origin',
		headers: { accept: 'application/json' },
	});

	const responseUrl = response.url ? new URL(response.url, window.location.href) : dataUrl;
	if (responseUrl.origin !== window.location.origin) {
		throw new Error('FaceTheory hydration data response must remain same-origin.');
	}
	if (!response.ok) {
		throw new Error(`FaceTheory hydration data failed (${response.status}).`);
	}

	return (await response.json()) as InitialRouteProps;
}

async function hydrateApp() {
	const devTarget = document.getElementById('app');
	const props = (await loadExternalHydrationProps(document)) ?? readClientProps();

	if (devTarget) {
		mount(App, {
			target: devTarget,
			props,
		});
		return;
	}

	hydrate(App, {
		target: document.body,
		props,
	});
}

void hydrateApp().catch((error) => {
	console.error('FaceTheory strict CSP hydration failed', error);
});
