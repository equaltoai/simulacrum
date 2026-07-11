import assert from 'node:assert/strict';
import test from 'node:test';

import {
	createGenesisConversationMockApi,
	createMemoryGenesisConversationStorage,
	GENESIS_CONVERSATION_STORAGE_KEY,
	mapHostedGenesisMessage,
	deriveTurnStatusFromHostedResult,
	mapHostedResultToGenesisRecord,
} from '../../../src/lib/api/genesisConversation.ts';

test('genesis conversation mock starts, sends, polls, and resumes locally', async () => {
	let now = Date.parse('2026-06-29T12:00:00.000Z');
	const storage = createMemoryGenesisConversationStorage();
	const api = createGenesisConversationMockApi({
		storage,
		now: () => now,
		responseDelayMs: 50,
	});

	let conversation = await api.startConversation({
		activeBodyId: 'body-1',
		activeDroneUsername: 'research-drone',
	});

	assert.equal(conversation.activeBodyId, 'body-1');
	assert.equal(conversation.activeDroneUsername, 'research-drone');
	assert.equal(conversation.turnStatus, 'ready');
	assert.equal(conversation.messages.at(0).role, 'system');

	conversation = await api.sendMessage({
		conversationId: conversation.id,
		content: 'Help me define the purpose of this soul.',
	});

	assert.equal(conversation.turnStatus, 'waiting');
	assert.equal(conversation.messages.filter((message) => message.role === 'user').length, 1);
	assert.equal(conversation.messages.at(-1).status, 'streaming');

	now += 49;
	conversation = (await api.pollConversation(conversation.id));
	assert.equal(conversation.turnStatus, 'waiting');
	assert.equal(conversation.messages.at(-1).status, 'streaming');

	now += 1;
	conversation = (await api.pollConversation(conversation.id));
	assert.equal(conversation.turnStatus, 'ready');
	assert.equal(conversation.messages.at(-1).status, 'complete');
	assert.match(conversation.messages.at(-1).content, /Genesis assistant: I heard/);

	const resumedApi = createGenesisConversationMockApi({
		storage,
		now: () => now,
		responseDelayMs: 50,
	});
	const resumed = await resumedApi.loadActiveConversation();
	assert.equal(resumed.id, conversation.id);
	assert.equal(resumed.messages.length, conversation.messages.length);
	assert.ok(storage.getItem(GENESIS_CONVERSATION_STORAGE_KEY)?.includes(conversation.id));
});

test('genesis conversation mock accepts follow-up messages on existing conversations', async () => {
	let now = Date.parse('2026-06-29T13:00:00.000Z');
	const api = createGenesisConversationMockApi({
		storage: createMemoryGenesisConversationStorage(),
		now: () => now,
		responseDelayMs: 25,
	});

	let conversation = await api.startConversation();
	conversation = await api.sendMessage({
		conversationId: conversation.id,
		content: 'Start a declaration with continuity.',
	});
	now += 25;
	conversation = await api.pollConversation(conversation.id);

	conversation = await api.sendMessage({
		conversationId: conversation.id,
		content: 'Add a boundary about not impersonating humans.',
	});
	now += 25;
	conversation = await api.pollConversation(conversation.id);

	assert.equal(conversation.turnStatus, 'ready');
	assert.equal(conversation.messages.filter((message) => message.role === 'user').length, 2);
	assert.match(conversation.messages.at(-1).content, /Follow-up accepted/);
	assert.deepEqual(conversation.messages.at(-1).workflowMetadata?.at(0)?.scope, [
		'purpose',
		'boundary',
		'continuity',
	]);
});

test('genesis conversation mock lists stored conversations newest first', async () => {
	let now = Date.parse('2026-06-29T13:30:00.000Z');
	const api = createGenesisConversationMockApi({
		storage: createMemoryGenesisConversationStorage(),
		now: () => now,
		responseDelayMs: 10,
	});

	let first = await api.startConversation({
		activeDroneUsername: 'first-drone',
	});
	first = await api.sendMessage({
		conversationId: first.id,
		content: 'First saved conversation should be resumable.',
	});
	now += 10;
	first = await api.pollConversation(first.id);

	now += 1_000;
	const second = await api.startConversation({
		activeDroneUsername: 'second-drone',
	});

	let list = await api.listConversations();
	assert.equal(list.length, 2);
	assert.equal(list[0].id, second.id);
	assert.equal(list[0].activeDroneUsername, 'second-drone');
	assert.equal(list[0].messageCount, 1);
	assert.equal(list[1].id, first.id);
	assert.equal(list[1].activeDroneUsername, 'first-drone');
	assert.equal(list[1].messageCount, first.messages.length);
	assert.match(list[1].title, /First saved conversation/);

	const loaded = await api.loadConversation(first.id);
	assert.equal(loaded.id, first.id);
	const active = await api.loadActiveConversation();
	assert.equal(active.id, first.id);

	list = await api.listConversations();
	assert.equal(list[0].id, second.id, 'loading a conversation should not rewrite updatedAt order');
});

