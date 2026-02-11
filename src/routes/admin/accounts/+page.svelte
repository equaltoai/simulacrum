<script lang="ts">
	import { base } from '$app/paths';
	import { api, type AdminAccount } from '$lib/api';
	import { GraphQLRequestError } from '$lib/api/graphql';
	import { authSession } from '$lib/auth/session';

	function profileHref(acct: string) {
		return `${base}/profile/${encodeURIComponent(acct)}`;
	}

	function isAuthzError(err: unknown): boolean {
		if (!(err instanceof GraphQLRequestError)) return false;
		if (err.status === 401 || err.status === 403) return true;
		const message = err.message.toLowerCase();
		return message.includes('forbidden') || message.includes('unauthorized') || message.includes('not authorized');
	}

	let accounts = $state<AdminAccount[]>([]);
	let nextCursor = $state<string | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let isForbidden = $state(false);

	let searchQuery = $state('');
	let busyAccountId = $state<string | null>(null);
	let actionError = $state<string | null>(null);

	const filteredAccounts = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return accounts;

		return accounts.filter((account) => {
			const username = account.username.toLowerCase();
			const acct = (account.actor?.acct ?? '').toLowerCase();
			return username.includes(q) || acct.includes(q);
		});
	});

	async function refresh(signal?: AbortSignal) {
		error = null;
		isForbidden = false;
		isLoading = true;

		try {
			const result = await api.fetchAdminAccounts({ first: 50, signal });
			accounts = result.accounts;
			nextCursor = result.nextCursor;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			if (isAuthzError(err)) {
				isForbidden = true;
				return;
			}
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isLoading = false;
		}
	}

	async function loadMore() {
		if (!nextCursor || isLoading) return;
		isLoading = true;
		error = null;

		try {
			const result = await api.fetchAdminAccounts({ first: 50, after: nextCursor });
			accounts = [...accounts, ...result.accounts];
			nextCursor = result.nextCursor;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		if (!token) {
			accounts = [];
			nextCursor = null;
			isLoading = false;
			error = null;
			isForbidden = false;
			searchQuery = '';
			busyAccountId = null;
			actionError = null;
		}
	});

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		if (!token) return;

		const controller = new AbortController();
		void refresh(controller.signal);
		return () => controller.abort();
	});

	async function runAction({
		accountId,
		type,
		text,
	}: {
		accountId: string;
		type: string;
		text?: string;
	}) {
		if (busyAccountId) return;
		busyAccountId = accountId;
		actionError = null;

		try {
			await api.adminAccountAction({ id: accountId, type, text });
			await refresh();
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			busyAccountId = null;
		}
	}

	async function handleWarn(account: AdminAccount) {
		const text = prompt(`Warn @${account.username}: enter warning text`);
		if (!text || !text.trim()) return;
		await runAction({ accountId: account.id, type: 'warn', text: text.trim() });
	}

	async function handleSuspend(account: AdminAccount) {
		const text = prompt(`Suspend @${account.username}: reason (optional)`) ?? undefined;
		await runAction({ accountId: account.id, type: 'suspend', text: text?.trim() || undefined });
	}

	async function handleSilence(account: AdminAccount) {
		const text = prompt(`Silence @${account.username}: reason (optional)`) ?? undefined;
		await runAction({ accountId: account.id, type: 'silence', text: text?.trim() || undefined });
	}
</script>

<svelte:head>
	<title>Admin • Accounts • Simulacrum</title>
</svelte:head>

