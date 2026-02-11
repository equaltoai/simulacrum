<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import ActionBar from '$lib/components/ActionBar.svelte';
	import CommunityNotesPanel from '$lib/components/CommunityNotesPanel.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import ContentRenderer from '$lib/components/ContentRenderer.svelte';
	import MediaAttachments from '$lib/components/MediaAttachments.svelte';
	import PollCard from '$lib/components/PollCard.svelte';
	import QuotePreview from '$lib/components/QuotePreview.svelte';
	import TranslationPanel from '$lib/components/TranslationPanel.svelte';
	import AIAnalysisPanel from '$lib/components/AIAnalysisPanel.svelte';
	import VerificationPanel from '$lib/components/VerificationPanel.svelte';
	import ModerationTools from '$lib/patterns/ModerationTools.svelte';
	import type { Status } from '$lib/types';

	let viewerId = $state<string | null>(null);
	let status = $state<Status | null>(null);
	let ancestors = $state<Status[]>([]);
	let descendants = $state<Status[]>([]);
	let quotes = $state<Status[]>([]);
	let quotesLoading = $state(false);
	let quotesError = $state<string | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	let composerMode = $state<'reply' | 'quote' | 'edit' | null>(null);
	let quotePermissionsOpen = $state(false);
	let quoteableDraft = $state<boolean>(true);
	let quotePermissionDraft = $state<'EVERYONE' | 'FOLLOWERS' | 'NONE'>('EVERYONE');
	let quotePermissionsSaving = $state(false);
	let quotePermissionsError = $state<string | null>(null);

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

	function profileHref(acct: string) {
		return `${base}/profile/${encodeURIComponent(acct)}`;
	}

	function openComposer(mode: 'reply' | 'quote' | 'edit') {
		composerMode = mode;
	}

	function closeComposer() {
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

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		const id = $page.params.id;

		viewerId = null;
		status = null;
		ancestors = [];
		descendants = [];
		quotes = [];
		quotesLoading = false;
		quotesError = null;
		error = null;
		isLoading = false;
		composerMode = null;
		quotePermissionsOpen = false;
		quotePermissionsSaving = false;
		quotePermissionsError = null;

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

				quoteableDraft = thread.rootNote.quoteable ?? true;
				quotePermissionDraft = (thread.rootNote.quotePermissions ?? 'EVERYONE') as
					| 'EVERYONE'
					| 'FOLLOWERS'
					| 'NONE';

				quotesLoading = true;
				quotesError = null;
				try {
					const quotesPayload = await api.fetchObjectWithQuotes({
						id: thread.rootNote.id,
						first: 50,
						signal: controller.signal,
					});
					quotes = quotesPayload?.quotes ?? [];
				} catch (err) {
					if (!(err instanceof DOMException && err.name === 'AbortError')) {
						quotesError = err instanceof Error ? err.message : String(err);
					}
				} finally {
					quotesLoading = false;
				}
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				error = err instanceof Error ? err.message : String(err);
			} finally {
				isLoading = false;
			}
		})();

		return () => controller.abort();
	});

	async function refreshRootStatus() {
		if (!status) return;
		try {
			const refreshed = await api.fetchObjectById({ id: status.id });
			if (!refreshed) return;
			status = refreshed;
		} catch (err) {
			console.error('Failed to refresh status:', err);
		}
	}

	async function saveQuotePermissions() {
		if (!status) return;
		if (!viewerId || status.account.id !== viewerId) return;
		if (quotePermissionsSaving) return;

		quotePermissionsSaving = true;
		quotePermissionsError = null;

		try {
			const result = await api.updateQuotePermissions({
				noteId: status.id,
				quoteable: quoteableDraft,
				permission: quotePermissionDraft,
			});
			status = result.note;
			quoteableDraft = result.note.quoteable ?? true;
			quotePermissionDraft = (result.note.quotePermissions ?? 'EVERYONE') as 'EVERYONE' | 'FOLLOWERS' | 'NONE';
		} catch (err) {
			quotePermissionsError = err instanceof Error ? err.message : String(err);
		} finally {
			quotePermissionsSaving = false;
		}
	}

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
								{#if item.account.isAgent}
									<span class="gr-badge gr-badge--sm gr-badge--outlined gr-badge--primary">Agent</span>
								{/if}
							</header>
							<ContentRenderer content={item.content} spoilerText={item.spoilerText} />
							<QuotePreview quoteUrl={item.quoteUrl} quoteContext={item.quoteContext} />
							{#if item.mediaAttachments && item.mediaAttachments.length > 0}
								<MediaAttachments
									attachments={item.mediaAttachments}
									sensitive={item.sensitive ?? false}
								/>
							{/if}
							{#if item.poll}
								<PollCard poll={item.poll} />
							{/if}
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
					{#if status.account.isAgent}
						<span class="gr-badge gr-badge--sm gr-badge--outlined gr-badge--primary">Agent</span>
					{/if}
				</header>
				<ContentRenderer
					content={status.content}
					spoilerText={status.spoilerText}
					mentions={status.mentions ?? []}
					tags={status.tags ?? []}
				/>
				<QuotePreview quoteUrl={status.quoteUrl} quoteContext={status.quoteContext} />
				{#if status.agentAttribution}
					<details class="page__notice">
						<summary>
							<strong>Agent attribution</strong>
						</summary>
						<pre class="settings-token__value">{JSON.stringify(status.agentAttribution, null, 2)}</pre>
					</details>
				{/if}
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
						onReply: () => openComposer('reply'),
						onBoost: toggleBoost,
						onQuote: status.quoteable ? () => openComposer('quote') : undefined,
						onFavorite: toggleFavorite,
						onBookmark: toggleBookmark,
						onPin: togglePin,
						onDelete: viewerId && status.account.id === viewerId ? handleDelete : undefined,
					}}
					shareUrl={shareUrl(status.id)}
					shareTitle={`Post by ${status.account.displayName || status.account.username}`}
					idPrefix={idPrefix(status.id)}
				>
					{#snippet extensions()}
						{#if status && viewerId && status.account.id === viewerId}
							<button
								type="button"
								class="gr-button gr-button--outline"
								onclick={() => openComposer('edit')}
							>
								Edit
							</button>
							<button
								type="button"
								class="gr-button gr-button--outline"
								onclick={() => (quotePermissionsOpen = !quotePermissionsOpen)}
							>
								Quote permissions
							</button>
						{/if}
					{/snippet}
				</ActionBar>

				{#if status && viewerId && status.account.id === viewerId && quotePermissionsOpen}
					<section class="quote-permissions" aria-label="Quote permissions">
						<h3 class="quote-permissions__title">Quote permissions</h3>
						{#if quotePermissionsError}
							<div class="page__notice page__notice--error" role="alert">{quotePermissionsError}</div>
						{/if}
						<div class="quote-permissions__fields">
							<label class="quote-permissions__field">
								<input type="checkbox" bind:checked={quoteableDraft} disabled={quotePermissionsSaving} />
								<span>Allow quoting</span>
							</label>
							<label class="quote-permissions__field">
								<span>Who can quote</span>
								<select bind:value={quotePermissionDraft} disabled={quotePermissionsSaving || !quoteableDraft}>
									<option value="EVERYONE">Everyone</option>
									<option value="FOLLOWERS">Followers</option>
									<option value="NONE">No one</option>
								</select>
							</label>
							<button
								type="button"
								class="gr-button gr-button--solid"
								onclick={saveQuotePermissions}
								disabled={quotePermissionsSaving}
							>
								{quotePermissionsSaving ? 'Saving…' : 'Save'}
							</button>
						</div>
					</section>
				{/if}

				<TranslationPanel statusId={status.id} />

				<AIAnalysisPanel objectId={status.id} />

				<VerificationPanel status={status} />

				<ModerationTools
					targetType="status"
					targetId={status.id}
					targetAccount={status.account}
					targetStatus={status}
					config={{ actions: ['report', 'addNote', 'mute', 'block'], mode: 'menu' }}
					disabled={!$authSession?.accessToken}
					handlers={{
						onReport: async (_targetType, _targetId, reason) => {
							await api.flagObject({ input: { objectId: status!.id, reason } });
						},
						onBlock: async () => {
							await api.blockActor({ id: status!.account.id });
						},
						onMute: async () => {
							await api.muteActor({ id: status!.account.id });
						},
						onAddNote: async (objectId, content) => {
							await api.addCommunityNote({ input: { objectId, content } });
							await refreshRootStatus();
						},
					}}
				/>

				{#if (status.communityNotes ?? []).length > 0}
					<CommunityNotesPanel
						notes={status.communityNotes ?? []}
						onVote={async (noteId, helpful) => {
							await api.voteCommunityNote({ id: noteId, helpful });
							await refreshRootStatus();
						}}
					/>
				{/if}

				{#if composerMode === 'reply'}
					<Composer
						mode="reply"
						inReplyToId={status.id}
						onCancel={closeComposer}
						onSubmitted={(reply) => {
							if (!status) return;
							status = { ...status, repliesCount: Math.max(0, status.repliesCount + 1) };
							descendants = [reply, ...descendants];
						}}
					/>
				{:else if composerMode === 'quote'}
					<Composer
						mode="quote"
						quoteId={status.id}
						onCancel={closeComposer}
						onSubmitted={() => {
							if (!status) return;
							status = { ...status, quoteCount: (status.quoteCount ?? 0) + 1 };
						}}
					/>
				{:else if composerMode === 'edit'}
					<Composer
						mode="edit"
						editId={status.id}
						initialContent={htmlToText(status.content)}
						initialSpoilerText={status.spoilerText ?? ''}
						initialSensitive={status.sensitive ?? false}
						onCancel={closeComposer}
						onSubmitted={(updated) => {
							status = { ...status, ...updated };
						}}
					/>
				{/if}
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
								{#if item.account.isAgent}
									<span class="gr-badge gr-badge--sm gr-badge--outlined gr-badge--primary">Agent</span>
								{/if}
							</header>
							<ContentRenderer content={item.content} spoilerText={item.spoilerText} />
							<QuotePreview quoteUrl={item.quoteUrl} quoteContext={item.quoteContext} />
							{#if item.mediaAttachments && item.mediaAttachments.length > 0}
								<MediaAttachments
									attachments={item.mediaAttachments}
									sensitive={item.sensitive ?? false}
								/>
							{/if}
							{#if item.poll}
								<PollCard poll={item.poll} />
							{/if}
						</article>
					{/each}
				{/if}
			</div>

			<div class="thread" id="quotes">
				<h2 class="thread__heading">Quotes</h2>
				{#if quotesError}
					<div class="page__notice page__notice--error" role="alert">{quotesError}</div>
				{/if}
				{#if quotesLoading}
					<div class="page__notice">Loading quotes…</div>
				{:else if quotes.length === 0}
					<div class="page__notice">No quotes yet.</div>
				{:else}
					{#each quotes as item (item.id)}
						<article class="status-card status-card--reply">
							<header class="status-card__meta">
								<a class="status-card__author" href={profileHref(item.account.acct)}>
									{item.account.displayName || item.account.username}
								</a>
								<span class="status-card__handle">@{item.account.acct}</span>
								{#if item.account.isAgent}
									<span class="gr-badge gr-badge--sm gr-badge--outlined gr-badge--primary">Agent</span>
								{/if}
							</header>
							<ContentRenderer content={item.content} spoilerText={item.spoilerText} />
							<QuotePreview quoteUrl={item.quoteUrl} quoteContext={item.quoteContext} />
							{#if item.mediaAttachments && item.mediaAttachments.length > 0}
								<MediaAttachments
									attachments={item.mediaAttachments}
									sensitive={item.sensitive ?? false}
								/>
							{/if}
							{#if item.poll}
								<PollCard poll={item.poll} />
							{/if}
						</article>
					{/each}
				{/if}
			</div>
		{:else}
			<div class="page__notice">This post is unavailable (it may have been deleted).</div>
		{/if}
	{/if}
</section>
