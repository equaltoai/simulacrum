import {
	SoulBootstrapSigningPlanError,
	createSoulBootstrapSigningPlan,
	type SoulBootstrapFinalizeSigningPlan,
	type SoulBootstrapMessageEncoding,
	type SoulBootstrapPrincipalDeclarationSigningPlan,
	type SoulBootstrapSigningMethod,
	type SoulBootstrapSigningPlan,
	type SoulBootstrapSigningPlanKind,
	type SoulBootstrapWalletChallengeSigningPlan,
} from '../lib/greater/adapters/soul/bootstrapSigningPlan.ts';
import type {
	BeginSoulBootstrapInput,
	FinalizeSoulBootstrapInput,
	SoulBootstrapCorrelationState,
	SoulBootstrapPhase,
	SoulBootstrapResult,
	SoulBootstrapState,
	SoulBootstrapSurface,
	VerifySoulBootstrapPrincipalDeclarationInput,
	VerifySoulBootstrapWalletInput,
} from '../lib/api/soulBootstrap.ts';

export type SoulBootstrapSigningSubmission =
	| {
			kind: 'wallet_challenge';
			mutation: 'verify_wallet';
			input: VerifySoulBootstrapWalletInput;
	  }
	| {
			kind: 'principal_declaration';
			mutation: 'verify_principal_declaration';
			input: VerifySoulBootstrapPrincipalDeclarationInput;
	  }
	| {
			kind: 'finalize_self_attestation';
			mutation: 'finalize';
			input: FinalizeSoulBootstrapInput;
	  };

export type SoulBootstrapSigningCorrelationField =
	| 'walletVerificationIdempotencyKey'
	| 'principalDeclarationIdempotencyKey'
	| 'finalizeIdempotencyKey';

export type SoulBootstrapSigningUxErrorCode =
	| 'missing_state'
	| 'missing_plan'
	| 'missing_username'
	| 'missing_correlation'
	| 'unsupported_method'
	| 'unsupported_encoding'
	| 'malformed_material'
	| 'missing_wallet_challenge_signature'
	| 'missing_principal_declaration'
	| 'missing_signature';

export interface SoulBootstrapPersonalSignMaterial {
	method: Extract<SoulBootstrapSigningMethod, 'eip191_personal_sign'>;
	messageEncoding: SoulBootstrapMessageEncoding;
	message: string;
	messageField: 'message' | 'messageHex';
	signerAddress: `0x${string}`;
}

export interface SoulBootstrapPrincipalDeclarationInputs {
	walletChallengeSignature?: string | null;
}

export interface SoulBootstrapClientCorrelationKeys {
	correlationKey?: string | null;
	idempotencyKey?: string | null;
}

export class SoulBootstrapSigningUxError extends Error {
	readonly code: SoulBootstrapSigningUxErrorCode;
	readonly cause?: unknown;

	constructor({
		code,
		message,
		cause,
	}: {
		code: SoulBootstrapSigningUxErrorCode;
		message: string;
		cause?: unknown;
	}) {
		super(message);
		this.name = 'SoulBootstrapSigningUxError';
		this.code = code;
		this.cause = cause;
	}
}

const CORRELATION_FIELD_BY_KIND: Record<
	SoulBootstrapSigningPlanKind,
	SoulBootstrapSigningCorrelationField
> = {
	wallet_challenge: 'walletVerificationIdempotencyKey',
	principal_declaration: 'principalDeclarationIdempotencyKey',
	finalize_self_attestation: 'finalizeIdempotencyKey',
};

export function activeSoulBootstrapSigningKind(
	result: SoulBootstrapResult | null
): SoulBootstrapSigningPlanKind | null {
	const phase = result?.state?.phase;
	const nextAction = result?.nextAction?.trim() ?? '';
	switch (phase) {
		case 'BEGIN':
			return hasActionableCheckpoint(result, 'wallet') ? 'wallet_challenge' : null;
		case 'WALLET_VERIFICATION':
			return nextAction === 'verify_wallet' && hasActionableCheckpoint(result, 'wallet')
				? 'wallet_challenge'
				: null;
		case 'PRINCIPAL_DECLARATION':
			return nextAction === 'verify_principal_declaration' &&
				hasActionableCheckpoint(result, 'principal_declaration')
				? 'principal_declaration'
				: null;
		case 'FINALIZE':
			return nextAction === 'finalize' && hasActionableCheckpoint(result, 'finalize')
				? 'finalize_self_attestation'
				: null;
		case 'ERROR':
			if (isSoulBootstrapRegistrationRestartReady(result)) return null;
			return recoverableSigningKindFromCheckpoints(result);
		default:
			return null;
	}
}

