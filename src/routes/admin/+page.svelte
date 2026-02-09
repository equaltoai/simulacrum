<script lang="ts">
	import { api } from '$lib/api';
	import { GraphQLRequestError } from '$lib/api/graphql';
	import { authSession } from '$lib/auth/session';

	type AdminReviewer = Awaited<ReturnType<typeof api.fetchAdminModerationReviewers>>[number];

	let reviewers = $state<AdminReviewer[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let isForbidden = $state(false);

	function isAuthzError(err: unknown): boolean {
		if (!(err instanceof GraphQLRequestError)) return false;
		if (err.status === 401 || err.status === 403) return true;

		const message = err.message.toLowerCase();
		return message.includes('forbidden') || message.includes('unauthorized') || message.includes('not authorized');
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		reviewers = [];
		error = null;
		isForbidden = false;
		isLoading = false;

		if (!token) return;

		const controller = new AbortController();
		isLoading = true;

		void (async () => {
			try {
				reviewers = await api.fetchAdminModerationReviewers({ signal: controller.signal });
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
		})();

		return () => controller.abort();
	});
</script>

<svelte:head>
	<title>Admin • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Admin</h1>

	{#if !$authSession}
		<p>Sign in to access admin tools.</p>
	{:else if isLoading}
		<div class="page__notice">Loading admin tools…</div>
	{:else if isForbidden}
		<div class="page__notice" role="status">
			You don’t have access to admin tools on this instance.
		</div>
	{:else if error}
		<div class="page__notice page__notice--error" role="alert">{error}</div>
	{:else}
		<div class="admin-table">
			<h2 class="admin-table__title">Moderation reviewers</h2>

			{#if reviewers.length === 0}
				<div class="page__notice">No reviewers found.</div>
			{:else}
				<div class="admin-table__scroller">
					<table class="admin-table__table">
						<thead>
							<tr>
								<th scope="col">Username</th>
								<th scope="col">Role</th>
								<th scope="col">Accuracy</th>
								<th scope="col">Reviews</th>
								<th scope="col">Last review</th>
							</tr>
						</thead>
						<tbody>
							{#each reviewers as reviewer (reviewer.id)}
								<tr>
									<td>@{reviewer.username}</td>
									<td>{reviewer.role}</td>
									<td>{Math.round(reviewer.accuracyRate * 100)}%</td>
									<td>
										{reviewer.accurateReviews}/{reviewer.totalReviews}
									</td>
									<td>{reviewer.lastReviewAt ?? '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}
</section>
