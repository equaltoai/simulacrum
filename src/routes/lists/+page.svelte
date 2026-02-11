<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { api, type LesserList } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import type { RepliesPolicy } from '$lib/greater/adapters/graphql';

	let lists = $state<LesserList[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	let newTitle = $state('');
	let newRepliesPolicy = $state<RepliesPolicy>('LIST');
	let newExclusive = $state(false);
	let isCreating = $state(false);
	let createError = $state<string | null>(null);

	async function loadLists(signal?: AbortSignal) {
		lists = await api.fetchLists({ signal });
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		lists = [];
		error = null;
		isLoading = false;

		if (!token) return;

		const controller = new AbortController();
		isLoading = true;

		void (async () => {
			try {
				await loadLists(controller.signal);
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				error = err instanceof Error ? err.message : String(err);
			} finally {
				isLoading = false;
			}
		})();

		return () => controller.abort();
	});

	async function handleCreate(event: SubmitEvent) {
		event.preventDefault();
		if (!$authSession?.accessToken) return;
		if (isCreating) return;

		const title = newTitle.trim();
		if (!title) {
			createError = 'List title is required.';
			return;
		}

		isCreating = true;
		createError = null;

		try {
			const created = await api.createList({
				input: {
					title,
					repliesPolicy: newRepliesPolicy,
					exclusive: newExclusive,
				},
			});

			lists = [created, ...lists];
			newTitle = '';
			newExclusive = false;
			newRepliesPolicy = 'LIST';

			await goto(`${base}/lists/${encodeURIComponent(created.id)}`);
		} catch (err) {
			createError = err instanceof Error ? err.message : String(err);
		} finally {
			isCreating = false;
		}
	}

	async function handleDelete(list: LesserList) {
		if (!$authSession?.accessToken) return;
		if (!confirm(`Delete list "${list.title}"?`)) return;

		try {
			await api.deleteList({ id: list.id });
			lists = lists.filter((item) => item.id !== list.id);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	function listHref(id: string) {
		return `${base}/lists/${encodeURIComponent(id)}`;
	}
</script>

<svelte:head>
	<title>Lists • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Lists</h1>

	{#if !$authSession}
		<p>Sign in to manage your lists.</p>
	{:else}
		<section class="page__notice">
			<strong>Create a list</strong>
			<form class="settings-form settings-form--inline" onsubmit={handleCreate}>
				<div class="settings-form__grid settings-form__grid--single">
					<label class="settings-field">
						<span class="settings-field__label">Title</span>
						<input class="settings-field__input" type="text" bind:value={newTitle} />
					</label>

					<label class="settings-field">
						<span class="settings-field__label">Replies policy</span>
						<select class="settings-field__select" bind:value={newRepliesPolicy}>
							<option value="LIST">List members</option>
							<option value="FOLLOWED">Followed accounts</option>
							<option value="NONE">No replies</option>
						</select>
					</label>

					<label class="settings-field settings-field--toggle">
						<span class="settings-field__label">Exclusive</span>
						<input class="settings-field__checkbox" type="checkbox" bind:checked={newExclusive} />
					</label>
				</div>

				{#if createError}
					<div class="settings-form__notice settings-form__notice--error" role="alert">
						{createError}
					</div>
				{/if}

				<div class="settings-form__actions">
					<button type="submit" class="gr-button gr-button--solid" disabled={isCreating}>
						{isCreating ? 'Creating…' : 'Create list'}
					</button>
				</div>
			</form>
		</section>

		{#if error}
			<div class="page__notice page__notice--error" role="alert">{error}</div>
		{/if}

		{#if isLoading}
			<div class="page__notice">Loading lists…</div>
		{:else if lists.length === 0}
			<div class="page__notice">No lists yet.</div>
		{:else}
			<div class="lists-grid">
				{#each lists as list (list.id)}
					<article class="lists-card">
						<a class="lists-card__link" href={listHref(list.id)}>
							<h2 class="lists-card__title">{list.title}</h2>
							<p class="lists-card__meta">
								<strong>{list.accountCount}</strong>
								{list.accountCount === 1 ? 'account' : 'accounts'} • {list.repliesPolicy}
								{list.exclusive ? ' • Exclusive' : ''}
							</p>
						</a>
						<button
							type="button"
							class="gr-button gr-button--outline lists-card__delete"
							onclick={() => handleDelete(list)}
						>
							Delete
						</button>
					</article>
				{/each}
			</div>
		{/if}
	{/if}
</section>

