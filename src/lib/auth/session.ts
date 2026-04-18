import { browser } from '$app/environment';
import { base } from '$app/paths';
import { writable } from 'svelte/store';
import { createPkcePair, generateRandomString } from './pkce';

export const DEFAULT_OAUTH_SCOPE = 'read write follow';
const PUBLIC_TOKEN_ENDPOINT_AUTH_METHOD: TokenEndpointAuthMethod = 'none';

type TokenEndpointAuthMethod = 'client_secret_post' | 'client_secret_basic' | 'none';

type StoredOAuthClient = {
	clientId: string;
	redirectUri: string;
	scope: string;
	createdAt: number;
	tokenEndpointAuthMethod: TokenEndpointAuthMethod;
};

export type AuthSession = {
	accessToken: string;
	tokenType: string;
	scope?: string;
	refreshToken?: string;
	createdAt: number;
	expiresIn: number;
	expiresAt: number;
};

const STORAGE_KEYS = {
	session: 'simulacrum:auth_session',
	oauthClient: 'simulacrum:oauth_client',
	oauthState: 'simulacrum:oauth_state',
	oauthVerifier: 'simulacrum:oauth_verifier',
	oauthScope: 'simulacrum:oauth_scope',
	oauthReturnTo: 'simulacrum:oauth_return_to',
	oauthResource: 'simulacrum:oauth_resource',
} as const;

export const authSession = writable<AuthSession | null>(null);

function normalizeScopeValue(scope: string): string {
	return scope
		.split(/\s+/)
		.map((part) => part.trim())
		.filter(Boolean)
		.sort()
		.join(' ');
}

function storedClientCoversScope(client: StoredOAuthClient, requestedScope?: string): boolean {
	if (!requestedScope) return true;

	const requested = normalizeScopeValue(requestedScope);
	const registered = normalizeScopeValue(client.scope);
	if (!requested || !registered) return false;

	const registeredScopes = new Set(registered.split(' '));
	return requested.split(' ').every((scope) => registeredScopes.has(scope));
}

function decodeBase64Url(value: string): string {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

	if (typeof globalThis.atob === 'function') {
		return globalThis.atob(padded);
	}

	throw new Error('Base64 decoding is not available in this environment');
}

function scopeFromAccessToken(accessToken: string): string | null {
	const parts = accessToken.split('.');
	if (parts.length < 2) return null;

	try {
		const payloadJson = decodeBase64Url(parts[1]);
		const payload = JSON.parse(payloadJson) as unknown;
		if (!payload || typeof payload !== 'object') return null;

		const scopesValue = (payload as { scopes?: unknown }).scopes;
		if (Array.isArray(scopesValue) && scopesValue.every((entry) => typeof entry === 'string')) {
			return scopesValue.join(' ');
		}

		const scopeValue = (payload as { scope?: unknown }).scope;
		if (typeof scopeValue === 'string' && scopeValue.trim()) {
			return scopeValue.trim();
		}

		return null;
	} catch {
		return null;
	}
}

function normalizeAuthSession(session: AuthSession): AuthSession {
	const derivedScope = scopeFromAccessToken(session.accessToken);
	if (!derivedScope || derivedScope === session.scope) return session;
	return { ...session, scope: derivedScope };
}

function readSessionFromStorage(): AuthSession | null {
	if (!browser) return null;

	const raw = sessionStorage.getItem(STORAGE_KEYS.session);
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as AuthSession;
		if (!parsed?.accessToken || !parsed?.tokenType || !parsed?.expiresAt) return null;
		if (Date.now() >= parsed.expiresAt) return null;
		return normalizeAuthSession(parsed);
	} catch {
		return null;
	}
}

export function initAuthFromStorage() {
	if (!browser) return;

	const session = readSessionFromStorage();
	if (session) authSession.set(session);
}

export function clearAuthSession() {
	if (!browser) return;

	sessionStorage.removeItem(STORAGE_KEYS.session);
	authSession.set(null);
}

function writeSessionToStorage(session: AuthSession) {
	if (!browser) return;

	const normalized = normalizeAuthSession(session);
	authSession.set(normalized);
	sessionStorage.setItem(STORAGE_KEYS.session, JSON.stringify(normalized));
}

function getRedirectUri() {
	if (!browser) throw new Error('OAuth redirect_uri is only available in the browser');
	return `${window.location.origin}${base}/auth/callback`;
}

