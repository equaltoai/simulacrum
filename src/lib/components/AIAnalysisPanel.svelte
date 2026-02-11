<script lang="ts">
	import { authSession } from '$lib/auth/session';
	import { getStreamingAdapter } from '$lib/realtime/adapter';
	import type { AIAnalysis } from '$lib/greater/adapters';

	interface Props {
		objectId: string;
		autoRequest?: boolean;
		variant?: 'full' | 'summary';
		class?: string;
	}

	let { objectId, autoRequest = false, variant = 'full', class: className = '' }: Props = $props();

	let analysis = $state<AIAnalysis | null>(null);
	let loading = $state(false);
	let requesting = $state(false);
	let awaitingUpdate = $state(false);
	let requestMessage = $state<string | null>(null);
	let error = $state<string | null>(null);
	let realtimeError = $state<string | null>(null);
	let lastUpdatedAt = $state<number | null>(null);
	let autoRequestedFor = $state<string | null>(null);
	let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

	type Severity = 'danger' | 'warning' | 'success';

	function getSeverity(score: number): Severity {
		if (score >= 0.8) return 'danger';
		if (score >= 0.5) return 'warning';
		return 'success';
	}

	function formatPercent(value: number): string {
		return `${(value * 100).toFixed(1)}%`;
	}

	const overallRiskPercent = $derived.by(() =>
		analysis ? Math.max(0, Math.min(100, analysis.overallRisk * 100)) : 0
	);
	const overallRiskSeverity = $derived.by(() =>
		analysis ? getSeverity(analysis.overallRisk) : 'success'
	);

	async function requestAnalysis(options: { force?: boolean } = {}) {
		const token = $authSession?.accessToken ?? null;
		if (!token || !objectId || requesting) return;

		const adapter = getStreamingAdapter(token);
		if (!adapter) return;

		requesting = true;
		error = null;
		requestMessage = null;

		try {
			const response = await adapter.requestAIAnalysis(objectId, undefined, options.force);
			requestMessage = response?.message ?? null;
			awaitingUpdate = true;

			if (fallbackTimer) clearTimeout(fallbackTimer);
			fallbackTimer = setTimeout(() => {
				const nextToken = $authSession?.accessToken ?? null;
				if (!nextToken || !objectId) return;
				const nextAdapter = getStreamingAdapter(nextToken);
				if (!nextAdapter) return;

				void (async () => {
					try {
						const refreshed = await nextAdapter.getAIAnalysis(objectId);
						if (!refreshed) return;
						analysis = refreshed;
						awaitingUpdate = false;
						lastUpdatedAt = Date.now();
					} catch (err) {
						console.warn('Failed to refresh AI analysis after request:', err);
					}
				})();
			}, 7000);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			requesting = false;
		}
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		const id = objectId;

		analysis = null;
		loading = false;
		error = null;
		realtimeError = null;
		requestMessage = null;
		awaitingUpdate = false;
		lastUpdatedAt = null;

		if (!token || !id) {
			autoRequestedFor = null;
			return;
		}

		const adapter = getStreamingAdapter(token);
		if (!adapter) return;

		let cancelled = false;
		loading = true;

		void (async () => {
			try {
				const result = await adapter.getAIAnalysis(id);
				if (cancelled) return;

				analysis = result ?? null;
				lastUpdatedAt = Date.now();

				if (!result && autoRequest && autoRequestedFor !== id) {
					autoRequestedFor = id;
					await requestAnalysis();
				}
			} catch (err) {
				if (cancelled) return;
				error = err instanceof Error ? err.message : String(err);
			} finally {
				if (cancelled) return;
				loading = false;
			}
		})();

		const subscription = adapter.subscribeToAiAnalysisUpdates({ objectId: id }).subscribe({
			next: (result) => {
				const update = result.data?.aiAnalysisUpdates;
				if (!update) return;
				analysis = update;
				awaitingUpdate = false;
				lastUpdatedAt = Date.now();
				if (fallbackTimer) clearTimeout(fallbackTimer);
				fallbackTimer = null;
			},
			error: (err) => {
				const message =
					err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to subscribe to AI updates';
				realtimeError = message;
			},
		});

		return () => {
			cancelled = true;
			subscription.unsubscribe();
			if (fallbackTimer) clearTimeout(fallbackTimer);
			fallbackTimer = null;
		};
	});
</script>

