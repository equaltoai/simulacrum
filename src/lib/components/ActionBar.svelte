<script lang="ts">
	import { Button } from '$lib/greater/primitives';
	import {
		ReplyIcon as Reply,
		RepeatIcon as Boost,
		FavoriteIcon as Favorite,
		BookmarkIcon as Bookmark,
		MapPinIcon as Pin,
		Trash2Icon as Trash,
		ShareIcon as Share,
		RepeatIcon as Unboost,
		UnfavoriteIcon as Unfavorite,
	} from '$lib/greater/icons';
	import type { Snippet } from 'svelte';

	interface ActionCounts {
		replies: number;
		boosts: number;
		favorites: number;
		quotes?: number;
	}

	interface ActionStates {
		boosted?: boolean | null;
		favorited?: boolean | null;
		bookmarked?: boolean | null;
		pinned?: boolean | null;
	}

	interface ActionHandlers {
		onReply?: () => Promise<void> | void;
		onBoost?: () => Promise<void> | void;
		onFavorite?: () => Promise<void> | void;
		onBookmark?: () => Promise<void> | void;
		onPin?: () => Promise<void> | void;
		onShare?: () => Promise<void> | void;
		onQuote?: () => Promise<void> | void;
		onDelete?: () => Promise<void> | void;
	}

	interface Props {
		/**
		 * Current action counts
		 */
		counts: ActionCounts;
		/**
		 * Current action states
		 */
		states?: ActionStates;
		/**
		 * Action event handlers
		 */
		handlers?: ActionHandlers;
		/**
		 * Whether the action bar is in read-only mode (disables all actions)
		 */
		readonly?: boolean;
		/**
		 * Size variant for the buttons
		 */
		size?: 'sm' | 'md' | 'lg';
		/**
		 * CSS class for the action bar
		 */
		class?: string;
		/**
		 * Custom slot for additional actions after standard actions
		 */
		extensions?: Snippet;
		/**
		 * ID prefix for accessibility
		 */
		idPrefix?: string;

		/**
		 * URL to share/copy when no custom onShare handler is provided.
		 */
		shareUrl?: string;

		/**
		 * Title used by the Web Share API (when available).
		 */
		shareTitle?: string;
	}

	let {
		counts,
		states = {},
		handlers = {},
		readonly = false,
		size = 'sm',
		class: className = '',
		extensions,
		idPrefix = 'action',
		shareUrl,
		shareTitle,
	}: Props = $props();

	// Loading states for each action
	let replyLoading = $state(false);
	let boostLoading = $state(false);
	let quoteLoading = $state(false);
	let favoriteLoading = $state(false);
	let bookmarkLoading = $state(false);
	let pinLoading = $state(false);
	let shareLoading = $state(false);
	let deleteLoading = $state(false);

	const quotesCount = $derived(counts.quotes ?? 0);

	// Derived state for action states
	const isBoosted = $derived(states.boosted === true);
	const isFavorited = $derived(states.favorited === true);
	const isBookmarked = $derived(states.bookmarked === true);
	const isPinned = $derived(states.pinned === true);

	function ariaPressed(value: boolean | null | undefined): boolean | undefined {
		return typeof value === 'boolean' ? value : undefined;
	}

	// Format count display (e.g., 1K for 1000)
	function formatCount(count: number): string {
		if (count === 0) return '';
		if (count < 1000) return count.toString();
		if (count < 10000) return (count / 1000).toFixed(1).replace('.0', '') + 'K';
		return Math.floor(count / 1000) + 'K';
	}

	// Action handlers with loading states
	async function handleReply() {
		if (readonly || replyLoading || !handlers.onReply) return;

		replyLoading = true;
		try {
			await handlers.onReply();
		} catch (error) {
			console.error('Reply action failed:', error);
		} finally {
			replyLoading = false;
		}
	}

	async function handleBoost() {
		if (readonly || boostLoading || !handlers.onBoost) return;

		boostLoading = true;
		try {
			await handlers.onBoost();
		} catch (error) {
			console.error('Boost action failed:', error);
		} finally {
			boostLoading = false;
		}
	}

	async function handleFavorite() {
		if (readonly || favoriteLoading || !handlers.onFavorite) return;

		favoriteLoading = true;
		try {
			await handlers.onFavorite();
		} catch (error) {
			console.error('Favorite action failed:', error);
		} finally {
			favoriteLoading = false;
		}
	}

	async function handleBookmark() {
		if (readonly || bookmarkLoading || !handlers.onBookmark) return;

		bookmarkLoading = true;
		try {
			await handlers.onBookmark();
		} catch (error) {
			console.error('Bookmark action failed:', error);
		} finally {
			bookmarkLoading = false;
		}
	}

	async function handlePin() {
		if (readonly || pinLoading || !handlers.onPin) return;

		pinLoading = true;
		try {
			await handlers.onPin();
		} catch (error) {
			console.error('Pin action failed:', error);
		} finally {
			pinLoading = false;
		}
	}

	async function handleShare() {
		if (readonly || shareLoading) return;

		shareLoading = true;
		try {
			if (handlers.onShare) {
				await handlers.onShare();
				return;
			}

			if (!shareUrl) return;

			if (typeof navigator !== 'undefined' && 'share' in navigator) {
				const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
				if (nav.share) {
					await nav.share({ url: shareUrl, title: shareTitle });
					return;
				}
			}

			if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(shareUrl);
			}
		} catch (error) {
			console.error('Share action failed:', error);
		} finally {
			shareLoading = false;
		}
	}

	async function handleDelete() {
		if (readonly || deleteLoading || !handlers.onDelete) return;

		deleteLoading = true;
		try {
			await handlers.onDelete();
		} catch (error) {
			console.error('Delete action failed:', error);
		} finally {
			deleteLoading = false;
		}
	}

	async function handleQuote() {
		if (readonly || quoteLoading || !handlers.onQuote) return;

		quoteLoading = true;
		try {
			await handlers.onQuote();
		} catch (error) {
			console.error('Quote action failed:', error);
		} finally {
			quoteLoading = false;
		}
	}
