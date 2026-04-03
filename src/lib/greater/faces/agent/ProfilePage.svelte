<script lang="ts">
	import { untrack } from 'svelte';

	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import ContentRenderer from '$lib/components/ContentRenderer.svelte';
	import TimelineVirtualizedReactive from '$lib/components/TimelineVirtualizedReactive.svelte';
	import { applySoulAvatarsToStatuses } from '$lib/greater/adapters/soul/avatarResolver.svelte';
	import {
		buildPublicProfileHref,
		buildPublicStatusHref,
		normalizeProfileIdentifier,
	} from '$lib/publicRoutes';
	import type { Account, Status } from '$lib/types';

	import AgentFaceFrame from './internal/AgentFaceFrame.svelte';
	import type { AgentFaceBaseData } from './types.js';

	interface Props {
		data: AgentFaceBaseData;
		profileIdentifier?: string | null;
		profileId?: string | null;
		class?: string;
	}

	let {
		data,
		profileIdentifier = null,
		profileId = null,
		class: className = '',
	}: Props = $props();

	let account = $state<Account | null>(null);
	let items = $state<Status[]>([]);
	let isLoading = $state(false);
	let hasLoaded = $state(false);
	let error = $state<string | null>(null);

	const normalizedProfileIdentifier = $derived(normalizeProfileIdentifier(profileIdentifier));

	function resolveProfileRequest(): { id?: string; username?: string } | null {
		const id = profileId?.trim() || null;
		if (id) return { id };

		const username = normalizedProfileIdentifier;
		if (username) return { username };

		return null;
	}

	function handleStatusClick(status: Status) {
		if (typeof window === 'undefined') return;
		window.location.assign(buildPublicStatusHref(status.id));
	}

	$effect(() => {
		const accessToken = $authSession?.accessToken ?? null;
		const request = resolveProfileRequest();
		void accessToken;

		return untrack(() => {
			account = null;
			items = [];
			error = null;
			isLoading = false;
			hasLoaded = false;

			if (!request) {
				hasLoaded = true;
				return;
			}

			const controller = new AbortController();
			isLoading = true;

			void (async () => {
				try {
					const actor = await api.fetchActorProfile({
						id: request.id,
						username: request.username,
						signal: controller.signal,
					});
					const timeline = await api.fetchActorTimeline({
						actorId: actor.id,
						signal: controller.signal,
					});
					const patchedItems = await applySoulAvatarsToStatuses(timeline.items);

					if (controller.signal.aborted) return;

					account = actor;
					items = patchedItems;
					hasLoaded = true;
				} catch (err) {
					if (err instanceof DOMException && err.name === 'AbortError') return;
					error = err instanceof Error ? err.message : String(err);
					hasLoaded = true;
				} finally {
					if (!controller.signal.aborted) {
						isLoading = false;
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
		<div class="profile-page">
			{#if error}
				<div class="profile-page__notice profile-page__notice--error" role="alert">{error}</div>
			{/if}

			{#if isLoading || !hasLoaded}
				<div class="profile-page__notice">Loading profile…</div>
			{:else if account}
				<section class="profile-page__header">
					{#if account.header}
						<img
							src={account.header}
							alt=""
							class="profile-page__cover"
							loading="lazy"
						/>
					{/if}

					<div class="profile-page__identity">
						<div class="profile-page__avatar">
							{#if account.avatar}
								<img src={account.avatar} alt="" loading="lazy" width="96" height="96" />
							{:else}
								<div class="profile-page__avatar-placeholder">
									{(account.displayName || account.username || '?')[0]?.toUpperCase()}
								</div>
							{/if}
						</div>

						<div class="profile-page__summary">
							<div class="profile-page__title-row">
								<div>
									<h2>{account.displayName || account.username}</h2>
									<p class="profile-page__handle">@{account.acct}</p>
								</div>

								<a
									href={buildPublicProfileHref({
										actorId: account.id,
										acct: account.acct,
										username: account.username,
									})}
									class="profile-page__self-link"
								>
									Canonical profile link
								</a>
							</div>

							<div class="profile-page__stats" role="list" aria-label="Profile stats">
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

							{#if account.note}
								<ContentRenderer content={account.note} collapsed={false} />
							{/if}

							{#if account.fields && account.fields.length > 0}
								<dl class="profile-page__fields">
									{#each account.fields as field (`${field.name}-${field.value}`)}
										<div class="profile-page__field">
											<dt>{field.name}</dt>
											<dd>
												<ContentRenderer content={field.value} collapsed={false} />
											</dd>
										</div>
									{/each}
								</dl>
							{/if}

							<div class="profile-page__meta">
								<a href={account.url} rel="noopener noreferrer" target="_blank">
									Open ActivityPub actor
								</a>
							</div>
						</div>
					</div>
				</section>

				<section class="profile-page__timeline">
					{#if items.length === 0}
						<div class="profile-page__notice">No public posts available for this account yet.</div>
					{:else}
						<TimelineVirtualizedReactive {items} onStatusClick={handleStatusClick} />
					{/if}
				</section>
			{:else}
				<div class="profile-page__notice">Profile not found.</div>
			{/if}
		</div>
	{/snippet}
</AgentFaceFrame>

<style>
	.profile-page {
		display: grid;
		gap: 1rem;
		min-width: 0;
	}

	.profile-page__header {
		display: grid;
		gap: 1rem;
		padding: 1rem;
		border-radius: 1rem;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.94)),
			radial-gradient(circle at top left, color-mix(in srgb, var(--gr-color-primary-200) 55%, white 45%), transparent 55%);
		border: 1px solid color-mix(in srgb, var(--gr-semantic-border-subtle) 70%, transparent 30%);
	}

	.profile-page__cover {
		width: 100%;
		max-height: 14rem;
		object-fit: cover;
		border-radius: 0.875rem;
	}

	.profile-page__identity {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 1rem;
		align-items: start;
	}

	.profile-page__avatar {
		width: 6rem;
		height: 6rem;
		border-radius: 1.5rem;
		overflow: hidden;
		background: color-mix(in srgb, var(--gr-color-primary-100) 55%, white 45%);
		box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
	}

	.profile-page__avatar img,
	.profile-page__avatar-placeholder {
		width: 100%;
		height: 100%;
	}

	.profile-page__avatar img {
		display: block;
		object-fit: cover;
	}

	.profile-page__avatar-placeholder {
		display: grid;
		place-items: center;
		font-size: 2rem;
		font-weight: 700;
		color: var(--gr-color-primary-700, #8f5b11);
	}

	.profile-page__summary {
		display: grid;
		gap: 0.875rem;
		min-width: 0;
	}

	.profile-page__title-row {
		display: flex;
		gap: 1rem;
		align-items: start;
		justify-content: space-between;
		flex-wrap: wrap;
	}

	.profile-page__title-row h2 {
		margin: 0;
		font-size: clamp(1.5rem, 2vw, 2rem);
	}

	.profile-page__handle {
		margin: 0.2rem 0 0;
		color: var(--gr-semantic-foreground-secondary);
	}

	.profile-page__self-link,
	.profile-page__meta a {
		color: var(--gr-color-primary-700, #8f5b11);
		text-decoration: none;
		font-weight: 600;
	}

	.profile-page__self-link:hover,
	.profile-page__meta a:hover {
		text-decoration: underline;
	}

	.profile-page__stats {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		color: var(--gr-semantic-foreground-secondary);
	}

	.profile-page__stats strong {
		color: var(--gr-semantic-foreground-primary);
	}

	.profile-page__fields {
		display: grid;
		gap: 0.75rem;
		margin: 0;
	}

	.profile-page__field {
		display: grid;
		gap: 0.25rem;
		padding: 0.75rem 0.875rem;
		border-radius: 0.875rem;
		background: color-mix(in srgb, white 72%, var(--gr-color-primary-50) 28%);
	}

	.profile-page__field dt {
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gr-semantic-foreground-secondary);
	}

	.profile-page__field dd {
		margin: 0;
	}

	.profile-page__timeline {
		min-width: 0;
	}

	.profile-page__notice {
		padding: 1rem;
		border-radius: 0.875rem;
		background: rgba(255, 255, 255, 0.6);
		color: var(--gr-semantic-foreground-secondary);
	}

	.profile-page__notice--error {
		background: color-mix(in srgb, var(--gr-color-error-100) 72%, white 28%);
		color: var(--gr-color-error-800);
	}

	@media (max-width: 720px) {
		.profile-page__identity {
			grid-template-columns: 1fr;
		}

		.profile-page__avatar {
			width: 5rem;
			height: 5rem;
		}
	}
</style>
