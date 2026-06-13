import assert from 'node:assert/strict';
import test from 'node:test';

import {
	classifySoulBootstrapFailure,
	deriveSoulBootstrapUx,
	isProductionSoulBootstrapResult,
} from '../../../src/facetheory/bootstrapUx.ts';
import {
	createActiveSoulBootstrapSigningPlan,
	selectSoulBootstrapPersonalSignMaterial,
} from '../../../src/facetheory/bootstrapSigning.ts';
import {
	project44SoulBootstrapFixtures,
	project44SoulBootstrapIds,
	project44SoulBootstrapSigning,
} from '../../../src/lib/greater/adapters/fixtures/soul-bootstrap.ts';

const ids = {
	username: 'agent-zero',
	bodyId: 'body-agent-zero',
	conversationId: 'conversation-project-44',
	soulAgentId: 'host-soul-agent-project-44',
};

function resultFor({
	phase = 'NOT_STARTED',
	state = 'ready_to_begin',
	nextAction = 'begin',
	executable = true,
	hostBridgeAvailable = true,
	soulBindingState = 'UNBOUND',
	existingSoulAgentId = null,
	error = null,
	signingCheckpoints = [],
	publication = null,
	hostConversationId = null,
	hostSoulAgentId = null,
} = {}) {
	const bootstrapState = {
		__typename: 'SoulBootstrapState',
		bodyId: ids.bodyId,
		username: ids.username,
		state,
		phase,
		walletAddress: null,
		principalAddress: null,
		hostRegistrationId: 'registration-project-44',
		hostConversationId,
		hostSoulAgentId,
		updatedAt: '2026-06-12T12:00:00Z',
		signingCheckpoints,
		publication,
		error: null,
		correlation: null,
	};
	const surface = {
		__typename: 'SoulBootstrapSurface',
		username: ids.username,
		executable,
		existingSoulAgentId,
		hostBridgeAvailable,
		nextAction,
		soulBindingState,
		body: {
			__typename: 'SoulBootstrapIdentityTarget',
			bodyId: ids.bodyId,
			username: ids.username,
			displayName: 'Agent Zero',
			owner: null,
		},
		state: bootstrapState,
		error: null,
		workflow: null,
	};
	return {
		surface,
		state: bootstrapState,
		error,
		executable,
		hostBridgeAvailable,
		nextAction,
	};
}

function actionableError(category, message, code = category.toUpperCase()) {
	return { category, message, code };
}

test('M4.2 bootstrap UX routes unsouled, conversation, finalize, and hosted completion states', () => {
	const notStarted = deriveSoulBootstrapUx({ result: resultFor(), activeUsername: ids.username });
	assert.equal(notStarted.routeKey, 'genesis');
	assert.equal(notStarted.actionHref, '/l/souls/genesis');
	assert.match(notStarted.title, /Start Sim-led soul creation/);

	const conversation = deriveSoulBootstrapUx({
		result: resultFor({
			phase: 'CONVERSATION',
			state: 'conversation_in_progress',
			nextAction: 'complete_conversation',
			hostConversationId: ids.conversationId,
		}),
		activeUsername: ids.username,
	});
	assert.equal(conversation.routeKey, 'genesis');
	assert.equal(conversation.conversationVisible, true);
	assert.match(conversation.summary, /\/l\/souls\/genesis/);

	const finalize = deriveSoulBootstrapUx({
		result: resultFor({
			phase: 'FINALIZE',
			state: 'awaiting_finalize_signature',
			nextAction: 'finalize',
			hostConversationId: ids.conversationId,
			signingCheckpoints: [{
				__typename: 'SoulBootstrapSigningCheckpoint',
				name: 'finalize',
				status: 'pending_signature',
				message: 'Sign the Lesser-provided finalize payload.',
			}],
		}),
		activeUsername: ids.username,
	});
	assert.equal(finalize.routeKey, 'approvals');
	assert.equal(finalize.actionHref, '/l/approvals');
	assert.equal(finalize.finalizeReady, true);
	assert.match(finalize.title, /Finalize signing is ready/);

	const hostedComplete = resultFor({
		phase: 'COMPLETE',
		state: 'hosted_off_chain_binding_ready',
		executable: false,
		nextAction: 'binding_ready',
		soulBindingState: 'BOUND',
		existingSoulAgentId: ids.soulAgentId,
		hostSoulAgentId: ids.soulAgentId,
		publication: {
			__typename: 'SoulBootstrapPublicationEvidence',
			agentId: ids.soulAgentId,
			anchorState: 'HOSTED_OFF_CHAIN',
			publishedAt: '2026-06-12T12:15:00Z',
			publishedVersion: 4,
		},
	});
	assert.equal(isProductionSoulBootstrapResult(hostedComplete), true);
	const complete = deriveSoulBootstrapUx({ result: hostedComplete, activeUsername: ids.username });
	assert.equal(complete.isProductionSoul, true);
	assert.equal(complete.routeKey, 'identity');
	assert.equal(complete.actionHref, `/l/identity/${ids.username}`);
	assert.match(complete.summary, /hosted\/off-chain finalization is complete and bound/);
});

