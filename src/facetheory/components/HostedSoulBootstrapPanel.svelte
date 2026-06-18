<script lang="ts">
	import { tick } from 'svelte';

	import {
		completeHostedSoulGenesis,
		publishHostedSoul,
		restartSoulBootstrap,
		sendHostedSoulGenesisMessage,
		startHostedSoulBootstrap,
		type HostedSoulBootstrapNextAction,
		type HostedSoulBootstrapRecoveryAction,
		type HostedSoulBootstrapRecoveryCategory,
		type HostedSoulBootstrapResult,
		type HostedSoulBootstrapStateModel,
		type SoulBootstrapResult,
	} from '$lib/api/soulBootstrap';
	import {
		getHostedSoulBootstrapTerminalDeclarationEvidence,
		isHostedSoulBootstrapPublishReady,
		type HostedSoulBootstrapTerminalDeclarationEvidence,
	} from '$lib/greater/adapters';

	import { getPageHref } from '../routing';

	interface Props {
		result: HostedSoulBootstrapResult | SoulBootstrapResult | null;
		onUpdated?: () => Promise<void> | void;
	}

	type HostedDefaultAction = HostedSoulBootstrapNextAction | 'REFRESH_STATE';
	type HostedStepKey = 'body' | 'start' | 'genesis' | 'review' | 'publish' | 'bound';
	type StepStatus = 'complete' | 'active' | 'pending' | 'blocked';

	const HOSTED_STEPS: Array<{ key: HostedStepKey; label: string; detail: string }> = [
		{ key: 'body', label: 'Local body', detail: 'Choose a local drone/body inside Simulacrum.' },
		{ key: 'start', label: 'Hosted definition', detail: 'Start or resume via Lesser same-origin GraphQL.' },
		{ key: 'genesis', label: 'Genesis', detail: 'Run the hosted/off-chain genesis conversation.' },
		{ key: 'review', label: 'Declarations', detail: 'Review generated declaration evidence.' },
		{ key: 'publish', label: 'Publish', detail: 'Publish the hosted/off-chain soul.' },
		{ key: 'bound', label: 'Bound soul', detail: 'Inspect continuity after Lesser reports binding.' },
	];

	let { result, onUpdated }: Props = $props();

	let busy = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let messageDraft = $state('');
	let draftContext = $state<string | null>(null);

	const hosted = $derived(resolveHostedState(result));
	const defaultAction = $derived(resolveHostedDefaultAction(result));
	const activeConversationId = $derived(result?.state?.hostConversationId ?? null);
	const declarationEvidence = $derived(
		getHostedSoulBootstrapTerminalDeclarationEvidence(result?.state ?? null, {
			conversationId: activeConversationId,
		})
	);
	const declarationEvidenceReady = $derived(
		isHostedSoulBootstrapPublishReady(result?.state ?? null, {
			conversationId: activeConversationId,
		})
	);
	const publishEvidenceMissing = $derived(
		defaultAction === 'PUBLISH_HOSTED_SOUL' && !declarationEvidenceReady
	);
	const steps = $derived(buildHostedSteps(defaultAction, result, declarationEvidenceReady));
	const actionLabel = $derived(actionLabelFor(defaultAction));
	const actionSummary = $derived(actionSummaryFor(defaultAction, result));
	const declarationEvidenceSummary = $derived(readDeclarationEvidenceSummary(result, declarationEvidence));
	const canRunDefaultAction = $derived(
		canRunAction(defaultAction, result, messageDraft, busy, declarationEvidenceReady)
	);
	const recoveryCategory = $derived(readRecoveryCategory(result));
	const recoveryAction = $derived(readRecoveryAction(result));
	const identityHref = $derived(getPageHref('identity', resolveUsername(result)));

	$effect(() => {
		const nextContext = [
			resolveUsername(result),
			result?.state?.phase ?? 'missing',
			result?.state?.state ?? 'missing',
			result?.state?.hostRegistrationId ?? 'no-registration',
			result?.state?.hostConversationId ?? 'no-conversation',
			defaultAction,
		].join(':');
		if (draftContext === nextContext) return;
		draftContext = nextContext;
		messageDraft = defaultGenesisMessage(result);
		error = null;
		success = null;
	});

	function resolveHostedState(
		source: HostedSoulBootstrapResult | SoulBootstrapResult | null
	): HostedSoulBootstrapStateModel | null {
		return (source as HostedSoulBootstrapResult | null)?.hosted ?? (source?.state
			? {
					username: source.state.username,
					bodyId: source.state.bodyId,
					phase: source.state.phase,
					state: source.state.state,
					bootstrapMode: source.state.bootstrapMode,
					authorityModel: source.state.authorityModel,
					anchorState: source.state.anchorState ?? null,
					assuranceState: source.state.assuranceState ?? null,
					typedNextAction: source.state.typedNextAction,
					nextAction: source.nextAction ?? null,
					recoveryCategory: source.surface?.recoveryCategory ?? source.state.recoveryCategory ?? null,
					recoveryAction: source.surface?.recoveryAction ?? source.state.recoveryAction ?? null,
					retryable: source.surface?.retryable ?? source.state.retryable,
					restartRequired: source.state.restartRequired,
					restartAvailable: source.surface?.restartAvailable ?? source.state.restartAvailable,
					hostRegistrationId: source.state.hostRegistrationId ?? null,
					hostConversationId: source.state.hostConversationId ?? null,
					hostSoulAgentId: source.state.hostSoulAgentId ?? null,
					existingSoulAgentId: source.surface?.existingSoulAgentId ?? null,
					soulBindingState: source.surface?.soulBindingState ?? 'UNBOUND',
					publication: source.state.publication ?? null,
					hostRequest: {
						hostRequestId: source.state.error?.hostRequestId ?? source.state.lastHostRequestId ?? null,
						lastHostRequestId: source.state.lastHostRequestId ?? null,
						recoveryAttemptId: source.state.recoveryAttemptId ?? null,
						restartIdempotencyKey: source.state.restartIdempotencyKey ?? null,
						supersededHostRegistrationId: source.state.correlation?.supersededHostRegistrationId ?? null,
						supersededHostConversationId: source.state.correlation?.supersededHostConversationId ?? null,
					},
					updatedAt: source.state.updatedAt ?? null,
					restartedAt: source.state.restartedAt ?? null,
				}
			: null);
	}

	function resolveHostedDefaultAction(
		source: HostedSoulBootstrapResult | SoulBootstrapResult | null
	): HostedDefaultAction {
		if (!source?.state) return 'REFRESH_STATE';
		if (source.surface?.soulBindingState === 'BOUND' || source.state.phase === 'COMPLETE') return 'COMPLETE';
		const recoveryAction = readRecoveryAction(source);
		if (recoveryAction === 'RESTART_BOOTSTRAP') return 'RESTART_SOUL_BOOTSTRAP';
		if (recoveryAction === 'RETRY_SAME_STEP') return 'RETRY_SAME_STEP';
		if (recoveryAction === 'REFRESH_STATE') return 'REFRESH_STATE';
		if (recoveryAction === 'CONTACT_OPERATOR') return 'OPERATOR_ACTION_REQUIRED';
		return readTypedNextAction(source) ?? 'REFRESH_STATE';
	}

	function buildHostedSteps(
		action: HostedDefaultAction,
		source: HostedSoulBootstrapResult | SoulBootstrapResult | null,
		hasDeclarationEvidence: boolean
	): Array<{ key: HostedStepKey; label: string; detail: string; status: StepStatus }> {
		const activeKey = stepKeyForAction(action, source);
		const activeIndex = HOSTED_STEPS.findIndex((step) => step.key === activeKey);
		const blocked =
			(source?.state?.phase === 'ERROR' && action === 'OPERATOR_ACTION_REQUIRED') ||
			(action === 'PUBLISH_HOSTED_SOUL' && !hasDeclarationEvidence);
		return HOSTED_STEPS.map((step, index) => ({
			...step,
			status: blocked
				? step.key === activeKey ? 'blocked' : index < activeIndex ? 'complete' : 'pending'
				: activeKey === 'bound'
					? 'complete'
					: index < activeIndex
						? 'complete'
						: index === activeIndex
							? 'active'
							: 'pending',
		}));
	}

	function stepKeyForAction(
		action: HostedDefaultAction,
		source: HostedSoulBootstrapResult | SoulBootstrapResult | null
	): HostedStepKey {
		if (!source?.state) return 'body';
		switch (action) {
			case 'START_HOSTED_BOOTSTRAP':
				return 'start';
			case 'SEND_HOSTED_SOUL_GENESIS_MESSAGE':
			case 'COMPLETE_HOSTED_SOUL_GENESIS':
				return action === 'COMPLETE_HOSTED_SOUL_GENESIS' ? 'review' : 'genesis';
			case 'PUBLISH_HOSTED_SOUL':
				return 'publish';
			case 'COMPLETE':
				return 'bound';
			case 'RESTART_SOUL_BOOTSTRAP':
				return 'start';
			case 'RETRY_SAME_STEP':
				if (source.state.phase === 'FINALIZE') return 'publish';
				if (source.state.phase === 'CONVERSATION') return source.state.hostConversationId ? 'review' : 'genesis';
				return 'start';
			case 'REFRESH_STATE':
			case 'OPERATOR_ACTION_REQUIRED':
			default:
				return source.state.phase === 'ERROR' ? 'start' : 'body';
		}
	}

	function actionLabelFor(action: HostedDefaultAction): string {
		switch (action) {
			case 'START_HOSTED_BOOTSTRAP':
				return 'Start Hosted Definition';
			case 'SEND_HOSTED_SOUL_GENESIS_MESSAGE':
				return 'Send Genesis Message';
			case 'COMPLETE_HOSTED_SOUL_GENESIS':
				return 'Review Generated Declarations';
			case 'PUBLISH_HOSTED_SOUL':
				return 'Publish Hosted Soul';
			case 'RESTART_SOUL_BOOTSTRAP':
				return 'Restart Hosted Definition';
			case 'RETRY_SAME_STEP':
				return 'Retry Hosted Step';
			case 'REFRESH_STATE':
				return 'Refresh Hosted State';
			case 'OPERATOR_ACTION_REQUIRED':
				return 'Refresh After Operator Action';
			case 'COMPLETE':
				return 'Inspect Identity Nexus';
			default:
				return 'Refresh Hosted State';
		}
	}

	function actionSummaryFor(
		action: HostedDefaultAction,
		source: HostedSoulBootstrapResult | SoulBootstrapResult | null
	): string {
		switch (action) {
			case 'START_HOSTED_BOOTSTRAP':
				return 'Start or resume hosted/off-chain definition through Lesser same-origin GraphQL. This default path does not require a selected wallet or browser signing prompt.';
			case 'SEND_HOSTED_SOUL_GENESIS_MESSAGE':
				return 'Run the hosted genesis conversation so Lesser/Host can shape declaration evidence for this local body.';
			case 'COMPLETE_HOSTED_SOUL_GENESIS':
				return 'Review the generated declaration evidence from the hosted genesis conversation, then advance to publication.';
			case 'PUBLISH_HOSTED_SOUL':
				return 'Publish the hosted/off-chain soul under instance trust authority. Immutable/on-chain assurance remains optional later.';
			case 'RESTART_SOUL_BOOTSTRAP':
				return source?.state?.error?.message ?? 'Lesser reports a typed restart recovery for stale hosted registration state.';
			case 'RETRY_SAME_STEP':
				return source?.state?.error?.message ?? 'Lesser reports that the same hosted step can be retried.';
			case 'OPERATOR_ACTION_REQUIRED':
				return source?.state?.error?.message ?? 'The instance operator must repair the server-side hosted bridge before this step can proceed.';
			case 'REFRESH_STATE':
				return 'Refresh the Lesser hosted/off-chain projection before continuing.';
			case 'COMPLETE':
				return 'Hosted/off-chain publication is bound. Inspect continuity and optional assurance-upgrade posture from Identity.';
			default:
				return 'Continue through Lesser same-origin GraphQL.';
		}
	}

	function canRunAction(
		action: HostedDefaultAction,
		source: HostedSoulBootstrapResult | SoulBootstrapResult | null,
		message: string,
		isBusy: boolean,
		hasDeclarationEvidence: boolean
	): boolean {
		if (isBusy) return false;
		if (action === 'COMPLETE') return true;
		if (action === 'SEND_HOSTED_SOUL_GENESIS_MESSAGE') return Boolean(message.trim());
		if (action === 'PUBLISH_HOSTED_SOUL' && !hasDeclarationEvidence) return false;
		if (action === 'COMPLETE_HOSTED_SOUL_GENESIS' || action === 'PUBLISH_HOSTED_SOUL') {
			return Boolean(source?.state?.hostConversationId?.trim());
		}
		if (action === 'RESTART_SOUL_BOOTSTRAP') return Boolean(resolveRecoveryAttemptId(source));
		return true;
	}

	async function runDefaultAction() {
		if (busy || !canRunDefaultAction || defaultAction === 'COMPLETE') return;
		busy = true;
		error = null;
		success = null;

		try {
			switch (defaultAction) {
				case 'START_HOSTED_BOOTSTRAP':
					await submitStart();
					break;
				case 'SEND_HOSTED_SOUL_GENESIS_MESSAGE':
					await submitGenesisMessage();
					break;
				case 'COMPLETE_HOSTED_SOUL_GENESIS':
					await submitCompleteGenesis();
					break;
				case 'PUBLISH_HOSTED_SOUL':
					await submitPublish();
					break;
				case 'RESTART_SOUL_BOOTSTRAP':
					await submitRestart();
					break;
				case 'RETRY_SAME_STEP':
					await retryCurrentHostedStep();
					break;
				case 'OPERATOR_ACTION_REQUIRED':
					await onUpdated?.();
					success = 'Hosted soul state refreshed from Lesser.';
					break;
				case 'REFRESH_STATE':
				default:
					await submitRefreshState();
			}
		} catch (actionFailure) {
			error = actionFailure instanceof Error ? actionFailure.message : 'Hosted soul action failed.';
		} finally {
			busy = false;
		}
	}

	async function submitStart() {
		const correlation = clientCorrelation(result, 'start');
		const mutation = await startHostedSoulBootstrap({
			input: {
				username: requireUsername(result),
				capabilities: ['simulacrum.hosted-first-default'],
				...(correlation.correlationKey ? { correlationKey: correlation.correlationKey } : {}),
				...(correlation.idempotencyKey ? { idempotencyKey: correlation.idempotencyKey } : {}),
				...(result?.state?.recoveryAttemptId ? { recoveryAttemptId: result.state.recoveryAttemptId } : {}),
			},
		});
		await handleMutationResult(mutation, 'Hosted definition started through Lesser.');
	}

	async function submitGenesisMessage() {
		const correlation = clientCorrelation(result, 'genesis-message');
		const mutation = await sendHostedSoulGenesisMessage({
			input: {
				username: requireUsername(result),
				message: messageDraft.trim(),
				...(result?.state?.hostRegistrationId ? { registrationId: result.state.hostRegistrationId } : {}),
				...(result?.state?.hostConversationId ? { conversationId: result.state.hostConversationId } : {}),
				...(result?.state?.recoveryAttemptId ? { recoveryAttemptId: result.state.recoveryAttemptId } : {}),
				...(correlation.correlationKey ? { correlationKey: correlation.correlationKey } : {}),
				...(correlation.idempotencyKey ? { idempotencyKey: correlation.idempotencyKey } : {}),
			},
		});
		await handleMutationResult(mutation, 'Genesis conversation message recorded through Lesser.');
	}

	async function submitCompleteGenesis() {
		const correlation = clientCorrelation(result, 'complete-genesis');
		const mutation = await completeHostedSoulGenesis({
			input: {
				username: requireUsername(result),
				conversationId: requireConversationId(result),
				...(result?.state?.hostRegistrationId ? { registrationId: result.state.hostRegistrationId } : {}),
				...(result?.state?.recoveryAttemptId ? { recoveryAttemptId: result.state.recoveryAttemptId } : {}),
				...(correlation.correlationKey ? { correlationKey: correlation.correlationKey } : {}),
				...(correlation.idempotencyKey ? { idempotencyKey: correlation.idempotencyKey } : {}),
			},
		});
		await handleMutationResult(mutation, 'Hosted genesis declarations are ready for review.');
	}

	async function submitPublish() {
		const conversationId = requireConversationId(result);
		if (!isHostedSoulBootstrapPublishReady(result?.state ?? null, { conversationId })) {
			throw new Error(
				'Lesser reports hosted publication is next, but did not return persisted declaration evidence. Simulacrum will not publish from a bare hosted conversation id.'
			);
		}
		const correlation = clientCorrelation(result, 'publish');
		const mutation = await publishHostedSoul({
			input: {
				username: requireUsername(result),
				conversationId,
				...(result?.state?.hostRegistrationId ? { registrationId: result.state.hostRegistrationId } : {}),
				...(result?.state?.recoveryAttemptId ? { recoveryAttemptId: result.state.recoveryAttemptId } : {}),
				...(correlation.correlationKey ? { correlationKey: correlation.correlationKey } : {}),
				...(correlation.idempotencyKey ? { idempotencyKey: correlation.idempotencyKey } : {}),
			},
		});
		await handleMutationResult(mutation, 'Hosted/off-chain soul published and bound through Lesser.');
	}

	async function submitRefreshState() {
		const beforeFingerprint = hostedStateFingerprint(result);
		const conversationId = result?.state?.hostConversationId?.trim() ?? '';
		if (!conversationId) {
			await onUpdated?.();
			await tick();
			if (hostedStateFingerprint(result) !== beforeFingerprint) {
				success = 'Hosted soul state refreshed from Lesser.';
				return;
			}
			throw new Error(
				'Lesser did not return a hosted genesis conversation id, so Simulacrum only refreshed state. The hosted projection is unchanged.'
			);
		}

		const correlation = freshClientCorrelation('refresh-state-repair');
		const mutation = await completeHostedSoulGenesis({
			input: {
				username: requireUsername(result),
				conversationId,
				...(result?.state?.hostRegistrationId ? { registrationId: result.state.hostRegistrationId } : {}),
				...(result?.state?.recoveryAttemptId ? { recoveryAttemptId: result.state.recoveryAttemptId } : {}),
				...(correlation.correlationKey ? { correlationKey: correlation.correlationKey } : {}),
				...(correlation.idempotencyKey ? { idempotencyKey: correlation.idempotencyKey } : {}),
			},
		});
		if (mutation.error) {
			await onUpdated?.();
			await tick();
			throw new Error(mutation.error.message);
		}

		await onUpdated?.();
		await tick();
		if (hasHostedPublishEvidence(mutation) || hasHostedPublishEvidence(result)) {
			success = 'Hosted declaration evidence reconciled from Lesser.';
			return;
		}
		if (
			hostedStateFingerprint(mutation) !== beforeFingerprint ||
			hostedStateFingerprint(result) !== beforeFingerprint
		) {
			success = 'Hosted soul state refreshed from Lesser.';
			return;
		}
		throw new Error(
			'Lesser refreshed the hosted state, but did not reconcile hosted declaration evidence yet.'
		);
	}

	async function submitRestart() {
		const recoveryAttemptId = resolveRecoveryAttemptId(result);
		if (!recoveryAttemptId) {
			throw new Error('Lesser did not provide or allow a hosted recovery attempt id.');
		}
		const correlation = clientCorrelation(result, 'restart');
		const mutation = await restartSoulBootstrap({
			input: {
				username: requireUsername(result),
				recoveryAttemptId,
				reason: 'simulacrum hosted-first recovery',
				...(correlation.correlationKey ? { correlationKey: correlation.correlationKey } : {}),
				...(correlation.idempotencyKey ? { idempotencyKey: correlation.idempotencyKey } : {}),
			},
		});
		await handleMutationResult(mutation, 'Hosted definition restarted through Lesser.');
	}

	async function retryCurrentHostedStep() {
		if (!result?.state) {
			await onUpdated?.();
			return;
		}
		if (result.state.phase === 'NOT_STARTED') return submitStart();
		if (result.state.phase === 'CONVERSATION') {
			return result.state.hostConversationId ? submitCompleteGenesis() : submitGenesisMessage();
		}
		if (result.state.phase === 'FINALIZE') {
			const conversationId = result.state.hostConversationId?.trim() ?? null;
			if (isHostedSoulBootstrapPublishReady(result.state, { conversationId })) return submitPublish();
			await onUpdated?.();
			throw new Error(
				'Lesser reports hosted publication is next, but declaration evidence is missing. Refresh or retry after Lesser/Host returns the generated declaration packet.'
			);
		}
		await onUpdated?.();
		success = 'Hosted state refreshed before retry.';
	}

	async function handleMutationResult(
		mutation: { error: { message: string } | null },
		message: string
	) {
		if (mutation.error) {
			await onUpdated?.();
			throw new Error(mutation.error.message);
		}
		await onUpdated?.();
		success = message;
	}

	function clientCorrelation(
		source: HostedSoulBootstrapResult | SoulBootstrapResult | null,
		purpose: string
	) {
		const username = resolveUsername(source);
		return {
			correlationKey:
				nonEmpty(source?.state?.correlation?.correlationKey) ??
				readOrCreateClientKey(username, 'correlation'),
			idempotencyKey: readOrCreateClientKey(username, purpose, {
				scope: source?.state?.hostRegistrationId ?? source?.state?.hostConversationId ?? null,
			}),
		};
	}

	function freshClientCorrelation(purpose: string) {
		if (typeof window === 'undefined') {
			return { correlationKey: null, idempotencyKey: null };
		}
		return {
			correlationKey: createClientKey(`${purpose}-correlation`),
			idempotencyKey: createClientKey(`${purpose}-idempotency`),
		};
	}

	function readOrCreateClientKey(
		username: string,
		purpose: string,
		{ scope = null }: { scope?: string | null } = {}
	): string | null {
		if (typeof window === 'undefined') return null;
		const scopedSuffix = scope?.trim() ? `:${scope.trim()}` : '';
		const storageKey = `simulacrum:hosted-bootstrap:${username}:${purpose}${scopedSuffix}`;
		try {
			const existing = window.sessionStorage.getItem(storageKey)?.trim();
			if (existing) return existing;
			const next = createClientKey(purpose);
			window.sessionStorage.setItem(storageKey, next);
			return next;
		} catch {
			return null;
		}
	}

	function createClientKey(purpose: string): string {
		const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		return `sim-hosted-${purpose}-${randomId}`;
	}

	function hasHostedPublishEvidence(
		source: HostedSoulBootstrapResult | SoulBootstrapResult | null
	): boolean {
		const conversationId = source?.state?.hostConversationId?.trim() ?? null;
		return isHostedSoulBootstrapPublishReady(source?.state ?? null, { conversationId });
	}

	function hostedStateFingerprint(
		source: HostedSoulBootstrapResult | SoulBootstrapResult | null
	): string {
		const state = source?.state;
		if (!state) return 'missing';
		return JSON.stringify({
			phase: state.phase,
			state: state.state,
			typedNextAction: state.typedNextAction,
			recoveryCategory: state.recoveryCategory ?? null,
			recoveryAction: state.recoveryAction ?? null,
			recoveryAttemptId: state.recoveryAttemptId ?? null,
			hostRegistrationId: state.hostRegistrationId ?? null,
			hostConversationId: state.hostConversationId ?? null,
			lastHostRequestId: state.lastHostRequestId ?? null,
			updatedAt: state.updatedAt ?? null,
			errorCode: state.error?.code ?? source?.error?.code ?? null,
			errorMessage: state.error?.message ?? source?.error?.message ?? null,
			checkpoints: state.signingCheckpoints.map((checkpoint) => ({
				name: checkpoint.name,
				status: checkpoint.status,
				hostRequestId: checkpoint.hostRequestId ?? null,
				completedAt: checkpoint.completedAt ?? null,
				hasCanonicalJson: Boolean(checkpoint.canonicalJson?.trim()),
			})),
		});
	}

	function resolveRecoveryAttemptId(source: HostedSoulBootstrapResult | SoulBootstrapResult | null): string | null {
		return nonEmpty(source?.state?.recoveryAttemptId) ??
			nonEmpty((source as HostedSoulBootstrapResult | null)?.hostRequest?.recoveryAttemptId) ??
			readOrCreateClientKey(resolveUsername(source), 'recovery-attempt');
	}

	function requireUsername(source: HostedSoulBootstrapResult | SoulBootstrapResult | null): string {
		const username = resolveUsername(source);
		if (!username || username === 'unknown') throw new Error('Lesser did not return a username for hosted soul definition.');
		return username;
	}

	function requireConversationId(source: HostedSoulBootstrapResult | SoulBootstrapResult | null): string {
		const conversationId = source?.state?.hostConversationId?.trim() ?? '';
		if (!conversationId) throw new Error('Lesser did not return a hosted genesis conversation id.');
		return conversationId;
	}

	function resolveUsername(source: HostedSoulBootstrapResult | SoulBootstrapResult | null): string {
		return source?.surface?.username?.trim() || source?.state?.username?.trim() || 'unknown';
	}

	function readTypedNextAction(
		source: HostedSoulBootstrapResult | SoulBootstrapResult | null
	): HostedSoulBootstrapNextAction | null {
		return (source as HostedSoulBootstrapResult | null)?.typedNextAction ??
			source?.surface?.typedNextAction ??
			source?.state?.typedNextAction ??
			null;
	}

	function readRecoveryCategory(
		source: HostedSoulBootstrapResult | SoulBootstrapResult | null
	): HostedSoulBootstrapRecoveryCategory | null {
		return (source as HostedSoulBootstrapResult | null)?.recoveryCategory ??
			source?.surface?.recoveryCategory ??
			source?.state?.recoveryCategory ??
			source?.error?.recoveryCategory ??
			null;
	}

	function readRecoveryAction(
		source: HostedSoulBootstrapResult | SoulBootstrapResult | null
	): HostedSoulBootstrapRecoveryAction | null {
		return (source as HostedSoulBootstrapResult | null)?.recoveryAction ??
			source?.surface?.recoveryAction ??
			source?.state?.recoveryAction ??
			source?.error?.recoveryAction ??
			null;
	}

	function defaultGenesisMessage(source: HostedSoulBootstrapResult | SoulBootstrapResult | null): string {
		const username = resolveUsername(source);
		return `Prepare the hosted/off-chain genesis declaration for @${username}. Preserve body continuity, runtime boundaries, and operator accountability.`;
	}

	function readDeclarationEvidenceSummary(
		source: HostedSoulBootstrapResult | SoulBootstrapResult | null,
		evidence: HostedSoulBootstrapTerminalDeclarationEvidence | null
	): string | null {
		const selfDescription = evidence?.declaration.selfDescription;
		const summary = typeof selfDescription?.['summary'] === 'string'
			? selfDescription['summary'].trim()
			: '';
		if (summary) return summary;
		if (evidence?.canonicalDeclarationJson) return evidence.canonicalDeclarationJson;

		const statement = source?.surface?.workflow?.declaration?.statement?.trim();
		if (statement && statement !== 'Host mint conversation completed and produced declaration material.') {
			return statement;
		}
		const checkpoint = source?.state?.signingCheckpoints.find((candidate) =>
			candidate.name.toLowerCase().includes('conversation') &&
			(candidate.canonicalJson?.trim() || candidate.message?.trim())
		);
		return checkpoint?.message?.trim() || checkpoint?.canonicalJson?.trim() || null;
	}

	function nonEmpty(value?: string | null): string | null {
		const normalized = value?.trim() ?? '';
		return normalized || null;
	}
