<script lang="ts">
	import { authSession } from '$lib/auth/session';
	import { getStreamingAdapter } from '$lib/realtime/adapter';

	type Period = 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

	type AICapabilities = {
		textAnalysis: {
			sentimentAnalysis: boolean;
			toxicityDetection: boolean;
			spamDetection: boolean;
			piiDetection: boolean;
			entityExtraction: boolean;
			languageDetection: boolean;
		};
		imageAnalysis: {
			nsfwDetection: boolean;
			violenceDetection: boolean;
			textExtraction: boolean;
			celebrityRecognition: boolean;
			deepfakeDetection: boolean;
		};
		aiDetection: {
			aiGeneratedContent: boolean;
			patternAnalysis: boolean;
			styleConsistency: boolean;
		};
		moderationActions: string[];
		costPerAnalysis: {
			period: string;
			totalCost: number;
			dynamoDBCost: number;
			s3StorageCost: number;
			lambdaCost: number;
			dataTransferCost: number;
			breakdown: Array<{ operation: string; count: number; cost: number }>;
		};
	};

	type AIStats = {
		period: string;
		totalAnalyses: number;
		toxicContent: number;
		spamDetected: number;
		aiGenerated: number;
		nsfwContent: number;
		piiDetected: number;
		toxicityRate: number;
		spamRate: number;
		aiContentRate: number;
		nsfwRate: number;
		moderationActions: {
			flag: number;
			hide: number;
			remove: number;
			review: number;
			shadowBan: number;
		};
	};

	let period = $state<Period>('DAY');

	let capabilities = $state<AICapabilities | null>(null);
	let capabilitiesLoading = $state(false);
	let capabilitiesError = $state<string | null>(null);

	let stats = $state<AIStats | null>(null);
	let statsLoading = $state(false);
	let statsError = $state<string | null>(null);

	let lastRefreshedAt = $state<number | null>(null);

	function formatPercent(value: number): string {
		return `${(value * 100).toFixed(1)}%`;
	}

	function formatCost(microcents: number): string {
		if (!Number.isFinite(microcents)) return '—';
		return `$${(microcents / 1_000_000).toFixed(4)}`;
	}

	async function loadCapabilities() {
		const token = $authSession?.accessToken ?? null;
		if (!token) return;
		const adapter = getStreamingAdapter(token);
		if (!adapter) return;

		capabilitiesLoading = true;
		capabilitiesError = null;
		try {
			capabilities = (await adapter.getAICapabilities()) as unknown as AICapabilities;
		} catch (err) {
			capabilitiesError = err instanceof Error ? err.message : String(err);
		} finally {
			capabilitiesLoading = false;
		}
	}

	async function loadStats() {
		const token = $authSession?.accessToken ?? null;
		if (!token) return;
		const adapter = getStreamingAdapter(token);
		if (!adapter) return;

		statsLoading = true;
		statsError = null;
		try {
			stats = (await adapter.getAIStats(period)) as unknown as AIStats;
		} catch (err) {
			statsError = err instanceof Error ? err.message : String(err);
		} finally {
			statsLoading = false;
		}
	}

	async function refreshAll() {
		await Promise.all([loadCapabilities(), loadStats()]);
		lastRefreshedAt = Date.now();
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		if (!token) {
			capabilities = null;
			stats = null;
			lastRefreshedAt = null;
			return;
		}

		void loadCapabilities();
	});

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		if (!token) return;
		void period;
		void loadStats();
	});
</script>

<svelte:head>
	<title>Admin • AI • Simulacrum</title>
</svelte:head>

