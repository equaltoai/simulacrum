import {
	SoulBootstrapClientError,
	createHostedSoulBootstrapClient,
	createSoulBootstrapClient,
	normalizeSoulBootstrapError,
	type BeginSoulBootstrapInput,
	type CompleteHostedSoulGenesisInput,
	type CompleteSoulBootstrapConversationInput,
	type FinalizeSoulBootstrapInput,
	type HostedSoulBootstrapClient,
	type HostedSoulBootstrapMutationResult,
	type HostedSoulBootstrapResult,
	type PrepareSoulBootstrapFinalizeInput,
	type PrepareSoulBootstrapPrincipalDeclarationInput,
	type PublishHostedSoulInput,
	type RestartSoulBootstrapInput,
	type SendHostedSoulGenesisMessageInput,
	type SendSoulBootstrapConversationMessageInput,
	type SoulBootstrapClient,
	type SoulBootstrapMutationResult,
	type StartHostedSoulBootstrapInput,
	type VerifySoulBootstrapPrincipalDeclarationInput,
	type VerifySoulBootstrapWalletInput,
} from '$lib/greater/adapters/soul';

import { getAccessToken } from './auth';

export const SOUL_BOOTSTRAP_AUTH_NOTE =
	'Hosted/off-chain soul definition uses Lesser same-origin GraphQL. Lesser performs server-side Host instance-trust calls, so Simulacrum never asks the browser for wallets, signing prompts, lesser-host control-plane tokens, or Host instance keys on the default path.';

export const SOUL_BOOTSTRAP_LEGACY_SIGNING_NOTE =
	'Wallet/principal/finalize signing remains an explicit assurance-upgrade or legacy recovery surface; it is not the default hosted/off-chain creation path.';

export interface SoulBootstrapRequestOptions {
	endpoint?: string;
	token?: string | null;
	signal?: AbortSignal;
	fetch?: typeof fetch;
}

export interface SoulBootstrapCurrentOptions extends SoulBootstrapRequestOptions {
	username: string;
}

function requireAccessToken(token?: string | null): string {
	const resolved = token?.trim() || getAccessToken();
	if (!resolved) throw new Error('Not authenticated');
	return resolved;
}

function createRequestFetch(signal?: AbortSignal, fetchLike: typeof fetch = fetch) {
	return (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
		fetchLike(input, {
			...init,
			signal: signal ?? init?.signal,
		});
}

export function createProject44HostedSoulBootstrapClient({
	endpoint = '/api/graphql',
	token,
	signal,
	fetch: fetchLike,
}: SoulBootstrapRequestOptions = {}): HostedSoulBootstrapClient {
	return createHostedSoulBootstrapClient({
		httpEndpoint: endpoint,
		token: requireAccessToken(token),
		fetch: createRequestFetch(signal, fetchLike),
	});
}

export function createProject44SoulBootstrapClient({
	endpoint = '/api/graphql',
	token,
	signal,
	fetch: fetchLike,
}: SoulBootstrapRequestOptions = {}): SoulBootstrapClient {
	return createSoulBootstrapClient({
		httpEndpoint: endpoint,
		token: requireAccessToken(token),
		fetch: createRequestFetch(signal, fetchLike),
	});
}

export async function fetchSoulBootstrapSurface({
	username,
	...options
}: SoulBootstrapCurrentOptions): Promise<HostedSoulBootstrapResult> {
	return createProject44HostedSoulBootstrapClient(options).current({ username });
}

export async function startHostedSoulBootstrap({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: StartHostedSoulBootstrapInput;
}): Promise<HostedSoulBootstrapMutationResult> {
	return createProject44HostedSoulBootstrapClient(options).startHostedSoulBootstrap(input);
}

export async function sendHostedSoulGenesisMessage({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: SendHostedSoulGenesisMessageInput;
}): Promise<HostedSoulBootstrapMutationResult> {
	return createProject44HostedSoulBootstrapClient(options).sendHostedSoulGenesisMessage(input);
}

export async function completeHostedSoulGenesis({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: CompleteHostedSoulGenesisInput;
}): Promise<HostedSoulBootstrapMutationResult> {
	return createProject44HostedSoulBootstrapClient(options).completeHostedSoulGenesis(input);
}

export async function publishHostedSoul({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: PublishHostedSoulInput;
}): Promise<HostedSoulBootstrapMutationResult> {
	return createProject44HostedSoulBootstrapClient(options).publishHostedSoul(input);
}

export async function restartSoulBootstrap({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: RestartSoulBootstrapInput;
}): Promise<HostedSoulBootstrapMutationResult> {
	return createProject44HostedSoulBootstrapClient(options).restartSoulBootstrap(input);
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
	CompleteHostedSoulGenesisInput,
	CompleteSoulBootstrapConversationInput,
	FinalizeSoulBootstrapInput,
	HostedSoulBootstrapActionableError,
	HostedSoulBootstrapAvailableAction,
	HostedSoulBootstrapBoundSoulEvidence,
	HostedSoulBootstrapClient,
	HostedSoulBootstrapHostRequestMetadata,
	HostedSoulBootstrapMutationResult,
	HostedSoulBootstrapNextAction,
	HostedSoulBootstrapRecoveryAction,
	HostedSoulBootstrapRecoveryCategory,
	HostedSoulBootstrapResult,
	HostedSoulBootstrapStateModel,
	HostedSoulGenesisComposerState,
	HostedSoulGenesisConversationMessage,
	HostedSoulGenesisConversationTranscript,
	PrepareSoulBootstrapFinalizeInput,
	PrepareSoulBootstrapPrincipalDeclarationInput,
	PublishHostedSoulInput,
	RestartSoulBootstrapInput,
	SendHostedSoulGenesisMessageInput,
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
	StartHostedSoulBootstrapInput,
	VerifySoulBootstrapPrincipalDeclarationInput,
	VerifySoulBootstrapWalletInput,
} from '$lib/greater/adapters/soul';