</script>

<section class="ft-panel" data-testid="hosted-soul-bootstrap-panel">
	<header class="ft-panel__header">
		<div>
			<p class="ft-panel__eyebrow">Hosted/off-chain soul definition</p>
			<h2>{actionLabel}</h2>
		</div>
	</header>

	<ol class="ft-stepper" data-testid="hosted-soul-bootstrap-stepper">
		{#each steps as step (step.key)}
			<li class={`ft-stepper__item ft-stepper__item--${step.status}`}>
				<span class="ft-stepper__marker" aria-hidden="true"></span>
				<span>
					<strong>{step.label}</strong>
					<small>{step.detail}</small>
				</span>
			</li>
		{/each}
	</ol>

	<p class="ft-panel__message ft-panel__message--info">
		Default next action: {actionSummary}
	</p>

	<section class="ft-panel__recovery" data-testid="hosted-soul-assurance-copy">
		<p class="ft-panel__copy">
			Authority: <strong>instance trust</strong>. Anchor: <strong>hosted/off-chain</strong>.
			Mutable/revocable: <strong>yes</strong>. Immutable/on-chain: <strong>no</strong>, optional later.
		</p>
		<p class="ft-panel__copy">
			The default hosted path does not require a selected wallet, browser signing prompt,
			principal declaration signature, boundary signature, final self-attestation, Host token,
			or Host instance key.
		</p>
	</section>

	{#if recoveryCategory || recoveryAction || result?.error}
		<section class="ft-panel__recovery" data-testid="hosted-soul-recovery">
			<p class="ft-panel__message ft-panel__message--warning">
				Recovery category: {recoveryCategory ?? 'not provided'} · Recovery action: {recoveryAction ?? 'not provided'}
			</p>
			{#if result?.error?.message}
				<p class="ft-panel__copy">{result.error.message}</p>
			{/if}
			{#if hosted?.hostRequest.hostRequestId}
				<p class="ft-panel__copy">Host request id relayed by Lesser: {hosted.hostRequest.hostRequestId}</p>
			{/if}
		</section>
	{/if}

	{#if defaultAction === 'SEND_HOSTED_SOUL_GENESIS_MESSAGE'}
		<label class="ft-field">
			<span>Genesis message</span>
			<textarea
				bind:value={messageDraft}
				data-testid="hosted-soul-genesis-message"
				disabled={busy}
				rows="4"
			></textarea>
		</label>
	{:else if defaultAction === 'COMPLETE_HOSTED_SOUL_GENESIS'}
		<p class="ft-panel__copy">
			Conversation {result?.state?.hostConversationId} is ready to complete. Lesser must
			return generated declaration evidence before Simulacrum will allow publication.
		</p>
		{#if declarationEvidenceSummary}
			<p class="ft-panel__message ft-panel__message--info" data-testid="hosted-soul-evidence">
				Declaration evidence: {declarationEvidenceSummary}
			</p>
		{/if}
	{:else if defaultAction === 'PUBLISH_HOSTED_SOUL'}
		{#if publishEvidenceMissing}
			<section class="ft-panel__recovery" data-testid="hosted-soul-evidence-missing">
				<p class="ft-panel__message ft-panel__message--error">
					Lesser reports hosted publication is next, but Simulacrum has no persisted
					conversation/declaration evidence to review.
				</p>
				<p class="ft-panel__copy">
					Publication is blocked until Lesser/Host returns generated declaration evidence.
					Simulacrum will not publish a hosted soul from only a registration id and
					conversation id.
				</p>
			</section>
		{:else if declarationEvidenceSummary}
			<p class="ft-panel__message ft-panel__message--info" data-testid="hosted-soul-evidence">
				Declaration evidence: {declarationEvidenceSummary}
			</p>
		{/if}
		<ul class="ft-list">
			<li>Registration: {result?.state?.hostRegistrationId ?? 'pending'}</li>
			<li>Conversation: {result?.state?.hostConversationId ?? 'pending'}</li>
			<li>Publication authority: instance trust</li>
			<li>Publication anchor: hosted/off-chain</li>
		</ul>
	{:else if defaultAction === 'COMPLETE'}
		<p class="ft-panel__message ft-panel__message--success">
			Hosted/off-chain soul binding is complete. Optional wallet/on-chain assurance upgrades remain explicit and separate.
		</p>
	{/if}

	<div class="ft-panel__actions">
		{#if defaultAction === 'COMPLETE'}
			<a
				class="ft-button ft-button--primary"
				data-testid="hosted-soul-default-action"
				href={identityHref}
			>
				{actionLabel}
			</a>
		{:else}
			<button
				class="ft-button ft-button--primary"
				data-testid="hosted-soul-default-action"
				disabled={!canRunDefaultAction}
				onclick={runDefaultAction}
				type="button"
			>
				{busy ? 'Working…' : actionLabel}
			</button>
		{/if}
	</div>

	{#if error}
		<p class="ft-panel__message ft-panel__message--error" data-testid="hosted-soul-error">
			{error}
		</p>
	{/if}
	{#if success}
		<p class="ft-panel__message ft-panel__message--success" data-testid="hosted-soul-success">
			{success}
		</p>
	{/if}
</section>
