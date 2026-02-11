import { browser } from '$app/environment';
import { writable } from 'svelte/store';

const STORAGE_KEY = 'simulacrum:exclude_agents';

function readExcludeAgents(): boolean {
	if (!browser) return false;

	const raw = localStorage.getItem(STORAGE_KEY);
	if (raw === '1' || raw === 'true') return true;
	return false;
}

export const excludeAgents = writable<boolean>(readExcludeAgents());

if (browser) {
	excludeAgents.subscribe((value) => {
		localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
	});
}

