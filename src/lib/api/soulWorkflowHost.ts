import {
	LesserHostSoulClientError,
	createLesserHostSoulClient,
	type FetchLike,
	type SoulAgentMintConversationsQuery,
	type SoulAgentMintConversationsResponse,
	type SoulMintConversation,
	type SoulMintConversationCompleteRequest,
	type SoulMintConversationFinalizeBeginRequest,
	type SoulMintConversationFinalizePreflightResponse,
	type SoulMintConversationFinalizeRequest,
	type SoulMintConversationFinalizeResponse,
	type SoulMintConversationSSEInput,
} from '$lib/greater/adapters/soul';
import type { components, operations } from '$lib/greater/adapters/rest/generated/lesser-host-api';

import { RestRequestError } from './rest';

export const SOUL_WORKFLOW_HOST_AUTH_NOTE =
	'lesser-host soul workflow endpoints require a control-plane bearer token; do not call them with the Lesser OAuth bearer token.';

export type SoulAgentPromotionPrerequisites =
	components['schemas']['SoulAgentPromotionPrerequisites'];
type GeneratedSoulAgentPromotion = components['schemas']['SoulAgentPromotion'];
type GeneratedSoulAgentPromotionResponse = components['schemas']['SoulAgentPromotionResponse'];
type GeneratedSoulAgentPromotionListResponse =
	components['schemas']['SoulAgentPromotionListResponse'];
type GeneratedSoulAgentPromotionLifecycleEvent =
	components['schemas']['SoulAgentPromotionLifecycleEvent'];
type GeneratedSoulAgentPromotionLifecycleEventListResponse =
	components['schemas']['SoulAgentPromotionLifecycleEventListResponse'];
export type SoulAgentAnchorState = 'hosted_offchain' | 'immutable_onchain';
export type SoulAgentOnchainBindingStatus =
	| 'unavailable'
	| 'pending'
	| 'proposed'
	| 'executed'
	| 'failed';
export type SoulAgentPromotionNextAction =
	| 'verify_request'
	| 'record_mint_execution'
	| 'start_review_conversation'
	| 'complete_review_conversation'
	| 'begin_finalize';
export type SoulAgentPromotion = Omit<GeneratedSoulAgentPromotion, 'next_actions'> & {
	/**
	 * Project 44 fields are additive in lesser-host and may arrive before the
	 * vendored Greater OpenAPI snapshot is refreshed. Keep the extension local
	 * to Simulacrum rather than hand-editing vendored generated files.
	 */
	anchor_state?: SoulAgentAnchorState;
	onchain_binding_status?: SoulAgentOnchainBindingStatus;
	onchain_binding_available?: boolean;
	hosted_offchain_finalizable?: boolean;
	next_actions?: SoulAgentPromotionNextAction[];
};
export type SoulAgentPromotionResponse = Omit<GeneratedSoulAgentPromotionResponse, 'promotion'> & {
	promotion: SoulAgentPromotion;
};
export type SoulAgentPromotionListResponse = Omit<
	GeneratedSoulAgentPromotionListResponse,
	'promotions'
> & {
	promotions: SoulAgentPromotion[];
};
export type SoulAgentPromotionLifecycleEvent = Omit<
	GeneratedSoulAgentPromotionLifecycleEvent,
	'promotion'
> & {
	promotion: SoulAgentPromotion;
};
export type SoulAgentPromotionLifecycleEventListResponse = Omit<
	GeneratedSoulAgentPromotionLifecycleEventListResponse,
	'events'
> & {
	events: SoulAgentPromotionLifecycleEvent[];
};
export type SoulAgentRegistration = components['schemas']['SoulAgentRegistration'];
export type SoulAgentRegistrationBeginRequest =
	components['schemas']['SoulAgentRegistrationBeginRequest'];
export type SoulAgentRegistrationBeginResponse =
	components['schemas']['SoulAgentRegistrationBeginResponse'];
export type SoulAgentRegistrationVerifyRequest =
	components['schemas']['SoulAgentRegistrationVerifyRequest'];
export type SoulAgentRegistrationVerifyResponse =
	components['schemas']['SoulAgentRegistrationVerifyResponse'];
export type SoulOperation = components['schemas']['SoulOperation'];
export type SafeTxPayload = components['schemas']['SafeTxPayload'];
export type WalletChallengeResponse = components['schemas']['WalletChallengeResponse'];
export type SoulRegistryProofInstructions =
	components['schemas']['SoulRegistryProofInstructions'];
export type SoulWorkflowCursorInput = NonNullable<
	operations['soulListMyPromotions']['parameters']['query']
>;
export type SoulAgentPromotionEventsQuery = NonNullable<
	operations['soulListAgentPromotionLifecycleEvents']['parameters']['query']
