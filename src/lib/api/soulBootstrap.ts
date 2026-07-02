import {
	SoulBootstrapClientError,
	createHostedSoulBootstrapClient,
	createSoulBootstrapClient,
	normalizeSoulBootstrapError,
	type BeginSoulBootstrapInput,
	type CompleteHostedSoulGenesisInput,
	type CompleteSoulBootstrapConversationInput,
	type FinalizeSoulBootstrapInput,
	type HostedSoulBootstrapClient,
	type HostedSoulBootstrapMutationResult,
	type HostedSoulBootstrapResult,
	type PrepareSoulBootstrapFinalizeInput,
	type PrepareSoulBootstrapPrincipalDeclarationInput,
	type PublishHostedSoulInput,
	type RestartSoulBootstrapInput,
	type SendHostedSoulGenesisMessageInput,
	type SendSoulBootstrapConversationMessageInput,
	type SoulBootstrapClient,
	type SoulBootstrapMutationResult,
	type StartHostedSoulBootstrapInput,
	type VerifySoulBootstrapPrincipalDeclarationInput,
	type VerifySoulBootstrapWalletInput,
} from '$lib/greater/adapters/soul';
import type {
	HostedGenesisConversationSummary,
	RecoverHostedSoulGenesisTurnInput,
} from '$lib/greater/adapters/graphql/generated/types';

import { getAccessToken } from './auth';

/**
 * Re-export the new GraphQL types that Greater v0.11.7 brought via generated
 * types but did not re-export through the soul adapter index. These are
 * additive types from Lesser v1.5.12.
 */
export type {
	HostedGenesisConversationSummary,
	RecoverHostedSoulGenesisTurnInput,
};

export const SOUL_BOOTSTRAP_AUTH_NOTE =
	'Hosted/off-chain soul definition uses Lesser same-origin GraphQL. Lesser performs server-side Host instance-trust calls, so Simulacrum never asks the browser for wallets, signing prompts, lesser-host control-plane tokens, or Host instance keys on the default path.';

export const SOUL_BOOTSTRAP_LEGACY_SIGNING_NOTE =
	'Wallet/principal/finalize signing remains an explicit assurance-upgrade or legacy recovery surface; it is not the default hosted/off-chain creation path.';

export interface SoulBootstrapRequestOptions {
	endpoint?: string;
	token?: string | null;
	signal?: AbortSignal;
	fetch?: typeof fetch;
}

export interface SoulBootstrapCurrentOptions extends SoulBootstrapRequestOptions {
	username: string;
}

function requireAccessToken(token?: string | null): string {
	const resolved = token?.trim() || getAccessToken();
	if (!resolved) throw new Error('Not authenticated');
	return resolved;
}

