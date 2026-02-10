<script lang="ts">
	import type { Snippet } from 'svelte';
	import { base } from '$app/paths';
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import type { Status } from '$lib/types';
	import ContentRenderer from './ContentRenderer.svelte';
	import ActionBar from './ActionBar.svelte';

	interface Props {
		items?: Status[];
		viewerId?: string;
		adapter?: unknown;
		view?: Record<string, unknown> | null;
		enableRealtime?: boolean;
		virtualScrolling?: boolean;
		estimateSize?: number;
		density?: 'compact' | 'comfortable';
		class?: string;
		empty?: Snippet;
		children?: Snippet;
	}

	let {
		items = [],
		viewerId,
		class: className = '',
		empty,
		children,
	}: Props = $props();

	let displayItems = $state<Status[]>([]);

	$effect(() => {
		displayItems = items;
	});

	let replyingToId = $state<string | null>(null);
	let replyDraft = $state('');
	let isReplyPosting = $state(false);
	let replyError = $state<string | null>(null);

	function profileHref(acct: string) {
		return `${base}/profile/${encodeURIComponent(acct)}`;
	}

	function statusHref(id: string) {
		return `${base}/status/${encodeURIComponent(id)}`;
	}

	function shareUrl(id: string) {
		const href = statusHref(id);
		if (typeof window === 'undefined') return href;
		return `${window.location.origin}${href}`;
	}

	function idPrefix(id: string) {
		return `action-${encodeURIComponent(id)}`;
	}

	function updateActionTarget(item: Status, updater: (target: Status) => Status): Status {
		if (item.reblog) {
			return { ...item, reblog: updater(item.reblog) };
		}
		return updater(item);
	}

	function updateItem(displayId: string, updater: (current: Status) => Status) {
		displayItems = displayItems.map((item) => (item.id === displayId ? updater(item) : item));
	}

	function getActionStatus(item: Status): Status {
		return item.reblog ?? item;
	}

	function openReply(displayId: string) {
		replyingToId = displayId;
		replyDraft = '';
		replyError = null;
	}

	function closeReply() {
		replyingToId = null;
		replyDraft = '';
		replyError = null;
		isReplyPosting = false;
	}

	async function handleReplySubmit(event: SubmitEvent, displayId: string) {
		event.preventDefault();
		if (!$authSession?.accessToken) return;
		if (isReplyPosting) return;

		const displayItem = displayItems.find((item) => item.id === displayId);
		if (!displayItem) return;

		const target = getActionStatus(displayItem);
		const content = replyDraft.trim();
		if (!content) return;

		isReplyPosting = true;
		replyError = null;

		try {
			await api.createNote({ content, inReplyToId: target.id });
			updateItem(displayId, (item) =>
				updateActionTarget(item, (status) => ({
					...status,
					repliesCount: Math.max(0, status.repliesCount + 1),
				}))
			);
			closeReply();
		} catch (err) {
			replyError = err instanceof Error ? err.message : String(err);
		} finally {
			isReplyPosting = false;
		}
	}

	async function toggleBoost(displayId: string) {
		if (!$authSession?.accessToken) return;

		const displayItem = displayItems.find((item) => item.id === displayId);
		if (!displayItem) return;

		const target = getActionStatus(displayItem);
		const currentlyBoosted = target.reblogged === true;
		const nextBoosted = !currentlyBoosted;

		updateItem(displayId, (item) =>
			updateActionTarget(item, (status) => ({
				...status,
				reblogged: nextBoosted,
				reblogsCount: Math.max(0, status.reblogsCount + (currentlyBoosted ? -1 : 1)),
			}))
		);

		try {
			if (currentlyBoosted) {
				await api.unshareObject({ id: target.id });
			} else {
				await api.shareObject({ id: target.id });
			}
		} catch (err) {
			updateItem(displayId, (item) =>
				updateActionTarget(item, (status) => ({
					...status,
					reblogged: currentlyBoosted,
					reblogsCount: Math.max(0, status.reblogsCount + (currentlyBoosted ? 1 : -1)),
				}))
			);
			console.error('Boost action failed:', err);
		}
	}

	async function toggleFavorite(displayId: string) {
		if (!$authSession?.accessToken) return;

		const displayItem = displayItems.find((item) => item.id === displayId);
		if (!displayItem) return;

		const target = getActionStatus(displayItem);
		const currentlyFavorited = target.favourited === true;
		const nextFavorited = !currentlyFavorited;

		updateItem(displayId, (item) =>
			updateActionTarget(item, (status) => ({
				...status,
				favourited: nextFavorited,
				favouritesCount: Math.max(0, status.favouritesCount + (currentlyFavorited ? -1 : 1)),
			}))
		);

		try {
			if (currentlyFavorited) {
				await api.unlikeObject({ id: target.id });
			} else {
				await api.likeObject({ id: target.id });
			}
		} catch (err) {
			updateItem(displayId, (item) =>
				updateActionTarget(item, (status) => ({
					...status,
					favourited: currentlyFavorited,
					favouritesCount: Math.max(0, status.favouritesCount + (currentlyFavorited ? 1 : -1)),
				}))
			);
			console.error('Favorite action failed:', err);
		}
	}

	async function toggleBookmark(displayId: string) {
		if (!$authSession?.accessToken) return;

		const displayItem = displayItems.find((item) => item.id === displayId);
		if (!displayItem) return;

		const target = getActionStatus(displayItem);
		const currentlyBookmarked = target.bookmarked === true;
		const nextBookmarked = !currentlyBookmarked;

		updateItem(displayId, (item) =>
			updateActionTarget(item, (status) => ({
				...status,
				bookmarked: nextBookmarked,
			}))
		);

		try {
			if (currentlyBookmarked) {
				await api.unbookmarkObject({ id: target.id });
			} else {
				await api.bookmarkObject({ id: target.id });
			}
		} catch (err) {
			updateItem(displayId, (item) =>
				updateActionTarget(item, (status) => ({
					...status,
					bookmarked: currentlyBookmarked,
				}))
			);
			console.error('Bookmark action failed:', err);
		}
	}

	async function togglePin(displayId: string) {
		if (!$authSession?.accessToken) return;

		const displayItem = displayItems.find((item) => item.id === displayId);
		if (!displayItem) return;

		const target = getActionStatus(displayItem);
		const currentlyPinned = target.pinned === true;
		const nextPinned = !currentlyPinned;

		updateItem(displayId, (item) =>
			updateActionTarget(item, (status) => ({
				...status,
				pinned: nextPinned,
			}))
		);

		try {
			if (currentlyPinned) {
				await api.unpinObject({ id: target.id });
			} else {
				await api.pinObject({ id: target.id });
			}
		} catch (err) {
			updateItem(displayId, (item) =>
				updateActionTarget(item, (status) => ({
					...status,
					pinned: currentlyPinned,
				}))
			);
			console.error('Pin action failed:', err);
		}
	}

	async function handleDelete(displayId: string) {
		if (!$authSession?.accessToken) return;

		const displayItem = displayItems.find((item) => item.id === displayId);
		if (!displayItem) return;

		const target = getActionStatus(displayItem);

		if (!viewerId || target.account.id !== viewerId) return;
		if (typeof window !== 'undefined') {
			const confirmed = window.confirm('Delete this post?');
			if (!confirmed) return;
		}

		const before = displayItems;
		displayItems = displayItems.filter((item) => item.id !== displayId);

		try {
			const ok = await api.deleteObject({ id: target.id });
			if (!ok) {
				displayItems = before;
			}
		} catch (err) {
			displayItems = before;
			console.error('Delete action failed:', err);
		}
	}
