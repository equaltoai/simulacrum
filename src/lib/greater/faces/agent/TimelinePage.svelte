<script lang="ts">
	import { untrack } from 'svelte';
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import { toStatus } from '$lib/api/adapters';
	import { getStreamingAdapter } from '$lib/realtime/adapter';
	import { applySoulAvatarsToStatuses } from '$lib/greater/adapters/soul/avatarResolver.svelte';
	import type { Status } from '$lib/types';
	import Composer from '$lib/components/Composer.svelte';
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
	let error = $state<string | null>(null);
	let realtimeError = $state<string | null>(null);

	function prependUnique(status: Status) {
		void applySoulAvatarsToStatuses([status]).then(([patched]) => {
			items = [patched, ...items.filter((item) => item.id !== patched.id)].slice(0, 200);
		});
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		return untrack(() => {
			if (!token) {
				items = [];
				error = null;
				isLoading = false;
				return;
			}

			const controller = new AbortController();
			isLoading = true;
			error = null;

			void (async () => {
				try {
					const timeline = await api.fetchHomeTimeline({ signal: controller.signal });
					const patched = await applySoulAvatarsToStatuses(timeline.items);
					if (!controller.signal.aborted) {
						items = patched;
						isLoading = false;
					}
				} catch (err) {
					if (err instanceof DOMException && err.name === 'AbortError') return;
					if (!controller.signal.aborted) {
						error = err instanceof Error ? err.message : String(err);
						isLoading = false;
					}
				}
			})();

			return () => controller.abort();
		});
	});

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		realtimeError = null;

		if (!token) return;

		const adapter = getStreamingAdapter(token);
		if (!adapter) return;

		const subscription = adapter
			.subscribeToTimelineUpdates({ type: 'HOME' })
			.subscribe({
				next: (result) => {
					const object = result.data?.timelineUpdates;
					if (!object) return;
					prependUnique(toStatus(object));
				},
				error: (err) => {
					console.warn('Timeline updates subscription failed:', err);
					realtimeError = 'Realtime updates are currently unavailable.';
				},
			});

		return () => subscription.unsubscribe();
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
		<div class="timeline-page">
			<Composer
				mode="post"
				onSubmitted={(status) => {
					items = [status, ...items];
				}}
			/>

			{#if error}
				<div class="timeline-page__notice timeline-page__notice--error" role="alert">{error}</div>
			{/if}

			{#if realtimeError}
				<div class="timeline-page__notice">{realtimeError}</div>
			{/if}

			{#if isLoading}
				<div class="timeline-page__notice">Loading timeline...</div>
			{:else if items.length === 0}
				<div class="timeline-page__notice">No posts yet. Follow some accounts or agents to see their posts here.</div>
			{:else}
				<TimelineVirtualizedReactive {items} />
			{/if}
		</div>
	{/snippet}
</AgentFaceFrame>

<style>
	.timeline-page {
		display: grid;
		gap: 0.75rem;
		min-width: 0;
	}

	.timeline-page__notice {
		padding: 1rem;
		border-radius: 0.75rem;
		background: rgba(255, 255, 255, 0.6);
		color: var(--gr-semantic-foreground-secondary);
	}

	.timeline-page__notice--error {
		background: color-mix(in srgb, var(--gr-color-error-100) 72%, white 28%);
		color: var(--gr-color-error-800);
	}
</style>
