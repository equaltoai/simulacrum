export const GENESIS_CONVERSATION_STORAGE_KEY = 'sim:genesis-conversation:v2';

export type GenesisConversationRole = 'user' | 'assistant' | 'system';
export type GenesisConversationMessageStatus = 'pending' | 'streaming' | 'complete' | 'error';
export type GenesisConversationTurnStatus = 'ready' | 'waiting' | 'stuck' | 'error';

export interface GenesisConversationMessageMoment {
	id: string;
	kind: 'artifact' | 'checkpoint' | 'action-request';
	title: string;
	summary?: string;
	phase?: string;
	tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'critical';
	artifactLabel?: string;
	facts?: string[];
	status?: 'queued' | 'ready' | 'blocked' | 'approved';
	detail?: string;
	actionLabel?: string;
}

export interface GenesisConversationWorkflowMetadata {
	kind: 'declaration';
	statement: string;
	confidence: string;
	scope?: string[];
}

export interface GenesisConversationMessage {
	id: string;
	role: GenesisConversationRole;
	content: string;
	createdAt: string;
	status: GenesisConversationMessageStatus;
	truncated?: boolean;
	error?: string;
	moments?: readonly GenesisConversationMessageMoment[];
	workflowMetadata?: readonly GenesisConversationWorkflowMetadata[];
}

export interface GenesisConversationRecord {
	id: string;
	remoteConversationId: string | null;
	registrationId: string | null;
	activeBodyId: string | null;
	activeDroneUsername: string | null;
	title: string;
	messages: readonly GenesisConversationMessage[];
	messagesTruncated: boolean;
	turnStatus: GenesisConversationTurnStatus;
	canSendMessage: boolean;
	reconciliationPending: boolean;
	pendingAssistantMessageId: string | null;
	createdAt: string;
	updatedAt: string;
	lastPolledAt: string | null;
}

export interface GenesisConversationSummary {
	id: string;
	title: string;
	turnStatus: GenesisConversationTurnStatus;
	messageCount: number;
	updatedAt: string;
	activeDroneUsername: string | null;
}

export interface StartGenesisConversationInput {
	activeBodyId?: string | null;
	activeDroneUsername?: string | null;
	title?: string;
}

export interface SendGenesisConversationMessageInput {
	conversationId?: string | null;
	content: string;
}

export interface GenesisConversationApi {
	startConversation(input?: StartGenesisConversationInput): Promise<GenesisConversationRecord>;
	listConversations(): Promise<GenesisConversationSummary[]>;
	loadActiveConversation(): Promise<GenesisConversationRecord | null>;
	loadConversation(conversationId: string): Promise<GenesisConversationRecord | null>;
	sendMessage(input: SendGenesisConversationMessageInput): Promise<GenesisConversationRecord>;
	pollConversation(conversationId: string): Promise<GenesisConversationRecord | null>;
	recoverStuckTurn(conversationId: string): Promise<GenesisConversationRecord | null>;
}

export interface GenesisConversationStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

interface PendingGenesisTurn {
	userMessageId: string;
	assistantMessageId: string;
	userContent: string;
	turnIndex: number;
	startedAtMs: number;
	dueAtMs: number | null;
	attempts: number;
}

interface StoredGenesisConversation extends Omit<GenesisConversationRecord, 'messages'> {
	messages: GenesisConversationMessage[];
	pendingTurn: PendingGenesisTurn | null;
}

interface StoredGenesisState {
	activeConversationId: string | null;
	conversations: Record<string, StoredGenesisConversation>;
	nextSequence: number;
}

export interface GenesisConversationMockOptions {
	storage?: GenesisConversationStorage;
	now?: () => number;
	responseDelayMs?: number;
	stuckTurnPattern?: RegExp;
}

const DEFAULT_RESPONSE_DELAY_MS = 120;
const DEFAULT_STUCK_TURN_PATTERN = /\b(stuck|stall|hang)\b|\[stuck\]/i;

function initialState(): StoredGenesisState {
	return {
		activeConversationId: null,
		conversations: {},
		nextSequence: 0,
	};
}

function cloneConversation(conversation: StoredGenesisConversation): GenesisConversationRecord {
	return {
		id: conversation.id,
		remoteConversationId: conversation.remoteConversationId ?? conversation.id,
		registrationId: conversation.registrationId ?? null,
		activeBodyId: conversation.activeBodyId,
		activeDroneUsername: conversation.activeDroneUsername,
		title: conversation.title,
		messages: conversation.messages.map((message) => ({
			...message,
			moments: message.moments ? message.moments.map((moment) => ({ ...moment })) : undefined,
			workflowMetadata: message.workflowMetadata
				? message.workflowMetadata.map((metadata) => ({ ...metadata }))
				: undefined,
		})),
		messagesTruncated: conversation.messagesTruncated ?? false,
		turnStatus: conversation.turnStatus,
		canSendMessage: conversation.canSendMessage ?? conversation.turnStatus === 'ready',
		reconciliationPending: conversation.reconciliationPending ?? false,
		pendingAssistantMessageId: conversation.pendingAssistantMessageId,
		createdAt: conversation.createdAt,
		updatedAt: conversation.updatedAt,
		lastPolledAt: conversation.lastPolledAt,
	};
}

function conversationListTitle(conversation: StoredGenesisConversation): string {
	const title = conversation.title.trim();
	if (title && title !== 'Genesis conversation') return title;

	const firstUserMessage = conversation.messages.find(
		(message) => message.role === 'user' && message.content.trim()
	);
	if (firstUserMessage) return excerpt(firstUserMessage.content);

	return title || 'New genesis conversation';
}

