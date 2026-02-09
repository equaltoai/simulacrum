<script lang="ts">
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import type { Account, Status } from '$lib/types';
	import TimelineVirtualizedReactive from '$lib/components/TimelineVirtualizedReactive.svelte';

	let viewer = $state<Account | null>(null);
	let items = $state<Status[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		viewer = null;
		items = [];
		error = null;
		isLoading = false;

		if (!token) {
			return;
		}

		const controller = new AbortController();
		isLoading = true;

		void (async () => {
			try {
				const [viewerData, timeline] = await Promise.all([
					api.fetchViewer({ signal: controller.signal }),
					api.fetchHomeTimeline({ signal: controller.signal }),
				]);

				viewer = viewerData;
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
	<title>Home • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Home</h1>

	{#if !$authSession}
		<p>Sign in to load your home timeline.</p>
	{:else}
		{#if viewer}
			<p class="page__meta">
				Signed in as <strong>{viewer.displayName || viewer.username}</strong>
				<span class="page__handle">@{viewer.acct}</span>
			</p>
		{/if}

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
