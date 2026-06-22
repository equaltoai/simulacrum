import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { deriveSoulBootstrapUx } from '../../../src/facetheory/bootstrapUx.ts';
import {
	project44SoulBootstrapIds,
	project49HostedGenesisStatusFixtures,
} from '../../../src/lib/greater/adapters/fixtures/soul-bootstrap.ts';

let hostedBootstrapHelpersPromise;

function loadHostedBootstrapHelpers() {
	if (!hostedBootstrapHelpersPromise) {
		registerHooks({
			resolve(specifier, context, nextResolve) {
				if (
					(specifier.startsWith('./') || specifier.startsWith('../')) &&
					specifier.endsWith('.js')
				) {
					const resolved = new URL(specifier, context.parentURL);
					const tsPath = fileURLToPath(resolved).replace(/\.js$/, '.ts');
					if (existsSync(tsPath)) {
						return { url: pathToFileURL(tsPath).href, shortCircuit: true };
					}
				}
				return nextResolve(specifier, context);
			},
		});
		hostedBootstrapHelpersPromise = import(
			'../../../src/lib/greater/adapters/soul/hostedBootstrap.ts'
		);
	}
	return hostedBootstrapHelpersPromise;
}

const EXPECTED_ROWS = [
	'no registration',
	'registration active, no conversation',
	'created collapsed to in_progress',
	'in_progress',
	'assistant_turn_ready',
	'declaration_extraction_pending',
	'declaration_ready',
	'failed retry same step',
	'failed restart bootstrap',
	'published/bound',
];

const EXPECTED_PRIMARY_ACTION_LABEL = {
	START_HOSTED_BOOTSTRAP: 'Start Hosted Definition',
	SEND_HOSTED_SOUL_GENESIS_MESSAGE: 'Open Genesis Lane',
	COMPLETE_HOSTED_SOUL_GENESIS: 'Review Declarations',
	REFRESH_STATE: 'Open Genesis Lane',
	PUBLISH_HOSTED_SOUL: 'Publish Hosted Soul',
	RETRY_SAME_STEP: 'Retry Hosted Step',
	RESTART_SOUL_BOOTSTRAP: 'Restart Hosted Definition',
	COMPLETE: 'Inspect Identity Nexus',
};

function resultFromSurface(surface) {
	return {
		surface,
		state: surface.state,
		hosted: null,
		error: surface.error ?? surface.state?.error ?? null,
		executable: surface.executable,
		hostBridgeAvailable: surface.hostBridgeAvailable,
		nextAction: surface.nextAction,
		typedNextAction: surface.typedNextAction ?? surface.state.typedNextAction,
		recoveryCategory: surface.recoveryCategory ?? surface.state.recoveryCategory,
		recoveryAction: surface.recoveryAction ?? surface.state.recoveryAction,
		retryable: surface.retryable ?? surface.state.retryable,
		restartRequired: surface.state.restartRequired,
		restartAvailable: surface.restartAvailable ?? surface.state.restartAvailable,
		hostRequest: null,
		publication: surface.state.publication ?? null,
		publicationEvidence: surface.state.publicationEvidence ?? surface.state.publication ?? null,
		terminalDeclarationEvidence: surface.state.terminalDeclarationEvidence ?? null,
		publishGate: surface.state.publishGate ?? null,
		boundSoul: null,
	};
}

function cloneSurface(surface, stateOverrides = {}, surfaceOverrides = {}) {
	const state = {
		...surface.state,
		...stateOverrides,
	};
	return {
		...surface,
		...surfaceOverrides,
		state,
		workflow: surface.workflow
			? {
					...surface.workflow,
					soulBootstrap: {
						...surface.workflow.soulBootstrap,
						...stateOverrides,
					},
				}
			: surface.workflow,
	};
}

function assertOnePrimaryAction(ux, label) {
	assert.equal(typeof ux.actionLabel, 'string', `${label}: action label exists`);
	assert.notEqual(ux.actionLabel.trim(), '', `${label}: action label is non-empty`);
	assert.equal(typeof ux.actionHref, 'string', `${label}: action href exists`);
	assert.ok(ux.actionHref.startsWith('/l/'), `${label}: action href stays inside installed client`);
}

