<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { api, type LesserList } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import TimelineVirtualizedReactive from '$lib/components/TimelineVirtualizedReactive.svelte';
	import type { Account, Status } from '$lib/types';
	import type { RepliesPolicy } from '$lib/greater/adapters/graphql';

	const listId = $derived($page.params.id ?? '');

	let list = $state<LesserList | null>(null);
	let timelineItems = $state<Status[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	let title = $state('');
	let repliesPolicy = $state<RepliesPolicy>('LIST');
	let exclusive = $state(false);
	let isSaving = $state(false);
	let saveMessage = $state<string | null>(null);
	let saveError = $state<string | null>(null);

	let memberQuery = $state('');
	let memberResults = $state<Account[]>([]);
	let memberSearchLoading = $state(false);
	let memberError = $state<string | null>(null);

	function profileHref(acct: string) {
		return `${base}/profile/${encodeURIComponent(acct)}`;
	}

	function hydrateForm(next: LesserList) {
		title = next.title;
		repliesPolicy = next.repliesPolicy;
		exclusive = next.exclusive;
	}

	async function refresh(signal?: AbortSignal) {
		const [nextList, timeline] = await Promise.all([
			api.fetchList({ id: listId, signal }),
			api.fetchListTimeline({ listId, signal }),
		]);

		if (!nextList) {
			throw new Error('List not found.');
		}

		list = nextList;
		timelineItems = timeline.items;
		hydrateForm(nextList);
	}

	async function refreshList(signal?: AbortSignal) {
		const nextList = await api.fetchList({ id: listId, signal });
		if (!nextList) throw new Error('List not found.');
		list = nextList;
		hydrateForm(nextList);
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		list = null;
		timelineItems = [];
		error = null;
		isLoading = false;
		saveMessage = null;
		saveError = null;
		memberResults = [];
		memberError = null;

		if (!token || !listId) return;

		const controller = new AbortController();
		isLoading = true;

		void (async () => {
			try {
				await refresh(controller.signal);
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				error = err instanceof Error ? err.message : String(err);
			} finally {
				isLoading = false;
			}
		})();

		return () => controller.abort();
	});

	async function handleSave(event: SubmitEvent) {
		event.preventDefault();
		if (!$authSession?.accessToken) return;
		if (isSaving) return;

		const nextTitle = title.trim();
		if (!nextTitle) {
			saveError = 'Title is required.';
			return;
		}

		isSaving = true;
		saveMessage = null;
		saveError = null;

		try {
			const updated = await api.updateList({
				id: listId,
				input: {
					title: nextTitle,
					repliesPolicy,
					exclusive,
				},
			});

			list = list ? { ...list, ...updated } : updated;
			saveMessage = 'List updated.';
		} catch (err) {
			saveError = err instanceof Error ? err.message : String(err);
		} finally {
			isSaving = false;
		}
	}

	async function handleDelete() {
		if (!$authSession?.accessToken) return;
		if (!list) return;
		if (!confirm(`Delete list "${list.title}"?`)) return;

		try {
			await api.deleteList({ id: list.id });
			await goto(`${base}/lists`);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	async function handleMemberSearch(event: SubmitEvent) {
		event.preventDefault();
		if (!$authSession?.accessToken) return;

		const query = memberQuery.trim();
		if (!query) {
			memberResults = [];
			return;
		}

		memberSearchLoading = true;
		memberError = null;

		try {
			memberResults = await api.searchAccounts({ query, first: 10 });
		} catch (err) {
			memberError = err instanceof Error ? err.message : String(err);
		} finally {
			memberSearchLoading = false;
		}
	}

	function isInList(accountId: string) {
		return list?.accounts?.some((account) => account.id === accountId) ?? false;
	}

	async function handleAdd(account: Account) {
		if (!$authSession?.accessToken) return;
		if (isInList(account.id)) return;

		try {
			await api.addAccountsToList({ id: listId, accountIds: [account.id] });
			await refreshList();
		} catch (err) {
			memberError = err instanceof Error ? err.message : String(err);
		}
	}

	async function handleRemove(account: Account) {
		if (!$authSession?.accessToken) return;

		try {
			await api.removeAccountsFromList({ id: listId, accountIds: [account.id] });
			await refreshList();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}
</script>

<svelte:head>
	<title>{list ? `${list.title} • Lists • Simulacrum` : 'List • Simulacrum'}</title>
</svelte:head>

<section class="page">
	<h1>{list ? list.title : 'List'}</h1>

	<p class="page__meta">
		<a href={`${base}/lists`}>Back to lists</a>
	</p>

	{#if !$authSession}
		<p>Sign in to view lists.</p>
	{:else if isLoading}
		<div class="page__notice">Loading list…</div>
	{:else if error}
		<div class="page__notice page__notice--error" role="alert">{error}</div>
	{:else if list}
		<section class="page__notice">
			<strong>Settings</strong>
			<form class="settings-form settings-form--inline" onsubmit={handleSave}>
				<div class="settings-form__grid settings-form__grid--single">
					<label class="settings-field">
						<span class="settings-field__label">Title</span>
						<input class="settings-field__input" type="text" bind:value={title} />
					</label>

					<label class="settings-field">
						<span class="settings-field__label">Replies policy</span>
						<select class="settings-field__select" bind:value={repliesPolicy}>
							<option value="LIST">List members</option>
							<option value="FOLLOWED">Followed accounts</option>
							<option value="NONE">No replies</option>
						</select>
					</label>

					<label class="settings-field settings-field--toggle">
						<span class="settings-field__label">Exclusive</span>
						<input class="settings-field__checkbox" type="checkbox" bind:checked={exclusive} />
					</label>
				</div>

				{#if saveError}
					<div class="settings-form__notice settings-form__notice--error" role="alert">
						{saveError}
					</div>
				{:else if saveMessage}
					<div class="settings-form__notice">{saveMessage}</div>
				{/if}

				<div class="settings-form__actions settings-form__actions--between">
					<button type="button" class="gr-button gr-button--outline" onclick={handleDelete}>
						Delete list
					</button>
					<button type="submit" class="gr-button gr-button--solid" disabled={isSaving}>
						{isSaving ? 'Saving…' : 'Save'}
					</button>
				</div>
			</form>
		</section>

		<section class="page__notice">
			<strong>Members</strong>

			{#if list.accounts && list.accounts.length > 0}
				<ul class="member-list" aria-label="List members">
					{#each list.accounts as account (account.id)}
						<li class="member-list__row">
							<a class="member-list__link" href={profileHref(account.acct)}>
								<img class="member-list__avatar" src={account.avatar} alt="" />
								<span class="member-list__name">{account.displayName || account.username}</span>
								<span class="member-list__handle">@{account.acct}</span>
							</a>
							<button
								type="button"
								class="gr-button gr-button--outline member-list__remove"
								onclick={() => handleRemove(account)}
							>
								Remove
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p>No members yet.</p>
			{/if}

			<form class="settings-form settings-form--inline" onsubmit={handleMemberSearch}>
				<div class="settings-form__grid settings-form__grid--single">
					<label class="settings-field">
						<span class="settings-field__label">Add accounts</span>
						<input
							class="settings-field__input"
							type="text"
							placeholder="Search accounts…"
							bind:value={memberQuery}
						/>
					</label>
				</div>

				{#if memberError}
					<div class="settings-form__notice settings-form__notice--error" role="alert">
						{memberError}
					</div>
				{/if}

				<div class="settings-form__actions">
					<button
						type="submit"
						class="gr-button gr-button--solid"
						disabled={memberSearchLoading || !memberQuery.trim()}
					>
						{memberSearchLoading ? 'Searching…' : 'Search'}
					</button>
				</div>
			</form>

			{#if memberResults.length > 0}
				<ul class="member-search" aria-label="Search results">
					{#each memberResults as account (account.id)}
						<li class="member-search__row">
							<a class="member-search__link" href={profileHref(account.acct)}>
								<img class="member-search__avatar" src={account.avatar} alt="" />
								<span class="member-search__name">{account.displayName || account.username}</span>
								<span class="member-search__handle">@{account.acct}</span>
							</a>
							<button
								type="button"
								class="gr-button gr-button--outline member-search__add"
								disabled={isInList(account.id)}
								onclick={() => handleAdd(account)}
							>
								{isInList(account.id) ? 'Added' : 'Add'}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="page__notice">
			<strong>Timeline</strong>
			{#if timelineItems.length === 0}
				<p>No posts yet.</p>
			{:else}
				<TimelineVirtualizedReactive items={timelineItems} />
			{/if}
		</section>
	{/if}
</section>
