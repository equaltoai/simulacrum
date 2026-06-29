import { expect, type Page } from '@playwright/test';

import { GENESIS_CONVERSATION_STORAGE_KEY } from '../../src/lib/api/genesisConversation.ts';
import { test } from './_harness/fixtures';

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

	test('recovers a stuck assistant turn from the same local transcript', async ({ page }) => {
		const captured = captureRequests(page);
		await openGenesis(page);

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
