import { expect, type Page } from '@playwright/test';

import { test } from './_harness/fixtures';
import {
	createProject49HostedGenesisSurface,
	installProject44Auth,
	installProject44Routes,
	readHostCredentialStorage,
} from './_harness/soulBootstrapMocks';
import { project44SoulBootstrapIds } from '../../src/lib/greater/adapters/fixtures/soul-bootstrap.ts';

type CapturedRequest = {
	method: string;
	url: string;
};

const HOST_CREDENTIAL_PROMPT_TEXT = /\bhostToken\b|\bhostBaseUrl\b|\bsoulWorkflowHost\b|browser instance key|Connect a lesser-host control-plane token|Enter Host token/i;

async function expectNoHostCredentialPrompt(page: Page) {
	const bodyText = await page.locator('body').innerText();
	expect(bodyText).not.toMatch(HOST_CREDENTIAL_PROMPT_TEXT);
}

async function expectNoHostCredentialStorage(page: Page) {
	const storage = await readHostCredentialStorage(page);
	expect(storage.disallowedKeys).toEqual([]);
}


function withLesserRecoveryAttempt(surface: ReturnType<typeof createProject49HostedGenesisSurface>) {
	const state = {
		...surface.state,
		recoveryAttemptId: project44SoulBootstrapIds.recoveryAttemptId,
		correlation: surface.state.correlation
			? {
					...surface.state.correlation,
					recoveryAttemptId: project44SoulBootstrapIds.recoveryAttemptId,
				}
			: {
					__typename: 'SoulBootstrapCorrelationState',
					correlationKey: project44SoulBootstrapIds.correlationKey,
					beginIdempotencyKey: null,
					walletVerificationIdempotencyKey: null,
					principalDeclarationIdempotencyKey: null,
					conversationIdempotencyKey: null,
					finalizeIdempotencyKey: null,
					restartIdempotencyKey: project44SoulBootstrapIds.restartIdempotencyKey,
					recoveryAttemptId: project44SoulBootstrapIds.recoveryAttemptId,
					supersededHostRegistrationId: null,
					supersededHostConversationId: null,
					lastHostRequestId: project44SoulBootstrapIds.hostRequestId,
					} as const,
		};
	return {
		...surface,
		state,
		workflow: surface.workflow
			? {
					...surface.workflow,
					soulBootstrap: {
						...surface.workflow.soulBootstrap,
						recoveryAttemptId: project44SoulBootstrapIds.recoveryAttemptId,
						correlation: state.correlation,
					},
				}
			: surface.workflow,
	};
}

function captureRequests(page: Page): CapturedRequest[] {
	const captured: CapturedRequest[] = [];
	page.on('request', (request) => {
		captured.push({ method: request.method(), url: request.url() });
	});
	return captured;
}

function expectNoRawHostWorkflowReads(captured: readonly CapturedRequest[]) {
	const rawHostReads = captured.filter((request) => {
		const url = new URL(request.url);
		return request.method === 'GET' && url.pathname.startsWith('/api/v1/soul');
	});
	expect(rawHostReads).toEqual([]);
}

function expectSameOriginGraphQL(page: Page, graphQLRequests: readonly { operationName: string; url: string }[]) {
	const pageOrigin = new URL(page.url()).origin;
	for (const request of graphQLRequests) {
		const url = new URL(request.url);
		expect(url.origin, `GraphQL operation ${request.operationName} must remain same-origin`).toBe(pageOrigin);
		expect(url.pathname).toBe('/api/graphql');
	}
}

