<script lang="ts">
	import { base } from '$app/paths';
	import { api, type AdminReportAction, type AdminReportDetail, type AdminReportListItem, type AdminReportStatus } from '$lib/api';
	import { GraphQLRequestError } from '$lib/api/graphql';
	import { authSession } from '$lib/auth/session';
	import ContentRenderer from '$lib/components/ContentRenderer.svelte';
	import AIAnalysisPanel from '$lib/components/AIAnalysisPanel.svelte';
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

	let statusFilter = $state<AdminReportStatus>('OPEN');
	let searchQuery = $state('');
	let selectedReportId = $state<string | null>(null);

	let reports = $state<AdminReportListItem[]>([]);
	let reportsCursor = $state<string | null>(null);
	let isLoadingReports = $state(false);
	let isLoadingMore = $state(false);
	let reportsError = $state<string | null>(null);
	let isForbidden = $state(false);

	let selectedReport = $state<AdminReportDetail | null>(null);
	let isLoadingReport = $state(false);
	let reportError = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let isActing = $state(false);

	const filteredReports = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return reports;
		return reports.filter((report) => {
			const reporter = report.reporter.acct.toLowerCase();
			const target = report.target.acct.toLowerCase();
			const comment = (report.comment ?? '').toLowerCase();
			const category = report.category.toLowerCase();
			return reporter.includes(q) || target.includes(q) || comment.includes(q) || category.includes(q);
		});
	});

	async function refreshReports(signal?: AbortSignal) {
		reportsError = null;
		isForbidden = false;
		isLoadingReports = true;
		selectedReportId = null;
		selectedReport = null;

		try {
			const result = await api.fetchAdminReports({ status: statusFilter, first: 50, signal });
			reports = result.reports;
			reportsCursor = result.nextCursor;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			if (isAuthzError(err)) {
				isForbidden = true;
				return;
			}
			reportsError = err instanceof Error ? err.message : String(err);
		} finally {
			isLoadingReports = false;
		}
	}

	async function loadMore() {
		if (!reportsCursor || isLoadingMore) return;
		isLoadingMore = true;
		actionError = null;

		try {
			const result = await api.fetchAdminReports({ status: statusFilter, first: 50, after: reportsCursor });
			reports = [...reports, ...result.reports];
			reportsCursor = result.nextCursor;
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isLoadingMore = false;
		}
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		if (!token) {
			reports = [];
			reportsCursor = null;
			reportsError = null;
			isForbidden = false;
			isLoadingReports = false;
			searchQuery = '';
			selectedReportId = null;
			selectedReport = null;
		}
	});

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		if (!token) return;

		statusFilter;
		const controller = new AbortController();
		void refreshReports(controller.signal);
		return () => controller.abort();
	});

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		selectedReport = null;
		reportError = null;
		isLoadingReport = false;

		if (!token || !selectedReportId) return;

		const controller = new AbortController();
		isLoadingReport = true;

		void (async () => {
			try {
				selectedReport = await api.fetchAdminReport({ id: selectedReportId, signal: controller.signal });
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				reportError = err instanceof Error ? err.message : String(err);
			} finally {
				isLoadingReport = false;
			}
		})();

		return () => controller.abort();
	});

	async function handleReportAction(action: AdminReportAction) {
		if (!selectedReportId || isActing) return;
		isActing = true;
		actionError = null;

		try {
			await api.adminReportAction({ id: selectedReportId, action });

			const [updated, refreshed] = await Promise.all([
				api.fetchAdminReport({ id: selectedReportId }),
				api.fetchAdminReports({ status: statusFilter, first: 50 }),
			]);

			selectedReport = updated;
			reports = refreshed.reports;
			reportsCursor = refreshed.nextCursor;
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isActing = false;
		}
	}

	async function handleToggleSensitive(status: Status) {
		if (isActing) return;
		isActing = true;
		actionError = null;

		try {
			const next = await api.adminSetStatusSensitive({ id: status.id, sensitive: !Boolean(status.sensitive) });
			selectedReport = selectedReport
				? {
						...selectedReport,
						statuses: selectedReport.statuses.map((existing) => (existing.id === next.id ? next : existing)),
					}
				: selectedReport;
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isActing = false;
		}
	}

	async function handleDeleteStatus(status: Status) {
		if (isActing) return;
		if (!confirm('Delete this status?')) return;
		isActing = true;
		actionError = null;

		try {
			await api.adminDeleteStatus({ id: status.id });
			selectedReport = selectedReport
				? { ...selectedReport, statuses: selectedReport.statuses.filter((s) => s.id !== status.id) }
				: selectedReport;
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			isActing = false;
		}
	}
