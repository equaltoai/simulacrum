import { expect, type Page } from '@playwright/test';

import { test } from './_harness/fixtures';
import {
	createProject44BeginReadySurface,
	createProject44ConversationConflictSurface,
	createProject44GenericBootstrapErrorSurface,
	createProject44HostUnavailableSurface,
	createProject44HostedGenesisCompleteWithClosedPublishGateSurface,
	createProject44HostedGenesisCompleteWithoutEvidenceSurface,
	createProject44HostedPublishWithStaleRecoverySurface,
	createProject44NullableArrayHostedRefreshStateSurface,
	createProject44HostedRefreshStateSurface,
	createProject44MissingRegistrationErrorSurface,
	createProject44RecoverablePrincipalErrorSurface,
	createProject44RecoverablePrincipalPreflightSurface,
	installProject44Auth,
	installProject44Routes,
	installProject44Wallet,
	readHostCredentialStorage,
	readProject44WalletRequests,
} from './_harness/soulBootstrapMocks';
import {
	project44SoulBootstrapFixtures,
	project44SoulBootstrapIds,
	project44SoulBootstrapSigning,
} from '../../src/lib/greater/adapters/fixtures/soul-bootstrap.ts';

const HOST_CREDENTIAL_PROMPT_TEXT = /\bhostToken\b|\bhostBaseUrl\b|\bsoulWorkflowHost\b|browser instance key|Connect a lesser-host control-plane token|Enter Host token|Host workflow bridge is disabled/i;

async function expectNoHostCredentialPrompt(page: Page) {
	const bodyText = await page.locator('body').innerText();
	expect(bodyText).not.toMatch(HOST_CREDENTIAL_PROMPT_TEXT);
}

async function expectNoHostCredentialStorage(page: Page) {
	const storage = await readHostCredentialStorage(page);
	expect(storage.disallowedKeys).toEqual([]);
}