export function activeSoulBootstrapSigningCorrelationField(
	result: SoulBootstrapResult | null
): SoulBootstrapSigningCorrelationField | null {
	const kind = activeSoulBootstrapSigningKind(result);
	return kind ? CORRELATION_FIELD_BY_KIND[kind] : null;
}

export function isSoulBootstrapBeginReady(result: SoulBootstrapResult | null): boolean {
	if (!result?.state || result.error || result.state.error) return false;
	if (result.surface?.soulBindingState === 'BOUND') return false;
	const nextAction = result.nextAction?.trim() ?? '';
	return result.state.phase === 'NOT_STARTED' && (nextAction === '' || nextAction === 'begin');
}

export function isSoulBootstrapWalletRestartReady(result: SoulBootstrapResult | null): boolean {
	if (!result?.state || result.error || result.state.error) return false;
	if (result.surface?.soulBindingState === 'BOUND') return false;
	if (result.state.phase !== 'BEGIN') return false;
	const walletAddress = result.state.walletAddress?.trim() ?? '';
	if (!walletAddress) return false;
	return hasActionableCheckpoint(result, 'wallet');
}

export function isSoulBootstrapRegistrationRestartReady(result: SoulBootstrapResult | null): boolean {
	if (!result?.state) return false;
	if (result.surface?.soulBindingState === 'BOUND') return false;
	if (result.state.phase !== 'ERROR') return false;
	const error = result.state.error ?? result.error ?? null;
	return error?.code?.trim() === 'HOST_REGISTRATION_NOT_FOUND';
}

export function isSoulBootstrapRestartReady(result: SoulBootstrapResult | null): boolean {
	if (!result?.state) return false;
	if (result.surface?.soulBindingState === 'BOUND') return false;
	if (result.state.phase === 'COMPLETE' || result.state.phase === 'NOT_STARTED') return false;
	if (isOperatorConfigurationBlock(result)) return false;
	return hasStartedSoulBootstrap(result);
}

export function isSoulBootstrapConversationRetryReady(result: SoulBootstrapResult | null): boolean {
	if (!result?.state) return false;
	if (result.surface?.soulBindingState === 'BOUND') return false;
	if (result.state.phase !== 'ERROR') return false;
	const error = result.state.error ?? result.error ?? null;
	if (error?.code?.trim() !== 'HOST_BOOTSTRAP_CONFLICT') return false;
	if (!result.state.hostRegistrationId?.trim()) return false;
	if (result.state.hostConversationId?.trim()) return false;
	return hasCompletedCheckpoint(result, 'principal_declaration');
}

export function buildSoulBootstrapBeginInput(
	result: SoulBootstrapResult | null,
	walletAddress: string,
	correlation: SoulBootstrapClientCorrelationKeys = {}
): BeginSoulBootstrapInput {
	const username = resolveSoulBootstrapUsername(result);
	return {
		username,
		walletAddress: normalizeHexAddress(walletAddress, 'walletAddress'),
		...optionalCorrelationInput(correlation),
	};
}

export function ensureSoulBootstrapSigningCorrelation(
	result: SoulBootstrapResult | null,
	correlation: SoulBootstrapClientCorrelationKeys = {}
): SoulBootstrapResult | null {
	if (!result?.state) return result;
	const field = activeSoulBootstrapSigningCorrelationField(result);
	if (!field) return result;
	return ensureSoulBootstrapCorrelationField(result, field, correlation);
}

export function createSoulBootstrapWalletChallengeRecoveryPlan(
	result: SoulBootstrapResult | null,
	correlation: SoulBootstrapClientCorrelationKeys = {}
): SoulBootstrapWalletChallengeSigningPlan {
	if (!result?.state) {
		throw new SoulBootstrapSigningUxError({
			code: 'missing_state',
			message: 'Lesser did not return soul-bootstrap state with wallet challenge material.',
		});
	}
	const source = ensureSoulBootstrapCorrelationField(
		result,
		'walletVerificationIdempotencyKey',
		correlation
	);
	return createSoulBootstrapSigningPlan(source, 'wallet_challenge');
}

