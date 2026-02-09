<script lang="ts">
	import type { Snippet } from 'svelte';
	import { base } from '$app/paths';
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

	function profileHref(acct: string) {
		return `${base}/profile/${encodeURIComponent(acct)}`;
	}

	function statusHref(id: string) {
		return `${base}/status/${encodeURIComponent(id)}`;
	}
</script>

<div class={`timeline-virtualized ${className}`}>
	{#if children}
		{@render children()}
	{:else if items.length > 0}
		{#each items as item (item.id)}
			<article class="timeline-virtualized__item">
				<header class="timeline-virtualized__meta">
					<div class="timeline-virtualized__byline">
						<a class="timeline-virtualized__author" href={profileHref(item.account.acct)}>
							{item.account.displayName || item.account.username}
						</a>
						<a class="timeline-virtualized__handle" href={profileHref(item.account.acct)}>
							@{item.account.acct}
						</a>
					</div>
					<a class="timeline-virtualized__status-link" href={statusHref(item.id)}>Open</a>
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
