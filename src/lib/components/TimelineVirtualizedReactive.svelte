<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Status } from '$lib/types';

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
				<h4>{item.account.displayName || item.account.username}</h4>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<div>{@html item.content}</div>
			</article>
		{/each}
	{:else}
		<div class="timeline-virtualized__empty">No items yet.</div>
	{/if}
</div>
