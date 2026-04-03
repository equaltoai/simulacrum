<script lang="ts">
	import { untrack } from 'svelte';
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import { applySoulAvatarsToStatuses } from '$lib/greater/adapters/soul/avatarResolver.svelte';
	import { buildPublicStatusHref } from '$lib/publicRoutes';
	import type { Status } from '$lib/types';
	import TimelineVirtualizedReactive from '$lib/components/TimelineVirtualizedReactive.svelte';
	import AgentFaceFrame from './internal/AgentFaceFrame.svelte';
	import type { AgentFaceBaseData } from './types.js';

	interface Props {
		data: AgentFaceBaseData;
		class?: string;
	}

	let { data, class: className = '' }: Props = $props();

	let items = $state<Status[]>([]);
	let isLoading = $state(false);
	let hasLoaded = $state(false);
	let error = $state<string | null>(null);

	function handleStatusClick(status: Status) {
		if (typeof window === 'undefined') return;
		window.location.assign(buildPublicStatusHref(status.id));
	}

	$effect(() => {
		const accessToken = $authSession?.accessToken ?? null;
		void accessToken;

		return untrack(() => {
			items = [];
			error = null;
			isLoading = false;
			hasLoaded = false;

			const controller = new AbortController();
			isLoading = true;

			void (async () => {
				try {
					const timeline = await api.fetchPublicTimeline({ signal: controller.signal });
					const fetched = await applySoulAvatarsToStatuses(timeline.items);
					if (!controller.signal.aborted) {
						items = fetched;
						isLoading = false;
						hasLoaded = true;
					}
				} catch (err) {
					if (err instanceof DOMException && err.name === 'AbortError') return;
					if (!controller.signal.aborted) {
						error = err instanceof Error ? err.message : String(err);
						isLoading = false;
						hasLoaded = true;
					}
				}
			})();

			return () => controller.abort();
		});
	});
</script>

<AgentFaceFrame
	hero={data.hero}
	brand={data.brand}
	navItems={data.navItems}
	actions={data.actions}
	statusChips={data.statusChips}
	metrics={data.metrics}
	class={className}
>
	{#snippet children()}
		<div class="explore-page">
			{#if error}
				<div class="explore-page__notice explore-page__notice--error" role="alert">{error}</div>
			{/if}

			{#if isLoading || !hasLoaded}
				<div class="explore-page__notice">Loading public timeline...</div>
			{:else if items.length === 0}
				<div class="explore-page__notice">No public posts available yet.</div>
			{:else}
				<TimelineVirtualizedReactive {items} onStatusClick={handleStatusClick} />
			{/if}
		</div>
	{/snippet}
</AgentFaceFrame>

<style>
	.explore-page {
		display: grid;
		gap: 0.75rem;
		min-width: 0;
	}

	.explore-page__notice {
		padding: 1rem;
		border-radius: 0.75rem;
		background: rgba(255, 255, 255, 0.6);
		color: var(--gr-semantic-foreground-secondary);
	}

	.explore-page__notice--error {
		background: color-mix(in srgb, var(--gr-color-error-100) 72%, white 28%);
		color: var(--gr-color-error-800);
	}
</style>
