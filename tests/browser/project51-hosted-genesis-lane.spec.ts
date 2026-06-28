import { expect, type Page } from '@playwright/test';

import { test } from './_harness/fixtures';
import {
	createProject49HostedGenesisSurface,
	installProject44Auth,
	installProject44Routes,
	readHostCredentialStorage,
} from './_harness/soulBootstrapMocks';
import { project44SoulBootstrapIds } from '../../src/lib/greater/adapters/fixtures/soul-bootstrap.ts';

// Project 51 M6.10 — hosted genesis conversation lane.
//
// Live symptom: Lesser reports phase=CONVERSATION, state=conversation.in_progress, a Host
// conversation id, and typedNextAction=REFRESH_STATE for a hosted/off-chain body, but Simulacrum
// rendered only a bare "Refresh Hosted State" card with no conversation id, status, or waiting
// affordance. This proves the same live state shape now renders a first-class, legible hosted
// genesis lane that explicitly reads as "waiting for the Host conversation result" — without raw
// Host/MicroVM credentials and without fabricating an operator turn the Lesser contract does not
// authorize.

const HOST_CREDENTIAL_PROMPT_TEXT =
	/\bhostToken\b|\bhostBaseUrl\b|\bsoulWorkflowHost\b|browser instance key|Connect a lesser-host control-plane token|Enter Host token|\bMicroVM\b|microvm token|microvm endpoint/i;

type CapturedRequest = {
	method: string;
	url: string;
	headers: Record<string, string>;
	postData: string | null;
};

function captureRequests(page: Page): CapturedRequest[] {
	const captured: CapturedRequest[] = [];
	page.on('request', (request) => {
		captured.push({
			method: request.method(),
			url: request.url(),
			headers: request.headers(),
			postData: request.postData(),
		});
	});
	return captured;
}

async function expectNoHostCredentialPrompt(page: Page) {
	const bodyText = await page.locator('body').innerText();
	expect(bodyText).not.toMatch(HOST_CREDENTIAL_PROMPT_TEXT);
}

async function expectNoHostCredentialStorage(page: Page) {
	const storage = await readHostCredentialStorage(page);
	expect(storage.disallowedKeys).toEqual([]);
}

function expectNoRawHostRequests(captured: readonly CapturedRequest[]) {
	const rawHostReads = captured.filter((request) => {
		const url = new URL(request.url);
		return (
			url.pathname.startsWith('/api/v1/soul') ||
			/microvm|micro[-_]?vm/i.test(url.pathname) ||
			/microvm|micro[-_]?vm/i.test(url.hostname)
		);
	});
	expect(rawHostReads).toEqual([]);
}

test.describe('Project 51 hosted genesis conversation lane', () => {
	test('conversation.in_progress + hostConversationId + REFRESH_STATE renders a waiting hosted lane', async ({
		page,
	}) => {
		const captured = captureRequests(page);
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject49HostedGenesisSurface('in_progress'),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);

		const panel = page.getByTestId('hosted-soul-bootstrap-panel');
		await expect(panel).toBeVisible();

		// The state is legible as a first-class hosted genesis lane, not just a refresh card.
		const lane = page.getByTestId('hosted-genesis-lane');
		await expect(lane).toBeVisible();
		await expect(page.getByTestId('hosted-genesis-lane-title')).toContainText(
			'Waiting for the Host genesis conversation result'
		);
		await expect(page.getByTestId('hosted-genesis-conversation-id')).toContainText(
			project44SoulBootstrapIds.conversationId
		);
		await expect(page.getByTestId('hosted-genesis-status')).toContainText('in_progress');
		await expect(page.getByTestId('hosted-genesis-last-host-request')).toContainText(
			project44SoulBootstrapIds.hostRequestId
		);

		// Explicit "waiting for the Host result" affordance with a poll control.
		await expect(page.getByTestId('hosted-genesis-waiting')).toContainText(
			'waiting for the Host conversation result'
		);
		await expect(page.getByTestId('hosted-genesis-waiting')).toContainText(
			'poll Lesser same-origin GraphQL'
		);

		// No operator turn is authorized at conversation.in_progress: there is no genesis composer,
		// only the single Lesser-typed refresh/poll control.
		await expect(page.getByTestId('hosted-soul-genesis-message')).toHaveCount(0);
		await expect(page.getByTestId('hosted-soul-default-action')).toHaveCount(1);
		const pollControl = page.getByRole('button', { name: 'Refresh Hosted State' });
		await expect(pollControl).toBeEnabled();

		// Polling re-queries Lesser via GraphQL only and never repairs through a downstream mutation.
		await pollControl.click();
		await expect(page.getByTestId('hosted-soul-success')).toContainText(
			'Hosted soul state refreshed from Lesser'
		);
		await expect(lane).toBeVisible();

		const operations = harness.graphQLRequests().map((request) => request.operationName);
		expect(operations).toContain('SoulBootstrap');
		expect(operations).not.toContain('SendHostedSoulGenesisMessage');
		expect(operations).not.toContain('CompleteHostedSoulGenesis');
		expect(operations).not.toContain('PublishHostedSoul');

		// No raw Host/MicroVM credential prompts, storage, or requests are introduced.
		expectNoRawHostRequests(captured);
		await expectNoHostCredentialPrompt(page);
		await expectNoHostCredentialStorage(page);
	});

	test('Open Genesis Lane route /l/souls/genesis is not a dead route and renders the hosted lane', async ({
		page,
	}) => {
		const captured = captureRequests(page);
		await installProject44Auth(page);
		await installProject44Routes(page, {
			initialSurface: createProject49HostedGenesisSurface('in_progress'),
		});

		await page.goto('/l/souls/genesis');

		// The advertised /souls/genesis surface exists (not the not-found surface) and renders the
		// hosted genesis lane with the active conversation visible.
		await expect(page.getByRole('heading', { name: 'Surface Not Found' })).toHaveCount(0);
		await expect(page.getByTestId('hosted-genesis-lane')).toBeVisible();
		await expect(page.getByTestId('hosted-genesis-conversation-id')).toContainText(
			project44SoulBootstrapIds.conversationId
		);
		await expect(page.getByTestId('hosted-genesis-waiting')).toBeVisible();

		expectNoRawHostRequests(captured);
		await expectNoHostCredentialPrompt(page);
		await expectNoHostCredentialStorage(page);
	});
});
