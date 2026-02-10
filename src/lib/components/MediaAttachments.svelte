<script lang="ts">
	import type { MediaAttachment } from '$lib/types';
	import { untrack } from 'svelte';

	interface Props {
		attachments: MediaAttachment[];
		sensitive?: boolean;
		class?: string;
	}

	let { attachments, sensitive = false, class: className = '' }: Props = $props();

	let expanded = $state(untrack(() => !sensitive));

	function toggle() {
		expanded = !expanded;
	}
</script>

{#if attachments.length > 0}
	<section class={`media-attachments ${className}`}>
		{#if sensitive}
			<button
				type="button"
				class="media-attachments__toggle"
				onclick={toggle}
				aria-expanded={expanded}
			>
				{expanded ? 'Hide media' : 'Show media'}
			</button>
		{/if}

		{#if expanded}
			<div class="media-attachments__grid">
				{#each attachments as attachment (attachment.id)}
					{#if attachment.type === 'image' || attachment.type === 'gifv'}
						<img
							class="media-attachments__img"
							src={attachment.previewUrl || attachment.url}
							alt={attachment.description || ''}
							loading="lazy"
						/>
					{:else if attachment.type === 'video'}
						<video class="media-attachments__video" src={attachment.url} controls playsinline>
							<track kind="captions" />
						</video>
					{:else if attachment.type === 'audio'}
						<audio class="media-attachments__audio" src={attachment.url} controls>
							<track kind="captions" />
						</audio>
					{:else}
						<a class="media-attachments__file" href={attachment.url} target="_blank" rel="noopener noreferrer">
							Open attachment
						</a>
					{/if}
				{/each}
			</div>
		{/if}
	</section>
{/if}

<style>
	.media-attachments {
		display: flex;
		flex-direction: column;
		gap: var(--gr-spacing-scale-3);
	}

	.media-attachments__toggle {
		align-self: flex-start;
		border: 1px solid var(--gr-semantic-border-default);
		border-radius: var(--gr-radii-lg);
		padding: var(--gr-spacing-scale-2) var(--gr-spacing-scale-3);
		background: transparent;
		color: var(--gr-semantic-foreground-secondary);
		cursor: pointer;
		font: inherit;
	}

	.media-attachments__grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: var(--gr-spacing-scale-3);
	}

	.media-attachments__img,
	.media-attachments__video {
		width: 100%;
		border-radius: var(--gr-radii-xl);
		border: 1px solid var(--gr-semantic-border-default);
		background: var(--gr-semantic-background-base);
		display: block;
	}

	.media-attachments__img {
		height: auto;
		object-fit: cover;
	}

	.media-attachments__audio {
		width: 100%;
	}

	.media-attachments__file {
		color: var(--gr-semantic-action-primary-default);
		text-decoration: none;
	}

	.media-attachments__file:hover {
		text-decoration: underline;
	}
</style>