function ensureSoulBootstrapCorrelationField(
	result: SoulBootstrapResult,
	field: SoulBootstrapSigningCorrelationField,
	correlation: SoulBootstrapClientCorrelationKeys = {}
): SoulBootstrapResult {
	const state = result.state;
	if (!state) return result;

	const existing = state.correlation;
	const correlationKey = normalizeCorrelationValue(
		existing?.correlationKey ?? correlation.correlationKey,
		'correlation.correlationKey'
	);
	const idempotencyKey = normalizeCorrelationValue(
		correlation.idempotencyKey ?? existing?.[field],
		`correlation.${field}`
	);
	const nextCorrelation: SoulBootstrapCorrelationState = {
		__typename: 'SoulBootstrapCorrelationState',
		correlationKey,
		beginIdempotencyKey: existing?.beginIdempotencyKey ?? null,
		walletVerificationIdempotencyKey: existing?.walletVerificationIdempotencyKey ?? null,
		principalDeclarationIdempotencyKey: existing?.principalDeclarationIdempotencyKey ?? null,
		conversationIdempotencyKey: existing?.conversationIdempotencyKey ?? null,
		finalizeIdempotencyKey: existing?.finalizeIdempotencyKey ?? null,
		lastHostRequestId: existing?.lastHostRequestId ?? null,
		[field]: idempotencyKey,
	};
	const nextState: SoulBootstrapState = {
		...state,
		__typename: 'SoulBootstrapState',
		correlation: nextCorrelation,
	};
	const nextSurface: SoulBootstrapSurface | null = result.surface
		? {
				...result.surface,
				state: nextState,
			}
		: result.surface;
	return {
		...result,
		surface: nextSurface,
		state: nextState,
	};
}

export function createActiveSoulBootstrapSigningPlan(
	result: SoulBootstrapResult | null
): SoulBootstrapSigningPlan {
	if (!result?.state) {
		throw new SoulBootstrapSigningUxError({
			code: 'missing_state',
			message: 'Lesser did not return soul-bootstrap state with signing checkpoints.',
		});
	}

	const kind = activeSoulBootstrapSigningKind(result);
	if (!kind) {
		throw new SoulBootstrapSigningUxError({
			code: 'missing_plan',
			message: `Soul bootstrap phase ${result.state.phase} does not have an active signing plan.`,
		});
	}

	return createSoulBootstrapSigningPlan(result, kind);
}

export function selectSoulBootstrapPersonalSignMaterial(
	plan: SoulBootstrapSigningPlan
): SoulBootstrapPersonalSignMaterial {
	const signing = plan.signing;
	if (signing.method !== 'eip191_personal_sign') {
		throw new SoulBootstrapSigningUxError({
			code: 'unsupported_method',
			message: `Unsupported soul-bootstrap signing method ${signing.method}.`,
		});
	}

	const signerAddress = normalizeHexAddress(signing.signerAddress, 'signerAddress');

	if (signing.messageEncoding === 'hex_bytes') {
		return {
			method: signing.method,
			messageEncoding: signing.messageEncoding,
			message: normalizeHexPayload(signing.messageHex, 'messageHex'),
			messageField: 'messageHex',
			signerAddress,
		};
	}

	if (signing.messageEncoding === 'utf8') {
		const message = signing.message?.trim() ?? '';
		if (!message) {
			throw new SoulBootstrapSigningUxError({
				code: 'malformed_material',
				message: 'Soul-bootstrap UTF-8 signing material is missing the adapter-provided message.',
			});
		}
		return {
			method: signing.method,
			messageEncoding: signing.messageEncoding,
			message,
			messageField: 'message',
			signerAddress,
		};
	}

	throw new SoulBootstrapSigningUxError({
		code: 'unsupported_encoding',
		message: `Unsupported soul-bootstrap message encoding ${
			(signing as { messageEncoding?: unknown }).messageEncoding
		}.`,
	});
}

export function assertSoulBootstrapSubmitPrerequisites(
	plan: SoulBootstrapSigningPlan,
	principalInputs: SoulBootstrapPrincipalDeclarationInputs = {}
): void {
	if (plan.kind !== 'principal_declaration') return;

	assertWalletChallengeSignature(principalInputs.walletChallengeSignature);
	principalDeclarationFromPlan(plan);
}

