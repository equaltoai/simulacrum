import type { Query } from '@theory-cloud/facetheory';

import type { AppPageDescriptor, AppPageKey } from './types';

export const FACETHEORY_BASE_PATH = '/l';

const PAGE_DEFINITIONS: Record<AppPageKey, AppPageDescriptor> = {
	dashboard: {
		key: 'dashboard',
		path: '/',
		title: 'Nexus Dashboard',
		eyebrow: 'Agent-first control room',
		summary:
			'Track the active drone-to-soul lifecycle, continuity posture, and post-graduation follow-through from one canonical surface.',
		requiresAuth: true,
	},
	souls: {
		key: 'souls',
		path: '/souls',
		title: 'Soul Request Center',
		eyebrow: 'Requests and review routing',
		summary:
			'Handle incoming soul requests, review prompts, and notification-led triage without leaving Simulacrum.',
		requiresAuth: true,
	},
	genesis: {
		key: 'genesis',
		path: '/souls/genesis',
		title: 'Agent Genesis Workspace',
		eyebrow: 'Mint conversation lane',
		summary:
			'Conduct the streaming mint conversation, inspect produced declarations, and keep the issuance packet legible in-instance.',
		requiresAuth: true,
		requiresHostToken: true,
	},
	approvals: {
		key: 'approvals',
		path: '/approvals',
		title: 'Graduation Approval Thread',
		eyebrow: 'Signing and launch',
		summary:
			'Gather boundary approvals, finalize the self-attestation, and make the graduation checkpoint readable as a first-class product flow.',
		requiresAuth: true,
		requiresHostToken: true,
	},
	identity: {
		key: 'identity',
		path: '/identity',
		title: 'Identity Nexus',
		eyebrow: 'Continuity and attribution',
		summary:
			'Show what changed, what stayed continuous, and how the resulting soul remains reachable and accountable after graduation.',
		requiresAuth: true,
	},
	'auth-callback': {
		key: 'auth-callback',
		path: '/auth/callback',
		title: 'Completing Sign-In',
		eyebrow: 'OAuth callback',
		summary: 'Finish the Lesser Authorization Code + PKCE flow and return to the requested Simulacrum surface.',
	},
	'not-found': {
		key: 'not-found',
		path: '/404',
		title: 'Surface Not Found',
		eyebrow: 'Unknown route',
		summary:
			'The requested Simulacrum surface does not exist in the current FaceTheory route map.',
	},
};

export function firstQueryValue(query: Query | URLSearchParams | undefined, key: string): string | null {
	if (!query) return null;

	if (query instanceof URLSearchParams) {
		const value = query.get(key);
		return value?.trim() ? value.trim() : null;
	}

	const value = query[key];
	if (!Array.isArray(value) || value.length === 0) return null;
	const first = value[0]?.trim();
	return first ? first : null;
}

export function stripBasePath(pathname: string): string {
	const raw = String(pathname || '').trim() || '/';
	if (raw === FACETHEORY_BASE_PATH || raw === `${FACETHEORY_BASE_PATH}/`) return '/';
	if (raw.startsWith(`${FACETHEORY_BASE_PATH}/`)) {
		return raw.slice(FACETHEORY_BASE_PATH.length) || '/';
	}
	return raw.startsWith('/') ? raw : `/${raw}`;
}

export function normalizeRoutePath(pathname: string): string {
	const withoutBase = stripBasePath(pathname);
	if (!withoutBase || withoutBase === '/') return '/';
	const trimmed = withoutBase.endsWith('/') && withoutBase !== '/' ? withoutBase.slice(0, -1) : withoutBase;
	return trimmed || '/';
}

export function resolvePage(pathname: string): AppPageDescriptor {
	switch (normalizeRoutePath(pathname)) {
		case '/':
			return PAGE_DEFINITIONS.dashboard;
		case '/souls':
			return PAGE_DEFINITIONS.souls;
		case '/souls/genesis':
			return PAGE_DEFINITIONS.genesis;
		case '/approvals':
			return PAGE_DEFINITIONS.approvals;
		case '/identity':
			return PAGE_DEFINITIONS.identity;
		case '/auth/callback':
			return PAGE_DEFINITIONS['auth-callback'];
		default:
			return PAGE_DEFINITIONS['not-found'];
	}
}

export function getPageHref(key: AppPageKey, agentHint?: string | null): string {
	const page = PAGE_DEFINITIONS[key];
	const url = new URL(`${FACETHEORY_BASE_PATH}${page.path}`, 'https://simulacrum.invalid');
	const trimmedAgent = agentHint?.trim();
	if (trimmedAgent) {
		url.searchParams.set('agent', trimmedAgent);
	}
	return `${url.pathname}${url.search}`;
}

export function resolveWindowPage(): AppPageDescriptor {
	if (typeof window === 'undefined') {
		return PAGE_DEFINITIONS.dashboard;
	}
	return resolvePage(window.location.pathname);
}

export function resolveWindowAgentHint(): string | null {
	if (typeof window === 'undefined') return null;
	return firstQueryValue(new URLSearchParams(window.location.search), 'agent');
}
