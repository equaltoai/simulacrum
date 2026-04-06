import { test, expect } from './_harness/fixtures';
import {
	expectExploreReady,
	expectProfileReady,
	expectPublicRouteShell,
	expectStatusReady,
} from './_harness/publicAssertions';
import { resolveLivePublicScenario, type LivePublicScenario } from './_harness/liveScenarios';
import { gotoPublicRoute } from './_harness/publicRoutes';

let liveScenario: LivePublicScenario;

test.describe('public route live smoke', () => {
	test.describe.configure({ mode: 'serial' });

	test.beforeAll(async () => {
		liveScenario = await resolveLivePublicScenario();
	});

	test.beforeEach(async ({ page }, testInfo) => {
		await testInfo.attach('live-scenario.json', {
			body: Buffer.from(JSON.stringify(liveScenario, null, 2), 'utf8'),
			contentType: 'application/json',
		});
		await page.addInitScript((scenario) => {
			(window as Window & { __SIM_LIVE_SCENARIO__?: unknown }).__SIM_LIVE_SCENARIO__ = scenario;
		}, liveScenario);
	});

	test('explore resolves on the live public timeline', async ({ page }) => {
		await gotoPublicRoute(page, 'explore');
		await expectPublicRouteShell(page, 'explore');
		await expectExploreReady(page);
	});

	test('profile resolves for a live public actor', async ({ page }) => {
		await page.goto(liveScenario.profilePath);
		await expectPublicRouteShell(page, 'profile');
		await expectProfileReady(page);
		await expect(page.getByRole('link', { name: 'Canonical profile link' })).toBeVisible();
	});

	test('status resolves for a live public post', async ({ page }) => {
		await page.goto(liveScenario.statusPath);
		await expectPublicRouteShell(page, 'status');
		await expectStatusReady(page);
	});
});
