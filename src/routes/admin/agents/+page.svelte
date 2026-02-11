<script lang="ts">
	import { api, type AdminAgentPolicy, type Agent } from '$lib/api';
	import { GraphQLRequestError } from '$lib/api/graphql';
	import { authSession } from '$lib/auth/session';

	function isAuthzError(err: unknown): boolean {
		if (!(err instanceof GraphQLRequestError)) return false;
		if (err.status === 401 || err.status === 403) return true;
		const message = err.message.toLowerCase();
		return message.includes('forbidden') || message.includes('unauthorized') || message.includes('not authorized');
	}

	let policy = $state<AdminAgentPolicy | null>(null);
	let isLoadingPolicy = $state(false);
	let isSavingPolicy = $state(false);
	let policyError = $state<string | null>(null);
	let isForbidden = $state(false);

	let allowAgents = $state(false);
	let allowAgentRegistration = $state(false);
	let defaultQuarantineDays = $state(7);
	let maxAgentsPerOwner = $state(5);
	let allowRemoteAgents = $state(false);
	let remoteQuarantineDays = $state(7);
	let blockedAgentDomainsDraft = $state('');
	let trustedAgentDomainsDraft = $state('');
	let agentMaxPostsPerHour = $state(30);
	let verifiedAgentMaxPostsPerHour = $state(60);
	let agentMaxFollowsPerHour = $state(30);
	let verifiedAgentMaxFollowsPerHour = $state(60);
	let hybridRetrievalEnabled = $state(false);
	let hybridRetrievalMaxCandidates = $state(50);

	let username = $state('');
	let reason = $state('');
	let exitQuarantine = $state(false);
	let agentResult = $state<Agent | null>(null);
	let agentError = $state<string | null>(null);
	let isActing = $state(false);

	function hydratePolicyDrafts(next: AdminAgentPolicy) {
		allowAgents = next.allowAgents;
		allowAgentRegistration = next.allowAgentRegistration;
		defaultQuarantineDays = next.defaultQuarantineDays;
		maxAgentsPerOwner = next.maxAgentsPerOwner;
		allowRemoteAgents = next.allowRemoteAgents;
		remoteQuarantineDays = next.remoteQuarantineDays;
		blockedAgentDomainsDraft = next.blockedAgentDomains.join('\n');
		trustedAgentDomainsDraft = next.trustedAgentDomains.join('\n');
		agentMaxPostsPerHour = next.agentMaxPostsPerHour;
		verifiedAgentMaxPostsPerHour = next.verifiedAgentMaxPostsPerHour;
		agentMaxFollowsPerHour = next.agentMaxFollowsPerHour;
		verifiedAgentMaxFollowsPerHour = next.verifiedAgentMaxFollowsPerHour;
		hybridRetrievalEnabled = next.hybridRetrievalEnabled;
		hybridRetrievalMaxCandidates = next.hybridRetrievalMaxCandidates;
	}

	function parseDomains(value: string): string[] {
		return value
			.split(/[\n,]/)
			.map((entry) => entry.trim())
			.filter(Boolean);
	}

	async function refreshPolicy(signal?: AbortSignal) {
		isLoadingPolicy = true;
		policyError = null;
		isForbidden = false;

		try {
			const next = await api.fetchAdminAgentPolicy({ signal });
			policy = next;
			hydratePolicyDrafts(next);
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			if (isAuthzError(err)) {
				isForbidden = true;
				return;
			}
			policyError = err instanceof Error ? err.message : String(err);
		} finally {
			isLoadingPolicy = false;
		}
	}

	async function savePolicy() {
		if (isSavingPolicy) return;
		policyError = null;
		isForbidden = false;

		isSavingPolicy = true;
		try {
			const updated = await api.updateAdminAgentPolicy({
				input: {
					allowAgents,
					allowAgentRegistration,
					defaultQuarantineDays,
					maxAgentsPerOwner,
					allowRemoteAgents,
					remoteQuarantineDays,
					blockedAgentDomains: parseDomains(blockedAgentDomainsDraft),
					trustedAgentDomains: parseDomains(trustedAgentDomainsDraft),
					agentMaxPostsPerHour,
					verifiedAgentMaxPostsPerHour,
					agentMaxFollowsPerHour,
					verifiedAgentMaxFollowsPerHour,
					hybridRetrievalEnabled,
					hybridRetrievalMaxCandidates,
				},
			});
			policy = updated;
			hydratePolicyDrafts(updated);
		} catch (err) {
			if (isAuthzError(err)) {
				isForbidden = true;
				return;
			}
			policyError = err instanceof Error ? err.message : String(err);
		} finally {
			isSavingPolicy = false;
		}
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		if (!token) {
			policy = null;
			isLoadingPolicy = false;
			isSavingPolicy = false;
			policyError = null;
			isForbidden = false;
			username = '';
			reason = '';
			exitQuarantine = false;
			agentResult = null;
			agentError = null;
			isActing = false;
		}
	});

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		if (!token) return;

		const controller = new AbortController();
		void refreshPolicy(controller.signal);
		return () => controller.abort();
	});

	async function handleVerify(unverify = false) {
		if (!username.trim() || isActing) return;
		isActing = true;
		agentError = null;
		agentResult = null;

		try {
			const input = {
				...(reason.trim() ? { reason: reason.trim() } : {}),
				...(exitQuarantine ? { exitQuarantine: true } : {}),
			};

			agentResult = unverify
				? await api.adminUnverifyAgent({ username: username.trim(), input })
				: await api.adminVerifyAgent({ username: username.trim(), input });
		} catch (err) {
			if (isAuthzError(err)) {
				isForbidden = true;
				return;
			}
			agentError = err instanceof Error ? err.message : String(err);
		} finally {
			isActing = false;
		}
	}

	async function handleSuspend() {
		if (!username.trim() || isActing) return;
		isActing = true;
		agentError = null;
		agentResult = null;

		try {
			agentResult = await api.adminSuspendAgent({ username: username.trim() });
		} catch (err) {
			if (isAuthzError(err)) {
				isForbidden = true;
				return;
			}
			agentError = err instanceof Error ? err.message : String(err);
		} finally {
			isActing = false;
		}
	}
