import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
	SoulBootstrapSigningUxError,
	assertSoulBootstrapSubmitPrerequisites,
	buildSoulBootstrapSubmitInput,
	createActiveSoulBootstrapSigningPlan,
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

test('M4.3 principal signing fails closed without prior wallet signature', () => {
	const plan = createActiveSoulBootstrapSigningPlan(
		resultFromSurface(project44SoulBootstrapFixtures.principalDeclarationPreflight)
	);

	assert.equal(plan.kind, 'principal_declaration');
	assert.throws(
		() => assertSoulBootstrapSubmitPrerequisites(plan, { walletChallengeSignature: null }),
		(error) => error instanceof SoulBootstrapSigningUxError &&
			error.code === 'missing_wallet_challenge_signature'
	);
});

test('M4.3 principal signing uses adapter hex bytes and canonical declaration only when prior UI signature is present', () => {
	const plan = createActiveSoulBootstrapSigningPlan(
		resultFromSurface(project44SoulBootstrapFixtures.principalDeclarationPreflight)
	);

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
		principalDeclaration: project44SoulBootstrapSigning.principalDeclaration.canonicalJson,
		principalSignature: signatureB,
		declaredAt: project44SoulBootstrapIds.declaredAt,
		idempotencyKey: project44SoulBootstrapIds.principalIdempotencyKey,
		correlationKey: project44SoulBootstrapIds.correlationKey,
	});
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
	assert.match(panelSource, /verifySoulBootstrapWallet/);
	assert.match(panelSource, /verifySoulBootstrapPrincipalDeclaration/);
	assert.match(panelSource, /finalizeSoulBootstrap/);
	assert.match(helperSource, /eip191_personal_sign/);
	assert.match(helperSource, /messageHex/);
	assert.match(helperSource, /createSubmitInput/);
	assert.doesNotMatch(panelSource, /soulWorkflowHost|hostToken|lesser-host|hostBaseUrl|control-plane/);
	assert.doesNotMatch(helperSource, /soulWorkflowHost|hostToken|hostBaseUrl|control-plane/);
});
