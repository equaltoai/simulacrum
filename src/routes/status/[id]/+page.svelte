<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import ActionBar from '$lib/components/ActionBar.svelte';
	import ContentRenderer from '$lib/components/ContentRenderer.svelte';
	import type { Status } from '$lib/types';

	let viewerId = $state<string | null>(null);
	let status = $state<Status | null>(null);
	let ancestors = $state<Status[]>([]);
	let descendants = $state<Status[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	let isReplying = $state(false);
	let replyDraft = $state('');
	let replyError = $state<string | null>(null);
	let replyTextarea = $state<HTMLTextAreaElement | null>(null);

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

	function focusReply() {
		replyTextarea?.focus();
	}

	function profileHref(acct: string) {
		return `${base}/profile/${encodeURIComponent(acct)}`;
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		const id = $page.params.id;

		viewerId = null;
		status = null;
		ancestors = [];
		descendants = [];
		error = null;
		isLoading = false;
		isReplying = false;
		replyDraft = '';
		replyError = null;

		if (!token || !id) return;

		const controller = new AbortController();
		isLoading = true;

		void (async () => {
			try {
				const [viewer, thread] = await Promise.all([
					api.fetchViewer({ signal: controller.signal }),
					api.fetchThreadContext({ noteId: id, signal: controller.signal }),
				]);

				viewerId = viewer.id;

				if (!thread) {
					status = null;
					ancestors = [];
					descendants = [];
					return;
				}

				status = thread.rootNote;
				ancestors = thread.ancestors;
				descendants = thread.descendants;
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				error = err instanceof Error ? err.message : String(err);
			} finally {
				isLoading = false;
			}
		})();

		return () => controller.abort();
	});

	async function toggleBoost() {
		if (!status) return;

		const currentlyBoosted = status.reblogged === true;
		const nextBoosted = !currentlyBoosted;

		status = {
			...status,
			reblogged: nextBoosted,
			reblogsCount: Math.max(0, status.reblogsCount + (currentlyBoosted ? -1 : 1)),
		};

		try {
			if (currentlyBoosted) {
				await api.unshareObject({ id: status.id });
			} else {
				await api.shareObject({ id: status.id });
			}
		} catch (err) {
			status = {
				...status,
				reblogged: currentlyBoosted,
				reblogsCount: Math.max(0, status.reblogsCount + (currentlyBoosted ? 1 : -1)),
			};
			console.error('Boost action failed:', err);
		}
	}

	async function toggleFavorite() {
		if (!status) return;

		const currentlyFavorited = status.favourited === true;
		const nextFavorited = !currentlyFavorited;

		status = {
			...status,
			favourited: nextFavorited,
			favouritesCount: Math.max(0, status.favouritesCount + (currentlyFavorited ? -1 : 1)),
		};

		try {
			if (currentlyFavorited) {
				await api.unlikeObject({ id: status.id });
			} else {
				await api.likeObject({ id: status.id });
			}
		} catch (err) {
			status = {
				...status,
				favourited: currentlyFavorited,
				favouritesCount: Math.max(0, status.favouritesCount + (currentlyFavorited ? 1 : -1)),
			};
			console.error('Favorite action failed:', err);
		}
	}

	async function toggleBookmark() {
		if (!status) return;

		const currentlyBookmarked = status.bookmarked === true;
		const nextBookmarked = !currentlyBookmarked;

		status = {
			...status,
			bookmarked: nextBookmarked,
		};

		try {
			if (currentlyBookmarked) {
				await api.unbookmarkObject({ id: status.id });
			} else {
				await api.bookmarkObject({ id: status.id });
			}
		} catch (err) {
			status = {
				...status,
				bookmarked: currentlyBookmarked,
			};
			console.error('Bookmark action failed:', err);
		}
	}

	async function togglePin() {
		if (!status) return;

		const currentlyPinned = status.pinned === true;
		const nextPinned = !currentlyPinned;

		status = {
			...status,
			pinned: nextPinned,
		};

		try {
			if (currentlyPinned) {
				await api.unpinObject({ id: status.id });
			} else {
				await api.pinObject({ id: status.id });
			}
		} catch (err) {
			status = {
				...status,
				pinned: currentlyPinned,
			};
			console.error('Pin action failed:', err);
		}
	}

	async function handleDelete() {
		if (!status || !viewerId) return;
		if (status.account.id !== viewerId) return;

		if (typeof window !== 'undefined') {
			const confirmed = window.confirm('Delete this post?');
			if (!confirmed) return;
		}

		try {
			const ok = await api.deleteObject({ id: status.id });
			if (ok) {
				status = null;
				descendants = [];
				ancestors = [];
			}
		} catch (err) {
			console.error('Delete action failed:', err);
		}
	}

	async function handleReplySubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!status) return;

		const content = replyDraft.trim();
		if (!content) return;

		isReplying = true;
		replyError = null;

		try {
			const reply = await api.createNote({ content, inReplyToId: status.id });
			replyDraft = '';
			isReplying = false;

			status = { ...status, repliesCount: Math.max(0, status.repliesCount + 1) };
			descendants = [reply, ...descendants];
		} catch (err) {
			replyError = err instanceof Error ? err.message : String(err);
			isReplying = false;
		}
	}
