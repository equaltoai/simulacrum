<script lang="ts">
	import { api, type Agent } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import type { AgentType } from '$lib/greater/adapters/graphql';
	import type { AgentFaceBaseData } from '$lib/greater/faces/agent';
	import AgentFaceFrame from '$lib/greater/faces/agent/internal/AgentFaceFrame.svelte';

	import { getPageHref } from '../routing';

	interface DronesPageData extends AgentFaceBaseData {
		agentCount: number;
		soulCount: number;
		currentUserName?: string;
	}

	interface Props {
		data: DronesPageData;
		onUpdated?: () => Promise<void> | void;
		class?: string;
	}

	const AGENT_TYPES: Array<{ value: AgentType; label: string }> = [
		{ value: 'ASSISTANT', label: 'Assistant' },
		{ value: 'CURATOR', label: 'Curator' },
		{ value: 'MODERATOR', label: 'Moderator' },
		{ value: 'RESEARCHER', label: 'Researcher' },
		{ value: 'BRIDGE', label: 'Bridge' },
		{ value: 'CUSTOM', label: 'Custom' },
	];

	let { data, onUpdated, class: className = '' }: Props = $props();

	let myAgents = $state<Agent[]>([]);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	let createUsername = $state('');
	let createDisplayName = $state('');
	let createBio = $state('');
	let createType = $state<AgentType>('ASSISTANT');
	let createVersion = $state('1.0.0');
	let createScopes = $state({ read: true, write: true, follow: true });
	let createLoading = $state(false);
	let createError = $state<string | null>(null);
	let createSuccess = $state<string | null>(null);
	let refreshNotice = $state<string | null>(null);
	let createdAgentUsername = $state<string | null>(null);

	const hasSession = $derived(Boolean($authSession?.accessToken));
	const effectiveAgentCount = $derived(myAgents.length || data.agentCount);
	const effectiveSoulCount = $derived(data.soulCount);
	const soulLabel = $derived(
		effectiveSoulCount === 1 ? '1 soul is waiting for attachment' : `${effectiveSoulCount} souls are waiting for attachment`
	);
	const identityTargetUsername = $derived(createdAgentUsername ?? myAgents[0]?.username ?? null);

	function agentIdentityHref(username: string) {
		return getPageHref('identity', username);
	}

	function formatAgentType(value: AgentType) {
		return AGENT_TYPES.find((entry) => entry.value === value)?.label ?? value;
	}

	function selectedScopes(): string[] {
		const scopes: string[] = [];
		if (createScopes.read) scopes.push('read');
		if (createScopes.write) scopes.push('write');
		if (createScopes.follow) scopes.push('follow');
		return scopes;
	}

	function sortAgents(items: readonly Agent[]): Agent[] {
		return [...items].sort((left, right) => {
			const name = left.displayName.localeCompare(right.displayName);
			if (name !== 0) return name;
			return left.username.localeCompare(right.username);
		});
	}

	async function loadAgents(signal?: AbortSignal) {
		if (!$authSession?.accessToken) {
			myAgents = [];
			loading = false;
			loadError = null;
			return;
		}

		loading = true;
		loadError = null;

		try {
			const nextAgents = await api.fetchMyAgents({ signal });
			if (signal?.aborted) return;
			myAgents = sortAgents(nextAgents);
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			loadError = error instanceof Error ? error.message : String(error);
			myAgents = [];
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		if (!token) {
			myAgents = [];
			loadError = null;
			loading = false;
			return;
		}

		const controller = new AbortController();
		void loadAgents(controller.signal);
		return () => controller.abort();
	});

	async function handleCreateDrone() {
		if (createLoading || !$authSession?.accessToken) return;

		const agentUsernameDraft = createUsername.trim();
		const displayNameDraft = createDisplayName.trim();
		const versionDraft = createVersion.trim();
		const scopes = selectedScopes();

		if (!agentUsernameDraft) {
			createError = 'Drone username is required.';
			return;
		}
		if (!displayNameDraft) {
			createError = 'Drone display name is required.';
			return;
		}
		if (!versionDraft) {
			createError = 'Drone version is required.';
			return;
		}
		if (scopes.length === 0) {
			createError = 'Select at least one scope.';
			return;
		}

		createLoading = true;
		createError = null;
		createSuccess = null;
		refreshNotice = null;
		createdAgentUsername = null;

		try {
			const delegation = await api.delegateToAgent({
				input: {
					agentUsername: agentUsernameDraft,
					displayName: displayNameDraft,
					bio: createBio.trim() || undefined,
					scopes,
					agentType: createType,
					agentVersion: versionDraft,
					version: versionDraft,
				},
			});

			createdAgentUsername = delegation.agent.username;
			createSuccess = effectiveSoulCount
				? `Drone @${delegation.agent.username} is ready. Open its Identity page next to inspect and bind one of your existing souls.`
				: `Drone @${delegation.agent.username} is ready for local setup.`;

			createUsername = '';
			createDisplayName = '';
			createBio = '';
			createType = 'ASSISTANT';
			createVersion = '1.0.0';
			createScopes = { read: true, write: true, follow: true };

			await loadAgents();

			try {
				await onUpdated?.();
			} catch {
				refreshNotice = 'The drone was created, but the surrounding face did not refresh automatically.';
			}
		} catch (error) {
			createError = error instanceof Error ? error.message : String(error);
		} finally {
			createLoading = false;
		}
	}
