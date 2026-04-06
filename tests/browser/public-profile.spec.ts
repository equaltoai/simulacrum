import { expect } from '@playwright/test';

import { test } from './_harness/fixtures';
import { expectProfileReady } from './_harness/publicAssertions';
import { buildMockActor, buildMockStatus, mockPublicGraphQL } from './_harness/publicGraphqlMocks';
import { gotoPublicRoute } from './_harness/publicRoutes';

test.describe('public profile route', () => {
	test('renders deterministic public identity and timeline content once ready', async ({ page }) => {
		const actor = buildMockActor({
			username: 'harness-profile',
			domain: null,
			displayName: 'Harness Profile',
			summary: 'Deterministic public profile content for browser coverage.',
			followers: 42,
			following: 7,
			statusesCount: 2,
			fields: [
				{
					name: 'Role',
					value: 'Public federation surface',
				},
				{
					name: 'Mode',
					value: 'Deterministic browser test',
				},
			],
		});
		const timelineActor = {
			username: actor.username,
			displayName: actor.displayName,
		};

		const timelineStatuses = [
			buildMockStatus({
				id: 'profile-status-1',
				actor: timelineActor,
				content: 'First deterministic profile post.',
				repliesCount: 1,
				sharesCount: 2,
				likesCount: 3,
			}),
			buildMockStatus({
				id: 'profile-status-2',
				actor: timelineActor,
				content: 'Second deterministic profile post.',
			}),
		];

		await mockPublicGraphQL(page, {
			actorProfile: { actor },
			actorTimeline: { statuses: timelineStatuses },
		});

		await gotoPublicRoute(page, 'profile', '/l/profile/harness-profile');

		await expectProfileReady(page);
		await expect(
			page.getByTestId('public-profile-header').getByRole('heading', { level: 2, name: 'Harness Profile' })
		).toBeVisible();
		await expect(page.getByTestId('public-profile-handle')).toHaveText('@harness-profile');
		await expect(page.getByTestId('public-profile-stats')).toContainText('2 posts');
		await expect(page.getByTestId('public-profile-stats')).toContainText('42 followers');
		await expect(page.getByTestId('public-profile-stats')).toContainText('7 following');
		await expect(page.getByText('Deterministic public profile content for browser coverage.')).toBeVisible();
		await expect(page.getByText('Role', { exact: true })).toBeVisible();
		await expect(page.getByText('Public federation surface', { exact: true })).toBeVisible();
		await expect(page.getByText('Mode', { exact: true })).toBeVisible();
		await expect(page.getByText('Deterministic browser test', { exact: true })).toBeVisible();
		await expect(page.getByTestId('public-profile-timeline')).toBeVisible();
		await expect(page.getByTestId('public-status-card').first()).toBeVisible();
		await expect(page.getByText('First deterministic profile post.', { exact: true })).toBeVisible();
		await expect(page.getByText('Second deterministic profile post.', { exact: true })).toBeVisible();
	});
});