<div class={`ai-analysis ${className}`}>
	<div class="ai-analysis__header">
		<h3 class="ai-analysis__title">AI Analysis</h3>
		{#if $authSession?.accessToken}
			<button class="ai-analysis__refresh" onclick={() => requestAnalysis()} disabled={requesting} type="button">
				{requesting ? 'Requesting...' : 'Request Analysis'}
			</button>
		{/if}
	</div>

	{#if requestMessage}
		<div class="page__notice">{requestMessage}</div>
	{/if}

	{#if awaitingUpdate}
		<div class="page__notice">Waiting for analysis results…</div>
	{/if}
	{#if realtimeError}
		<div class="page__notice">Realtime updates unavailable: {realtimeError}</div>
	{/if}

	{#if !$authSession}
		<div class="ai-analysis__empty">
			<p>Sign in to view AI analysis.</p>
		</div>
	{:else if loading}
		<div class="ai-analysis__loading">
			<p>Loading AI analysis...</p>
		</div>
	{:else if error}
		<div class="ai-analysis__error">
			<p>Error: {error}</p>
			<button onclick={() => requestAnalysis({ force: true })} type="button" disabled={requesting}>
				{requesting ? 'Requesting...' : 'Force Re-run'}
			</button>
		</div>
	{:else if !analysis}
		<div class="ai-analysis__empty">
			<p>No AI analysis available for this content.</p>
		</div>
	{:else}
		<div class="ai-analysis__content">
			<div class="ai-analysis__section">
				<h4 class="ai-analysis__section-title">Overall Assessment</h4>
				<div class="ai-analysis__risk">
					<div class="ai-analysis__risk-meter">
						<svg
							class="ai-analysis__risk-meter-svg"
							viewBox="0 0 100 1"
							preserveAspectRatio="none"
							aria-hidden="true"
						>
							<rect
								class={`ai-analysis__risk-fill ai-analysis__risk-fill--${overallRiskSeverity}`}
								x="0"
								y="0"
								width={overallRiskPercent}
								height="1"
							/>
						</svg>
					</div>
					<div class="ai-analysis__risk-info">
						<span class="ai-analysis__risk-score">{formatPercent(analysis.overallRisk)} Risk</span>
						<span class="ai-analysis__risk-action">Suggested action: {analysis.moderationAction}</span>
						<span class="ai-analysis__risk-confidence">Confidence: {formatPercent(analysis.confidence)}</span>
					</div>
				</div>
			</div>

			{#if variant === 'full'}
				{#if analysis.textAnalysis}
					<div class="ai-analysis__section">
						<h4 class="ai-analysis__section-title">Text Analysis</h4>
						<dl class="ai-analysis__details">
							<dt>Sentiment:</dt>
							<dd>{analysis.textAnalysis.sentiment}</dd>

							<dt>Toxicity:</dt>
							<dd
								class={`ai-analysis__severity ai-analysis__severity--${getSeverity(
									analysis.textAnalysis.toxicityScore
								)}`}
							>
								{formatPercent(analysis.textAnalysis.toxicityScore)}
							</dd>

							{#if analysis.textAnalysis.containsPII}
								<dt>PII Detected:</dt>
								<dd class="ai-analysis__warning">Yes</dd>
							{/if}

							<dt>Language:</dt>
							<dd>{analysis.textAnalysis.dominantLanguage}</dd>

							{#if analysis.textAnalysis.keyPhrases?.length}
								<dt>Key phrases:</dt>
								<dd>{analysis.textAnalysis.keyPhrases.slice(0, 6).join(', ')}</dd>
							{/if}
						</dl>
					</div>
				{/if}

				{#if analysis.imageAnalysis}
					<div class="ai-analysis__section">
						<h4 class="ai-analysis__section-title">Image Analysis</h4>
						<dl class="ai-analysis__details">
							{#if analysis.imageAnalysis.isNSFW}
								<dt>NSFW:</dt>
								<dd class="ai-analysis__warning">
									Yes ({formatPercent(analysis.imageAnalysis.nsfwConfidence)} confidence)
								</dd>
							{/if}

							<dt>Violence Score:</dt>
							<dd
								class={`ai-analysis__severity ai-analysis__severity--${getSeverity(
									analysis.imageAnalysis.violenceScore
								)}`}
							>
								{formatPercent(analysis.imageAnalysis.violenceScore)}
							</dd>

							{#if (analysis.imageAnalysis.deepfakeScore ?? 0) > 0.5}
								<dt>Deepfake:</dt>
								<dd class="ai-analysis__warning">
									Possible ({formatPercent(analysis.imageAnalysis.deepfakeScore ?? 0)} confidence)
								</dd>
							{/if}
						</dl>
					</div>
				{/if}

				{#if analysis.aiDetection}
					<div class="ai-analysis__section">
						<h4 class="ai-analysis__section-title">AI Content Detection</h4>
						<dl class="ai-analysis__details">
							<dt>AI Generated:</dt>
							<dd
								class={`ai-analysis__severity ai-analysis__severity--${getSeverity(
									analysis.aiDetection.aiGeneratedProbability
								)}`}
							>
								{formatPercent(analysis.aiDetection.aiGeneratedProbability)}
							</dd>

							{#if analysis.aiDetection.generationModel}
								<dt>Model:</dt>
								<dd>{analysis.aiDetection.generationModel}</dd>
							{/if}
						</dl>
					</div>
				{/if}

				{#if analysis.spamAnalysis}
					<div class="ai-analysis__section">
						<h4 class="ai-analysis__section-title">Spam Detection</h4>
						<dl class="ai-analysis__details">
							<dt>Spam Score:</dt>
							<dd
								class={`ai-analysis__severity ai-analysis__severity--${getSeverity(
									analysis.spamAnalysis.spamScore
								)}`}
							>
								{formatPercent(analysis.spamAnalysis.spamScore)}
							</dd>

							<dt>Indicators:</dt>
							<dd>
								{#each analysis.spamAnalysis.spamIndicators.slice(0, 3) as indicator (indicator.type)}
									<span class="ai-analysis__tag">{indicator.type}</span>
								{/each}
							</dd>
						</dl>
					</div>
				{/if}
			{/if}

			<div class="ai-analysis__footer">
				<small>Analyzed: {new Date(analysis.analyzedAt).toLocaleString()}</small>
				{#if lastUpdatedAt}
					<small>• Updated: {new Date(lastUpdatedAt).toLocaleTimeString()}</small>
				{/if}
			</div>
		</div>
	{/if}
</div>
