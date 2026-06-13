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
	FinalizeSoulBootstrapInput,
	SoulBootstrapPhase,
	SoulBootstrapResult,
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

export type SoulBootstrapSigningUxErrorCode =
	| 'missing_state'
	| 'missing_plan'
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

const SIGNING_KIND_BY_PHASE: Partial<Record<SoulBootstrapPhase, SoulBootstrapSigningPlanKind>> = {
	WALLET_VERIFICATION: 'wallet_challenge',
	PRINCIPAL_DECLARATION: 'principal_declaration',
	FINALIZE: 'finalize_self_attestation',
};

export function activeSoulBootstrapSigningKind(
	result: SoulBootstrapResult | null
): SoulBootstrapSigningPlanKind | null {
	const phase = result?.state?.phase;
	return phase ? SIGNING_KIND_BY_PHASE[phase] ?? null : null;
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
	const principalDeclaration = plan.signing.canonicalJson?.trim() ?? '';
	if (!principalDeclaration) {
		throw new SoulBootstrapSigningUxError({
			code: 'missing_principal_declaration',
			message:
				'The principal declaration plan does not include adapter-provided canonical JSON to submit.',
		});
	}
	return principalDeclaration;
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

function normalizeHexAddress(value: string | null | undefined, field: string): `0x${string}` {
	const normalized = value?.trim() ?? '';
	if (!/^0x[0-9a-fA-F]{40}$/.test(normalized)) {
		throw new SoulBootstrapSigningUxError({
			code: 'malformed_material',
			message: `Soul-bootstrap signing material has an invalid ${field}.`,
		});
	}
	return normalized as `0x${string}`;
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
