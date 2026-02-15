<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import * as Search from '$lib/components/search';
	import type { Account, Status } from '$lib/types';

	const initialQuery = $derived($page.url.searchParams.get('q') ?? '');
	let viewerId = $state<string | null>(null);

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		viewerId = null;
		if (!token) return;

		const controller = new AbortController();
		void (async () => {
			try {
				const viewer = await api.fetchViewer({ signal: controller.signal });
				viewerId = viewer.id;
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				console.warn('Failed to fetch viewer id for search page:', err);
			}
		})();

		return () => controller.abort();
	});

	function profileHref(acct: string) {
		return `${base}/profile/${encodeURIComponent(acct)}`;
	}

	function statusHref(id: string) {
		return `${base}/status/${encodeURIComponent(id)}`;
	}

	function tagHref(name: string) {
		return `${base}/tags/${encodeURIComponent(name)}`;
	}

	const handlers: Search.SearchHandlers = {
		onSearch: async (options) => {
			const result = await api.search({ query: options.query, first: options.limit ?? 20 });

			const actors: Search.SearchActor[] = result.accounts.map((account: Account) => ({
				id: account.id,
				username: account.acct,
				displayName: account.displayName || account.username,
				avatar: account.avatar || undefined,
				bio: account.note,
				followersCount: account.followersCount,
				isSelf: viewerId !== null && account.id === viewerId,
			}));

			const notes: Search.SearchNote[] = result.statuses.map((status: Status) => ({
				id: status.id,
				content: status.content,
				author: {
					id: status.account.id,
					username: status.account.acct,
					displayName: status.account.displayName || status.account.username,
					avatar: status.account.avatar || undefined,
				},
				createdAt: typeof status.createdAt === 'string' ? status.createdAt : status.createdAt.toISOString(),
				likesCount: status.favouritesCount,
				repliesCount: status.repliesCount,
				reblogsCount: status.reblogsCount,
			}));

			const tags: Search.SearchTag[] = result.hashtags.map((tag) => ({
				name: tag.name,
				count: 0,
			}));

			return {
				actors,
				notes,
				tags,
				total: actors.length + notes.length + tags.length,
			};
		},
		onActorClick: (actor) => {
			void goto(profileHref(actor.username));
		},
		onNoteClick: (note) => {
			void goto(statusHref(note.id));
		},
		onTagClick: (tag) => {
			void goto(tagHref(tag.name));
		},
	};
</script>

<svelte:head>
	<title>Search • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Search</h1>

	{#if !$authSession}
		<p>Sign in to search accounts, statuses, and hashtags.</p>
	{:else}
		<Search.Root {handlers} initialQuery={initialQuery}>
			<Search.Bar
				placeholder="Search accounts, statuses, and hashtags…"
				showSemantic={false}
				autofocus
			/>
			<Search.Filters />
			<Search.Results />
		</Search.Root>
	{/if}
</section>
