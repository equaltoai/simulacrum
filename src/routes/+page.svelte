<script lang="ts">
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import type { Account, Status } from '$lib/types';
	import TimelineVirtualizedReactive from '$lib/components/TimelineVirtualizedReactive.svelte';

	let viewer = $state<Account | null>(null);
	let items = $state<Status[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let draft = $state('');
	let isPosting = $state(false);
	let postError = $state<string | null>(null);

	async function handlePostSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (!$authSession?.accessToken) return;
		if (isPosting) return;

		const content = draft.trim();
		if (!content) return;

		isPosting = true;
		postError = null;

		try {
			const status = await api.createNote({ content });
			draft = '';
			items = [status, ...items];
		} catch (err) {
			postError = err instanceof Error ? err.message : String(err);
		} finally {
			isPosting = false;
		}
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		viewer = null;
		items = [];
		error = null;
		isLoading = false;
		postError = null;

		if (!token) {
			return;
		}

		const controller = new AbortController();
		isLoading = true;

		void (async () => {
			try {
				const [viewerData, timeline] = await Promise.all([
					api.fetchViewer({ signal: controller.signal }),
					api.fetchHomeTimeline({ signal: controller.signal }),
				]);

				viewer = viewerData;
				items = timeline.items;
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
	<title>Home • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Home</h1>

	{#if !$authSession}
		<p>Sign in to load your home timeline.</p>
	{:else}
		{#if viewer}
			<p class="page__meta">
				Signed in as <strong>{viewer.displayName || viewer.username}</strong>
				<span class="page__handle">@{viewer.acct}</span>
			</p>
		{/if}

		<form class="compose" onsubmit={handlePostSubmit}>
			<label class="compose__label" for="compose-content">Compose</label>
			<textarea
				id="compose-content"
				class="compose__input"
				placeholder="What’s happening?"
				autocomplete="off"
				rows={4}
				bind:value={draft}
				disabled={isPosting}
			></textarea>
			<div class="compose__actions">
				{#if postError}
					<span class="compose__error" role="alert">{postError}</span>
				{/if}
				<button
					type="submit"
					class="gr-button gr-button--solid"
					disabled={isPosting || draft.trim().length === 0}
				>
					{isPosting ? 'Posting…' : 'Post'}
				</button>
			</div>
		</form>

		{#if error}
			<div class="page__notice page__notice--error" role="alert">{error}</div>
		{/if}

		{#if isLoading}
			<div class="page__notice">Loading timeline…</div>
		{:else}
			<TimelineVirtualizedReactive {items} viewerId={viewer?.id ?? undefined} />
		{/if}
	{/if}
</section>