</script>

<svelte:head>
	<title>Admin • Reports • Simulacrum</title>
</svelte:head>

<div class="admin-surface">
	<div class="admin-surface__header">
		<h2 class="admin-surface__title">Reports</h2>

		<div class="admin-surface__controls">
			<label class="admin-surface__control">
				<span>Status</span>
				<select bind:value={statusFilter} aria-label="Filter reports by status">
					<option value="OPEN">Open</option>
					<option value="RESOLVED">Resolved</option>
					<option value="REJECTED">Rejected</option>
				</select>
			</label>

			<label class="admin-surface__control admin-surface__control--grow">
				<span>Search</span>
				<input
					type="search"
					bind:value={searchQuery}
					placeholder="Search reporter, target, category, or comment…"
					aria-label="Search reports"
				/>
			</label>

			<button type="button" class="gr-button gr-button--outline" onclick={() => refreshReports()}>
				Refresh
			</button>
		</div>
	</div>

	{#if isForbidden}
		<div class="page__notice page__notice--error" role="alert">
			You don’t have permission to access admin reports on this instance.
		</div>
	{:else if reportsError}
		<div class="page__notice page__notice--error" role="alert">{reportsError}</div>
	{:else if isLoadingReports}
		<div class="page__notice">Loading reports…</div>
	{:else}
		<div class="admin-split">
			<div class="admin-split__list" role="list" aria-label="Reports list">
				{#if filteredReports.length === 0}
					<div class="page__notice">No reports found.</div>
				{:else}
					{#each filteredReports as report (report.id)}
						<button
							type="button"
							class="admin-list-card"
							class:admin-list-card--selected={report.id === selectedReportId}
							onclick={() => (selectedReportId = report.id)}
						>
							<div class="admin-list-card__title">
								<strong>@{report.reporter.acct}</strong>
								<span>→</span>
								<strong>@{report.target.acct}</strong>
							</div>
							<div class="admin-list-card__meta">
								<span>{report.category}</span>
								<span>•</span>
								<span>{new Date(report.createdAt).toLocaleString()}</span>
								<span>•</span>
								<span>{report.statuses.length} status{report.statuses.length === 1 ? '' : 'es'}</span>
								{#if report.assignedAccount}
									<span>•</span>
									<span>Assigned: @{report.assignedAccount.acct}</span>
								{/if}
							</div>
							{#if report.comment}
								<div class="admin-list-card__body">{report.comment}</div>
							{/if}
						</button>
					{/each}
				{/if}

				{#if reportsCursor}
					<button type="button" class="gr-button gr-button--outline" onclick={loadMore} disabled={isLoadingMore}>
						{isLoadingMore ? 'Loading…' : 'Load more'}
					</button>
				{/if}
			</div>

			<div class="admin-split__detail" aria-label="Report details">
				{#if actionError}
					<div class="page__notice page__notice--error" role="alert">{actionError}</div>
				{/if}

				{#if !selectedReportId}
					<div class="page__notice">Select a report to view details.</div>
				{:else if isLoadingReport}
					<div class="page__notice">Loading report…</div>
				{:else if reportError}
					<div class="page__notice page__notice--error" role="alert">{reportError}</div>
				{:else if selectedReport}
					<div class="admin-detail-card">
						<div class="admin-detail-card__header">
							<h3 class="admin-detail-card__title">Report</h3>
							<div class="admin-detail-card__actions">
								{#if statusFilter === 'OPEN'}
									<button
										type="button"
										class="gr-button gr-button--outline"
										onclick={() => handleReportAction('ASSIGN_TO_SELF')}
										disabled={isActing}
									>
										Assign to me
									</button>
									<button
										type="button"
										class="gr-button gr-button--outline"
										onclick={() => handleReportAction('UNASSIGN')}
										disabled={isActing}
									>
										Unassign
									</button>
									<button
										type="button"
										class="gr-button gr-button--solid"
										onclick={() => handleReportAction('RESOLVE')}
										disabled={isActing}
									>
										Resolve
									</button>
								{:else}
									<button
										type="button"
										class="gr-button gr-button--solid"
										onclick={() => handleReportAction('REOPEN')}
										disabled={isActing}
									>
										Reopen
									</button>
								{/if}
							</div>
						</div>

						<dl class="admin-detail-grid">
							<dt>ID</dt>
							<dd>{selectedReport.id}</dd>

							<dt>Category</dt>
							<dd>{selectedReport.category}</dd>

							<dt>Reporter</dt>
							<dd>
								<a href={profileHref(selectedReport.reporter.acct)}>@{selectedReport.reporter.acct}</a>
							</dd>

							<dt>Target</dt>
							<dd>
								<a href={profileHref(selectedReport.target.acct)}>@{selectedReport.target.acct}</a>
							</dd>

							<dt>Status</dt>
							<dd>{statusFilter}</dd>

							<dt>Created</dt>
							<dd>{new Date(selectedReport.createdAt).toLocaleString()}</dd>

							<dt>Updated</dt>
							<dd>{new Date(selectedReport.updatedAt).toLocaleString()}</dd>

							{#if selectedReport.assignedAccount}
								<dt>Assigned</dt>
								<dd>@{selectedReport.assignedAccount.acct}</dd>
							{/if}

							{#if selectedReport.actionTakenBy}
								<dt>Action by</dt>
								<dd>@{selectedReport.actionTakenBy.acct}</dd>
							{/if}
						</dl>

						{#if selectedReport.comment}
							<div class="admin-detail-section">
								<h4>Comment</h4>
								<p>{selectedReport.comment}</p>
							</div>
						{/if}

						<div class="admin-detail-section">
							<h4>Statuses</h4>
							{#if selectedReport.statuses.length === 0}
								<div class="page__notice">No statuses attached to this report.</div>
							{:else}
								<div class="admin-status-grid">
									{#each selectedReport.statuses as status (status.id)}
										<article class="admin-status-card">
											<header class="admin-status-card__header">
												<div class="admin-status-card__meta">
													<a href={profileHref(status.account.acct)} class="admin-status-card__author">
														@{status.account.acct}
													</a>
													<span class="admin-status-card__time">
														{new Date(String(status.createdAt)).toLocaleString()}
													</span>
												</div>

												<div class="admin-status-card__actions">
													<a class="gr-button gr-button--outline" href={statusHref(status.id)}>
														View
													</a>
													<button
														type="button"
														class="gr-button gr-button--outline"
														onclick={() => handleToggleSensitive(status)}
														disabled={isActing}
													>
														{status.sensitive ? 'Unmark sensitive' : 'Mark sensitive'}
													</button>
													<button
														type="button"
														class="gr-button gr-button--outline"
														onclick={() => handleDeleteStatus(status)}
														disabled={isActing}
													>
														Delete
													</button>
												</div>
											</header>

											<ContentRenderer content={status.content} spoilerText={status.spoilerText} collapsed />

											<AIAnalysisPanel objectId={status.id} variant="summary" />
										</article>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