test('M4.2 bootstrap UX makes backend/config states explicit and actionable', () => {
	const cases = [
		{
			category: 'missing_trust',
			message: 'Host trust not configured for this Lesser instance.',
			issue: 'host_trust_not_configured',
			title: /Host trust is not configured/,
		},
		{
			category: 'missing_instance_key',
			message: 'Host instance key missing for this instance.',
			issue: 'host_instance_key_missing',
			title: /Host instance key is missing or unavailable/,
		},
		{
			category: 'host_unavailable',
			message: 'lesser-host timeout while publishing.',
			issue: 'host_unavailable',
			title: /Host is unavailable through Lesser/,
		},
		{
			category: 'signature_rejection',
			message: 'Signature rejected: signer mismatch.',
			issue: 'wallet_signature_rejected',
			title: /Wallet or signature was rejected/,
			routeKey: 'approvals',
		},
	];

	for (const item of cases) {
		const ux = deriveSoulBootstrapUx({
			result: resultFor({
				phase: 'ERROR',
				state: item.issue,
				executable: false,
				hostBridgeAvailable: false,
				error: actionableError(item.category, item.message),
			}),
			activeUsername: ids.username,
		});
		assert.equal(ux.issue, item.issue);
		assert.match(ux.title, item.title);
		assert.equal(ux.routeKey, item.routeKey ?? 'identity');
		assert.match(ux.actionDetail, /no lesser-host portal token is required/);
	}

	const unsupported = classifySoulBootstrapFailure({
		category: 'graphql_error',
		message: 'Cannot query field "soulBootstrap" on type "Query".',
	});
	assert.equal(unsupported, 'backend_contract_unsupported');
	const unsupportedUx = deriveSoulBootstrapUx({
		result: null,
		activeUsername: ids.username,
		failureIssue: unsupported,
		failureMessage: 'Cannot query field "soulBootstrap" on type "Query".',
	});
	assert.match(unsupportedUx.title, /Backend contract is unsupported/);
	assert.match(unsupportedUx.summary, /will not add a REST or raw Host workaround/);
});

function resultFromProject44Surface(surface) {
	return {
		surface,
		state: surface.state,
		error: null,
		executable: surface.executable,
		hostBridgeAvailable: surface.hostBridgeAvailable,
		nextAction: surface.nextAction,
	};
}

test('M4.4 Project 44 fixtures cover the full visible bootstrap path without Host credentials', () => {
	const sequence = [
		{
			name: 'ready-to-begin',
			surface: project44SoulBootstrapFixtures.notStarted,
			title: /Start Sim-led soul creation/,
			routeKey: 'genesis',
		},
		{
			name: 'wallet signing',
			surface: project44SoulBootstrapFixtures.walletChallenge,
			title: /Signature readiness is visible/,
			routeKey: 'approvals',
		},
		{
			name: 'principal signing',
			surface: project44SoulBootstrapFixtures.principalDeclarationPreflight,
			title: /Signature readiness is visible/,
			routeKey: 'approvals',
		},
		{
			name: 'genesis conversation',
			surface: project44SoulBootstrapFixtures.conversationMessage,
			title: /Genesis conversation is ready/,
			routeKey: 'genesis',
		},
		{
			name: 'finalize signing',
			surface: project44SoulBootstrapFixtures.finalizePreflight,
			title: /Finalize signing is ready/,
			routeKey: 'approvals',
		},
		{
			name: 'hosted off-chain bound',
			surface: project44SoulBootstrapFixtures.finalizedHosted,
			title: /Production soul is active/,
			routeKey: 'identity',
		},
	];

	for (const item of sequence) {
		const ux = deriveSoulBootstrapUx({
			result: resultFromProject44Surface(item.surface),
			activeUsername: project44SoulBootstrapIds.username,
		});
		assert.match(ux.title, item.title, `${item.name} title`);
		assert.equal(ux.routeKey, item.routeKey, `${item.name} route`);
		assert.doesNotMatch(
			`${ux.summary} ${ux.actionDetail} ${ux.statusDetail}`,
			/hostToken|hostBaseUrl|soulWorkflowHost|browser instance key/i,
			`${item.name} must not ask for browser Host credentials`
		);
	}

	const walletPlan = createActiveSoulBootstrapSigningPlan(
		resultFromProject44Surface(project44SoulBootstrapFixtures.walletChallenge)
	);
	const principalPlan = createActiveSoulBootstrapSigningPlan(
		resultFromProject44Surface(project44SoulBootstrapFixtures.principalDeclarationPreflight)
	);
	const finalizePlan = createActiveSoulBootstrapSigningPlan(
		resultFromProject44Surface(project44SoulBootstrapFixtures.finalizePreflight)
	);

	assert.equal(selectSoulBootstrapPersonalSignMaterial(walletPlan).message, project44SoulBootstrapSigning.walletChallenge.message);
	assert.equal(selectSoulBootstrapPersonalSignMaterial(principalPlan).message, project44SoulBootstrapSigning.principalDeclaration.messageHex);
	assert.equal(selectSoulBootstrapPersonalSignMaterial(finalizePlan).message, project44SoulBootstrapSigning.finalize.messageHex);

	const complete = deriveSoulBootstrapUx({
		result: resultFromProject44Surface(project44SoulBootstrapFixtures.finalizedHosted),
		activeUsername: project44SoulBootstrapIds.username,
	});
	assert.equal(complete.isProductionSoul, true);
	assert.match(complete.summary, /hosted\/off-chain finalization is complete and bound/);
});
