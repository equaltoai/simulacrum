import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
	SoulBootstrapSigningUxError,
	assertSoulBootstrapSubmitPrerequisites,
	buildSoulBootstrapSubmitInput,
	createActiveSoulBootstrapSigningPlan,
	createSoulBootstrapWalletChallengeRecoveryPlan,
	ensureSoulBootstrapSigningCorrelation,
	isSoulBootstrapConversationRetryReady,
	isSoulBootstrapRegistrationRestartReady,
	isSoulBootstrapRestartReady,
	selectSoulBootstrapPersonalSignMaterial,
} from '../../../src/facetheory/bootstrapSigning.ts';
import {
	createProject44SoulBootstrapSurface,
	project44SoulBootstrapFixtures,
	project44SoulBootstrapIds,
	project44SoulBootstrapSigning,
} from '../../../src/lib/greater/adapters/fixtures/soul-bootstrap.ts';
import { SoulBootstrapSigningPlanError } from '../../../src/lib/greater/adapters/soul/bootstrapSigningPlan.ts';

const signatureA = `0x${'a'.repeat(130)}`;
const signatureB = `0x${'b'.repeat(130)}`;
const principalDeclarationText =
	'I declare Project 44 principal authority for this Lesser-hosted soul.';
const principalDeclarationCanonicalJson = JSON.stringify({
	agentId: project44SoulBootstrapIds.soulAgentId,
	chainId: '1',
	contract: '0x60fba71f84bd613118d38f7d0375c36693daecba',
	declaration: principalDeclarationText,
	declaredAt: project44SoulBootstrapIds.declaredAt,
	domain: 'project44.example',
	kind: 'soul_principal_declaration',
	localId: project44SoulBootstrapIds.username,
	principalAddress: project44SoulBootstrapIds.principalAddress,
	version: '1',
	wallet: project44SoulBootstrapIds.walletAddress,
});

function principalDeclarationCheckpoint(overrides = {}) {
	return {
		__typename: 'SoulBootstrapSigningCheckpoint',
		...project44SoulBootstrapSigning.principalDeclaration,
		canonicalJson: principalDeclarationCanonicalJson,
		...overrides,
	};
}

function principalDeclarationPreflightSurface() {
	return createProject44SoulBootstrapSurface({
		phase: 'PRINCIPAL_DECLARATION',
		state: 'awaiting_principal_signature',
		nextAction: 'verify_principal_declaration',
		principalAddress: project44SoulBootstrapIds.principalAddress,
		signingCheckpoints: [principalDeclarationCheckpoint()],
	});
}

function resultFromSurface(surface) {
	return {
		surface,
		state: surface.state,
		error: null,
		executable: surface.executable,
		hostBridgeAvailable: surface.hostBridgeAvailable,
		nextAction: surface.nextAction,
	};
}

test('M4.3 wallet signing uses exact adapter UTF-8 message and plan submit mapping', () => {
	const plan = createActiveSoulBootstrapSigningPlan(
		resultFromSurface(project44SoulBootstrapFixtures.walletChallenge)
	);

	assert.equal(plan.kind, 'wallet_challenge');
	const material = selectSoulBootstrapPersonalSignMaterial(plan);
	assert.equal(material.method, 'eip191_personal_sign');
	assert.equal(material.messageEncoding, 'utf8');
	assert.equal(material.messageField, 'message');
	assert.equal(material.message, project44SoulBootstrapSigning.walletChallenge.message);
	assert.equal(material.signerAddress, project44SoulBootstrapIds.walletAddress);

	const submission = buildSoulBootstrapSubmitInput(plan, signatureA);
	assert.equal(submission.mutation, 'verify_wallet');
	assert.deepEqual(submission.input, {
		username: project44SoulBootstrapIds.username,
		registrationId: project44SoulBootstrapIds.registrationId,
		signature: signatureA,
		idempotencyKey: project44SoulBootstrapIds.walletIdempotencyKey,
		correlationKey: project44SoulBootstrapIds.correlationKey,
	});
});

