<script lang="ts">
	import {
		api,
		finalizeSoulPromotion,
		requestSoulPromotion,
		reviewSoulPromotion,
		type AgentWorkflowSurface,
		type DroneAgentState,
	} from '$lib/api';
	import {
		beginSoulAgentRegistration,
		completeMintConversation,
		finalizeMintConversation,
		getMintConversationFinalizePreflight,
		isHostSoulAgentId,
		startMintConversationStream,
		verifySoulAgentRegistration,
		type SoulAgentPromotion,
		type SoulMintConversationFinalizePreflightResponse,
	} from '$lib/api/soulWorkflowHost';
	import type { AgentType } from '$lib/greater/adapters/graphql';
	import { getInjectedProvider, personalSign, requestAccounts } from '$lib/tips/provider';

	import { getPageHref } from '../routing';
	import type { HostWorkflowState, MintTranscriptMessage } from '../types';

	interface Props {
		activeAgent?: DroneAgentState | null;
		username?: string | null;
		currentUserName?: string | null;
		hostWorkflow: HostWorkflowState;
		hostToken?: string;
		hostBaseUrl?: string | null;
		workflow?: AgentWorkflowSurface | null;
		onUpdated?: () => Promise<void> | void;
	}

	interface SseEvent {
		event: string;
		data: string;
	}

	const AGENT_TYPES: Array<{ value: AgentType; label: string }> = [
		{ value: 'ASSISTANT', label: 'Assistant' },
		{ value: 'CURATOR', label: 'Curator' },
		{ value: 'MODERATOR', label: 'Moderator' },
		{ value: 'RESEARCHER', label: 'Researcher' },
		{ value: 'BRIDGE', label: 'Bridge' },
		{ value: 'CUSTOM', label: 'Custom' },
	];

	let {
		activeAgent = null,
		username = null,
		currentUserName = null,
		hostWorkflow,
		hostToken = '',
		hostBaseUrl = null,
		workflow = null,
		onUpdated,
	}: Props = $props();

	let createUsername = $state('');
	let createDisplayName = $state('');
	let createBio = $state('');
	let createType = $state<AgentType>('ASSISTANT');
	let createVersion = $state('1.0.0');
	let createLoading = $state(false);
	let createError = $state<string | null>(null);
	let createdUsername = $state<string | null>(null);

	let registrationId = $state<string | null>(null);
	let conversationId = $state<string | null>(null);
	let transcript = $state<MintTranscriptMessage[]>([]);
	let conversationMessage = $state('Draft the hosted/off-chain identity declaration and continuity boundaries for this local drone body.');
	let principalDeclaration = $state('');
	let expectedWallet = $state<string | null>(null);
	let publishedHostAgentId = $state<string | null>(null);
	let loading = $state(false);
	let status = $state('idle');
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let warning = $state<string | null>(null);

	const effectiveUsername = $derived(activeAgent?.username ?? username?.trim() ?? createdUsername ?? null);
	const effectiveDisplayName = $derived(activeAgent?.displayName ?? effectiveUsername ?? 'this drone body');
	const hasLocalBody = $derived(Boolean(activeAgent?.username));
	const hasHostConfiguration = $derived(Boolean(hostWorkflow.bridgeEnabled && hostToken.trim() && hostBaseUrl?.trim()));
	const promotion = $derived(hostWorkflow.promotion);
	const activeRegistrationId = $derived(registrationId ?? hostWorkflow.registrationId);
	const activeConversationId = $derived(conversationId ?? hostWorkflow.selectedConversation?.conversation_id ?? null);
	const identityHref = $derived(effectiveUsername ? getPageHref('identity', effectiveUsername) : getPageHref('drones'));

	$effect(() => {
		if (loading) return;
		registrationId = hostWorkflow.registrationId;
		conversationId = hostWorkflow.selectedConversation?.conversation_id ?? null;
		transcript = [...hostWorkflow.transcript];
		expectedWallet = hostWorkflow.expectedWallet;
	});

	$effect(() => {
		if (principalDeclaration.trim() || !effectiveUsername) return;
		principalDeclaration = buildPrincipalDeclaration();
	});

	function resolveInstanceDomain(): string {
		if (typeof window === 'undefined') {
			throw new Error('Instance domain is unavailable outside the browser.');
		}
		const hostname = window.location.hostname.trim();
		if (!hostname) {
			throw new Error('Instance domain is unavailable from the current browser location.');
		}
		return hostname;
	}

	function selectedScopes(): string[] {
		return ['read', 'write', 'follow'];
	}

	function buildPrincipalDeclaration(): string {
		const domain = resolveInstanceDomain();
		const localId = effectiveUsername?.trim() || 'agent';
		return [
			`I authorize ${localId}.${domain} to be finalized as a Simulacrum managed Lesser Soul agent.`,
			'Hosted/off-chain publication is the primary creation path; on-chain binding remains an optional anchor upgrade.',
			`Declared by ${currentUserName?.trim() || 'the signed-in Simulacrum operator'}.`,
		].join('\n');
	}

	function formatPromotionValue(value?: string | boolean | number | null): string {
		if (value === true) return 'yes';
		if (value === false) return 'no';
		if (value === null || value === undefined || value === '') return 'not reported';
		return String(value);
	}

	function onchainSummary(currentPromotion: SoulAgentPromotion | null): string {
		if (!currentPromotion) return 'not prepared yet';
		if (currentPromotion.onchain_binding_status === 'executed') return 'executed';
		if (currentPromotion.onchain_binding_available) {
			return `${currentPromotion.onchain_binding_status ?? 'pending'}; optional upgrade`;
		}
		if (currentPromotion.next_actions?.includes('record_mint_execution')) {
			return 'mint execution can be recorded later as an optional upgrade';
		}
		return 'not required for creation';
	}

	function pushTranscriptMessage(next: MintTranscriptMessage) {
		transcript = [...transcript, next];
	}

	function updateAssistantMessage(content: string) {
		const last = transcript.at(-1);
		if (last?.id === 'bootstrap-streaming-assistant') {
			transcript = [...transcript.slice(0, -1), { ...last, content }];
			return;
		}

		pushTranscriptMessage({
			id: 'bootstrap-streaming-assistant',
			role: 'assistant',
			label: 'Host review',
			content,
		});
	}

	function parseSseChunk(buffer: string): { remainder: string; events: SseEvent[] } {
		const events: SseEvent[] = [];
		let remainder = buffer;

		while (true) {
			const boundary = remainder.indexOf('\n\n');
			if (boundary === -1) break;

			const block = remainder.slice(0, boundary);
			remainder = remainder.slice(boundary + 2);

			let event = 'message';
			const dataLines: string[] = [];
			for (const line of block.split('\n')) {
				if (line.startsWith('event:')) {
					event = line.slice(6).trim();
				} else if (line.startsWith('data:')) {
					dataLines.push(line.slice(5).trim());
				}
			}

			events.push({ event, data: dataLines.join('\n') });
		}

		return { remainder, events };
	}

	async function handleCreateDrone() {
		if (createLoading) return;

		const localId = createUsername.trim();
		const displayName = createDisplayName.trim();
		const version = createVersion.trim();
		if (!localId) {
			createError = 'Choose the local drone username first.';
			return;
		}
		if (!displayName) {
			createError = 'Choose the local drone display name first.';
			return;
		}
		if (!version) {
			createError = 'Choose the local drone version first.';
			return;
		}

		createLoading = true;
		createError = null;
		error = null;
		success = null;

		try {
			const delegation = await api.delegateToAgent({
				input: {
					agentUsername: localId,
					displayName,
					bio: createBio.trim() || undefined,
					scopes: selectedScopes(),
					agentType: createType,
					agentVersion: version,
					version,
				},
			});
			createdUsername = delegation.agent.username;
			createUsername = '';
			createDisplayName = '';
			createBio = '';
			createType = 'ASSISTANT';
			createVersion = '1.0.0';
			success = `Local drone @${delegation.agent.username} is ready. Open its Identity page to continue hosted/off-chain creation.`;
			await onUpdated?.();
		} catch (createFailure) {
			createError = createFailure instanceof Error ? createFailure.message : 'Failed to create the local drone body.';
		} finally {
			createLoading = false;
		}
	}

	async function seedLocalPromotion(conversation: string | null) {
		if (!effectiveUsername?.trim()) return;
		const localId = effectiveUsername.trim();
		try {
			await requestSoulPromotion({
				input: {
					username: localId,
					title: `Hosted/off-chain soul creation for ${localId}`,
					summary:
						'Agent-first hosted/off-chain creation was started from the Simulacrum identity bootstrap lane.',
					constraints: [
						'Preserve same-body continuity for the local drone.',
						'Treat on-chain binding as an optional anchor upgrade, not a creation prerequisite.',
					],
					routeDecision: 'hosted_offchain_bootstrap',
					conversationId: conversation,
				},
			});
			await reviewSoulPromotion({
				input: {
					username: localId,
					title: 'Hosted/off-chain creation approval',
					decision: 'approved',
					decisionSummary:
						'Simulacrum approved the hosted/off-chain creation lane; on-chain binding remains optional.',
					findings: null,
					evidence: null,
					conversationId: conversation,
				},
			});
			warning = null;
		} catch (localFailure) {
			warning = localFailure instanceof Error
				? `Host bootstrap can continue, but the local Lesser request/review projection did not update: ${localFailure.message}`
				: 'Host bootstrap can continue, but the local Lesser request/review projection did not update.';
		}
	}

	async function beginAndVerifyRegistration() {
		if (!hasHostConfiguration || !effectiveUsername?.trim()) return;

		loading = true;
		error = null;
		success = null;
		status = 'registering';

		try {
			const provider = getInjectedProvider();
			if (!provider) {
				throw new Error('No wallet detected. Install or unlock an EIP-1193 provider first.');
			}

			const accounts = await requestAccounts(provider);
			const wallet = accounts[0];
			if (!wallet) {
				throw new Error('No wallet account is available from the connected provider.');
			}

			const localId = effectiveUsername.trim();
			const domain = resolveInstanceDomain();
			const begin = await beginSoulAgentRegistration({
				token: hostToken,
				baseUrl: hostBaseUrl ?? undefined,
				input: {
					domain,
					local_id: localId,
					wallet_address: wallet,
				},
			});

			registrationId = begin.registration.id;
			expectedWallet = wallet;
			const registrationSignature = await personalSign(provider, {
				address: wallet,
				message: begin.wallet.message,
			});
			const declaration = principalDeclaration.trim() || buildPrincipalDeclaration();
			const principalSignature = await personalSign(provider, {
				address: wallet,
				message: declaration,
			});

			const verified = await verifySoulAgentRegistration({
				token: hostToken,
				baseUrl: hostBaseUrl ?? undefined,
				registrationId: begin.registration.id,
				input: {
					signature: registrationSignature,
					principal_address: wallet,
					principal_declaration: declaration,
					principal_signature: principalSignature,
					declared_at: new Date().toISOString(),
				},
			});

			await seedLocalPromotion(verified.promotion?.latest_conversation_id ?? null);
			status = 'verified';
			success = 'Hosted/off-chain registration was verified. Start the registration-scoped review conversation next.';
			await onUpdated?.();
		} catch (registrationFailure) {
			error = registrationFailure instanceof Error
				? registrationFailure.message
				: 'Hosted/off-chain registration failed.';
			status = 'error';
		} finally {
			loading = false;
		}
	}

	async function submitConversationTurn() {
		if (!hasHostConfiguration || !activeRegistrationId || !conversationMessage.trim()) return;

		loading = true;
		error = null;
		success = null;
		status = 'streaming';

		const inputMessage = conversationMessage.trim();
		conversationMessage = '';
		pushTranscriptMessage({
			id: crypto.randomUUID(),
			role: 'user',
			label: 'Operator',
			content: inputMessage,
		});

		let buffer = '';
		let assistantText = '';

		try {
			const stream = startMintConversationStream({
				token: hostToken,
				baseUrl: hostBaseUrl ?? undefined,
				registrationId: activeRegistrationId,
				input: {
					conversation_id: activeConversationId ?? undefined,
					message: inputMessage,
				},
			});

			const reader = stream.getReader();
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += value;
				const parsed = parseSseChunk(buffer);
				buffer = parsed.remainder;

				for (const event of parsed.events) {
					const payload = event.data ? (JSON.parse(event.data) as Record<string, unknown>) : {};
					if (event.event === 'conversation_start') {
						const nextConversationId = payload.conversation_id;
						if (typeof nextConversationId === 'string' && nextConversationId.trim()) {
							conversationId = nextConversationId.trim();
						}
					}

					if (event.event === 'delta') {
						const deltaText = typeof payload.text === 'string' ? payload.text : '';
						assistantText += deltaText;
						updateAssistantMessage(assistantText);
					}

					if (event.event === 'conversation_done') {
						const finalText =
							typeof payload.full_response === 'string' && payload.full_response.trim()
								? payload.full_response
								: assistantText;
						updateAssistantMessage(finalText);
						status = 'conversation ready';
						success = 'Hosted/off-chain review turn recorded.';
						await seedLocalPromotion(conversationId ?? activeConversationId);
						await onUpdated?.();
					}

					if (event.event === 'error') {
						const messageText =
							typeof payload.message === 'string'
								? payload.message
								: typeof payload.error === 'string'
									? payload.error
									: 'Hosted/off-chain review stream failed.';
						throw new Error(messageText);
					}
				}
			}
		} catch (streamFailure) {
			error = streamFailure instanceof Error ? streamFailure.message : 'Hosted/off-chain review stream failed.';
			status = 'error';
		} finally {
			loading = false;
		}
	}

	async function markConversationComplete() {
		if (!hasHostConfiguration || !activeRegistrationId || !activeConversationId) return;

		loading = true;
		error = null;
		success = null;

		try {
			await completeMintConversation({
				token: hostToken,
				baseUrl: hostBaseUrl ?? undefined,
				registrationId: activeRegistrationId,
				conversationId: activeConversationId,
			});
			status = 'completed';
			success = 'Hosted/off-chain conversation is complete and ready to finalize.';
			await seedLocalPromotion(activeConversationId);
			await onUpdated?.();
		} catch (completionFailure) {
			error = completionFailure instanceof Error
				? completionFailure.message
				: 'Failed to complete the hosted/off-chain conversation.';
		} finally {
			loading = false;
		}
	}

	async function collectBoundarySignatures(
		provider: NonNullable<ReturnType<typeof getInjectedProvider>>,
		wallet: `0x${string}`,
		begin: SoulMintConversationFinalizePreflightResponse
	): Promise<Record<string, string>> {
		const signatures: Record<string, string> = {};
		for (const requirement of begin.boundary_requirements ?? []) {
			signatures[requirement.boundary_id] = await personalSign(provider, {
				address: wallet,
				message: requirement.digest_hex,
			});
		}
		return signatures;
	}

	function buildFinalizeInput({
		begin,
		soulAgentId,
	}: {
		begin: SoulMintConversationFinalizePreflightResponse;
		soulAgentId: string | null;
	}) {
		const localId = effectiveUsername?.trim() ?? 'agent';
		const declarationPreview = begin.declarations_preview;
		const previewBoundaries = declarationPreview.boundaries ?? [];
		const previewCapabilities = declarationPreview.capabilities ?? [];
		return {
			username: localId,
			readiness: workflow?.graduation?.readiness ?? 'ready',
			summary:
				workflow?.graduation?.summary ??
				'Hosted/off-chain soul packet finalized from the Simulacrum identity bootstrap lane.',
			declarationTitle:
				workflow?.declaration?.title ?? `${localId} hosted/off-chain declaration packet`,
			declarationStatement:
				workflow?.declaration?.statement ??
				(typeof declarationPreview.selfDescription?.summary === 'string'
					? declarationPreview.selfDescription.summary
					: 'Published through the Simulacrum-led hosted/off-chain bootstrap lane.'),
			declarationConfidence: workflow?.declaration?.confidence ?? 'published',
			declaredScope:
				workflow?.declaration?.declaredScope ??
				previewCapabilities.map((capability, index) => {
					const label = capability.capability;
					return typeof label === 'string' && label.trim()
						? label.trim()
						: `capability-${index + 1}`;
				}),
			declarationRisks:
				workflow?.declaration?.risks ??
				previewBoundaries.map((boundary, index) => {
					const statement = boundary.statement;
					return typeof statement === 'string' && statement.trim()
						? statement.trim()
						: `Boundary ${index + 1}`;
				}),
			supportingArtifacts:
				workflow?.declaration?.supportingArtifacts?.map((artifact) => ({
					title: artifact.title,
					description: artifact.description ?? null,
					href: artifact.href ?? null,
					emphasis: artifact.emphasis ?? null,
				})) ?? null,
			completedMilestones:
				workflow?.graduation?.completedMilestones ??
				['local drone selected', 'host registration verified', 'hosted/off-chain conversation completed'],
			exitCriteria:
				workflow?.graduation?.exitCriteria ??
				['Publish hosted/off-chain identity', 'Bind returned Host agent id in Lesser'],
			nextStep:
				workflow?.graduation?.nextStep ??
				'Refresh the identity nexus; on-chain binding remains available as an optional upgrade when Host exposes it.',
			continuityObjective:
				workflow?.continuity?.objective ??
				'Preserve the existing local body identity through hosted/off-chain soul creation.',
			continuityFeedbackLoop:
				workflow?.continuity?.feedbackLoop ??
				'Review identity, dashboard, and attribution surfaces after publication.',
			conversationId: activeConversationId,
			soulAgentId,
		};
	}

	async function finalizeHostedOffchain() {
		if (!hasHostConfiguration || !activeRegistrationId || !activeConversationId || !effectiveUsername?.trim()) return;

		loading = true;
		error = null;
		success = null;
		status = 'finalizing';

		try {
			const provider = getInjectedProvider();
			if (!provider) {
				throw new Error('No wallet detected. Install or unlock an EIP-1193 provider first.');
			}

			const accounts = await requestAccounts(provider);
			const wallet = accounts[0];
			if (!wallet) {
				throw new Error('No wallet account is available from the connected provider.');
			}
			if (expectedWallet?.trim() && wallet.toLowerCase() !== expectedWallet.trim().toLowerCase()) {
				throw new Error(`Connected wallet does not match the expected wallet (${expectedWallet}).`);
			}

			const initialBegin = await getMintConversationFinalizePreflight({
				token: hostToken,
				baseUrl: hostBaseUrl ?? undefined,
				registrationId: activeRegistrationId,
				conversationId: activeConversationId,
				input: { boundary_signatures: {} },
			});
			const boundarySignatures = await collectBoundarySignatures(provider, wallet, initialBegin);
			const begin = await getMintConversationFinalizePreflight({
				token: hostToken,
				baseUrl: hostBaseUrl ?? undefined,
				registrationId: activeRegistrationId,
				conversationId: activeConversationId,
				input: { boundary_signatures: boundarySignatures },
			});
			const selfAttestation = await personalSign(provider, {
				address: wallet,
				message: begin.digest_hex,
			});
			const hostResult = await finalizeMintConversation({
				token: hostToken,
				baseUrl: hostBaseUrl ?? undefined,
				registrationId: activeRegistrationId,
				conversationId: activeConversationId,
				input: {
					boundary_signatures: boundarySignatures,
					issued_at: begin.issued_at,
					expected_version: begin.expected_version,
					self_attestation: selfAttestation,
				},
			});

			const hostAgentId = isHostSoulAgentId(hostResult.agent.agent_id)
				? hostResult.agent.agent_id
				: null;
			publishedHostAgentId = hostAgentId;
			await finalizeSoulPromotion({
				input: buildFinalizeInput({ begin, soulAgentId: hostAgentId }),
			});

			status = 'published';
			success = hostAgentId
				? `Hosted/off-chain agent ${hostAgentId} published and bound to the local drone workflow.`
				: 'Hosted/off-chain agent published; Lesser workflow was finalized without a Host 0x id in the response.';
			await onUpdated?.();
		} catch (finalizeFailure) {
			error = finalizeFailure instanceof Error
				? finalizeFailure.message
				: 'Hosted/off-chain finalization failed.';
			status = 'error';
		} finally {
			loading = false;
		}
	}