function cloneConversationSummary(
	conversation: StoredGenesisConversation
): GenesisConversationSummary {
	return {
		id: conversation.id,
		title: conversationListTitle(conversation),
		turnStatus: conversation.turnStatus,
		messageCount: conversation.messages.length,
		updatedAt: conversation.updatedAt,
		activeDroneUsername: conversation.activeDroneUsername,
	};
}

function sortConversationsByUpdatedAt(
	conversations: readonly GenesisConversationSummary[]
): GenesisConversationSummary[] {
	return [...conversations].sort((left, right) => {
		const leftTime = Date.parse(left.updatedAt);
		const rightTime = Date.parse(right.updatedAt);
		const leftSort = Number.isFinite(leftTime) ? leftTime : 0;
		const rightSort = Number.isFinite(rightTime) ? rightTime : 0;
		return rightSort - leftSort || right.id.localeCompare(left.id);
	});
}

function createVolatileStorage(): GenesisConversationStorage {
	const entries = new Map<string, string>();
	return {
		getItem(key: string) {
			return entries.get(key) ?? null;
		},
		setItem(key: string, value: string) {
			entries.set(key, value);
		},
		removeItem(key: string) {
			entries.delete(key);
		},
	};
}

export function createMemoryGenesisConversationStorage(): GenesisConversationStorage {
	return createVolatileStorage();
}

function browserStorage(): GenesisConversationStorage {
	if (typeof window !== 'undefined' && window.localStorage) {
		return window.localStorage;
	}
	return createVolatileStorage();
}

function parseStoredState(raw: string | null): StoredGenesisState {
	if (!raw) return initialState();
	try {
		const parsed = JSON.parse(raw) as Partial<StoredGenesisState>;
		return {
			activeConversationId:
				typeof parsed.activeConversationId === 'string' ? parsed.activeConversationId : null,
			conversations:
				parsed.conversations && typeof parsed.conversations === 'object'
					? (parsed.conversations as Record<string, StoredGenesisConversation>)
					: {},
			nextSequence: Number.isFinite(parsed.nextSequence) ? Number(parsed.nextSequence) : 0,
		};
	} catch {
		return initialState();
	}
}

function nextId(state: StoredGenesisState, prefix: string, nowMs: number): string {
	state.nextSequence += 1;
	return `${prefix}-${nowMs.toString(36)}-${state.nextSequence.toString(36)}`;
}

function iso(nowMs: number): string {
	return new Date(nowMs).toISOString();
}

function excerpt(content: string): string {
	const normalized = content.replace(/\s+/g, ' ').trim();
	if (normalized.length <= 92) return normalized;
	return `${normalized.slice(0, 89).trimEnd()}…`;
}

function assistantResponseFor(turn: PendingGenesisTurn): string {
	const quoted = excerpt(turn.userContent);
	if (turn.attempts > 0) {
		return `Genesis assistant: I recovered the turn without losing the transcript. I preserved “${quoted}” and resumed the declaration thread from the existing conversation.`;
	}

	if (turn.turnIndex <= 1) {
		return `Genesis assistant: I heard “${quoted}”. Start by naming the accountable purpose, the boundary this soul will not cross, and the continuity signal that should survive graduation.`;
	}

	if (turn.turnIndex === 2) {
		return `Genesis assistant: Follow-up accepted. I added “${quoted}” as a boundary signal and kept the conversation open for another refinement turn.`;
	}

	return `Genesis assistant: Turn ${turn.turnIndex} is recorded. I folded “${quoted}” into the working soul declaration while preserving the earlier context.`;
}

function assistantMomentsFor(turn: PendingGenesisTurn): GenesisConversationMessageMoment[] {
	if (turn.turnIndex <= 1) {
		return [
			{
				id: `moment-${turn.assistantMessageId}-frame`,
				kind: 'checkpoint',
				title: 'Declaration frame opened',
				summary: 'The assistant is collecting purpose, boundaries, and continuity cues.',
				status: 'queued',
				phase: 'genesis.conversation',
				tone: 'accent',
			},
		];
	}

	return [
		{
			id: `moment-${turn.assistantMessageId}-artifact`,
			kind: 'artifact',
			title: 'Draft declaration expanded',
			summary: 'The follow-up turn was attached to the same local conversation.',
			artifactLabel: 'working declaration',
			facts: ['multi-turn transcript preserved', 'no Host or Lesser call required by the mock'],
			phase: 'genesis.conversation',
			tone: 'success',
		},
	];
}

function assistantMetadataFor(turn: PendingGenesisTurn): GenesisConversationWorkflowMetadata[] {
	if (turn.turnIndex < 2) return [];
	return [
		{
			kind: 'declaration',
			statement: 'The local mock conversation has enough context to draft a provisional soul declaration.',
			confidence: 'mock-high',
			scope: ['purpose', 'boundary', 'continuity'],
		},
	];
}

function completePendingTurn(conversation: StoredGenesisConversation, nowMs: number) {
	const pending = conversation.pendingTurn;
	if (!pending) return;
	if (pending.dueAtMs == null || nowMs < pending.dueAtMs) return;

	const assistant = conversation.messages.find((message) => message.id === pending.assistantMessageId);
	if (!assistant) {
		conversation.turnStatus = 'error';
		conversation.canSendMessage = false;
		conversation.pendingAssistantMessageId = null;
		conversation.pendingTurn = null;
		conversation.updatedAt = iso(nowMs);
		return;
	}

	assistant.content = assistantResponseFor(pending);
	assistant.status = 'complete';
	assistant.moments = assistantMomentsFor(pending);
	assistant.workflowMetadata = assistantMetadataFor(pending);
	conversation.turnStatus = 'ready';
	conversation.canSendMessage = true;
	conversation.pendingAssistantMessageId = null;
	conversation.pendingTurn = null;
	conversation.updatedAt = iso(nowMs);
}

