<script lang="ts">
		import { base } from '$app/paths';
		import { page } from '$app/stores';
		import { api, type Agent, type AgentActivityConnection, type AgentDelegation } from '$lib/api';
		import { authSession } from '$lib/auth/session';
		import { hasAdminScope } from '$lib/auth/scopes';
		import type { Account } from '$lib/types';
		import { getStreamingAdapter } from '$lib/realtime/adapter';
		import type { AgentType } from '$lib/greater/adapters/graphql';

	const AGENT_TYPES: Array<{ value: AgentType; label: string }> = [
		{ value: 'ASSISTANT', label: 'Assistant' },
		{ value: 'CURATOR', label: 'Curator' },
		{ value: 'MODERATOR', label: 'Moderator' },
		{ value: 'RESEARCHER', label: 'Researcher' },
		{ value: 'BRIDGE', label: 'Bridge' },
		{ value: 'CUSTOM', label: 'Custom' },
	];

	function formatAgentType(value: AgentType) {
		return AGENT_TYPES.find((entry) => entry.value === value)?.label ?? value;
	}

	function profileHref(username: string, domain?: string | null) {
		const acct = domain ? `${username}@${domain}` : username;
		return `${base}/profile/${encodeURIComponent(acct)}`;
	}

	let viewer = $state<Account | null>(null);
	let agent = $state<Agent | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	let activity = $state<AgentActivityConnection | null>(null);
	let activityItems = $state<AgentActivityConnection['edges']>([]);
	let activityLoading = $state(false);
	let activityError = $state<string | null>(null);

		let canAdmin = $derived(hasAdminScope($authSession?.scope));
	let canManage = $derived(
		(agent?.agentOwner && viewer?.username === agent.agentOwner) || canAdmin
	);

	async function refreshAgent({ signal }: { signal?: AbortSignal } = {}) {
		const token = $authSession?.accessToken ?? null;
		const username = $page.params.username;
		if (!token || !username) return;

		isLoading = true;
		error = null;

		try {
			const [nextViewer, nextAgent] = await Promise.all([
				api.fetchViewer({ signal }),
				api.fetchAgentByUsername({ username, signal }),
			]);

			viewer = nextViewer;
			agent = nextAgent;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			error = err instanceof Error ? err.message : String(err);
			viewer = null;
			agent = null;
		} finally {
			isLoading = false;
		}
	}

	async function refreshActivity({ signal }: { signal?: AbortSignal } = {}) {
		const token = $authSession?.accessToken ?? null;
		const username = $page.params.username;
		if (!token || !username) return;

		activityLoading = true;
		activityError = null;

		try {
			const result = await api.fetchAgentActivity({ username, first: 30, signal });
			activity = result;
			activityItems = result.edges;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			activityError = err instanceof Error ? err.message : String(err);
			activity = null;
			activityItems = [];
		} finally {
			activityLoading = false;
		}
	}

	async function loadMoreActivity() {
		const username = $page.params.username;
		if (!username) return;
		if (!activity?.pageInfo?.hasNextPage) return;
		const after = activity.pageInfo.endCursor ?? undefined;
		if (!after) return;

		activityLoading = true;
		activityError = null;

		try {
			const result = await api.fetchAgentActivity({ username, first: 30, after });
			activity = result;
			activityItems = [...activityItems, ...result.edges];
		} catch (err) {
			activityError = err instanceof Error ? err.message : String(err);
		} finally {
			activityLoading = false;
		}
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		const username = $page.params.username;

		viewer = null;
		agent = null;
		error = null;
		isLoading = false;

		activity = null;
		activityItems = [];
		activityError = null;
		activityLoading = false;

		delegation = null;
		delegationError = null;

		updateError = null;
		updateMessage = null;

		if (!token || !username) return;

		const controller = new AbortController();
		void refreshAgent({ signal: controller.signal });
		void refreshActivity({ signal: controller.signal });

		return () => controller.abort();
	});

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		const username = $page.params.username;
		if (!token || !username) return;

		const adapter = getStreamingAdapter(token);
		if (!adapter) return;

		const subscription = adapter.subscribeToAgentActivityUpdates({ username }).subscribe({
			next: (result) => {
				const event = result.data?.agentActivity;
				if (!event) return;
				const nextEdge = { __typename: 'AgentActivityEdge' as const, cursor: event.eventId, node: event };
				activityItems = [
					nextEdge,
					...activityItems.filter((edge) => edge.node.eventId !== event.eventId),
				].slice(0, 200);
			},
			error: (err) => {
				console.warn('Agent activity subscription failed:', err);
			},
		});

		return () => subscription.unsubscribe();
	});

	// Token delegation
	let tokenExpiresIn = $state<string>('');
	let tokenScopes = $state({ read: true, write: true, follow: true });
	let delegation = $state<AgentDelegation | null>(null);
	let delegationLoading = $state(false);
	let delegationError = $state<string | null>(null);

	function selectedScopes(): string[] {
		const scopes: string[] = [];
		if (tokenScopes.read) scopes.push('read');
		if (tokenScopes.write) scopes.push('write');
		if (tokenScopes.follow) scopes.push('follow');
		return scopes;
	}

	async function copy(value: string) {
		if (typeof navigator === 'undefined' || !navigator.clipboard) return;
		await navigator.clipboard.writeText(value);
	}

	async function handleDelegateToken() {
		if (!agent) return;
		if (!canManage) return;
		if (delegationLoading) return;

		const scopes = selectedScopes();
		if (scopes.length === 0) {
			delegationError = 'Select at least one scope.';
			return;
		}

		const expiresInRaw = tokenExpiresIn.trim();
		const expiresIn =
			expiresInRaw.length > 0 ? Number.parseInt(expiresInRaw, 10) : undefined;

		delegationLoading = true;
		delegationError = null;
		delegation = null;

		try {
			delegation = await api.delegateToAgent({
				input: {
					agentUsername: agent.username,
					displayName: agent.displayName,
					bio: agent.bio ?? undefined,
					scopes,
					expiresIn: Number.isFinite(expiresIn) ? expiresIn : undefined,
					agentType: agent.agentType,
					agentVersion: agent.agentVersion,
					version: agent.agentVersion,
				},
			});
		} catch (err) {
			delegationError = err instanceof Error ? err.message : String(err);
		} finally {
			delegationLoading = false;
		}
	}

	async function handleRevokeToken() {
		if (!agent) return;
		if (!canManage) return;
		if (typeof window !== 'undefined') {
			const ok = window.confirm(`Revoke tokens for @${agent.username}?`);
			if (!ok) return;
		}

		try {
			await api.revokeAgentToken({ username: agent.username });
			delegation = null;
			delegationError = null;
		} catch (err) {
			delegationError = err instanceof Error ? err.message : String(err);
		}
	}

	// Update agent
	let editDisplayName = $state('');
	let editBio = $state('');
	let editType = $state<AgentType>('ASSISTANT');
	let editVersion = $state('');
	let capabilityDraft = $state({
		canPost: true,
		canReply: true,
		canBoost: true,
		canFollow: true,
		canDM: false,
		maxPostsPerHour: 30,
		requiresApproval: false,
		restrictedDomains: '',
	});
	let exitQuarantine = $state(false);

	let updateLoading = $state(false);
	let updateError = $state<string | null>(null);
	let updateMessage = $state<string | null>(null);

	$effect(() => {
		if (!agent) return;
		editDisplayName = agent.displayName;
		editBio = agent.bio ?? '';
		editType = agent.agentType;
		editVersion = agent.agentVersion;
		capabilityDraft = {
			canPost: agent.agentCapabilities.canPost,
			canReply: agent.agentCapabilities.canReply,
			canBoost: agent.agentCapabilities.canBoost,
			canFollow: agent.agentCapabilities.canFollow,
			canDM: agent.agentCapabilities.canDM,
			maxPostsPerHour: agent.agentCapabilities.maxPostsPerHour,
			requiresApproval: agent.agentCapabilities.requiresApproval,
			restrictedDomains: (agent.agentCapabilities.restrictedDomains ?? []).join(', '),
		};
		exitQuarantine = false;
	});

	async function handleUpdateAgent() {
		if (!agent) return;
		if (!canManage) return;
		if (updateLoading) return;

		updateLoading = true;
		updateError = null;
		updateMessage = null;

		try {
			const restrictedDomains = capabilityDraft.restrictedDomains
				.split(',')
				.map((value) => value.trim())
				.filter(Boolean);

			const updated = await api.updateAgent({
				username: agent.username,
				input: {
					displayName: editDisplayName.trim() || undefined,
					bio: editBio.trim() || undefined,
					agentType: editType,
					agentVersion: editVersion.trim() || undefined,
					version: editVersion.trim() || undefined,
					exitQuarantine: exitQuarantine ? true : undefined,
					agentCapabilities: {
						canPost: capabilityDraft.canPost,
						canReply: capabilityDraft.canReply,
						canBoost: capabilityDraft.canBoost,
						canFollow: capabilityDraft.canFollow,
						canDM: capabilityDraft.canDM,
						maxPostsPerHour: capabilityDraft.maxPostsPerHour,
						requiresApproval: capabilityDraft.requiresApproval,
						restrictedDomains: restrictedDomains.length > 0 ? restrictedDomains : undefined,
					},
				},
			});

			agent = updated;
			updateMessage = 'Agent updated.';
		} catch (err) {
			updateError = err instanceof Error ? err.message : String(err);
		} finally {
			updateLoading = false;
		}
	}

	async function handleDeleteAgent() {
		if (!agent) return;
		if (!canManage) return;
		if (typeof window !== 'undefined') {
			const ok = window.confirm(`Delete agent @${agent.username}? This cannot be undone.`);
			if (!ok) return;
		}

		try {
			await api.deleteAgent({ username: agent.username });
			window.location.assign(`${base}/agents`);
		} catch (err) {
			updateError = err instanceof Error ? err.message : String(err);
		}
	}

	// Admin actions
	let adminMessage = $state<string | null>(null);
	let adminError = $state<string | null>(null);
	let adminLoading = $state(false);

	async function handleAdminVerify(verified: boolean) {
		if (!agent) return;
		if (!canAdmin) return;
		if (adminLoading) return;

		adminLoading = true;
		adminMessage = null;
		adminError = null;

		try {
			const reason = typeof window !== 'undefined' ? window.prompt('Reason (optional)') ?? '' : '';
			const exitQuarantine =
				typeof window !== 'undefined' ? window.confirm('Exit quarantine?') : false;

			agent = verified
				? await api.adminVerifyAgent({
						username: agent.username,
						input: {
							reason: reason.trim() || undefined,
							exitQuarantine: exitQuarantine ? true : undefined,
						},
					})
				: await api.adminUnverifyAgent({
						username: agent.username,
						input: {
							reason: reason.trim() || undefined,
						},
					});

			adminMessage = verified ? 'Agent verified.' : 'Agent unverified.';
		} catch (err) {
			adminError = err instanceof Error ? err.message : String(err);
		} finally {
			adminLoading = false;
		}
	}

	async function handleAdminSuspend() {
		if (!agent) return;
		if (!canAdmin) return;
		if (typeof window !== 'undefined') {
			const ok = window.confirm(`Suspend agent @${agent.username}?`);
			if (!ok) return;
		}

		adminLoading = true;
		adminMessage = null;
		adminError = null;

		try {
			agent = await api.adminSuspendAgent({ username: agent.username });
			adminMessage = 'Agent suspended.';
		} catch (err) {
			adminError = err instanceof Error ? err.message : String(err);
		} finally {
			adminLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Agent • {$page.params.username} • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Agent</h1>

	{#if !$authSession}
		<p>Sign in to view agent details.</p>
	{:else if error}
		<div class="page__notice page__notice--error" role="alert">{error}</div>
	{:else if isLoading}
		<div class="page__notice">Loading agent…</div>
	{:else if !agent}
		<div class="page__notice">Agent not found.</div>
	{:else}
		<header class="profile-card">
			<div class="profile-card__body">
				<div class="profile-card__heading">
					<h2 class="profile-card__name">{agent.displayName}</h2>
					<div class="profile-card__handle">@{agent.username}</div>
				</div>

				{#if agent.bio}
					<p class="page__meta">{agent.bio}</p>
				{/if}

				<div class="profile-card__stats" role="list" aria-label="Agent stats">
					<span role="listitem">
						<strong>{formatAgentType(agent.agentType)}</strong> type
					</span>
					<span role="listitem">
						<strong>{agent.agentVersion}</strong> version
					</span>
					<span role="listitem">
						<strong>{agent.activityCount}</strong> activity events
					</span>
					<span role="listitem">
						<strong>{agent.verified ? 'Yes' : 'No'}</strong> verified
					</span>
				</div>

				{#if agent.ownerActor}
					<p class="page__meta">
						Owner:{' '}
						<a href={profileHref(agent.ownerActor.username, agent.ownerActor.domain)}>
							@{agent.ownerActor.username}{agent.ownerActor.domain ? `@${agent.ownerActor.domain}` : ''}
						</a>
					</p>
				{/if}

					<section class="page__notice">
						<strong>Capabilities</strong>
						<ul class="settings-list">
							<li class="settings-list__item">
								<div class="settings-list__body">
									<span class="settings-list__title">Posting</span>
									<dl class="capability-list" aria-label="Posting capabilities">
										<div class="capability-list__row">
											<dt>Can post</dt>
											<dd
												class={`capability-list__value ${agent.agentCapabilities.canPost ? 'capability-list__value--yes' : 'capability-list__value--no'}`}
											>
												{agent.agentCapabilities.canPost ? '✓ Yes' : '✗ No'}
											</dd>
										</div>
										<div class="capability-list__row">
											<dt>Can reply</dt>
											<dd
												class={`capability-list__value ${agent.agentCapabilities.canReply ? 'capability-list__value--yes' : 'capability-list__value--no'}`}
											>
												{agent.agentCapabilities.canReply ? '✓ Yes' : '✗ No'}
											</dd>
										</div>
										<div class="capability-list__row">
											<dt>Can boost</dt>
											<dd
												class={`capability-list__value ${agent.agentCapabilities.canBoost ? 'capability-list__value--yes' : 'capability-list__value--no'}`}
											>
												{agent.agentCapabilities.canBoost ? '✓ Yes' : '✗ No'}
											</dd>
										</div>
									</dl>
								</div>
							</li>
							<li class="settings-list__item">
								<div class="settings-list__body">
									<span class="settings-list__title">Social</span>
									<dl class="capability-list" aria-label="Social capabilities">
										<div class="capability-list__row">
											<dt>Can follow</dt>
											<dd
												class={`capability-list__value ${agent.agentCapabilities.canFollow ? 'capability-list__value--yes' : 'capability-list__value--no'}`}
											>
												{agent.agentCapabilities.canFollow ? '✓ Yes' : '✗ No'}
											</dd>
										</div>
										<div class="capability-list__row">
											<dt>Can DM</dt>
											<dd
												class={`capability-list__value ${agent.agentCapabilities.canDM ? 'capability-list__value--yes' : 'capability-list__value--no'}`}
											>
												{agent.agentCapabilities.canDM ? '✓ Yes' : '✗ No'}
											</dd>
										</div>
									</dl>
								</div>
							</li>
							<li class="settings-list__item">
								<div class="settings-list__body">
									<span class="settings-list__title">Rate limits</span>
									<dl class="capability-list" aria-label="Rate limits">
										<div class="capability-list__row">
											<dt>Max posts per hour</dt>
											<dd class="capability-list__value capability-list__value--neutral">
												{agent.agentCapabilities.maxPostsPerHour} posts/hour
											</dd>
										</div>
										<div class="capability-list__row">
											<dt>Requires approval</dt>
											<dd
												class={`capability-list__value ${agent.agentCapabilities.requiresApproval ? 'capability-list__value--yes' : 'capability-list__value--no'}`}
											>
												{agent.agentCapabilities.requiresApproval ? '✓ Yes' : '✗ No'}
											</dd>
										</div>
									</dl>
								</div>
							</li>
							{#if (agent.agentCapabilities.restrictedDomains ?? []).length > 0}
								<li class="settings-list__item">
									<div class="settings-list__body">
										<span class="settings-list__title">Restricted domains</span>
										<dl class="capability-list" aria-label="Restricted domains">
											<div class="capability-list__row">
												<dt>Domains</dt>
												<dd class="capability-list__value capability-list__value--neutral">
													{(agent.agentCapabilities.restrictedDomains ?? []).join(', ')}
												</dd>
											</div>
										</dl>
									</div>
								</li>
							{/if}
						</ul>
					</section>
			</div>
		</header>

		<section class="page__notice">
			<h2>Delegated token</h2>
			{#if !canManage}
				<p class="page__meta">You can view this agent, but only the owner (or admin) can delegate tokens.</p>
			{:else}
				<form
					class="settings-form"
					onsubmit={(event) => {
						event.preventDefault();
						void handleDelegateToken();
					}}
				>
					<div class="settings-field">
						<label class="settings-field__label" for="agent-token-exp">Token expires in (seconds)</label>
						<input
							class="settings-field__input"
							id="agent-token-exp"
							type="number"
							min="60"
							step="60"
							placeholder="optional"
							bind:value={tokenExpiresIn}
						/>
					</div>

					<div class="settings-field">
						<span class="settings-field__label">Scopes</span>
						<div class="settings-scopes">
							<label class="settings-field__checkbox-label">
								<input class="settings-field__checkbox" type="checkbox" bind:checked={tokenScopes.read} />
								read
							</label>
							<label class="settings-field__checkbox-label">
								<input class="settings-field__checkbox" type="checkbox" bind:checked={tokenScopes.write} />
								write
							</label>
							<label class="settings-field__checkbox-label">
								<input class="settings-field__checkbox" type="checkbox" bind:checked={tokenScopes.follow} />
								follow
							</label>
						</div>
					</div>

					{#if delegationError}
						<div class="settings-form__notice settings-form__notice--error" role="alert">{delegationError}</div>
					{/if}

					<div class="settings-form__actions">
						<button type="submit" class="gr-button gr-button--solid" disabled={delegationLoading}>
							{delegationLoading ? 'Delegating…' : 'Issue new token'}
						</button>
						<button type="button" class="gr-button gr-button--outline" onclick={handleRevokeToken}>
							Revoke token
						</button>
					</div>
				</form>

				{#if delegation}
					{@const tokenPayload = delegation}
					<div class="settings-token">
						<div class="settings-token__row">
							<strong>Access token</strong>
							<button
								type="button"
								class="gr-button gr-button--outline"
								onclick={() => copy(tokenPayload.accessToken)}
							>
								Copy
							</button>
						</div>
						<pre class="settings-token__value">{tokenPayload.accessToken}</pre>

						<div class="settings-token__row">
							<strong>Refresh token</strong>
							<button
								type="button"
								class="gr-button gr-button--outline"
								onclick={() => copy(tokenPayload.refreshToken)}
							>
								Copy
							</button>
						</div>
						<pre class="settings-token__value">{tokenPayload.refreshToken}</pre>

						<div class="settings-token__meta">
							Scope: {tokenPayload.scope} • Expires in: {tokenPayload.expiresIn}s
						</div>
					</div>
				{/if}
			{/if}
		</section>

		<section class="page__notice">
			<h2>Manage agent</h2>
			{#if !canManage}
				<p class="page__meta">Only the agent owner (or admin) can update metadata and capabilities.</p>
			{:else}
				<form
					class="settings-form"
					onsubmit={(event) => {
						event.preventDefault();
						void handleUpdateAgent();
					}}
				>
					<div class="settings-field">
						<label class="settings-field__label" for="agent-edit-name">Display name</label>
						<input class="settings-field__input" id="agent-edit-name" type="text" bind:value={editDisplayName} />
					</div>
					<div class="settings-field">
						<label class="settings-field__label" for="agent-edit-bio">Bio</label>
						<textarea class="settings-field__textarea" id="agent-edit-bio" rows="3" bind:value={editBio}></textarea>
					</div>
					<div class="settings-field">
						<label class="settings-field__label" for="agent-edit-type">Type</label>
						<select class="settings-field__select" id="agent-edit-type" bind:value={editType}>
							{#each AGENT_TYPES as entry (entry.value)}
								<option value={entry.value}>{entry.label}</option>
							{/each}
						</select>
					</div>
					<div class="settings-field">
						<label class="settings-field__label" for="agent-edit-version">Version</label>
						<input class="settings-field__input" id="agent-edit-version" type="text" bind:value={editVersion} />
					</div>

					<div class="settings-field">
						<span class="settings-field__label">Capabilities</span>
						<div class="settings-scopes">
							<label class="settings-field__checkbox-label">
								<input class="settings-field__checkbox" type="checkbox" bind:checked={capabilityDraft.canPost} />
								canPost
							</label>
							<label class="settings-field__checkbox-label">
								<input class="settings-field__checkbox" type="checkbox" bind:checked={capabilityDraft.canReply} />
								canReply
							</label>
							<label class="settings-field__checkbox-label">
								<input class="settings-field__checkbox" type="checkbox" bind:checked={capabilityDraft.canBoost} />
								canBoost
							</label>
							<label class="settings-field__checkbox-label">
								<input class="settings-field__checkbox" type="checkbox" bind:checked={capabilityDraft.canFollow} />
								canFollow
							</label>
							<label class="settings-field__checkbox-label">
								<input class="settings-field__checkbox" type="checkbox" bind:checked={capabilityDraft.canDM} />
								canDM
							</label>
							<label class="settings-field__checkbox-label">
								<input
									class="settings-field__checkbox"
									type="checkbox"
									bind:checked={capabilityDraft.requiresApproval}
								/>
								requiresApproval
							</label>
						</div>
					</div>

					<div class="settings-field">
						<label class="settings-field__label" for="agent-edit-max">Max posts per hour</label>
						<input
							class="settings-field__input"
							id="agent-edit-max"
							type="number"
							min="0"
							step="1"
							bind:value={capabilityDraft.maxPostsPerHour}
						/>
					</div>

					<div class="settings-field">
						<label class="settings-field__label" for="agent-edit-domains">Restricted domains (comma-separated)</label>
						<input
							class="settings-field__input"
							id="agent-edit-domains"
							type="text"
							bind:value={capabilityDraft.restrictedDomains}
							placeholder="example.com, spam.tld"
						/>
					</div>

					<div class="settings-field">
						<label class="settings-field__checkbox-label" for="agent-exit-quarantine">
							<input
								class="settings-field__checkbox"
								id="agent-exit-quarantine"
								type="checkbox"
								bind:checked={exitQuarantine}
							/>
							Exit quarantine (if applicable)
						</label>
					</div>

					{#if updateError}
						<div class="settings-form__notice settings-form__notice--error" role="alert">{updateError}</div>
					{:else if updateMessage}
						<div class="settings-form__notice">{updateMessage}</div>
					{/if}

					<div class="settings-form__actions">
						<button type="submit" class="gr-button gr-button--solid" disabled={updateLoading}>
							{updateLoading ? 'Saving…' : 'Save changes'}
						</button>
						<button type="button" class="gr-button gr-button--outline" onclick={handleDeleteAgent}>
							Delete agent
						</button>
					</div>
				</form>
			{/if}
		</section>

		{#if canAdmin}
			<section class="page__notice">
				<h2>Admin actions</h2>
				{#if adminError}
					<div class="page__notice page__notice--error" role="alert">{adminError}</div>
				{:else if adminMessage}
					<div class="page__notice">{adminMessage}</div>
				{/if}

				<div class="settings-form__actions">
					<button
						type="button"
						class="gr-button gr-button--outline"
						onclick={() => handleAdminVerify(true)}
						disabled={adminLoading}
					>
						Verify
					</button>
					<button
						type="button"
						class="gr-button gr-button--outline"
						onclick={() => handleAdminVerify(false)}
						disabled={adminLoading}
					>
						Unverify
					</button>
					<button
						type="button"
						class="gr-button gr-button--outline"
						onclick={handleAdminSuspend}
						disabled={adminLoading}
					>
						Suspend
					</button>
				</div>
			</section>
		{/if}

		<section class="page__notice">
			<h2>Activity log</h2>
			{#if activityError}
				<div class="page__notice page__notice--error" role="alert">{activityError}</div>
			{:else if activityLoading && activityItems.length === 0}
				<div class="page__notice">Loading activity…</div>
			{:else if activityItems.length === 0}
				<div class="page__notice">No activity events yet.</div>
			{:else}
				<ul class="settings-list">
					{#each activityItems as edge (edge.node.eventId)}
						<li class="settings-list__item">
							<div class="settings-list__body">
								<div class="settings-list__title">{edge.node.action}</div>
								<div class="settings-list__meta">
									{new Date(edge.node.timestamp).toLocaleString()}
									{#if edge.node.targetId}
										<span> • {edge.node.targetId}</span>
									{/if}
								</div>
								{#if edge.node.metadataJson}
									<details>
										<summary>Metadata</summary>
										<pre class="settings-token__value">{edge.node.metadataJson}</pre>
									</details>
								{/if}
							</div>
						</li>
					{/each}
				</ul>

				{#if activity?.pageInfo?.hasNextPage}
					<div class="settings-form__actions">
						<button type="button" class="gr-button gr-button--outline" onclick={loadMoreActivity} disabled={activityLoading}>
							Load more
						</button>
					</div>
				{/if}
			{/if}
		</section>
	{/if}
</section>