test('M5.1 locks every Lesser-authored hosted genesis state/action fixture row', async () => {
	const {
		canPublishHostedSoulBootstrap,
		getHostedSoulBootstrapTerminalDeclarationEvidenceSummary,
		isHostedSoulBootstrapDeclarationReady,
		isHostedSoulBootstrapInProgress,
	} = await loadHostedBootstrapHelpers();

	assert.deepEqual(
		project49HostedGenesisStatusFixtures.map((fixture) => fixture.label),
		EXPECTED_ROWS,
		'Project 49 status table labels stay locked to the Lesser-authored state rows'
	);

	for (const fixture of project49HostedGenesisStatusFixtures) {
		const { label, surface } = fixture;
		const result = resultFromSurface(surface);
		assert.equal(surface.state.bootstrapMode, 'HOSTED', `${label}: hosted mode`);
		assert.equal(surface.typedNextAction, surface.state.typedNextAction, `${label}: surface/state action agree`);
		assert.equal(typeof surface.state.typedNextAction, 'string', `${label}: typedNextAction is present`);
		assert.notEqual(surface.state.typedNextAction.trim(), '', `${label}: typedNextAction is non-empty`);
		assert.equal(surface.state.publishGate.reason, fixture.publishReason, `${label}: publish reason`);
		assert.equal(
			canPublishHostedSoulBootstrap(surface.state, { conversationId: surface.state.hostConversationId }),
			fixture.canPublish,
			`${label}: publish gate helper matches fixture`
		);
		assert.equal(
			isHostedSoulBootstrapInProgress(surface.state, { conversationId: surface.state.hostConversationId }),
			fixture.inProgress,
			`${label}: in-progress helper matches fixture`
		);
		assert.equal(
			isHostedSoulBootstrapDeclarationReady(surface.state, { conversationId: surface.state.hostConversationId }),
			fixture.declarationReady,
			`${label}: declaration-ready helper matches fixture`
		);

		const evidence = getHostedSoulBootstrapTerminalDeclarationEvidenceSummary(surface.state, {
			conversationId: surface.state.hostConversationId,
		});
		assert.equal(Boolean(evidence), fixture.declarationReady, `${label}: evidence summary presence`);
		if (evidence) {
			assert.equal(evidence.conversationId, surface.state.hostConversationId, `${label}: evidence binds active conversation`);
			assert.match(evidence.declarationsHash, /^sha256:[0-9a-f]{64}$/, `${label}: declaration hash is bounded`);
		}

		const hostedPublishReady = canPublishHostedSoulBootstrap(surface.state, {
			conversationId: surface.state.hostConversationId,
		});
		const ux = deriveSoulBootstrapUx({
			result,
			activeUsername: project44SoulBootstrapIds.username,
			hostedPublishReady,
		});
		assert.equal(ux.typedNextAction, surface.state.typedNextAction, `${label}: UX preserves typedNextAction`);
		assertOnePrimaryAction(ux, label);
		if (EXPECTED_PRIMARY_ACTION_LABEL[surface.state.typedNextAction]) {
			assert.equal(
				ux.actionLabel,
				EXPECTED_PRIMARY_ACTION_LABEL[surface.state.typedNextAction],
				`${label}: one visible primary action follows typedNextAction`
			);
		}
	}
});

test('M5.1 malformed or ambiguous hosted publish data fails closed', async () => {
	const {
		canPublishHostedSoulBootstrap,
		getHostedSoulBootstrapTerminalDeclarationEvidenceSummary,
	} = await loadHostedBootstrapHelpers();
	const declarationReady = project49HostedGenesisStatusFixtures.find((fixture) => fixture.label === 'declaration_ready');
	assert.ok(declarationReady);

	const staleEvidenceSurface = cloneSurface(declarationReady.surface, {
		terminalDeclarationEvidence: {
			...declarationReady.surface.state.terminalDeclarationEvidence,
			conversationId: `${project44SoulBootstrapIds.conversationId}-stale`,
		},
	});
	assert.equal(
		canPublishHostedSoulBootstrap(staleEvidenceSurface.state, {
			conversationId: project44SoulBootstrapIds.conversationId,
		}),
		false,
		'stale terminal evidence cannot publish'
	);
	assert.equal(
		getHostedSoulBootstrapTerminalDeclarationEvidenceSummary(staleEvidenceSurface.state, {
			conversationId: project44SoulBootstrapIds.conversationId,
		}),
		null,
		'stale terminal evidence returns no review summary'
	);

	const closedGateSurface = cloneSurface(declarationReady.surface, {
		publishGate: {
			__typename: 'SoulBootstrapPublishGate',
			canPublishHostedSoul: false,
			reason: 'blocked:test_closed_gate',
			requiresActiveConversationTerminalDeclarationEvidence: true,
		},
	});
	assert.equal(
		canPublishHostedSoulBootstrap(closedGateSurface.state, {
			conversationId: project44SoulBootstrapIds.conversationId,
		}),
		false,
		'closed publishGate prevents publication even with declaration evidence'
	);

	const malformedActionSurface = cloneSurface(declarationReady.surface, {
		typedNextAction: null,
	}, {
		typedNextAction: null,
	});
	assert.equal(
		canPublishHostedSoulBootstrap(malformedActionSurface.state, {
			conversationId: project44SoulBootstrapIds.conversationId,
		}),
		false,
		'missing typedNextAction prevents publication'
	);
	const malformedUx = deriveSoulBootstrapUx({
		result: resultFromSurface(malformedActionSurface),
		activeUsername: project44SoulBootstrapIds.username,
		hostedPublishReady: false,
	});
	assert.notEqual(malformedUx.actionLabel, 'Publish Hosted Soul', 'malformed action does not render publish as primary');
	assertOnePrimaryAction(malformedUx, 'malformed action');
});
