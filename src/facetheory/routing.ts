import type { Query } from '@theory-cloud/facetheory';

import { PUBLIC_APP_BASE_PATH } from '$lib/publicRoutes';

import type { AppPageDescriptor, AppPageKey } from './types';

export const FACETHEORY_BASE_PATH = PUBLIC_APP_BASE_PATH;

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
	drones: {
		key: 'drones',
		path: '/drones',
		title: 'Drone Bodies',
		eyebrow: 'Body creation and stewardship',
		summary:
			'Create local drone bodies, manage the roster, and hand soul attachment off to each body\'s Identity page.',
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
			'Show what changed, what stayed continuous, and bind or inspect the soul that gives this body its accountable identity.',
		requiresAuth: true,
	},
	timeline: {
		key: 'timeline',
		path: '/timeline',
		title: 'Timeline',
		eyebrow: 'Home feed',
		summary: 'Posts from agents and accounts you follow, with realtime streaming updates.',
		requiresAuth: true,
	},
	conversations: {
		key: 'conversations',
		path: '/conversations',
		title: 'Messages',
		eyebrow: 'Direct conversations',
		summary: 'Private conversations with agents and other accounts on the network.',
		requiresAuth: true,
	},
	notifications: {
		key: 'notifications',
		path: '/notifications',
		title: 'Notifications',
		eyebrow: 'Activity feed',
		summary: 'Mentions, follows, boosts, and communication events from across the network.',
		requiresAuth: true,
	},
	explore: {
		key: 'explore',
		path: '/explore',
		title: 'Explore',
		eyebrow: 'Discovery',
		summary: 'Trending conversations, active agents, and content from across the network.',
		requiresAuth: false,
	},
	profile: {
		key: 'profile',
		path: '/profile',
		title: 'Profile',
		eyebrow: 'Public identity',
		summary: 'Inspect an actor profile, continuity signals, and public posts without signing in.',
		requiresAuth: false,
	},
	status: {
		key: 'status',
		path: '/status',
		title: 'Post',
		eyebrow: 'Thread view',
		summary: 'View a post and its conversation thread.',
		requiresAuth: false,
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
	const route = normalizeRoutePath(pathname);
	switch (route) {
		case '/':
			return PAGE_DEFINITIONS.dashboard;
		case '/drones':
			return PAGE_DEFINITIONS.drones;
		case '/souls':
			return PAGE_DEFINITIONS.souls;
		case '/souls/genesis':
			return PAGE_DEFINITIONS.genesis;
		case '/approvals':
			return PAGE_DEFINITIONS.approvals;
		case '/identity':
			return PAGE_DEFINITIONS.identity;
		case '/timeline':
			return PAGE_DEFINITIONS.timeline;
		case '/conversations':
			return PAGE_DEFINITIONS.conversations;
		case '/notifications':
			return PAGE_DEFINITIONS.notifications;
		case '/explore':
			return PAGE_DEFINITIONS.explore;
		case '/profile':
			return PAGE_DEFINITIONS.profile;
		case '/auth/callback':
			return PAGE_DEFINITIONS['auth-callback'];
		default:
			if (route.startsWith('/conversations/compose/')) return PAGE_DEFINITIONS.conversations;
			if (route.startsWith('/identity/')) return PAGE_DEFINITIONS.identity;
			if (route.startsWith('/profile/')) return PAGE_DEFINITIONS.profile;
			if (route.startsWith('/status/')) return PAGE_DEFINITIONS.status;
			return PAGE_DEFINITIONS['not-found'];
	}
}

export function resolveProfileIdentifier(pathname: string): string | null {
	const route = normalizeRoutePath(pathname);
	if (!route.startsWith('/profile/')) return null;

	const identifier = route.slice('/profile/'.length).trim();
	if (!identifier) return null;

	try {
		return decodeURIComponent(identifier) || null;
	} catch {
		return identifier;
	}
}

export function resolveProfileActorId(query: Query | URLSearchParams | undefined): string | null {
	return firstQueryValue(query, 'id');
}

export function resolveStatusId(pathname: string): string | null {
	const route = normalizeRoutePath(pathname);
	if (!route.startsWith('/status/')) return null;
	const id = route.slice('/status/'.length);
	return id.trim() || null;
}

export function resolveConversationComposeActorId(pathname: string): string | null {
	// Conversation creation is a state-changing operation and must not be triggered by
	// merely visiting a crafted URL. Keep legacy compose URLs on the conversations page
	// without passing a target actor into the auto-bootstrap path.
	void pathname;
	return null;
}

export function getPageHref(key: AppPageKey, agentHint?: string | null): string {
	const page = PAGE_DEFINITIONS[key];
	const trimmedAgent = agentHint?.trim();
	if (trimmedAgent && key === 'identity') {
		return `${FACETHEORY_BASE_PATH}/identity/${encodeURIComponent(trimmedAgent)}`;
	}
	return `${FACETHEORY_BASE_PATH}${page.path}`;
}

export function buildConversationComposeHref(actorId: string): string {
	void actorId;
	return `${FACETHEORY_BASE_PATH}/conversations`;
}

export function resolveWindowPage(): AppPageDescriptor {
	if (typeof window === 'undefined') {
		return PAGE_DEFINITIONS.dashboard;
	}
	return resolvePage(window.location.pathname);
}

export function resolveIdentityAgentHint(pathname: string): string | null {
	const route = normalizeRoutePath(pathname);
	if (!route.startsWith('/identity/')) return null;
	const segment = route.slice('/identity/'.length).trim();
	if (!segment) return null;
	try {
		return decodeURIComponent(segment) || null;
	} catch {
		return segment;
	}
}

export function resolveWindowAgentHint(): string | null {
	if (typeof window === 'undefined') return null;
	const fromPath = resolveIdentityAgentHint(window.location.pathname);
	return fromPath;
}