</script>

<div class={`timeline-virtualized ${className}`}>
	{#if children}
		{@render children()}
	{:else if displayItems.length > 0}
		{#each displayItems as item (item.id)}
			{@const status = getActionStatus(item)}
			<article class="timeline-virtualized__item">
				<header class="timeline-virtualized__meta">
					<div class="timeline-virtualized__byline">
						<a class="timeline-virtualized__author" href={profileHref(status.account.acct)}>
							{status.account.displayName || status.account.username}
						</a>
						<a class="timeline-virtualized__handle" href={profileHref(status.account.acct)}>
							@{status.account.acct}
						</a>
					</div>
					<a class="timeline-virtualized__status-link" href={statusHref(status.id)}>Open</a>
				</header>

				<ContentRenderer
					content={status.content}
					spoilerText={status.spoilerText}
					mentions={status.mentions ?? []}
					tags={status.tags ?? []}
				/>

				<ActionBar
					counts={{
						replies: status.repliesCount,
						boosts: status.reblogsCount,
						favorites: status.favouritesCount,
						quotes: status.quoteCount ?? 0,
					}}
					states={{
						boosted: status.reblogged ?? null,
						favorited: status.favourited ?? null,
						bookmarked: status.bookmarked ?? null,
						pinned: status.pinned ?? null,
					}}
					handlers={{
						onReply: () => openReply(item.id),
						onBoost: () => toggleBoost(item.id),
						onFavorite: () => toggleFavorite(item.id),
						onBookmark: () => toggleBookmark(item.id),
						onPin: () => togglePin(item.id),
						onDelete: viewerId && status.account.id === viewerId ? () => handleDelete(item.id) : undefined,
					}}
					shareUrl={shareUrl(status.id)}
					shareTitle={`Post by ${status.account.displayName || status.account.username}`}
					idPrefix={idPrefix(item.id)}
				/>

				{#if replyingToId === item.id}
					<form class="compose" onsubmit={(event) => handleReplySubmit(event, item.id)}>
						<label class="compose__label" for={`reply-content-${encodeURIComponent(item.id)}`}>Reply</label>
						<textarea
							id={`reply-content-${encodeURIComponent(item.id)}`}
							class="compose__input"
							placeholder="Write a reply…"
							autocomplete="off"
							rows={3}
							bind:value={replyDraft}
							disabled={isReplyPosting}
						></textarea>
						<div class="compose__actions">
							{#if replyError}
								<span class="compose__error" role="alert">{replyError}</span>
							{/if}
							<button type="button" class="gr-button gr-button--outline" onclick={closeReply} disabled={isReplyPosting}>
								Cancel
							</button>
							<button
								type="submit"
								class="gr-button gr-button--solid"
								disabled={isReplyPosting || replyDraft.trim().length === 0}
							>
								{isReplyPosting ? 'Posting…' : 'Reply'}
							</button>
						</div>
					</form>
				{/if}
			</article>
		{/each}
	{:else}
		{#if empty}
			{@render empty()}
		{:else}
			<div class="timeline-virtualized__empty">No items yet.</div>
		{/if}
	{/if}
</div>
