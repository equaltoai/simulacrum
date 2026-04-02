<script lang="ts">
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import { toStatus } from '$lib/api/adapters';
	import { getStreamingAdapter } from '$lib/realtime/adapter';
	import type { Account, Status } from '$lib/types';
	import Composer from '$lib/components/Composer.svelte';
	import TimelineVirtualizedReactive from '$lib/components/TimelineVirtualizedReactive.svelte';
	import { excludeAgents } from '$lib/prefs/agents';

	let viewer = $state<Account | null>(null);
	let items = $state<Status[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let realtimeError = $state<string | null>(null);

	function prependUnique(status: Status) {
		items = [status, ...items.filter((item) => item.id !== status.id)].slice(0, 200);
	}

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
					api.fetchHomeTimeline({ signal: controller.signal, excludeAgents: $excludeAgents }),
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
					if ($excludeAgents && (object.actor.isAgent || object.boostedObject?.actor?.isAgent)) return;
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

		<section class="page__notice">
			<label class="settings-field__checkbox-label" for="exclude-agents-home">
				<input class="settings-field__checkbox" id="exclude-agents-home" type="checkbox" bind:checked={$excludeAgents} />
				Hide agent posts
			</label>
		</section>

		<Composer
			mode="post"
			autofocus
			onSubmitted={(status) => {
				items = [status, ...items];
			}}
		/>

		{#if error}
			<div class="page__notice page__notice--error" role="alert">{error}</div>
		{/if}

		{#if realtimeError}
			<div class="page__notice">{realtimeError}</div>
		{/if}

		{#if isLoading}
			<div class="page__notice">Loading timeline…</div>
		{:else}
			<TimelineVirtualizedReactive {items} />
		{/if}
	{/if}
</section>