</script>

<div class={`gr-action-bar ${className}`} role="group" aria-label="Post actions">
	<Button
		variant="ghost"
		{size}
		disabled={readonly || replyLoading}
		loading={replyLoading}
		onclick={handleReply}
		class="gr-action-bar__button gr-action-bar__button--reply"
		aria-label={counts.replies > 0
			? `Reply to this post. ${counts.replies} replies`
			: 'Reply to this post'}
		id={`${idPrefix}-reply`}
	>
		{#snippet prefix()}
			<Reply size={size === 'sm' ? 16 : size === 'md' ? 18 : 20} />
		{/snippet}

		{#if counts.replies > 0}
			<span class="gr-action-bar__count" aria-hidden="true">
				{formatCount(counts.replies)}
			</span>
		{/if}
	</Button>

	<!-- Boost/Unboost Button -->
	<Button
		variant="ghost"
		{size}
		disabled={readonly || boostLoading}
		loading={boostLoading}
		onclick={handleBoost}
		class={`gr-action-bar__button gr-action-bar__button--boost${isBoosted ? ' gr-action-bar__button--active' : ''}`}
		aria-label={isBoosted
			? `Undo boost. ${counts.boosts} boosts`
			: counts.boosts > 0
				? `Boost this post. ${counts.boosts} boosts`
				: 'Boost this post'}
		aria-pressed={ariaPressed(states.boosted)}
		id={`${idPrefix}-boost`}
	>
		{#snippet prefix()}
			{#if isBoosted}
				<Unboost size={size === 'sm' ? 16 : size === 'md' ? 18 : 20} />
			{:else}
				<Boost size={size === 'sm' ? 16 : size === 'md' ? 18 : 20} />
			{/if}
		{/snippet}

		{#if counts.boosts > 0}
			<span class="gr-action-bar__count" aria-hidden="true">
				{formatCount(counts.boosts)}
			</span>
		{/if}
	</Button>

	<!-- Quote Button (Lesser-specific) -->
	{#if handlers.onQuote}
		<Button
			variant="ghost"
			{size}
			disabled={readonly || quoteLoading}
			loading={quoteLoading}
			onclick={handleQuote}
			class="gr-action-bar__button gr-action-bar__button--quote"
			aria-label={quotesCount > 0 ? `Quote this post. ${quotesCount} quotes` : 'Quote this post'}
			id={`${idPrefix}-quote`}
		>
			{#snippet prefix()}
				<svg
					width={size === 'sm' ? 16 : size === 'md' ? 18 : 20}
					height={size === 'sm' ? 16 : size === 'md' ? 18 : 20}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
					<path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
					<path d="M4 22h16"></path>
					<path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
					<path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
				</svg>
			{/snippet}

			{#if quotesCount > 0}
				<span class="gr-action-bar__count" aria-hidden="true">
					{formatCount(quotesCount)}
				</span>
			{/if}
		</Button>
	{/if}

	<!-- Favorite/Unfavorite Button -->
	<Button
		variant="ghost"
		{size}
		disabled={readonly || favoriteLoading}
		loading={favoriteLoading}
		onclick={handleFavorite}
		class={`gr-action-bar__button gr-action-bar__button--favorite${isFavorited ? ' gr-action-bar__button--active' : ''}`}
		aria-label={isFavorited
			? `Remove from favorites. ${counts.favorites} favorites`
			: counts.favorites > 0
				? `Add to favorites. ${counts.favorites} favorites`
				: 'Add to favorites'}
		aria-pressed={ariaPressed(states.favorited)}
		id={`${idPrefix}-favorite`}
	>
		{#snippet prefix()}
			{#if isFavorited}
				<Unfavorite size={size === 'sm' ? 16 : size === 'md' ? 18 : 20} />
			{:else}
				<Favorite size={size === 'sm' ? 16 : size === 'md' ? 18 : 20} />
			{/if}
		{/snippet}

		{#if counts.favorites > 0}
			<span class="gr-action-bar__count" aria-hidden="true">
				{formatCount(counts.favorites)}
			</span>
		{/if}
	</Button>

	<!-- Bookmark Button -->
	{#if handlers.onBookmark}
		<Button
			variant="ghost"
			{size}
			disabled={readonly || bookmarkLoading}
			loading={bookmarkLoading}
			onclick={handleBookmark}
			class={`gr-action-bar__button gr-action-bar__button--bookmark${isBookmarked ? ' gr-action-bar__button--active' : ''}`}
			aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this post'}
			aria-pressed={ariaPressed(states.bookmarked)}
			id={`${idPrefix}-bookmark`}
		>
			{#snippet prefix()}
				<Bookmark size={size === 'sm' ? 16 : size === 'md' ? 18 : 20} />
			{/snippet}
		</Button>
	{/if}

	<!-- Pin Button -->
	{#if handlers.onPin}
		<Button
			variant="ghost"
			{size}
			disabled={readonly || pinLoading}
			loading={pinLoading}
			onclick={handlePin}
			class={`gr-action-bar__button gr-action-bar__button--pin${isPinned ? ' gr-action-bar__button--active' : ''}`}
			aria-label={isPinned ? 'Unpin this post' : 'Pin this post'}
			aria-pressed={ariaPressed(states.pinned)}
			id={`${idPrefix}-pin`}
		>
			{#snippet prefix()}
				<Pin size={size === 'sm' ? 16 : size === 'md' ? 18 : 20} />
			{/snippet}
		</Button>
	{/if}

	<!-- Share Button -->
	<Button
		variant="ghost"
		{size}
		disabled={readonly || shareLoading || (!handlers.onShare && !shareUrl)}
		loading={shareLoading}
		onclick={handleShare}
		class="gr-action-bar__button gr-action-bar__button--share"
		aria-label="Share this post"
		id={`${idPrefix}-share`}
	>
		{#snippet prefix()}
			<Share size={size === 'sm' ? 16 : size === 'md' ? 18 : 20} />
		{/snippet}
	</Button>

	<!-- Delete Button -->
	{#if handlers.onDelete}
		<Button
			variant="ghost"
			{size}
			disabled={readonly || deleteLoading}
			loading={deleteLoading}
			onclick={handleDelete}
			class="gr-action-bar__button gr-action-bar__button--delete"
			aria-label="Delete this post"
			id={`${idPrefix}-delete`}
		>
			{#snippet prefix()}
				<Trash size={size === 'sm' ? 16 : size === 'md' ? 18 : 20} />
			{/snippet}
		</Button>
	{/if}

	<!-- Extensions slot for additional actions -->
	{#if extensions}
		<div class="gr-action-bar__extensions">
			{@render extensions()}
		</div>
	{/if}
</div>
