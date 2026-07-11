import { expect, type Page } from '@playwright/test';

import { GENESIS_CONVERSATION_STORAGE_KEY } from '../../src/lib/api/genesisConversation.ts';
import { project44SoulBootstrapIds } from '../../src/lib/greater/adapters/fixtures/soul-bootstrap.ts';
import { test } from './_harness/fixtures';
import {
	createProject51HostedRegistrationActiveSurface,
	createProject51PendingHostedGenesisSurface,
	createProject51StuckHostedGenesisSurface,
	createProject51TruncatedHostedGenesisSurface,
	installProject44Auth,
	installProject44Routes,
} from './_harness/soulBootstrapMocks';

type CapturedRequest = {
	method: string;
	url: string;
};

function captureRequests(page: Page): CapturedRequest[] {
	const captured: CapturedRequest[] = [];
	page.on('request', (request) => {
		captured.push({
			method: request.method(),
			url: request.url(),
		});
	});
	return captured;
}

function expectLocalMockOnly(captured: readonly CapturedRequest[]) {
	const disallowed = captured.filter((request) => {
		const url = new URL(request.url);
		return url.pathname === '/api/graphql' ||
			url.pathname.startsWith('/api/v1/soul') ||
			/lesser-host|amazonaws|microvm|micro[-_]?vm/i.test(url.hostname) ||
			/hostToken|hostBaseUrl|instanceKey|lesserHostToken/i.test(request.url);
	});
	expect(disallowed).toEqual([]);
}

async function openGenesis(page: Page) {
	await page.addInitScript((storageKey) => {
		// Existing mock-based tests set this flag so the page uses
		// createGenesisConversationMockApi instead of the real GraphQL API.
		(window as unknown as { __SIM_USE_GENESIS_MOCK?: boolean }).__SIM_USE_GENESIS_MOCK = true;
		const resetFlag = `${storageKey}:reset-once`;
		if (window.sessionStorage.getItem(resetFlag)) return;
		window.localStorage.removeItem(storageKey);
		window.sessionStorage.setItem(resetFlag, 'done');
	}, GENESIS_CONVERSATION_STORAGE_KEY);
	await page.goto('/l/souls/genesis');
	await expect(page.getByTestId('genesis-conversation-page')).toBeVisible();
	await expect(page.getByTestId('genesis-conversation-hero')).toContainText('Genesis Conversation');
	await expect(page.getByTestId('hosted-soul-bootstrap-panel')).toHaveCount(0);
	await expect(page.getByTestId('soul-bootstrap-lane')).toHaveCount(0);
	await expect(page.locator('body')).not.toContainText('REFRESH_STATE');
	await expect(page.locator('body')).not.toContainText('Recovery category');
	await expect(page.locator('body')).not.toContainText('Refresh Hosted State');
}

async function startNewConversation(page: Page) {
	await page.getByTestId('genesis-conversation-new').click();
	await expect(page.getByTestId('genesis-conversation-transcript')).toContainText(
		'Local mock started'
	);
}

async function sendGenesisMessage(page: Page, content: string) {
	await page.getByLabel('Message input').fill(content);
	await page.getByRole('button', { name: 'Send message' }).click();
}

function buildLongGenesisMessage() {
	const sections = Array.from(
		{ length: 30 },
		(_, index) =>
			`Section ${index + 1}: explain the purpose, boundaries, continuity, and honest limitations that should shape this soul.`
	);
	return `${sections.join('\n')}\nGENESIS-LONG-MESSAGE-END`;
}

