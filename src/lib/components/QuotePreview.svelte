<script lang="ts">
	import type { QuoteContext } from '$lib/types';

	interface Props {
		quoteUrl?: string;
		quoteContext?: QuoteContext;
		class?: string;
	}

	let { quoteUrl, quoteContext, class: className = '' }: Props = $props();
</script>

{#if quoteContext}
	<aside class={`quote-preview ${className}`} aria-label="Quoted post">
		<div class="quote-preview__meta">
			<span class="quote-preview__label">Quoted</span>
			<span class="quote-preview__author">{quoteContext.originalAuthor.displayName}</span>
			<span class="quote-preview__handle">@{quoteContext.originalAuthor.acct}</span>
			{#if quoteContext.withdrawn}
				<span class="quote-preview__badge">withdrawn</span>
			{/if}
		</div>

		{#if quoteUrl}
			<a class="quote-preview__link" href={quoteUrl} target="_blank" rel="noopener noreferrer">
				Open quoted post
			</a>
		{/if}
	</aside>
{/if}

<style>
	.quote-preview {
		padding: var(--gr-spacing-scale-4);
		border-radius: var(--gr-radii-xl);
		border: 1px solid var(--gr-semantic-border-default);
		background: var(--gr-semantic-background-secondary);
		display: flex;
		flex-direction: column;
		gap: var(--gr-spacing-scale-2);
	}

	.quote-preview__meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gr-spacing-scale-2);
		align-items: baseline;
	}

	.quote-preview__label {
		font-size: var(--gr-typography-fontSize-sm);
		color: var(--gr-semantic-foreground-secondary);
	}

	.quote-preview__author {
		font-weight: var(--gr-typography-fontWeight-semibold);
		color: var(--gr-semantic-foreground-primary);
	}

	.quote-preview__handle {
		color: var(--gr-semantic-foreground-tertiary);
		font-size: var(--gr-typography-fontSize-sm);
	}

	.quote-preview__badge {
		font-size: var(--gr-typography-fontSize-xs);
		color: var(--gr-semantic-foreground-secondary);
		border: 1px solid var(--gr-semantic-border-default);
		border-radius: var(--gr-radii-lg);
		padding: 0 var(--gr-spacing-scale-2);
	}

	.quote-preview__link {
		color: var(--gr-semantic-action-primary-default);
		text-decoration: none;
		font-size: var(--gr-typography-fontSize-sm);
	}

	.quote-preview__link:hover {
		text-decoration: underline;
	}
</style>

