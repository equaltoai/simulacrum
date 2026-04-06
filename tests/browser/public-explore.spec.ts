import { test, expect } from './_harness/fixtures';
import {
	expectExploreReady,
	expectPublicRouteLoading,
	expectPublicRouteShell,
} from './_harness/publicAssertions';
import { gotoPublicRoute } from './_harness/publicRoutes';
import { buildMockStatus, delayPublicGraphQL, mockPublicGraphQL } from './_harness/publicGraphqlMocks';

const LOADING_DELAY_MS = 150;

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
		await delayPublicGraphQL(page, LOADING_DELAY_MS);

		await gotoPublicRoute(page, 'explore');

		await expectPublicRouteShell(page, 'explore');
		await expectPublicRouteLoading(page, 'explore');

		await expectExploreReady(page);
		await expect(page.getByTestId('public-explore-timeline')).toBeVisible();
		await expect(page.getByTestId('public-status-card')).toHaveAttribute(
			'data-status-id',
			'explore-status-1'
		);
		await expect(page.getByText('Deterministic explore status', { exact: true })).toBeVisible();
	});
});