test.describe('Project 51 genesis conversation v2', () => {
	test('supports a multi-turn type-send-response conversation with the local mock', async ({
		page,
	}, testInfo) => {
		const captured = captureRequests(page);
		await openGenesis(page);
		await expect(page.getByTestId('genesis-conversation-start-prompt')).toBeVisible();
		await startNewConversation(page);

		const transcript = page.getByTestId('genesis-conversation-transcript');
		await expect(transcript).toContainText('Local mock started');

		await sendGenesisMessage(page, 'Help me write the purpose for a synthetic-threat research soul.');
		await expect(transcript).toContainText(
			'Help me write the purpose for a synthetic-threat research soul.'
		);
		await expect(transcript).toContainText('Genesis assistant: I heard');

		await sendGenesisMessage(page, 'Add a boundary about not impersonating humans.');
		await expect(transcript).toContainText('Add a boundary about not impersonating humans.');
		await expect(transcript).toContainText('Genesis assistant: Follow-up accepted');
		await expect(transcript).toContainText('Draft declaration expanded');
		await expect(transcript).toContainText('provisional soul declaration');
		await expect(page.getByTestId('genesis-conversation-status')).toContainText(
			'Ready for next turn'
		);

		await testInfo.attach('genesis-conversation-v2.png', {
			body: await page.screenshot({ fullPage: true }),
			contentType: 'image/png',
		});
		expectLocalMockOnly(captured);
	});

	test('accepts a complete genesis response beyond the legacy 1,200-character cap', async ({
		page,
	}) => {
		const captured = captureRequests(page);
		await openGenesis(page);
		await startNewConversation(page);

		const longMessage = buildLongGenesisMessage();
		expect(longMessage.length).toBeGreaterThan(1_200);

		const input = page.getByLabel('Message input');
		await expect(input).not.toHaveAttribute('maxlength');
		await input.click();
		await page.keyboard.insertText(longMessage);
		await expect(input).toHaveValue(longMessage);
		await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();

		await page.getByRole('button', { name: 'Send message' }).click();
		await expect(page.getByTestId('genesis-conversation-transcript')).toContainText(
			'GENESIS-LONG-MESSAGE-END'
		);
		expectLocalMockOnly(captured);
	});

	test('loads an existing local conversation after reload and accepts a follow-up', async ({
		page,
	}) => {
		const captured = captureRequests(page);
		await openGenesis(page);
		await startNewConversation(page);

		const transcript = page.getByTestId('genesis-conversation-transcript');
		await sendGenesisMessage(page, 'Persist this genesis context across a reload.');
		await expect(transcript).toContainText('Genesis assistant: I heard');

		await page.reload();
		await expect(page.getByTestId('genesis-conversation-page')).toBeVisible();
		await expect(transcript).toContainText('Persist this genesis context across a reload.');
		await expect(transcript).toContainText('Genesis assistant: I heard');

		await sendGenesisMessage(page, 'Continue after reload with one more boundary.');
		await expect(transcript).toContainText('Continue after reload with one more boundary.');
		await expect(transcript).toContainText('Genesis assistant: Follow-up accepted');
		expectLocalMockOnly(captured);
	});

	test('lists existing conversations and restores a selected transcript', async ({ page }) => {
		const captured = captureRequests(page);
		await openGenesis(page);
		await startNewConversation(page);

		const transcript = page.getByTestId('genesis-conversation-transcript');
		await sendGenesisMessage(page, 'First saved genesis conversation for resume.');
		await expect(transcript).toContainText('Genesis assistant: I heard');

		await page.getByTestId('genesis-conversation-new').click();
		await expect(transcript).toContainText('Local mock started');
		await sendGenesisMessage(page, 'Second saved genesis conversation stays active.');
		await expect(transcript).toContainText('Second saved genesis conversation stays active.');
		await expect(transcript).toContainText('Genesis assistant: I heard');

		const list = page.getByTestId('genesis-conversation-list');
		await expect(list.getByTestId('genesis-conversation-list-item')).toHaveCount(2);
		await expect(list).toContainText('First saved genesis conversation for resume.');
		await expect(list).toContainText('Second saved genesis conversation stays active.');
		await expect(
			list.getByTestId('genesis-conversation-list-item').filter({
				hasText: 'Second saved genesis conversation stays active.',
			})
		).toHaveAttribute('aria-current', 'true');

		await list
			.getByTestId('genesis-conversation-list-item')
			.filter({ hasText: 'First saved genesis conversation for resume.' })
			.click();
		await expect(transcript).toContainText('First saved genesis conversation for resume.');
		await expect(transcript).toContainText('Genesis assistant: I heard');
		await expect(transcript).not.toContainText('Second saved genesis conversation stays active.');
		await expect(
			list.getByTestId('genesis-conversation-list-item').filter({
				hasText: 'First saved genesis conversation for resume.',
			})
		).toHaveAttribute('aria-current', 'true');
		expectLocalMockOnly(captured);
	});

	test('recovers a stuck assistant turn from the same local transcript', async ({ page }) => {
		const captured = captureRequests(page);
		await openGenesis(page);
		await startNewConversation(page);

		const transcript = page.getByTestId('genesis-conversation-transcript');
		await sendGenesisMessage(page, 'Please simulate a stuck genesis turn.');
		await expect(transcript).toContainText('The genesis assistant turn is waiting for recovery');
		await expect(page.getByTestId('genesis-conversation-status')).toContainText(
			'Turn needs recovery'
		);

		await page.getByTestId('genesis-conversation-recover').click();
		await expect(transcript).toContainText('Genesis assistant: I recovered the turn');
		await expect(page.getByTestId('genesis-conversation-status')).toContainText(
			'Ready for next turn'
		);
		expectLocalMockOnly(captured);
	});
});

