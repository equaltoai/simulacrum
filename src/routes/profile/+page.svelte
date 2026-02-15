<script lang="ts">
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import type { Account, Status } from '$lib/types';
	import ContentRenderer from '$lib/components/ContentRenderer.svelte';
	import TimelineVirtualizedReactive from '$lib/components/TimelineVirtualizedReactive.svelte';
	import AvatarImage from '$lib/components/AvatarImage.svelte';

	let account = $state<Account | null>(null);
	let items = $state<Status[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let trustEdges = $state<Array<{ category: string; score: number; updatedAt: string; from: Account; to: Account }>>(
		[]
	);
	let trustLoading = $state(false);
	let trustError = $state<string | null>(null);

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		account = null;
		items = [];
		error = null;
		isLoading = false;
		trustEdges = [];
		trustLoading = false;
		trustError = null;

		if (!token) return;

		const controller = new AbortController();
		isLoading = true;

		void (async () => {
			try {
				const viewer = await api.fetchViewer({ signal: controller.signal });
				account = await api.fetchActorProfile({ id: viewer.id, signal: controller.signal });

				const [timeline] = await Promise.all([
					api.fetchActorTimeline({ actorId: viewer.id, signal: controller.signal }),
					(async () => {
						trustLoading = true;
						trustError = null;
						try {
							trustEdges = await api.fetchTrustGraph({ actorId: viewer.id, signal: controller.signal });
						} catch (err) {
							if (!(err instanceof DOMException && err.name === 'AbortError')) {
								trustError = err instanceof Error ? err.message : String(err);
							}
						} finally {
							trustLoading = false;
						}
					})(),
				]);

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
				<AvatarImage class="profile-card__avatar" src={account.avatar} alt="" />
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

					<div class="profile-trust">
						<div class="profile-trust__summary">
							<strong>Trust score</strong> {Math.round(account.trustScore ?? 0)}
						</div>

						{#if account.reputation}
							<section class="profile-trust__card" aria-label="Reputation">
								<h3>Reputation</h3>
								<div class="profile-trust__grid" role="list">
									<span role="listitem"><strong>Total</strong> {account.reputation.totalScore}</span>
									<span role="listitem"><strong>Trust</strong> {account.reputation.trustScore}</span>
									<span role="listitem"><strong>Activity</strong> {account.reputation.activityScore}</span>
									<span role="listitem"><strong>Moderation</strong> {account.reputation.moderationScore}</span>
									<span role="listitem"><strong>Community</strong> {account.reputation.communityScore}</span>
									<span role="listitem">
										<strong>Vouches</strong> {account.reputation.evidence.vouchCount}
									</span>
								</div>
							</section>
						{/if}

						{#if account.vouches && account.vouches.length > 0}
							<section class="profile-trust__card" aria-label="Vouches">
								<h3>Vouches</h3>
								<ul class="profile-trust__list">
									{#each account.vouches.slice(0, 10) as vouch (vouch.id)}
										<li>
											<strong>{vouch.from.displayName || vouch.from.username}</strong> vouched with{' '}
											{Math.round(vouch.confidence * 100)}% confidence
											{#if vouch.context}
												<span class="profile-trust__muted"> — {vouch.context}</span>
											{/if}
										</li>
									{/each}
								</ul>
							</section>
						{/if}

						<section class="profile-trust__card" aria-label="Trust graph">
							<h3>Trust graph</h3>
							{#if trustError}
								<div class="page__notice page__notice--error" role="alert">{trustError}</div>
							{:else if trustLoading}
								<div class="page__notice">Loading trust graph…</div>
							{:else if trustEdges.length === 0}
								<div class="page__notice">No trust edges available.</div>
							{:else}
								<ul class="profile-trust__list">
									{#each trustEdges.slice(0, 20) as edge (edge.from.id + edge.to.id + edge.updatedAt)}
										<li>
											<strong>{edge.from.displayName || edge.from.username}</strong> →{' '}
											<strong>{edge.to.displayName || edge.to.username}</strong>
											<span class="profile-trust__muted">
												{' '}
												({edge.category}, {edge.score.toFixed(2)})
											</span>
										</li>
									{/each}
								</ul>
							{/if}
						</section>
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