>;
export type {
	SoulAgentMintConversationsQuery,
	SoulAgentMintConversationsResponse,
	SoulMintConversation,
	SoulMintConversationCompleteRequest,
	SoulMintConversationFinalizeBeginRequest,
	SoulMintConversationFinalizePreflightResponse,
	SoulMintConversationFinalizeRequest,
	SoulMintConversationFinalizeResponse,
	SoulMintConversationSSEInput,
};

interface WorkflowRequestOptions {
	token: string;
	baseUrl?: string;
	signal?: AbortSignal;
	fetch?: FetchLike;
}

interface RegistrationRequestOptions extends WorkflowRequestOptions {
	registrationId: string;
}

interface AgentRequestOptions extends WorkflowRequestOptions {
	agentId: string;
}

interface ConversationRequestOptions extends WorkflowRequestOptions {
	conversationId: string;
}

const HOST_SOUL_AGENT_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function isHostSoulAgentId(value?: string | null): value is `0x${string}` {
	return HOST_SOUL_AGENT_ID_PATTERN.test(value?.trim() ?? '');
}

function requireControlPlaneToken(token: string): string {
	const trimmed = token.trim();
	if (!trimmed) {
		throw new Error('A lesser-host control-plane bearer token is required.');
	}
	return trimmed;
}

function requireIdentifier(value: string, name: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`${name} is required`);
	}
	return trimmed;
}

function resolveBaseUrl(baseUrl?: string): string {
	const trimmed = baseUrl?.trim();
	if (trimmed) return trimmed;

	if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
		return window.location.origin;
	}

	throw new Error('baseUrl is required outside the browser');
}

function buildQueryPath(pathname: string, query?: SoulWorkflowCursorInput | SoulAgentPromotionEventsQuery): string {
	if (!query) return pathname;

	const searchParams = new URLSearchParams();
	if (typeof query.limit === 'number') {
		searchParams.set('limit', String(query.limit));
	}
	if (query.cursor) {
		searchParams.set('cursor', query.cursor);
	}

	const rendered = searchParams.toString();
	return rendered ? `${pathname}?${rendered}` : pathname;
}

function createRequestFetch(options: WorkflowRequestOptions): FetchLike {
	const requestFetch = options.fetch ?? fetch;

	return (input, init) =>
		requestFetch(input, {
			...init,
			signal: options.signal ?? init?.signal,
		});
}

function createSoulWorkflowHostClient(options: WorkflowRequestOptions) {
	const token = requireControlPlaneToken(options.token);

	return createLesserHostSoulClient({
		baseUrl: resolveBaseUrl(options.baseUrl),
		fetch: createRequestFetch(options),
		headers: {
			authorization: `Bearer ${token}`,
		},
	});
}

async function requestSoulWorkflowJson<T>(
	options: WorkflowRequestOptions & {
		path: string;
		method?: 'GET' | 'POST';
		body?: unknown;
	}
): Promise<T> {
	const headers: Record<string, string> = {
		accept: 'application/json',
		authorization: `Bearer ${requireControlPlaneToken(options.token)}`,
	};

	let body: BodyInit | undefined;
	if (options.body !== undefined) {
		headers['content-type'] = 'application/json';
		body = JSON.stringify(options.body);
	}

	const response = await createRequestFetch(options)(
		new URL(options.path, `${resolveBaseUrl(options.baseUrl)}/`),
		{
			method: options.method ?? 'GET',
			headers,
			body,
		}
	);

	const responseBody = (await response.json().catch(() => null)) as T | null;
	if (!response.ok) {
		throw new RestRequestError(`REST request failed (${response.status})`, {
			status: response.status,
			body: responseBody,
		});
	}

	return (responseBody ?? ({} as T)) as T;
}

function createDecodedEventStream(start: () => Promise<Response>): ReadableStream<string> {
	let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

	return new ReadableStream<string>({
		async start(controller) {
			try {
				const response = await start();
				if (!response.body) {
					throw new Error('Mint conversation stream did not include a response body.');
				}

				reader = response.body.getReader();
				const decoder = new TextDecoder();

				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					controller.enqueue(decoder.decode(value, { stream: true }));
				}

				const tail = decoder.decode();
				if (tail) {
					controller.enqueue(tail);
				}
				controller.close();
			} catch (error) {
				controller.error(error);
			}
		},
		cancel() {
			return reader?.cancel();
		},
	});
}

export function isSoulWorkflowHostError(
	error: unknown
): error is RestRequestError | LesserHostSoulClientError {
	return error instanceof RestRequestError || error instanceof LesserHostSoulClientError;
}

