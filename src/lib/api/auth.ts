import { browser } from '$app/environment';
import { authSession, initAuthFromStorage } from '$lib/auth/session';
import { get } from 'svelte/store';

export function getAccessToken(): string | null {
	if (!browser) return null;

	const current = get(authSession);
	if (current?.accessToken) return current.accessToken;

	// Ensure we hydrate the store for first paint routes where the layout onMount hasn't run yet.
	initAuthFromStorage();
	return get(authSession)?.accessToken ?? null;
}

