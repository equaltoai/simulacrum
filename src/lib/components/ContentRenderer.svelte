<script lang="ts">
	import { sanitizeHtml, linkifyMentions, useStableId } from '$lib/greater/utils';
	import { untrack } from 'svelte';
	import type { Mention, Tag } from '../types';

	interface Props {
		/**
		 * HTML content to render (will be sanitized)
		 */
		content: string;
		/**
		 * Spoiler/Content Warning text
		 */
		spoilerText?: string;
		/**
		 * Whether content is initially collapsed (when spoiler text is present)
		 */
		collapsed?: boolean;
		/**
		 * Mentions to linkify
		 */
		mentions?: Mention[];
		/**
		 * Hashtags to linkify
		 */
		tags?: Tag[];
		/**
		 * Base URL for mentions
		 */
		mentionBaseUrl?: string;
		/**
		 * Base URL for hashtags
		 */
		hashtagBaseUrl?: string;
		/**
		 * Additional CSS class for content
		 */
		class?: string;
		/**
		 * Callback when expand/collapse state changes
		 */
		onToggle?: (expanded: boolean) => void;
	}

	let {
		content,
		spoilerText = '',
		collapsed = true,
		mentions = [],
		tags = [],
		mentionBaseUrl = '/users/',
		hashtagBaseUrl = '/tags/',
		class: className = '',
		onToggle,
	}: Props = $props();

	let expanded = $state(untrack(() => !collapsed || !spoilerText));
	const generatedId = useStableId('content');
	const contentId = $derived(generatedId.value);

	function toggleExpanded() {
		if (spoilerText) {
			expanded = !expanded;
			onToggle?.(expanded);
		}
	}

	function escapeRegExp(text: string): string {
		return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	function safeExternalUrl(rawUrl: string): string | null {
		if (!rawUrl || typeof rawUrl !== 'string') return null;
		const value = rawUrl.trim();
		if (!value) return null;

		// Disallow scheme-relative URLs.
		if (value.startsWith('//')) return null;

		// Allow same-origin relative URLs.
		if (
			value.startsWith('/') ||
			value.startsWith('./') ||
			value.startsWith('../') ||
			value.startsWith('#') ||
			value.startsWith('?')
		) {
			return encodeURI(value);
		}

		try {
			const parsed = new URL(value);
			const protocol = parsed.protocol.toLowerCase();
			if (protocol !== 'http:' && protocol !== 'https:') return null;
			return parsed.toString();
		} catch {
			return null;
		}
	}

	function processContent(html: string): string {
		// First sanitize the HTML
		let processed = sanitizeHtml(html, {
			allowedTags: [
				'p',
				'br',
				'span',
				'a',
				'del',
				'pre',
				'code',
				'em',
				'strong',
				'b',
				'i',
				'u',
				's',
				'strike',
				'ul',
				'ol',
				'li',
				'blockquote',
				'h1',
				'h2',
				'h3',
				'h4',
				'h5',
				'h6',
			],
			allowedAttributes: ['href', 'title', 'class', 'rel', 'target'],
		});

		let modified = false;

		// Replace mention links if we have mention data
		if (mentions.length > 0) {
			mentions.forEach((mention) => {
				const pattern = new RegExp(`@${escapeRegExp(mention.username)}(?:@[\\w.-]+)?`, 'g');
				const safeUrl = safeExternalUrl(mention.url) ?? '#';
				const next = processed.replace(pattern, (match) => {
					return `<a href="${safeUrl}" class="mention" rel="noopener noreferrer" target="_blank">${match}</a>`;
				});
				if (next !== processed) modified = true;
				processed = next;
			});
		}

		// Replace hashtag links if we have tag data
		if (tags.length > 0) {
			tags.forEach((tag) => {
				const pattern = new RegExp(`#${escapeRegExp(tag.name)}\\b`, 'gi');
				const safeUrl = safeExternalUrl(tag.url) ?? '#';
				const next = processed.replace(pattern, () => {
					return `<a href="${safeUrl}" class="hashtag" rel="noopener noreferrer" target="_blank">#${tag.name}</a>`;
				});
				if (next !== processed) modified = true;
				processed = next;
			});
		}

		// If no specific mention/tag data, use generic linkification
		if (mentions.length === 0 && tags.length === 0) {
			// Only linkify if the sanitized output looks like plain text.
			const containsHtmlTags = /<\/?[a-z][\s\S]*>/i.test(processed);
			if (!containsHtmlTags) {
				const next = linkifyMentions(processed, {
					mentionBaseUrl,
					hashtagBaseUrl,
					openInNewTab: true,
					nofollow: false,
				});
				if (next !== processed) modified = true;
				processed = next;
			}
		}

		// Re-sanitize after linkification to enforce protocol/attribute allow-lists.
		if (!modified) return processed;

		return sanitizeHtml(processed, {
			allowedTags: [
				'p',
				'br',
				'span',
				'a',
				'del',
				'pre',
				'code',
				'em',
				'strong',
				'b',
				'i',
				'u',
				's',
				'strike',
				'ul',
				'ol',
				'li',
				'blockquote',
				'h1',
				'h2',
				'h3',
				'h4',
				'h5',
				'h6',
			],
			allowedAttributes: ['href', 'title', 'class', 'rel', 'target'],
		});
	}

	const processedContent = $derived(processContent(content));

	function setHtml(node: HTMLElement, html: string) {
		node.innerHTML = html;
		return {
			update(newHtml: string) {
				node.innerHTML = newHtml;
			},
		};
	}
</script>

<div class={`content-renderer ${className}`}>
	{#if spoilerText}
		<div class="spoiler-warning">
			<span class="spoiler-text">{spoilerText}</span>
			<button
				class="spoiler-toggle"
				onclick={toggleExpanded}
				aria-expanded={expanded}
				aria-controls={contentId}
			>
				{expanded ? 'Hide' : 'Show more'}
			</button>
		</div>
	{/if}

	{#if !spoilerText || expanded}
		<div
			class="content"
			class:collapsed={spoilerText && !expanded}
			id={contentId}
			aria-hidden={Boolean(spoilerText) && !expanded}
			use:setHtml={processedContent}
		></div>
	{/if}
</div>
