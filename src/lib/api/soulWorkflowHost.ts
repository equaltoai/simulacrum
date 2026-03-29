import { RestRequestError, restRequest } from './rest';

export const SOUL_WORKFLOW_HOST_AUTH_NOTE =
	'lesser-host soul workflow endpoints require a control-plane bearer token; do not call them with the Lesser OAuth bearer token.';

export interface SoulAgentPromotionPrerequisites {
	principal_declaration_recorded: boolean;
	mint_operation_created: boolean;
	mint_executed: boolean;
	conversation_started: boolean;
	conversation_completed: boolean;
	review_draft_ready: boolean;
	ready_for_finalize: boolean;
	graduated: boolean;
}

export interface SoulAgentPromotion {
	agent_id: string;
	registration_id?: string;
	requested_by?: string;
	domain: string;
	local_id: string;
	wallet: string;
	stage: string;
	request_status: string;
	review_status: string;
	approval_status: string;
	readiness_status: string;
	mint_operation_id?: string;
	mint_operation_status?: string;
	principal_address?: string;
	latest_conversation_id?: string;
	latest_conversation_status?: string;
	latest_review_sha256?: string;
	latest_boundary_count?: number;
	latest_capability_count?: number;
	published_version?: number;
	requested_at?: string;
	verified_at?: string;
	approved_at?: string;
	minted_at?: string;
	review_started_at?: string;
	review_ready_at?: string;
	graduated_at?: string;
	created_at: string;
	updated_at: string;
	prerequisites: SoulAgentPromotionPrerequisites;
	next_actions?: string[];
}

export interface SoulAgentPromotionResponse {
	version: string;
	promotion: SoulAgentPromotion;
}

export interface SoulAgentPromotionListResponse {
	version: string;
	promotions: SoulAgentPromotion[];
	count: number;
	has_more: boolean;
	next_cursor?: string;
}

export interface SoulAgentPromotionLifecycleEvent {
	event_id: string;
	event_type: string;
	summary?: string;
	occurred_at: string;
	request_id?: string;
	operation_id?: string;
	conversation_id?: string;
	promotion: SoulAgentPromotion;
}

export interface SoulAgentPromotionLifecycleEventListResponse {
	version: string;
	events: SoulAgentPromotionLifecycleEvent[];
	count: number;
	has_more: boolean;
	next_cursor?: string;
}

export interface SoulMintConversation {
	agent_id: string;
	conversation_id: string;
	model: string;
	messages?: string;
	produced_declarations?: string;
	status: string;
	created_at: string;
	completed_at?: string;
}

export interface SoulAgentMintConversationsResponse {
	version: string;
	conversations: SoulMintConversation[];
	count: number;
}

export interface SoulMintConversationFinalizeBeginResponse {
	version: string;
	digest_hex: string;
	issued_at: string;
	expected_version: number;
	next_version: number;
	declarations_preview: {
		selfDescription: Record<string, unknown>;
		capabilities: Array<Record<string, unknown>>;
		boundaries: Array<Record<string, unknown>>;
		transparency: Record<string, unknown>;
	};
	boundary_requirements: Array<{
		boundary_id: string;
		category: string;
		statement: string;
		rationale?: string;
		supersedes?: string;
		signature_hex?: string;
		signer_wallet: string;
		signing_method: string;
		message_encoding: string;
		message: string;
		digest_hex: string;
	}>;
	self_attestation_signing: {
		signer_wallet: string;
		signing_method: string;
		message_encoding: string;
		message_hex: string;
		digest_hex: string;
		canonical_json: string;
	};
	finalize_request_template: {
		boundary_signatures: Record<string, string>;
		issued_at: string;
		expected_version: number;
		self_attestation: string;
	};
	registration_preview?: unknown;
}

export interface SoulMintConversationFinalizeResponse {
	version: string;
	agent: {
		agent_id: string;
		domain: string;
		local_id: string;
		wallet: string;
		status: string;
		lifecycle_status?: string;
		principal_address?: string;
		self_description_version?: number;
		minted_at?: string;
		updated_at?: string;
	};
	published_version: number;
}