export function createGenesisConversationMockApi({
	storage = browserStorage(),
	now = () => Date.now(),
	responseDelayMs = DEFAULT_RESPONSE_DELAY_MS,
	stuckTurnPattern = DEFAULT_STUCK_TURN_PATTERN,
}: GenesisConversationMockOptions = {}): GenesisConversationApi {
	function read(): StoredGenesisState {
		return parseStoredState(storage.getItem(GENESIS_CONVERSATION_STORAGE_KEY));
	}

	function write(state: StoredGenesisState) {
		storage.setItem(GENESIS_CONVERSATION_STORAGE_KEY, JSON.stringify(state));
	}

	async function pollExisting(state: StoredGenesisState, conversationId: string) {
		const conversation = state.conversations[conversationId];
		if (!conversation) return null;
		const nowMs = now();
		conversation.lastPolledAt = iso(nowMs);
		completePendingTurn(conversation, nowMs);
		write(state);
		return cloneConversation(conversation);
	}

	return {
		async startConversation(input: StartGenesisConversationInput = {}) {
			const state = read();
			const nowMs = now();
			const id = nextId(state, 'genesis', nowMs);
			const createdAt = iso(nowMs);
			const activeDroneUsername = input.activeDroneUsername?.trim() || null;
			const conversation: StoredGenesisConversation = {
				id,
				remoteConversationId: id,
				registrationId: null,
				activeBodyId: input.activeBodyId?.trim() || null,
				activeDroneUsername,
				title: input.title?.trim() || 'Genesis conversation',
				messages: [
					{
						id: nextId(state, 'system', nowMs),
						role: 'system',
						content: activeDroneUsername
							? `Local mock started for @${activeDroneUsername}. Shape the soul declaration through conversation.`
							: 'Local mock started. Shape the soul declaration through conversation.',
						createdAt,
						status: 'complete',
					},
				],
				messagesTruncated: false,
				turnStatus: 'ready',
				canSendMessage: true,
				reconciliationPending: false,
				pendingAssistantMessageId: null,
				pendingTurn: null,
				createdAt,
				updatedAt: createdAt,
				lastPolledAt: null,
			};
			state.conversations[id] = conversation;
			state.activeConversationId = id;
			write(state);
			return cloneConversation(conversation);
		},

		async listConversations() {
			const state = read();
			const nowMs = now();
			for (const stored of Object.values(state.conversations)) {
				completePendingTurn(stored, nowMs);
			}
			write(state);
			return sortConversationsByUpdatedAt(
				Object.values(state.conversations).map(cloneConversationSummary)
			);
		},

		async loadActiveConversation() {
			const state = read();
			const id = state.activeConversationId;
			if (!id) return null;
			return pollExisting(state, id);
		},

		async loadConversation(conversationId: string) {
			const state = read();
			if (state.conversations[conversationId]) {
				state.activeConversationId = conversationId;
			}
			return pollExisting(state, conversationId);
		},

		async sendMessage({ conversationId, content }: SendGenesisConversationMessageInput) {
			const draft = content.trim();
			if (!draft) {
				throw new Error('Message content is required.');
			}

			const state = read();
			const resolvedConversationId = conversationId || state.activeConversationId;
			if (!resolvedConversationId) {
				throw new Error('Start or choose a genesis conversation first.');
			}
			const conversation = state.conversations[resolvedConversationId];
			if (!conversation) {
				throw new Error(`Genesis conversation ${resolvedConversationId} was not found.`);
			}
			if (conversation.pendingTurn) {
				throw new Error('Wait for the assistant response or recover the stuck turn before sending again.');
			}

			const nowMs = now();
			const createdAt = iso(nowMs);
			const userMessageId = nextId(state, 'user', nowMs);
			const assistantMessageId = nextId(state, 'assistant', nowMs);
			const turnIndex =
				conversation.messages.filter((message) => message.role === 'user').length + 1;
			const shouldStick = stuckTurnPattern.test(draft);

			conversation.messages.push(
				{
					id: userMessageId,
					role: 'user',
					content: draft,
					createdAt,
					status: 'complete',
				},
				{
					id: assistantMessageId,
					role: 'assistant',
					content: shouldStick
						? 'The genesis assistant turn is waiting for recovery…'
						: 'Thinking through the soul declaration…',
					createdAt,
					status: 'streaming',
				}
			);
			conversation.pendingTurn = {
				userMessageId,
				assistantMessageId,
				userContent: draft,
				turnIndex,
				startedAtMs: nowMs,
				dueAtMs: shouldStick ? null : nowMs + responseDelayMs,
				attempts: 0,
			};
			conversation.pendingAssistantMessageId = assistantMessageId;
			conversation.turnStatus = shouldStick ? 'stuck' : 'waiting';
			conversation.canSendMessage = false;
			conversation.updatedAt = createdAt;
			state.activeConversationId = conversation.id;
			write(state);
			return cloneConversation(conversation);
		},

		async pollConversation(conversationId: string) {
			const state = read();
			return pollExisting(state, conversationId);
		},

		async recoverStuckTurn(conversationId: string) {
			const state = read();
			const conversation = state.conversations[conversationId];
			if (!conversation) return null;
			const pending = conversation.pendingTurn;
			if (!pending) {
				return pollExisting(state, conversationId);
			}

			const nowMs = now();
			pending.attempts += 1;
			pending.dueAtMs = nowMs + Math.max(20, Math.min(responseDelayMs, 80));
			const assistant = conversation.messages.find(
				(message) => message.id === pending.assistantMessageId
			);
			if (assistant) {
				assistant.content = 'Retrying the genesis assistant turn from the stored transcript…';
				assistant.status = 'streaming';
			}
			conversation.turnStatus = 'waiting';
			conversation.canSendMessage = false;
			conversation.updatedAt = iso(nowMs);
			write(state);
			return cloneConversation(conversation);
		},
	};
}

