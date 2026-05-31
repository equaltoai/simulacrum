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

test('soul email metadata labels current compound addresses and explicit legacy aliases', () => {
	assert.deepEqual(
		describeSoulEmailAddress(COMPOUND_SOUL_EMAIL, { context: 'current-public-channel' }),
		{
			kind: 'instance-scoped-managed',
			badgeLabel: 'Instance-scoped',
			badgeColor: 'primary',
			description: 'Current public Lesser Soul email channel.',
		}
	);

	assert.deepEqual(describeSoulEmailAddress(COMPOUND_SOUL_EMAIL), {
		kind: 'lesser-soul-email',
		badgeLabel: 'Lesser Soul email',
		badgeColor: 'gray',
		description: 'Managed Lesser Soul email; current-vs-legacy status requires Host channel context.',
	});

	assert.deepEqual(describeSoulEmailAddress('ops.v2@lessersoul.ai'), {
		kind: 'lesser-soul-email',
		badgeLabel: 'Lesser Soul email',
		badgeColor: 'gray',
		description: 'Managed Lesser Soul email; current-vs-legacy status requires Host channel context.',
	});

	assert.notDeepEqual(describeSoulEmailAddress('ops.v2@lessersoul.ai'), {
		kind: 'instance-scoped-managed',
		badgeLabel: 'Instance-scoped',
		badgeColor: 'primary',
		description: 'Current public Lesser Soul email channel.',
	});

	assert.deepEqual(describeSoulEmailAddress(LEGACY_SOUL_EMAIL), {
		kind: 'lesser-soul-email',
		badgeLabel: 'Lesser Soul email',
		badgeColor: 'gray',
		description: 'Managed Lesser Soul email; current-vs-legacy status requires Host channel context.',
	});

	assert.deepEqual(
		describeSoulEmailAddress(LEGACY_SOUL_EMAIL, { context: 'legacy-inbound-alias' }),
		{
			kind: 'legacy-inbound-alias',
			badgeLabel: 'Legacy inbound alias',
			badgeColor: 'warning',
			description: 'Inbound-only alias; current public channel uses agent.instance@lessersoul.ai.',
		}
	);

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

test('contact components render managed soul email addresses opaquely', async (t) => {
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
	const channelsHtml = render(ChannelsDisplay, {
		props: { channels: channelsFor(COMPOUND_SOUL_EMAIL), showCopy: false },
	}).html;
	assert.ok(channelsHtml.includes(COMPOUND_SOUL_EMAIL));
	assert.ok(channelsHtml.includes(`mailto:${COMPOUND_SOUL_EMAIL}`));
	assert.doesNotMatch(channelsHtml, /Instance-scoped/);
	assert.doesNotMatch(channelsHtml, /Current public Lesser Soul email channel/);

	const legacyChannelsHtml = render(ChannelsDisplay, {
		props: { channels: channelsFor(LEGACY_SOUL_EMAIL), showCopy: false },
	}).html;
	assert.ok(legacyChannelsHtml.includes(LEGACY_SOUL_EMAIL));
	assert.doesNotMatch(legacyChannelsHtml, /Legacy inbound alias/);
	assert.doesNotMatch(legacyChannelsHtml, /Inbound-only alias/);

	const bestWayHtml = render(BestWayToContact, {
		props: {
			channels: channelsFor(COMPOUND_SOUL_EMAIL),
			preferences: emailFirstPreferences,
		},
	}).html;
	assert.ok(bestWayHtml.includes(COMPOUND_SOUL_EMAIL));
	assert.doesNotMatch(bestWayHtml, /Instance-scoped/);
});

test('canonical FaceTheory notifications surface uses the sim-owned labeled renderer', async () => {
	const appSource = await readFile(new URL('../../../src/facetheory/App.svelte', import.meta.url), 'utf8');
	const notificationsSource = await readFile(
		new URL('../../../src/facetheory/components/NotificationsPage.svelte', import.meta.url),
		'utf8'
	);

	assert.ok(appSource.includes("import NotificationsPage from './components/NotificationsPage.svelte';"));
	assert.equal(
		appSource.includes("import NotificationsPage from '$lib/greater/faces/agent/NotificationsPage.svelte';"),
		false
	);
	assert.match(notificationsSource, /describeSoulEmailAddress/);
	assert.match(notificationsSource, /context: 'observed-message'/);

	// CSR-019 belongs to the sim-owned FaceTheory notification surface, not a
	// local patch to the vendored Greater notification component.
	assert.match(notificationsSource, /communication\.from\.displayName && communication\.from\.address/);
	assert.match(notificationsSource, /<small>\{communication\.from\.address\}<\/small>/);
});
