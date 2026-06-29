import assert from 'node:assert/strict';
import test from 'node:test';

import {
	createGenesisConversationMockApi,
	createMemoryGenesisConversationStorage,
	GENESIS_CONVERSATION_STORAGE_KEY,
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