// ---------------------------------------------------------------------------
// GraphQL API implementation (Project 51 — wire mock to real Lesser GraphQL)
// ---------------------------------------------------------------------------
//
// The mock above stays for browser tests. The implementation below calls the
// real Lesser same-origin GraphQL surface through the existing
// HostedSoulBootstrapClient. All calls go to /api/graphql; no direct Host or
// AWS calls ever leave the browser.

import type {
	HostedGenesisConversationSummary,
	HostedSoulBootstrapAvailableAction,
	HostedSoulBootstrapClient,
	HostedSoulBootstrapResult,
	HostedSoulGenesisConversationMessage,
	HostedSoulGenesisConversationTranscript,
	RecoverHostedSoulGenesisTurnInput,
	SendHostedSoulGenesisMessageInput,
	StartHostedSoulBootstrapInput,
} from './soulBootstrap';

/** Heuristic: if the conversation has been in_progress this long without an
 * assistant response, treat the turn as stuck so the UI can offer recovery. */
const DEFAULT_STUCK_TIMEOUT_MS = 60_000;

export interface GenesisConversationGraphQLApiOptions {
	username: string;
	endpoint?: string;
	token?: string | null;
	signal?: AbortSignal;
	fetch?: typeof fetch;
	now?: () => number;
	stuckTimeoutMs?: number;
	operationStorage?: GenesisConversationStorage;
	createOperationKey?: (purpose: 'start' | 'send') => string;
}

interface GenesisOperationToken {
	key: string;
	fingerprint: string;
	baseline?: GenesisSendBaselineEvidence;
}

interface GenesisSendBaselineEvidence {
	remoteConversationId: string | null;
	registrationId: string | null;
	messageEvidence: string;
}

function genesisOperationFingerprint(value: string): string {
	let hash = 14695981039346656037n;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= BigInt(value.charCodeAt(index));
		hash = BigInt.asUintN(64, hash * 1099511628211n);
	}
	return `${value.length}-${hash.toString(16).padStart(16, '0')}`;
}

function createGenesisOperationKey(purpose: 'start' | 'send'): string {
	const randomId =
		typeof globalThis.crypto !== 'undefined' &&
		typeof globalThis.crypto.randomUUID === 'function'
			? globalThis.crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	return `sim-genesis-${purpose}-${randomId}`;
}

function browserSessionStorage(): GenesisConversationStorage {
	if (typeof window !== 'undefined') {
		try {
			if (window.sessionStorage) return window.sessionStorage;
		} catch {
			// Fall through to volatile storage in hardened/private contexts.
		}
	}
	return createVolatileStorage();
}

/**
 * Map a hosted-genesis GraphQL message to the GenesisConversationMessage shape
 * the UI expects. Exported for unit testing.
 */
export function mapHostedGenesisMessage(
	message: HostedSoulGenesisConversationMessage
): GenesisConversationMessage {
	const role = message.role === 'USER' ? 'user' : 'assistant';
	return {
		id: message.id,
		role,
		content: message.content,
		createdAt: message.createdAt ?? new Date(0).toISOString(),
		status: 'complete',
		truncated: message.truncated,
	};
}

/**
 * Derive the UI turn status from a HostedSoulBootstrapResult. Exported for
 * unit testing.
 *
 * The mapping uses availableActions as the primary signal: if Lesser
 * advertises SEND_HOSTED_SOUL_GENESIS_MESSAGE the user can send → 'ready'.
 * Otherwise the conversation status determines waiting vs. stuck vs. error.
 */
export function deriveTurnStatusFromHostedResult(
	result: HostedSoulBootstrapResult,
	nowMs: number,
	stuckTimeoutMs: number = DEFAULT_STUCK_TIMEOUT_MS
): GenesisConversationTurnStatus {
	const conversation = result.hostedGenesisConversation;
	const status = conversation?.status ?? null;

	if (status === 'failed') return 'error';

	if (status === 'in_progress' || status === 'created') {
		const updatedAtMs = conversation?.updatedAt
			? Date.parse(conversation.updatedAt)
			: Number.NaN;
		if (Number.isFinite(updatedAtMs) && nowMs - updatedAtMs > stuckTimeoutMs) {
			return 'stuck';
		}
		return 'waiting';
	}

	if (
		status === 'declaration_extraction_pending'
	) {
		return 'waiting';
	}

	const canSend = result.availableActions.includes('SEND_HOSTED_SOUL_GENESIS_MESSAGE');
	if (canSend) return 'ready';

	if (status === 'registration_active_no_conversation') return 'waiting';

	// assistant_turn_ready, declaration_ready, published_bound, no_registration,
	// and any unknown status default to ready.
	return 'ready';
}

/**
 * Map a HostedSoulBootstrapResult to a GenesisConversationRecord. A
 * registration-active response without a transcript becomes an empty,
 * send-capable first-message draft; responses without either a registration or
 * transcript return null. Exported for unit testing.
 *
 * When the conversation is in_progress and the last transcript message is from
 * the user, a synthetic streaming assistant message is appended so the UI can
 * show a "thinking" indicator and disable the compose input.
 */