async function registerOAuthClient({
	redirectUri,
	scope,
}: {
	redirectUri: string;
	scope: string;
}): Promise<StoredOAuthClient> {
	const body = new URLSearchParams({
		client_name: 'Simulacrum',
		redirect_uris: redirectUri,
		scopes: scope,
		token_endpoint_auth_method: PUBLIC_TOKEN_ENDPOINT_AUTH_METHOD,
		website: window.location.origin,
	});

	const response = await fetch('/api/v1/apps', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body,
	});

	const data = (await response.json().catch(() => null)) as
		| { client_id: string; token_endpoint_auth_method?: TokenEndpointAuthMethod }
		| { error?: string; error_description?: string }
		| null;

	if (!response.ok || !data || !('client_id' in data)) {
		const message =
			(typeof data === 'object' &&
			data &&
			'error_description' in data &&
			typeof data.error_description === 'string'
				? data.error_description
				: null) ?? `OAuth app registration failed (${response.status})`;
		throw new Error(message);
	}

	const client: StoredOAuthClient = {
		clientId: data.client_id,
		redirectUri,
		scope,
		createdAt: Date.now(),
		tokenEndpointAuthMethod: data.token_endpoint_auth_method ?? PUBLIC_TOKEN_ENDPOINT_AUTH_METHOD,
	};

	localStorage.setItem(STORAGE_KEYS.oauthClient, JSON.stringify(client));
	return client;
}

function readOAuthClientFromStorage({
	redirectUri,
	scope,
}: {
	redirectUri: string;
	scope?: string;
}): StoredOAuthClient | null {
	if (!browser) return null;

	const raw = localStorage.getItem(STORAGE_KEYS.oauthClient);
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as Partial<
			StoredOAuthClient & { clientSecret?: unknown; tokenEndpointAuthMethod?: unknown }
		>;
		if (!parsed?.clientId || parsed.redirectUri !== redirectUri) return null;
		if (parsed.clientSecret) {
			localStorage.removeItem(STORAGE_KEYS.oauthClient);
			return null;
		}

		const authMethod =
			parsed.tokenEndpointAuthMethod === PUBLIC_TOKEN_ENDPOINT_AUTH_METHOD
				? PUBLIC_TOKEN_ENDPOINT_AUTH_METHOD
				: null;
		if (!authMethod) {
			localStorage.removeItem(STORAGE_KEYS.oauthClient);
			return null;
		}

		const storedClient: StoredOAuthClient = {
			clientId: parsed.clientId,
			redirectUri: parsed.redirectUri,
			scope:
				typeof parsed.scope === 'string' && parsed.scope.trim()
					? parsed.scope
					: DEFAULT_OAUTH_SCOPE,
			createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
			tokenEndpointAuthMethod: authMethod,
		};

		if (!storedClientCoversScope(storedClient, scope)) return null;
		return storedClient;
	} catch {
		localStorage.removeItem(STORAGE_KEYS.oauthClient);
		return null;
	}
}

async function ensureOAuthClient({
	redirectUri,
	scope,
}: {
	redirectUri: string;
	scope?: string;
}): Promise<StoredOAuthClient> {
	if (!browser) throw new Error('OAuth client config is only available in the browser');

	const envClientId = import.meta.env.VITE_PUBLIC_OAUTH_CLIENT_ID as string | undefined;

	if (envClientId) {
		return {
			clientId: envClientId,
			redirectUri,
			scope: scope ?? DEFAULT_OAUTH_SCOPE,
			createdAt: 0,
			tokenEndpointAuthMethod: PUBLIC_TOKEN_ENDPOINT_AUTH_METHOD,
		};
	}

	const storedClient = readOAuthClientFromStorage({ redirectUri, scope });
	if (storedClient) return storedClient;

	return registerOAuthClient({ redirectUri, scope: scope ?? DEFAULT_OAUTH_SCOPE });
}

