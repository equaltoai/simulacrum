<script lang="ts">
	import {
		requestSoulPromotion,
		reviewSoulPromotion,
		type ReviewDecisionCard,
		type SoulRequestCard,
		type DroneReviewDecision,
	} from '$lib/api';

	interface Props {
		username?: string | null;
		activeRequest?: SoulRequestCard | null;
		latestReview?: ReviewDecisionCard | null;
		onUpdated?: () => Promise<void> | void;
	}

	let { username = null, activeRequest = null, latestReview = null, onUpdated }: Props = $props();

	let requestTitle = $state('Soul issuance');
	let requestSummary = $state('');
	let requestConstraints = $state('');
	let reviewTitle = $state('Steward review');
	let reviewDecision: DroneReviewDecision = $state('approved');
	let reviewSummary = $state('');
	let loading = $state(false);
	let error: string | null = $state(null);
	let success: string | null = $state(null);

	$effect(() => {
		requestTitle = activeRequest?.title ?? (username ? `Soul issuance for ${username}` : 'Soul issuance');
		requestSummary = activeRequest?.summary ?? '';
		requestConstraints = (activeRequest?.constraints ?? []).join('\n');
		reviewTitle = latestReview?.title ?? 'Steward review';
		reviewDecision = latestReview?.decision ?? 'approved';
		reviewSummary = latestReview?.decisionSummary ?? '';
	});

	function parseConstraints(raw: string): string[] | null {
		const values = raw
			.split(/\r?\n/g)
			.map((entry) => entry.trim())
			.filter(Boolean);
		return values.length ? values : null;
	}

	async function submitRequest() {
		if (!username?.trim()) return;
		loading = true;
		error = null;
		success = null;

		try {
			await requestSoulPromotion({
				input: {
					username: username.trim(),
					title: requestTitle.trim() || undefined,
					summary: requestSummary.trim() || 'Soul promotion requested from Simulacrum.',
					constraints: parseConstraints(requestConstraints),
					routeDecision: activeRequest?.routeDecision ?? null,
					conversationID: null,
				},
			});
			success = 'Soul request recorded from the FaceTheory request lane.';
			await onUpdated?.();
		} catch (submissionError) {
			error =
				submissionError instanceof Error
					? submissionError.message
					: 'Failed to record the soul request.';
		} finally {
			loading = false;
		}
	}

	async function submitReview() {
		if (!username?.trim()) return;
		loading = true;
		error = null;
		success = null;

		try {
			await reviewSoulPromotion({
				input: {
					username: username.trim(),
					title: reviewTitle.trim() || undefined,
					decision: reviewDecision,
					decisionSummary:
						reviewSummary.trim() || 'Review recorded from the Simulacrum approval lane.',
					findings: null,
					evidence: activeRequest?.artifacts?.map((artifact) => ({
						title: artifact.title,
						description: artifact.description ?? null,
						href: artifact.href ?? null,
						emphasis: artifact.emphasis ?? null,
					})) ?? null,
					conversationID: null,
				},
			});
			success = 'Review decision updated from the request center.';
			await onUpdated?.();
		} catch (submissionError) {
			error =
				submissionError instanceof Error
					? submissionError.message
					: 'Failed to record the review decision.';
		} finally {
			loading = false;
		}
	}
</script>

<section class="ft-panel">
	<header class="ft-panel__header">
		<div>
			<p class="ft-panel__eyebrow">Request and review actions</p>
			<h2>Soul request controls</h2>
		</div>
	</header>

	<p class="ft-panel__copy">
		Use the current face surface to create or revise the soul request, then record the review outcome without leaving Simulacrum.
	</p>

	<label class="ft-field">
		<span>Request title</span>
		<input bind:value={requestTitle} disabled={!username || loading} type="text" />
	</label>

	<label class="ft-field">
		<span>Request summary</span>
		<textarea bind:value={requestSummary} disabled={!username || loading} rows="4"></textarea>
	</label>

	<label class="ft-field">
		<span>Constraints</span>
		<textarea
			bind:value={requestConstraints}
			disabled={!username || loading}
			placeholder="One constraint per line"
			rows="4"
		></textarea>
	</label>

	<div class="ft-panel__actions">
		<button class="ft-button ft-button--primary" disabled={!username || loading} onclick={submitRequest} type="button">
			Save request
		</button>
	</div>

	<hr class="ft-panel__divider" />

	<label class="ft-field">
		<span>Review title</span>
		<input bind:value={reviewTitle} disabled={!username || loading} type="text" />
	</label>

	<label class="ft-field">
		<span>Decision</span>
		<select bind:value={reviewDecision} disabled={!username || loading}>
			<option value="approved">Approved</option>
			<option value="changes_requested">Changes requested</option>
			<option value="blocked">Blocked</option>
			<option value="queued">Queued</option>
		</select>
	</label>

	<label class="ft-field">
		<span>Decision summary</span>
		<textarea bind:value={reviewSummary} disabled={!username || loading} rows="4"></textarea>
	</label>

	<div class="ft-panel__actions">
		<button class="ft-button ft-button--primary" disabled={!username || loading} onclick={submitReview} type="button">
			Save review
		</button>
	</div>

	{#if success}
		<p class="ft-panel__message ft-panel__message--success">{success}</p>
	{/if}
	{#if error}
		<p class="ft-panel__message ft-panel__message--error">{error}</p>
	{/if}
</section>
