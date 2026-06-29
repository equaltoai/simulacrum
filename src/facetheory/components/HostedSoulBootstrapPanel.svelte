<script lang="ts">
	import { tick } from 'svelte';

	import {
		completeHostedSoulGenesis,
		publishHostedSoul,
		restartSoulBootstrap,
		sendHostedSoulGenesisMessage,
		type HostedSoulGenesisComposerState,
		type HostedSoulGenesisConversationMessage,
		type HostedSoulGenesisConversationTranscript,
		startHostedSoulBootstrap,
		type HostedSoulBootstrapNextAction,
		type HostedSoulBootstrapRecoveryAction,
		type HostedSoulBootstrapRecoveryCategory,
		type HostedSoulBootstrapResult,
		type HostedSoulBootstrapStateModel,
		type SoulBootstrapResult,
	} from '$lib/api/soulBootstrap';
	import {
		getHostedSoulGenesisComposerState,
		getHostedSoulGenesisConversation,
		getHostedSoulBootstrapTerminalDeclarationEvidenceSummary,
		isHostedSoulBootstrapPublishReady,
		type HostedSoulBootstrapTerminalDeclarationEvidenceSummary,
	} from '$lib/greater/adapters';

	import { getPageHref } from '../routing';

	interface Props {
		result: HostedSoulBootstrapResult | SoulBootstrapResult | null;
		onUpdated?: () => Promise<void> | void;
	}

	type HostedDefaultAction =
		| 'START_HOSTED_BOOTSTRAP'
		| 'SEND_HOSTED_SOUL_GENESIS_MESSAGE'
		| 'COMPLETE_HOSTED_SOUL_GENESIS'
		| 'PUBLISH_HOSTED_SOUL'
		| 'RESTART_SOUL_BOOTSTRAP'
		| 'RETRY_SAME_STEP'
		| 'REFRESH_STATE'
		| 'OPERATOR_ACTION_REQUIRED'
		| 'COMPLETE';
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
	const hostedConversation = $derived(resolveHostedConversation(result));
	const hostedComposer = $derived(resolveHostedComposer(result));
	const defaultAction = $derived(resolveHostedDefaultAction(result));
	const activeConversationId = $derived(
		hostedComposer.conversationId ?? result?.state?.hostConversationId ?? null
	);
	const declarationEvidence = $derived(
		getHostedSoulBootstrapTerminalDeclarationEvidenceSummary(result?.state ?? null, {
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
	const hasHostedUserAction = $derived(
		hostedComposer.canSendMessage ||
			hostedComposer.canComplete ||
			hostedComposer.canPublish ||
			hostedComposer.canRestart
	);
	const showDefaultAction = $derived(defaultAction !== 'REFRESH_STATE' || !hasHostedUserAction);
	const showHostedConversation = $derived(
		Boolean(hostedConversation) ||
			Boolean(hostedComposer.conversationId) ||
			hostedComposer.canSendMessage ||
			hostedComposer.canComplete
	);
	const showFollowupSendAction = $derived(
		hostedComposer.canSendMessage && defaultAction !== 'SEND_HOSTED_SOUL_GENESIS_MESSAGE'
	);
	const canSendDraft = $derived(!busy && hostedComposer.canSendMessage && Boolean(messageDraft.trim()));

	// Hosted genesis conversation lane. Lesser routes a hosted/off-chain body into a
	// CONVERSATION phase with a Host-owned conversation id. When Host is still producing
	// the conversation result asynchronously, Lesser types the next action as REFRESH_STATE
	// (no operator turn is valid yet); the lane must read as "waiting for the Host result"
	// rather than a bare refresh card. Everything here is projected from the same Lesser
	// same-origin GraphQL state — no Host token, Host base URL, or control-plane endpoint.
	const conversationStatus = $derived(result?.state?.hostConversationStatus ?? null);
	const lastHostRequestId = $derived(
		hosted?.hostRequest.lastHostRequestId ?? result?.state?.lastHostRequestId ?? null
	);
	const inHostedGenesisConversation = $derived(
		Boolean(result?.state?.phase === 'CONVERSATION' && activeConversationId)
	);
	const awaitingHostConversationResult = $derived(
		inHostedGenesisConversation && defaultAction === 'REFRESH_STATE'
	);
	const awaitingUserGenesisTurn = $derived(
		inHostedGenesisConversation && defaultAction === 'SEND_HOSTED_SOUL_GENESIS_MESSAGE'
	);
	const reviewingGenesisDeclarations = $derived(
		inHostedGenesisConversation && defaultAction === 'COMPLETE_HOSTED_SOUL_GENESIS'
	);
	const hostedGenesisStatusLabel = $derived(
		conversationStatus ?? result?.state?.state ?? 'pending'
	);
	const hostedGenesisLaneTitle = $derived(
		awaitingHostConversationResult
			? 'Waiting for the Host genesis conversation result'
			: awaitingUserGenesisTurn
				? 'Your hosted genesis turn is ready'
				: reviewingGenesisDeclarations
					? 'Hosted genesis declarations are ready to review'
					: 'Hosted genesis conversation'
	);

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
					hostConversationStatus: source.state.hostConversationStatus ?? null,
					typedNextAction: source.state.typedNextAction,
					availableActions: getHostedSoulGenesisComposerState(source.state).availableActions,
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
					publicationEvidence: source.state.publicationEvidence ?? source.state.publication ?? null,
					terminalDeclarationEvidence: source.state.terminalDeclarationEvidence ?? null,
					publishGate: source.state.publishGate ?? null,
					hostedGenesisConversation: getHostedSoulGenesisConversation(source.state),
					composer: getHostedSoulGenesisComposerState(source.state),
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
		const typedNextAction = readTypedNextAction(source);
		return isHostedDefaultAction(typedNextAction) ? typedNextAction : 'REFRESH_STATE';
	}

	function isHostedDefaultAction(action: HostedSoulBootstrapNextAction | null): action is HostedDefaultAction {
		return action === 'START_HOSTED_BOOTSTRAP' ||
			action === 'SEND_HOSTED_SOUL_GENESIS_MESSAGE' ||
			action === 'COMPLETE_HOSTED_SOUL_GENESIS' ||
			action === 'PUBLISH_HOSTED_SOUL' ||
			action === 'RESTART_SOUL_BOOTSTRAP' ||
			action === 'RETRY_SAME_STEP' ||
			action === 'REFRESH_STATE' ||
			action === 'OPERATOR_ACTION_REQUIRED' ||
			action === 'COMPLETE';
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
				if (source.state.phase === 'CONVERSATION') return 'genesis';
				if (source.state.phase === 'FINALIZE') return 'publish';
				return 'start';
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
				return 'Generate Hosted Declarations';
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
				return 'Explicitly complete the hosted genesis conversation and ask Lesser/Host to generate declaration evidence for review.';
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
		if (busy || !showDefaultAction || !canRunDefaultAction || defaultAction === 'COMPLETE') return;
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

	async function runFollowupMessage() {
		if (!canSendDraft) return;
		busy = true;
		error = null;
		success = null;
		try {
			await submitGenesisMessage();
		} catch (actionFailure) {
			error = actionFailure instanceof Error ? actionFailure.message : 'Hosted genesis follow-up failed.';
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
		await onUpdated?.();
		await tick();
		success = 'Hosted soul state refreshed from Lesser.';
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
		if (result.state.phase === 'ERROR') {
			// Lesser typed this hosted failure as retry-the-same-step. A restart-required
			// error (or RESTART_BOOTSTRAP recovery action) supersedes stale hosted registration
			// state via the restart mutation; everything else re-invokes the hosted-definition
			// start mutation through the same Lesser same-origin hosted-bootstrap bridge that
			// authored the visible action, preserving username/correlation/recovery fields.
			// Both paths stay wallet-free and never touch raw Host routes, MicroVM routes,
			// or Host credentials in the browser.
			if (result.state.restartRequired === true || readRecoveryAction(result) === 'RESTART_BOOTSTRAP') {
				return submitRestart();
			}
			return submitStart();
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

	function resolveRecoveryAttemptId(source: HostedSoulBootstrapResult | SoulBootstrapResult | null): string | null {
		return nonEmpty(source?.state?.recoveryAttemptId) ??
			nonEmpty((source as HostedSoulBootstrapResult | null)?.hostRequest?.recoveryAttemptId);
	}

	function resolveHostedConversation(
		source: HostedSoulBootstrapResult | SoulBootstrapResult | null
	): HostedSoulGenesisConversationTranscript | null {
		return (source as HostedSoulBootstrapResult | null)?.hostedGenesisConversation ??
			(source as HostedSoulBootstrapResult | null)?.hosted?.hostedGenesisConversation ??
			getHostedSoulGenesisConversation(source?.state ?? null);
	}

	function resolveHostedComposer(
		source: HostedSoulBootstrapResult | SoulBootstrapResult | null
	): HostedSoulGenesisComposerState {
		return (source as HostedSoulBootstrapResult | null)?.composer ??
			(source as HostedSoulBootstrapResult | null)?.hosted?.composer ??
			getHostedSoulGenesisComposerState(source?.state ?? null);
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
		if (resolveHostedConversation(source)?.messageCount) return '';
		return `Prepare the hosted/off-chain genesis declaration for @${username}. Preserve body continuity, runtime boundaries, and operator accountability.`;
	}

	function hostedMessageRoleLabel(message: HostedSoulGenesisConversationMessage): string {
		return message.role === 'ASSISTANT' ? 'Assistant' : 'You';
	}

	function readDeclarationEvidenceSummary(
		_source: HostedSoulBootstrapResult | SoulBootstrapResult | null,
		evidence: HostedSoulBootstrapTerminalDeclarationEvidenceSummary | null
	): string | null {
		if (!evidence) return null;
		const preview = evidence.producedDeclarationsPreview;
		const title = preview?.title?.trim();
		const count = typeof preview?.declarationCount === 'number'
			? preview.declarationCount
			: null;
		const parts = [
			title || 'Terminal hosted declaration evidence',
			count != null ? `${count} declaration${count === 1 ? '' : 's'}` : null,
			evidence.declarationsHash,
		].filter(Boolean);
		return parts.join(' · ');
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

	<p class="ft-panel__copy" data-testid="hosted-soul-server-action">
		Lesser typed next action: <strong>{defaultAction}</strong>
		{#if hostedComposer.availableActions.length}
			· available actions:
			<strong data-testid="hosted-soul-available-actions">{hostedComposer.availableActions.join(', ')}</strong>
		{/if}
		{#if recoveryCategory || recoveryAction}
			· recovery: <strong>{recoveryCategory ?? 'none'}</strong> / <strong>{recoveryAction ?? 'none'}</strong>
		{/if}
	</p>

	{#if inHostedGenesisConversation}
		<section class="ft-panel__recovery" data-testid="hosted-genesis-lane">
			<p class="ft-panel__eyebrow">Hosted genesis conversation</p>
			<p class="ft-panel__copy">
				<strong data-testid="hosted-genesis-lane-title">{hostedGenesisLaneTitle}</strong>
			</p>
			<ul class="ft-list">
				<li>
					Conversation id:
					<strong data-testid="hosted-genesis-conversation-id">{activeConversationId}</strong>
				</li>
				<li>
					Host conversation status:
					<strong data-testid="hosted-genesis-status">{hostedGenesisStatusLabel}</strong>
				</li>
				{#if lastHostRequestId}
					<li>
						Last Host request id:
						<strong data-testid="hosted-genesis-last-host-request">{lastHostRequestId}</strong>
					</li>
				{/if}
			</ul>
			{#if awaitingHostConversationResult}
				<p class="ft-panel__message ft-panel__message--info" data-testid="hosted-genesis-waiting">
					Simulacrum is waiting for the Host conversation result. Lesser still reports this
					hosted/off-chain genesis conversation as <strong>{hostedGenesisStatusLabel}</strong>, and
					its typed next action is to poll Lesser for the result, so there is no operator turn to
					take yet. Use the <strong>{actionLabel}</strong> control below to poll Lesser same-origin
					GraphQL for the latest hosted conversation state.
				</p>
			{:else if awaitingUserGenesisTurn}
				<p class="ft-panel__message ft-panel__message--info" data-testid="hosted-genesis-your-turn">
					Lesser is ready for your hosted genesis message. Send it below; Simulacrum relays the turn
					through Lesser same-origin GraphQL only.
				</p>
			{:else if reviewingGenesisDeclarations}
				<p class="ft-panel__message ft-panel__message--info" data-testid="hosted-genesis-review-ready">
					Lesser reports this hosted genesis conversation produced declaration evidence. Review the
					generated declarations below before publishing the hosted/off-chain soul.
				</p>
			{/if}
		</section>
	{/if}

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

	{#if showHostedConversation}
		<section class="ft-panel__recovery" data-testid="hosted-soul-genesis-conversation">
			<p class="ft-panel__eyebrow">Hosted genesis conversation</p>
			<p class="ft-panel__copy" data-testid="hosted-soul-genesis-composer-state">
				Conversation: <strong>{hostedComposer.conversationId ?? 'pending'}</strong>
				· status: <strong>{hostedComposer.status ?? 'pending'}</strong>
				· messages: <strong>{hostedComposer.messageCount}</strong>
			</p>

			{#if hostedConversation}
				<ol class="ft-list" data-testid="hosted-soul-genesis-transcript">
					{#each hostedConversation.messages as message (message.id)}
						<li
							class={`ft-panel__message ft-panel__message--${message.role === 'ASSISTANT' ? 'info' : 'success'}`}
							data-testid="hosted-soul-genesis-transcript-message"
							data-message-role={message.role}
						>
							<strong>{hostedMessageRoleLabel(message)}:</strong> {message.content}
							{#if message.truncated}
								<small> · truncated by Lesser projection</small>
							{/if}
						</li>
					{/each}
				</ol>
				{#if hostedConversation.messagesTruncated}
					<p class="ft-panel__message ft-panel__message--warning">
						Lesser truncated the hosted transcript projection; refresh before publication if more context is needed.
					</p>
				{/if}
			{:else}
				<p class="ft-panel__copy" data-testid="hosted-soul-genesis-transcript-empty">
					Lesser has opened the hosted conversation, but no transcript messages are projected yet.
				</p>
			{/if}

			{#if hostedComposer.canSendMessage}
				<label class="ft-field">
					<span>{hostedConversation ? 'Follow-up message' : 'Genesis message'}</span>
					<textarea
						bind:value={messageDraft}
						data-testid="hosted-soul-genesis-message"
						disabled={busy}
						rows="4"
					></textarea>
				</label>
				{#if showFollowupSendAction}
					<button
						class="ft-button ft-button--secondary"
						data-testid="hosted-soul-send-followup"
						disabled={!canSendDraft}
						onclick={runFollowupMessage}
						type="button"
					>
						{busy ? 'Sending…' : 'Send Follow-up Message'}
					</button>
				{/if}
			{/if}

			{#if hostedComposer.canComplete}
				<p class="ft-panel__message ft-panel__message--info" data-testid="hosted-soul-complete-ready">
					Lesser reports this conversation can now be completed to generate hosted declaration evidence.
				</p>
			{/if}
		</section>
	{/if}

	{#if defaultAction === 'COMPLETE_HOSTED_SOUL_GENESIS'}
		<p class="ft-panel__copy">
			Conversation {hostedComposer.conversationId ?? result?.state?.hostConversationId} is ready to complete.
			Lesser must return generated declaration evidence before Simulacrum will allow publication.
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

	{#if showDefaultAction}
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
	{:else}
		<p class="ft-panel__copy" data-testid="hosted-soul-refresh-suppressed">
			Refresh is hidden while Lesser exposes a valid hosted conversation user action.
		</p>
	{/if}

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