<div class="admin-surface">
	<div class="admin-surface__header">
		<h2 class="admin-surface__title">Accounts</h2>

		<div class="admin-surface__controls">
			<label class="admin-surface__control admin-surface__control--grow">
				<span>Search</span>
				<input
					type="search"
					bind:value={searchQuery}
					placeholder="Search by username or acct…"
					aria-label="Search accounts"
				/>
			</label>
			<button type="button" class="gr-button gr-button--outline" onclick={() => refresh()}>
				Refresh
			</button>
		</div>
	</div>

	{#if actionError}
		<div class="page__notice page__notice--error" role="alert">{actionError}</div>
	{/if}

	{#if isForbidden}
		<div class="page__notice page__notice--error" role="alert">
			You don’t have permission to access admin accounts on this instance.
		</div>
	{:else if error}
		<div class="page__notice page__notice--error" role="alert">{error}</div>
	{:else if isLoading && accounts.length === 0}
		<div class="page__notice">Loading accounts…</div>
	{:else}
		<div class="admin-table">
			<div class="admin-table__scroller">
				<table class="admin-table__table">
					<thead>
						<tr>
							<th scope="col">Username</th>
							<th scope="col">Role</th>
							<th scope="col">Approved</th>
							<th scope="col">Disabled</th>
							<th scope="col">Silenced</th>
							<th scope="col">Suspended</th>
							<th scope="col">Reports</th>
							<th scope="col">Created</th>
							<th scope="col">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredAccounts as account (account.id)}
							<tr>
								<td>
									{#if account.actor}
										<a href={profileHref(account.actor.acct)}>@{account.actor.acct}</a>
									{:else}
										@{account.username}
									{/if}
								</td>
								<td>{account.role.name}</td>
								<td>{account.approved ? 'yes' : 'no'}</td>
								<td>{account.disabled ? 'yes' : 'no'}</td>
								<td>{account.silenced ? 'yes' : 'no'}</td>
								<td>{account.suspended ? 'yes' : 'no'}</td>
								<td>
									{account.reportsCount}/{account.resolvedReportsCount}
								</td>
								<td>{new Date(account.createdAt).toLocaleDateString()}</td>
								<td>
									<div class="admin-row-actions">
										<button
											type="button"
											class="gr-button gr-button--outline"
											onclick={() => handleWarn(account)}
											disabled={busyAccountId === account.id}
										>
											Warn
										</button>

										{#if account.silenced}
											<button
												type="button"
												class="gr-button gr-button--outline"
												onclick={() => runAction({ accountId: account.id, type: 'unsilence' })}
												disabled={busyAccountId === account.id}
											>
												Unsilence
											</button>
										{:else}
											<button
												type="button"
												class="gr-button gr-button--outline"
												onclick={() => handleSilence(account)}
												disabled={busyAccountId === account.id}
											>
												Silence
											</button>
										{/if}

										{#if account.suspended}
											<button
												type="button"
												class="gr-button gr-button--outline"
												onclick={() => runAction({ accountId: account.id, type: 'unsuspend' })}
												disabled={busyAccountId === account.id}
											>
												Unsuspend
											</button>
										{:else}
											<button
												type="button"
												class="gr-button gr-button--outline"
												onclick={() => handleSuspend(account)}
												disabled={busyAccountId === account.id}
											>
												Suspend
											</button>
										{/if}

										{#if account.disabled}
											<button
												type="button"
												class="gr-button gr-button--outline"
												onclick={() => runAction({ accountId: account.id, type: 'enable' })}
												disabled={busyAccountId === account.id}
											>
												Enable
											</button>
										{:else}
											<button
												type="button"
												class="gr-button gr-button--outline"
												onclick={() => runAction({ accountId: account.id, type: 'disable' })}
												disabled={busyAccountId === account.id}
											>
												Disable
											</button>
										{/if}

										{#if !account.approved}
											<button
												type="button"
												class="gr-button gr-button--solid"
												onclick={() => runAction({ accountId: account.id, type: 'approve' })}
												disabled={busyAccountId === account.id}
											>
												Approve
											</button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		{#if nextCursor}
			<button type="button" class="gr-button gr-button--outline" onclick={loadMore} disabled={isLoading}>
				{isLoading ? 'Loading…' : 'Load more'}
			</button>
		{/if}
	{/if}
</div>

