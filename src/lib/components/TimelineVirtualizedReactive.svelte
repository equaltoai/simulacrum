<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Status } from '$lib/types';
	import ContentRenderer from './ContentRenderer.svelte';

	interface Props {
		items?: Status[];
		adapter?: unknown;
		view?: Record<string, unknown> | null;
		enableRealtime?: boolean;
		density?: 'compact' | 'comfortable';
		class?: string;
		children?: Snippet;
	}

	let {
		items = [],
		class: className = '',
		children,
	}: Props = $props();
</script>

<div class={`timeline-virtualized ${className}`}>
	{#if children}
		{@render children()}
	{:else if items.length > 0}
		{#each items as item (item.id)}
			<article class="timeline-virtualized__item">
				<header class="timeline-virtualized__meta">
					<h4 class="timeline-virtualized__author">{item.account.displayName || item.account.username}</h4>
					<span class="timeline-virtualized__handle">@{item.account.acct}</span>
				</header>

				<ContentRenderer
					content={item.content}
					spoilerText={item.spoilerText}
					mentions={item.mentions ?? []}
					tags={item.tags ?? []}
				/>
			</article>
		{/each}
	{:else}
		<div class="timeline-virtualized__empty">No items yet.</div>
	{/if}
</div>
