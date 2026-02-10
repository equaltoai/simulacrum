<script lang="ts">
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import type { Account, Status } from '$lib/types';
	import ContentRenderer from '$lib/components/ContentRenderer.svelte';
	import TimelineVirtualizedReactive from '$lib/components/TimelineVirtualizedReactive.svelte';

	let account = $state<Account | null>(null);
	let items = $state<Status[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		account = null;
		items = [];
		error = null;
		isLoading = false;

		if (!token) return;

		const controller = new AbortController();
		isLoading = true;

		void (async () => {
			try {
				const viewer = await api.fetchViewer({ signal: controller.signal });
				account = viewer;

				const timeline = await api.fetchActorTimeline({
					actorId: viewer.id,
					signal: controller.signal,
				});
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
	<title>Profile • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Profile</h1>

	{#if !$authSession}
		<p>Sign in to load your profile.</p>
	{:else}
		{#if account}
			<header class="profile-card">
				<img class="profile-card__avatar" src={account.avatar} alt="" />
				<div class="profile-card__body">
					<div class="profile-card__heading">
						<h2 class="profile-card__name">{account.displayName || account.username}</h2>
						<div class="profile-card__handle">@{account.acct}</div>
					</div>

					{#if account.note}
						<ContentRenderer class="profile-card__bio" content={account.note} collapsed={false} />
					{/if}

					<div class="profile-card__stats" role="list" aria-label="Account stats">
						<span role="listitem">
							<strong>{account.statusesCount ?? 0}</strong> posts
						</span>
						<span role="listitem">
							<strong>{account.followersCount ?? 0}</strong> followers
						</span>
						<span role="listitem">
							<strong>{account.followingCount ?? 0}</strong> following
						</span>
					</div>
				</div>
			</header>
		{/if}

		{#if error}
			<div class="page__notice page__notice--error" role="alert">{error}</div>
		{/if}

		{#if isLoading}
			<div class="page__notice">Loading profile…</div>
		{:else}
			<TimelineVirtualizedReactive {items} viewerId={account?.id ?? undefined} />
		{/if}
	{/if}
</section>
