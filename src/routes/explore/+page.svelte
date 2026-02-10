<script lang="ts">
	import { base } from '$app/paths';
	import { api } from '$lib/api';
	import { toStatus } from '$lib/api/adapters';
	import { authSession } from '$lib/auth/session';
	import type { Status } from '$lib/types';
	import TimelineVirtualizedReactive from '$lib/components/TimelineVirtualizedReactive.svelte';
	import type { FollowedHashtag, TrendingLink, TrendingStatus, TrendingTag } from '$lib/api';
	import { getStreamingAdapter } from '$lib/realtime/adapter';

	type Feed = 'local' | 'public';
	let feed = $state<Feed>('local');

	let items = $state<Status[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let realtimeError = $state<string | null>(null);

	function prependUnique(status: Status) {
		items = [status, ...items.filter((item) => item.id !== status.id)].slice(0, 200);
	}

	let trends = $state<{ tags: TrendingTag[]; links: TrendingLink[]; statuses: TrendingStatus[] } | null>(
		null
	);
	let followedHashtags = $state<FollowedHashtag[]>([]);
	let trendsLoading = $state(false);
	let trendsError = $state<string | null>(null);

	function setFeed(next: Feed) {
		if (feed === next) return;
		feed = next;
	}

	function tagHref(name: string) {
		return `${base}/tags/${encodeURIComponent(name)}`;
	}

	function statusHref(id: string) {
		return `${base}/status/${encodeURIComponent(id)}`;
	}

	function stripHtml(html: string): string {
		if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, '').trim();
		const container = document.createElement('div');
		container.innerHTML = html;
		return (container.textContent ?? '').trim();
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		items = [];
		error = null;
		isLoading = false;
		realtimeError = null;

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

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		realtimeError = null;

		if (!token) return;

		const adapter = getStreamingAdapter(token);
		if (!adapter) return;

		const type = feed === 'local' ? 'LOCAL' : 'PUBLIC';

		const subscription = adapter
			.subscribeToTimelineUpdates({ type })
			.subscribe({
				next: (result) => {
					const object = result.data?.timelineUpdates;
					if (!object) return;
					prependUnique(toStatus(object));
				},
				error: (err) => {
					console.warn('Explore timeline updates subscription failed:', err);
					realtimeError = 'Realtime updates are currently unavailable.';
				},
			});

		return () => subscription.unsubscribe();
	});

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		trends = null;
		followedHashtags = [];
		trendsError = null;
		trendsLoading = false;

		if (!token) return;

		const controller = new AbortController();
		trendsLoading = true;

		void (async () => {
			try {
				const [nextTrends, nextFollowed] = await Promise.all([
					api.fetchTrends({ limit: 10, signal: controller.signal }),
					api.fetchFollowedHashtags({ first: 50, signal: controller.signal }),
				]);

				trends = nextTrends;
				followedHashtags = nextFollowed;
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				trendsError = err instanceof Error ? err.message : String(err);
			} finally {
				trendsLoading = false;
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
		<p>Sign in to explore timelines, trends, and followed hashtags.</p>
	{:else}
		<section class="page__notice explore-discovery">
			<div class="explore-discovery__links">
				<a class="gr-button gr-button--outline" href={`${base}/search`}>Search</a>
				<a class="gr-button gr-button--outline" href={`${base}/lists`}>Lists</a>
			</div>

			{#if trendsError}
				<div class="page__notice page__notice--error" role="alert">{trendsError}</div>
			{:else if trendsLoading}
				<p>Loading trends…</p>
			{:else if trends}
				<div class="explore-trends">
					<div class="explore-trends__section">
						<strong>Trending hashtags</strong>
						{#if trends.tags.length === 0}
							<p>No trending hashtags.</p>
						{:else}
							<ul class="explore-trends__list">
								{#each trends.tags as tag (tag.name)}
									<li>
										<a href={tagHref(tag.name)}>#{tag.name}</a>
										<span class="explore-trends__meta">{tag.uses} uses</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>

					<div class="explore-trends__section">
						<strong>Trending links</strong>
						{#if trends.links.length === 0}
							<p>No trending links.</p>
						{:else}
							<ul class="explore-trends__list">
								{#each trends.links as link (link.url)}
									<li>
										<a href={link.url} target="_blank" rel="noreferrer noopener">{link.title}</a>
										<span class="explore-trends__meta">{link.shares} shares</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>

					<div class="explore-trends__section">
						<strong>Trending posts</strong>
						{#if trends.statuses.length === 0}
							<p>No trending posts.</p>
						{:else}
							<ul class="explore-trends__list">
								{#each trends.statuses as status (status.id)}
									<li>
										<a href={statusHref(status.id)}>{stripHtml(status.content).slice(0, 80) || 'View post'}</a>
										<span class="explore-trends__meta">{status.engagements} engagements</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>
			{/if}
		</section>

		<section class="page__notice">
			<strong>Followed hashtags</strong>
			{#if followedHashtags.length === 0}
				<p>No followed hashtags yet.</p>
			{:else}
				<ul class="followed-hashtags">
					{#each followedHashtags as tag (tag.name)}
						<li>
							<a href={tagHref(tag.name)}>#{tag.name}</a>
							{#if tag.notificationSettings?.muted}
								<span class="followed-hashtags__meta">muted</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>

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