</script>

<svelte:head>
	<title>Status • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Status</h1>

	<p class="page__meta">
		<a href={`${base}/`}>Back to Home</a>
	</p>

	{#if !$authSession}
		<p>Sign in to view status threads.</p>
	{:else}
		{#if error}
			<div class="page__notice page__notice--error" role="alert">{error}</div>
		{/if}

		{#if isLoading}
			<div class="page__notice">Loading status…</div>
		{:else if status}
			{#if ancestors.length > 0}
				<div class="thread">
					<h2 class="thread__heading">In reply to</h2>
					{#each ancestors as item (item.id)}
						<article class="status-card status-card--ancestor">
							<header class="status-card__meta">
								<a class="status-card__author" href={profileHref(item.account.acct)}>
									{item.account.displayName || item.account.username}
								</a>
								<span class="status-card__handle">@{item.account.acct}</span>
							</header>
							<ContentRenderer content={item.content} spoilerText={item.spoilerText} />
						</article>
					{/each}
				</div>
			{/if}

			<article class="status-card status-card--focus">
				<header class="status-card__meta">
					<a class="status-card__author" href={profileHref(status.account.acct)}>
						{status.account.displayName || status.account.username}
					</a>
					<span class="status-card__handle">@{status.account.acct}</span>
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
						onReply: focusReply,
						onBoost: toggleBoost,
						onFavorite: toggleFavorite,
						onBookmark: toggleBookmark,
						onPin: togglePin,
						onDelete: viewerId && status.account.id === viewerId ? handleDelete : undefined,
					}}
					shareUrl={shareUrl(status.id)}
					shareTitle={`Post by ${status.account.displayName || status.account.username}`}
					idPrefix={idPrefix(status.id)}
				/>

				<form class="compose" onsubmit={handleReplySubmit}>
					<label class="compose__label" for="reply-content">Reply</label>
					<textarea
						id="reply-content"
						class="compose__input"
						placeholder="Write a reply…"
						autocomplete="off"
						rows={3}
						bind:this={replyTextarea}
						bind:value={replyDraft}
						disabled={isReplying}
					></textarea>
					<div class="compose__actions">
						{#if replyError}
							<span class="compose__error" role="alert">{replyError}</span>
						{/if}
						<button
							type="submit"
							class="gr-button gr-button--solid"
							disabled={isReplying || replyDraft.trim().length === 0}
						>
							{isReplying ? 'Posting…' : 'Reply'}
						</button>
					</div>
				</form>
			</article>

			<div class="thread">
				<h2 class="thread__heading">Replies</h2>
				{#if descendants.length === 0}
					<div class="page__notice">No replies yet.</div>
				{:else}
					{#each descendants as item (item.id)}
						<article class="status-card status-card--reply">
							<header class="status-card__meta">
								<a class="status-card__author" href={profileHref(item.account.acct)}>
									{item.account.displayName || item.account.username}
								</a>
								<span class="status-card__handle">@{item.account.acct}</span>
							</header>
							<ContentRenderer content={item.content} spoilerText={item.spoilerText} />
						</article>
					{/each}
				{/if}
			</div>
		{:else}
			<div class="page__notice">This post is unavailable (it may have been deleted).</div>
		{/if}
	{/if}
</section>