export function buildSoulBootstrapSubmitInput(
	plan: SoulBootstrapSigningPlan,
	signature: string,
	principalInputs: SoulBootstrapPrincipalDeclarationInputs = {}
): SoulBootstrapSigningSubmission {
	const normalizedSignature = normalizeSignature(signature, 'signature');

	if (plan.kind === 'wallet_challenge') {
		return {
			kind: plan.kind,
			mutation: 'verify_wallet',
			input: (plan as SoulBootstrapWalletChallengeSigningPlan).createSubmitInput(normalizedSignature),
		};
	}

	if (plan.kind === 'finalize_self_attestation') {
		return {
			kind: plan.kind,
			mutation: 'finalize',
			input: (plan as SoulBootstrapFinalizeSigningPlan).createSubmitInput(normalizedSignature),
		};
	}

	const principalPlan = plan as SoulBootstrapPrincipalDeclarationSigningPlan;
	return {
		kind: plan.kind,
		mutation: 'verify_principal_declaration',
		input: principalPlan.createSubmitInput({
			walletChallengeSignature: assertWalletChallengeSignature(
				principalInputs.walletChallengeSignature
			),
			principalSignature: normalizedSignature,
			principalDeclaration: principalDeclarationFromPlan(principalPlan),
		}),
	};
}

export function signingPlanButtonLabel(plan: SoulBootstrapSigningPlan): string {
	switch (plan.kind) {
		case 'wallet_challenge':
			return 'Sign wallet challenge';
		case 'principal_declaration':
			return 'Sign principal declaration';
		case 'finalize_self_attestation':
			return 'Sign finalize attestation';
	}
}

export function signingPlanTitle(plan: SoulBootstrapSigningPlan): string {
	switch (plan.kind) {
		case 'wallet_challenge':
			return 'Wallet challenge signing';
		case 'principal_declaration':
			return 'Principal declaration signing';
		case 'finalize_self_attestation':
			return 'Finalize self-attestation signing';
	}
}

export function signingPlanSuccessMessage(plan: SoulBootstrapSigningPlan): string {
	switch (plan.kind) {
		case 'wallet_challenge':
			return 'Wallet challenge signature accepted by Lesser. Refreshing bootstrap state.';
		case 'principal_declaration':
			return 'Principal declaration signature accepted by Lesser. Refreshing bootstrap state.';
		case 'finalize_self_attestation':
			return 'Finalize signature accepted by Lesser. Refreshing bootstrap state.';
	}
}

export function isSoulBootstrapSigningPlanError(
	error: unknown
): error is SoulBootstrapSigningPlanError {
	return error instanceof SoulBootstrapSigningPlanError;
}

function principalDeclarationFromPlan(plan: SoulBootstrapPrincipalDeclarationSigningPlan): string {
	const canonicalJson = plan.signing.canonicalJson?.trim() ?? '';
	if (!canonicalJson) {
		throw new SoulBootstrapSigningUxError({
			code: 'missing_principal_declaration',
			message:
				'The principal declaration plan does not include adapter-provided canonical JSON to inspect.',
		});
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(canonicalJson);
	} catch {
		throw new SoulBootstrapSigningUxError({
			code: 'missing_principal_declaration',
			message:
				'The principal declaration plan returned invalid canonical JSON; Simulacrum cannot safely submit the declaration.',
		});
	}

	const principalDeclaration =
		parsed && typeof parsed === 'object' && 'declaration' in parsed
			? (parsed as { declaration?: unknown }).declaration
			: null;
	if (typeof principalDeclaration !== 'string' || !principalDeclaration.trim()) {
		throw new SoulBootstrapSigningUxError({
			code: 'missing_principal_declaration',
			message:
				'The principal declaration plan does not include the raw declaration required by Host verification.',
		});
	}

	return principalDeclaration.trim();
}

function assertWalletChallengeSignature(signature?: string | null): string {
	const candidate = signature?.trim() ?? '';
	if (!candidate) {
		throw new SoulBootstrapSigningUxError({
			code: 'missing_wallet_challenge_signature',
			message:
				'The principal declaration plan requires the wallet challenge signature from the prior Simulacrum signing step; refresh-safe backend state does not expose it yet.',
		});
	}
	return normalizeSignature(candidate, 'walletChallengeSignature');
}

export function normalizeHexAddress(value: string | null | undefined, field: string): `0x${string}` {
	const normalized = value?.trim() ?? '';
	if (!/^0x[0-9a-fA-F]{40}$/.test(normalized)) {
		throw new SoulBootstrapSigningUxError({
			code: 'malformed_material',
			message: `Soul-bootstrap signing material has an invalid ${field}.`,
		});
	}
	return normalized as `0x${string}`;
}

