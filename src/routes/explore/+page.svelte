<script lang="ts">
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import type { Status } from '$lib/types';
	import TimelineVirtualizedReactive from '$lib/components/TimelineVirtualizedReactive.svelte';

	type Feed = 'local' | 'public';
	let feed = $state<Feed>('local');

	let items = $state<Status[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	function setFeed(next: Feed) {
		if (feed === next) return;
		feed = next;
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		items = [];
		error = null;
		isLoading = false;

		if (!token) return;

		const controller = new AbortController();
		isLoading = true;

		void (async () => {
			try {
				const timeline =
					feed === 'local'
						? await api.fetchLocalTimeline({ signal: controller.signal })
						: await api.fetchPublicTimeline({ signal: controller.signal });
				items = timeline.items;
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				error = err instanceof Error ? err.message : String(err);
			} finally {
				isLoading = false;
			}
		})();

		return () => controller.abort();
	});
</script>

<svelte:head>
	<title>Explore • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Explore</h1>

	{#if !$authSession}
		<p>Sign in to explore local and public timelines.</p>
	{:else}
		<div class="tabs" role="tablist" aria-label="Explore timelines">
			<button
				type="button"
				class={`tabs__tab ${feed === 'local' ? 'is-active' : ''}`}
				role="tab"
				aria-selected={feed === 'local'}
				onclick={() => setFeed('local')}
			>
				Local
			</button>
			<button
				type="button"
				class={`tabs__tab ${feed === 'public' ? 'is-active' : ''}`}
				role="tab"
				aria-selected={feed === 'public'}
				onclick={() => setFeed('public')}
			>
				Public
			</button>
		</div>

		{#if error}
			<div class="page__notice page__notice--error" role="alert">{error}</div>
		{/if}

		{#if isLoading}
			<div class="page__notice">Loading timeline…</div>
		{:else}
			<TimelineVirtualizedReactive {items} />
		{/if}
	{/if}
</section>