test('M4.4 live begin phase can use client-provided wallet verification idempotency', () => {
	const surface = createProject44SoulBootstrapSurface({
		phase: 'BEGIN',
		state: 'begin.ready',
		nextAction: 'verify_wallet',
		hostRegistrationId: project44SoulBootstrapIds.registrationId,
		walletAddress: project44SoulBootstrapIds.walletAddress,
		signingCheckpoints: [{
			__typename: 'SoulBootstrapSigningCheckpoint',
			...project44SoulBootstrapSigning.walletChallenge,
		}],
	});
	const backendShape = {
		...surface,
		state: {
			...surface.state,
			correlation: {
				__typename: 'SoulBootstrapCorrelationState',
				correlationKey: 'corr-live-begin',
				beginIdempotencyKey: 'begin-live',
				walletVerificationIdempotencyKey: null,
				principalDeclarationIdempotencyKey: null,
				conversationIdempotencyKey: null,
				finalizeIdempotencyKey: null,
				lastHostRequestId: project44SoulBootstrapIds.hostRequestId,
			},
		},
	};
	const result = ensureSoulBootstrapSigningCorrelation(resultFromSurface(backendShape), {
		idempotencyKey: 'wallet-client-generated',
	});
	const plan = createActiveSoulBootstrapSigningPlan(result);

	assert.equal(plan.kind, 'wallet_challenge');
	const submission = buildSoulBootstrapSubmitInput(plan, signatureA);
	assert.deepEqual(submission.input, {
		username: project44SoulBootstrapIds.username,
		registrationId: project44SoulBootstrapIds.registrationId,
		signature: signatureA,
		idempotencyKey: 'wallet-client-generated',
		correlationKey: 'corr-live-begin',
	});
});

test('M4.3 principal signing fails closed without prior wallet signature', () => {
	const plan = createActiveSoulBootstrapSigningPlan(resultFromSurface(principalDeclarationPreflightSurface()));

	assert.equal(plan.kind, 'principal_declaration');
	assert.throws(
		() => assertSoulBootstrapSubmitPrerequisites(plan, { walletChallengeSignature: null }),
		(error) => error instanceof SoulBootstrapSigningUxError &&
			error.code === 'missing_wallet_challenge_signature'
	);
});

test('M4.3 principal signing uses adapter hex bytes and raw declaration only when prior UI signature is present', () => {
	const plan = createActiveSoulBootstrapSigningPlan(resultFromSurface(principalDeclarationPreflightSurface()));

	assertSoulBootstrapSubmitPrerequisites(plan, { walletChallengeSignature: signatureA });
	const material = selectSoulBootstrapPersonalSignMaterial(plan);
	assert.equal(material.method, 'eip191_personal_sign');
	assert.equal(material.messageEncoding, 'hex_bytes');
	assert.equal(material.messageField, 'messageHex');
	assert.equal(material.message, project44SoulBootstrapSigning.principalDeclaration.messageHex);
	assert.equal(material.signerAddress, project44SoulBootstrapIds.principalAddress);

	const submission = buildSoulBootstrapSubmitInput(plan, signatureB, {
		walletChallengeSignature: signatureA,
	});
	assert.equal(submission.mutation, 'verify_principal_declaration');
	assert.deepEqual(submission.input, {
		username: project44SoulBootstrapIds.username,
		registrationId: project44SoulBootstrapIds.registrationId,
		signature: signatureA,
		principalAddress: project44SoulBootstrapIds.principalAddress,
		principalDeclaration: principalDeclarationText,
		principalSignature: signatureB,
		declaredAt: project44SoulBootstrapIds.declaredAt,
		idempotencyKey: project44SoulBootstrapIds.principalIdempotencyKey,
		correlationKey: project44SoulBootstrapIds.correlationKey,
	});
});

test('M4.4 principal signing can recover browser-only wallet signature from retained wallet checkpoint', () => {
	const surface = createProject44SoulBootstrapSurface({
		phase: 'PRINCIPAL_DECLARATION',
		state: 'awaiting_principal_signature',
		nextAction: 'verify_principal_declaration',
		principalAddress: project44SoulBootstrapIds.principalAddress,
		signingCheckpoints: [
			{
				__typename: 'SoulBootstrapSigningCheckpoint',
				...project44SoulBootstrapSigning.walletChallenge,
				status: 'complete',
				completedAt: project44SoulBootstrapIds.completedAt,
			},
			principalDeclarationCheckpoint(),
		],
	});
	const plan = createSoulBootstrapWalletChallengeRecoveryPlan(resultFromSurface(surface));
	const material = selectSoulBootstrapPersonalSignMaterial(plan);

	assert.equal(plan.kind, 'wallet_challenge');
	assert.equal(plan.status, 'complete');
	assert.equal(material.message, project44SoulBootstrapSigning.walletChallenge.message);
	assert.equal(material.signerAddress, project44SoulBootstrapIds.walletAddress);
});