// ---------------------------------------------------------------------------
// GraphQL API tests — the page uses createGenesisConversationGraphQLApi (no
// mock flag set). GraphQL requests to /api/graphql are intercepted with the
// existing installProject44Routes harness which returns deterministic fixture
// surfaces including hostedGenesisConversation with transcript messages.
// ---------------------------------------------------------------------------

test.describe('Project 51 genesis conversation GraphQL API', () => {
	test('loads an existing conversation from Lesser GraphQL and shows the transcript', async ({
		page,
	}) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: 'hostedGenesisMessage',
		});

		await page.goto('/l/souls/genesis');
		await expect(page.getByTestId('genesis-conversation-page')).toBeVisible();

		// The sidebar list is now visible for the real GraphQL API
		// (Lesser v1.5.12 exposes listHostedGenesisConversations).
		await expect(page.getByTestId('genesis-conversation-list')).toBeVisible();
		await expect(page.getByTestId('genesis-conversation-history-readonly')).toContainText(
			'not load-by-id yet'
		);
		await expect(page.getByTestId('genesis-conversation-list-item')).toBeDisabled();

		// The existing conversation from the GraphQL fixture loads automatically.
		const transcript = page.getByTestId('genesis-conversation-transcript');
		await expect(transcript).toContainText(
			'I am a hosted Greater-compatible soul bootstrap relayed through Lesser same-origin GraphQL.'
		);

		const longMessage = buildLongGenesisMessage();
		await sendGenesisMessage(page, longMessage);
		await expect
			.poll(() => {
				const request = harness
					.graphQLRequests()
					.find((candidate) => candidate.operationName === 'SendHostedSoulGenesisMessage');
				const input = request?.variables.input;
				return input && typeof input === 'object' && 'message' in input
					? (input as { message?: unknown }).message
					: null;
			})
			.toBe(longMessage);

		// Verify all GraphQL requests went to same-origin /api/graphql.
		const graphQLOperations = harness.graphQLRequests().map((request) => request.operationName);
		expect(graphQLOperations).toContain('SoulBootstrap');
		for (const request of harness.graphQLRequests()) {
			expect(new URL(request.url).pathname).toBe('/api/graphql');
		}
	});

	test('uses the selected drone username for hosted genesis GraphQL operations', async ({
		page,
	}) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: 'hostedGenesisMessage',
			myAgents: 'multiple',
		});

		await page.goto('/l/souls/genesis');
		const chooser = page.getByLabel('Drone body');
		await expect(chooser).toBeVisible();
		await chooser.selectOption('second-drone');
		await expect(chooser).toHaveValue('second-drone');

		await expect
			.poll(() => harness.graphQLRequests()
				.filter((request) => request.operationName === 'ListHostedGenesisConversations')
				.at(-1)?.variables.username)
			.toBe('second-drone');
		await expect
			.poll(() => harness.graphQLRequests()
				.filter((request) => request.operationName === 'SoulBootstrap')
				.at(-1)?.variables.username)
			.toBe('second-drone');

		await sendGenesisMessage(page, 'Use the selected drone for this genesis turn.');
		await expect
			.poll(() => {
				const request = harness.graphQLRequests()
					.filter((candidate) => candidate.operationName === 'SendHostedSoulGenesisMessage')
					.at(-1);
				const input = request?.variables.input;
				return input && typeof input === 'object' && 'username' in input
					? (input as { username?: unknown }).username
					: null;
			})
			.toBe('second-drone');
	});

	test('requires a drone body before starting a hosted genesis conversation', async ({ page }) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, { myAgents: 'none' });

		await page.goto('/l/souls/genesis');
		await expect(page.getByTestId('genesis-conversation-no-agent')).toBeVisible();
		await expect(page.getByTestId('genesis-conversation-go-to-drones')).toBeVisible();

		const hostedGenesisOperations = new Set([
			'ListHostedGenesisConversations',
			'SoulBootstrap',
			'StartHostedSoulBootstrap',
			'SendHostedSoulGenesisMessage',
			'RecoverHostedSoulGenesisTurn',
		]);
		expect(
			harness.graphQLRequests()
				.filter((request) => hostedGenesisOperations.has(request.operationName))
		).toEqual([]);
	});

	test('starts genesis for the selected drone without fabricating capabilities', async ({ page }) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			genesisStartSurface: createProject51HostedRegistrationActiveSurface(),
		});

		await page.goto('/l/souls/genesis');
		await expect(page.getByTestId('genesis-conversation-start-prompt')).toBeVisible();
		await page.getByTestId('genesis-conversation-start-new').click();
		await expect(page.getByTestId('genesis-conversation-registration-ready')).toContainText(
			project44SoulBootstrapIds.registrationId
		);
		await expect(page.getByLabel('Message input')).toBeEnabled();

		const firstMessage = 'Define the purpose and boundaries for this hosted soul.';
		await sendGenesisMessage(page, firstMessage);

		await expect
			.poll(() => harness.graphQLRequests()
				.find((request) => request.operationName === 'StartHostedSoulBootstrap')
				?.variables.input)
			.toMatchObject({ username: project44SoulBootstrapIds.username });
		const startInput = harness.graphQLRequests()
			.find((request) => request.operationName === 'StartHostedSoulBootstrap')
			?.variables.input as Record<string, unknown>;
		expect(startInput).not.toHaveProperty('capabilities');
		expect(startInput.idempotencyKey).toEqual(expect.stringMatching(/^sim-genesis-start-/));

		await expect
			.poll(() => harness.graphQLRequests()
				.find((request) => request.operationName === 'SendHostedSoulGenesisMessage')
				?.variables.input)
			.toMatchObject({
				username: project44SoulBootstrapIds.username,
				registrationId: project44SoulBootstrapIds.registrationId,
				message: firstMessage,
			});
		const sendInput = harness.graphQLRequests()
			.find((request) => request.operationName === 'SendHostedSoulGenesisMessage')
			?.variables.input as Record<string, unknown>;
		expect(sendInput).not.toHaveProperty('conversationId');
		expect(sendInput.idempotencyKey).toEqual(expect.stringMatching(/^sim-genesis-send-/));
	});

	test('does not issue another hosted begin when an active conversation already exists', async ({
		page,
	}) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: 'hostedGenesisMessage',
		});

		await page.goto('/l/souls/genesis');
		await expect(page.getByTestId('genesis-conversation-transcript')).toContainText(
			'I am a hosted Greater-compatible soul bootstrap relayed through Lesser same-origin GraphQL.'
		);
		const startOrResume = page.getByTestId('genesis-conversation-new');
		await expect(startOrResume).toBeDisabled();
		await startOrResume.click({ force: true });
		expect(
			harness.graphQLRequests()
				.filter((request) => request.operationName === 'StartHostedSoulBootstrap')
		).toEqual([]);
	});

	test('recovers a stuck hosted assistant turn through Lesser GraphQL', async ({ page }) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject51StuckHostedGenesisSurface(),
		});

		await page.goto('/l/souls/genesis');
		await expect(page.getByTestId('genesis-conversation-recover')).toBeVisible();
		await page.getByTestId('genesis-conversation-recover').click();

		await expect
			.poll(() => {
				const request = harness.graphQLRequests()
					.find((candidate) => candidate.operationName === 'RecoverHostedSoulGenesisTurn');
				return request?.variables.input ?? null;
			})
			.toMatchObject({
				username: project44SoulBootstrapIds.username,
				conversationId: project44SoulBootstrapIds.conversationId,
				registrationId: project44SoulBootstrapIds.registrationId,
			});
		const operationNames = harness.graphQLRequests().map((request) => request.operationName);
		expect(operationNames).toContain('RecoverHostedSoulGenesisTurn');
		expect(operationNames).not.toContain('SendHostedSoulGenesisMessage');
		await expect(page.getByTestId('genesis-conversation-status')).toContainText(
			'Ready for next turn'
		);
	});

	test('disables compose when Lesser does not advertise a send action', async ({ page }) => {
		await installProject44Auth(page);
		await installProject44Routes(page, {
			initialSurface: 'hostedGenesisComplete',
		});

		await page.goto('/l/souls/genesis');
		await expect(page.getByTestId('genesis-conversation-transcript')).toBeVisible();
		await expect(page.getByLabel('Message input')).toBeDisabled();
	});

	test('keeps an in-progress assistant turn pending when send is only an alternative action', async ({
		page,
	}) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject51PendingHostedGenesisSurface(),
		});

		await page.goto('/l/souls/genesis');
		await expect(page.getByTestId('genesis-conversation-status')).toContainText(
			'Assistant responding'
		);
		await expect(page.getByTestId('genesis-conversation-transcript')).toContainText(
			'Thinking through the soul declaration'
		);
		await expect(page.getByLabel('Message input')).toBeDisabled();
		expect(
			harness.graphQLRequests()
				.filter((request) => request.operationName === 'SendHostedSoulGenesisMessage')
		).toEqual([]);
	});

	test('keeps active conversation mutations authoritative when history listing fails', async ({
		page,
	}) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: 'hostedGenesisMessage',
			rejectGenesisConversationList: true,
		});

		await page.goto('/l/souls/genesis');
		const transcript = page.getByTestId('genesis-conversation-transcript');
		await expect(transcript).toContainText(
			'I am a hosted Greater-compatible soul bootstrap relayed through Lesser same-origin GraphQL.'
		);
		await expect(page.getByTestId('genesis-conversation-history-error')).toContainText(
			'History is temporarily unavailable'
		);

		const listAttemptsBeforeSend = harness.graphQLRequests()
			.filter((request) => request.operationName === 'ListHostedGenesisConversations').length;
		const message = 'Continue even though history is unavailable.';
		await sendGenesisMessage(page, message);
		await expect
			.poll(() => harness.graphQLRequests()
				.filter((request) => request.operationName === 'ListHostedGenesisConversations').length)
			.toBeGreaterThan(listAttemptsBeforeSend);
		expect(
			harness.graphQLRequests()
				.filter((request) => request.operationName === 'SendHostedSoulGenesisMessage')
		).toHaveLength(1);
		const sendInput = harness.graphQLRequests()
			.find((request) => request.operationName === 'SendHostedSoulGenesisMessage')
			?.variables.input;
		expect(sendInput).toMatchObject({
			username: project44SoulBootstrapIds.username,
			conversationId: project44SoulBootstrapIds.conversationId,
			registrationId: project44SoulBootstrapIds.registrationId,
			message,
		});
		await expect(page.getByLabel('Message input')).toHaveValue('');
		await expect(transcript).toContainText(
			'I am a hosted Greater-compatible soul bootstrap relayed through Lesser same-origin GraphQL.'
		);
		await expect(page.getByTestId('genesis-conversation-status')).toContainText(
			'Ready for next turn'
		);
		await expect(page.getByRole('alert')).toHaveCount(0);
	});

	test('fails closed and reconciles through Lesser after an ambiguous send failure', async ({
		page,
	}) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: 'hostedGenesisMessage',
			rejectFirstHostedGenesisSend: true,
		});

		await page.goto('/l/souls/genesis');
		const input = page.getByLabel('Message input');
		const message = 'Retry this exact genesis turn without duplicating it.';
		await input.fill(message);
		await page.getByRole('button', { name: 'Send message' }).click();
		await expect(input).toHaveValue('');
		await expect(page.getByTestId('genesis-conversation-send-reconciliation')).toContainText(
			'do not resend the turn'
		);
		await expect(page.getByTestId('genesis-conversation-status')).toContainText(
			'Assistant responding'
		);
		await expect(page.getByLabel('Message input')).toBeDisabled();
		await expect(page.getByTestId('genesis-conversation-transcript')).toContainText(message);
		await expect(page.getByRole('alert')).toHaveCount(0);
		const sends = harness.graphQLRequests()
			.filter((request) => request.operationName === 'SendHostedSoulGenesisMessage');
		expect(sends).toHaveLength(1);
		expect((sends[0]?.variables.input as Record<string, unknown>).idempotencyKey)
			.toEqual(expect.stringMatching(/^sim-genesis-send-/));
		expect(
			harness.graphQLRequests()
				.filter((request) => request.operationName === 'SoulBootstrap').length
		).toBeGreaterThan(1);

		await page.reload();
		await expect(page.getByTestId('genesis-conversation-send-reconciliation')).toContainText(
			'do not resend the turn'
		);
		await expect(page.getByLabel('Message input')).toBeDisabled();
		expect(
			harness.graphQLRequests()
				.filter((request) => request.operationName === 'SendHostedSoulGenesisMessage')
		).toHaveLength(1);
	});

	test('clears a persisted send journal when reload state already proves progress', async ({
		page,
	}) => {
		await installProject44Auth(page);
		const storageKey = `simulacrum:genesis-operation:${encodeURIComponent(project44SoulBootstrapIds.username)}:send`;
		await page.addInitScript(
			({ key, registrationId }) => {
				window.sessionStorage.setItem(key, JSON.stringify({
					key: 'sim-genesis-send-persisted-reload',
					fingerprint: 'persisted-reload-fixture',
					baseline: {
						remoteConversationId: null,
						registrationId,
						messageEvidence: '',
					},
				}));
			},
			{ key: storageKey, registrationId: project44SoulBootstrapIds.registrationId }
		);
		const harness = await installProject44Routes(page, {
			initialSurface: 'hostedGenesisMessage',
		});

		await page.goto('/l/souls/genesis');
		await expect(page.getByTestId('genesis-conversation-transcript')).toContainText(
			'I am a hosted Greater-compatible soul bootstrap relayed through Lesser same-origin GraphQL.'
		);
		await expect(page.getByTestId('genesis-conversation-send-reconciliation')).toHaveCount(0);
		await expect(page.getByLabel('Message input')).toBeEnabled();
		expect(await page.evaluate((key) => window.sessionStorage.getItem(key), storageKey)).toBeNull();
		expect(
			harness.graphQLRequests()
				.filter((request) => request.operationName === 'SendHostedSoulGenesisMessage')
		).toEqual([]);
	});

	test('consumes Lesser REFRESH_STATE payload errors instead of retrying the hosted turn', async ({
		page,
	}) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			genesisStartSurface: createProject51HostedRegistrationActiveSurface(),
			hostedGenesisSendReturnsRefreshError: true,
		});

		await page.goto('/l/souls/genesis');
		await page.getByTestId('genesis-conversation-start-new').click();
		const message = 'Begin the first hosted genesis turn once.';
		await sendGenesisMessage(page, message);

		await expect(page.getByTestId('genesis-conversation-send-reconciliation')).toContainText(
			'do not resend the turn'
		);
		await expect(page.getByTestId('genesis-conversation-status')).toContainText(
			'Assistant responding'
		);
		await expect(page.getByLabel('Message input')).toBeDisabled();
		await expect(page.getByTestId('genesis-conversation-transcript')).toContainText(message);
		await expect(page.getByRole('alert')).toHaveCount(0);
		expect(
			harness.graphQLRequests()
				.filter((request) => request.operationName === 'SendHostedSoulGenesisMessage')
		).toHaveLength(1);

		await page.reload();
		await expect(page.getByTestId('genesis-conversation-send-reconciliation')).toContainText(
			'do not resend the turn'
		);
		await expect(page.getByLabel('Message input')).toBeDisabled();
		expect(
			harness.graphQLRequests()
				.filter((request) => request.operationName === 'SendHostedSoulGenesisMessage')
		).toHaveLength(1);
	});

	test('warns when Lesser returns a bounded or truncated transcript', async ({ page }) => {
		await installProject44Auth(page);
		await installProject44Routes(page, {
			initialSurface: createProject51TruncatedHostedGenesisSurface(),
		});

		await page.goto('/l/souls/genesis');
		await expect(page.getByTestId('genesis-conversation-transcript-truncated')).toContainText(
			'bounded or truncated transcript'
		);
	});

	test('clears the hosted transcript and agent API when the session signs out', async ({ page }) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: 'hostedGenesisMessage',
		});

		await page.goto('/l/souls/genesis');
		const transcript = page.getByTestId('genesis-conversation-transcript');
		const hostedMessage =
			'I am a hosted Greater-compatible soul bootstrap relayed through Lesser same-origin GraphQL.';
		await expect(transcript).toContainText(hostedMessage);
		await expect
			.poll(() => harness.graphQLRequests()
				.filter((request) => request.operationName === 'ListHostedGenesisConversations').length)
			.toBeGreaterThan(0);
		const requestCountBeforeLogout = harness.graphQLRequests().length;

		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page.getByText('Agent-first shell is rendered without live auth')).toBeVisible();
		await expect(transcript).not.toContainText(hostedMessage);
		await expect(page.getByTestId('genesis-conversation-agent-chooser')).toHaveCount(0);
		await expect(page.getByTestId('genesis-conversation-loading')).toContainText(
			'Loading live drone state'
		);
		await page.waitForTimeout(100);
		expect(harness.graphQLRequests()).toHaveLength(requestCountBeforeLogout);
	});
});