export async function beginSoulAgentRegistration({
	token,
	input,
	baseUrl,
	signal,
	fetch,
}: WorkflowRequestOptions & {
	input: SoulAgentRegistrationBeginRequest;
}): Promise<SoulAgentRegistrationBeginResponse> {
	return requestSoulWorkflowJson<SoulAgentRegistrationBeginResponse>({
		token,
		baseUrl,
		signal,
		fetch,
		path: '/api/v1/soul/agents/register/begin',
		method: 'POST',
		body: input,
	});
}

export async function verifySoulAgentRegistration({
	token,
	registrationId,
	input,
	baseUrl,
	signal,
	fetch,
}: RegistrationRequestOptions & {
	input: SoulAgentRegistrationVerifyRequest;
}): Promise<SoulAgentRegistrationVerifyResponse> {
	return requestSoulWorkflowJson<SoulAgentRegistrationVerifyResponse>({
		token,
		baseUrl,
		signal,
		fetch,
		path: `/api/v1/soul/agents/register/${encodeURIComponent(requireIdentifier(registrationId, 'registrationId'))}/verify`,
		method: 'POST',
		body: input,
	});
}

export async function verifyAgentPromotion({
	token,
	agentId,
	input,
	baseUrl,
	signal,
	fetch,
}: AgentRequestOptions & {
	input: SoulAgentRegistrationVerifyRequest;
}): Promise<SoulAgentRegistrationVerifyResponse> {
	return requestSoulWorkflowJson<SoulAgentRegistrationVerifyResponse>({
		token,
		baseUrl,
		signal,
		fetch,
		path: `/api/v1/soul/agents/${encodeURIComponent(requireIdentifier(agentId, 'agentId'))}/promotion/verify`,
		method: 'POST',
		body: input,
	});
}

export async function listMyPromotions({
	token,
	input,
	baseUrl,
	signal,
	fetch,
}: WorkflowRequestOptions & {
	input?: SoulWorkflowCursorInput;
}): Promise<SoulAgentPromotionListResponse> {
	return requestSoulWorkflowJson<SoulAgentPromotionListResponse>({
		token,
		baseUrl,
		signal,
		fetch,
		path: buildQueryPath('/api/v1/soul/promotions/mine', input),
	});
}

export async function listMyPromotionLifecycleEvents({
	token,
	input,
	baseUrl,
	signal,
	fetch,
}: WorkflowRequestOptions & {
	input?: SoulWorkflowCursorInput;
}): Promise<SoulAgentPromotionLifecycleEventListResponse> {
	return requestSoulWorkflowJson<SoulAgentPromotionLifecycleEventListResponse>({
		token,
		baseUrl,
		signal,
		fetch,
		path: buildQueryPath('/api/v1/soul/promotions/mine/events', input),
	});
}

export async function getAgentPromotion({
	token,
	agentId,
	baseUrl,
	signal,
	fetch,
}: AgentRequestOptions): Promise<SoulAgentPromotionResponse> {
	return requestSoulWorkflowJson<SoulAgentPromotionResponse>({
		token,
		baseUrl,
		signal,
		fetch,
		path: `/api/v1/soul/agents/${encodeURIComponent(requireIdentifier(agentId, 'agentId'))}/promotion`,
	});
}

export async function listAgentPromotionLifecycleEvents({
	token,
	agentId,
	input,
	baseUrl,
	signal,
	fetch,
}: AgentRequestOptions & {
	input?: SoulAgentPromotionEventsQuery;
}): Promise<SoulAgentPromotionLifecycleEventListResponse> {
	return requestSoulWorkflowJson<SoulAgentPromotionLifecycleEventListResponse>({
		token,
		baseUrl,
		signal,
		fetch,
		path: buildQueryPath(
			`/api/v1/soul/agents/${encodeURIComponent(requireIdentifier(agentId, 'agentId'))}/promotion/events`,
			input
		),
	});
}

export async function listAgentMintConversations({
	token,
	agentId,
	input,
	baseUrl,
	signal,
	fetch,
}: AgentRequestOptions & {
	input?: SoulAgentMintConversationsQuery;
}): Promise<SoulAgentMintConversationsResponse> {
	return createSoulWorkflowHostClient({ token, baseUrl, signal, fetch }).listAgentMintConversations(
		requireIdentifier(agentId, 'agentId'),
		input
	);
}

export function startMintConversationStream({
	token,
	registrationId,
	input,
	baseUrl,
	signal,
	fetch,
}: RegistrationRequestOptions & {
	input: SoulMintConversationSSEInput;
}): ReadableStream<string> {
	return createDecodedEventStream(() =>
		createSoulWorkflowHostClient({ token, baseUrl, signal, fetch }).startMintConversationStream(
			requireIdentifier(registrationId, 'registrationId'),
			input
		)
	);
}