function createRequestFetch(signal?: AbortSignal, fetchLike: typeof fetch = fetch) {
	return (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
		fetchLike(input, {
			...init,
			signal: signal ?? init?.signal,
		});
}

export function createProject44HostedSoulBootstrapClient({
	endpoint = '/api/graphql',
	token,
	signal,
	fetch: fetchLike,
}: SoulBootstrapRequestOptions = {}): HostedSoulBootstrapClient {
	return createHostedSoulBootstrapClient({
		httpEndpoint: endpoint,
		token: requireAccessToken(token),
		fetch: createRequestFetch(signal, fetchLike),
	});
}

export function createProject44SoulBootstrapClient({
	endpoint = '/api/graphql',
	token,
	signal,
	fetch: fetchLike,
}: SoulBootstrapRequestOptions = {}): SoulBootstrapClient {
	return createSoulBootstrapClient({
		httpEndpoint: endpoint,
		token: requireAccessToken(token),
		fetch: createRequestFetch(signal, fetchLike),
	});
}

export async function fetchSoulBootstrapSurface({
	username,
	...options
}: SoulBootstrapCurrentOptions): Promise<HostedSoulBootstrapResult> {
	return createProject44HostedSoulBootstrapClient(options).current({ username });
}

export async function startHostedSoulBootstrap({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: StartHostedSoulBootstrapInput;
}): Promise<HostedSoulBootstrapMutationResult> {
	return createProject44HostedSoulBootstrapClient(options).startHostedSoulBootstrap(input);
}

export async function sendHostedSoulGenesisMessage({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: SendHostedSoulGenesisMessageInput;
}): Promise<HostedSoulBootstrapMutationResult> {
	return createProject44HostedSoulBootstrapClient(options).sendHostedSoulGenesisMessage(input);
}

export async function completeHostedSoulGenesis({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: CompleteHostedSoulGenesisInput;
}): Promise<HostedSoulBootstrapMutationResult> {
	return createProject44HostedSoulBootstrapClient(options).completeHostedSoulGenesis(input);
}

export async function publishHostedSoul({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: PublishHostedSoulInput;
}): Promise<HostedSoulBootstrapMutationResult> {
	return createProject44HostedSoulBootstrapClient(options).publishHostedSoul(input);
}

export async function restartSoulBootstrap({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: RestartSoulBootstrapInput;
}): Promise<HostedSoulBootstrapMutationResult> {
	return createProject44HostedSoulBootstrapClient(options).restartSoulBootstrap(input);
}

export async function beginSoulBootstrap({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: BeginSoulBootstrapInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).begin(input);
}

export async function verifySoulBootstrapWallet({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: VerifySoulBootstrapWalletInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).verifyWallet(input);
}

export async function prepareSoulBootstrapPrincipalDeclaration({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: PrepareSoulBootstrapPrincipalDeclarationInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).preparePrincipalDeclaration(input);
}

export async function verifySoulBootstrapPrincipalDeclaration({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: VerifySoulBootstrapPrincipalDeclarationInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).verifyPrincipalDeclaration(input);
}

export async function sendSoulBootstrapConversationMessage({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: SendSoulBootstrapConversationMessageInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).sendConversationMessage(input);
}

export async function completeSoulBootstrapConversation({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: CompleteSoulBootstrapConversationInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).completeConversation(input);
}

export async function prepareSoulBootstrapFinalize({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: PrepareSoulBootstrapFinalizeInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).prepareFinalize(input);
}

export async function finalizeSoulBootstrap({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: FinalizeSoulBootstrapInput;
}): Promise<SoulBootstrapMutationResult> {
	return createProject44SoulBootstrapClient(options).finalize(input);
}

export function isSoulBootstrapError(error: unknown): error is SoulBootstrapClientError {
	return error instanceof SoulBootstrapClientError;
}

export { SoulBootstrapClientError, normalizeSoulBootstrapError };

// ---------------------------------------------------------------------------
// Project 51 — recoverHostedSoulGenesisTurn + listHostedGenesisConversations
// ---------------------------------------------------------------------------
//
// Greater v0.11.7 brought the generated GraphQL types for these operations
// but not pre-built documents or adapter client methods. These sim-owned
// wrappers construct the GraphQL operations and send them through the same
// Lesser same-origin /api/graphql endpoint + auth path as the existing
// HostedSoulBootstrapClient.

const RECOVER_HOSTED_SOUL_GENESIS_TURN_MUTATION = `mutation RecoverHostedSoulGenesisTurn($input: RecoverHostedSoulGenesisTurnInput!) {
  recoverHostedSoulGenesisTurn(input: $input) {
    executable
    error {
      code
      message
      source
      statusCode
      detailsJson
      hostRequestId
      recoveryCategory
      recoveryAction
      retryable
      restartRequired
      at
    }
    bootstrap {
      username
      executable
      existingSoulAgentId
      hostBridgeAvailable
      nextAction
      typedNextAction
      availableActions
      recoveryCategory
      recoveryAction
      retryable
      restartAvailable
      soulBindingState
      body {
        bodyId
        username
        displayName
        owner {
          id
          name
          role
          handle
          avatarLabel
          statusLabel
        }
      }
      state {
        bodyId
        username
        state
        phase
        walletAddress
        principalAddress
        hostRegistrationId
        hostConversationId
        hostSoulAgentId
        bootstrapMode
        authorityModel
        anchorState
        assuranceState
        hostConversationStatus
        updatedAt
        typedNextAction
        availableActions
        recoveryCategory
        recoveryAction
        retryable
        restartRequired
        restartAvailable
        recoveryAttemptId
        restartIdempotencyKey
        lastHostRequestId
        restartedAt
        hostedGenesisConversation {
          registrationId
          conversationId
          status
          latestTurnId
          messageCount
          messagesTruncated
          requestId
          updatedAt
          messages {
            id
            role
            content
            order
            createdAt
            truncated
          }
        }
        signingCheckpoints {
          name
          status
          message
          messageEncoding
          messageHex
          canonicalJson
          digestHex
          boundaryRequirementsJson
          registrationPreviewJson
          finalizeRequestTemplateJson
          signingMethod
          signerAddress
          principalAddress
          version
          expectedVersion
          nextVersion
          issuedAt
          declaredAt
          completedAt
          hostRequestId
        }
        terminalDeclarationEvidence {
          conversationId
          hostStatus
          hostRequestId
          declarationsHash
          producedDeclarationsPreview {
            title
            declarationCount
          }
        }
        publication {
          agentId
          authorityModel
          anchorState
          publishedAt
          publishedVersion
          registrationS3Key
          registrationUri
          versionedRegistrationS3Key
          versionedRegistrationUri
        }
        publicationEvidence {
          agentId
          authorityModel
          anchorState
          publishedAt
          publishedVersion
          registrationS3Key
          registrationUri
          versionedRegistrationS3Key
          versionedRegistrationUri
        }
        publishGate {
          canPublishHostedSoul
          reason
          requiresActiveConversationTerminalDeclarationEvidence
        }
        error {
          code
          message
          source
          statusCode
          detailsJson
          hostRequestId
          recoveryCategory
          recoveryAction
          retryable
          restartRequired
          at
        }
        correlation {
          correlationKey
          beginIdempotencyKey
          walletVerificationIdempotencyKey
          principalDeclarationIdempotencyKey
          conversationIdempotencyKey
          finalizeIdempotencyKey
          restartIdempotencyKey
          recoveryAttemptId
          supersededHostRegistrationId
          supersededHostConversationId
          lastHostRequestId
        }
      }
      error {
        code
        message
        source
        statusCode
        detailsJson
        hostRequestId
        recoveryCategory
        recoveryAction
        retryable
        restartRequired
        at
      }
      workflow {
        username
        currentPhase
        currentState
      }
    }
  }
}`;

const LIST_HOSTED_GENESIS_CONVERSATIONS_QUERY = `query ListHostedGenesisConversations($username: String!) {
  listHostedGenesisConversations(username: $username) {
    conversationId
    registrationId
    status
    messageCount
    latestTurnId
    createdAt
    updatedAt
  }
}`;

export async function recoverHostedSoulGenesisTurn({
	input,
	...options
}: SoulBootstrapRequestOptions & {
	input: RecoverHostedSoulGenesisTurnInput;
}): Promise<HostedSoulBootstrapResult> {
	const token = requireAccessToken(options.token);
	const endpoint = options.endpoint ?? '/api/graphql';
	const fetchLike = options.fetch ?? fetch;
	const signal = options.signal;

	// Send the recoverHostedSoulGenesisTurn mutation through the same
	// Lesser same-origin /api/graphql endpoint. This calls Host's POST
	// /recover without adding a user message to the transcript.
	const response = await fetchLike(endpoint, {
		method: 'POST',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
			authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({
			operationName: 'RecoverHostedSoulGenesisTurn',
			query: RECOVER_HOSTED_SOUL_GENESIS_TURN_MUTATION,
			variables: { input },
			signal,
		}),
	});

	if (!response.ok) {
		throw new SoulBootstrapClientError({
			category: response.status === 401 || response.status === 403 ? 'unauthorized' : 'unknown',
			message: `Recover hosted soul genesis turn failed with HTTP ${response.status}`,
			statusCode: response.status,
		});
	}

	const body = (await response.json()) as {
		data?: { recoverHostedSoulGenesisTurn?: unknown };
		errors?: readonly { message: string }[];
	};

	if (body.errors?.length) {
		throw new SoulBootstrapClientError({
			category: 'graphql_error',
			message: body.errors[0].message,
		});
	}

	if (!body.data?.recoverHostedSoulGenesisTurn) {
		throw new SoulBootstrapClientError({
			category: 'graphql_error',
			message: 'Recover hosted soul genesis turn response did not include data',
		});
	}

	// The mutation succeeded. Re-fetch the bootstrap surface through the
	// client's current() to get the properly mapped HostedSoulBootstrapResult.
	// Lesser's soulBootstrap query read-repairs from Host, so this returns
	// the fresh post-recovery state with the updated transcript.
	const client = createProject44HostedSoulBootstrapClient(options);
	return client.current(input.username);
}

export async function listHostedGenesisConversations({
	username,
	...options
}: SoulBootstrapCurrentOptions): Promise<HostedGenesisConversationSummary[]> {
	const token = requireAccessToken(options.token);
	const endpoint = options.endpoint ?? '/api/graphql';
	const fetchLike = options.fetch ?? fetch;
	const response = await fetchLike(endpoint, {
		method: 'POST',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
			authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({
			operationName: 'ListHostedGenesisConversations',
			query: LIST_HOSTED_GENESIS_CONVERSATIONS_QUERY,
			variables: { username },
			signal: options.signal,
		}),
	});

	if (!response.ok) {
		throw new SoulBootstrapClientError({
			category: response.status === 401 || response.status === 403 ? 'unauthorized' : 'unknown',
			message: `List hosted genesis conversations failed with HTTP ${response.status}`,
			statusCode: response.status,
		});
	}

	const body = (await response.json()) as {
		data?: { listHostedGenesisConversations?: HostedGenesisConversationSummary[] };
		errors?: readonly { message: string }[];
	};

	if (body.errors?.length) {
		throw new SoulBootstrapClientError({
			category: 'graphql_error',
			message: body.errors[0].message,
		});
	}

	return body.data?.listHostedGenesisConversations ?? [];
}
export type {
	BeginSoulBootstrapInput,
	CompleteHostedSoulGenesisInput,
	CompleteSoulBootstrapConversationInput,
	FinalizeSoulBootstrapInput,
	HostedSoulBootstrapActionableError,
	HostedSoulBootstrapAvailableAction,
	HostedSoulBootstrapBoundSoulEvidence,
	HostedSoulBootstrapClient,
	HostedSoulBootstrapHostRequestMetadata,
	HostedSoulBootstrapMutationResult,
	HostedSoulBootstrapNextAction,
	HostedSoulBootstrapRecoveryAction,
	HostedSoulBootstrapRecoveryCategory,
	HostedSoulBootstrapResult,
	HostedSoulBootstrapStateModel,
	HostedSoulGenesisComposerState,
	HostedSoulGenesisConversationMessage,
	HostedSoulGenesisConversationTranscript,
	PrepareSoulBootstrapFinalizeInput,
	PrepareSoulBootstrapPrincipalDeclarationInput,
	PublishHostedSoulInput,
	RestartSoulBootstrapInput,
	SendHostedSoulGenesisMessageInput,
	SendSoulBootstrapConversationMessageInput,
	SoulBootstrapActionableError,
	SoulBootstrapClient,
	SoulBootstrapCorrelationState,
	SoulBootstrapCurrentInput,
	SoulBootstrapErrorCategory,
	SoulBootstrapErrorState,
	SoulBootstrapMutationPayload,
	SoulBootstrapMutationResult,
	SoulBootstrapPhase,
	SoulBootstrapPublicationEvidence,
	SoulBootstrapResult,
	SoulBootstrapSigningCheckpoint,
	SoulBootstrapState,
	SoulBootstrapSurface,
	StartHostedSoulBootstrapInput,
	VerifySoulBootstrapPrincipalDeclarationInput,
	VerifySoulBootstrapWalletInput,
} from '$lib/greater/adapters/soul';
