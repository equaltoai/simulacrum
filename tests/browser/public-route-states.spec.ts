import { expect } from '@playwright/test';

import { test } from './_harness/fixtures';
import {
	expectExploreEmpty,
	expectProfileReadyEmptyPosts,
	expectPublicRouteError,
	expectPublicRouteLoading,
	expectPublicRouteNotFound,
	expectPublicRouteShell,
} from './_harness/publicAssertions';
import {
	buildMockActor,
	delayPublicGraphQL,
	mockPublicGraphQL,
} from './_harness/publicGraphqlMocks';
import { gotoPublicRoute, simulatePublicGraphQLFailure } from './_harness/publicRoutes';

const LOADING_DELAY_MS = 150;

test.describe('public route state coverage', () => {
	test('explore reaches the empty state after loading when no public posts resolve', async ({
		page,
	}) => {
		await mockPublicGraphQL(page, {
			timeline: {
				statuses: [],
			},
		});
		await delayPublicGraphQL(page, LOADING_DELAY_MS);

		await gotoPublicRoute(page, 'explore');

		await expectPublicRouteShell(page, 'explore');
		await expectPublicRouteLoading(page, 'explore');
		await expectExploreEmpty(page);
	});

	test('explore surfaces a route-level error when the public timeline request fails', async ({
		page,
	}) => {
		await simulatePublicGraphQLFailure(page, { delayMs: LOADING_DELAY_MS });

		await gotoPublicRoute(page, 'explore');

		await expectPublicRouteShell(page, 'explore');
		await expectPublicRouteLoading(page, 'explore');
		await expectPublicRouteError(page, 'explore');
	});

	test('profile reaches the ready empty-posts state after loading when the actor has no posts', async ({
		page,
	}) => {
		const actor = buildMockActor({
			username: 'empty-profile',
			domain: null,
			displayName: 'Empty Profile',
			summary: 'Deterministic profile fixture without public posts.',
			statusesCount: 0,
		});

		await mockPublicGraphQL(page, {
			actorProfile: { actor },
			actorTimeline: { statuses: [] },
		});
		await delayPublicGraphQL(page, LOADING_DELAY_MS);

		await gotoPublicRoute(page, 'profile', '/l/profile/empty-profile');

		await expectPublicRouteShell(page, 'profile');
		await expectPublicRouteLoading(page, 'profile');
		await expectProfileReadyEmptyPosts(page);
		await expect(page.getByTestId('public-profile-handle')).toHaveText('@empty-profile');
		await expect(page.getByText('Deterministic profile fixture without public posts.')).toBeVisible();
	});

	test('profile reaches a route-level not-found state when the actor lookup misses', async ({
		page,
	}) => {
		await mockPublicGraphQL(page, {
			actorProfile: { actor: null },
		});
		await delayPublicGraphQL(page, LOADING_DELAY_MS);

		await gotoPublicRoute(page, 'profile', '/l/profile/missing-profile');

		await expectPublicRouteShell(page, 'profile');
		await expectPublicRouteLoading(page, 'profile');
		await expectPublicRouteNotFound(page, 'profile');
	});

	test('profile surfaces a route-level error when the actor request fails', async ({ page }) => {
		await simulatePublicGraphQLFailure(page, { delayMs: LOADING_DELAY_MS });

		await gotoPublicRoute(page, 'profile', '/l/profile/failing-profile');

		await expectPublicRouteShell(page, 'profile');
		await expectPublicRouteLoading(page, 'profile');
		await expectPublicRouteError(page, 'profile');
	});

	test('status reaches a route-level not-found state when the thread lookup misses', async ({
		page,
	}) => {
		await mockPublicGraphQL(page, {
			threadContext: {
				rootNote: null,
				ancestors: [],
				descendants: [],
			},
		});
		await delayPublicGraphQL(page, LOADING_DELAY_MS);

		await gotoPublicRoute(page, 'status', '/l/status/missing-status');

		await expectPublicRouteShell(page, 'status');
		await expectPublicRouteLoading(page, 'status');
		await expectPublicRouteNotFound(page, 'status');
	});

	test('status surfaces a route-level error when the thread request fails', async ({ page }) => {
		await simulatePublicGraphQLFailure(page, { delayMs: LOADING_DELAY_MS });

		await gotoPublicRoute(page, 'status', '/l/status/failing-status');

		await expectPublicRouteShell(page, 'status');
		await expectPublicRouteLoading(page, 'status');
		await expectPublicRouteError(page, 'status');
	});
});