export interface SoulMintConversationSSEInput {
	model?: string;
	conversation_id?: string;
	message: string;
}

type CursorInput = {
	limit?: number;
	cursor?: string;
};

type BoundarySignaturesInput = {
	boundary_signatures: Record<string, string>;
};

type FinalizeInput = BoundarySignaturesInput & {
	issued_at: string;
	expected_version: number;
	self_attestation: string;
};

function requireControlPlaneToken(token: string): string {
	const trimmed = token.trim();
	if (!trimmed) {
		throw new Error('A lesser-host control-plane bearer token is required.');
	}
	return trimmed;
}

function buildQuery(input?: CursorInput): string {
	if (!input) return '';

	const params = new URLSearchParams();
	if (typeof input.limit === 'number') params.set('limit', String(input.limit));
	if (input.cursor) params.set('cursor', input.cursor);
	const query = params.toString();
	return query ? `?${query}` : '';
}

export function isSoulWorkflowHostError(error: unknown): error is RestRequestError {
	return error instanceof RestRequestError;
}

export async function listMyPromotions({
	token,
	input,
	signal,
}: {
	token: string;
	input?: CursorInput;
	signal?: AbortSignal;
}): Promise<SoulAgentPromotionListResponse> {
	return restRequest<SoulAgentPromotionListResponse>({
		path: `/api/v1/soul/promotions/mine${buildQuery(input)}`,
		token: requireControlPlaneToken(token),
		signal,
	});
}

export async function listMyPromotionLifecycleEvents({
	token,
	input,
	signal,
}: {
	token: string;
	input?: CursorInput;
	signal?: AbortSignal;
}): Promise<SoulAgentPromotionLifecycleEventListResponse> {
	return restRequest<SoulAgentPromotionLifecycleEventListResponse>({
		path: `/api/v1/soul/promotions/mine/events${buildQuery(input)}`,
		token: requireControlPlaneToken(token),
		signal,
	});
}

export async function getAgentPromotion({
	token,
	agentId,
	signal,
}: {
	token: string;
	agentId: string;
	signal?: AbortSignal;
}): Promise<SoulAgentPromotionResponse> {
	return restRequest<SoulAgentPromotionResponse>({
		path: `/api/v1/soul/agents/${encodeURIComponent(agentId)}/promotion`,
		token: requireControlPlaneToken(token),
		signal,
	});
}

export async function listAgentPromotionLifecycleEvents({
	token,
	agentId,
	input,
	signal,
}: {
	token: string;
	agentId: string;
	input?: CursorInput;
	signal?: AbortSignal;
}): Promise<SoulAgentPromotionLifecycleEventListResponse> {
	return restRequest<SoulAgentPromotionLifecycleEventListResponse>({
		path: `/api/v1/soul/agents/${encodeURIComponent(agentId)}/promotion/events${buildQuery(input)}`,
		token: requireControlPlaneToken(token),
		signal,
	});
}

export async function listAgentMintConversations({
	token,
	agentId,
	limit,
	signal,
}: {
	token: string;
	agentId: string;
	limit?: number;
	signal?: AbortSignal;
}): Promise<SoulAgentMintConversationsResponse> {
	const query = typeof limit === 'number' ? `?limit=${encodeURIComponent(String(limit))}` : '';

	return restRequest<SoulAgentMintConversationsResponse>({
		path: `/api/v1/soul/agents/${encodeURIComponent(agentId)}/mint-conversations${query}`,
		token: requireControlPlaneToken(token),
		signal,
	});
}

export async function getAgentMintConversation({
	token,
	agentId,
	conversationId,
	signal,
}: {
	token: string;
	agentId: string;
	conversationId: string;
	signal?: AbortSignal;
}): Promise<SoulMintConversation> {
	return restRequest<SoulMintConversation>({
		path: `/api/v1/soul/agents/${encodeURIComponent(agentId)}/mint-conversation/${encodeURIComponent(conversationId)}`,
		token: requireControlPlaneToken(token),
		signal,
	});
}

