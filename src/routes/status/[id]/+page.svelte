<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import ContentRenderer from '$lib/components/ContentRenderer.svelte';
	import type { Status } from '$lib/types';

	let status = $state<Status | null>(null);
	let ancestors = $state<Status[]>([]);
	let descendants = $state<Status[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	function profileHref(acct: string) {
		return `${base}/profile/${encodeURIComponent(acct)}`;
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		const id = $page.params.id;

		status = null;
		ancestors = [];
		descendants = [];
		error = null;
		isLoading = false;

		if (!token || !id) return;

		const controller = new AbortController();
		isLoading = true;

		void (async () => {
			try {
				const [statusData, context] = await Promise.all([
					api.fetchStatusById({ id, signal: controller.signal }),
					api.fetchStatusContext({ id, signal: controller.signal }),
				]);

				status = statusData;
				ancestors = context.ancestors;
				descendants = context.descendants;
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				error = err instanceof Error ? err.message : String(err);
			} finally {
				isLoading = false;
			}
		})();

		return () => controller.abort();
	});
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
		{/if}
	{/if}
</section>
