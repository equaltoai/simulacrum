<script lang="ts">
	import type { Snippet } from 'svelte';
	import { base } from '$app/paths';
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import type { Status } from '$lib/types';
	import ContentRenderer from './ContentRenderer.svelte';
	import ActionBar from './ActionBar.svelte';
	import Composer from './Composer.svelte';
	import MediaAttachments from './MediaAttachments.svelte';
	import PollCard from './PollCard.svelte';
	import QuotePreview from './QuotePreview.svelte';

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

	let composerForId = $state<string | null>(null);
	let composerMode = $state<'reply' | 'quote' | 'edit' | null>(null);

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

	function openComposer(displayId: string, mode: 'reply' | 'quote' | 'edit') {
		composerForId = displayId;
		composerMode = mode;
	}

	function closeComposer() {
		composerForId = null;
		composerMode = null;
	}

	function htmlToText(html: string): string {
		if (typeof window === 'undefined') {
			return html.replace(/<[^>]*>/g, '').trim();
		}
		const div = document.createElement('div');
		div.innerHTML = html;
		return (div.textContent ?? '').trim();
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

				<QuotePreview quoteUrl={status.quoteUrl} quoteContext={status.quoteContext} />

				{#if status.mediaAttachments && status.mediaAttachments.length > 0}
					<MediaAttachments attachments={status.mediaAttachments} sensitive={status.sensitive ?? false} />
				{/if}
				{#if status.poll}
					<PollCard poll={status.poll} />
				{/if}

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
						onReply: () => openComposer(item.id, 'reply'),
						onBoost: () => toggleBoost(item.id),
						onQuote: () => openComposer(item.id, 'quote'),
						onFavorite: () => toggleFavorite(item.id),
						onBookmark: () => toggleBookmark(item.id),
						onPin: () => togglePin(item.id),
						onDelete: viewerId && status.account.id === viewerId ? () => handleDelete(item.id) : undefined,
					}}
					shareUrl={shareUrl(status.id)}
					shareTitle={`Post by ${status.account.displayName || status.account.username}`}
					idPrefix={idPrefix(item.id)}
				>
					{#snippet extensions()}
						{#if viewerId && status.account.id === viewerId}
							<button
								type="button"
								class="gr-button gr-button--outline"
								onclick={() => openComposer(item.id, 'edit')}
							>
								Edit
							</button>
						{/if}
					{/snippet}
				</ActionBar>

				{#if composerForId === item.id && composerMode === 'reply'}
					<Composer
						mode="reply"
						inReplyToId={status.id}
						onCancel={closeComposer}
						onSubmitted={() => {
							updateItem(item.id, (current) =>
								updateActionTarget(current, (target) => ({
									...target,
									repliesCount: Math.max(0, target.repliesCount + 1),
								}))
							);
						}}
					/>
				{:else if composerForId === item.id && composerMode === 'quote'}
					<Composer
						mode="quote"
						quoteId={status.id}
						onCancel={closeComposer}
						onSubmitted={() => {
							updateItem(item.id, (current) =>
								updateActionTarget(current, (target) => ({
									...target,
									quoteCount: (target.quoteCount ?? 0) + 1,
								}))
							);
						}}
					/>
				{:else if composerForId === item.id && composerMode === 'edit'}
					<Composer
						mode="edit"
						editId={status.id}
						initialContent={htmlToText(status.content)}
						initialSpoilerText={status.spoilerText ?? ''}
						initialSensitive={status.sensitive ?? false}
						onCancel={closeComposer}
						onSubmitted={(updated) => {
							updateItem(item.id, (current) =>
								updateActionTarget(current, (target) => ({
									...target,
									content: updated.content,
									spoilerText: updated.spoilerText,
									sensitive: updated.sensitive,
									editedAt: updated.editedAt,
									mediaAttachments: updated.mediaAttachments,
									poll: updated.poll,
								}))
							);
						}}
					/>
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