test('M4.4 ERROR phase with retained checkpoint can build retry signing plan', () => {
	const surface = createProject44SoulBootstrapSurface({
		phase: 'ERROR',
		state: 'wallet_signature_rejected',
		nextAction: 'retry_signature',
		error: {
			__typename: 'SoulBootstrapErrorState',
			code: 'SIGNATURE_REJECTED',
			message: 'Signature rejected by Host verifier.',
			source: 'lesser-host',
			statusCode: 422,
			hostRequestId: project44SoulBootstrapIds.hostRequestId,
			at: project44SoulBootstrapIds.completedAt,
		},
		principalAddress: project44SoulBootstrapIds.principalAddress,
		signingCheckpoints: [
			{
				__typename: 'SoulBootstrapSigningCheckpoint',
				...project44SoulBootstrapSigning.walletChallenge,
				status: 'complete',
				completedAt: project44SoulBootstrapIds.completedAt,
			},
			principalDeclarationCheckpoint(),
		],
	});
	const plan = createActiveSoulBootstrapSigningPlan(resultFromSurface(surface));

	assert.equal(plan.kind, 'principal_declaration');
	assert.equal(selectSoulBootstrapPersonalSignMaterial(plan).message, project44SoulBootstrapSigning.principalDeclaration.messageHex);
});

test('M4.4 missing Host registration restarts instead of retrying stale signing material', () => {
	const surface = createProject44SoulBootstrapSurface({
		phase: 'ERROR',
		state: 'error.host_unavailable',
		nextAction: 'retry_signature',
		error: {
			__typename: 'SoulBootstrapErrorState',
			code: 'HOST_REGISTRATION_NOT_FOUND',
			message: 'Host registration was not found.',
			source: 'host',
			statusCode: 404,
			hostRequestId: project44SoulBootstrapIds.hostRequestId,
			at: project44SoulBootstrapIds.completedAt,
		},
		principalAddress: project44SoulBootstrapIds.principalAddress,
		signingCheckpoints: [
			{
				__typename: 'SoulBootstrapSigningCheckpoint',
				...project44SoulBootstrapSigning.walletChallenge,
				status: 'complete',
				completedAt: project44SoulBootstrapIds.completedAt,
			},
			principalDeclarationCheckpoint(),
		],
	});
	const result = resultFromSurface(surface);

	assert.equal(isSoulBootstrapRegistrationRestartReady(result), true);
	assert.equal(isSoulBootstrapRestartReady(result), true);
	assert.throws(
		() => createActiveSoulBootstrapSigningPlan(result),
		(error) => error instanceof SoulBootstrapSigningUxError &&
			error.code === 'missing_plan'
	);
});

test('M4.5 every pre-binding started phase exposes a safe restart path', () => {
	const startedSurfaces = [
		project44SoulBootstrapFixtures.walletChallenge,
		project44SoulBootstrapFixtures.walletVerified,
		principalDeclarationPreflightSurface(),
		project44SoulBootstrapFixtures.principalDeclarationVerified,
		project44SoulBootstrapFixtures.conversationMessage,
		project44SoulBootstrapFixtures.conversationComplete,
		project44SoulBootstrapFixtures.finalizePreflight,
		createProject44SoulBootstrapSurface({
			phase: 'ERROR',
			state: 'error.host_unavailable',
			nextAction: 'retry_signature',
			error: {
				__typename: 'SoulBootstrapErrorState',
				code: 'HOST_INVALID_REQUEST',
				message: 'Host rejected the bootstrap request.',
				source: 'host',
				statusCode: 400,
				hostRequestId: project44SoulBootstrapIds.hostRequestId,
				at: project44SoulBootstrapIds.completedAt,
			},
			principalAddress: project44SoulBootstrapIds.principalAddress,
			signingCheckpoints: [
				{
					__typename: 'SoulBootstrapSigningCheckpoint',
					...project44SoulBootstrapSigning.walletChallenge,
					status: 'complete',
					completedAt: project44SoulBootstrapIds.completedAt,
				},
				principalDeclarationCheckpoint(),
			],
		}),
	];

	for (const surface of startedSurfaces) {
		assert.equal(
			isSoulBootstrapRestartReady(resultFromSurface(surface)),
			true,
			`${surface.state.phase} ${surface.state.state} should restart before binding`
		);
	}

	assert.equal(
		isSoulBootstrapRestartReady(resultFromSurface(project44SoulBootstrapFixtures.notStarted)),
		false,
		'not-started begins rather than restarts'
	);
	assert.equal(
		isSoulBootstrapRestartReady(resultFromSurface(project44SoulBootstrapFixtures.finalizedHosted)),
		false,
		'bound production soul must not expose restart'
	);
	assert.equal(
		isSoulBootstrapRestartReady(resultFromSurface(project44SoulBootstrapFixtures.missingTrust)),
		false,
		'operator configuration blocks must not masquerade as user-restartable'
	);
});