export function mapHostedResultToGenesisRecord(
	result: HostedSoulBootstrapResult,
	options: { now?: () => number; stuckTimeoutMs?: number; lastPolledAt?: string | null } = {}
): GenesisConversationRecord | null {
	const conversation = result.hostedGenesisConversation;
	const state = result.state;
	if (!state) return null;

	const nowMs = options.now?.() ?? Date.now();
	const stuckTimeoutMs = options.stuckTimeoutMs ?? DEFAULT_STUCK_TIMEOUT_MS;
	const registrationId = state.hostRegistrationId?.trim() || null;
	const remoteConversationId = state.hostConversationId?.trim() || null;

	if (!conversation) {
		const canStartFirstTurn =
			result.typedNextAction === 'SEND_HOSTED_SOUL_GENESIS_MESSAGE' &&
			result.availableActions.includes('SEND_HOSTED_SOUL_GENESIS_MESSAGE') &&
			Boolean(registrationId);
		const mustPollFirstTurn =
			result.typedNextAction === 'REFRESH_STATE' &&
			result.availableActions.includes('REFRESH_STATE') &&
			Boolean(registrationId);
		if (!canStartFirstTurn && !mustPollFirstTurn) return null;

		const timestamp = state.updatedAt ?? new Date(nowMs).toISOString();
		const pendingMessageId = mustPollFirstTurn
			? `synthetic-assistant-hosted-registration:${registrationId}`
			: null;
		return {
			id: `hosted-registration:${registrationId}`,
			remoteConversationId,
			registrationId,
			activeBodyId: state.bodyId ?? null,
			activeDroneUsername: state.username ?? null,
			title: 'Hosted genesis conversation ready',
			messages: pendingMessageId
				? [{
						id: pendingMessageId,
						role: 'assistant',
						content: 'Waiting for Lesser to attach the accepted hosted genesis turn…',
						createdAt: timestamp,
						status: 'streaming',
					}]
				: [],
			messagesTruncated: false,
			turnStatus: mustPollFirstTurn ? 'waiting' : 'ready',
			canSendMessage: canStartFirstTurn,
			reconciliationPending: Boolean(mustPollFirstTurn && result.error),
			pendingAssistantMessageId: pendingMessageId,
			createdAt: timestamp,
			updatedAt: timestamp,
			lastPolledAt: options.lastPolledAt ?? null,
		};
	}

	const baseMessages = conversation.messages
		.slice()
		.sort((a, b) => a.order - b.order)
		.map(mapHostedGenesisMessage);

	const turnStatus = deriveTurnStatusFromHostedResult(result, nowMs, stuckTimeoutMs);

	let messages = baseMessages;
	let pendingAssistantMessageId: string | null = null;

	// Add a synthetic streaming assistant message when the assistant is
	// processing and no assistant response has appeared in the transcript yet.
	const lastMessage = baseMessages.at(-1);
	const isWaitingTurn = turnStatus === 'waiting' || turnStatus === 'stuck';
	if (isWaitingTurn && (!lastMessage || lastMessage.role === 'user')) {
		const syntheticId = `synthetic-assistant-${conversation.conversationId}`;
		const syntheticMessage: GenesisConversationMessage = {
			id: syntheticId,
			role: 'assistant',
			content: 'Thinking through the soul declaration…',
			createdAt: new Date(nowMs).toISOString(),
			status: turnStatus === 'stuck' ? 'error' : 'streaming',
			error: turnStatus === 'stuck' ? 'Assistant turn timed out.' : undefined,
		};
		messages = [...baseMessages, syntheticMessage];
		pendingAssistantMessageId = syntheticId;
	}

	const title = deriveConversationTitle(baseMessages, conversation.conversationId);
	const timestamp = conversation.updatedAt ?? new Date(nowMs).toISOString();

	return {
		id: conversation.conversationId,
		remoteConversationId: conversation.conversationId,
		registrationId: conversation.registrationId ?? registrationId,
		activeBodyId: state.bodyId ?? null,
		activeDroneUsername: state.username ?? null,
		title,
		messages,
		messagesTruncated: conversation.messagesTruncated,
		turnStatus,
		canSendMessage:
			turnStatus === 'ready' &&
			result.availableActions.includes('SEND_HOSTED_SOUL_GENESIS_MESSAGE'),
		reconciliationPending: false,
		pendingAssistantMessageId,
		createdAt: timestamp,
		updatedAt: timestamp,
		lastPolledAt: options.lastPolledAt ?? null,
	};
}

function deriveConversationTitle(
	messages: readonly GenesisConversationMessage[],
	conversationId: string
): string {
	const firstUserMessage = messages.find(
		(message) => message.role === 'user' && message.content.trim()
	);
	if (firstUserMessage) return excerpt(firstUserMessage.content);
	return `Genesis conversation ${conversationId.slice(0, 8)}`;
}

function toSummary(record: GenesisConversationRecord): GenesisConversationSummary {
	return {
		id: record.id,
		title: record.title,
		turnStatus: record.turnStatus,
		messageCount: record.messages.length,
		updatedAt: record.updatedAt,
		activeDroneUsername: record.activeDroneUsername,
	};
}

function deriveTurnStatusFromSummaryStatus(status: string): GenesisConversationTurnStatus {
	switch (status) {
		case 'failed':
			return 'error';
		case 'in_progress':
		case 'created':
		case 'declaration_extraction_pending':
		case 'registration_active_no_conversation':
			return 'waiting';
		case 'assistant_turn_ready':
		case 'declaration_ready':
		case 'published_bound':
		case 'no_registration':
		default:
			return 'ready';
	}
}

