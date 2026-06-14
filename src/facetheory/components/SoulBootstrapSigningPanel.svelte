<script lang="ts">
	import {
		beginSoulBootstrap,
		completeSoulBootstrapConversation,
		finalizeSoulBootstrap,
		prepareSoulBootstrapFinalize,
		prepareSoulBootstrapPrincipalDeclaration,
		sendSoulBootstrapConversationMessage,
		verifySoulBootstrapPrincipalDeclaration,
		verifySoulBootstrapWallet,
		type SoulBootstrapMutationResult,
		type SoulBootstrapResult,
	} from '$lib/api/soulBootstrap';
	import {
		getAccounts,
		getInjectedProvider,
		personalSign,
		requestAccounts,
		type EthereumProvider,
	} from '$lib/tips/provider';
	import type { SoulBootstrapSigningPlan } from '$lib/greater/adapters/soul';

	import {
		SoulBootstrapSigningUxError,
		activeSoulBootstrapSigningCorrelationField,
		assertSoulBootstrapSubmitPrerequisites,
		buildSoulBootstrapBeginInput,
		buildSoulBootstrapSubmitInput,
		createActiveSoulBootstrapSigningPlan,
		createSoulBootstrapWalletChallengeRecoveryPlan,
		ensureSoulBootstrapSigningCorrelation,
		isSoulBootstrapBeginReady,
		isSoulBootstrapConversationRetryReady,
		isSoulBootstrapRegistrationRestartReady,
		isSoulBootstrapRestartReady,
		isSoulBootstrapWalletRestartReady,
		isSoulBootstrapSigningPlanError,
		normalizeHexAddress,
		selectSoulBootstrapPersonalSignMaterial,
		signingPlanButtonLabel,
		signingPlanSuccessMessage,
		signingPlanTitle,
		type SoulBootstrapSigningSubmission,
	} from '../bootstrapSigning';

	interface Props {
		result: SoulBootstrapResult | null;
		onUpdated?: () => Promise<void> | void;
	}

	type BootstrapAction =
		| 'begin'
		| 'verify_wallet'
		| 'prepare_principal_declaration'
		| 'verify_principal_declaration'
		| 'send_conversation_message'
		| 'complete_conversation'
		| 'prepare_finalize'
		| 'finalize'
		| 'complete'
		| 'blocked';

	type BootstrapStepKey =
		| 'begin'
		| 'wallet'
		| 'principal_prepare'
		| 'principal_sign'
		| 'conversation'
		| 'finalize_prepare'
		| 'finalize_sign'
		| 'complete';

	type StepStatus = 'complete' | 'active' | 'pending' | 'blocked';

	const BOOTSTRAP_STEPS: Array<{ key: BootstrapStepKey; label: string; detail: string }> = [
		{ key: 'begin', label: 'Begin', detail: 'Select the wallet and create the Host registration.' },
		{ key: 'wallet', label: 'Wallet', detail: 'Sign the Host wallet challenge.' },
		{ key: 'principal_prepare', label: 'Prepare principal', detail: 'Send the declaration statement to Lesser/Host for signing material.' },
		{ key: 'principal_sign', label: 'Sign principal', detail: 'Sign Host canonical principal-declaration digest.' },
		{ key: 'conversation', label: 'Genesis', detail: 'Run and complete the hosted/off-chain genesis conversation.' },
		{ key: 'finalize_prepare', label: 'Prepare finalize', detail: 'Ask Lesser/Host for finalize signing material.' },
		{ key: 'finalize_sign', label: 'Finalize', detail: 'Sign the final self-attestation.' },
		{ key: 'complete', label: 'Bound soul', detail: 'Return to Identity after Lesser binds the hosted soul.' },
	];

	let { result, onUpdated }: Props = $props();

	let signing = $state(false);
	let beginning = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let walletChallengeSignature = $state<string | null>(null);
	let walletAddressDraft = $state('');
	let walletStatus = $state<string | null>(null);
	let walletDraftContext = $state<string | null>(null);
	let principalPreparing = $state(false);
	let conversationBusy = $state(false);
	let finalizePreparing = $state(false);
	let walletRecovering = $state(false);
	let principalAddressDraft = $state('');
	let principalDeclarationDraft = $state('');
	let declaredAtDraft = $state('');
	let conversationMessageDraft = $state('');
	let boundarySignaturesDraft = $state('{}');
	let actionDraftContext = $state<string | null>(null);
	let storedWalletChallengeSignature = $state<string | null>(null);

	const beginReady = $derived(isSoulBootstrapBeginReady(result));
	const registrationRestartReady = $derived(isSoulBootstrapRegistrationRestartReady(result));
	const restartReady = $derived(isSoulBootstrapRestartReady(result));
	const conversationRetryReady = $derived(isSoulBootstrapConversationRetryReady(result));
	const walletRestartReady = $derived(isSoulBootstrapWalletRestartReady(result));
	const planView = $derived(resolvePlanView(result));
	const activePlan = $derived(planView.plan);
	const planError = $derived(planView.error);
	const planErrorTone = $derived(planView.errorTone);
	const workflowAction = $derived(resolveWorkflowAction(result, activePlan));
	const steps = $derived(buildSteps(workflowAction));
	const actionTitle = $derived(
		workflowAction === 'begin' && restartReady && !beginReady
			? 'Restart soul bootstrap'
			: actionTitleFor(workflowAction, activePlan)
	);
	const actionSummary = $derived(actionSummaryFor(workflowAction));
	const principalWalletSignature = $derived(walletChallengeSignature ?? storedWalletChallengeSignature);
	const missingPrincipalPrerequisite = $derived(
		activePlan?.kind === 'principal_declaration' && !principalWalletSignature
	);
	const canSign = $derived(Boolean(activePlan) && !signing && !beginning && !principalPreparing && !conversationBusy && !finalizePreparing && !walletRecovering && !missingPrincipalPrerequisite);
	const canRecoverWalletChallenge = $derived(
		activePlan?.kind === 'principal_declaration' &&
		!signing &&
		!walletRecovering
	);
	const selectedBeginWallet = $derived(normalizeOptionalWallet(walletAddressDraft));
	const existingBootstrapWallet = $derived(nonEmpty(result?.state?.walletAddress));
	const canBegin = $derived((beginReady || restartReady) && !beginning && Boolean(selectedBeginWallet));
	const principalAddress = $derived(normalizeOptionalWallet(principalAddressDraft));
	const canPreparePrincipal = $derived(
		workflowAction === 'prepare_principal_declaration' &&
		!principalPreparing &&
		Boolean(principalAddress) &&
		Boolean(principalDeclarationDraft.trim()) &&
		Boolean(declaredAtDraft.trim())
	);
	const canSendConversation = $derived(
		workflowAction === 'send_conversation_message' &&
		!conversationBusy &&
		Boolean(conversationMessageDraft.trim())
	);
	const canCompleteConversation = $derived(workflowAction === 'complete_conversation' && !conversationBusy);
	const canPrepareFinalize = $derived(workflowAction === 'prepare_finalize' && !finalizePreparing);

	$effect(() => {
		const nextContext = [
			resolveBootstrapUsername(result),
			result?.state?.phase ?? 'missing',
			existingBootstrapWallet ?? 'no-wallet',
		].join(':');
		if (walletDraftContext === nextContext) return;
		walletDraftContext = nextContext;
		walletAddressDraft = '';
		walletStatus = null;
	});

	$effect(() => {
		const nextContext = [
			resolveBootstrapUsername(result),
			result?.state?.phase ?? 'missing',
			result?.state?.state ?? 'missing',
			result?.state?.hostRegistrationId ?? 'no-registration',
			result?.state?.hostConversationId ?? 'no-conversation',
		].join(':');
		if (actionDraftContext === nextContext) return;
		actionDraftContext = nextContext;
		principalAddressDraft = result?.state?.principalAddress?.trim() || result?.state?.walletAddress?.trim() || '';
		principalDeclarationDraft = defaultPrincipalDeclaration(result);
		declaredAtDraft = new Date().toISOString();
		conversationMessageDraft = defaultConversationMessage(result);
		boundarySignaturesDraft = '{}';
		walletChallengeSignature = null;
		storedWalletChallengeSignature = readStoredWalletChallengeSignature(result);
	});

	function resolvePlanView(source: SoulBootstrapResult | null): {
		plan: SoulBootstrapSigningPlan | null;
		error: string | null;
		errorTone: 'warning' | 'error' | null;
	} {
		try {
			const correlatedSource = ensureSoulBootstrapSigningCorrelation(
				source,
				clientSigningCorrelation(source)
			);
			return { plan: createActiveSoulBootstrapSigningPlan(correlatedSource), error: null, errorTone: null };
		} catch (planFailure) {
			return {
				plan: null,
				error: describeSigningFailure(planFailure),
				errorTone: isSoulBootstrapSigningPlanError(planFailure) ? 'error' : 'warning',
			};
		}
	}

	function resolveWorkflowAction(
		source: SoulBootstrapResult | null,
		plan: SoulBootstrapSigningPlan | null
	): BootstrapAction {
		if (!source?.state) return 'blocked';
		if (source.surface?.soulBindingState === 'BOUND' || source.state.phase === 'COMPLETE') return 'complete';
		if (isSoulBootstrapBeginReady(source)) return 'begin';
		if (isSoulBootstrapConversationRetryReady(source)) return 'send_conversation_message';
		if (plan?.kind === 'wallet_challenge') return 'verify_wallet';
		if (plan?.kind === 'principal_declaration') return 'verify_principal_declaration';
		if (plan?.kind === 'finalize_self_attestation') return 'finalize';
		if (source.error || source.state.error) {
			return isSoulBootstrapRestartReady(source) ? 'begin' : 'blocked';
		}

		switch (source.state.phase) {
			case 'WALLET_VERIFICATION':
				return 'prepare_principal_declaration';
			case 'PRINCIPAL_DECLARATION':
				return 'prepare_principal_declaration';
			case 'CONVERSATION':
				if (source.state.state?.trim() === 'conversation.completed') return 'prepare_finalize';
				return source.state.hostConversationId ? 'complete_conversation' : 'send_conversation_message';
			case 'FINALIZE':
				return 'prepare_finalize';
			default:
				return isSoulBootstrapRestartReady(source) ? 'begin' : 'blocked';
		}
	}

	function buildSteps(action: BootstrapAction): Array<{ key: BootstrapStepKey; label: string; detail: string; status: StepStatus }> {
		const activeKey = stepKeyForAction(action);
		const activeIndex = activeKey ? BOOTSTRAP_STEPS.findIndex((step) => step.key === activeKey) : -1;
		return BOOTSTRAP_STEPS.map((step, index) => ({
			...step,
			status: action === 'blocked'
				? 'blocked'
				: activeKey === 'complete'
					? 'complete'
					: index < activeIndex
						? 'complete'
						: index === activeIndex
							? 'active'
							: 'pending',
		}));
	}

	function stepKeyForAction(action: BootstrapAction): BootstrapStepKey | null {
		switch (action) {
			case 'begin':
				return 'begin';
			case 'verify_wallet':
				return 'wallet';
			case 'prepare_principal_declaration':
				return 'principal_prepare';
			case 'verify_principal_declaration':
				return 'principal_sign';
			case 'send_conversation_message':
			case 'complete_conversation':
				return 'conversation';
			case 'prepare_finalize':
				return 'finalize_prepare';
			case 'finalize':
				return 'finalize_sign';
			case 'complete':
				return 'complete';
			case 'blocked':
				return null;
		}
	}

	function actionTitleFor(
		action: BootstrapAction,
		plan: SoulBootstrapSigningPlan | null
	): string {
		if (action === 'begin') return 'Begin soul bootstrap';
		if (plan) return signingPlanTitle(plan);
		switch (action) {
			case 'prepare_principal_declaration':
				return 'Prepare principal declaration';
			case 'send_conversation_message':
				return 'Start genesis conversation';
			case 'complete_conversation':
				return 'Complete genesis conversation';
			case 'prepare_finalize':
				return 'Prepare finalize signing';
			case 'complete':
				return 'Soul process complete';
			case 'blocked':
				return 'No active next step';
			default:
				return 'Continue soul process';
		}
	}

	function actionSummaryFor(action: BootstrapAction): string {
		switch (action) {
			case 'begin':
				return 'Select the intended wallet explicitly, then let Lesser begin the same-origin Host registration.';
			case 'verify_wallet':
				return 'Sign the wallet challenge returned by Lesser. Stay on this card; navigation links are optional inspectors, not required jumps.';
			case 'prepare_principal_declaration':
				return 'Lesser accepted the wallet signature. Prepare the principal declaration next; Host will return canonical signing material after this step.';
			case 'verify_principal_declaration':
				return 'Sign only the Lesser-provided principal declaration digest, then submit it with the wallet challenge signature captured earlier in this browser session.';
			case 'send_conversation_message':
				return 'Start the hosted genesis conversation through Lesser same-origin GraphQL.';
			case 'complete_conversation':
				return 'Complete the hosted genesis conversation so Host can produce declaration material for finalize.';
			case 'prepare_finalize':
				return 'Ask Lesser/Host for finalize signing material after the genesis conversation is complete.';
			case 'finalize':
				return 'Sign the final self-attestation and let Lesser bind the hosted/off-chain soul.';
			case 'complete':
				return 'Lesser reports the hosted/off-chain soul is bound. Return to Identity for continuity.';
			case 'blocked':
				return 'The current Lesser state does not expose a safe next action. Refresh, then inspect the backend message shown in the lane.';
		}
	}

	function restartSummaryFor(source: SoulBootstrapResult | null): string {
		if (isSoulBootstrapRegistrationRestartReady(source)) {
			return 'The previous Host registration is no longer available, so retry-signing cannot progress. Restart creates a fresh Lesser/Host registration with the wallet you select.';
		}
		if (isSoulBootstrapWalletRestartReady(source)) {
			return `This bootstrap is waiting on wallet verification for ${truncateAddress(existingBootstrapWallet)}. If that is the wrong wallet, restart before signing.`;
		}
		if (source?.state?.phase === 'ERROR') {
			const backendMessage = source.state.error?.message ?? source.error?.message ?? 'the backend reported an error';
			return `This pre-binding soul process is in an error state (${backendMessage}). Restart creates fresh Host registration state instead of forcing another stale retry.`;
		}
		return 'This soul process is not bound yet. If the selected wallet, browser session, or backend checkpoint is wrong, restart with the intended wallet before final binding.';
	}

	function truncateAddress(value?: string | null): string {
		const normalized = value?.trim() ?? '';
		if (!normalized) return 'unknown signer';
		if (normalized.length <= 14) return normalized;
		return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`;
	}

	function formatSigningMaterial(plan: SoulBootstrapSigningPlan): string {
		const signingMaterial = plan.signing;
		if (signingMaterial.messageEncoding === 'utf8') {
			return signingMaterial.message;
		}
		return signingMaterial.messageHex;
	}

	function resolveBootstrapUsername(source: SoulBootstrapResult | null): string {
		return source?.surface?.username?.trim() || source?.state?.username?.trim() || 'unknown';
	}

	function createClientKey(purpose: string): string {
		const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		return `sim-${purpose}-${randomId}`;
	}

	function readOrCreateClientKey(
		username: string,
		purpose: string,
		{ replace = false, scope = null }: { replace?: boolean; scope?: string | null } = {}
	): string | null {
		if (typeof window === 'undefined') return null;
		const scopedSuffix = scope?.trim() ? `:${scope.trim()}` : '';
		const storageKey = `simulacrum:soul-bootstrap:${username}:${purpose}${scopedSuffix}`;
		try {
			const existing = window.sessionStorage.getItem(storageKey)?.trim();
			if (existing && !replace) return existing;
			const next = createClientKey(purpose);
			window.sessionStorage.setItem(storageKey, next);
			return next;
		} catch {
			return null;
		}
	}

	function nonEmpty(value?: string | null): string | null {
		const normalized = value?.trim() ?? '';
		return normalized || null;
	}

	function clientCorrelation(source: SoulBootstrapResult | null, purpose: string) {
		const username = resolveBootstrapUsername(source);
		return {
			correlationKey:
				nonEmpty(source?.state?.correlation?.correlationKey) ??
				readOrCreateClientKey(username, 'correlation'),
			idempotencyKey:
				readOrCreateClientKey(username, purpose, { scope: idempotencyScopeForPurpose(source, purpose) }),
		};
	}

	function clientBeginCorrelation(
		source: SoulBootstrapResult | null,
		{ replaceIdempotency = false }: { replaceIdempotency?: boolean } = {}
	) {
		return {
			correlationKey:
				nonEmpty(source?.state?.correlation?.correlationKey) ??
				clientCorrelation(source, 'correlation').correlationKey,
			idempotencyKey:
				replaceIdempotency
					? readOrCreateClientKey(resolveBootstrapUsername(source), 'beginIdempotencyKey', { replace: true })
					: nonEmpty(source?.state?.correlation?.beginIdempotencyKey) ??
						readOrCreateClientKey(resolveBootstrapUsername(source), 'beginIdempotencyKey'),
		};
	}

	function clientSigningCorrelation(source: SoulBootstrapResult | null) {
		const field = activeSoulBootstrapSigningCorrelationField(source);
		if (!field) return {};
		return {
			correlationKey:
				nonEmpty(source?.state?.correlation?.correlationKey) ??
				clientCorrelation(source, 'correlation').correlationKey,
			idempotencyKey:
				clientCorrelation(source, field).idempotencyKey,
		};
	}

	function idempotencyScopeForPurpose(source: SoulBootstrapResult | null, purpose: string): string | null {
		if (purpose === 'correlation' || purpose === 'beginIdempotencyKey') return null;
		return source?.state?.hostRegistrationId?.trim() || null;
	}

	function walletSignatureStorageKey(source: SoulBootstrapResult | null): string | null {
		if (typeof window === 'undefined') return null;
		const username = resolveBootstrapUsername(source);
		const registrationId = source?.state?.hostRegistrationId?.trim() || 'no-registration';
		return `simulacrum:soul-bootstrap:${username}:${registrationId}:walletChallengeSignature`;
	}

	function readStoredWalletChallengeSignature(source: SoulBootstrapResult | null): string | null {
		const key = walletSignatureStorageKey(source);
		if (!key) return null;
		try {
			const existing = window.sessionStorage.getItem(key)?.trim();
			return existing || null;
		} catch {
			return null;
		}
	}

	function writeStoredWalletChallengeSignature(source: SoulBootstrapResult | null, signature: string) {
		const key = walletSignatureStorageKey(source);
		if (!key) return;
		try {
			window.sessionStorage.setItem(key, signature);
			storedWalletChallengeSignature = signature;
		} catch {
			storedWalletChallengeSignature = signature;
		}
	}

	function clearStoredWalletChallengeSignature(source: SoulBootstrapResult | null) {
		const key = walletSignatureStorageKey(source);
		if (!key) return;
		try {
			window.sessionStorage.removeItem(key);
		} catch {
			// Ignore storage failures; the in-memory value is cleared below.
		}
		storedWalletChallengeSignature = null;
		walletChallengeSignature = null;
	}

	function clearSoulBootstrapSessionState(source: SoulBootstrapResult | null) {
		clearStoredWalletChallengeSignature(source);
		if (typeof window === 'undefined') return;
		const username = resolveBootstrapUsername(source);
		const prefix = `simulacrum:soul-bootstrap:${username}:`;
		try {
			for (const key of Object.keys(window.sessionStorage)) {
				if (!key.startsWith(prefix)) continue;
				if (key.endsWith(':correlation')) continue;
				if (key.endsWith(':beginIdempotencyKey')) continue;
				window.sessionStorage.removeItem(key);
			}
		} catch {
			// Session cleanup is best-effort; a new registration-scoped key still prevents reuse.
		}
	}

	function defaultPrincipalDeclaration(source: SoulBootstrapResult | null): string {
		const username = resolveBootstrapUsername(source);
		return [
			`I am the principal for the local drone body @${username}.`,
			'I authorize this hosted/off-chain soul bootstrap to preserve the same body identity, attribution, and continuity through Simulacrum.',
		].join(' ');
	}

	function defaultConversationMessage(source: SoulBootstrapResult | null): string {
		const username = resolveBootstrapUsername(source);
		return `Prepare the hosted/off-chain genesis declaration for @${username}. Preserve body continuity, runtime boundaries, and operator accountability.`;
	}

	function describeSigningFailure(signingFailure: unknown): string {
		if (signingFailure instanceof SoulBootstrapSigningUxError) {
			return signingFailure.message;
		}

		if (isSoulBootstrapSigningPlanError(signingFailure)) {
			const checkpoint = signingFailure.checkpointName
				? ` (${signingFailure.checkpointName})`
				: '';
			return `Lesser signing material failed the Greater adapter plan guard${checkpoint}: ${signingFailure.message}`;
		}

		const record = signingFailure && typeof signingFailure === 'object'
			? (signingFailure as { code?: unknown; message?: unknown })
			: null;
		if (record?.code === 4001) return 'Wallet signing was rejected by the user.';
		if (typeof record?.message === 'string' && record.message.trim()) return record.message;
		return 'Soul-bootstrap signing failed closed before submission.';
	}

	function isProviderRejection(signingFailure: unknown): boolean {
		const record = signingFailure && typeof signingFailure === 'object'
			? (signingFailure as { code?: unknown; message?: unknown })
			: null;
		if (record?.code === 4001) return true;
		const message = typeof record?.message === 'string' ? record.message.trim() : '';
		if (!message) return false;
		if (/^Lesser rejected\b/i.test(message)) return false;
		return /\b(user|wallet)\b.*\b(reject(?:ed)?|denied|cancel(?:ed|led)?)\b/i.test(message) ||
			/\b(reject(?:ed)?|denied|cancel(?:ed|led)?)\b.*\b(user|wallet)\b/i.test(message);
	}

	async function requireMatchingWallet(
		provider: EthereumProvider,
		expectedAddress: `0x${string}`
	): Promise<void> {
		let accounts = await getAccounts(provider);
		if (!accounts.some((account) => sameAddress(account, expectedAddress))) {
			accounts = await requestAccounts(provider);
		}

		if (!accounts.some((account) => sameAddress(account, expectedAddress))) {
			const connected = accounts.length
				? accounts.map((account) => truncateAddress(account)).join(', ')
				: 'no connected wallet accounts';
			throw new Error(
				`Connected wallet mismatch: Lesser requires ${truncateAddress(expectedAddress)}, but the provider returned ${connected}.`
			);
		}
	}

	async function selectWalletForBegin(provider: EthereumProvider): Promise<`0x${string}`> {
		let accounts: readonly `0x${string}`[] = [];
		try {
			accounts = await getAccounts(provider);
		} catch {
			accounts = [];
		}
		if (!accounts.length) {
			accounts = await requestAccounts(provider);
		}
		const selected = accounts[0];
		if (!selected) {
			throw new Error('No wallet account is available to begin soul bootstrap.');
		}
		return normalizeHexAddress(selected, 'walletAddress');
	}

	function normalizeOptionalWallet(value: string | null | undefined): `0x${string}` | null {
		const normalized = value?.trim() ?? '';
		if (!normalized) return null;
		try {
			return normalizeHexAddress(normalized, 'walletAddress');
		} catch {
			return null;
		}
	}

	async function useConnectedWalletForBegin() {
		error = null;
		success = null;
		walletStatus = null;

		try {
			const provider = getInjectedProvider();
			if (!provider) {
				throw new Error('No injected wallet provider is available to select a bootstrap wallet.');
			}
			const walletAddress = await selectWalletForBegin(provider);
			walletAddressDraft = walletAddress;
			walletStatus = `Selected connected wallet ${truncateAddress(walletAddress)}.`;
		} catch (walletFailure) {
			if (isProviderRejection(walletFailure)) {
				error = 'Wallet account access was rejected by the user.';
			} else {
				error = describeSigningFailure(walletFailure);
			}
		}
	}

	function sameAddress(left: string, right: string): boolean {
		return left.trim().toLowerCase() === right.trim().toLowerCase();
	}

	async function submitSigningResult(
		submission: SoulBootstrapSigningSubmission
	): Promise<SoulBootstrapMutationResult> {
		switch (submission.mutation) {
			case 'verify_wallet':
				return verifySoulBootstrapWallet({ input: submission.input });
			case 'verify_principal_declaration':
				return verifySoulBootstrapPrincipalDeclaration({ input: submission.input });
			case 'finalize':
				return finalizeSoulBootstrap({ input: submission.input });
		}
	}

	function requireRegistrationId(): string {
		const registrationId = result?.state?.hostRegistrationId?.trim() ?? '';
		if (!registrationId) {
			throw new Error('Lesser has not returned a Host registration id for this step.');
		}
		return registrationId;
	}

	function requireConversationId(): string {
		const conversationId = result?.state?.hostConversationId?.trim() ?? '';
		if (!conversationId) {
			throw new Error('Lesser has not returned a Host conversation id for this step.');
		}
		return conversationId;
	}

	async function preparePrincipalDeclaration() {
		if (!canPreparePrincipal) return;

		principalPreparing = true;
		error = null;
		success = null;

		try {
			const correlation = clientCorrelation(result, 'principalDeclarationIdempotencyKey');
			const mutationResult = await prepareSoulBootstrapPrincipalDeclaration({
				input: {
					username: resolveBootstrapUsername(result),
					registrationId: requireRegistrationId(),
					principalAddress: normalizeHexAddress(principalAddressDraft, 'principalAddress'),
					principalDeclaration: principalDeclarationDraft.trim(),
					declaredAt: declaredAtDraft.trim(),
					...(correlation.correlationKey ? { correlationKey: correlation.correlationKey } : {}),
					...(correlation.idempotencyKey ? { idempotencyKey: correlation.idempotencyKey } : {}),
				},
			});

			if (mutationResult.error) {
				await onUpdated?.();
				throw new Error(`Lesser rejected principal declaration preparation: ${mutationResult.error.message}`);
			}

			success = 'Principal declaration signing material is ready. Continue with the next signing step below.';
			await onUpdated?.();
		} catch (prepareFailure) {
			error = describeSigningFailure(prepareFailure);
		} finally {
			principalPreparing = false;
		}
	}

	async function sendConversationMessage() {
		if (!canSendConversation) return;

		conversationBusy = true;
		error = null;
		success = null;

		try {
			const correlation = clientCorrelation(result, 'conversationIdempotencyKey');
			const conversationId = result?.state?.hostConversationId?.trim();
			const mutationResult = await sendSoulBootstrapConversationMessage({
				input: {
					username: resolveBootstrapUsername(result),
					registrationId: requireRegistrationId(),
					...(conversationId ? { conversationId } : {}),
					message: conversationMessageDraft.trim(),
					...(correlation.correlationKey ? { correlationKey: correlation.correlationKey } : {}),
					...(correlation.idempotencyKey ? { idempotencyKey: correlation.idempotencyKey } : {}),
				},
			});

			if (mutationResult.error) {
				await onUpdated?.();
				throw new Error(`Lesser rejected the genesis conversation message: ${mutationResult.error.message}`);
			}

			success = 'Genesis conversation turn completed through Lesser. Continue with completion when the conversation id is visible.';
			await onUpdated?.();
		} catch (conversationFailure) {
			error = describeSigningFailure(conversationFailure);
		} finally {
			conversationBusy = false;
		}
	}

	async function completeConversation() {
		if (!canCompleteConversation) return;

		conversationBusy = true;
		error = null;
		success = null;

		try {
			const correlation = clientCorrelation(result, 'conversationIdempotencyKey');
			const mutationResult = await completeSoulBootstrapConversation({
				input: {
					username: resolveBootstrapUsername(result),
					registrationId: requireRegistrationId(),
					conversationId: requireConversationId(),
					...(correlation.correlationKey ? { correlationKey: correlation.correlationKey } : {}),
					...(correlation.idempotencyKey ? { idempotencyKey: correlation.idempotencyKey } : {}),
				},
			});

			if (mutationResult.error) {
				await onUpdated?.();
				throw new Error(`Lesser rejected genesis conversation completion: ${mutationResult.error.message}`);
			}

			success = 'Genesis conversation completed. Prepare finalize signing next.';
			await onUpdated?.();
		} catch (conversationFailure) {
			error = describeSigningFailure(conversationFailure);
		} finally {
			conversationBusy = false;
		}
	}

	async function prepareFinalize() {
		if (!canPrepareFinalize) return;

		finalizePreparing = true;
		error = null;
		success = null;

		try {
			const correlation = clientCorrelation(result, 'finalizeIdempotencyKey');
			const boundarySignaturesJson = boundarySignaturesDraft.trim();
			const mutationResult = await prepareSoulBootstrapFinalize({
				input: {
					username: resolveBootstrapUsername(result),
					registrationId: requireRegistrationId(),
					conversationId: requireConversationId(),
					...(boundarySignaturesJson ? { boundarySignaturesJson } : {}),
					...(correlation.correlationKey ? { correlationKey: correlation.correlationKey } : {}),
					...(correlation.idempotencyKey ? { idempotencyKey: correlation.idempotencyKey } : {}),
				},
			});

			if (mutationResult.error) {
				await onUpdated?.();
				throw new Error(`Lesser rejected finalize preparation: ${mutationResult.error.message}`);
			}

			success = 'Finalize signing material is ready. Continue with the final signing step below.';
			await onUpdated?.();
		} catch (finalizeFailure) {
			error = describeSigningFailure(finalizeFailure);
		} finally {
			finalizePreparing = false;
		}
	}

	async function signAndSubmit() {
		if (signing || !activePlan) return;

		signing = true;
		error = null;
		success = null;

		try {
			const correlatedResult = ensureSoulBootstrapSigningCorrelation(
				result,
				clientSigningCorrelation(result)
			);
			const plan = createActiveSoulBootstrapSigningPlan(correlatedResult);
			assertSoulBootstrapSubmitPrerequisites(plan, { walletChallengeSignature: principalWalletSignature });
			const signMaterial = selectSoulBootstrapPersonalSignMaterial(plan);
			const provider = getInjectedProvider();
			if (!provider) {
				throw new Error('No injected wallet provider is available for EIP-191 personal_sign.');
			}

			try {
				await requireMatchingWallet(provider, signMaterial.signerAddress);
			} catch (walletFailure) {
				if (isProviderRejection(walletFailure)) {
					throw new Error('Wallet account access was rejected by the user.');
				}
				throw walletFailure;
			}

			const signature = await personalSign(provider, {
				address: signMaterial.signerAddress,
				message: signMaterial.message,
			});
			const submission = buildSoulBootstrapSubmitInput(plan, signature, {
				walletChallengeSignature: principalWalletSignature,
			});
			const mutationResult = await submitSigningResult(submission);

			if (mutationResult.error) {
				await onUpdated?.();
				throw new Error(
					`Lesser rejected the ${plan.kind} submission: ${mutationResult.error.message}`
				);
			}

			if (plan.kind === 'wallet_challenge') {
				walletChallengeSignature = signature;
				writeStoredWalletChallengeSignature(result, signature);
			}
			if (plan.kind === 'principal_declaration') {
				clearStoredWalletChallengeSignature(result);
			}
			success = signingPlanSuccessMessage(plan);
			await onUpdated?.();
		} catch (signingFailure) {
			if (isProviderRejection(signingFailure)) {
				error = 'Wallet signing was rejected by the user.';
			} else {
				error = describeSigningFailure(signingFailure);
			}
		} finally {
			signing = false;
		}
	}

	async function recoverWalletChallengeSignature() {
		if (!canRecoverWalletChallenge) return;

		walletRecovering = true;
		error = null;
		success = null;

		try {
			const recoveryPlan = createSoulBootstrapWalletChallengeRecoveryPlan(
				result,
				clientCorrelation(result, 'walletVerificationIdempotencyKey')
			);
			const signMaterial = selectSoulBootstrapPersonalSignMaterial(recoveryPlan);
			const provider = getInjectedProvider();
			if (!provider) {
				throw new Error('No injected wallet provider is available to re-sign the wallet challenge.');
			}

			try {
				await requireMatchingWallet(provider, signMaterial.signerAddress);
			} catch (walletFailure) {
				if (isProviderRejection(walletFailure)) {
					throw new Error('Wallet account access was rejected by the user.');
				}
				throw walletFailure;
			}

			const signature = await personalSign(provider, {
				address: signMaterial.signerAddress,
				message: signMaterial.message,
			});
			writeStoredWalletChallengeSignature(result, signature);
			success = 'Wallet challenge signature recovered for this browser session. Continue with principal declaration signing.';
		} catch (recoveryFailure) {
			if (isProviderRejection(recoveryFailure)) {
				error = 'Wallet signing was rejected by the user.';
			} else {
				error = describeSigningFailure(recoveryFailure);
			}
		} finally {
			walletRecovering = false;
		}
	}

	async function beginBootstrap({ replaceWallet = false }: { replaceWallet?: boolean } = {}) {
		if (beginning || (!beginReady && !restartReady)) return;

		beginning = true;
		error = null;
		success = null;

		try {
			const walletAddress = selectedBeginWallet;
			if (!walletAddress) {
				throw new Error('Select or enter the wallet address before beginning soul bootstrap.');
			}
			const restarting = restartReady && !beginReady;
			const mutationResult = await beginSoulBootstrap({
				input: buildSoulBootstrapBeginInput(
					result,
					walletAddress,
					clientBeginCorrelation(result, { replaceIdempotency: replaceWallet || restarting })
				),
			});

			if (mutationResult.error) {
				await onUpdated?.();
				throw new Error(`Lesser rejected bootstrap begin: ${mutationResult.error.message}`);
			}

			if (restarting) {
				clearSoulBootstrapSessionState(result);
			}
			success = replaceWallet || restarting
				? 'Soul bootstrap was restarted through Lesser with the selected wallet. Refreshing wallet challenge.'
				: 'Soul bootstrap began through Lesser. Refreshing wallet challenge.';
			await onUpdated?.();
		} catch (beginFailure) {
			if (isProviderRejection(beginFailure)) {
				error = 'Wallet account access was rejected by the user.';
			} else {
				error = describeSigningFailure(beginFailure);
			}
		} finally {
			beginning = false;
		}
	}
</script>

<section class="ft-panel" data-testid="soul-bootstrap-signing-panel">
	<header class="ft-panel__header">
		<div>
			<p class="ft-panel__eyebrow">
				Sim-led soul sequence
			</p>
			<h2>
				{actionTitle}
			</h2>
		</div>
	</header>

	<ol class="ft-stepper" data-testid="soul-bootstrap-stepper">
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
		Next step: {actionSummary}
	</p>

	{#if restartReady && workflowAction !== 'begin' && !walletRestartReady}
		<section class="ft-panel__recovery" data-testid="soul-bootstrap-restart-recovery">
			<p class="ft-panel__message ft-panel__message--warning">
				Recovery is available before final binding. {restartSummaryFor(result)}
			</p>
			<label class="ft-field">
				<span>Restart wallet</span>
				<input
					bind:value={walletAddressDraft}
					data-testid="soul-bootstrap-wallet-input"
					disabled={beginning}
					placeholder="0x…"
					type="text"
				/>
			</label>
			<div class="ft-panel__actions">
				<button
					class="ft-button"
					disabled={beginning}
					onclick={useConnectedWalletForBegin}
					type="button"
				>
					Use connected wallet
				</button>
				<button
					class="ft-button"
					data-testid="soul-bootstrap-restart-button"
					disabled={!canBegin}
					onclick={() => beginBootstrap({ replaceWallet: true })}
					type="button"
				>
					{beginning ? 'Restarting…' : 'Restart with selected wallet'}
				</button>
			</div>
			{#if walletStatus}
				<p class="ft-panel__message ft-panel__message--success">{walletStatus}</p>
			{/if}
			{#if walletAddressDraft && !selectedBeginWallet}
				<p class="ft-panel__message ft-panel__message--warning">
					Enter a valid 0x wallet address before restarting this bootstrap step.
				</p>
			{/if}
		</section>
	{/if}

	{#if beginReady || (restartReady && workflowAction === 'begin')}
		<p class="ft-panel__copy">
			{#if restartReady && !beginReady}
				{restartSummaryFor(result)}
				Select the intended wallet and start a fresh same-origin Lesser/Host registration.
			{:else}
				Begin uses Lesser same-origin GraphQL and the wallet address you explicitly select below.
				Lesser performs the server-side Host registration and returns the wallet challenge.
			{/if}
			Simulacrum does not ask for Host credentials or construct Host signing material locally.
		</p>
		<label class="ft-field">
			<span>Bootstrap wallet</span>
			<input
				bind:value={walletAddressDraft}
				data-testid="soul-bootstrap-wallet-input"
				disabled={beginning}
				placeholder="0x…"
				type="text"
			/>
		</label>
		<div class="ft-panel__actions">
			<button
				class="ft-button"
				disabled={beginning}
				onclick={useConnectedWalletForBegin}
				type="button"
			>
				Use connected wallet
			</button>
			<button
				class="ft-button ft-button--primary"
				data-testid="soul-bootstrap-begin-button"
				disabled={!canBegin}
				onclick={() => beginBootstrap({ replaceWallet: restartReady && !beginReady })}
				type="button"
			>
				{beginning ? 'Beginning…' : restartReady && !beginReady ? 'Restart with selected wallet' : 'Begin with selected wallet'}
			</button>
		</div>
		{#if walletStatus}
			<p class="ft-panel__message ft-panel__message--success">{walletStatus}</p>
		{/if}
		{#if walletAddressDraft && !selectedBeginWallet}
			<p class="ft-panel__message ft-panel__message--warning">
				Enter a valid 0x wallet address before starting this bootstrap step.
			</p>
		{/if}
	{:else if workflowAction === 'prepare_principal_declaration'}
		<p class="ft-panel__copy">
			This is the missing post-sign step: Lesser has the wallet signature and now needs a principal
			declaration preflight. Simulacrum sends only the declaration text and principal address to
			Lesser; Host returns canonical signing material in the next state.
		</p>
		<label class="ft-field">
			<span>Principal address</span>
			<input bind:value={principalAddressDraft} disabled={principalPreparing} placeholder="0x…" type="text" />
		</label>
		<label class="ft-field">
			<span>Principal declaration</span>
			<textarea bind:value={principalDeclarationDraft} disabled={principalPreparing} rows="4"></textarea>
		</label>
		<label class="ft-field">
			<span>Declared at</span>
			<input bind:value={declaredAtDraft} disabled={principalPreparing} type="text" />
		</label>
		{#if principalAddressDraft && !principalAddress}
			<p class="ft-panel__message ft-panel__message--warning">
				Enter a valid 0x principal address before preparing the declaration.
			</p>
		{/if}
		<button
			class="ft-button ft-button--primary"
			data-testid="soul-bootstrap-prepare-principal-button"
			disabled={!canPreparePrincipal}
			onclick={preparePrincipalDeclaration}
			type="button"
		>
			{principalPreparing ? 'Preparing…' : 'Prepare principal declaration'}
		</button>
	{:else if activePlan}
		{#if walletRestartReady}
			<p class="ft-panel__message ft-panel__message--warning">
				This bootstrap is waiting on wallet verification for
				<strong>{truncateAddress(existingBootstrapWallet)}</strong>. If that is the wrong wallet,
				select the intended wallet and restart before signing. Lesser will request a new server-side Host
				registration; Simulacrum will not mutate Host directly.
			</p>
			<label class="ft-field">
				<span>Replacement bootstrap wallet</span>
				<input
					bind:value={walletAddressDraft}
					data-testid="soul-bootstrap-wallet-input"
					disabled={beginning}
					placeholder="0x…"
					type="text"
				/>
			</label>
			<div class="ft-panel__actions">
				<button
					class="ft-button"
					disabled={beginning}
					onclick={useConnectedWalletForBegin}
					type="button"
				>
					Use connected wallet
				</button>
				<button
					class="ft-button"
					data-testid="soul-bootstrap-restart-button"
					disabled={!canBegin}
					onclick={() => beginBootstrap({ replaceWallet: true })}
					type="button"
				>
					{beginning ? 'Restarting…' : 'Restart with selected wallet'}
				</button>
			</div>
			{#if walletStatus}
				<p class="ft-panel__message ft-panel__message--success">{walletStatus}</p>
			{/if}
			{#if walletAddressDraft && !selectedBeginWallet}
				<p class="ft-panel__message ft-panel__message--warning">
					Enter a valid 0x wallet address before restarting this bootstrap step.
				</p>
			{/if}
		{/if}
		<p class="ft-panel__copy">
			Simulacrum signs only the Greater adapter material returned by Lesser for
			<strong>{activePlan.kind}</strong>. It does not reconstruct Host canonical JSON,
			digests, or request templates in the browser.
		</p>
		<p class="ft-panel__message">
			Bootstrap wallet: {truncateAddress(existingBootstrapWallet)}
		</p>
		<ul class="ft-list">
			<li>Method: {activePlan.signing.method}</li>
			<li>Encoding: {activePlan.signing.messageEncoding}</li>
			<li>Signer: {truncateAddress(activePlan.signing.signerAddress)}</li>
			{#if activePlan.signing.digestHex}
				<li>Digest: {activePlan.signing.digestHex}</li>
			{/if}
			<li>Material field: {activePlan.signing.messageEncoding === 'hex_bytes' ? 'messageHex' : 'message'}</li>
		</ul>
		<details class="ft-panel__details">
			<summary>Review exact wallet material</summary>
			<code>{formatSigningMaterial(activePlan)}</code>
		</details>
		{#if activePlan.kind === 'principal_declaration'}
			{#if missingPrincipalPrerequisite}
				<p class="ft-panel__message ft-panel__message--warning">
					Principal declaration submission requires the wallet challenge signature captured from
					the preceding Simulacrum signing step. Simulacrum keeps it only in browser session
					storage for this registration. Re-sign the current wallet challenge below to recover
					the session-only signature.
				</p>
			{:else}
				<p class="ft-panel__message ft-panel__message--warning">
					If this browser session crossed a restart or failed Host submission, re-sign the
					current wallet challenge before signing the principal declaration. This overwrites
					stale session-only wallet material for this registration.
				</p>
			{/if}
			<button
				class="ft-button"
				data-testid="soul-bootstrap-recover-wallet-signature-button"
				disabled={!canRecoverWalletChallenge}
				onclick={recoverWalletChallengeSignature}
				type="button"
			>
				{walletRecovering ? 'Recovering…' : principalWalletSignature ? 'Re-sign wallet challenge for this registration' : 'Re-sign wallet challenge for this session'}
			</button>
		{/if}
		<button class="ft-button ft-button--primary" disabled={!canSign} onclick={signAndSubmit} type="button">
			{signing ? 'Signing…' : signingPlanButtonLabel(activePlan)}
		</button>
	{:else if workflowAction === 'send_conversation_message'}
		<p class="ft-panel__copy">
			{conversationRetryReady
				? 'The Host rejected the previous genesis request as a bootstrap conflict before creating a conversation. Once the operator-side Host conflict is cleared, retry the same genesis lane from Lesser.'
				: 'The principal declaration is verified. Start the genesis conversation now; the response is consumed by Lesser and the next visible step will be completion.'}
		</p>
		<label class="ft-field">
			<span>Genesis message</span>
			<textarea bind:value={conversationMessageDraft} disabled={conversationBusy} rows="4"></textarea>
		</label>
		<button
			class="ft-button ft-button--primary"
			data-testid="soul-bootstrap-send-conversation-button"
			disabled={!canSendConversation}
			onclick={sendConversationMessage}
			type="button"
		>
			{conversationBusy ? 'Sending…' : 'Start genesis conversation'}
		</button>
	{:else if workflowAction === 'complete_conversation'}
		<p class="ft-panel__copy">
			Conversation {result?.state?.hostConversationId} is in progress. Complete it to let Host
			produce the declaration material required for finalization.
		</p>
		<button
			class="ft-button ft-button--primary"
			data-testid="soul-bootstrap-complete-conversation-button"
			disabled={!canCompleteConversation}
			onclick={completeConversation}
			type="button"
		>
			{conversationBusy ? 'Completing…' : 'Complete genesis conversation'}
		</button>
	{:else if workflowAction === 'prepare_finalize'}
		<p class="ft-panel__copy">
			The genesis conversation is complete. Prepare finalize signing material through Lesser.
			Leave boundary signatures as an empty object unless Host reports explicit boundary
			requirements for this registration.
		</p>
		<label class="ft-field">
			<span>Boundary signatures JSON</span>
			<textarea bind:value={boundarySignaturesDraft} disabled={finalizePreparing} rows="3"></textarea>
		</label>
		<button
			class="ft-button ft-button--primary"
			data-testid="soul-bootstrap-prepare-finalize-button"
			disabled={!canPrepareFinalize}
			onclick={prepareFinalize}
			type="button"
		>
			{finalizePreparing ? 'Preparing…' : 'Prepare finalize signing'}
		</button>
	{:else if workflowAction === 'complete'}
		<p class="ft-panel__message ft-panel__message--success">
			Hosted/off-chain soul binding is complete. Open Identity Nexus to inspect continuity and
			activation disclosures.
		</p>
	{:else}
		<p class="ft-panel__copy">
			Lesser has not returned a safe next action or adapter signing plan for the current
			bootstrap phase. The lane stays visible but closed; Simulacrum will not construct Host
			signing material locally.
		</p>
		{#if planError}
			<p
				class={planErrorTone === 'error'
					? 'ft-panel__message ft-panel__message--error'
					: 'ft-panel__message ft-panel__message--warning'}
			>
				{planError}
			</p>
		{/if}
	{/if}

	{#if error}
		<p class="ft-panel__message ft-panel__message--error" data-testid="soul-bootstrap-signing-error">
			{error}
		</p>
	{/if}
	{#if success}
		<p class="ft-panel__message ft-panel__message--success" data-testid="soul-bootstrap-signing-success">
			{success}
		</p>
	{/if}
</section>
