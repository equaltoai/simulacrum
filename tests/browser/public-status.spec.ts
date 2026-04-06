import type { Page } from '@playwright/test';

import { test, expect } from './_harness/fixtures';
import { expectPublicRouteShell, expectStatusReady } from './_harness/publicAssertions';
import { buildMockStatus, mockPublicGraphQL } from './_harness/publicGraphqlMocks';
import { gotoPublicRoute } from './_harness/publicRoutes';

async function installGraphqlFetchDelay(page: Page, pageDelayMs: number) {
	await page.addInitScript(
		({ delayMs }: { delayMs: number }) => {
			const originalFetch = window.fetch.bind(window);

			window.fetch = async (...args) => {
				const request = args[0] as Request | string | URL;
				const url =
					typeof request === 'string'
						? request
						: request instanceof URL
							? request.toString()
							: request.url;

				if (url.includes('/api/graphql')) {
					await new Promise((resolve) => setTimeout(resolve, delayMs));
				}

				return originalFetch(...args);
			};
		},
		{ delayMs: pageDelayMs }
	);
}

test.describe('public status route', () => {
	test('renders the shell, loading state, and deterministic thread content', async ({ page }) => {
		const rootAuthor = {
			username: 'harness-root-author',
			displayName: 'Harness Root Author',
			summary: 'Author for the deterministic status root',
		};
		const ancestorAuthor = {
			username: 'harness-ancestor-author',
			displayName: 'Harness Ancestor Author',
			summary: 'Author for the deterministic ancestor',
		};
		const descendantAuthor = {
			username: 'harness-descendant-author',
			displayName: 'Harness Descendant Author',
			summary: 'Author for the deterministic descendant',
		};
		const previousAuthor = {
			username: 'harness-previous-author',
			displayName: 'Harness Previous Author',
		};

		const rootStatus = buildMockStatus({
			id: 'harness-status-root',
			actor: rootAuthor,
			content: 'Root note resolved from the deterministic GraphQL mock.',
			repliesCount: 2,
			sharesCount: 1,
			likesCount: 5,
		});
		const ancestorStatus = buildMockStatus({
			id: 'harness-status-ancestor',
			actor: ancestorAuthor,
			content: 'Ancestor note shown above the root post.',
			repliesCount: 1,
			inReplyTo: {
				id: 'harness-status-previous',
				actor: previousAuthor,
			},
		});
		const descendantStatus = buildMockStatus({
			id: 'harness-status-descendant',
			actor: descendantAuthor,
			content: 'Descendant reply shown below the root post.',
			repliesCount: 0,
			inReplyTo: {
				id: rootStatus.id,
				actor: rootAuthor,
			},
		});

		await installGraphqlFetchDelay(page, 250);
		await mockPublicGraphQL(page, {
			threadContext: {
				rootNote: rootStatus,
				ancestors: [ancestorStatus],
				descendants: [descendantStatus],
			},
		});

		await gotoPublicRoute(page, 'status', `/l/status/${rootStatus.id}`);
		await expectPublicRouteShell(page, 'status');
		await expect(page.getByTestId('public-route-loading')).toBeVisible();

		await expectStatusReady(page);
		await expect(page.getByTestId('public-route-ready')).toBeVisible();
		await expect(page.locator('[data-testid="public-status-card"][data-status-id="harness-status-ancestor"]')).toBeVisible();
		await expect(page.locator('[data-testid="public-status-card"][data-status-id="harness-status-root"]')).toBeVisible();
		await expect(page.locator('[data-testid="public-status-card"][data-status-id="harness-status-descendant"]')).toBeVisible();
		await expect(page.getByTestId('public-status-ancestors')).toContainText('Ancestor note shown above the root post.');
		await expect(page.getByTestId('public-status-focus')).toContainText(
			'Root note resolved from the deterministic GraphQL mock.'
		);
		await expect(page.getByTestId('public-status-descendants')).toContainText(
			'Descendant reply shown below the root post.'
		);
	});
});