test('genesis conversation mock recovers a stuck assistant turn without losing transcript', async () => {
	let now = Date.parse('2026-06-29T14:00:00.000Z');
	const api = createGenesisConversationMockApi({
		storage: createMemoryGenesisConversationStorage(),
		now: () => now,
		responseDelayMs: 40,
	});

	let conversation = await api.startConversation();
	conversation = await api.sendMessage({
		conversationId: conversation.id,
		content: 'Please simulate a stuck turn.',
	});

	assert.equal(conversation.turnStatus, 'stuck');
	assert.equal(conversation.messages.filter((message) => message.role === 'user').length, 1);

	now += 1_000;
	conversation = await api.pollConversation(conversation.id);
	assert.equal(conversation.turnStatus, 'stuck');
	assert.equal(conversation.messages.at(-1).status, 'streaming');

	conversation = await api.recoverStuckTurn(conversation.id);
	assert.equal(conversation.turnStatus, 'waiting');
	now += 40;
	conversation = await api.pollConversation(conversation.id);

	assert.equal(conversation.turnStatus, 'ready');
	assert.match(conversation.messages.at(-1).content, /recovered the turn/i);
	assert.match(conversation.messages.map((message) => message.content).join('\n'), /stuck turn/);
});

// ---------------------------------------------------------------------------
// GraphQL mapping logic tests (Project 51 — wire mock to real API)
// ---------------------------------------------------------------------------

function buildMockMessage(role, content, order, createdAt = '2026-06-28T13:00:00Z') {
	return {
		id: `msg_${String(order).padStart(6, '0')}`,
		role,
		content,
		order,
		createdAt,
		truncated: false,
	};
}

function buildMockConversation(messages, status, updatedAt = '2026-06-28T13:01:00Z') {
	return {
		registrationId: 'reg-test-001',
		conversationId: 'conv-test-001',
		status,
		latestTurnId: `turn-${messages.length}`,
		messageCount: messages.length,
		messages,
		messagesTruncated: false,
		requestId: 'host-req-test-001',
		updatedAt,
	};
}

function buildMockResult(conversation, options = {}) {
	const status = conversation?.status ?? null;
	const availableActions = options.availableActions ?? ['SEND_HOSTED_SOUL_GENESIS_MESSAGE'];
	return {
		surface: null,
		state: {
			bodyId: 'body-test-001',
			username: 'test-user',
			state: options.state ?? 'hosted_genesis_started',
			phase: 'CONVERSATION',
			bootstrapMode: 'HOSTED',
			hostRegistrationId: 'reg-test-001',
			hostConversationId: conversation?.conversationId ?? 'conv-test-001',
			hostConversationStatus: status,
			typedNextAction: options.typedNextAction ?? availableActions[0],
			availableActions,
			hostedGenesisConversation: conversation,
		},
		hostedGenesisConversation: conversation,
		availableActions,
		typedNextAction: options.typedNextAction ?? availableActions[0],
		error: options.error ?? null,
	};
}

test('mapHostedGenesisMessage converts USER and ASSISTANT roles to lowercase', () => {
	const userMessage = buildMockMessage('USER', 'Hello genesis', 1);
	const mapped = mapHostedGenesisMessage(userMessage);
	assert.equal(mapped.role, 'user');
	assert.equal(mapped.content, 'Hello genesis');
	assert.equal(mapped.status, 'complete');
	assert.equal(mapped.createdAt, '2026-06-28T13:00:00Z');

	const assistantMessage = buildMockMessage('ASSISTANT', 'I heard you', 2);
	const mappedAssistant = mapHostedGenesisMessage(assistantMessage);
	assert.equal(mappedAssistant.role, 'assistant');
	assert.equal(mappedAssistant.content, 'I heard you');
});

test('mapHostedGenesisMessage falls back to epoch when createdAt is null', () => {
	const message = buildMockMessage('USER', 'test', 1, null);
	const mapped = mapHostedGenesisMessage(message);
	assert.equal(mapped.createdAt, new Date(0).toISOString());
});

test('mapHostedGenesisMessage preserves Lesser truncation evidence', () => {
	const message = {
		...buildMockMessage('ASSISTANT', 'Bounded response', 1),
		truncated: true,
	};
	const mapped = mapHostedGenesisMessage(message);
	assert.equal(mapped.truncated, true);
});

test('deriveTurnStatusFromHostedResult returns ready when SEND is available', () => {
	const conversation = buildMockConversation([], 'assistant_turn_ready');
	const result = buildMockResult(conversation, {
		availableActions: ['SEND_HOSTED_SOUL_GENESIS_MESSAGE', 'COMPLETE_HOSTED_SOUL_GENESIS'],
	});
	const status = deriveTurnStatusFromHostedResult(result, Date.now());
	assert.equal(status, 'ready');
});

test('deriveTurnStatusFromHostedResult returns waiting for in_progress', () => {
	const conversation = buildMockConversation(
		[buildMockMessage('USER', 'test', 1)],
		'in_progress',
		new Date().toISOString()
	);
	const result = buildMockResult(conversation, {
		availableActions: [],
		typedNextAction: 'REFRESH_STATE',
	});
	const status = deriveTurnStatusFromHostedResult(result, Date.now());
	assert.equal(status, 'waiting');
});

