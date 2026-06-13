import {
	SoulBootstrapClientError,
	createSoulBootstrapClient,
	normalizeSoulBootstrapError,
	type BeginSoulBootstrapInput,
	type CompleteSoulBootstrapConversationInput,
	type FinalizeSoulBootstrapInput,
	type PrepareSoulBootstrapFinalizeInput,
	type PrepareSoulBootstrapPrincipalDeclarationInput,
	type SendSoulBootstrapConversationMessageInput,
	type SoulBootstrapClient,
	type SoulBootstrapMutationResult,
	type SoulBootstrapResult,
	type VerifySoulBootstrapPrincipalDeclarationInput,
	type VerifySoulBootstrapWalletInput,
} from '$lib/greater/adapters/soul';

import { getAccessToken } from './auth';

export const SOUL_BOOTSTRAP_AUTH_NOTE =
	'Soul creation now uses Lesser same-origin GraphQL; Lesser performs server-side Host instance-trust calls, so Simulacrum never asks the browser for lesser-host control-plane credentials.';

export interface SoulBootstrapRequestOptions {
	endpoint?: string;
	token?: string | null;
	signal?: AbortSignal;
}

export interface SoulBootstrapCurrentOptions extends SoulBootstrapRequestOptions {
	username: string;
}

function requireAccessToken(token?: string | null): string {
	const resolved = token?.trim() || getAccessToken();
	if (!resolved) throw new Error('Not authenticated');
	return resolved;
}

function createRequestFetch(signal?: AbortSignal) {
	return (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
		fetch(input, {
			...init,
			signal: signal ?? init?.signal,
		});
}

export function createProject44SoulBootstrapClient({
	endpoint = '/api/graphql',
	token,
	signal,
}: SoulBootstrapRequestOptions = {}): SoulBootstrapClient {
	return createSoulBootstrapClient({
		httpEndpoint: endpoint,
		token: requireAccessToken(token),
		fetch: createRequestFetch(signal),
	});
}

export async function fetchSoulBootstrapSurface({
	username,
	...options
}: SoulBootstrapCurrentOptions): Promise<SoulBootstrapResult> {
	return createProject44SoulBootstrapClient(options).current({ username });
}

export async function beginSoulBootstrap({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: BeginSoulBootstrapInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).begin(input);
}

export async function verifySoulBootstrapWallet({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: VerifySoulBootstrapWalletInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).verifyWallet(input);
}

export async function prepareSoulBootstrapPrincipalDeclaration({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: PrepareSoulBootstrapPrincipalDeclarationInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).preparePrincipalDeclaration(input);
}

export async function verifySoulBootstrapPrincipalDeclaration({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: VerifySoulBootstrapPrincipalDeclarationInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).verifyPrincipalDeclaration(input);
}

export async function sendSoulBootstrapConversationMessage({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: SendSoulBootstrapConversationMessageInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).sendConversationMessage(input);
}

export async function completeSoulBootstrapConversation({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: CompleteSoulBootstrapConversationInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).completeConversation(input);
}

export async function prepareSoulBootstrapFinalize({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: PrepareSoulBootstrapFinalizeInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).prepareFinalize(input);
}

export async function finalizeSoulBootstrap({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: FinalizeSoulBootstrapInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).finalize(input);
}

export function isSoulBootstrapError(error: unknown): error is SoulBootstrapClientError {
	return error instanceof SoulBootstrapClientError;
}

export { SoulBootstrapClientError, normalizeSoulBootstrapError };
export type {
	BeginSoulBootstrapInput,
	CompleteSoulBootstrapConversationInput,
	FinalizeSoulBootstrapInput,
	PrepareSoulBootstrapFinalizeInput,
	PrepareSoulBootstrapPrincipalDeclarationInput,
	SendSoulBootstrapConversationMessageInput,
	SoulBootstrapActionableError,
	SoulBootstrapClient,
	SoulBootstrapCorrelationState,
	SoulBootstrapCurrentInput,
	SoulBootstrapErrorCategory,
	SoulBootstrapErrorState,
	SoulBootstrapMutationPayload,
	SoulBootstrapMutationResult,
	SoulBootstrapPhase,
	SoulBootstrapPublicationEvidence,
	SoulBootstrapResult,
	SoulBootstrapSigningCheckpoint,
	SoulBootstrapState,
	SoulBootstrapSurface,
	VerifySoulBootstrapPrincipalDeclarationInput,
	VerifySoulBootstrapWalletInput,
} from '$lib/greater/adapters/soul';
