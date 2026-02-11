<script lang="ts">
	import { api } from '$lib/api';
	import { RestRequestError } from '$lib/api/rest';
	import { authSession } from '$lib/auth/session';

	function isAuthzError(err: unknown): boolean {
		return err instanceof RestRequestError && (err.status === 401 || err.status === 403);
	}

	let policyJson = $state('');
	let isLoadingPolicy = $state(false);
	let isSavingPolicy = $state(false);
	let policyError = $state<string | null>(null);
	let isForbidden = $state(false);

	let username = $state('');
	let reason = $state('');
	let exitQuarantine = $state(false);
	let agentResult = $state<Record<string, unknown> | null>(null);
	let agentError = $state<string | null>(null);
	let isActing = $state(false);

	async function refreshPolicy(signal?: AbortSignal) {
		isLoadingPolicy = true;
		policyError = null;
		isForbidden = false;

		try {
			const policy = await api.fetchAdminAgentPolicy({ signal });
			policyJson = JSON.stringify(policy, null, 2);
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

		let parsed: unknown;
		try {
			parsed = JSON.parse(policyJson);
		} catch {
			policyError = 'Policy JSON is invalid.';
			return;
		}

		if (typeof parsed !== 'object' || !parsed) {
			policyError = 'Policy must be a JSON object.';
			return;
		}

		isSavingPolicy = true;
		try {
			const updated = await api.updateAdminAgentPolicy({ policy: parsed as Record<string, unknown> });
			policyJson = JSON.stringify(updated, null, 2);
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
			policyJson = '';
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
			const body = {
				...(reason.trim() ? { reason: reason.trim() } : {}),
				...(exitQuarantine ? { exit_quarantine: true } : {}),
			};

			agentResult = unverify
				? await api.unverifyAgent({ username: username.trim(), body })
				: await api.verifyAgent({ username: username.trim(), body });
		} catch (err) {
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

				{#if isLoadingPolicy && !policyJson}
					<div class="page__notice">Loading policy…</div>
				{:else}
					<textarea class="admin-json" rows="18" bind:value={policyJson} spellcheck="false"></textarea>
					<div class="admin-row-actions">
						<button
							type="button"
							class="gr-button gr-button--solid"
							onclick={savePolicy}
							disabled={isSavingPolicy || !policyJson.trim()}
						>
							{isSavingPolicy ? 'Saving…' : 'Save'}
						</button>
						<button type="button" class="gr-button gr-button--outline" onclick={() => refreshPolicy()} disabled={isLoadingPolicy}>
							Refresh
						</button>
					</div>
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
