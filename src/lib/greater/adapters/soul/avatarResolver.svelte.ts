/**
 * Resolves on-chain soul avatars for agent accounts.
 * Fetches from the lesser-host public API and caches results in memory.
 */

import type { Status } from '$lib/types';

const avatarCache = new Map<string, string | null>();
const usernameToAgentId = new Map<string, string>();
const pendingFetches = new Map<string, Promise<string | null>>();

let lesserHostBaseUrl: string | null = null;

interface RegistrationCycle {
	ready: Promise<void>;
	resolve: () => void;
	completed: boolean;
}

function createRegistrationCycle(completed = false): RegistrationCycle {
	let resolve = () => {};

	if (completed) {
		return {
			ready: Promise.resolve(),
			resolve,
			completed: true,
		};
	}

	const ready = new Promise<void>((readyResolve) => {
		resolve = readyResolve;
	});

	return {
		ready,
		resolve,
		completed: false,
	};
}

let registrationCycle = createRegistrationCycle(true);

export function setSoulAvatarBaseUrl(baseUrl: string | null) {
	lesserHostBaseUrl = baseUrl;
}

export function beginSoulRegistration() {
	usernameToAgentId.clear();
	registrationCycle = createRegistrationCycle();
}

export function registerSoulAgent(username: string, agentId: string) {
	usernameToAgentId.set(username.toLowerCase(), agentId.toLowerCase());
}

export function registerSoulAgents(agents: ReadonlyArray<{ username: string; agentId: string }>) {
	for (const a of agents) registerSoulAgent(a.username, a.agentId);
}

export function markRegistrationComplete() {
	if (registrationCycle.completed) return;
	registrationCycle.completed = true;
	registrationCycle.resolve();
}

export function waitForSoulRegistration(): Promise<void> {
	return registrationCycle.ready;
}

async function fetchSoulAvatar(agentId: string): Promise<string | null> {
	if (!lesserHostBaseUrl || !agentId.trim()) return null;

	const key = agentId.toLowerCase();
	if (avatarCache.has(key)) return avatarCache.get(key) ?? null;
	if (pendingFetches.has(key)) return pendingFetches.get(key)!;

	const promise = (async () => {
		try {
			const url = `${lesserHostBaseUrl}/api/v1/soul/agents/${encodeURIComponent(key)}`;
			const resp = await fetch(url);
			if (!resp.ok) {
				avatarCache.set(key, null);
				return null;
			}
			const data = (await resp.json()) as { agent?: { avatar?: { image?: string } } };
			const image = data?.agent?.avatar?.image?.trim() || null;
			avatarCache.set(key, image);
			return image;
		} catch {
			avatarCache.set(key, null);
			return null;
		} finally {
			pendingFetches.delete(key);
		}
	})();

	pendingFetches.set(key, promise);
	return promise;
}

export async function resolveSoulAvatarByUsername(username: string): Promise<string | null> {
	await waitForSoulRegistration();
	const agentId = usernameToAgentId.get(username.toLowerCase());
	if (!agentId) return null;
	return fetchSoulAvatar(agentId);
}

function getStatusAccount(status: Status) {
	return status.reblog?.account || status.account;
}

export async function applySoulAvatarsToStatuses(statuses: Status[]): Promise<Status[]> {
	await waitForSoulRegistration();

	const usernames = [
		...new Set(
			statuses
				.map(getStatusAccount)
				.filter((account) => !account.avatar && account.username)
				.map((account) => account.username)
		),
	];

	if (usernames.length === 0) {
		return statuses;
	}

	const avatarMap = new Map<string, string>();
	await Promise.all(
		usernames.map(async (username) => {
			const image = await resolveSoulAvatarByUsername(username);
			if (image) {
				avatarMap.set(username, image);
			}
		})
	);

	if (avatarMap.size === 0) {
		return statuses;
	}

	for (const status of statuses) {
		const account = getStatusAccount(status);
		const image = avatarMap.get(account.username);
		if (image && !account.avatar) {
			account.avatar = image;
		}
	}

	return statuses;
}

export function getCachedSoulAvatar(username: string): string | null {
	const agentId = usernameToAgentId.get(username.toLowerCase());
	if (!agentId) return null;
	return avatarCache.get(agentId.toLowerCase()) ?? null;
}
