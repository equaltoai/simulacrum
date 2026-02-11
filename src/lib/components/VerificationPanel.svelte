<script lang="ts">
	import { authSession } from '$lib/auth/session';
	import { restRequest, RestRequestError } from '$lib/api/rest';
	import type { Status } from '$lib/types';

	interface Props {
		status: Status;
		class?: string;
	}

	let { status, class: className = '' }: Props = $props();

	type AttestationResponse = {
		id: string;
		jws: string;
		header?: unknown;
		payload: unknown;
	};

	type PublishJobModuleResponse = {
		name: string;
		policy_version: string;
		status: string;
		cached: boolean;
		budget?: unknown;
		attestation_id?: string;
		attestation_url?: string;
		result?: unknown;
	};

	type PublishJobResponse = {
		job_id: string;
		actor_uri?: string;
		object_uri?: string;
		content_hash?: string;
		links_hash: string;
		modules: PublishJobModuleResponse[];
	};

	type ClaimVerifyEvidenceInput = {
		sourceId: string;
		url: string;
		title: string;
		text: string;
	};

	type ClaimVerifyResponse = {
		status: string;
		cached: boolean;
		job_id?: string;
		result?: unknown;
		usage?: unknown;
		errors?: unknown;
		attestation_id?: string;
		attestation_url?: string;
	};

	type AIJobPollResponse = {
		job?: { status?: string; updated_at?: string };
		result?: { result?: unknown; usage?: unknown; errors?: unknown; contract?: unknown };
	};

	const LINK_SAFETY_MODULE = 'link_safety_basic';
	const LINK_SAFETY_POLICY_VERSION = 'v1';
	const CLAIM_VERIFY_MODULE = 'claim_verify_llm';
	const CLAIM_VERIFY_POLICY_VERSION = 'v1';

	let links = $state<string[]>([]);

	let linkSafetyAttestation = $state<AttestationResponse | null>(null);
	let linkSafetyLoading = $state(false);
	let linkSafetyError = $state<string | null>(null);

	let publishJob = $state<PublishJobResponse | null>(null);
	let publishJobRunning = $state(false);
	let publishJobError = $state<string | null>(null);

	let claimVerifyAttestation = $state<AttestationResponse | null>(null);
	let claimVerifyLoading = $state(false);
	let claimVerifyError = $state<string | null>(null);

	let claimText = $state('');
	let claimListText = $state('');
	let claimEvidence = $state<ClaimVerifyEvidenceInput[]>([]);
	let claimRetrievalMode = $state<'provided_only' | 'openai_web_search'>('provided_only');
	let claimVerifyRunning = $state(false);
	let claimVerifyResponse = $state<ClaimVerifyResponse | null>(null);
	let claimVerifyJob = $state<AIJobPollResponse | null>(null);
	let claimVerifyPollError = $state<string | null>(null);

	let showLinkSafetyDetails = $state(false);
	let showClaimVerifyDetails = $state(false);
	let initializedFor = $state<string | null>(null);

	function clampBytes(value: string, maxBytes: number): string {
		if (value === '') return value;
		const bytes = new TextEncoder().encode(value);
		if (bytes.length <= maxBytes) return value;
		return new TextDecoder().decode(bytes.slice(0, maxBytes)).trim();
	}

	function htmlToText(html: string): string {
		if (typeof window === 'undefined') {
			return html.replace(/<[^>]*>/g, '').trim();
		}
		const div = document.createElement('div');
		div.innerHTML = html;
		return (div.textContent ?? '').trim();
	}

	function extractLinksFromHTML(html: string): string[] {
		if (typeof window === 'undefined') return [];
		if (!html) return [];

		const container = document.createElement('div');
		container.innerHTML = html;
		const anchors = Array.from(container.querySelectorAll('a[href]'));
		const out: string[] = [];
		const seen = new Set<string>();
		for (const a of anchors) {
			const href = (a as HTMLAnchorElement).href?.trim();
			if (!href) continue;
			if (!href.startsWith('http://') && !href.startsWith('https://')) continue;
			if (seen.has(href)) continue;
			seen.add(href);
			out.push(href);
		}
		return out.slice(0, 50);
	}

	function formatDate(value: string | Date): string {
		const d = typeof value === 'string' ? new Date(value) : value;
		return new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		}).format(d);
	}

	function attestationPayload(att: AttestationResponse | null): any {
		return (att?.payload ?? null) as any;
	}

	function linkSafetySummary(att: AttestationResponse | null): { overallRisk?: string; totalLinks?: number } | null {
		const payload = attestationPayload(att);
		const summary = payload?.result?.summary;
		if (!summary || typeof summary !== 'object') return null;
		return {
			overallRisk: typeof summary.overall_risk === 'string' ? summary.overall_risk : undefined,
			totalLinks: typeof summary.total_links === 'number' ? summary.total_links : undefined,
		};
	}

	function linkSafetyLinks(att: AttestationResponse | null): Array<{ url: string; risk: string; host?: string; flags?: string[] }> {
		const payload = attestationPayload(att);
		const linksValue = payload?.result?.links;
		if (!Array.isArray(linksValue)) return [];
		return linksValue
			.map((link: any) => ({
				url: typeof link?.url === 'string' ? link.url : '',
				risk: typeof link?.risk === 'string' ? link.risk : 'unknown',
				host: typeof link?.host === 'string' ? link.host : undefined,
				flags: Array.isArray(link?.flags) ? link.flags.filter((f: unknown) => typeof f === 'string') : undefined,
			}))
			.filter((link) => link.url !== '');
	}

	function riskColor(risk: string | undefined): string {
		switch ((risk ?? '').toLowerCase()) {
			case 'low':
				return 'success';
			case 'medium':
				return 'warning';
			case 'high':
			case 'blocked':
				return 'error';
			default:
				return 'gray';
		}
	}

	async function lookupAttestation({
		token,
		actorUri,
		objectUri,
		contentHash,
		module,
		policyVersion,
		signal,
	}: {
		token: string;
		actorUri: string;
		objectUri: string;
		contentHash: string;
		module: string;
		policyVersion: string;
		signal?: AbortSignal;
	}): Promise<AttestationResponse | null> {
		const qs = new URLSearchParams({
			actor_uri: actorUri,
			object_uri: objectUri,
			content_hash: contentHash,
			module,
			policy_version: policyVersion,
		});
		try {
			return await restRequest<AttestationResponse>({
				path: `/api/v1/trust/attestations?${qs.toString()}`,
				token,
				signal,
			});
		} catch (err) {
			if (err instanceof RestRequestError && err.status === 404) return null;
			throw err;
		}
	}

	async function getAttestationById({
		token,
		id,
		signal,
	}: {
		token: string;
		id: string;
		signal?: AbortSignal;
	}): Promise<AttestationResponse> {
		return restRequest<AttestationResponse>({
			path: `/api/v1/trust/attestations/${encodeURIComponent(id)}`,
			token,
			signal,
		});
	}

	$effect(() => {
		const currentStatus = status;
		const statusId = currentStatus?.id ?? null;

		links = extractLinksFromHTML(currentStatus?.content ?? '');

		const nextClaimText = clampBytes(htmlToText(currentStatus?.content ?? ''), 8000);
		claimText = nextClaimText;

		if (statusId !== initializedFor) {
			initializedFor = statusId;

			showLinkSafetyDetails = false;
			showClaimVerifyDetails = false;

			publishJob = null;
			publishJobError = null;

			claimListText = '';
			claimRetrievalMode = 'provided_only';
			claimEvidence = nextClaimText
				? [
						{
							sourceId: 'post',
							url: currentStatus?.uri ?? '',
							title: 'Post content',
							text: nextClaimText,
						},
					]
				: [];

			claimVerifyResponse = null;
			claimVerifyJob = null;
			claimVerifyPollError = null;
		}
	});

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		const actorUri = status?.account?.url?.trim() ?? '';
		const objectUri = status?.uri?.trim() ?? '';
		const contentHash = status?.contentHash?.trim() ?? '';

		linkSafetyAttestation = null;
		linkSafetyLoading = false;
		linkSafetyError = null;

		claimVerifyAttestation = null;
		claimVerifyLoading = false;
		claimVerifyError = null;

		if (!token || !actorUri || !objectUri || !contentHash) return;

		const controller = new AbortController();

		linkSafetyLoading = true;
		claimVerifyLoading = true;

		void (async () => {
			try {
				const [linkAtt, claimAtt] = await Promise.all([
					lookupAttestation({
						token,
						actorUri,
						objectUri,
						contentHash,
						module: LINK_SAFETY_MODULE,
						policyVersion: LINK_SAFETY_POLICY_VERSION,
						signal: controller.signal,
					}),
					lookupAttestation({
						token,
						actorUri,
						objectUri,
						contentHash,
						module: CLAIM_VERIFY_MODULE,
						policyVersion: CLAIM_VERIFY_POLICY_VERSION,
						signal: controller.signal,
					}),
				]);

				linkSafetyAttestation = linkAtt;
				claimVerifyAttestation = claimAtt;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				linkSafetyError = message;
				claimVerifyError = message;
			} finally {
				linkSafetyLoading = false;
				claimVerifyLoading = false;
			}
		})();

		return () => controller.abort();
	});

	async function runPublishJob() {
		const token = $authSession?.accessToken ?? null;
		if (!token || publishJobRunning) return;

		const actorUri = status?.account?.url?.trim() ?? '';
		const objectUri = status?.uri?.trim() ?? '';
		const contentHash = status?.contentHash?.trim() ?? '';

		if (!actorUri || !objectUri || !contentHash) {
			publishJobError = 'Missing actor_uri, object_uri, or content_hash for verification.';
			return;
		}

		publishJobRunning = true;
		publishJobError = null;

		try {
			const response = await restRequest<PublishJobResponse>({
				path: '/api/v1/trust/publish/jobs',
				method: 'POST',
				token,
				body: {
					actor_uri: actorUri,
					object_uri: objectUri,
					content_hash: contentHash,
					links,
				},
			});
			publishJob = response;

			const moduleResp = response.modules?.find((m) => m?.name === LINK_SAFETY_MODULE);
			const attId = moduleResp?.attestation_id?.trim() ?? '';
			if (attId) {
				try {
					linkSafetyAttestation = await getAttestationById({ token, id: attId });
				} catch (err) {
					if (!(err instanceof RestRequestError && err.status === 404)) {
						throw err;
					}
				}
			} else {
				// Fall back to tuple lookup, which also enables "already verified" detection.
				linkSafetyAttestation = await lookupAttestation({
					token,
					actorUri,
					objectUri,
					contentHash,
					module: LINK_SAFETY_MODULE,
					policyVersion: LINK_SAFETY_POLICY_VERSION,
				});
			}
		} catch (err) {
			publishJobError = err instanceof Error ? err.message : String(err);
		} finally {
			publishJobRunning = false;
		}
	}

	function parseClaims(text: string): string[] {
		const claims = text
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
		return Array.from(new Set(claims)).slice(0, 10);
	}

	async function runClaimVerify() {
		const token = $authSession?.accessToken ?? null;
		if (!token || claimVerifyRunning) return;

		const actorUri = status?.account?.url?.trim() ?? '';
		const objectUri = status?.uri?.trim() ?? '';
		const contentHash = status?.contentHash?.trim() ?? '';

		if (!actorUri || !objectUri || !contentHash) {
			claimVerifyError = 'Missing actor_uri, object_uri, or content_hash for verification.';
			return;
		}

		claimVerifyRunning = true;
		claimVerifyError = null;
		claimVerifyPollError = null;
		claimVerifyResponse = null;
		claimVerifyJob = null;

		const claims = parseClaims(claimListText);
		const evidence = claimEvidence
			.map((e) => ({
				source_id: e.sourceId.trim(),
				url: e.url.trim() || undefined,
				title: e.title.trim() || undefined,
				text: clampBytes(e.text.trim(), 8000),
			}))
			.filter((e) => e.source_id && e.text);

		try {
			const response = await restRequest<ClaimVerifyResponse>({
				path: '/api/v1/trust/ai/claims/verify',
				method: 'POST',
				token,
				body: {
					actor_uri: actorUri,
					object_uri: objectUri,
					content_hash: contentHash,
					text: claimText,
					claims,
					evidence,
					retrieval:
						claimRetrievalMode === 'openai_web_search'
							? { mode: 'openai_web_search', max_sources: 3, search_context_size: 'medium' }
							: { mode: 'provided_only' },
				},
			});

			claimVerifyResponse = response;

			const attId = response.attestation_id?.trim() ?? '';
			if (attId && response.status === 'ok') {
				try {
					claimVerifyAttestation = await getAttestationById({ token, id: attId });
				} catch (err) {
					if (!(err instanceof RestRequestError && err.status === 404)) {
						throw err;
					}
				}
			}

			const jobId = response.job_id?.trim() ?? '';
			if (response.status === 'queued' && jobId) {
				for (let i = 0; i < 12; i += 1) {
					await new Promise((resolve) => setTimeout(resolve, 2500));
					try {
						const polled = await restRequest<AIJobPollResponse>({
							path: `/api/v1/trust/ai/jobs/${encodeURIComponent(jobId)}`,
							token,
						});
						claimVerifyJob = polled;
						if (polled?.result?.result) break;
						const statusValue = (polled?.job?.status ?? '').toLowerCase();
						if (statusValue === 'ok' || statusValue === 'error') break;
					} catch (err) {
						claimVerifyPollError = err instanceof Error ? err.message : String(err);
						break;
					}
				}

				if (attId && !claimVerifyAttestation) {
					try {
						claimVerifyAttestation = await getAttestationById({ token, id: attId });
					} catch {
						// ignore
					}
				}
			}
		} catch (err) {
			claimVerifyError = err instanceof Error ? err.message : String(err);
		} finally {
			claimVerifyRunning = false;
		}
	}

	function addEvidence() {
		if (claimEvidence.length >= 5) return;
		claimEvidence = [
			...claimEvidence,
			{
				sourceId: `source_${claimEvidence.length + 1}`,
				url: '',
				title: '',
				text: '',
			},
		];
	}

	function removeEvidence(index: number) {
		claimEvidence = claimEvidence.filter((_, i) => i !== index);
	}
