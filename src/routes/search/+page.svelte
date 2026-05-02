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
	let viewerIdRequest: Promise<string | null> | null = null;
	let viewerIdController: AbortController | null = null;

	let lastAccessToken = $state<string | null>(null);
	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		if (token === lastAccessToken) return;
		viewerIdController?.abort();
		viewerIdController = null;
		lastAccessToken = token;
		viewerId = null;
		viewerIdRequest = null;
	});

	async function resolveViewerId(): Promise<string | null> {
		const token = $authSession?.accessToken ?? null;
		if (!token) return null;
		if (viewerId) return viewerId;
		if (!viewerIdRequest) {
			const requestToken = token;
			const controller = new AbortController();
			viewerIdController = controller;
			viewerIdRequest = api
				.fetchViewer({ signal: controller.signal })
				.then((viewer) => {
					if (lastAccessToken !== requestToken) return null;
					return viewer.id;
				})
				.catch((err) => {
					if (err instanceof DOMException && err.name === 'AbortError') return null;
					console.warn('Failed to fetch viewer id for search page:', err);
					return null;
				})
				.finally(() => {
					if (viewerIdController === controller) {
						viewerIdController = null;
					}
					viewerIdRequest = null;
				});
		}
		const resolved = await viewerIdRequest;
		if (lastAccessToken === token) {
			viewerId = resolved;
			return viewerId;
		}
		return null;
	}

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
			const resolvedViewerId = await resolveViewerId();
			const result = await api.search({ query: options.query, first: options.limit ?? 20 });

				const actors: Search.SearchActor[] = result.accounts.map((account: Account) => ({
					id: account.id,
					username: (account.acct || account.username || '').trim(),
					displayName: (account.displayName || '').trim() || (account.acct || account.username || '').trim(),
					avatar: account.avatar || undefined,
					bio: account.note,
					followersCount: account.followersCount,
					isSelf: resolvedViewerId !== null && account.id === resolvedViewerId,
				}));

			const notes: Search.SearchNote[] = result.statuses.map((status: Status) => ({
				id: status.id,
				content: status.content,
					author: {
						id: status.account.id,
						username: (status.account.acct || status.account.username || '').trim(),
						displayName:
							(status.account.displayName || '').trim() ||
							(status.account.acct || status.account.username || '').trim(),
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
