import { expect, type Page } from '@playwright/test';

import { test } from './_harness/fixtures';
import {
	createProject44HostUnavailableSurface,
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
	test('mocked route lanes cover begin, signing, conversation, finalize, and hosted/off-chain result without Host credentials', async ({ page }, testInfo) => {
		await installProject44Auth(page);
		await installProject44Wallet(page);
		const harness = await installProject44Routes(page, { initialSurface: 'notStarted' });

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		const lane = page.getByTestId('soul-bootstrap-lane');
		await expect(lane).toBeVisible();
		await expect(lane.getByRole('heading', { name: 'Start Sim-led soul creation' })).toBeVisible();
		await expect(lane).toContainText('Ready to begin');
		await expectNoHostCredentialPrompt(page);
		await expectNoHostCredentialStorage(page);

		harness.setSurface('walletChallenge');
		await page.goto('/l/souls/genesis');
		await expect(page.getByTestId('soul-bootstrap-signing-panel')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Wallet challenge signing' })).toBeVisible();
		await page.getByRole('button', { name: 'Sign wallet challenge' }).click();
		await expect(page.getByTestId('soul-bootstrap-signing-success')).toContainText('Wallet challenge signature accepted by Lesser');

		await expect(page.getByRole('heading', { name: 'Principal declaration signing' })).toBeVisible();
		await page.getByRole('button', { name: 'Sign principal declaration' }).click();
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Genesis conversation is ready');

		harness.setSurface('finalizePreflight');
		await page.getByRole('button', { name: 'Refresh', exact: true }).click();
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Finalize signing is ready');
		await expect(page.getByRole('heading', { name: 'Finalize self-attestation signing' })).toBeVisible();
		await page.getByRole('button', { name: 'Sign finalize attestation' }).click();
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Production soul is active');
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('hosted/off-chain soul bound');

		const walletRequests = await readProject44WalletRequests(page);
		const personalSignMessages = walletRequests
			.filter((request) => request.method === 'personal_sign')
			.map((request) => Array.isArray(request.params) ? request.params[0] : null);
		expect(personalSignMessages).toEqual([
			project44SoulBootstrapSigning.walletChallenge.message,
			project44SoulBootstrapSigning.principalDeclaration.messageHex,
			project44SoulBootstrapSigning.finalize.messageHex,
		]);

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Production soul is active');
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText(project44SoulBootstrapIds.soulAgentId);

		const graphQLOperations = harness.graphQLRequests().map((request) => request.operationName);
		expect(graphQLOperations).toContain('SoulBootstrap');
		expect(graphQLOperations).toContain('VerifySoulBootstrapWallet');
		expect(graphQLOperations).toContain('VerifySoulBootstrapPrincipalDeclaration');
		expect(graphQLOperations).toContain('FinalizeSoulBootstrap');
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

	test('missing Host trust and server-side bridge unavailable fail closed without browser Host credentials', async ({ page }) => {
		await installProject44Auth(page);
		await installProject44Wallet(page);
		const harness = await installProject44Routes(page, { initialSurface: 'missingTrust' });

		await page.goto(`/l/identity/${project44SoulBootstrapIds.username}`);
		await expect(page.getByTestId('soul-bootstrap-lane')).toContainText('Host trust is not configured');
		await expect(page.getByTestId('soul-bootstrap-signing-panel')).toContainText('No active signing plan');
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
