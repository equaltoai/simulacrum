import type { Page } from '@playwright/test';

import { test } from './_harness/fixtures';
import {
	expectPublicRouteError,
	expectPublicRouteShell,
} from './_harness/publicAssertions';
import {
	gotoPublicRoute,
	simulatePublicGraphQLFailure,
	type PublicRouteKey,
} from './_harness/publicRoutes';

async function expectRouteErrorFlow(routeKey: PublicRouteKey, page: Page) {
	await simulatePublicGraphQLFailure(page);
	await gotoPublicRoute(page, routeKey);
	await expectPublicRouteShell(page, routeKey);
	await expectPublicRouteError(page, routeKey);
}

test.describe('public route harness', () => {
	test('explore can be driven through the shared async-route helpers', async ({ page }) => {
		await expectRouteErrorFlow('explore', page);
	});

	test('profile can be driven through the shared async-route helpers', async ({ page }) => {
		await expectRouteErrorFlow('profile', page);
	});

	test('status can be driven through the shared async-route helpers', async ({ page }) => {
		await expectRouteErrorFlow('status', page);
	});
});