test('M4.4 Host bootstrap conflict after principal verification can retry genesis conversation', () => {
	const surface = createProject44SoulBootstrapSurface({
		phase: 'ERROR',
		state: 'error.host_unavailable',
		nextAction: 'retry_conversation',
		error: {
			__typename: 'SoulBootstrapErrorState',
			code: 'HOST_BOOTSTRAP_CONFLICT',
			message: 'Host reported a bootstrap conflict.',
			source: 'host',
			statusCode: 409,
			hostRequestId: project44SoulBootstrapIds.hostRequestId,
			at: project44SoulBootstrapIds.completedAt,
		},
		principalAddress: project44SoulBootstrapIds.principalAddress,
		hostConversationId: null,
		signingCheckpoints: [
			{
				__typename: 'SoulBootstrapSigningCheckpoint',
				...project44SoulBootstrapSigning.walletChallenge,
				status: 'complete',
				completedAt: project44SoulBootstrapIds.completedAt,
			},
			principalDeclarationCheckpoint({
				status: 'verified',
				completedAt: project44SoulBootstrapIds.completedAt,
			}),
		],
	});
	const result = resultFromSurface(surface);

	assert.equal(isSoulBootstrapConversationRetryReady(result), true);
	assert.throws(
		() => createActiveSoulBootstrapSigningPlan(result),
		(error) => error instanceof SoulBootstrapSigningUxError &&
			error.code === 'missing_plan'
	);
});

test('M4.3 finalize signing uses adapter hex bytes and submit mapping without local Host reconstruction', () => {
	const plan = createActiveSoulBootstrapSigningPlan(
		resultFromSurface(project44SoulBootstrapFixtures.finalizePreflight)
	);

	assert.equal(plan.kind, 'finalize_self_attestation');
	const material = selectSoulBootstrapPersonalSignMaterial(plan);
	assert.equal(material.method, 'eip191_personal_sign');
	assert.equal(material.messageEncoding, 'hex_bytes');
	assert.equal(material.messageField, 'messageHex');
	assert.equal(material.message, project44SoulBootstrapSigning.finalize.messageHex);
	assert.equal(material.signerAddress, project44SoulBootstrapIds.walletAddress);

	const submission = buildSoulBootstrapSubmitInput(plan, signatureA);
	assert.equal(submission.mutation, 'finalize');
	assert.deepEqual(submission.input, {
		username: project44SoulBootstrapIds.username,
		registrationId: project44SoulBootstrapIds.registrationId,
		conversationId: project44SoulBootstrapIds.conversationId,
		boundarySignaturesJson: '{"project-44-continuity":"0xboundary"}',
		issuedAt: project44SoulBootstrapIds.issuedAt,
		expectedVersion: 3,
		selfAttestation: signatureA,
		idempotencyKey: project44SoulBootstrapIds.finalizeIdempotencyKey,
		correlationKey: project44SoulBootstrapIds.correlationKey,
	});
});

test('M4.3 adapter guard fails closed on malformed digest material', () => {
	const surface = createProject44SoulBootstrapSurface({
		phase: 'FINALIZE',
		state: 'awaiting_finalize_signature',
		nextAction: 'finalize',
		principalAddress: project44SoulBootstrapIds.principalAddress,
		hostConversationId: project44SoulBootstrapIds.conversationId,
		signingCheckpoints: [{
			__typename: 'SoulBootstrapSigningCheckpoint',
			...project44SoulBootstrapSigning.finalize,
			digestHex: `0x${'f'.repeat(64)}`,
		}],
	});

	assert.throws(
		() => createActiveSoulBootstrapSigningPlan(resultFromSurface(surface)),
		(error) => error instanceof SoulBootstrapSigningPlanError &&
			error.code === 'digest_message_mismatch'
	);
});

test('M4.3 signing panel stays on same-origin GraphQL and provider personal_sign boundary', async () => {
	const panelSource = await readFile(
		new URL('../../../src/facetheory/components/SoulBootstrapSigningPanel.svelte', import.meta.url),
		'utf8'
	);
	const helperSource = await readFile(
		new URL('../../../src/facetheory/bootstrapSigning.ts', import.meta.url),
		'utf8'
	);

	assert.match(panelSource, /getInjectedProvider/);
	assert.match(panelSource, /personalSign/);
	assert.match(panelSource, /beginSoulBootstrap/);
	assert.match(panelSource, /verifySoulBootstrapWallet/);
	assert.match(panelSource, /verifySoulBootstrapPrincipalDeclaration/);
	assert.match(panelSource, /finalizeSoulBootstrap/);
	assert.match(helperSource, /eip191_personal_sign/);
	assert.match(helperSource, /messageHex/);
	assert.match(helperSource, /createSubmitInput/);
	assert.doesNotMatch(panelSource, /soulWorkflowHost|hostToken|lesser-host|hostBaseUrl|control-plane/);
	assert.doesNotMatch(helperSource, /soulWorkflowHost|hostToken|hostBaseUrl|control-plane/);
});
