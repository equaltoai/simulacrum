<script lang="ts">
	import {
		finalizeSoulPromotion,
		type AgentWorkflowSurface,
	} from '$lib/api';
	import {
		finalizeAgentMintConversation,
		getAgentMintConversationFinalizePreflight,
		type SoulMintConversationFinalizePreflightResponse,
	} from '$lib/api/soulWorkflowHost';
	import { getInjectedProvider, personalSign, requestAccounts } from '$lib/tips/provider';

	interface Props {
		hostToken?: string;
		hostBaseUrl?: string | null;
		agentId?: string | null;
		conversationId?: string | null;
		username?: string | null;
		expectedWallet?: string | null;
		activeSoulAgentId?: string | null;
		workflow?: AgentWorkflowSurface | null;
		onUpdated?: () => Promise<void> | void;
	}

	let {
		hostToken = '',
		hostBaseUrl = null,
		agentId = null,
		conversationId = null,
		username = null,
		expectedWallet = null,
		activeSoulAgentId = null,
		workflow = null,
		onUpdated,
	}: Props = $props();

	let loading = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let lastPublishedVersion = $state<number | null>(null);

	async function signAndFinalize() {
		if (!hostToken.trim() || !hostBaseUrl?.trim() || !agentId || !conversationId || !username?.trim()) return;

		loading = true;
		error = null;
		success = null;

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

			const initialBegin = await getAgentMintConversationFinalizePreflight({
				token: hostToken,
				baseUrl: hostBaseUrl,
				agentId,
				conversationId,
				input: {
					boundary_signatures: {},
				},
			});

			const boundarySignatures = await collectBoundarySignatures(provider, wallet, initialBegin);
			const begin = await getAgentMintConversationFinalizePreflight({
				token: hostToken,
				baseUrl: hostBaseUrl,
				agentId,
				conversationId,
				input: {
					boundary_signatures: boundarySignatures,
				},
			});

			const selfAttestation = await personalSign(provider, {
				address: wallet,
				message: requireDigestHex(begin.digest_hex, 'final self-attestation'),
			});

			const hostResult = await finalizeAgentMintConversation({
				token: hostToken,
				baseUrl: hostBaseUrl,
				agentId,
				conversationId,
				input: {
					boundary_signatures: boundarySignatures,
					issued_at: begin.issued_at,
					expected_version: begin.expected_version,
					self_attestation: selfAttestation,
				},
			});

			lastPublishedVersion = hostResult.published_version;

			await finalizeSoulPromotion({
				input: buildFinalizeInput({
					username: username.trim(),
					begin,
					workflow,
					conversationId,
					soulAgentId: activeSoulAgentId ?? hostResult.agent.agent_id,
				}),
			});

			success = `Published soul packet v${hostResult.published_version} and synchronized the Simulacrum workflow.`;
			await onUpdated?.();
		} catch (finalizeError) {
			error =
				finalizeError instanceof Error
					? finalizeError.message
					: 'Finalize flow failed.';
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
				message: requireDigestHex(requirement.digest_hex, `boundary ${requirement.boundary_id}`),
			});
		}
		return signatures;
	}

	function buildFinalizeInput({
		username,
		begin,
		workflow,
		conversationId,
		soulAgentId,
	}: {
		username: string;
		begin: SoulMintConversationFinalizePreflightResponse;
		workflow: AgentWorkflowSurface | null;
		conversationId: string;
		soulAgentId: string | null;
	}) {
		const declarationPreview = begin.declarations_preview;
		const previewBoundaries = declarationPreview.boundaries ?? [];
		const previewCapabilities = declarationPreview.capabilities ?? [];

		return {
			username,
			readiness: workflow?.graduation?.readiness ?? 'ready',
			summary:
				workflow?.graduation?.summary ??
				'Soul packet finalized from the Simulacrum approval thread.',
			declarationTitle:
				workflow?.declaration?.title ??
				`${username} declaration packet`,
			declarationStatement:
				workflow?.declaration?.statement ??
				(typeof declarationPreview.selfDescription?.summary === 'string'
					? declarationPreview.selfDescription.summary
					: 'Published from the Simulacrum approval thread.'),
			declarationConfidence:
				workflow?.declaration?.confidence ?? 'published',
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
				['request recorded', 'conversation completed', 'wallet signatures captured'],
			exitCriteria:
				workflow?.graduation?.exitCriteria ??
				['Publish self-attested packet', 'Refresh continuity surfaces'],
			nextStep:
				workflow?.graduation?.nextStep ??
				'Refresh the identity nexus and dashboard.',
			continuityObjective:
				workflow?.continuity?.objective ??
				'Preserve the existing body through graduation.',
			continuityFeedbackLoop:
				workflow?.continuity?.feedbackLoop ??
				'Review the identity nexus and dashboard after publish.',
			conversationId,
			soulAgentId,
		};
	}

	function requireDigestHex(value: string | undefined, label: string): string {
		const digest = value?.trim() ?? '';
		if (!digest) {
			throw new Error(`Host finalize preflight did not return digest_hex for ${label}.`);
		}
		return digest;
	}
</script>

<section class="ft-panel">
	<header class="ft-panel__header">
		<div>
			<p class="ft-panel__eyebrow">Signing and finalize</p>
			<h2>Wallet approval lane</h2>
		</div>
		{#if lastPublishedVersion !== null}
			<span class="ft-panel__badge ft-panel__badge--success">v{lastPublishedVersion}</span>
		{/if}
	</header>

	<p class="ft-panel__copy">
		Finalize signs boundary digests first, then signs the self-attestation digest for the published packet, and finally updates the local drone workflow to the graduated state.
	</p>

	<div class="ft-panel__stats">
		<div>
			<strong>{expectedWallet ? 'bound' : 'unknown'}</strong>
			<span>{expectedWallet ?? 'wallet will be checked when available'}</span>
		</div>
		<div>
			<strong>{conversationId ? 'ready' : 'pending'}</strong>
			<span>{conversationId ?? 'complete the mint conversation first'}</span>
		</div>
	</div>

	<div class="ft-panel__actions">
		<button
			class="ft-button ft-button--primary"
			disabled={!hostToken.trim() || !hostBaseUrl?.trim() || !agentId || !conversationId || !username || loading}
			onclick={signAndFinalize}
			type="button"
		>
			Finalize graduation
		</button>
	</div>

	{#if success}
		<p class="ft-panel__message ft-panel__message--success">{success}</p>
	{/if}
	{#if error}
		<p class="ft-panel__message ft-panel__message--error">{error}</p>
	{/if}
</section>