export async function completeAgentMintConversation({
	token,
	agentId,
	conversationId,
	signal,
}: {
	token: string;
	agentId: string;
	conversationId: string;
	signal?: AbortSignal;
}): Promise<SoulMintConversation> {
	return restRequest<SoulMintConversation>({
		path: `/api/v1/soul/agents/${encodeURIComponent(agentId)}/mint-conversation/${encodeURIComponent(conversationId)}/complete`,
		method: 'POST',
		token: requireControlPlaneToken(token),
		signal,
	});
}

export async function getAgentMintConversationFinalizePreflight({
	token,
	agentId,
	conversationId,
	input,
	signal,
}: {
	token: string;
	agentId: string;
	conversationId: string;
	input: BoundarySignaturesInput;
	signal?: AbortSignal;
}): Promise<SoulMintConversationFinalizeBeginResponse> {
	return restRequest<SoulMintConversationFinalizeBeginResponse>({
		path: `/api/v1/soul/agents/${encodeURIComponent(agentId)}/mint-conversation/${encodeURIComponent(conversationId)}/finalize/preflight`,
		method: 'POST',
		body: input,
		token: requireControlPlaneToken(token),
		signal,
	});
}

export async function finalizeAgentMintConversation({
	token,
	agentId,
	conversationId,
	input,
	signal,
}: {
	token: string;
	agentId: string;
	conversationId: string;
	input: FinalizeInput;
	signal?: AbortSignal;
}): Promise<SoulMintConversationFinalizeResponse> {
	return restRequest<SoulMintConversationFinalizeResponse>({
		path: `/api/v1/soul/agents/${encodeURIComponent(agentId)}/mint-conversation/${encodeURIComponent(conversationId)}/finalize`,
		method: 'POST',
		body: input,
		token: requireControlPlaneToken(token),
		signal,
	});
}

function soulSseErrorMessage(value: unknown, fallback: string): string {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed || fallback;
	}

	if (value == null) return fallback;

	if (typeof value !== 'object') {
		const asString = String(value).trim();
		return asString || fallback;
	}

	const record = value as Record<string, unknown>;
	for (const key of ['message', 'error', 'detail']) {
		const nested = soulSseErrorMessage(record[key], '');
		if (nested) return nested;
	}

	if (typeof record.code === 'string' && record.code.trim()) {
		return record.code.trim();
	}

	try {
		const json = JSON.stringify(value);
		return json && json !== '{}' ? json : fallback;
	} catch {
		return fallback;
	}
}

export function startAgentMintConversationStream({
	token,
	agentId,
	input,
}: {
	token: string;
	agentId: string;
	input: SoulMintConversationSSEInput;
}): ReadableStream<string> {
	const bearer = requireControlPlaneToken(token);
	const controller = new AbortController();
	const path = `/api/v1/soul/agents/${encodeURIComponent(agentId)}/mint-conversation`;
	const body = JSON.stringify(input);

	return new ReadableStream<string>({
		async start(streamController) {
			try {
				const response = await fetch(path, {
					method: 'POST',
					headers: {
						authorization: `Bearer ${bearer}`,
						accept: 'text/event-stream',
						'content-type': 'application/json',
					},
					body,
					signal: controller.signal,
				});

				if (!response.ok || !response.body) {
					const text = await response.text().catch(() => '');
					let message = soulSseErrorMessage(text, `HTTP ${response.status}`);
					try {
						message = soulSseErrorMessage(JSON.parse(text) as unknown, message);
					} catch {
						// Fall back to the raw response text when the body is not JSON.
					}
					streamController.enqueue(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
					streamController.close();
					return;
				}

				const reader = response.body.getReader();
				const decoder = new TextDecoder();

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					streamController.enqueue(decoder.decode(value, { stream: true }));
				}
			} catch (error) {
				if (!controller.signal.aborted) {
					streamController.enqueue(
						`event: error\ndata: ${JSON.stringify({ message: String(error) })}\n\n`
					);
				}
			} finally {
				streamController.close();
			}
		},
		cancel() {
			controller.abort();
		},
	});
}