</script>

<section class={`page__notice verification ${className}`} aria-label="Verification">
	<div class="verification__header">
		<h3 class="verification__title">Verification</h3>
		{#if $authSession?.accessToken}
			<div class="verification__actions">
				<button type="button" class="gr-button gr-button--outline" onclick={runPublishJob} disabled={publishJobRunning}>
					{publishJobRunning ? 'Verifying links…' : 'Verify links'}
				</button>
				<button type="button" class="gr-button gr-button--outline" onclick={runClaimVerify} disabled={claimVerifyRunning}>
					{claimVerifyRunning ? 'Verifying claims…' : 'Verify claims'}
				</button>
			</div>
		{/if}
	</div>

	{#if !$authSession}
		<p>Sign in to verify content.</p>
	{:else if !status?.contentHash}
		<p>Verification unavailable: this post is missing a `contentHash`.</p>
	{:else}
		<div class="verification__section">
			<h4 class="verification__subtitle">Link safety</h4>
			{#if linkSafetyLoading}
				<div class="verification__muted">Checking cached attestation…</div>
			{:else if linkSafetyError}
				<div class="page__notice page__notice--error" role="alert">Failed to load link safety: {linkSafetyError}</div>
			{:else if linkSafetyAttestation}
				{@const summary = linkSafetySummary(linkSafetyAttestation)}
				<div class="verification__summary">
					<span
						class={`gr-badge gr-badge--sm gr-badge--outlined gr-badge--${riskColor(summary?.overallRisk)}`}
					>
						Link safety: {summary?.overallRisk ?? 'unknown'}
					</span>
					<span class="verification__muted">
						Verified {formatDate(attestationPayload(linkSafetyAttestation)?.created_at ?? new Date())}
					</span>
					<button type="button" class="gr-button gr-button--ghost" onclick={() => (showLinkSafetyDetails = !showLinkSafetyDetails)}>
						{showLinkSafetyDetails ? 'Hide details' : 'View details'}
					</button>
				</div>
			{:else}
				<div class="verification__muted">No cached attestation found yet.</div>
			{/if}

			{#if publishJobError}
				<div class="page__notice page__notice--error" role="alert">{publishJobError}</div>
			{/if}

			{#if links.length === 0}
				<div class="verification__muted">No external links detected in this post.</div>
			{:else}
				<div class="verification__muted">{links.length} link(s) detected.</div>
			{/if}

			{#if publishJob}
				<details class="verification__details">
					<summary>Last verification job</summary>
					<pre class="settings-token__value">{JSON.stringify(publishJob, null, 2)}</pre>
				</details>
			{/if}

			{#if showLinkSafetyDetails && linkSafetyAttestation}
				<details class="verification__details" open>
					<summary>Attestation</summary>
					<pre class="settings-token__value">{JSON.stringify(linkSafetyAttestation, null, 2)}</pre>
				</details>

				{@const linkResults = linkSafetyLinks(linkSafetyAttestation)}
				{#if linkResults.length > 0}
					<table class="verification__table">
						<thead>
							<tr>
								<th>Link</th>
								<th>Risk</th>
								<th>Flags</th>
							</tr>
						</thead>
						<tbody>
							{#each linkResults as link (link.url)}
								<tr>
									<td class="verification__link-cell">
										<a href={link.url} target="_blank" rel="noreferrer">{link.host ?? link.url}</a>
									</td>
									<td>
										<span class={`gr-badge gr-badge--sm gr-badge--outlined gr-badge--${riskColor(link.risk)}`}>
											{link.risk}
										</span>
									</td>
									<td class="verification__flags">
										{#if link.flags?.length}
											{link.flags.join(', ')}
										{:else}
											<span class="verification__muted">—</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			{/if}
		</div>

		<div class="verification__section">
			<h4 class="verification__subtitle">Claim verification</h4>
			{#if claimVerifyLoading}
				<div class="verification__muted">Checking cached attestation…</div>
			{:else if claimVerifyError}
				<div class="page__notice page__notice--error" role="alert">Failed to load claim verification: {claimVerifyError}</div>
			{:else if claimVerifyAttestation}
				<div class="verification__summary">
					<span class="gr-badge gr-badge--sm gr-badge--outlined gr-badge--primary">Claim attestation: present</span>
					<span class="verification__muted">
						Verified {formatDate(attestationPayload(claimVerifyAttestation)?.created_at ?? new Date())}
					</span>
					<button type="button" class="gr-button gr-button--ghost" onclick={() => (showClaimVerifyDetails = !showClaimVerifyDetails)}>
						{showClaimVerifyDetails ? 'Hide details' : 'View details'}
					</button>
				</div>
			{:else}
				<div class="verification__muted">No cached attestation found yet.</div>
			{/if}

			<div class="verification__form">
				<label class="verification__field">
					<span>Claims (one per line)</span>
					<textarea
						class="compose__input"
						bind:value={claimListText}
						placeholder="e.g. The Earth is flat"
					></textarea>
				</label>

				<label class="verification__field">
					<span>Retrieval mode</span>
					<select class="verification__select" bind:value={claimRetrievalMode}>
						<option value="provided_only">Provided evidence only</option>
						<option value="openai_web_search">OpenAI web search (requires OpenAI model set)</option>
					</select>
				</label>

				<div class="verification__evidence">
					<div class="verification__evidence-header">
						<strong>Evidence</strong>
						<button type="button" class="gr-button gr-button--ghost" onclick={addEvidence}>Add evidence</button>
					</div>

					{#each claimEvidence as item, index (index)}
						<div class="verification__evidence-item">
							<div class="verification__evidence-row">
								<label>
									<span class="verification__muted">Source ID</span>
									<input class="verification__input" bind:value={item.sourceId} />
								</label>
								<label>
									<span class="verification__muted">URL</span>
									<input class="verification__input" bind:value={item.url} />
								</label>
								<label>
									<span class="verification__muted">Title</span>
									<input class="verification__input" bind:value={item.title} />
								</label>
								{#if index !== 0}
									<button type="button" class="gr-button gr-button--ghost" onclick={() => removeEvidence(index)}>
										Remove
									</button>
								{/if}
							</div>
							<label>
								<span class="verification__muted">Evidence text</span>
								<textarea class="compose__input" bind:value={item.text}></textarea>
							</label>
						</div>
					{/each}
				</div>
			</div>

			{#if claimVerifyResponse}
				<details class="verification__details">
					<summary>Claim verify response</summary>
					<pre class="settings-token__value">{JSON.stringify(claimVerifyResponse, null, 2)}</pre>
				</details>
			{/if}

			{#if claimVerifyJob}
				<details class="verification__details">
					<summary>Job</summary>
					<pre class="settings-token__value">{JSON.stringify(claimVerifyJob, null, 2)}</pre>
				</details>
			{/if}

			{#if claimVerifyPollError}
				<div class="page__notice page__notice--error" role="alert">Polling failed: {claimVerifyPollError}</div>
			{/if}

			{#if showClaimVerifyDetails && claimVerifyAttestation}
				<details class="verification__details" open>
					<summary>Attestation</summary>
					<pre class="settings-token__value">{JSON.stringify(claimVerifyAttestation, null, 2)}</pre>
				</details>
			{/if}
		</div>
	{/if}
</section>
