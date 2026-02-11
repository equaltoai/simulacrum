<script lang="ts">
	import { base } from '$app/paths';
	import { api, type Agent, type AgentConnection, type AgentDelegation } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import type { AgentType } from '$lib/greater/adapters/graphql';

	type AgentRow = { agent: Agent; ownerAcct?: string };

	const AGENT_TYPES: Array<{ value: AgentType; label: string }> = [
		{ value: 'ASSISTANT', label: 'Assistant' },
		{ value: 'CURATOR', label: 'Curator' },
		{ value: 'MODERATOR', label: 'Moderator' },
		{ value: 'RESEARCHER', label: 'Researcher' },
		{ value: 'BRIDGE', label: 'Bridge' },
		{ value: 'CUSTOM', label: 'Custom' },
	];

	function agentHref(username: string) {
		return `${base}/agents/${encodeURIComponent(username)}`;
	}

	function ownerAcct(agent: Agent): string | undefined {
		const actor = agent.ownerActor;
		if (!actor) return undefined;
		return actor.domain ? `${actor.username}@${actor.domain}` : actor.username;
	}

	function profileHref(acct: string) {
		return `${base}/profile/${encodeURIComponent(acct)}`;
	}

	function formatAgentType(value: AgentType) {
		return AGENT_TYPES.find((entry) => entry.value === value)?.label ?? value;
	}

	let directory = $state<AgentConnection | null>(null);
	let directoryRows = $state<AgentRow[]>([]);
	let directoryLoading = $state(false);
	let directoryError = $state<string | null>(null);

	let myAgents = $state<Agent[]>([]);
	let myAgentsLoading = $state(false);
	let myAgentsError = $state<string | null>(null);

	let queryDraft = $state('');
	let typeDraft = $state<AgentType | ''>('');
	let verifiedDraft = $state(false);
	let ownerDraft = $state('');

	let query = $state<string | undefined>(undefined);
	let agentType = $state<AgentType | undefined>(undefined);
	let verified = $state<boolean | undefined>(undefined);
	let ownerUsername = $state<string | undefined>(undefined);

	async function refreshDirectory({ after, append }: { after?: string; append?: boolean } = {}) {
		if (!$authSession?.accessToken) return;

		directoryLoading = true;
		directoryError = null;

		try {
			const result = await api.fetchAgents({
				first: 20,
				after,
				query,
				type: agentType,
				verified,
				ownerUsername,
			});

			directory = result;
			const nextRows = result.edges.map((edge) => ({ agent: edge.node, ownerAcct: ownerAcct(edge.node) }));
			directoryRows = append ? [...directoryRows, ...nextRows] : nextRows;
		} catch (err) {
			directoryError = err instanceof Error ? err.message : String(err);
			directory = null;
			directoryRows = [];
		} finally {
			directoryLoading = false;
		}
	}

	function applyFilters() {
		query = queryDraft.trim() || undefined;
		agentType = typeDraft || undefined;
		verified = verifiedDraft ? true : undefined;
		ownerUsername = ownerDraft.trim() || undefined;
		void refreshDirectory();
	}

	async function loadMore() {
		if (!directory?.pageInfo?.hasNextPage) return;
		const after = directory.pageInfo.endCursor ?? undefined;
		if (!after) return;
		await refreshDirectory({ after, append: true });
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		directory = null;
		directoryRows = [];
		directoryLoading = false;
		directoryError = null;

		myAgents = [];
		myAgentsLoading = false;
		myAgentsError = null;

		delegation = null;
		createError = null;

		if (!token) return;

		const controller = new AbortController();
		myAgentsLoading = true;
		void (async () => {
			try {
				myAgents = [...(await api.fetchMyAgents({ signal: controller.signal }))];
			} catch (err) {
				if (!(err instanceof DOMException && err.name === 'AbortError')) {
					myAgentsError = err instanceof Error ? err.message : String(err);
				}
			} finally {
				myAgentsLoading = false;
			}
		})();

		void refreshDirectory();

		return () => controller.abort();
	});

	// Delegation / creation
	let createUsername = $state('');
	let createDisplayName = $state('');
	let createBio = $state('');
	let createType = $state<AgentType>('ASSISTANT');
	let createVersion = $state('1.0.0');
	let createExpiresIn = $state<string>('');
	let createScopes = $state({ read: true, write: true, follow: true });

	let createLoading = $state(false);
	let createError = $state<string | null>(null);
	let delegation = $state<AgentDelegation | null>(null);

	function selectedScopes(): string[] {
		const scopes: string[] = [];
		if (createScopes.read) scopes.push('read');
		if (createScopes.write) scopes.push('write');
		if (createScopes.follow) scopes.push('follow');
		return scopes;
	}

	async function copy(value: string) {
		if (typeof navigator === 'undefined' || !navigator.clipboard) return;
		await navigator.clipboard.writeText(value);
	}

	async function handleCreateAgent() {
		if (createLoading) return;
		if (!$authSession?.accessToken) return;

		const agentUsernameDraft = createUsername.trim();
		const displayNameDraft = createDisplayName.trim();
		const versionDraft = createVersion.trim();
		const scopes = selectedScopes();

		if (!agentUsernameDraft) {
			createError = 'Agent username is required.';
			return;
		}
		if (!displayNameDraft) {
			createError = 'Agent display name is required.';
			return;
		}
		if (!versionDraft) {
			createError = 'Agent version is required.';
			return;
		}
		if (scopes.length === 0) {
			createError = 'Select at least one scope.';
			return;
		}

		const expiresInRaw = createExpiresIn.trim();
		const expiresIn =
			expiresInRaw.length > 0 ? Number.parseInt(expiresInRaw, 10) : undefined;

		createLoading = true;
		createError = null;
		delegation = null;

		try {
			delegation = await api.delegateToAgent({
				input: {
					agentUsername: agentUsernameDraft,
					displayName: displayNameDraft,
					bio: createBio.trim() || undefined,
					scopes,
					expiresIn: Number.isFinite(expiresIn) ? expiresIn : undefined,
					agentType: createType,
					agentVersion: versionDraft,
					version: versionDraft,
				},
			});

			void refreshDirectory();
			myAgents = [...(await api.fetchMyAgents())];
		} catch (err) {
			createError = err instanceof Error ? err.message : String(err);
		} finally {
			createLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Agents • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Agents</h1>

	{#if !$authSession}
		<p>Sign in to browse and manage agents.</p>
	{:else}
		<section class="page__notice">
			<h2>Directory</h2>

			<form
				class="settings-form"
				onsubmit={(event) => {
					event.preventDefault();
					applyFilters();
				}}
			>
				<div class="settings-field">
					<label class="settings-field__label" for="agent-search">Search</label>
					<input
						class="settings-field__input"
						id="agent-search"
						type="text"
						placeholder="username, display name…"
						bind:value={queryDraft}
					/>
				</div>

				<div class="settings-field">
					<label class="settings-field__label" for="agent-type">Type</label>
					<select class="settings-field__select" id="agent-type" bind:value={typeDraft}>
						<option value="">All</option>
						{#each AGENT_TYPES as entry (entry.value)}
							<option value={entry.value}>{entry.label}</option>
						{/each}
					</select>
				</div>

				<div class="settings-field">
					<label class="settings-field__label" for="agent-owner">Owner username</label>
					<input
						class="settings-field__input"
						id="agent-owner"
						type="text"
						placeholder="owner username…"
						bind:value={ownerDraft}
					/>
				</div>

				<div class="settings-field">
					<label class="settings-field__checkbox-label" for="agent-verified">
						<input
							class="settings-field__checkbox"
							id="agent-verified"
							type="checkbox"
							bind:checked={verifiedDraft}
						/>
						Verified only
					</label>
				</div>

				<div class="settings-form__actions">
					<button type="submit" class="gr-button gr-button--solid" disabled={directoryLoading}>
						Apply filters
					</button>
				</div>
			</form>

			{#if directoryError}
				<div class="page__notice page__notice--error" role="alert">{directoryError}</div>
			{:else if directoryLoading}
				<div class="page__notice">Loading agents…</div>
			{:else if directoryRows.length === 0}
				<div class="page__notice">No agents found.</div>
			{:else}
				<ul class="settings-list">
					{#each directoryRows as row (row.agent.id)}
						<li class="settings-list__item">
							<div class="settings-list__body">
								<a class="settings-list__title" href={agentHref(row.agent.username)}>
									{row.agent.displayName}
								</a>
								<div class="settings-list__meta">
									@{row.agent.username} • {formatAgentType(row.agent.agentType)}
									{#if row.agent.verified}
										<span> • verified</span>
									{/if}
									{#if row.ownerAcct}
										<span>
											{' '}
											• owner <a href={profileHref(row.ownerAcct)}>@{row.ownerAcct}</a>
										</span>
									{/if}
								</div>
							</div>
							<a class="gr-button gr-button--outline" href={agentHref(row.agent.username)}>Open</a>
						</li>
					{/each}
				</ul>

				{#if directory?.pageInfo?.hasNextPage}
					<div class="settings-form__actions">
						<button type="button" class="gr-button gr-button--outline" onclick={loadMore} disabled={directoryLoading}>
							Load more
						</button>
					</div>
				{/if}
			{/if}
		</section>

		<section class="page__notice">
			<h2>My agents</h2>
			{#if myAgentsError}
				<div class="page__notice page__notice--error" role="alert">{myAgentsError}</div>
			{:else if myAgentsLoading}
				<div class="page__notice">Loading…</div>
			{:else if myAgents.length === 0}
				<p>You don’t own any agents yet.</p>
			{:else}
				<ul class="settings-list">
					{#each myAgents as agent (agent.id)}
						<li class="settings-list__item">
							<div class="settings-list__body">
								<a class="settings-list__title" href={agentHref(agent.username)}>{agent.displayName}</a>
								<div class="settings-list__meta">
									@{agent.username} • {formatAgentType(agent.agentType)}
									{#if agent.verified}
										<span> • verified</span>
									{/if}
								</div>
							</div>
							<a class="gr-button gr-button--outline" href={agentHref(agent.username)}>Manage</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="page__notice">
			<h2>Delegate a new agent</h2>
			<p class="page__meta">
				This creates an agent account and returns an access token + refresh token. Store tokens securely.
			</p>

			<form
				class="settings-form"
				onsubmit={(event) => {
					event.preventDefault();
					void handleCreateAgent();
				}}
			>
				<div class="settings-field">
					<label class="settings-field__label" for="new-agent-username">Username</label>
					<input
						class="settings-field__input"
						id="new-agent-username"
						type="text"
						placeholder="agent username"
						bind:value={createUsername}
					/>
				</div>

				<div class="settings-field">
					<label class="settings-field__label" for="new-agent-name">Display name</label>
					<input class="settings-field__input" id="new-agent-name" type="text" bind:value={createDisplayName} />
				</div>

				<div class="settings-field">
					<label class="settings-field__label" for="new-agent-bio">Bio</label>
					<textarea class="settings-field__textarea" id="new-agent-bio" rows="3" bind:value={createBio}></textarea>
				</div>

				<div class="settings-field">
					<label class="settings-field__label" for="new-agent-type">Type</label>
					<select class="settings-field__select" id="new-agent-type" bind:value={createType}>
						{#each AGENT_TYPES as entry (entry.value)}
							<option value={entry.value}>{entry.label}</option>
						{/each}
					</select>
				</div>

				<div class="settings-field">
					<label class="settings-field__label" for="new-agent-version">Version</label>
					<input class="settings-field__input" id="new-agent-version" type="text" bind:value={createVersion} />
				</div>

				<div class="settings-field">
					<label class="settings-field__label" for="new-agent-expires">Token expires in (seconds)</label>
					<input
						class="settings-field__input"
						id="new-agent-expires"
						type="number"
						min="60"
						step="60"
						placeholder="optional"
						bind:value={createExpiresIn}
					/>
				</div>

				<div class="settings-field">
					<span class="settings-field__label">Scopes</span>
					<div class="settings-scopes">
						<label class="settings-field__checkbox-label">
							<input class="settings-field__checkbox" type="checkbox" bind:checked={createScopes.read} />
							read
						</label>
						<label class="settings-field__checkbox-label">
							<input class="settings-field__checkbox" type="checkbox" bind:checked={createScopes.write} />
							write
						</label>
						<label class="settings-field__checkbox-label">
							<input class="settings-field__checkbox" type="checkbox" bind:checked={createScopes.follow} />
							follow
						</label>
					</div>
				</div>

				{#if createError}
					<div class="settings-form__notice settings-form__notice--error" role="alert">{createError}</div>
				{/if}

				<div class="settings-form__actions">
					<button type="submit" class="gr-button gr-button--solid" disabled={createLoading}>
						{createLoading ? 'Delegating…' : 'Create agent + issue token'}
					</button>
				</div>
			</form>

			{#if delegation}
				{@const tokenPayload = delegation}
				<div class="page__notice">
					<strong>Agent created:</strong>{' '}
					<a href={agentHref(tokenPayload.agent.username)}>@{tokenPayload.agent.username}</a>
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
				</div>
			{/if}
		</section>
	{/if}
</section>
