<script lang="ts">
	import { base } from '$app/paths';
	import { api, type AdminStatusFilter } from '$lib/api';
	import { GraphQLRequestError } from '$lib/api/graphql';
	import { authSession } from '$lib/auth/session';
	import ContentRenderer from '$lib/components/ContentRenderer.svelte';
	import type { Status } from '$lib/types';

	function profileHref(acct: string) {
		return `${base}/profile/${encodeURIComponent(acct)}`;
	}

	function statusHref(id: string) {
		return `${base}/status/${encodeURIComponent(id)}`;
	}

	function isAuthzError(err: unknown): boolean {
		if (!(err instanceof GraphQLRequestError)) return false;
		if (err.status === 401 || err.status === 403) return true;
		const message = err.message.toLowerCase();
		return message.includes('forbidden') || message.includes('unauthorized') || message.includes('not authorized');
	}

	let statuses = $state<Status[]>([]);
	let nextCursor = $state<string | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let isForbidden = $state(false);
	let actionError = $state<string | null>(null);
	let busyId = $state<string | null>(null);

	let filterReported = $state(true);
	let filterFlagged = $state(false);
	let filterSensitive = $state(false);
	let filterMedia = $state(false);
	let filterLocal = $state(false);
	let filterRemote = $state(false);
	let filterDomain = $state('');

	function buildFilter(): AdminStatusFilter {
		const filter: AdminStatusFilter = {};
		if (filterReported) filter.reported = true;
		if (filterFlagged) filter.flagged = true;
		if (filterSensitive) filter.sensitive = true;
		if (filterMedia) filter.media = true;
		if (filterDomain.trim()) filter.byDomain = filterDomain.trim();

		if (filterLocal && !filterRemote) {
			filter.local = true;
			filter.remote = false;
		}
		if (filterRemote && !filterLocal) {
			filter.remote = true;
			filter.local = false;
		}

		return filter;
	}

	let appliedFilter = $state<AdminStatusFilter>(buildFilter());

	async function refresh(signal?: AbortSignal) {
		error = null;
		isForbidden = false;
		isLoading = true;
		actionError = null;

		try {
			const result = await api.fetchAdminStatuses({ filter: appliedFilter, first: 20, signal });
			statuses = result.statuses;
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

	async function applyFilters() {
		appliedFilter = buildFilter();
		await refresh();
	}

	async function loadMore() {
		if (!nextCursor || isLoading) return;
		isLoading = true;
		error = null;

		try {
			const result = await api.fetchAdminStatuses({ filter: appliedFilter, first: 20, after: nextCursor });
			statuses = [...statuses, ...result.statuses];
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
			statuses = [];
			nextCursor = null;
			isLoading = false;
			error = null;
			isForbidden = false;
			actionError = null;
			busyId = null;
		}
	});

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		if (!token) return;

		const controller = new AbortController();
		void refresh(controller.signal);
		return () => controller.abort();
	});

	async function toggleSensitive(status: Status) {
		if (busyId) return;
		busyId = status.id;
		actionError = null;

		try {
			const next = await api.adminSetStatusSensitive({ id: status.id, sensitive: !Boolean(status.sensitive) });
			statuses = statuses.map((existing) => (existing.id === next.id ? next : existing));
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			busyId = null;
		}
	}

	async function deleteStatus(status: Status) {
		if (busyId) return;
		if (!confirm('Delete this status?')) return;
		busyId = status.id;
		actionError = null;

		try {
			await api.adminDeleteStatus({ id: status.id });
			statuses = statuses.filter((existing) => existing.id !== status.id);
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			busyId = null;
		}
	}
</script>

<svelte:head>
	<title>Admin • Statuses • Simulacrum</title>
</svelte:head>

<div class="admin-surface">
	<div class="admin-surface__header">
		<h2 class="admin-surface__title">Statuses</h2>
	</div>

	<div class="admin-filter-panel">
		<div class="admin-filter-panel__row">
			<label class="admin-filter-panel__check">
				<input type="checkbox" bind:checked={filterReported} />
				Reported
			</label>
			<label class="admin-filter-panel__check">
				<input type="checkbox" bind:checked={filterFlagged} />
				Flagged
			</label>
			<label class="admin-filter-panel__check">
				<input type="checkbox" bind:checked={filterSensitive} />
				Sensitive
			</label>
			<label class="admin-filter-panel__check">
				<input type="checkbox" bind:checked={filterMedia} />
				Media
			</label>
			<label class="admin-filter-panel__check">
				<input type="checkbox" bind:checked={filterLocal} />
				Local
			</label>
			<label class="admin-filter-panel__check">
				<input type="checkbox" bind:checked={filterRemote} />
				Remote
			</label>
			<label class="admin-filter-panel__field">
				<span>Domain</span>
				<input type="text" bind:value={filterDomain} placeholder="example.com" />
			</label>
			<button type="button" class="gr-button gr-button--solid" onclick={applyFilters}>
				Apply
			</button>
		</div>
	</div>

	{#if actionError}
		<div class="page__notice page__notice--error" role="alert">{actionError}</div>
	{/if}

	{#if isForbidden}
		<div class="page__notice page__notice--error" role="alert">
			You don’t have permission to access admin statuses on this instance.
		</div>
	{:else if error}
		<div class="page__notice page__notice--error" role="alert">{error}</div>
	{:else if isLoading && statuses.length === 0}
		<div class="page__notice">Loading statuses…</div>
	{:else if statuses.length === 0}
		<div class="page__notice">No statuses found for the current filters.</div>
	{:else}
		<div class="admin-status-grid">
			{#each statuses as status (status.id)}
				<article class="admin-status-card">
					<header class="admin-status-card__header">
						<div class="admin-status-card__meta">
							<a href={profileHref(status.account.acct)} class="admin-status-card__author">
								@{status.account.acct}
							</a>
							<span class="admin-status-card__time">{new Date(String(status.createdAt)).toLocaleString()}</span>
						</div>

						<div class="admin-status-card__actions">
							<a class="gr-button gr-button--outline" href={statusHref(status.id)}>View</a>
							<button
								type="button"
								class="gr-button gr-button--outline"
								onclick={() => toggleSensitive(status)}
								disabled={busyId === status.id}
							>
								{status.sensitive ? 'Unmark sensitive' : 'Mark sensitive'}
							</button>
							<button
								type="button"
								class="gr-button gr-button--outline"
								onclick={() => deleteStatus(status)}
								disabled={busyId === status.id}
							>
								Delete
							</button>
						</div>
					</header>

					<ContentRenderer content={status.content} spoilerText={status.spoilerText} collapsed />
				</article>
			{/each}
		</div>

		{#if nextCursor}
			<button type="button" class="gr-button gr-button--outline" onclick={loadMore} disabled={isLoading}>
				{isLoading ? 'Loading…' : 'Load more'}
			</button>
		{/if}
	{/if}
</div>