</script>

<AgentFaceFrame
	hero={data.hero}
	brand={data.brand}
	navItems={data.navItems}
	actions={data.actions}
	statusChips={data.statusChips}
	metrics={data.metrics}
	class={className}
>
	{#snippet children()}
		<div class="drones-page">
			{#if !hasSession}
				<section class="drones-page__panel drones-page__panel--notice">
					<header class="drones-page__header">
						<p>Sign in required</p>
						<h2>Open the body-creation lane after authentication</h2>
					</header>
					<p>
						Sign in with Lesser to create local drone bodies. Soul attachment now happens from each drone's
						Identity page once the body exists.
					</p>
				</section>
			{:else}
				{#if effectiveSoulCount > 0 && effectiveAgentCount === 0}
					<section class="drones-page__panel drones-page__panel--warning">
						<header class="drones-page__header">
							<p>Migration checkpoint</p>
							<h2>Souls exist, but no drone bodies have been created yet</h2>
						</header>
						<p>
							The historic flow still applies here: create a local drone body first, then open that body's
							Identity page to inspect and bind an existing soul.
						</p>
						<div class="drones-page__pill-row">
							<span class="drones-page__pill">{soulLabel}</span>
							<span class="drones-page__pill">Current owner: {data.currentUserName || 'signed-in operator'}</span>
						</div>
					</section>
				{:else if effectiveSoulCount > 0}
					<section class="drones-page__panel drones-page__panel--accent">
						<header class="drones-page__header">
							<p>Identity-first binding</p>
							<h2>Use a drone identity page to attach an existing soul</h2>
						</header>
						<p>
							Drones remain the creation and roster surface. Soul inventory, details, and the explicit binding
							action now live on each body's Identity page.
						</p>
						{#if identityTargetUsername}
							<div class="drones-page__panel-actions">
								<a
									class="drones-page__button drones-page__button--primary"
									href={agentIdentityHref(identityTargetUsername)}
								>
									Open Identity Nexus
								</a>
							</div>
						{/if}
					</section>
				{/if}

				{#if createSuccess}
					<section class="drones-page__panel drones-page__panel--success">
						<header class="drones-page__header">
							<p>Drone created</p>
							<h2>{createSuccess}</h2>
						</header>
						<div class="drones-page__panel-actions">
							{#if createdAgentUsername}
								<a
									class="drones-page__button drones-page__button--primary"
									href={agentIdentityHref(createdAgentUsername)}
								>
									Open Identity
								</a>
							{/if}
						</div>
						{#if refreshNotice}
							<p class="drones-page__message drones-page__message--warning">{refreshNotice}</p>
						{/if}
					</section>
				{/if}

				<div class="drones-page__grid">
					<section class="drones-page__panel" id="drone-creation">
						<header class="drones-page__header">
							<p>Body creation</p>
							<h2>Create a drone body in the new shell</h2>
						</header>
						<p class="drones-page__copy">
							Create the local body here first. Once it exists, open its Identity page to start the
							hosted/off-chain soul definition path under instance trust.
						</p>

						<label class="drones-page__field">
							<span>Username</span>
							<input bind:value={createUsername} disabled={createLoading} placeholder="drone username" type="text" />
						</label>

						<label class="drones-page__field">
							<span>Display name</span>
							<input bind:value={createDisplayName} disabled={createLoading} placeholder="Drone display name" type="text" />
						</label>

						<label class="drones-page__field">
							<span>Bio</span>
							<textarea bind:value={createBio} disabled={createLoading} placeholder="Describe the drone body and its remit." rows="4"></textarea>
						</label>

						<div class="drones-page__field-grid">
							<label class="drones-page__field">
								<span>Type</span>
								<select bind:value={createType} disabled={createLoading}>
									{#each AGENT_TYPES as entry (entry.value)}
										<option value={entry.value}>{entry.label}</option>
									{/each}
								</select>
							</label>

							<label class="drones-page__field">
								<span>Version</span>
								<input bind:value={createVersion} disabled={createLoading} type="text" />
							</label>
						</div>

						<fieldset class="drones-page__fieldset" disabled={createLoading}>
							<legend>Scopes</legend>
							<label class="drones-page__checkbox">
								<input bind:checked={createScopes.read} type="checkbox" />
								<span>read</span>
							</label>
							<label class="drones-page__checkbox">
								<input bind:checked={createScopes.write} type="checkbox" />
								<span>write</span>
							</label>
							<label class="drones-page__checkbox">
								<input bind:checked={createScopes.follow} type="checkbox" />
								<span>follow</span>
							</label>
						</fieldset>

						{#if createError}
							<p class="drones-page__message drones-page__message--error" role="alert">{createError}</p>
						{/if}

						<div class="drones-page__panel-actions">
							<button
								class="drones-page__button drones-page__button--primary"
								disabled={createLoading}
								onclick={handleCreateDrone}
								type="button"
							>
								{createLoading ? 'Creating drone...' : 'Create Drone Body'}
							</button>
						</div>
					</section>

					<section class="drones-page__panel">
						<header class="drones-page__header">
							<p>Local roster</p>
							<h2>Drone bodies on this instance</h2>
						</header>
						<p class="drones-page__copy">
							Manage the bodies you have already created here, then start or inspect each body's
							hosted/off-chain soul definition from that body's Identity page.
						</p>

						{#if loadError}
							<p class="drones-page__message drones-page__message--error" role="alert">{loadError}</p>
						{:else if loading}
							<p class="drones-page__message">Loading drone bodies...</p>
						{:else if myAgents.length === 0}
							<p class="drones-page__message">No drone bodies exist yet for this account.</p>
						{:else}
							<ul class="drones-page__list">
								{#each myAgents as agent (agent.id)}
									<li class="drones-page__card">
										<div class="drones-page__card-header">
											<div>
												<h3>{agent.displayName}</h3>
												<p>@{agent.username}</p>
											</div>
											<span class="drones-page__type-pill">{formatAgentType(agent.agentType)}</span>
										</div>
										<div class="drones-page__pill-row">
											<span class="drones-page__pill">{agent.verified ? 'Verified' : 'Pending verification'}</span>
											<span class="drones-page__pill">
												{agent.agentCapabilities.requiresApproval ? 'Approval required' : 'Open runtime'}
											</span>
											<span class="drones-page__pill">
												{agent.agentCapabilities.canDM ? 'DM enabled' : 'DM locked'}
											</span>
										</div>
										<div class="drones-page__card-actions">
											<a class="drones-page__button drones-page__button--primary" href={agentIdentityHref(agent.username)}>
												Define Hosted Soul
											</a>
											<a class="drones-page__button drones-page__button--secondary" href={agentIdentityHref(agent.username)}>
												Inspect Identity
											</a>
											{#if effectiveSoulCount > 0}
												<a class="drones-page__button drones-page__button--ghost" href={agentIdentityHref(agent.username)}>
													Bind Existing Soul
												</a>
											{/if}
										</div>
									</li>
								{/each}
							</ul>
						{/if}
					</section>
				</div>
			{/if}
		</div>
	{/snippet}
</AgentFaceFrame>

<style>
	.drones-page,
	.drones-page__grid,
	.drones-page__list,
	.drones-page__pill-row,
	.drones-page__panel-actions,
	.drones-page__card-actions {
		display: grid;
		gap: 0.75rem;
	}

	.drones-page {
		min-width: 0;
	}

	.drones-page__grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: start;
	}

	.drones-page__panel,
	.drones-page__card {
		padding: 1.1rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.72);
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
		box-shadow: 0 18px 44px rgba(123, 70, 27, 0.08);
	}

	.drones-page__panel--warning {
		background: color-mix(in srgb, var(--gr-color-warning-100) 76%, white 24%);
	}

	.drones-page__panel--accent {
		background: color-mix(in srgb, var(--gr-color-primary-100) 72%, white 28%);
	}

	.drones-page__panel--success {
		background: color-mix(in srgb, var(--gr-color-success-100) 72%, white 28%);
	}

	.drones-page__panel--notice {
		background: rgba(255, 255, 255, 0.68);
	}

	.drones-page__header,
	.drones-page__field,
	.drones-page__fieldset {
		display: grid;
		gap: 0.4rem;
	}

	.drones-page__header p,
	.drones-page__header h2,
	.drones-page__card-header h3,
	.drones-page__card-header p,
	.drones-page__copy,
	.drones-page__message {
		margin: 0;
	}

	.drones-page__header p,
	.drones-page__card-header p {
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gr-semantic-foreground-secondary);
	}

	.drones-page__copy {
		color: var(--gr-semantic-foreground-secondary);
	}

	.drones-page__field input,
	.drones-page__field textarea,
	.drones-page__field select {
		width: 100%;
		padding: 0.8rem 0.9rem;
		border: 1px solid rgba(136, 94, 56, 0.16);
		border-radius: 0.9rem;
		background: rgba(255, 252, 248, 0.86);
		color: inherit;
		font: inherit;
	}

	.drones-page__field textarea {
		resize: vertical;
	}

	.drones-page__field-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.drones-page__fieldset {
		padding: 0.9rem 1rem;
		border: 1px solid rgba(136, 94, 56, 0.16);
		border-radius: 0.9rem;
		background: rgba(255, 251, 245, 0.65);
	}

	.drones-page__checkbox {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		margin-right: 1rem;
	}

	.drones-page__button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.8rem 1rem;
		border-radius: 999px;
		text-decoration: none;
		font-weight: 600;
		border: 1px solid transparent;
		cursor: pointer;
	}

	.drones-page__button--primary {
		background: var(--gr-color-primary-600);
		color: white;
	}

	.drones-page__button--secondary {
		background: rgba(255, 255, 255, 0.72);
		color: var(--gr-semantic-foreground-primary);
		border-color: rgba(136, 94, 56, 0.16);
	}

	.drones-page__button--ghost {
		background: transparent;
		color: var(--gr-color-primary-700);
		border-color: rgba(136, 94, 56, 0.16);
	}

	.drones-page__button:disabled {
		opacity: 0.65;
		cursor: default;
	}

	.drones-page__card-header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.drones-page__pill-row {
		grid-template-columns: repeat(auto-fit, minmax(11rem, max-content));
	}

	.drones-page__pill,
	.drones-page__type-pill {
		display: inline-flex;
		align-items: center;
		padding: 0.35rem 0.7rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.68);
		font-size: 0.85rem;
		color: var(--gr-semantic-foreground-secondary);
	}

	.drones-page__type-pill {
		background: color-mix(in srgb, var(--gr-color-primary-100) 66%, white 34%);
		color: var(--gr-color-primary-800);
	}

	.drones-page__message--error {
		color: var(--gr-color-error-800);
	}

	.drones-page__message--warning {
		color: var(--gr-color-warning-800);
	}

	@media (max-width: 960px) {
		.drones-page__grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.drones-page__field-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