/**
 * Create a GenesisConversationApi backed by real Lesser same-origin GraphQL.
 *
 * All calls route through the HostedSoulBootstrapClient to /api/graphql. The
 * browser never contacts Host, AWS, or any third-party origin directly.
 *
 * Recovery uses the dedicated recoverHostedSoulGenesisTurn GraphQL mutation
 * (Lesser v1.5.12) which calls Host's POST /recover endpoint without adding
 * a user message to the transcript.
 *
 * The conversation list uses the listHostedGenesisConversations GraphQL query
 * (Lesser v1.5.12) which returns bounded conversation summaries from Host.
 */
export function createGenesisConversationGraphQLApi(
	options: GenesisConversationGraphQLApiOptions
): GenesisConversationApi {
	const {
		username,
		endpoint,
		token,
		signal,
		fetch: fetchLike,
		now = () => Date.now(),
		stuckTimeoutMs = DEFAULT_STUCK_TIMEOUT_MS,
		operationStorage = browserSessionStorage(),
		createOperationKey: operationKeyFactory = createGenesisOperationKey,
	} = options;

	if (!username.trim()) {
		throw new Error('GenesisConversationGraphQLApi requires a username.');
	}

	// Dynamic import keeps the mapping helpers testable in Node without
	// resolving the full $lib/greater/adapters/soul import chain. The module
	// is cached after the first load.
	async function createClient(): Promise<HostedSoulBootstrapClient> {
		const { createProject44HostedSoulBootstrapClient } = await import('./soulBootstrap');
		return createProject44HostedSoulBootstrapClient({
			endpoint,
			token,
			signal,
			fetch: fetchLike,
		});
	}

	// Track the last known registration/conversation IDs so sendMessage and
	// recoverStuckTurn can pass them to Lesser without an extra round-trip.
	let lastRegistrationId: string | null = null;
	let lastConversationId: string | null = null;
	let lastMappedRecord: GenesisConversationRecord | null = null;
	let pendingSendReconciliation: {
		baseline: GenesisConversationRecord;
		baselineEvidence: GenesisSendBaselineEvidence;
		operation: GenesisOperationToken;
		submittedContent?: string;
	} | null = null;
	// Begin keys participate in Lesser's replay guard. Lesser v1.5.12 records
	// send keys as correlation metadata but does not yet relay them to Host, so
	// Sim must also fail closed and poll after any ambiguous send outcome rather
	// than treating key reuse as end-to-end duplicate prevention.
	const fallbackOperationTokens = new Map<'start' | 'send', GenesisOperationToken>();

	function operationStorageKey(purpose: 'start' | 'send'): string {
		return `simulacrum:genesis-operation:${encodeURIComponent(username)}:${purpose}`;
	}

	function readOperationToken(purpose: 'start' | 'send'): GenesisOperationToken | null {
		const storageKey = operationStorageKey(purpose);
		let stored: string | null = null;
		try {
			stored = operationStorage.getItem(storageKey);
		} catch {
			return fallbackOperationTokens.get(purpose) ?? null;
		}
		if (!stored) return fallbackOperationTokens.get(purpose) ?? null;
		try {
			const parsed = JSON.parse(stored) as Partial<GenesisOperationToken>;
			const baseline = parsed.baseline;
			const validBaseline =
				baseline &&
				(baseline.remoteConversationId === null ||
					typeof baseline.remoteConversationId === 'string') &&
				(baseline.registrationId === null || typeof baseline.registrationId === 'string') &&
				typeof baseline.messageEvidence === 'string';
			if (
				typeof parsed.key === 'string' &&
				Boolean(parsed.key.trim()) &&
				parsed.key.length <= 128 &&
				typeof parsed.fingerprint === 'string' &&
				Boolean(parsed.fingerprint) &&
				(purpose === 'start' || validBaseline)
			) {
				return {
					key: parsed.key,
					fingerprint: parsed.fingerprint,
					baseline: validBaseline ? baseline : undefined,
				};
			}
		} catch {
			// Invalid entries are removed below before a replacement is persisted.
		}
		try {
			operationStorage.removeItem(storageKey);
		} catch {
			// A volatile fallback is used when storage cannot be repaired.
		}
		return fallbackOperationTokens.get(purpose) ?? null;
	}

	function acquireOperationToken(
		purpose: 'start' | 'send',
		fingerprint: string,
		baseline?: GenesisSendBaselineEvidence
	): GenesisOperationToken {
		const existing = readOperationToken(purpose);
		if (existing?.fingerprint === fingerprint) return existing;
		const generatedKey = operationKeyFactory(purpose).trim();
		if (!generatedKey || generatedKey.length > 128) {
			throw new Error(`Genesis ${purpose} operation key must contain 1-128 characters.`);
		}
		const token = { key: generatedKey, fingerprint, baseline };
		try {
			operationStorage.setItem(operationStorageKey(purpose), JSON.stringify(token));
		} catch {
			fallbackOperationTokens.set(purpose, token);
		}
		return token;
	}

	function completeOperationToken(
		purpose: 'start' | 'send',
		token: GenesisOperationToken
	): void {
		const storageKey = operationStorageKey(purpose);
		try {
			const existing = readOperationToken(purpose);
			if (existing?.key === token.key && existing.fingerprint === token.fingerprint) {
				operationStorage.removeItem(storageKey);
			}
		} catch {
			// The fallback token is still cleared below.
		}
		if (fallbackOperationTokens.get(purpose)?.key === token.key) {
			fallbackOperationTokens.delete(purpose);
		}
	}

	function updateTrackedIds(result: HostedSoulBootstrapResult): void {
		const conversation = result.hostedGenesisConversation;
		if (conversation) {
			lastConversationId = conversation.conversationId;
			lastRegistrationId = conversation.registrationId ?? lastRegistrationId;
		}
		if (result.state) {
			lastRegistrationId = result.state.hostRegistrationId ?? lastRegistrationId;
			lastConversationId = result.state.hostConversationId ?? lastConversationId;
		}
	}

	function mapResult(
		result: HostedSoulBootstrapResult,
		lastPolledAt: string | null = null
	): GenesisConversationRecord | null {
		updateTrackedIds(result);
		lastMappedRecord = mapHostedResultToGenesisRecord(result, {
			now,
			stuckTimeoutMs,
			lastPolledAt,
		});
		return lastMappedRecord;
	}

	function checkBackendError(result: HostedSoulBootstrapResult): void {
		if (result.error) {
			throw new Error(result.error.message || 'Genesis conversation request failed.');
		}
	}

	function recordMessageEvidence(record: GenesisConversationRecord): string {
		return record.messages
			.filter((message) => !message.id.startsWith('synthetic-'))
			.map(
				(message) =>
					`${message.id}:${message.role}:${message.status}:${genesisOperationFingerprint(message.content)}`
			)
			.join('|');
	}

	function sendBaselineEvidence(record: GenesisConversationRecord): GenesisSendBaselineEvidence {
		return {
			remoteConversationId: record.remoteConversationId,
			registrationId: record.registrationId,
			messageEvidence: recordMessageEvidence(record),
		};
	}

	function hasAuthoritativeSendProgress(
		candidate: GenesisConversationRecord,
		baseline: GenesisSendBaselineEvidence
	): boolean {
		if (
			candidate.remoteConversationId &&
			candidate.remoteConversationId !== baseline.remoteConversationId
		) {
			return true;
		}
		if (candidate.turnStatus === 'error') return true;
		if (candidate.remoteConversationId && candidate.turnStatus !== 'ready') return true;
		return recordMessageEvidence(candidate) !== baseline.messageEvidence;
	}

	function markSendReconciliationPending(
		record: GenesisConversationRecord,
		operation: GenesisOperationToken,
		submittedContent = pendingSendReconciliation?.submittedContent
	): GenesisConversationRecord {
		pendingSendReconciliation = {
			baseline: pendingSendReconciliation?.baseline ?? record,
			baselineEvidence:
				pendingSendReconciliation?.baselineEvidence ??
				operation.baseline ??
				sendBaselineEvidence(record),
			operation,
			submittedContent,
		};
		const existingPending = record.messages.find(
			(message) => message.status === 'pending' || message.status === 'streaming'
		);
		const pendingMessageId = existingPending?.id ?? `synthetic-reconcile-${record.id}`;
		const hasSubmittedContent = submittedContent
			? record.messages.some(
					(message) => message.role === 'user' && message.content === submittedContent
				)
			: true;
		const submittedMessage: GenesisConversationMessage[] =
			submittedContent && !hasSubmittedContent
				? [{
						id: `synthetic-user-${operation.key}`,
						role: 'user',
						content: submittedContent,
						createdAt: new Date(now()).toISOString(),
						status: 'complete',
					}]
				: [];
		const messagesWithSubmittedContent = existingPending && submittedMessage.length > 0
			? [
					...record.messages.slice(0, record.messages.indexOf(existingPending)),
					...submittedMessage,
					...record.messages.slice(record.messages.indexOf(existingPending)),
				]
			: [...record.messages, ...submittedMessage];
		lastMappedRecord = {
			...record,
			messages: existingPending
				? messagesWithSubmittedContent
				: [...messagesWithSubmittedContent, {
						id: pendingMessageId,
						role: 'assistant',
						content: 'Send outcome is being reconciled through Lesser before another turn.',
						createdAt: new Date(now()).toISOString(),
						status: 'streaming',
					}],
			turnStatus: 'waiting',
			canSendMessage: false,
			reconciliationPending: true,
			pendingAssistantMessageId: pendingMessageId,
			lastPolledAt: new Date(now()).toISOString(),
		};
		return lastMappedRecord;
	}

	function reconcilePendingSend(
		candidate: GenesisConversationRecord | null
	): GenesisConversationRecord | null {
		const pending = pendingSendReconciliation;
		if (!pending) return candidate;
		if (candidate && hasAuthoritativeSendProgress(candidate, pending.baselineEvidence)) {
			completeOperationToken('send', pending.operation);
			pendingSendReconciliation = null;
			lastMappedRecord = candidate;
			return candidate;
		}
		return markSendReconciliationPending(candidate ?? pending.baseline, pending.operation);
	}

	return {
		async startConversation() {
			const client = await createClient();
			const current = await client.current({ username });
			const currentRecord = mapResult(current);
			if (current.error && current.typedNextAction !== 'REFRESH_STATE') {
				checkBackendError(current);
			}
			if (currentRecord) return currentRecord;
			const operation = acquireOperationToken('start', 'hosted-start-or-resume');
			const startInput: StartHostedSoulBootstrapInput = {
				username,
				idempotencyKey: operation.key,
			};
			const mutationResult = await client.startHostedSoulBootstrap(startInput);
			checkBackendError(mutationResult);
			const record = mapResult(mutationResult);
			if (!record) {
				throw new Error('Hosted soul bootstrap started but no genesis conversation was returned.');
			}
			return record;
		},

		async listConversations() {
			// Lesser v1.5.12 exposes listHostedGenesisConversations which calls
			// Host's GET /mint-conversations list endpoint. Returns bounded
			// conversation summaries sorted by updated_at descending.
			const client = await createClient();
			const result = await client.listHostedGenesisConversations({ username });
			return result.conversations.map((summary) => ({
				id: summary.conversationId,
				title: `Genesis conversation ${summary.conversationId.slice(0, 8)}`,
				turnStatus: deriveTurnStatusFromSummaryStatus(summary.status),
				messageCount: summary.messageCount,
				updatedAt: summary.updatedAt ?? new Date(0).toISOString(),
				activeDroneUsername: username,
			}));
		},

		async loadActiveConversation() {
			const client = await createClient();
			const result = await client.current({ username });
			const record = mapResult(result);
			if (result.error && result.typedNextAction !== 'REFRESH_STATE') {
				checkBackendError(result);
			}
			const pendingOperation = readOperationToken('send');
			if (record && pendingOperation) {
				pendingSendReconciliation = {
					baseline: record,
					baselineEvidence: pendingOperation.baseline ?? sendBaselineEvidence(record),
					operation: pendingOperation,
				};
				return reconcilePendingSend(record);
			}
			return record;
		},

		async loadConversation(conversationId: string) {
			// Lesser's soulBootstrap query is per-user, not per-conversationId.
			// The conversationId is informational; Lesser returns the active
			// conversation. We verify it matches to avoid showing stale state.
			const client = await createClient();
			const result = await client.current({ username });
			checkBackendError(result);
			const record = mapResult(result);
			if (!record) return null;
			if (record.id !== conversationId) return null;
			return record;
		},

		async sendMessage({ conversationId, content }: SendGenesisConversationMessageInput) {
			const draft = content.trim();
			if (!draft) {
				throw new Error('Message content is required.');
			}

			const client = await createClient();
			const baseline = lastMappedRecord;
			const operation = acquireOperationToken(
				'send',
				genesisOperationFingerprint(
					`${lastRegistrationId ?? username}\n${lastConversationId ?? conversationId ?? ''}\n${draft}`
				),
				baseline ? sendBaselineEvidence(baseline) : undefined
			);
			const sendInput: SendHostedSoulGenesisMessageInput = {
				username,
				message: draft,
				conversationId: lastConversationId ?? conversationId ?? undefined,
				registrationId: lastRegistrationId ?? undefined,
				idempotencyKey: operation.key,
			};
			let mutationResult: HostedSoulBootstrapResult;
			try {
				mutationResult = await client.sendHostedSoulGenesisMessage(sendInput);
			} catch (caught) {
				let reconciled: GenesisConversationRecord | null = null;
				try {
					const current = await client.current({ username });
					reconciled = mapResult(current, new Date(now()).toISOString());
				} catch {
					// The original send outcome remains ambiguous; fail closed below.
				}
				if (!baseline) throw caught;
					pendingSendReconciliation = {
						baseline,
						baselineEvidence: operation.baseline ?? sendBaselineEvidence(baseline),
						operation,
						submittedContent: draft,
					};
					return reconcilePendingSend(reconciled ?? baseline) ??
					markSendReconciliationPending(baseline, operation, draft);
			}
			const record = mapResult(mutationResult);
			if (mutationResult.error) {
				const mustReconcile =
					mutationResult.typedNextAction === 'REFRESH_STATE' ||
					mutationResult.recoveryAction === 'REFRESH_STATE';
				if (mustReconcile && (record || baseline)) {
					const pendingBaseline = baseline ?? record;
					if (pendingBaseline) {
						pendingSendReconciliation = {
							baseline: pendingBaseline,
							baselineEvidence:
								operation.baseline ?? sendBaselineEvidence(pendingBaseline),
							operation,
							submittedContent: draft,
						};
						return markSendReconciliationPending(record ?? pendingBaseline, operation, draft);
					}
				}
				completeOperationToken('send', operation);
				pendingSendReconciliation = null;
				checkBackendError(mutationResult);
			}
			if (!record) {
				if (baseline) {
					pendingSendReconciliation = {
						baseline,
						baselineEvidence: operation.baseline ?? sendBaselineEvidence(baseline),
						operation,
						submittedContent: draft,
					};
					return markSendReconciliationPending(baseline, operation, draft);
				}
				throw new Error('Message was sent but no genesis conversation was returned.');
			}
			completeOperationToken('send', operation);
			pendingSendReconciliation = null;
			return record;
		},

		async pollConversation(conversationId: string) {
			const client = await createClient();
			const result = await client.current({ username });
			const record = mapResult(result, new Date(now()).toISOString());
			if (result.error && result.typedNextAction !== 'REFRESH_STATE') {
				checkBackendError(result);
			}
			const reconciled = reconcilePendingSend(record);
			if (!reconciled) return null;
			const requestedRegistrationShell = conversationId.startsWith('hosted-registration:');
			if (
				!requestedRegistrationShell &&
				reconciled.remoteConversationId &&
				reconciled.remoteConversationId !== conversationId
			) {
				return null;
			}
			return reconciled;
		},

		async recoverStuckTurn(conversationId: string) {
			// Lesser v1.5.12 exposes recoverHostedSoulGenesisTurn which calls
			// Host's POST /recover endpoint without adding a user message to
			// the transcript. The mutation returns HostedSoulBootstrapMutationResult
			// with the updated bootstrap surface directly.
			const client = await createClient();
			const recoverInput: RecoverHostedSoulGenesisTurnInput = {
				username,
				conversationId: conversationId || lastConversationId || '',
				registrationId: lastRegistrationId ?? undefined,
			};
			const mutationResult = await client.recoverHostedSoulGenesisTurn(recoverInput);
			checkBackendError(mutationResult);
			return mapResult(mutationResult, new Date(now()).toISOString());
		},
	};
}