export async function startOAuthLogin({
	scope = DEFAULT_OAUTH_SCOPE,
	returnTo,
	resource,
}: {
	scope?: string;
	returnTo?: string;
	resource?: string;
} = {}) {
	if (!browser) return;

	const redirectUri = getRedirectUri();
	const client = await ensureOAuthClient({ redirectUri, scope });
	const state = generateRandomString(16);
	const { codeVerifier, codeChallenge } = await createPkcePair();

	sessionStorage.setItem(STORAGE_KEYS.oauthState, state);
	sessionStorage.setItem(STORAGE_KEYS.oauthVerifier, codeVerifier);
	sessionStorage.removeItem(STORAGE_KEYS.oauthScope);
	sessionStorage.setItem(
		STORAGE_KEYS.oauthReturnTo,
		returnTo ?? `${window.location.pathname}${window.location.search}${window.location.hash}`
	);

	if (resource) {
		sessionStorage.setItem(STORAGE_KEYS.oauthResource, resource);
	} else {
		sessionStorage.removeItem(STORAGE_KEYS.oauthResource);
	}

	const loginParams = new URLSearchParams({
		client_id: client.clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope,
		state,
		code_challenge: codeChallenge,
		code_challenge_method: 'S256',
	});

	if (resource) {
		loginParams.set('resource', resource);
	}

	window.location.assign(`/auth/login?${loginParams.toString()}`);
}

export async function completeOAuthCallback(searchParams: URLSearchParams) {
	if (!browser) {
		return { ok: false as const, error: 'OAuth callback must run in the browser' };
	}

	const oauthError = searchParams.get('error');
	if (oauthError) {
		return {
			ok: false as const,
			error: searchParams.get('error_description') ?? oauthError,
		};
	}

	const code = searchParams.get('code');
	const state = searchParams.get('state');

	if (!code) return { ok: false as const, error: 'Missing OAuth code' };
	if (!state) return { ok: false as const, error: 'Missing OAuth state' };

	const expectedState = sessionStorage.getItem(STORAGE_KEYS.oauthState);
	const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.oauthVerifier);
	const resource = sessionStorage.getItem(STORAGE_KEYS.oauthResource);

	if (!expectedState || state !== expectedState) {
		return { ok: false as const, error: 'OAuth state mismatch. Please try again.' };
	}

	if (!codeVerifier) {
		return { ok: false as const, error: 'Missing PKCE verifier. Please try again.' };
	}

	const redirectUri = getRedirectUri();
	const client = await ensureOAuthClient({ redirectUri });

	const tokenBody = new URLSearchParams({
		grant_type: 'authorization_code',
		code,
		client_id: client.clientId,
		redirect_uri: redirectUri,
		code_verifier: codeVerifier,
	});

	if (resource) {
		tokenBody.set('resource', resource);
	}

	const tokenHeaders: Record<string, string> = {
		'content-type': 'application/x-www-form-urlencoded',
	};

	const tokenResponse = await fetch('/oauth/token', {
		method: 'POST',
		headers: tokenHeaders,
		body: tokenBody,
	});

	const tokenJson = (await tokenResponse.json().catch(() => null)) as
		| {
				access_token: string;
				token_type: string;
				scope?: string;
				refresh_token?: string;
				created_at: number;
				expires_in: number;
		  }
		| { error?: string; error_description?: string }
		| null;

	if (!tokenResponse.ok || !tokenJson || !('access_token' in tokenJson)) {
		const message =
			(typeof tokenJson === 'object' &&
			tokenJson &&
			'error_description' in tokenJson &&
			typeof tokenJson.error_description === 'string'
				? tokenJson.error_description
				: null) ?? `Token exchange failed (${tokenResponse.status})`;
		return { ok: false as const, error: message };
	}

	const createdAtMs = tokenJson.created_at * 1000;
	const expiresAt = createdAtMs + tokenJson.expires_in * 1000;

	writeSessionToStorage({
		accessToken: tokenJson.access_token,
		tokenType: tokenJson.token_type,
		scope: tokenJson.scope,
		refreshToken: tokenJson.refresh_token,
		createdAt: createdAtMs,
		expiresIn: tokenJson.expires_in,
		expiresAt,
	});

	sessionStorage.removeItem(STORAGE_KEYS.oauthState);
	sessionStorage.removeItem(STORAGE_KEYS.oauthVerifier);
	sessionStorage.removeItem(STORAGE_KEYS.oauthScope);
	sessionStorage.removeItem(STORAGE_KEYS.oauthResource);

	const returnTo = sessionStorage.getItem(STORAGE_KEYS.oauthReturnTo) ?? `${base}/`;
	sessionStorage.removeItem(STORAGE_KEYS.oauthReturnTo);

	return { ok: true as const, returnTo };
}
