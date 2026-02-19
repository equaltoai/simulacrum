<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import ContentRenderer from '$lib/components/ContentRenderer.svelte';
	import TimelineVirtualizedReactive from '$lib/components/TimelineVirtualizedReactive.svelte';
	import TipButton from '$lib/components/Tips/TipButton.svelte';
	import ModerationTools from '$lib/patterns/ModerationTools.svelte';
	import type { Account, Status } from '$lib/types';
	import { toActivityPubActor } from '$lib/utils/activitypub';
	import AvatarImage from '$lib/components/AvatarImage.svelte';
	import { getStreamingAdapter } from '$lib/realtime/adapter';
	import { CreateConversationDocument } from '$lib/greater/adapters/graphql/generated/types';

	let account = $state<Account | null>(null);
	let items = $state<Status[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let viewerId = $state<string | null>(null);
	let relationship = $state<{ following?: boolean | null; requested?: boolean | null } | null>(null);
	let relationshipError = $state<string | null>(null);
	let relationshipLoading = $state(false);
	let followError = $state<string | null>(null);
	let followLoading = $state(false);
	let dmError = $state<string | null>(null);
	let dmLoading = $state(false);
	let trustEdges = $state<Array<{ category: string; score: number; updatedAt: string; from: Account; to: Account }>>(
		[]
	);
	let trustLoading = $state(false);
	let trustError = $state<string | null>(null);

	const canFollow = $derived(Boolean(account && viewerId && account.id !== viewerId));
	const isFollowing = $derived(Boolean(relationship?.following || relationship?.requested));

	async function handleMessage() {
		const token = $authSession?.accessToken ?? null;
		if (!token || !account) return;
		if (!canFollow) return;

		dmLoading = true;
		dmError = null;

		try {
			const adapter = getStreamingAdapter(token);
			if (!adapter) throw new Error('GraphQL adapter unavailable');

			const data = await adapter.mutate(CreateConversationDocument, {
				participantId: account.id,
			});

			await goto(`${base}/conversations/${encodeURIComponent(data.createConversation.id)}`);
		} catch (err) {
			dmError = err instanceof Error ? err.message : String(err);
		} finally {
			dmLoading = false;
		}
	}

	async function refreshRelationship(targetId: string, token: string) {
		relationshipLoading = true;
		relationshipError = null;
		try {
			const adapter = getStreamingAdapter(token);
			if (!adapter) {
				relationship = null;
				return;
			}
			relationship = (await adapter.getRelationship(targetId)) ?? null;
		} catch (err) {
			relationshipError = err instanceof Error ? err.message : String(err);
		} finally {
			relationshipLoading = false;
		}
	}

	async function toggleFollow() {
		const token = $authSession?.accessToken ?? null;
		if (!token || !account) return;
		if (!canFollow) return;

		followLoading = true;
		followError = null;

		try {
			const adapter = getStreamingAdapter(token);
			if (!adapter) throw new Error('GraphQL adapter unavailable');

			const wasFollowing = Boolean(relationship?.following || relationship?.requested);
			if (wasFollowing) {
				await adapter.unfollowActor(account.id);
				account = { ...account, followersCount: Math.max(0, (account.followersCount ?? 0) - 1) };
			} else {
				await adapter.followActor(account.id);
				account = { ...account, followersCount: (account.followersCount ?? 0) + 1 };
			}

			await refreshRelationship(account.id, token);
		} catch (err) {
			followError = err instanceof Error ? err.message : String(err);
		} finally {
			followLoading = false;
		}
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		const acct = $page.params.acct;

		account = null;
		items = [];
		error = null;
		isLoading = false;
		viewerId = null;
		relationship = null;
		relationshipError = null;
		relationshipLoading = false;
		followError = null;
		followLoading = false;
		dmError = null;
		dmLoading = false;
		trustEdges = [];
		trustLoading = false;
		trustError = null;

		if (!token || !acct) return;

		const controller = new AbortController();
		isLoading = true;

			void (async () => {
				try {
					const viewer = await api.fetchViewer({ signal: controller.signal });
					viewerId = viewer.id;

					const actor = await api.fetchActorProfile({ username: acct, signal: controller.signal });

					account = actor;
					void refreshRelationship(actor.id, token);

					const [timeline] = await Promise.all([
						api.fetchActorTimeline({ actorId: actor.id, signal: controller.signal }),
						(async () => {
						trustLoading = true;
						trustError = null;
						try {
							trustEdges = await api.fetchTrustGraph({ actorId: actor.id, signal: controller.signal });
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
	<title>{$page.params.acct} • Profile • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Profile</h1>

	<p class="page__meta">
		<a href={`${base}/profile`}>Back to your profile</a>
	</p>

	{#if !$authSession}
		<p>Sign in to load profiles.</p>
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

					<div class="profile-card__actions" aria-label="Account moderation">
					{#if canFollow}
						<button
							type="button"
							class={`gr-button ${isFollowing ? 'gr-button--outline' : 'gr-button--solid'}`}
								disabled={followLoading || relationshipLoading}
								onclick={toggleFollow}
						>
								{#if followLoading}
									…
								{:else if relationship?.requested}
									Requested
								{:else if relationship?.following}
									Following
								{:else}
									Follow
								{/if}
							</button>
							<button
								type="button"
								class="gr-button gr-button--outline"
								disabled={dmLoading}
								onclick={handleMessage}
							>
								{dmLoading ? 'Starting…' : 'Message'}
							</button>
						{/if}

						{#if account.tipAddress}
							<TipButton recipient={account} mode="button" label="Tip" />
						{/if}
							<ModerationTools
								targetType="account"
								targetId={account.id}
								targetAccount={toActivityPubActor(account)}
								config={{ actions: ['report', 'mute', 'block'], mode: 'menu' }}
								disabled={!$authSession?.accessToken}
								handlers={{
									onReport: async (_targetType, _targetId, reason) => {
										await api.flagObject({ input: { objectId: account!.id, reason } });
								},
								onBlock: async () => {
									await api.blockActor({ id: account!.id });
								},
								onMute: async () => {
									await api.muteActor({ id: account!.id });
								},
							}}
						/>
					</div>

					{#if followError || relationshipError}
						<div class="page__notice page__notice--error" role="alert">
							{followError || relationshipError}
						</div>
					{/if}
					{#if dmError}
						<div class="page__notice page__notice--error" role="alert">
							{dmError}
						</div>
					{/if}

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
			<TimelineVirtualizedReactive {items} />
		{/if}
	{/if}
</section>
