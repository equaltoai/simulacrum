import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createServer } from 'vite';

import { describeSoulEmailAddress } from '../../../src/lib/components/soul/email.ts';
import { recommendContactTarget } from '../../../src/lib/components/soul/utils.ts';

const COMPOUND_SOUL_EMAIL = 'arch.simulacrum@lessersoul.ai';
const LEGACY_SOUL_EMAIL = 'arch@lessersoul.ai';

function channelsFor(address) {
	return {
		ens: null,
		email: {
			address,
			capabilities: ['receive'],
			verified: true,
			status: 'active',
		},
		phone: null,
	};
}

const emailFirstPreferences = {
	preferred: 'email',
	availability: {
		schedule: 'always',
	},
	responseExpectation: {
		target: '24h',
		guarantee: 'best-effort',
	},
	languages: ['en'],
	firstContact: {
		requireSoul: false,
		introductionExpected: true,
	},
};

test('soul email metadata labels current compound addresses and legacy aliases', () => {
	assert.deepEqual(describeSoulEmailAddress(COMPOUND_SOUL_EMAIL), {
		kind: 'instance-scoped-managed',
		badgeLabel: 'Instance-scoped',
		badgeColor: 'primary',
		description: 'Current public Lesser Soul email channel.',
	});

	assert.deepEqual(describeSoulEmailAddress(LEGACY_SOUL_EMAIL), {
		kind: 'legacy-inbound-alias',
		badgeLabel: 'Legacy inbound alias',
		badgeColor: 'warning',
		description: 'Inbound-only alias; current public channel uses agent.instance@lessersoul.ai.',
	});

	assert.equal(describeSoulEmailAddress('operator@example.com').kind, 'external-or-unknown');
});

test('soul email helpers do not recover agent or instance identity from dotted local-parts', async () => {
	const meta = describeSoulEmailAddress(COMPOUND_SOUL_EMAIL);
	assert.deepEqual(Object.keys(meta).sort(), ['badgeColor', 'badgeLabel', 'description', 'kind']);

	const source = await readFile(
		new URL('../../../src/lib/components/soul/email.ts', import.meta.url),
		'utf8'
	);
	assert.doesNotMatch(source, /split\(['"]\\.['"]\)/);
	assert.doesNotMatch(source, /agentLocalId|instanceSlug|agentSlug|localId/);
});

test('contact recommendation preserves compound soul email addresses as opaque strings', () => {
	const recommendation = recommendContactTarget(channelsFor(COMPOUND_SOUL_EMAIL), emailFirstPreferences);

	assert.equal(recommendation.recommended?.channel, 'email');
	assert.equal(recommendation.recommended?.address, COMPOUND_SOUL_EMAIL);
	assert.equal(recommendation.recommended?.label, 'Email');
	assert.equal('agentId' in recommendation.recommended, false);
	assert.equal('instanceSlug' in recommendation.recommended, false);
});

test('contact and notification components render compound and legacy soul email labels', async (t) => {
	const server = await createServer({
		server: { middlewareMode: true },
		appType: 'custom',
		ssr: { external: ['extend'] },
	});
	t.after(async () => {
		await server.close();
	});

	const { render } = await server.ssrLoadModule('svelte/server');
	const { default: ChannelsDisplay } = await server.ssrLoadModule(
		'/src/lib/components/soul/ChannelsDisplay.svelte'
	);
	const { default: BestWayToContact } = await server.ssrLoadModule(
		'/src/lib/components/soul/BestWayToContact.svelte'
	);
	const { default: CommunicationNotificationItem } = await server.ssrLoadModule(
		'/src/lib/components/notifications/CommunicationNotificationItem.svelte'
	);

	const channelsHtml = render(ChannelsDisplay, {
		props: { channels: channelsFor(COMPOUND_SOUL_EMAIL), showCopy: false },
	}).html;
	assert.ok(channelsHtml.includes(COMPOUND_SOUL_EMAIL));
	assert.ok(channelsHtml.includes(`mailto:${COMPOUND_SOUL_EMAIL}`));
	assert.match(channelsHtml, /Instance-scoped/);
	assert.match(channelsHtml, /Current public Lesser Soul email channel/);

	const legacyChannelsHtml = render(ChannelsDisplay, {
		props: { channels: channelsFor(LEGACY_SOUL_EMAIL), showCopy: false },
	}).html;
	assert.ok(legacyChannelsHtml.includes(LEGACY_SOUL_EMAIL));
	assert.match(legacyChannelsHtml, /Legacy inbound alias/);
	assert.match(legacyChannelsHtml, /Inbound-only alias/);

	const bestWayHtml = render(BestWayToContact, {
		props: {
			channels: channelsFor(COMPOUND_SOUL_EMAIL),
			preferences: emailFirstPreferences,
		},
	}).html;
	assert.ok(bestWayHtml.includes(COMPOUND_SOUL_EMAIL));
	assert.match(bestWayHtml, /Instance-scoped/);

	const notificationHtml = render(CommunicationNotificationItem, {
		props: {
			notification: {
				id: 'notification-compound-email',
				type: 'communication_inbound',
				createdAt: '2026-05-22T18:11:32Z',
				read: false,
				communication: {
					channel: 'email',
					from: {
						address: COMPOUND_SOUL_EMAIL,
						displayName: 'Arch',
						soulAgentId: '0xarch',
					},
					to: { address: 'sim.simulacrum@lessersoul.ai' },
					attachments: [],
					subject: 'Project coordination',
					body: 'Compound managed soul email fixture.',
					receivedAt: '2026-05-22T18:11:32Z',
					messageId: 'message-compound-email',
					threadId: 'thread-compound-email',
				},
			},
		},
	}).html;
	assert.match(notificationHtml, /Arch/);
	assert.ok(notificationHtml.includes(COMPOUND_SOUL_EMAIL));
	assert.match(notificationHtml, /Instance-scoped/);
});
