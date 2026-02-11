<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { api, type HashtagInfo } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import TimelineVirtualizedReactive from '$lib/components/TimelineVirtualizedReactive.svelte';
	import type { Status } from '$lib/types';
	import type { NotificationLevel } from '$lib/greater/adapters/graphql';

	const hashtag = $derived(decodeURIComponent($page.params.tag ?? ''));

	let info = $state<HashtagInfo | null>(null);
	let items = $state<Status[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	let notifyLevel = $state<NotificationLevel>('ALL');
	let isUpdating = $state(false);
	let actionError = $state<string | null>(null);

	function hydrateNotifyLevel(next: HashtagInfo | null) {
		if (!next) return;
		notifyLevel = next.notificationSettings?.level ?? 'ALL';
	}

	async function refresh(signal?: AbortSignal) {
		const [nextInfo, timeline] = await Promise.all([
			api.fetchHashtag({ name: hashtag, signal }),
			api.fetchHashtagTimeline({ hashtag, signal }),
		]);

		if (!nextInfo) {
			throw new Error('Hashtag not found.');
		}

		info = nextInfo;
		items = timeline.items;
		hydrateNotifyLevel(nextInfo);
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		info = null;
		items = [];
		isLoading = false;
		error = null;
		actionError = null;

		if (!token || !hashtag) return;

		const controller = new AbortController();
		isLoading = true;

		void (async () => {
			try {
				await refresh(controller.signal);
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				error = err instanceof Error ? err.message : String(err);
			} finally {
				isLoading = false;
			}
		})();

		return () => controller.abort();
	});

	async function runAction(action: () => Promise<unknown>) {
		if (isUpdating) return;
		actionError = null;
		isUpdating = true;
		try {
			await action();
			await refresh();
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isUpdating = false;
		}
	}

	function isMuted(current: HashtagInfo | null): boolean {
		return current?.notificationSettings?.muted === true;
	}

	async function handleFollow() {
		await runAction(() => api.followHashtag({ hashtag, notifyLevel }));
	}

	async function handleUnfollow() {
		await runAction(() => api.unfollowHashtag({ hashtag }));
	}

	async function handleMute() {
		await runAction(() => api.muteHashtag({ hashtag }));
	}

	async function handleUnmute() {
		await runAction(() => api.unmuteHashtag({ hashtag, level: notifyLevel }));
	}

	async function handleSaveNotifications() {
		const currentInfo = info;
		if (!currentInfo) return;
		await runAction(() =>
			api.updateHashtagNotifications({
				hashtag,
				settings: {
					level: notifyLevel,
					muted: currentInfo.notificationSettings?.muted ?? false,
					mutedUntil: currentInfo.notificationSettings?.mutedUntil ?? null,
				},
			})
		);
	}

	function tagHref(name: string) {
		return `${base}/tags/${encodeURIComponent(name)}`;
	}
</script>

<svelte:head>
	<title>#{hashtag} • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>#{hashtag}</h1>

	<p class="page__meta">
		<a href={`${base}/explore`}>Back to Explore</a>
	</p>

	{#if !$authSession}
		<p>Sign in to view hashtag timelines.</p>
	{:else if isLoading}
		<div class="page__notice">Loading hashtag…</div>
	{:else if error}
		<div class="page__notice page__notice--error" role="alert">{error}</div>
	{:else if info}
		<section class="page__notice">
			<div class="hashtag-header">
				<div class="hashtag-header__stats">
					<span>
						<strong>{info.postCount}</strong> posts
					</span>
					<span>
						<strong>{info.followerCount}</strong> followers
					</span>
				</div>

				<div class="hashtag-header__actions">
					<label class="settings-field settings-field--inline">
						<span class="settings-field__label">Notify</span>
						<select class="settings-field__select" bind:value={notifyLevel} disabled={isUpdating}>
							<option value="ALL">All</option>
							<option value="FOLLOWING">Following</option>
							<option value="MUTUALS">Mutuals</option>
							<option value="NONE">None</option>
						</select>
					</label>

					{#if info.isFollowing}
						<button
							type="button"
							class="gr-button gr-button--outline"
							onclick={handleUnfollow}
							disabled={isUpdating}
						>
							Unfollow
						</button>

						<button
							type="button"
							class="gr-button gr-button--outline"
							onclick={handleSaveNotifications}
							disabled={isUpdating}
						>
							Save notifications
						</button>

						{#if isMuted(info)}
							<button
								type="button"
								class="gr-button gr-button--outline"
								onclick={handleUnmute}
								disabled={isUpdating}
							>
								Unmute
							</button>
						{:else}
							<button
								type="button"
								class="gr-button gr-button--outline"
								onclick={handleMute}
								disabled={isUpdating}
							>
								Mute
							</button>
						{/if}
					{:else}
						<button
							type="button"
							class="gr-button gr-button--solid"
							onclick={handleFollow}
							disabled={isUpdating}
						>
							Follow
						</button>
					{/if}
				</div>
			</div>

			{#if actionError}
				<div class="page__notice page__notice--error" role="alert">{actionError}</div>
			{/if}

			{#if info.relatedHashtags.length > 0}
				<div class="hashtag-related">
					<strong>Related</strong>
					<div class="hashtag-related__list">
						{#each info.relatedHashtags as related (related.name)}
							<a class="hashtag-related__tag" href={tagHref(related.name)}>#{related.name}</a>
						{/each}
					</div>
				</div>
			{/if}
		</section>

		{#if items.length === 0}
			<div class="page__notice">No posts yet.</div>
		{:else}
			<TimelineVirtualizedReactive items={items} />
		{/if}
	{/if}
</section>