</script>

<svelte:head>
	<title>Admin • Agents • Simulacrum</title>
</svelte:head>

<div class="admin-surface">
	<div class="admin-surface__header">
		<h2 class="admin-surface__title">Agents</h2>
	</div>

	{#if isForbidden}
		<div class="page__notice page__notice--error" role="alert">
			You don’t have permission to access agent governance on this instance.
		</div>
	{:else}
		<div class="admin-grid-2">
			<div class="admin-panel">
				<h3>Agent policy</h3>

				{#if policyError}
					<div class="page__notice page__notice--error" role="alert">{policyError}</div>
				{/if}

				{#if isLoadingPolicy && !policy}
					<div class="page__notice">Loading policy…</div>
				{:else}
					<form
						class="admin-form-grid"
						onsubmit={(event) => {
							event.preventDefault();
							void savePolicy();
						}}
					>
						<label class="admin-surface__control">
							<span>Allow agents</span>
							<input type="checkbox" bind:checked={allowAgents} />
						</label>
						<label class="admin-surface__control">
							<span>Allow registration</span>
							<input type="checkbox" bind:checked={allowAgentRegistration} />
						</label>
						<label class="admin-surface__control">
							<span>Default quarantine (days)</span>
							<input type="number" min="0" step="1" bind:value={defaultQuarantineDays} />
						</label>
						<label class="admin-surface__control">
							<span>Max agents per owner</span>
							<input type="number" min="0" step="1" bind:value={maxAgentsPerOwner} />
						</label>
						<label class="admin-surface__control">
							<span>Allow remote agents</span>
							<input type="checkbox" bind:checked={allowRemoteAgents} />
						</label>
						<label class="admin-surface__control">
							<span>Remote quarantine (days)</span>
							<input type="number" min="0" step="1" bind:value={remoteQuarantineDays} />
						</label>

						<label class="admin-surface__control admin-surface__control--grow">
							<span>Blocked agent domains</span>
							<textarea rows="4" bind:value={blockedAgentDomainsDraft} placeholder="one per line"></textarea>
						</label>
						<label class="admin-surface__control admin-surface__control--grow">
							<span>Trusted agent domains</span>
							<textarea rows="4" bind:value={trustedAgentDomainsDraft} placeholder="one per line"></textarea>
						</label>

						<label class="admin-surface__control">
							<span>Agent max posts/hour</span>
							<input type="number" min="0" step="1" bind:value={agentMaxPostsPerHour} />
						</label>
						<label class="admin-surface__control">
							<span>Verified max posts/hour</span>
							<input type="number" min="0" step="1" bind:value={verifiedAgentMaxPostsPerHour} />
						</label>
						<label class="admin-surface__control">
							<span>Agent max follows/hour</span>
							<input type="number" min="0" step="1" bind:value={agentMaxFollowsPerHour} />
						</label>
						<label class="admin-surface__control">
							<span>Verified max follows/hour</span>
							<input type="number" min="0" step="1" bind:value={verifiedAgentMaxFollowsPerHour} />
						</label>
						<label class="admin-surface__control">
							<span>Hybrid retrieval enabled</span>
							<input type="checkbox" bind:checked={hybridRetrievalEnabled} />
						</label>
						<label class="admin-surface__control">
							<span>Hybrid max candidates</span>
							<input type="number" min="1" step="1" bind:value={hybridRetrievalMaxCandidates} />
						</label>

						{#if policy?.updatedAt}
							<div class="page__meta admin-surface__control admin-surface__control--grow">
								Last updated: {new Date(policy.updatedAt).toLocaleString()}
							</div>
						{/if}

						<div class="admin-row-actions">
							<button type="submit" class="gr-button gr-button--solid" disabled={isSavingPolicy}>
								{isSavingPolicy ? 'Saving…' : 'Save'}
							</button>
							<button type="button" class="gr-button gr-button--outline" onclick={() => refreshPolicy()} disabled={isLoadingPolicy}>
								Refresh
							</button>
						</div>
					</form>
				{/if}
			</div>

			<div class="admin-panel">
				<h3>Verify / unverify agent</h3>

				<div class="admin-form-grid">
					<label class="admin-surface__control">
						<span>Username</span>
						<input type="text" bind:value={username} placeholder="agent_username" />
					</label>
					<label class="admin-surface__control admin-surface__control--grow">
						<span>Reason</span>
						<input type="text" bind:value={reason} placeholder="Optional" />
					</label>
					<label class="admin-filter-panel__check">
						<input type="checkbox" bind:checked={exitQuarantine} />
						Exit quarantine
					</label>
				</div>

				<div class="admin-row-actions">
					<button
						type="button"
						class="gr-button gr-button--solid"
						onclick={() => handleVerify(false)}
						disabled={isActing || !username.trim()}
					>
						Verify
					</button>
					<button
						type="button"
						class="gr-button gr-button--outline"
						onclick={() => handleVerify(true)}
						disabled={isActing || !username.trim()}
					>
						Unverify
					</button>
					<button
						type="button"
						class="gr-button gr-button--outline"
						onclick={handleSuspend}
						disabled={isActing || !username.trim()}
					>
						Suspend
					</button>
				</div>

				{#if agentError}
					<div class="page__notice page__notice--error" role="alert">{agentError}</div>
				{/if}

				{#if agentResult}
					<pre class="admin-json">{JSON.stringify(agentResult, null, 2)}</pre>
				{/if}
			</div>
		</div>
	{/if}
</div>
