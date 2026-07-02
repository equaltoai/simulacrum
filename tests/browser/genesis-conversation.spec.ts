import { expect, type Page } from '@playwright/test';

import { GENESIS_CONVERSATION_STORAGE_KEY } from '../../src/lib/api/genesisConversation.ts';
import { test } from './_harness/fixtures';
import {
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

		// Add a handler for the new listHostedGenesisConversations query
		// that the sidebar now sends (Lesser v1.5.12 + Greater v0.11.7).
		// The existing installProject44Routes harness doesn't know about
		// this operation yet, so we add a fallback route.
		await page.route('**/api/graphql', async (route) => {
			const body = route.request().postDataJSON() as { operationName?: string } | null;
			if (body?.operationName === 'ListHostedGenesisConversations') {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						data: {
							listHostedGenesisConversations: [
								{
									conversationId: 'conv-project-51-genesis',
									registrationId: 'reg-project-51',
									status: 'assistant_turn_ready',
									messageCount: 2,
									latestTurnId: 'turn-2',
									createdAt: '2026-06-28T13:00:00Z',
									updatedAt: '2026-06-28T13:01:00Z',
								},
							],
						},
					}),
				});
				return;
			}
			// Let the existing handler process all other operations.
			await route.fallback();
		});

		await page.goto('/l/souls/genesis');
		await expect(page.getByTestId('genesis-conversation-page')).toBeVisible();

		// The sidebar list is now visible for the real GraphQL API
		// (Lesser v1.5.12 exposes listHostedGenesisConversations).
		await expect(page.getByTestId('genesis-conversation-list')).toBeVisible();

		// The existing conversation from the GraphQL fixture loads automatically.
		const transcript = page.getByTestId('genesis-conversation-transcript');
		await expect(transcript).toContainText(
			'I am a hosted Greater-compatible soul bootstrap relayed through Lesser same-origin GraphQL.'
		);

		// Verify all GraphQL requests went to same-origin /api/graphql.
		const graphQLOperations = harness.graphQLRequests().map((request) => request.operationName);
		expect(graphQLOperations).toContain('SoulBootstrap');
		for (const request of harness.graphQLRequests()) {
			expect(new URL(request.url).pathname).toBe('/api/graphql');
		}
	});
});