export async function getMintConversation({
	token,
	registrationId,
	conversationId,
	baseUrl,
	signal,
	fetch,
}: RegistrationRequestOptions &
	ConversationRequestOptions): Promise<SoulMintConversation> {
	return createSoulWorkflowHostClient({ token, baseUrl, signal, fetch }).getMintConversation(
		requireIdentifier(registrationId, 'registrationId'),
		requireIdentifier(conversationId, 'conversationId')
	);
}

export async function completeMintConversation({
	token,
	registrationId,
	conversationId,
	input = {},
	baseUrl,
	signal,
	fetch,
}: RegistrationRequestOptions &
	ConversationRequestOptions & {
		input?: SoulMintConversationCompleteRequest;
	}): Promise<SoulMintConversation> {
	return createSoulWorkflowHostClient({ token, baseUrl, signal, fetch }).completeMintConversation(
		requireIdentifier(registrationId, 'registrationId'),
		requireIdentifier(conversationId, 'conversationId'),
		input
	);
}

export async function getMintConversationFinalizePreflight({
	token,
	registrationId,
	conversationId,
	input,
	baseUrl,
	signal,
	fetch,
}: RegistrationRequestOptions &
	ConversationRequestOptions & {
		input: SoulMintConversationFinalizeBeginRequest;
	}): Promise<SoulMintConversationFinalizePreflightResponse> {
	return createSoulWorkflowHostClient({ token, baseUrl, signal, fetch }).buildMintConversationFinalizePreflight(
		requireIdentifier(registrationId, 'registrationId'),
		requireIdentifier(conversationId, 'conversationId'),
		input
	);
}

export async function finalizeMintConversation({
	token,
	registrationId,
	conversationId,
	input,
	baseUrl,
	signal,
	fetch,
}: RegistrationRequestOptions &
	ConversationRequestOptions & {
		input: SoulMintConversationFinalizeRequest;
	}): Promise<SoulMintConversationFinalizeResponse> {
	return createSoulWorkflowHostClient({ token, baseUrl, signal, fetch }).finalizeMintConversation(
		requireIdentifier(registrationId, 'registrationId'),
		requireIdentifier(conversationId, 'conversationId'),
		input
	);
}

export function startAgentMintConversationStream({
	token,
	agentId,
	input,
	baseUrl,
	signal,
	fetch,
}: AgentRequestOptions & {
	input: SoulMintConversationSSEInput;
}): ReadableStream<string> {
	return createDecodedEventStream(() =>
		createSoulWorkflowHostClient({ token, baseUrl, signal, fetch }).startAgentMintConversationStream(
			requireIdentifier(agentId, 'agentId'),
			input
		)
	);
}

export async function getAgentMintConversation({
	token,
	agentId,
	conversationId,
	baseUrl,
	signal,
	fetch,
}: AgentRequestOptions &
	ConversationRequestOptions): Promise<SoulMintConversation> {
	return createSoulWorkflowHostClient({ token, baseUrl, signal, fetch }).getAgentMintConversation(
		requireIdentifier(agentId, 'agentId'),
		requireIdentifier(conversationId, 'conversationId')
	);
}

export async function completeAgentMintConversation({
	token,
	agentId,
	conversationId,
	input = {},
	baseUrl,
	signal,
	fetch,
}: AgentRequestOptions &
	ConversationRequestOptions & {
		input?: SoulMintConversationCompleteRequest;
	}): Promise<SoulMintConversation> {
	return createSoulWorkflowHostClient({ token, baseUrl, signal, fetch }).completeAgentMintConversation(
		requireIdentifier(agentId, 'agentId'),
		requireIdentifier(conversationId, 'conversationId'),
		input
	);
}

export async function getAgentMintConversationFinalizePreflight({
	token,
	agentId,
	conversationId,
	input,
	baseUrl,
	signal,
	fetch,
}: AgentRequestOptions &
	ConversationRequestOptions & {
		input: SoulMintConversationFinalizeBeginRequest;
	}): Promise<SoulMintConversationFinalizePreflightResponse> {
	return createSoulWorkflowHostClient({ token, baseUrl, signal, fetch }).buildAgentMintConversationFinalizePreflight(
		requireIdentifier(agentId, 'agentId'),
		requireIdentifier(conversationId, 'conversationId'),
		input
	);
}

export async function finalizeAgentMintConversation({
	token,
	agentId,
	conversationId,
	input,
	baseUrl,
	signal,
	fetch,
}: AgentRequestOptions &
	ConversationRequestOptions & {
		input: SoulMintConversationFinalizeRequest;
	}): Promise<SoulMintConversationFinalizeResponse> {
	return createSoulWorkflowHostClient({ token, baseUrl, signal, fetch }).finalizeAgentMintConversation(
		requireIdentifier(agentId, 'agentId'),
		requireIdentifier(conversationId, 'conversationId'),
		input
	);
}