test.describe('Project 44 soul-bootstrap browser guards', () => {

	test('no local drone body routes users to body creation instead of reporting a Lesser backend error', async ({ page }) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, { myAgents: 'none' });

		await page.goto('/l/identity');

		const lane = page.getByTestId('soul-bootstrap-lane');
		await expect(lane).toBeVisible();
		await expect(lane).toContainText('Create a drone body first');
		await expect(lane).toContainText('Create Drone Body');
		await expect(lane).not.toContainText('Bootstrap backend needs attention');
		await expect(lane).not.toContainText('Latest Lesser response');
		await expect(lane.getByRole('link', { name: 'Create Drone Body' })).toHaveAttribute('href', '/l/drones');

		const graphQLOperations = harness.graphQLRequests().map((request) => request.operationName);
		expect(graphQLOperations).toContain('MyAgents');
		expect(graphQLOperations).not.toContain('SoulBootstrap');
	});

	test('mocked hosted happy path completes without wallet selection or browser signing prompts', async ({ page }, testInfo) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: project44SoulBootstrapFixtures.hostedNotStarted,
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		const lane = page.getByTestId('soul-bootstrap-lane');
		await expect(lane).toBeVisible();
		await expect(lane.getByRole('heading', { name: 'Start hosted soul definition' })).toBeVisible();
		await expect(lane).toContainText('Ready to start hosted definition');
		await expect(lane).toContainText('authority: instance trust');
		await expect(lane).not.toContainText('Host is unavailable through Lesser');
		await expect(page.getByTestId('soul-bootstrap-signing-panel')).toHaveCount(0);
		await expect(page.getByTestId('hosted-soul-bootstrap-panel')).toBeVisible();
		await expect(page.getByTestId('hosted-soul-default-action')).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Start Hosted Definition' })).toBeEnabled();
		await page.getByRole('button', { name: 'Start Hosted Definition' }).click();
		await expect(page.getByTestId('hosted-soul-success')).toContainText('Hosted definition started through Lesser');
		await expect(lane).toContainText('Genesis conversation is ready');
		await expectNoHostCredentialPrompt(page);
		await expectNoHostCredentialStorage(page);

		await expect(page.getByTestId('hosted-soul-default-action')).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Send Genesis Message' })).toBeEnabled();
		await page.getByRole('button', { name: 'Send Genesis Message' }).click();
		await expect(lane).toContainText('Review hosted genesis declarations');
		await expect(page.getByTestId('hosted-soul-default-action')).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Review Generated Declarations' })).toBeEnabled();
		await page.getByRole('button', { name: 'Review Generated Declarations' }).click();
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Publish hosted/off-chain soul');
		await expect(page.getByTestId('hosted-soul-evidence')).toContainText('Hosted genesis declaration');
		await expect(page.getByTestId('hosted-soul-default-action')).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Publish Hosted Soul' })).toBeEnabled();
		await page.getByRole('button', { name: 'Publish Hosted Soul' }).click();
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Hosted/off-chain soul is active');
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('authority: instance trust');

		const walletRequests = await readProject44WalletRequests(page);
		expect(walletRequests).toEqual([]);

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Hosted/off-chain soul is active');
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText(project44SoulBootstrapIds.soulAgentId);

		const graphQLOperations = harness.graphQLRequests().map((request) => request.operationName);
		expect(graphQLOperations).toContain('SoulBootstrap');
		expect(graphQLOperations).toContain('StartHostedSoulBootstrap');
		expect(graphQLOperations).toContain('SendHostedSoulGenesisMessage');
		expect(graphQLOperations).toContain('CompleteHostedSoulGenesis');
		expect(graphQLOperations).toContain('PublishHostedSoul');
		expect(graphQLOperations).not.toContain('BeginSoulBootstrap');
		expect(graphQLOperations).not.toContain('VerifySoulBootstrapWallet');
		expect(graphQLOperations).not.toContain('VerifySoulBootstrapPrincipalDeclaration');
		expect(graphQLOperations).not.toContain('FinalizeSoulBootstrap');
		const startRequest = harness.graphQLRequests().find((request) => request.operationName === 'StartHostedSoulBootstrap');
		expect(startRequest?.variables).toMatchObject({
			input: {
				username: project44SoulBootstrapIds.username,
			},
		});
		expect(JSON.stringify(startRequest?.variables ?? {})).not.toMatch(/walletAddress|principalAddress|signature|selfAttestation/i);
		for (const request of harness.graphQLRequests()) {
			const url = new URL(request.url);
			expect(url.origin, `GraphQL operation ${request.operationName} must remain same-origin`).toBe(new URL(page.url()).origin);
			expect(url.pathname).toBe('/api/graphql');
		}
		await expectNoHostCredentialPrompt(page);
		await expectNoHostCredentialStorage(page);

		await testInfo.attach('project44-graphql-operations.json', {
			body: Buffer.from(JSON.stringify(graphQLOperations, null, 2), 'utf8'),
			contentType: 'application/json',
		});
	});

	test('REFRESH_STATE re-queries Lesser only and does not repair through completeHostedSoulGenesis', async ({ page }) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject44HostedRefreshStateSurface(),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);

		const lane = page.getByTestId('soul-bootstrap-lane');
		await expect(lane).toContainText('Hosted state should refresh');
		await expect(page.getByRole('button', { name: 'Refresh Hosted State' })).toBeEnabled();
		await page.getByRole('button', { name: 'Refresh Hosted State' }).click();

		await expect(page.getByTestId('hosted-soul-success')).toContainText(
			'Hosted soul state refreshed from Lesser'
		);
		await expect(lane).toContainText('Hosted state should refresh');

		const graphQLOperations = harness.graphQLRequests().map((request) => request.operationName);
		expect(graphQLOperations).toContain('SoulBootstrap');
		expect(graphQLOperations).not.toContain('CompleteHostedSoulGenesis');
		expect(graphQLOperations).not.toContain('PublishHostedSoul');
		await expectNoHostCredentialPrompt(page);
		await expectNoHostCredentialStorage(page);
	});

	test('profile and hosted refresh normalize null list-like fields before rendering', async ({ page }) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error.message));
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject44NullableArrayHostedRefreshStateSurface(),
			droneWorkflow: 'nullable-arrays',
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);

		const lane = page.getByTestId('soul-bootstrap-lane');
		await expect(lane).toBeVisible();
		await expect(page.getByTestId('hosted-soul-bootstrap-panel')).toBeVisible();
		await expect(page.getByTestId('public-route-error')).toHaveCount(0);
		await expect(page.getByText('Null-array continuity')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Refresh Hosted State' })).toBeEnabled();
		await page.getByRole('button', { name: 'Refresh Hosted State' }).click();

		await expect(page.getByTestId('hosted-soul-success')).toContainText(
			'Hosted soul state refreshed from Lesser'
		);
		expect(pageErrors).toEqual([]);
		const graphQLOperations = harness.graphQLRequests().map((request) => request.operationName);
		expect(graphQLOperations).toContain('DroneWorkflow');
		expect(graphQLOperations).not.toContain('CompleteHostedSoulGenesis');
		expect(graphQLOperations).not.toContain('PublishHostedSoul');
		await expectNoHostCredentialPrompt(page);
		await expectNoHostCredentialStorage(page);
	});

	test('REFRESH_STATE does not call completeHostedSoulGenesis even when a conversation id exists', async ({ page }) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject44HostedRefreshStateSurface(),
			rejectHostedGenesisComplete: true,
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);

		await page.getByRole('button', { name: 'Refresh Hosted State' }).click();
		await expect(page.getByTestId('hosted-soul-error')).toHaveCount(0);
		await expect(page.getByTestId('hosted-soul-success')).toContainText('Hosted soul state refreshed from Lesser');
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Hosted state should refresh');

		const graphQLOperations = harness.graphQLRequests().map((request) => request.operationName);
		expect(graphQLOperations).not.toContain('CompleteHostedSoulGenesis');
		expect(graphQLOperations).not.toContain('PublishHostedSoul');
		await expectNoHostCredentialPrompt(page);
		await expectNoHostCredentialStorage(page);
	});

	test('hosted publish stays blocked when Lesser omits declaration evidence', async ({ page }) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject44HostedGenesisCompleteWithoutEvidenceSurface(),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);

		const lane = page.getByTestId('soul-bootstrap-lane');
		await expect(lane).toContainText('Hosted declaration evidence is missing');
		await expect(lane).toContainText('will not publish a hosted soul from a bare conversation id');
		await expect(page.getByTestId('hosted-soul-evidence-missing')).toContainText(
			'Publication is blocked'
		);
		await expect(page.getByRole('button', { name: 'Publish Hosted Soul' })).toBeDisabled();
		expect(harness.graphQLRequests().map((request) => request.operationName)).not.toContain(
			'PublishHostedSoul'
		);
		await expectNoHostCredentialPrompt(page);
		await expectNoHostCredentialStorage(page);
	});

	test('hosted publish stays blocked when Lesser terminal evidence exists but publishGate is closed', async ({ page }) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject44HostedGenesisCompleteWithClosedPublishGateSurface(),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);

		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Hosted declaration evidence is missing');
		await expect(page.getByRole('button', { name: 'Publish Hosted Soul' })).toBeDisabled();
		expect(harness.graphQLRequests().map((request) => request.operationName)).not.toContain('PublishHostedSoul');
		await expectNoHostCredentialStorage(page);
	});

	test('typedNextAction publish is not hidden by stale recovery copy', async ({ page }) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject44HostedPublishWithStaleRecoverySurface(),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);

		const panel = page.getByTestId('hosted-soul-bootstrap-panel');
		await expect(panel.getByTestId('hosted-soul-recovery')).toContainText('REFRESH_STATE');
		await expect(page.getByTestId('hosted-soul-default-action')).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Publish Hosted Soul' })).toBeEnabled();
		await page.getByRole('button', { name: 'Publish Hosted Soul' }).click();
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Hosted/off-chain soul is active');

		const graphQLOperations = harness.graphQLRequests().map((request) => request.operationName);
		expect(graphQLOperations).toContain('PublishHostedSoul');
		expect(graphQLOperations).not.toContain('CompleteHostedSoulGenesis');
		await expectNoHostCredentialStorage(page);
	});

	test('drones roster exposes a soul-process entry point for every local body', async ({ page }) => {
		await installProject44Auth(page);
		await installProject44Routes(page, { myAgents: 'multiple' });

		await page.goto('/l/drones');

		await expect(page.getByRole('heading', { name: 'Drone bodies on this instance' })).toBeVisible();
		const startLinks = page.getByRole('link', { name: 'Define Hosted Soul' });
		await expect(startLinks).toHaveCount(2);
		await expect(startLinks.nth(0)).toHaveAttribute('href', `/l/identity/${project44SoulBootstrapIds.username}`);
		await expect(startLinks.nth(1)).toHaveAttribute('href', '/l/identity/second-drone');
	});

	test('hosted restart-required recovery uses adapter fields without wallet fallback', async ({ page }) => {
		await installProject44Auth(page);
		const harness = await installProject44Routes(page, {
			initialSurface: project44SoulBootstrapFixtures.hostedRestartRequired,
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);

		await expect(page.getByTestId('soul-bootstrap-signing-panel')).toHaveCount(0);
		const panel = page.getByTestId('hosted-soul-bootstrap-panel');
		await expect(panel).toBeVisible();
		await expect(panel).toContainText('Restart Hosted Definition');
		await expect(panel.getByTestId('hosted-soul-recovery')).toContainText('RESTART_REQUIRED');
		await expect(panel.getByTestId('hosted-soul-recovery')).toContainText('RESTART_BOOTSTRAP');
		await expect(page.getByTestId('hosted-soul-default-action')).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Restart Hosted Definition' })).toBeEnabled();
		await page.getByRole('button', { name: 'Restart Hosted Definition' }).click();
		await expect(page.getByTestId('hosted-soul-success')).toContainText('Hosted definition restarted through Lesser');
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Genesis conversation is ready');

		const operations = harness.graphQLRequests().map((request) => request.operationName);
		expect(operations).toContain('RestartSoulBootstrap');
		expect(operations).not.toContain('BeginSoulBootstrap');
		expect(JSON.stringify(harness.graphQLRequests())).not.toMatch(/walletAddress|personal_sign|hostToken|hostBaseUrl|instanceKey/i);
		await expectNoHostCredentialStorage(page);
	});

	test('pre-verification wallet can be corrected before signing the wallet challenge', async ({ page }) => {
		const wrongWallet = '0x2222222222222222222222222222222222222222';
		await installProject44Auth(page);
		await installProject44Wallet(page, { accounts: [project44SoulBootstrapIds.walletAddress] });
		const harness = await installProject44Routes(page, {
			initialSurface: createProject44BeginReadySurface({
				input: {
					walletAddress: wrongWallet,
					idempotencyKey: 'begin-wrong-wallet',
					correlationKey: 'corr-wrong-wallet',
				},
			}),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		await expect(page.getByRole('heading', { name: 'Wallet challenge signing' })).toBeVisible();
		await expect(page.getByTestId('soul-bootstrap-signing-panel')).toContainText('wrong wallet');
		await expect(page.getByTestId('soul-bootstrap-restart-button')).toBeDisabled();

		await page.getByRole('button', { name: 'Use connected wallet' }).click();
		await expect(page.getByTestId('soul-bootstrap-wallet-input')).toHaveValue(project44SoulBootstrapIds.walletAddress);
		await page.getByRole('button', { name: 'Restart with selected wallet' }).click();
		await expect(page.getByTestId('soul-bootstrap-signing-success')).toContainText('restarted through Lesser');

		const beginRequests = harness
			.graphQLRequests()
			.filter((request) => request.operationName === 'BeginSoulBootstrap');
		expect(beginRequests.at(-1)?.variables).toMatchObject({
			input: {
				username: project44SoulBootstrapIds.username,
				walletAddress: project44SoulBootstrapIds.walletAddress,
			},
		});
	});

	test('already-started principal signing can recover a missing browser wallet signature', async ({ page }) => {
		await installProject44Auth(page);
		await installProject44Wallet(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject44RecoverablePrincipalPreflightSurface(),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		await expect(page.getByRole('heading', { name: 'Principal declaration signing' })).toBeVisible();
		const signPrincipal = page.getByRole('button', { name: 'Sign principal declaration' });
		await expect(signPrincipal).toBeDisabled();
		await expect(page.getByTestId('soul-bootstrap-signing-panel')).toContainText('Re-sign the current wallet challenge');

		await page.getByRole('button', { name: 'Re-sign wallet challenge for this session' }).click();
		await expect(page.getByTestId('soul-bootstrap-signing-success')).toContainText('Wallet challenge signature recovered');
		await expect(signPrincipal).toBeEnabled();
		await signPrincipal.click();
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Genesis conversation is ready');

		const personalSignMessages = (await readProject44WalletRequests(page))
			.filter((request) => request.method === 'personal_sign')
			.map((request) => Array.isArray(request.params) ? request.params[0] : null);
		expect(personalSignMessages).toEqual([
			project44SoulBootstrapSigning.walletChallenge.message,
			project44SoulBootstrapSigning.principalDeclaration.messageHex,
		]);

		const graphQLOperations = harness.graphQLRequests().map((request) => request.operationName);
		expect(graphQLOperations).not.toContain('VerifySoulBootstrapWallet');
		expect(graphQLOperations).toContain('VerifySoulBootstrapPrincipalDeclaration');
	});

	test('backend signature rejection is not mislabeled as user cancellation', async ({ page }) => {
		await installProject44Auth(page);
		await installProject44Wallet(page);
		await installProject44Routes(page, {
			initialSurface: createProject44RecoverablePrincipalPreflightSurface(),
			rejectPrincipalVerification: true,
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		await expect(page.getByRole('heading', { name: 'Principal declaration signing' })).toBeVisible();
		await page.getByRole('button', { name: 'Re-sign wallet challenge for this session' }).click();
		await page.getByRole('button', { name: 'Sign principal declaration' }).click();

		const error = page.getByTestId('soul-bootstrap-signing-error');
		await expect(error).toContainText('Lesser rejected the principal_declaration submission');
		await expect(error).toContainText('Signature rejected by Host verifier');
		await expect(error).not.toContainText('Wallet signing was rejected by the user');
	});

		test('ERROR phase with retained signing checkpoint remains retryable in-instance', async ({ page }) => {
		await installProject44Auth(page);
		await installProject44Wallet(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject44RecoverablePrincipalErrorSurface(),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		const lane = page.getByTestId('soul-bootstrap-lane');
		await expect(lane).toContainText('Wallet or signature was rejected');
		await expect(lane).toContainText('Signature rejected by Host verifier');
		await expect(page.getByRole('heading', { name: 'Principal declaration signing' })).toBeVisible();
		await expect(page.getByTestId('soul-bootstrap-signing-panel')).not.toContainText('Soul bootstrap phase ERROR does not have an active signing plan');

		await page.getByRole('button', { name: 'Re-sign wallet challenge for this session' }).click();
		await page.getByRole('button', { name: 'Sign principal declaration' }).click();
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Genesis conversation is ready');

		const graphQLOperations = harness.graphQLRequests().map((request) => request.operationName);
			expect(graphQLOperations).toContain('VerifySoulBootstrapPrincipalDeclaration');
		});

		test('stale or invalid pre-binding error can restart instead of locking the operator into retry', async ({ page }) => {
			await installProject44Auth(page);
			await installProject44Wallet(page);
			const harness = await installProject44Routes(page, {
				initialSurface: createProject44GenericBootstrapErrorSurface(),
			});

			await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
			const panel = page.getByTestId('soul-bootstrap-signing-panel');
			await expect(page.getByRole('heading', { name: 'Principal declaration signing' })).toBeVisible();
			await expect(panel).toContainText('Recovery is available before final binding');
			await expect(panel).toContainText('Restart creates fresh Host registration state');
			await expect(page.getByRole('button', { name: 'Restart with selected wallet' })).toBeDisabled();

			await page.getByRole('button', { name: 'Use connected wallet' }).click();
			await page.getByRole('button', { name: 'Restart with selected wallet' }).click();

			await expect(page.getByTestId('soul-bootstrap-signing-success')).toContainText('Soul bootstrap was restarted through Lesser');
			await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Wallet challenge is ready');

			const graphQLRequests = harness.graphQLRequests();
			const restartRequest = graphQLRequests
				.filter((request) => request.operationName === 'BeginSoulBootstrap')
				.at(-1);
			expect(restartRequest?.variables).toMatchObject({
				input: {
					username: project44SoulBootstrapIds.username,
					walletAddress: project44SoulBootstrapIds.walletAddress,
				},
			});
			expect(
				(restartRequest?.variables.input as { idempotencyKey?: string }).idempotencyKey
			).not.toBe(project44SoulBootstrapIds.beginIdempotencyKey);
			expect(graphQLRequests.map((request) => request.operationName)).not.toContain('VerifySoulBootstrapPrincipalDeclaration');
		});

		test('normal pre-binding resume states also expose restart recovery before final binding', async ({ page }) => {
			await installProject44Auth(page);
			await installProject44Wallet(page);
			const harness = await installProject44Routes(page, { initialSurface: 'walletVerified' });

			await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);

			const cases = [
				{ surface: 'walletVerified', heading: 'Prepare principal declaration' },
				{ surface: 'principalDeclarationPreflight', heading: 'Principal declaration signing' },
				{ surface: 'finalizePreflight', heading: 'Finalize self-attestation signing' },
			] as const;

			for (const item of cases) {
				harness.setSurface(item.surface);
				await page.getByRole('button', { name: 'Refresh', exact: true }).click();
				const panel = page.getByTestId('soul-bootstrap-signing-panel');
				await expect(page.getByRole('heading', { name: item.heading })).toBeVisible();
				await expect(panel.getByTestId('soul-bootstrap-restart-recovery')).toBeVisible();
				await expect(panel).toContainText('Recovery is available before final binding');
				await expect(panel.getByRole('button', { name: 'Restart with selected wallet' })).toBeDisabled();
			}
		});

		test('missing Host registration restarts instead of retrying stale signing material', async ({ page }) => {
		await installProject44Auth(page);
		await installProject44Wallet(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject44MissingRegistrationErrorSurface(),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		const lane = page.getByTestId('soul-bootstrap-lane');
		await expect(lane).toContainText('Host registration was not found');
		await expect(page.getByRole('heading', { name: 'Restart soul bootstrap' })).toBeVisible();
		await expect(page.getByTestId('soul-bootstrap-signing-panel')).toContainText('retry-signing cannot progress');
		await expect(page.getByRole('button', { name: 'Sign principal declaration' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Restart with selected wallet' })).toBeDisabled();

		await page.getByRole('button', { name: 'Use connected wallet' }).click();
		await page.getByRole('button', { name: 'Restart with selected wallet' }).click();
		await expect(page.getByTestId('soul-bootstrap-signing-success')).toContainText('Soul bootstrap was restarted through Lesser');
		await expect(lane).toContainText('Wallet challenge is ready');
		await page.getByRole('button', { name: 'Sign wallet challenge' }).click();
		await expect(page.getByRole('heading', { name: 'Prepare principal declaration' })).toBeVisible();
		await page.getByRole('button', { name: 'Prepare principal declaration' }).click();
		await expect(page.getByRole('heading', { name: 'Principal declaration signing' })).toBeVisible();
		await page.getByRole('button', { name: 'Sign principal declaration' }).click();
		await expect(lane).toContainText('Genesis conversation is ready');

		const graphQLRequests = harness.graphQLRequests();
		const graphQLOperations = graphQLRequests.map((request) => request.operationName);
		expect(graphQLOperations).toContain('BeginSoulBootstrap');
		expect(graphQLOperations).toContain('VerifySoulBootstrapPrincipalDeclaration');
		const walletVerify = graphQLRequests.find((request) => request.operationName === 'VerifySoulBootstrapWallet');
		const principalVerify = graphQLRequests.find((request) => request.operationName === 'VerifySoulBootstrapPrincipalDeclaration');
		expect(walletVerify?.variables).toMatchObject({
			input: {
				registrationId: project44SoulBootstrapIds.registrationId,
			},
		});
		expect(principalVerify?.variables).toMatchObject({
			input: {
				registrationId: project44SoulBootstrapIds.registrationId,
			},
		});
		expect((walletVerify?.variables.input as { idempotencyKey?: string }).idempotencyKey).not.toBe(project44SoulBootstrapIds.walletIdempotencyKey);
		expect((principalVerify?.variables.input as { idempotencyKey?: string }).idempotencyKey).not.toBe(project44SoulBootstrapIds.principalIdempotencyKey);
	});

	test('Host bootstrap conflict after principal verification offers a genesis retry', async ({ page }) => {
		await installProject44Auth(page);
		await installProject44Wallet(page);
		const harness = await installProject44Routes(page, {
			initialSurface: createProject44ConversationConflictSurface(),
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		const panel = page.getByTestId('soul-bootstrap-signing-panel');
		await expect(panel).toContainText('bootstrap conflict');
		await expect(page.getByRole('heading', { name: 'Start genesis conversation' })).toBeVisible();
		await expect(panel).toContainText('retry the same genesis lane');
		await page.getByRole('button', { name: 'Start genesis conversation' }).click();
		await expect(page.getByTestId('soul-bootstrap-signing-success')).toContainText('Genesis conversation turn completed');

		const graphQLOperations = harness.graphQLRequests().map((request) => request.operationName);
		expect(graphQLOperations).toContain('SendSoulBootstrapConversationMessage');
		expect(graphQLOperations).not.toContain('BeginSoulBootstrap');
	});

	test('expired registration during genesis retry refreshes into restart lane', async ({ page }) => {
		await installProject44Auth(page);
		await installProject44Wallet(page);
		await installProject44Routes(page, {
			initialSurface: createProject44ConversationConflictSurface(),
			rejectConversationMessageWithMissingRegistration: true,
		});

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		await page.getByRole('button', { name: 'Start genesis conversation' }).click();

		const panel = page.getByTestId('soul-bootstrap-signing-panel');
		await expect(panel).toContainText('Lesser rejected the genesis conversation message: Host registration was not found.');
		await expect(page.getByRole('heading', { name: 'Restart soul bootstrap' })).toBeVisible();
		await expect(panel).toContainText('retry-signing cannot progress');
		await expect(page.getByRole('button', { name: 'Restart with selected wallet' })).toBeVisible();
	});

	test('workflow panels expand with the FaceTheory stage instead of a narrow centered column', async ({ page }) => {
		await page.setViewportSize({ width: 1600, height: 1000 });
		await installProject44Auth(page);
		await installProject44Wallet(page);
		await installProject44Routes(page, { initialSurface: 'notStarted' });

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		await expect(page.getByTestId('soul-bootstrap-lane')).toBeVisible();

		const dimensions = await page.evaluate(() => {
			const frame = document.querySelector('.agent-face-frame');
			const sidebar = document.querySelector('.agent-face-frame__sidebar');
			const stage = document.querySelector('.ft-shell__stage');
			const panels = document.querySelector('.ft-shell__panels');
			const firstPanel = document.querySelector('[data-testid="soul-bootstrap-lane"]');
			const sidebarStyle = sidebar ? window.getComputedStyle(sidebar) : null;
			const panelRects = Array.from(document.querySelectorAll('.ft-shell__panels > .ft-panel'))
				.map((panel) => panel.getBoundingClientRect());

			return {
				frameHeight: frame?.getBoundingClientRect().height ?? 0,
				sidebarHeight: sidebar?.getBoundingClientRect().height ?? 0,
				sidebarOverflowY: sidebarStyle?.overflowY ?? null,
				sidebarPosition: sidebarStyle?.position ?? null,
				stageWidth: stage?.getBoundingClientRect().width ?? 0,
				panelsWidth: panels?.getBoundingClientRect().width ?? 0,
				firstPanelWidth: firstPanel?.getBoundingClientRect().width ?? 0,
				firstPanelHeight: firstPanel?.getBoundingClientRect().height ?? 0,
				panelCount: panelRects.length,
				panelWidths: panelRects.map((rect) => rect.width),
			};
		});

		expect(dimensions.sidebarHeight).toBeGreaterThanOrEqual(dimensions.frameHeight - 1);
		expect(dimensions.sidebarOverflowY).not.toBe('auto');
		expect(dimensions.sidebarPosition).not.toBe('sticky');
		expect(dimensions.stageWidth).toBeGreaterThan(1200);
		expect(dimensions.panelsWidth).toBeGreaterThan(dimensions.stageWidth * 0.9);
		expect(dimensions.panelCount).toBeGreaterThanOrEqual(4);
		for (const panelWidth of dimensions.panelWidths) {
			expect(panelWidth).toBeGreaterThan(600);
		}
		expect(dimensions.firstPanelWidth).toBeGreaterThan(600);
		expect(dimensions.firstPanelHeight).toBeLessThan(600);
	});

	test('missing Host trust and server-side bridge unavailable fail closed without browser Host credentials', async ({ page }) => {
		await installProject44Auth(page);
		await installProject44Wallet(page);
		const harness = await installProject44Routes(page, { initialSurface: 'missingTrust' });

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Operator action required');
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Trusted Lesser identity is required');
		await expect(page.getByTestId('hosted-soul-bootstrap-panel')).toContainText('Refresh After Operator Action');
		await expect(page.getByTestId('hosted-soul-recovery')).toContainText('CONTACT_OPERATOR');
		await expectNoHostCredentialPrompt(page);
		await expectNoHostCredentialStorage(page);

		harness.setSurface(createProject44HostUnavailableSurface());
		await page.getByRole('button', { name: 'Refresh', exact: true }).click();
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Host is unavailable through Lesser');
		await expectNoHostCredentialPrompt(page);
		await expectNoHostCredentialStorage(page);
	});

	test('wallet signing rejection surfaces fail-closed UI and does not submit Host or GraphQL writes', async ({ page }) => {
		await installProject44Auth(page);
		await installProject44Wallet(page, { rejectPersonalSign: true });
		const harness = await installProject44Routes(page, { initialSurface: project44SoulBootstrapFixtures.walletChallenge });

		await page.goto('/l/approvals');
		await expect(page.getByRole('heading', { name: 'Wallet challenge signing' })).toBeVisible();
		await page.getByRole('button', { name: 'Sign wallet challenge' }).click();
		await expect(page.getByTestId('soul-bootstrap-signing-error')).toContainText('Wallet signing was rejected by the user');
		expect(harness.graphQLRequests().map((request) => request.operationName)).not.toContain('VerifySoulBootstrapWallet');
		await expectNoHostCredentialPrompt(page);
		await expectNoHostCredentialStorage(page);
	});
});
