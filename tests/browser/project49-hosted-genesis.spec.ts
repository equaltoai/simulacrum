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
	headers: Record<string, string>;
	postData: string | null;
};

const HOST_CREDENTIAL_PROMPT_TEXT = /\bhostToken\b|\bhostBaseUrl\b|\bsoulWorkflowHost\b|browser instance key|Connect a lesser-host control-plane token|Enter Host token|\bMicroVM\b|microvm token|microvm endpoint/i;
const DISALLOWED_HOSTED_BROWSER_FIELDS =
	/hostToken|hostBaseUrl|soulWorkflowHost|instanceKey|lesserHostToken|x-host-instance-key|x-lesser-host-token|x-instance-key|microvm|micro[-_]?vm|walletAddress|principalAddress|signature|selfAttestation|boundarySignatures/i;

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
		captured.push({
			method: request.method(),
			url: request.url(),
			headers: request.headers(),
			postData: request.postData(),
		});
	});
	return captured;
}

function expectNoRawHostWorkflowReads(captured: readonly CapturedRequest[]) {
	const rawHostReads = captured.filter((request) => {
		const url = new URL(request.url);
		return url.pathname.startsWith('/api/v1/soul') ||
			/microvm|micro[-_]?vm/i.test(url.pathname) ||
			/microvm|micro[-_]?vm/i.test(url.hostname);
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

function expectNoHostOrMicroVmCredentialExposure(
	page: Page,
	captured: readonly CapturedRequest[],
	graphQLRequests: readonly {
		operationName: string;
		url: string;
		variables: Record<string, unknown>;
		headers: Record<string, string>;
		postData: string | null;
	}[]
) {
	const pageOrigin = new URL(page.url()).origin;
	expectNoRawHostWorkflowReads(captured);
	for (const request of captured) {
		const url = new URL(request.url);
		const headers = JSON.stringify(request.headers);
		expect(headers, `no Host/MicroVM credential headers for ${request.method} ${url.pathname}`).not.toMatch(
			/x-host-instance-key|x-lesser-host-token|x-instance-key|microvm|micro[-_]?vm/i
		);
		const authorization = request.headers.authorization ?? request.headers.Authorization;
		if (authorization) {
			expect(url.origin, 'bearer-bearing browser requests stay same-origin').toBe(pageOrigin);
			expect(url.pathname, 'bearer-bearing hosted recovery requests use Lesser GraphQL only').toBe(
				'/api/graphql'
			);
		}
	}
	for (const request of graphQLRequests) {
		expect(JSON.stringify(request.variables), request.operationName).not.toMatch(
			DISALLOWED_HOSTED_BROWSER_FIELDS
		);
		expect(request.postData ?? '', request.operationName).not.toMatch(
			/hostToken|hostBaseUrl|soulWorkflowHost|instanceKey|lesserHostToken|x-host-instance-key|x-lesser-host-token|x-instance-key|microvm|micro[-_]?vm/i
		);
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
		expectNoHostOrMicroVmCredentialExposure(page, captured, harness.graphQLRequests());
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
		expectNoHostOrMicroVmCredentialExposure(page, captured, harness.graphQLRequests());
		await expectNoHostCredentialStorage(page);
	});

	test('hosted browser operations stay same-origin and do not expose Host or MicroVM credentials', async ({ page }) => {
		const captured = captureRequests(page);
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject49HostedGenesisSurface('no registration'),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		await expect(page.getByTestId('hosted-soul-server-action')).toContainText(
			'START_HOSTED_BOOTSTRAP'
		);
		await page.getByRole('button', { name: 'Start Hosted Definition' }).click();
		await expect(page.getByTestId('hosted-soul-success')).toContainText(
			'Hosted definition started through Lesser'
		);
		await expect(page.getByTestId('hosted-soul-server-action')).toContainText(
			'SEND_HOSTED_SOUL_GENESIS_MESSAGE'
		);
		await page.getByRole('button', { name: 'Send Genesis Message' }).click();
		await expect(page.getByTestId('hosted-soul-server-action')).toContainText(
			'COMPLETE_HOSTED_SOUL_GENESIS'
		);

		const operations = harness.graphQLRequests().map((request) => request.operationName);
		expect(operations).toContain('StartHostedSoulBootstrap');
		expect(operations).toContain('SendHostedSoulGenesisMessage');
		expect(operations).not.toContain('BeginSoulBootstrap');
		expect(operations).not.toContain('VerifySoulBootstrapWallet');
		expect(operations).not.toContain('FinalizeSoulBootstrap');
		expectSameOriginGraphQL(page, harness.graphQLRequests());
		expectNoHostOrMicroVmCredentialExposure(page, captured, harness.graphQLRequests());
		await expectNoHostCredentialPrompt(page);
		await expectNoHostCredentialStorage(page);
	});

	test('renders released server-authored hosted next actions without multiple primary controls', async ({ page }) => {
		const actionCases = [
			{
				label: 'registration active, no conversation',
				action: 'SEND_HOSTED_SOUL_GENESIS_MESSAGE',
				control: 'Send Genesis Message',
			},
			{ label: 'in_progress', action: 'REFRESH_STATE', control: 'Refresh Hosted State' },
			{
				label: 'assistant_turn_ready',
				action: 'COMPLETE_HOSTED_SOUL_GENESIS',
				control: 'Generate Hosted Declarations',
			},
			{ label: 'declaration_ready', action: 'PUBLISH_HOSTED_SOUL', control: 'Publish Hosted Soul' },
			{ label: 'failed retry same step', action: 'RETRY_SAME_STEP', control: 'Retry Hosted Step' },
			{
				label: 'failed restart bootstrap',
				action: 'RESTART_SOUL_BOOTSTRAP',
				control: 'Restart Hosted Definition',
			},
		] as const;

		for (const row of actionCases) {
			await installProject44Auth(page);
			await installProject44Routes(page, {
				initialSurface: createProject49HostedGenesisSurface(row.label),
			});
			await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);

			const panel = page.getByTestId('hosted-soul-bootstrap-panel');
			await expect(panel.getByTestId('hosted-soul-server-action')).toContainText(row.action);
			await expect(page.getByTestId('hosted-soul-default-action')).toHaveCount(1);
			await expect(page.getByRole('button', { name: row.control })).toBeVisible();
			await expect(panel).not.toContainText(/backend logs|DynamoDB repair|MicroVM endpoint|SQS diagnosis/i);
			await expectNoHostCredentialPrompt(page);
			await expectNoHostCredentialStorage(page);
			await page.unrouteAll({ behavior: 'ignoreErrors' });
		}
	});

	test('failed retry same step re-invokes hosted start through Lesser without wallet or raw Host inputs', async ({ page }) => {
		const captured = captureRequests(page);
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject49HostedGenesisSurface('failed retry same step'),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		await expect(page.getByTestId('hosted-soul-default-action')).toHaveCount(1);
		await expect(page.getByTestId('hosted-soul-server-action')).toContainText('RETRY_SAME_STEP');
		await expect(page.getByRole('button', { name: 'Retry Hosted Step' })).toBeEnabled();
		expect(harness.graphQLRequests().map((request) => request.operationName)).not.toContain(
			'StartHostedSoulBootstrap'
		);

		await page.getByRole('button', { name: 'Retry Hosted Step' }).click();
		await expect(page.getByTestId('hosted-soul-success')).toContainText(
			'Hosted definition started through Lesser'
		);

		const startRequest = harness
			.graphQLRequests()
			.find((request) => request.operationName === 'StartHostedSoulBootstrap');
		expect(startRequest, 'Retry Hosted Step must invoke StartHostedSoulBootstrap').toBeTruthy();
		expect(startRequest?.variables).toMatchObject({
			input: { username: project44SoulBootstrapIds.username },
		});
		expect(JSON.stringify(startRequest?.variables ?? {})).not.toMatch(
			/walletAddress|principalAddress|signature|selfAttestation|hostToken|hostBaseUrl|instanceKey|microvm/i
		);

		const operations = harness.graphQLRequests().map((request) => request.operationName);
		expect(operations).not.toContain('RestartSoulBootstrap');
		expect(operations).not.toContain('PublishHostedSoul');
		expect(operations).not.toContain('BeginSoulBootstrap');
		expectSameOriginGraphQL(page, harness.graphQLRequests());
		expectNoHostOrMicroVmCredentialExposure(page, captured, harness.graphQLRequests());
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
		expectNoHostOrMicroVmCredentialExposure(page, captured, harness.graphQLRequests());
		await expectNoHostCredentialStorage(page);
	});
});