<div class="admin-surface">
	<div class="admin-surface__header">
		<h2 class="admin-surface__title">AI</h2>

		<div class="admin-surface__controls">
			<label class="admin-surface__control">
				<span>Period</span>
				<select bind:value={period} aria-label="Select AI stats period">
					<option value="HOUR">Hour</option>
					<option value="DAY">Day</option>
					<option value="WEEK">Week</option>
					<option value="MONTH">Month</option>
					<option value="YEAR">Year</option>
				</select>
			</label>

			<button
				type="button"
				class="gr-button gr-button--outline"
				onclick={refreshAll}
				disabled={capabilitiesLoading || statsLoading}
			>
				Refresh
			</button>
		</div>
	</div>

	{#if lastRefreshedAt}
		<p class="page__meta">Last refreshed: {new Date(lastRefreshedAt).toLocaleString()}</p>
	{/if}

	<div class="admin-detail-card">
		<div class="admin-detail-card__header">
			<h3 class="admin-detail-card__title">Capabilities</h3>
		</div>

		{#if capabilitiesError}
			<div class="page__notice page__notice--error" role="alert">{capabilitiesError}</div>
		{:else if capabilitiesLoading && !capabilities}
			<div class="page__notice">Loading capabilities…</div>
		{:else if capabilities}
			<div class="admin-detail-section">
				<h4>Text analysis</h4>
				<dl class="admin-detail-grid">
					<dt>Sentiment</dt>
					<dd>{capabilities.textAnalysis.sentimentAnalysis ? 'Enabled' : 'Disabled'}</dd>
					<dt>Toxicity</dt>
					<dd>{capabilities.textAnalysis.toxicityDetection ? 'Enabled' : 'Disabled'}</dd>
					<dt>Spam</dt>
					<dd>{capabilities.textAnalysis.spamDetection ? 'Enabled' : 'Disabled'}</dd>
					<dt>PII</dt>
					<dd>{capabilities.textAnalysis.piiDetection ? 'Enabled' : 'Disabled'}</dd>
					<dt>Entities</dt>
					<dd>{capabilities.textAnalysis.entityExtraction ? 'Enabled' : 'Disabled'}</dd>
					<dt>Language</dt>
					<dd>{capabilities.textAnalysis.languageDetection ? 'Enabled' : 'Disabled'}</dd>
				</dl>
			</div>

			<div class="admin-detail-section">
				<h4>Image analysis</h4>
				<dl class="admin-detail-grid">
					<dt>NSFW</dt>
					<dd>{capabilities.imageAnalysis.nsfwDetection ? 'Enabled' : 'Disabled'}</dd>
					<dt>Violence</dt>
					<dd>{capabilities.imageAnalysis.violenceDetection ? 'Enabled' : 'Disabled'}</dd>
					<dt>Text extraction</dt>
					<dd>{capabilities.imageAnalysis.textExtraction ? 'Enabled' : 'Disabled'}</dd>
					<dt>Celebrities</dt>
					<dd>{capabilities.imageAnalysis.celebrityRecognition ? 'Enabled' : 'Disabled'}</dd>
					<dt>Deepfakes</dt>
					<dd>{capabilities.imageAnalysis.deepfakeDetection ? 'Enabled' : 'Disabled'}</dd>
				</dl>
			</div>

			<div class="admin-detail-section">
				<h4>AI detection</h4>
				<dl class="admin-detail-grid">
					<dt>AI generated</dt>
					<dd>{capabilities.aiDetection.aiGeneratedContent ? 'Enabled' : 'Disabled'}</dd>
					<dt>Pattern analysis</dt>
					<dd>{capabilities.aiDetection.patternAnalysis ? 'Enabled' : 'Disabled'}</dd>
					<dt>Style consistency</dt>
					<dd>{capabilities.aiDetection.styleConsistency ? 'Enabled' : 'Disabled'}</dd>
				</dl>
			</div>

			<div class="admin-detail-section">
				<h4>Moderation actions</h4>
				<p>{capabilities.moderationActions.join(', ')}</p>
			</div>

			<div class="admin-detail-section">
				<h4>Estimated cost per analysis (microcents)</h4>
				<dl class="admin-detail-grid">
					<dt>Total</dt>
					<dd>{formatCost(capabilities.costPerAnalysis.totalCost)}</dd>
					<dt>DynamoDB</dt>
					<dd>{formatCost(capabilities.costPerAnalysis.dynamoDBCost)}</dd>
					<dt>S3</dt>
					<dd>{formatCost(capabilities.costPerAnalysis.s3StorageCost)}</dd>
					<dt>Lambda</dt>
					<dd>{formatCost(capabilities.costPerAnalysis.lambdaCost)}</dd>
					<dt>Transfer</dt>
					<dd>{formatCost(capabilities.costPerAnalysis.dataTransferCost)}</dd>
				</dl>
			</div>
		{:else}
			<div class="page__notice">No AI capabilities available.</div>
		{/if}
	</div>

	<div class="admin-detail-card">
		<div class="admin-detail-card__header">
			<h3 class="admin-detail-card__title">Stats</h3>
		</div>

		{#if statsError}
			<div class="page__notice page__notice--error" role="alert">{statsError}</div>
		{:else if statsLoading && !stats}
			<div class="page__notice">Loading stats…</div>
		{:else if stats}
			<div class="admin-detail-section">
				<h4>Summary</h4>
				<dl class="admin-detail-grid">
					<dt>Total analyses</dt>
					<dd>{stats.totalAnalyses}</dd>
					<dt>Toxic content</dt>
					<dd>{stats.toxicContent} ({formatPercent(stats.toxicityRate)})</dd>
					<dt>Spam detected</dt>
					<dd>{stats.spamDetected} ({formatPercent(stats.spamRate)})</dd>
					<dt>AI generated</dt>
					<dd>{stats.aiGenerated} ({formatPercent(stats.aiContentRate)})</dd>
					<dt>NSFW content</dt>
					<dd>{stats.nsfwContent} ({formatPercent(stats.nsfwRate)})</dd>
					<dt>PII detected</dt>
					<dd>{stats.piiDetected}</dd>
				</dl>
			</div>

			<div class="admin-detail-section">
				<h4>Moderation actions</h4>
				<dl class="admin-detail-grid">
					<dt>Flag</dt>
					<dd>{stats.moderationActions.flag}</dd>
					<dt>Hide</dt>
					<dd>{stats.moderationActions.hide}</dd>
					<dt>Remove</dt>
					<dd>{stats.moderationActions.remove}</dd>
					<dt>Review</dt>
					<dd>{stats.moderationActions.review}</dd>
					<dt>Shadow ban</dt>
					<dd>{stats.moderationActions.shadowBan}</dd>
				</dl>
			</div>
		{:else}
			<div class="page__notice">No AI stats available.</div>
		{/if}
	</div>
</div>
