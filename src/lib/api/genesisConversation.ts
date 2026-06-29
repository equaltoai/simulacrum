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
	error?: string;
	moments?: readonly GenesisConversationMessageMoment[];
	workflowMetadata?: readonly GenesisConversationWorkflowMetadata[];
}

export interface GenesisConversationRecord {
	id: string;
	activeBodyId: string | null;
	activeDroneUsername: string | null;
	title: string;
	messages: readonly GenesisConversationMessage[];
	turnStatus: GenesisConversationTurnStatus;
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
	conversationId: string;
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
		turnStatus: conversation.turnStatus,
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
				turnStatus: 'ready',
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
			const conversation = state.conversations[conversationId];
			if (!conversation) {
				throw new Error(`Genesis conversation ${conversationId} was not found.`);
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
			conversation.updatedAt = iso(nowMs);
			write(state);
			return cloneConversation(conversation);
		},
	};
}