</script>

<section class="ft-panel bootstrap-panel">
	<header class="ft-panel__header">
		<div>
			<p class="ft-panel__eyebrow">Agent-first bootstrap</p>
			<h2>Create the hosted/off-chain soul from Simulacrum</h2>
		</div>
		<span class="ft-panel__badge">{status}</span>
	</header>

	<p class="ft-panel__copy">
		No soul is bound to this local body yet. Simulacrum now leads the zero-state process: create or select a local drone,
		verify a registration with lesser-host, run the registration-scoped review conversation, then publish the hosted/off-chain
		agent and bind the returned Host id back into Lesser. On-chain binding is an optional upgrade, never a creation gate.
	</p>

	{#if !hasLocalBody}
		<section class="bootstrap-panel__lane bootstrap-panel__lane--warning">
			<header>
				<p>Step 0</p>
				<h3>Create a local drone body first</h3>
			</header>
			<p>
				The Host registration needs a Lesser body to preserve continuity. Create the body here, then continue from its
				identity page.
			</p>
			<label class="ft-field">
				<span>Drone username</span>
				<input bind:value={createUsername} disabled={createLoading} placeholder="agent-local-id" type="text" />
			</label>
			<label class="ft-field">
				<span>Display name</span>
				<input bind:value={createDisplayName} disabled={createLoading} placeholder="Agent display name" type="text" />
			</label>
			<label class="ft-field">
				<span>Body remit</span>
				<textarea bind:value={createBio} disabled={createLoading} rows="3"></textarea>
			</label>
			<div class="bootstrap-panel__field-grid">
				<label class="ft-field">
					<span>Type</span>
					<select bind:value={createType} disabled={createLoading}>
						{#each AGENT_TYPES as type}
							<option value={type.value}>{type.label}</option>
						{/each}
					</select>
				</label>
				<label class="ft-field">
					<span>Version</span>
					<input bind:value={createVersion} disabled={createLoading} type="text" />
				</label>
			</div>
			<div class="ft-panel__actions">
				<button class="ft-button ft-button--primary" disabled={createLoading} onclick={handleCreateDrone} type="button">
					{createLoading ? 'Creating body...' : 'Create local drone'}
				</button>
				{#if createdUsername}
					<a class="ft-button" href={getPageHref('identity', createdUsername)}>Open @{createdUsername}</a>
				{/if}
			</div>
			{#if createError}
				<p class="ft-panel__message ft-panel__message--error">{createError}</p>
			{/if}
		</section>
	{:else}
		<section class="bootstrap-panel__lane">
			<header>
				<p>Selected body</p>
				<h3>{effectiveDisplayName}</h3>
			</header>
			<p>
				Local body <a href={identityHref}>@{effectiveUsername}</a> is the continuity anchor for this bootstrap.
			</p>
		</section>
	{/if}

	<section class="bootstrap-panel__lane" class:bootstrap-panel__lane--warning={!hasHostConfiguration}>
		<header>
			<p>Configuration</p>
			<h3>{hasHostConfiguration ? 'Host bridge is ready' : 'Host token required'}</h3>
		</header>
		<p>
			{#if !hostWorkflow.bridgeEnabled}
				This build intentionally keeps the Host workflow bridge disabled. Enable the bridge build flag to expose live hosted/off-chain creation.
			{:else if !hostBaseUrl}
				Lesser did not return a managed lesser-host base URL. Configure the instance trust base URL before starting hosted/off-chain creation.
			{:else if !hostToken.trim()}
				Connect a lesser-host control-plane bearer token in the Host token panel on this page. The token stays in browser session storage and is never replaced with instance-key creation.
			{:else}
				Using the existing control-plane bearer token model against {hostBaseUrl}. No instance-key zero-state creation or secret material is introduced.
			{/if}
		</p>
	</section>

	<section class="bootstrap-panel__lane">
		<header>
			<p>Host promotion snapshot</p>
			<h3>{promotion ? promotion.stage : 'No registration yet'}</h3>
		</header>
		<div class="bootstrap-panel__stats">
			<div>
				<strong>{formatPromotionValue(promotion?.anchor_state)}</strong>
				<span>anchor state</span>
			</div>
			<div>
				<strong>{formatPromotionValue(promotion?.hosted_offchain_finalizable)}</strong>
				<span>hosted finalize ready</span>
			</div>
			<div>
				<strong>{onchainSummary(promotion)}</strong>
				<span>on-chain binding</span>
			</div>
		</div>
		{#if promotion?.next_actions?.length}
			<p class="ft-panel__copy">Next Host actions: {promotion.next_actions.join(', ')}</p>
		{/if}
	</section>

	<section class="bootstrap-panel__lane">
		<header>
			<p>Step 1</p>
			<h3>Begin and verify Host registration</h3>
		</header>
		<label class="ft-field">
			<span>Principal declaration</span>
			<textarea bind:value={principalDeclaration} disabled={loading || !hasLocalBody} rows="4"></textarea>
		</label>
		<div class="ft-panel__actions">
			<button
				class="ft-button ft-button--primary"
				disabled={!hasLocalBody || !hasHostConfiguration || loading}
				onclick={beginAndVerifyRegistration}
				type="button"
			>
				Begin + verify registration
			</button>
		</div>
		<p class="ft-panel__copy">
			Registration id: {activeRegistrationId ?? 'pending'} · wallet: {expectedWallet ?? 'connect during verification'}
		</p>
	</section>

	<section class="bootstrap-panel__lane">
		<header>
			<p>Step 2</p>
			<h3>Run hosted/off-chain review conversation</h3>
		</header>
		<div class="bootstrap-panel__transcript">
			{#if transcript.length}
				{#each transcript as item (item.id)}
					<article class:bootstrap-panel__transcript-item--assistant={item.role === 'assistant'} class="bootstrap-panel__transcript-item">
						<p>{item.label}</p>
						<span>{item.content}</span>
					</article>
				{/each}
			{:else}
				<p class="ft-panel__copy">No registration-scoped transcript has been recorded yet.</p>
			{/if}
		</div>
		<label class="ft-field">
			<span>Conversation turn</span>
			<textarea bind:value={conversationMessage} disabled={!activeRegistrationId || !hasHostConfiguration || loading} rows="4"></textarea>
		</label>
		<div class="ft-panel__actions">
			<button
				class="ft-button ft-button--primary"
				disabled={!activeRegistrationId || !conversationMessage.trim() || !hasHostConfiguration || loading}
				onclick={submitConversationTurn}
				type="button"
			>
				Send review turn
			</button>
			<button
				class="ft-button"
				disabled={!activeRegistrationId || !activeConversationId || !hasHostConfiguration || loading}
				onclick={markConversationComplete}
				type="button"
			>
				Mark conversation complete
			</button>
		</div>
		<p class="ft-panel__copy">Conversation id: {activeConversationId ?? 'pending'}</p>
	</section>

	<section class="bootstrap-panel__lane bootstrap-panel__lane--success">
		<header>
			<p>Step 3</p>
			<h3>Finalize hosted/off-chain agent</h3>
		</header>
		<p>
			This publishes the Host agent as hosted/off-chain by default, then calls Lesser <code>finalizeSoulPromotion</code>
			with the returned Host agent id. Mint execution is not required for this button.
		</p>
		<div class="ft-panel__actions">
			<button
				class="ft-button ft-button--primary"
				disabled={!activeRegistrationId || !activeConversationId || !hasHostConfiguration || loading}
				onclick={finalizeHostedOffchain}
				type="button"
			>
				Finalize hosted/off-chain agent
			</button>
		</div>
		{#if publishedHostAgentId}
			<p class="ft-panel__message ft-panel__message--success">Returned Host agent id: {publishedHostAgentId}</p>
		{/if}
	</section>

	{#if warning}
		<p class="ft-panel__message ft-panel__message--warning">{warning}</p>
	{/if}
	{#if success}
		<p class="ft-panel__message ft-panel__message--success">{success}</p>
	{/if}
	{#if error}
		<p class="ft-panel__message ft-panel__message--error">{error}</p>
	{/if}
</section>

<style>
	.bootstrap-panel,
	.bootstrap-panel__lane,
	.bootstrap-panel__transcript,
	.bootstrap-panel__field-grid,
	.bootstrap-panel__stats {
		display: grid;
		gap: 1rem;
	}

	.bootstrap-panel__lane {
		border: 1px solid color-mix(in srgb, var(--ft-color-border, #d7dce5), transparent 10%);
		border-radius: 1rem;
		padding: 1rem;
		background: color-mix(in srgb, var(--ft-color-surface, #ffffff), transparent 2%);
	}

	.bootstrap-panel__lane--warning {
		border-color: color-mix(in srgb, #f59e0b, transparent 35%);
		background: color-mix(in srgb, #f59e0b, transparent 92%);
	}

	.bootstrap-panel__lane--success {
		border-color: color-mix(in srgb, #10b981, transparent 35%);
		background: color-mix(in srgb, #10b981, transparent 94%);
	}

	.bootstrap-panel__lane header {
		display: grid;
		gap: 0.25rem;
	}

	.bootstrap-panel__lane header p,
	.bootstrap-panel__transcript-item p,
	.bootstrap-panel__stats span {
		margin: 0;
		color: var(--ft-color-muted, #64748b);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.bootstrap-panel__lane header h3,
	.bootstrap-panel__lane p,
	.bootstrap-panel__transcript-item span {
		margin: 0;
	}

	.bootstrap-panel__field-grid,
	.bootstrap-panel__stats {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.bootstrap-panel__stats div {
		display: grid;
		gap: 0.25rem;
		border: 1px solid var(--ft-color-border, #d7dce5);
		border-radius: 0.75rem;
		padding: 0.75rem;
	}

	.bootstrap-panel__transcript {
		max-height: 22rem;
		overflow: auto;
	}

	.bootstrap-panel__transcript-item {
		border: 1px solid var(--ft-color-border, #d7dce5);
		border-radius: 0.75rem;
		padding: 0.75rem;
		background: var(--ft-color-surface-muted, #f8fafc);
	}

	.bootstrap-panel__transcript-item--assistant {
		background: color-mix(in srgb, #6366f1, transparent 92%);
	}

	@media (max-width: 760px) {
		.bootstrap-panel__field-grid,
		.bootstrap-panel__stats {
			grid-template-columns: 1fr;
		}
	}
</style>