test('deriveTurnStatusFromHostedResult returns stuck when in_progress exceeds timeout', () => {
	const staleUpdatedAt = new Date(Date.now() - 120_000).toISOString(); // 2 minutes ago
	const conversation = buildMockConversation(
		[buildMockMessage('USER', 'stuck turn', 1)],
		'in_progress',
		staleUpdatedAt
	);
	const result = buildMockResult(conversation, {
		availableActions: [],
		typedNextAction: 'REFRESH_STATE',
	});
	const status = deriveTurnStatusFromHostedResult(result, Date.now(), 60_000);
	assert.equal(status, 'stuck');
});

test('deriveTurnStatusFromHostedResult returns error for failed status', () => {
	const conversation = buildMockConversation([], 'failed');
	const result = buildMockResult(conversation, { availableActions: [] });
	const status = deriveTurnStatusFromHostedResult(result, Date.now());
	assert.equal(status, 'error');
});

test('mapHostedResultToGenesisRecord returns null when no conversation', () => {
	const result = buildMockResult(null);
	const record = mapHostedResultToGenesisRecord(result);
	assert.equal(record, null);
});

test('mapHostedResultToGenesisRecord maps conversation with messages', () => {
	const messages = [
		buildMockMessage('USER', 'Describe the purpose.', 1),
		buildMockMessage('ASSISTANT', 'The purpose is research.', 2),
	];
	const conversation = buildMockConversation(messages, 'assistant_turn_ready');
	const result = buildMockResult(conversation, {
		availableActions: ['SEND_HOSTED_SOUL_GENESIS_MESSAGE'],
	});

	const record = mapHostedResultToGenesisRecord(result);
	assert.ok(record);
	assert.equal(record.id, 'conv-test-001');
	assert.equal(record.activeBodyId, 'body-test-001');
	assert.equal(record.activeDroneUsername, 'test-user');
	assert.equal(record.turnStatus, 'ready');
	assert.equal(record.messages.length, 2);
	assert.equal(record.messages[0].role, 'user');
	assert.equal(record.messages[1].role, 'assistant');
	assert.equal(record.pendingAssistantMessageId, null);
	assert.equal(record.canSendMessage, true);
	assert.equal(record.messagesTruncated, false);
});

test('mapHostedResultToGenesisRecord preserves transcript bounds and typed send permission', () => {
	const messages = [{
		...buildMockMessage('ASSISTANT', 'Truncated declaration context', 1),
		truncated: true,
	}];
	const conversation = {
		...buildMockConversation(messages, 'declaration_ready'),
		messagesTruncated: true,
	};
	const result = buildMockResult(conversation, {
		availableActions: ['PUBLISH_HOSTED_SOUL'],
		typedNextAction: 'PUBLISH_HOSTED_SOUL',
	});

	const record = mapHostedResultToGenesisRecord(result);
	assert.ok(record);
	assert.equal(record.messagesTruncated, true);
	assert.equal(record.messages[0].truncated, true);
	assert.equal(record.canSendMessage, false);
});

test('mapHostedResultToGenesisRecord adds synthetic assistant message when waiting', () => {
	const messages = [buildMockMessage('USER', 'First message', 1)];
	const conversation = buildMockConversation(messages, 'in_progress', new Date().toISOString());
	const result = buildMockResult(conversation, {
		availableActions: [],
		typedNextAction: 'REFRESH_STATE',
	});

	const record = mapHostedResultToGenesisRecord(result);
	assert.ok(record);
	assert.equal(record.turnStatus, 'waiting');
	assert.equal(record.messages.length, 2); // user + synthetic assistant
	assert.equal(record.messages[1].role, 'assistant');
	assert.equal(record.messages[1].status, 'streaming');
	assert.ok(record.pendingAssistantMessageId);
});

test('mapHostedResultToGenesisRecord marks synthetic message as error when stuck', () => {
	const staleUpdatedAt = new Date(Date.now() - 120_000).toISOString();
	const messages = [buildMockMessage('USER', 'stuck', 1)];
	const conversation = buildMockConversation(messages, 'in_progress', staleUpdatedAt);
	const result = buildMockResult(conversation, {
		availableActions: [],
		typedNextAction: 'REFRESH_STATE',
	});

	const record = mapHostedResultToGenesisRecord(result, { stuckTimeoutMs: 60_000 });
	assert.ok(record);
	assert.equal(record.turnStatus, 'stuck');
	assert.equal(record.messages[1].status, 'error');
	assert.ok(record.messages[1].error);
});

test('mapHostedResultToGenesisRecord derives title from first user message', () => {
	const messages = [
		buildMockMessage('USER', 'Help me write a soul declaration for a research drone.', 1),
		buildMockMessage('ASSISTANT', 'I can help with that.', 2),
	];
	const conversation = buildMockConversation(messages, 'assistant_turn_ready');
	const result = buildMockResult(conversation);

	const record = mapHostedResultToGenesisRecord(result);
	assert.ok(record);
	assert.match(record.title, /Help me write a soul declaration/);
});
