import { test, expect } from './_harness/fixtures';
import {
	expectExploreReady,
	expectPublicRouteShell,
} from './_harness/publicAssertions';
import { gotoPublicRoute } from './_harness/publicRoutes';
import { buildMockStatus, mockPublicGraphQL } from './_harness/publicGraphqlMocks';

test.describe('public explore', () => {
	test('renders the shell and settles into a deterministic public timeline', async ({ page }) => {
		const status = buildMockStatus({
			id: 'explore-status-1',
			content: 'Deterministic explore status',
			actor: {
				username: 'explore-author',
				displayName: 'Explore Author',
			},
		});

		await mockPublicGraphQL(page, {
			timeline: {
				statuses: [status],
			},
		});

		await page.route('**/api/graphql', async (route) => {
			await page.waitForTimeout(150);
			await route.fallback();
		});

		await gotoPublicRoute(page, 'explore');

		await expectPublicRouteShell(page, 'explore');
		await expect(page.getByTestId('public-route-loading')).toBeVisible();

		await expectExploreReady(page);
		await expect(page.getByTestId('public-explore-timeline')).toBeVisible();
		await expect(page.getByTestId('public-status-card')).toHaveAttribute(
			'data-status-id',
			'explore-status-1'
		);
		await expect(page.getByText('Deterministic explore status', { exact: true })).toBeVisible();
	});
});
