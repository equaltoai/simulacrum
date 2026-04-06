import { expect, type Locator, type Page } from '@playwright/test';

import {
	PUBLIC_ROUTE_HEADINGS,
	PUBLIC_ROUTE_LOADING_TEXT,
	type PublicRouteKey,
} from './publicRoutes';

export type PublicRouteState =
	| 'loading'
	| 'ready'
	| 'empty'
	| 'not-found'
	| 'error'
	| 'unknown';

async function isVisible(locator: Locator): Promise<boolean> {
	try {
		return await locator.isVisible();
	} catch {
		return false;
	}
}

function statusCardLocator(page: Page) {
	return page.getByRole('button', { name: /Status by / }).first();
}

function routeRootLocator(page: Page, routeKey: PublicRouteKey) {
	return page.locator(`[data-testid="public-route"][data-route-key="${routeKey}"]`).first();
}

async function getPublicRouteState(page: Page, routeKey: PublicRouteKey): Promise<PublicRouteState> {
	const routeRoot = routeRootLocator(page, routeKey);
	if ((await routeRoot.count()) > 0) {
		if (await isVisible(routeRoot.getByTestId('public-route-error').first())) {
			return 'error';
		}

		if (await isVisible(routeRoot.getByTestId('public-route-loading').first())) {
			return 'loading';
		}

		if (await isVisible(routeRoot.getByTestId('public-route-empty').first())) {
			return 'empty';
		}

		if (await isVisible(routeRoot.getByTestId('public-route-not-found').first())) {
			return 'not-found';
		}

		if (await isVisible(routeRoot.getByTestId('public-route-ready').first())) {
			return 'ready';
		}

		return 'unknown';
	}

	if (await isVisible(page.getByRole('alert').first())) {
		return 'error';
	}

	if (await isVisible(page.getByText(PUBLIC_ROUTE_LOADING_TEXT[routeKey], { exact: true }))) {
		return 'loading';
	}

	switch (routeKey) {
		case 'explore':
			if (await isVisible(statusCardLocator(page))) return 'ready';
			if (await isVisible(page.getByText('No public posts available yet.', { exact: true }))) {
				return 'empty';
			}
			return 'unknown';

		case 'profile':
			if (await isVisible(page.getByText('Profile not found.', { exact: true }))) {
				return 'not-found';
			}
			if (await isVisible(page.getByRole('link', { name: 'Canonical profile link' }))) {
				return 'ready';
			}
			return 'unknown';

		case 'status':
			if (await isVisible(page.getByText('Post not found.', { exact: true }))) {
				return 'not-found';
			}
			if (await isVisible(statusCardLocator(page))) {
				return 'ready';
			}
			return 'unknown';
	}
}

export async function expectPublicRouteShell(page: Page, routeKey: PublicRouteKey) {
	const routeRoot = routeRootLocator(page, routeKey);
	if ((await routeRoot.count()) > 0) {
		await expect(routeRoot).toBeVisible();
		await expect(
			page.getByTestId('public-route-hero').getByRole('heading', {
				level: 1,
				name: PUBLIC_ROUTE_HEADINGS[routeKey],
				exact: true,
			})
		).toBeVisible();
		return;
	}

	await expect(
		page.getByRole('heading', { level: 1, name: PUBLIC_ROUTE_HEADINGS[routeKey], exact: true })
	).toBeVisible();
}

export async function waitForPublicRouteSettlement(
	page: Page,
	routeKey: PublicRouteKey,
	timeout = 15_000
): Promise<PublicRouteState> {
	let settledState: PublicRouteState = 'unknown';
	await expect
		.poll(
			async () => {
				const state = await getPublicRouteState(page, routeKey);
				settledState = state;
				return state === 'ready' || state === 'empty' || state === 'not-found' || state === 'error';
			},
			{
				timeout,
				message: `Timed out waiting for ${routeKey} to reach a terminal public route state.`,
			}
		)
		.toBe(true);

	return settledState;
}

export async function expectPublicRouteError(page: Page, routeKey: PublicRouteKey) {
	const state = await waitForPublicRouteSettlement(page, routeKey);
	expect(state).toBe('error');
	const routeRoot = routeRootLocator(page, routeKey);
	if ((await routeRoot.count()) > 0) {
		await expect(routeRoot.getByTestId('public-route-error').first()).toBeVisible();
		return;
	}

	await expect(page.getByRole('alert').first()).toBeVisible();
}

export async function expectPublicRouteLoading(page: Page, routeKey: PublicRouteKey) {
	const routeRoot = routeRootLocator(page, routeKey);
	if ((await routeRoot.count()) > 0) {
		await expect(routeRoot.getByTestId('public-route-loading').first()).toBeVisible();
		return;
	}

	await expect(page.getByText(PUBLIC_ROUTE_LOADING_TEXT[routeKey], { exact: true })).toBeVisible();
}

export async function expectPublicRouteNotFound(page: Page, routeKey: PublicRouteKey) {
	const state = await waitForPublicRouteSettlement(page, routeKey);
	expect(state).toBe('not-found');
	const routeRoot = routeRootLocator(page, routeKey);
	if ((await routeRoot.count()) > 0) {
		await expect(routeRoot.getByTestId('public-route-not-found').first()).toBeVisible();
		return;
	}

	const fallbackText = routeKey === 'profile' ? 'Profile not found.' : 'Post not found.';
	await expect(page.getByText(fallbackText, { exact: true })).toBeVisible();
}

export async function expectExploreEmpty(page: Page) {
	const state = await waitForPublicRouteSettlement(page, 'explore');
	expect(state).toBe('empty');
	if ((await routeRootLocator(page, 'explore').count()) > 0) {
		await expect(page.getByTestId('public-route-empty')).toBeVisible();
	}
	await expect(page.getByText('No public posts available yet.', { exact: true })).toBeVisible();
}

export async function expectExploreReady(page: Page) {
	const state = await waitForPublicRouteSettlement(page, 'explore');
	expect(state).toBe('ready');
	if ((await routeRootLocator(page, 'explore').count()) > 0) {
		await expect(page.getByTestId('public-explore-timeline')).toBeVisible();
	}
	await expect(statusCardLocator(page)).toBeVisible();
}

export async function expectProfileReady(page: Page) {
	const state = await waitForPublicRouteSettlement(page, 'profile');
	expect(state).toBe('ready');
	if ((await routeRootLocator(page, 'profile').count()) > 0) {
		await expect(page.getByTestId('public-profile-header')).toBeVisible();
		await expect(page.getByTestId('public-profile-handle')).toBeVisible();
		await expect(page.getByTestId('public-profile-stats')).toBeVisible();
	}
	await expect(page.getByRole('link', { name: 'Canonical profile link' })).toBeVisible();
}

export async function expectProfileReadyEmptyPosts(page: Page) {
	await expectProfileReady(page);
	await expect(page.getByTestId('public-profile-empty-posts')).toBeVisible();
	await expect(page.getByTestId('public-profile-timeline')).toHaveCount(0);
	await expect(page.getByTestId('public-status-card')).toHaveCount(0);
}

export async function expectStatusReady(page: Page) {
	const state = await waitForPublicRouteSettlement(page, 'status');
	expect(state).toBe('ready');
	if ((await routeRootLocator(page, 'status').count()) > 0) {
		await expect(page.getByTestId('public-status-thread')).toBeVisible();
		await expect(page.getByTestId('public-status-focus')).toBeVisible();
	}
	await expect(statusCardLocator(page)).toBeVisible();
}
