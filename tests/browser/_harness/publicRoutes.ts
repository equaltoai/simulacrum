import type { Page } from '@playwright/test';

export const PUBLIC_ROUTE_HEADINGS = {
	explore: 'Explore',
	profile: 'Profile',
	status: 'Post',
} as const;

export const PUBLIC_ROUTE_LOADING_TEXT = {
	explore: 'Loading public timeline...',
	profile: 'Loading profile…',
	status: 'Loading post...',
} as const;

export const PUBLIC_ROUTE_PATHS = {
	explore: '/l/explore',
	profile: '/l/profile/harness-profile',
	status: '/l/status/harness-status',
} as const;

export type PublicRouteKey = keyof typeof PUBLIC_ROUTE_PATHS;

export async function gotoPublicRoute(page: Page, routeKey: PublicRouteKey, pathname?: string) {
	await page.goto(pathname ?? PUBLIC_ROUTE_PATHS[routeKey]);
}

export async function simulatePublicGraphQLFailure(page: Page) {
	await page.route('**/api/graphql', async (route) => {
		await route.abort('failed');
	});
}