test.describe('Project 49 hosted genesis workflow reset', () => {
	test('long in-progress genesis survives reload and refreshes through Lesser query only', async ({ page }) => {
		const captured = captureRequests(page);
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject49HostedGenesisSurface('in_progress'),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		await expect(page.getByTestId('hosted-soul-bootstrap-panel')).toBeVisible();
		await expect(page.getByTestId('hosted-soul-default-action')).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Refresh Hosted State' })).toBeEnabled();

		await page.reload();
		await expect(page.getByTestId('hosted-soul-bootstrap-panel')).toBeVisible();
		await expect(page.getByTestId('hosted-soul-default-action')).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Refresh Hosted State' })).toBeEnabled();
		await page.getByRole('button', { name: 'Refresh Hosted State' }).click();
		await expect(page.getByTestId('hosted-soul-success')).toContainText('Hosted soul state refreshed from Lesser');

		const operations = harness.graphQLRequests().map((request) => request.operationName);
		expect(operations).toContain('SoulBootstrap');
		expect(operations).not.toContain('CompleteHostedSoulGenesis');
		expect(operations).not.toContain('PublishHostedSoul');
		expectSameOriginGraphQL(page, harness.graphQLRequests());
		expectNoRawHostWorkflowReads(captured);
		await expectNoHostCredentialPrompt(page);
		await expectNoHostCredentialStorage(page);
	});

	test('restart/supersede uses Lesser restart mutation without wallet or raw Host inputs', async ({ page }) => {
		const captured = captureRequests(page);
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: withLesserRecoveryAttempt(createProject49HostedGenesisSurface('failed restart bootstrap')),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		await expect(page.getByTestId('hosted-soul-default-action')).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Restart Hosted Definition' })).toBeEnabled();
		await page.getByRole('button', { name: 'Restart Hosted Definition' }).click();
		await expect(page.getByTestId('hosted-soul-success')).toContainText('Hosted definition restarted through Lesser');
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Genesis conversation is ready');

		const restartRequest = harness.graphQLRequests().find((request) => request.operationName === 'RestartSoulBootstrap');
		expect(restartRequest?.variables).toMatchObject({
			input: {
				username: project44SoulBootstrapIds.username,
				recoveryAttemptId: project44SoulBootstrapIds.recoveryAttemptId,
			},
		});
		expect(JSON.stringify(restartRequest?.variables ?? {})).not.toMatch(
			/walletAddress|principalAddress|signature|selfAttestation|hostToken|hostBaseUrl|instanceKey/i
		);
		expectSameOriginGraphQL(page, harness.graphQLRequests());
		expectNoRawHostWorkflowReads(captured);
		await expectNoHostCredentialStorage(page);
	});

	test('failed retry same step re-invokes hosted start through Lesser without wallet or raw Host inputs', async ({ page }) => {
		const captured = captureRequests(page);
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject49HostedGenesisSurface('failed retry same step'),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		await expect(page.getByTestId('hosted-soul-default-action')).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Retry Hosted Step' })).toBeEnabled();
		expect(harness.graphQLRequests().map((request) => request.operationName)).not.toContain('StartHostedSoulBootstrap');

		await page.getByRole('button', { name: 'Retry Hosted Step' }).click();
		await expect(page.getByTestId('hosted-soul-success')).toContainText('Hosted definition started through Lesser');

		const startRequest = harness
			.graphQLRequests()
			.find((request) => request.operationName === 'StartHostedSoulBootstrap');
		expect(startRequest, 'Retry Hosted Step must invoke StartHostedSoulBootstrap').toBeTruthy();
		expect(startRequest?.variables).toMatchObject({
			input: { username: project44SoulBootstrapIds.username },
		});
		expect(JSON.stringify(startRequest?.variables ?? {})).not.toMatch(
			/walletAddress|principalAddress|signature|selfAttestation|hostToken|hostBaseUrl|instanceKey/i
		);

		const operations = harness.graphQLRequests().map((request) => request.operationName);
		expect(operations).not.toContain('RestartSoulBootstrap');
		expect(operations).not.toContain('PublishHostedSoul');
		expect(operations).not.toContain('BeginSoulBootstrap');
		expectSameOriginGraphQL(page, harness.graphQLRequests());
		expectNoRawHostWorkflowReads(captured);
		await expectNoHostCredentialPrompt(page);
		await expectNoHostCredentialStorage(page);
	});

	test('declaration-ready review exposes exactly one evidence-gated publish action', async ({ page }) => {
		const captured = captureRequests(page);
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject49HostedGenesisSurface('declaration_ready'),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Publish hosted/off-chain soul');
		await expect(page.getByTestId('hosted-soul-evidence')).toContainText('sha256:');
		await expect(page.getByTestId('hosted-soul-default-action')).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Publish Hosted Soul' })).toBeEnabled();
		expect(harness.graphQLRequests().map((request) => request.operationName)).not.toContain('PublishHostedSoul');

		await page.getByRole('button', { name: 'Publish Hosted Soul' }).click();
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Hosted/off-chain soul is active');
		const operations = harness.graphQLRequests().map((request) => request.operationName);
		expect(operations).toContain('PublishHostedSoul');
		expect(operations).not.toContain('BeginSoulBootstrap');
		expect(operations).not.toContain('VerifySoulBootstrapWallet');
		expect(operations).not.toContain('FinalizeSoulBootstrap');
		expectSameOriginGraphQL(page, harness.graphQLRequests());
		expectNoRawHostWorkflowReads(captured);
		await expectNoHostCredentialStorage(page);
	});
});