function resolveSoulBootstrapUsername(result: SoulBootstrapResult | null): string {
	const username = result?.surface?.username?.trim() || result?.state?.username?.trim() || '';
	if (!username) {
		throw new SoulBootstrapSigningUxError({
			code: 'missing_username',
			message: 'Soul-bootstrap begin requires a Lesser username.',
		});
	}
	return username;
}

function optionalCorrelationInput(correlation: SoulBootstrapClientCorrelationKeys) {
	const correlationKey = correlation.correlationKey?.trim() ?? '';
	const idempotencyKey = correlation.idempotencyKey?.trim() ?? '';
	return {
		...(correlationKey ? { correlationKey } : {}),
		...(idempotencyKey ? { idempotencyKey } : {}),
	};
}

function normalizeCorrelationValue(value: string | null | undefined, field: string): string {
	const normalized = value?.trim() ?? '';
	if (!normalized) {
		throw new SoulBootstrapSigningUxError({
			code: 'missing_correlation',
			message: `Soul-bootstrap signing requires ${field}.`,
		});
	}
	return normalized;
}

function hasActionableCheckpoint(
	result: SoulBootstrapResult | null,
	checkpointName: string
): boolean {
	const checkpoint = result?.state?.signingCheckpoints?.find(
		(candidate) => candidate.name.trim() === checkpointName
	);
	if (!checkpoint) return false;
	const status = checkpoint.status.trim().toLowerCase();
	return !['signed', 'verified', 'complete', 'completed'].includes(status);
}

function hasCompletedCheckpoint(
	result: SoulBootstrapResult | null,
	checkpointName: string
): boolean {
	const checkpoint = result?.state?.signingCheckpoints?.find(
		(candidate) => candidate.name.trim() === checkpointName
	);
	if (!checkpoint) return false;
	const status = checkpoint.status.trim().toLowerCase();
	return ['signed', 'verified', 'complete', 'completed'].includes(status);
}

function recoverableSigningKindFromCheckpoints(
	result: SoulBootstrapResult | null
): SoulBootstrapSigningPlanKind | null {
	if (hasActionableCheckpoint(result, 'finalize')) return 'finalize_self_attestation';
	if (hasActionableCheckpoint(result, 'principal_declaration')) return 'principal_declaration';
	if (hasActionableCheckpoint(result, 'wallet')) return 'wallet_challenge';
	return null;
}

function hasStartedSoulBootstrap(result: SoulBootstrapResult): boolean {
	const state = result.state;
	if (!state) return false;
	return Boolean(
		state.hostRegistrationId?.trim() ||
		state.hostConversationId?.trim() ||
		state.hostSoulAgentId?.trim() ||
		state.walletAddress?.trim() ||
		state.principalAddress?.trim() ||
		state.signingCheckpoints.length
	);
}

function isOperatorConfigurationBlock(result: SoulBootstrapResult): boolean {
	const error = result.state?.error ?? result.error ?? null;
	const normalized = [
		error?.code,
		error?.message,
		error?.source,
		result.state?.state,
		result.nextAction,
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase()
		.replace(/[_-]+/g, ' ');
	return [
		'missing trust',
		'trust not configured',
		'missing instance key',
		'instance key missing',
		'configure instance key',
		'request trust',
		'backend contract unsupported',
		'cannot query field',
	].some((term) => normalized.includes(term));
}

function normalizeHexPayload(value: string | null | undefined, field: string): `0x${string}` {
	const normalized = value?.trim() ?? '';
	if (!/^0x[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
		throw new SoulBootstrapSigningUxError({
			code: 'malformed_material',
			message: `Soul-bootstrap signing material has an invalid ${field}.`,
		});
	}
	return normalized as `0x${string}`;
}

function normalizeSignature(value: string, field: string): `0x${string}` {
	const normalized = value.trim();
	if (!normalized) {
		throw new SoulBootstrapSigningUxError({
			code: 'missing_signature',
			message: `Soul-bootstrap signing requires ${field}.`,
		});
	}
	if (!/^0x[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
		throw new SoulBootstrapSigningUxError({
			code: 'malformed_material',
			message: `Soul-bootstrap signing produced an invalid ${field}.`,
		});
	}
	return normalized as `0x${string}`;
}
