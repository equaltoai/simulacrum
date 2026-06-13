import type { Page, Route } from '@playwright/test';

import {
	project44SoulBootstrapFixtures,
	project44SoulBootstrapIds,
	type Project44SoulBootstrapSurfaceOptions,
	createProject44SoulBootstrapSurface,
} from '../../../src/lib/greater/adapters/fixtures/soul-bootstrap.ts';
import type { SoulBootstrapSurface } from '../../../src/lib/greater/adapters/soul/bootstrap.ts';

type SoulBootstrapFixtureKey = keyof typeof project44SoulBootstrapFixtures;
type GraphQLRecord = {
	operationName: string;
	variables: Record<string, unknown>;
	url: string;
};

type HostCredentialStorageSnapshot = {
	localStorageKeys: string[];
	sessionStorageKeys: string[];
	disallowedKeys: string[];
};

const DEFAULT_TIMESTAMP = '2026-06-12T12:00:00Z';
const DEFAULT_SIGNATURES = [
	`0x${'a'.repeat(130)}`,
	`0x${'b'.repeat(130)}`,
	`0x${'c'.repeat(130)}`,
] as const;

const OPERATION_RESPONSE_FIELD = {
	BeginSoulBootstrap: 'beginSoulBootstrap',
	VerifySoulBootstrapWallet: 'verifySoulBootstrapWallet',
	PrepareSoulBootstrapPrincipalDeclaration: 'prepareSoulBootstrapPrincipalDeclaration',
	VerifySoulBootstrapPrincipalDeclaration: 'verifySoulBootstrapPrincipalDeclaration',
	SendSoulBootstrapConversationMessage: 'sendSoulBootstrapConversationMessage',
	CompleteSoulBootstrapConversation: 'completeSoulBootstrapConversation',
	PrepareSoulBootstrapFinalize: 'prepareSoulBootstrapFinalize',
	FinalizeSoulBootstrap: 'finalizeSoulBootstrap',
} as const;

const MUTATION_NEXT_SURFACE = {
	BeginSoulBootstrap: 'walletChallenge',
	VerifySoulBootstrapWallet: 'principalDeclarationPreflight',
	PrepareSoulBootstrapPrincipalDeclaration: 'principalDeclarationPreflight',
	VerifySoulBootstrapPrincipalDeclaration: 'conversationMessage',
	SendSoulBootstrapConversationMessage: 'conversationMessage',
	CompleteSoulBootstrapConversation: 'finalizePreflight',
	PrepareSoulBootstrapFinalize: 'finalizePreflight',
	FinalizeSoulBootstrap: 'finalizedHosted',
} as const satisfies Record<keyof typeof OPERATION_RESPONSE_FIELD, SoulBootstrapFixtureKey>;

function jsonResponse(body: Record<string, unknown>) {
	return {
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify(body),
	};
}

function buildViewerActor() {
	return {
		id: 'viewer-project-44',
		username: 'project44-viewer',
		domain: null,
		displayName: 'Project 44 Viewer',
		summary: 'Deterministic Project 44 browser fixture viewer.',
		avatar: '',
		header: '',
		followers: 0,
		following: 0,
		statusesCount: 0,
		bot: false,
		locked: false,
		createdAt: DEFAULT_TIMESTAMP,
		updatedAt: DEFAULT_TIMESTAMP,
		isAgent: false,
		agentInfo: null,
		tipAddress: null,
		tipChainId: null,
		trustScore: 0,
		fields: [],
	};
}

function buildAgentCapabilities() {
	return {
		canPost: true,
		canReply: true,
		canBoost: false,
		canFollow: true,
		canDM: false,
		maxPostsPerHour: 12,
		requiresApproval: true,
		restrictedDomains: [],
	};
}

function buildIdentitySemantics(soulBindingState: 'UNBOUND' | 'BOUND' = 'UNBOUND') {
	return {
		identityState: soulBindingState === 'BOUND' ? 'souled' : 'drone',
		identityLabel: soulBindingState === 'BOUND' ? 'Hosted/off-chain soul' : 'Drone body',
		lifecycleState: soulBindingState === 'BOUND' ? 'continuity.stable' : 'request.submitted',
		soulBindingState,
		soulAgentId: soulBindingState === 'BOUND' ? project44SoulBootstrapIds.soulAgentId : null,
		continuityState: soulBindingState === 'BOUND' ? 'stable' : 'pending',
		continuitySummary: 'Project 44 fixture preserves same-body continuity.',
		bodyIdentityPreserved: true,
		timelinePresencePreserved: true,
		memoryReferencesPreserved: true,
		attributionLabel: 'Project 44 continuity',
		moderationLabel: 'Deterministic browser fixture',
	};
}

function buildProject44Agent() {
	return {
		id: project44SoulBootstrapIds.bodyId,
		username: project44SoulBootstrapIds.username,
		displayName: 'Agent Zero',
		bio: 'Deterministic Project 44 bootstrap body.',
		agentType: 'drone',
		agentVersion: 'project-44-fixture',
		agentCapabilities: buildAgentCapabilities(),
		agentOwner: 'project44-viewer',
		delegatedScopes: ['read', 'write'],
		mcpAccess: {
			mcpURL: 'https://example.invalid/mcp',
			protectedResourceURL: 'https://example.invalid/mcp/resource',
			authorizationServerURL: 'https://example.invalid/oauth',
			registrationURL: 'https://example.invalid/oauth/register',
			scopes: ['read', 'write'],
			guidance: ['Browser fixture only.'],
		},
		verified: false,
		verifiedAt: null,
		ownerActor: buildViewerActor(),
		createdAt: DEFAULT_TIMESTAMP,
		activityCount: 0,
		quarantineStatus: null,
		quarantineStart: null,
		quarantineEnd: null,
		quarantineApprovedBy: null,
		quarantineApprovedAt: null,
		quarantineActive: false,
		identitySemantics: buildIdentitySemantics(),
		workflow: null,
	};
}

function createAuthSession() {
	return {
		accessToken: 'project44-browser-fixture-token',
		tokenType: 'Bearer',
		scope: 'read write follow',
		createdAt: Date.now(),
		expiresIn: 3600,
		expiresAt: Date.now() + 3600_000,
	};
}

function payloadForSurface(surface: SoulBootstrapSurface) {
	return {
		__typename: 'SoulBootstrapMutationPayload',
		executable: surface.executable,
		error: surface.error,
		bootstrap: surface,
	};
}

function operationNameFromRoute(route: Route): { operationName: string | null; variables: Record<string, unknown> } {
	const body = route.request().postDataJSON() as {
		operationName?: string;
		query?: string;
		variables?: Record<string, unknown>;
	} | null;
	const query = body?.query ?? '';
	const operationName = body?.operationName ?? /\b(?:query|mutation)\s+([A-Za-z0-9_]+)/.exec(query)?.[1] ?? null;
	return { operationName, variables: body?.variables ?? {} };
}

function operationError(operationName: string | null) {
	return jsonResponse({
		errors: [{ message: `Unexpected GraphQL operation in Project 44 browser fixture: ${operationName ?? 'unknown'}` }],
	});
}

export function createProject44HostUnavailableSurface() {
	return createProject44SoulBootstrapSurface({
		phase: 'ERROR',
		state: 'host_bridge_unavailable',
		executable: false,
		hostBridgeAvailable: false,
		nextAction: 'retry',
		error: null,
	} satisfies Project44SoulBootstrapSurfaceOptions);
}

export async function installProject44Auth(page: Page) {
	await page.addInitScript((session) => {
		window.sessionStorage.setItem('simulacrum:auth_session', JSON.stringify(session));
	}, createAuthSession());
}

export async function installProject44Wallet(page: Page, options: { rejectPersonalSign?: boolean } = {}) {
	await page.addInitScript(
		({ accounts, signatures, rejectPersonalSign }) => {
			const walletRequests: Array<{ method: string; params?: unknown }> = [];
			let signatureIndex = 0;
			Object.defineProperty(window, '__project44WalletRequests', {
				value: walletRequests,
				configurable: true,
			});
			Object.defineProperty(window, 'ethereum', {
				value: {
					request: async ({ method, params }: { method: string; params?: unknown }) => {
						walletRequests.push({ method, params });
						if (method === 'eth_accounts' || method === 'eth_requestAccounts') return accounts;
						if (method === 'personal_sign') {
							if (rejectPersonalSign) {
								const error = new Error('User rejected Project 44 signing fixture.');
								(error as Error & { code?: number }).code = 4001;
								throw error;
							}
							return signatures[signatureIndex++] ?? signatures.at(-1);
						}
						throw new Error(`Unexpected wallet request: ${method}`);
					},
				},
				configurable: true,
			});
		},
		{
			accounts: [project44SoulBootstrapIds.walletAddress, project44SoulBootstrapIds.principalAddress],
			signatures: DEFAULT_SIGNATURES,
			rejectPersonalSign: Boolean(options.rejectPersonalSign),
		}
	);
}

export async function installProject44Routes(
	page: Page,
	options: { initialSurface?: SoulBootstrapFixtureKey | SoulBootstrapSurface } = {}
) {
	let currentSurface: SoulBootstrapSurface = typeof options.initialSurface === 'string'
		? project44SoulBootstrapFixtures[options.initialSurface]
		: options.initialSurface ?? project44SoulBootstrapFixtures.notStarted;
	const graphQLRequests: GraphQLRecord[] = [];

	await page.route('**/api/v2/instance', async (route) => {
		await route.fulfill(jsonResponse({
			configuration: {
				trust: {
					enabled: true,
					base_url: 'http://127.0.0.1:4173',
				},
			},
		}));
	});

	await page.route('**/api/graphql', async (route) => {
		const { operationName, variables } = operationNameFromRoute(route);
		graphQLRequests.push({
			operationName: operationName ?? 'unknown',
			variables,
			url: route.request().url(),
		});

		switch (operationName) {
			case 'Viewer':
				await route.fulfill(jsonResponse({ data: { viewer: buildViewerActor() } }));
				return;
			case 'MyAgents':
				await route.fulfill(jsonResponse({ data: { myAgents: [buildProject44Agent()] } }));
				return;
			case 'MySouls':
				await route.fulfill(jsonResponse({ data: { mySouls: [] } }));
				return;
			case 'MyDroneRequests':
				await route.fulfill(jsonResponse({ data: { myDroneRequests: [] } }));
				return;
			case 'MyDroneReviews':
				await route.fulfill(jsonResponse({ data: { myDroneReviews: [] } }));
				return;
			case 'DroneAgentState':
				await route.fulfill(jsonResponse({ data: { agent: buildProject44Agent() } }));
				return;
			case 'DroneWorkflow':
				await route.fulfill(jsonResponse({ data: { droneWorkflow: null } }));
				return;
			case 'SoulBootstrap':
				await route.fulfill(jsonResponse({ data: { soulBootstrap: currentSurface } }));
				return;
			case 'BeginSoulBootstrap':
			case 'VerifySoulBootstrapWallet':
			case 'PrepareSoulBootstrapPrincipalDeclaration':
			case 'VerifySoulBootstrapPrincipalDeclaration':
			case 'SendSoulBootstrapConversationMessage':
			case 'CompleteSoulBootstrapConversation':
			case 'PrepareSoulBootstrapFinalize':
			case 'FinalizeSoulBootstrap': {
				currentSurface = project44SoulBootstrapFixtures[MUTATION_NEXT_SURFACE[operationName]];
				await route.fulfill(jsonResponse({
					data: {
						[OPERATION_RESPONSE_FIELD[operationName]]: payloadForSurface(currentSurface),
					},
				}));
				return;
			}
			default:
				await route.fulfill(operationError(operationName));
		}
	});

	return {
		setSurface(surface: SoulBootstrapFixtureKey | SoulBootstrapSurface) {
			currentSurface = typeof surface === 'string' ? project44SoulBootstrapFixtures[surface] : surface;
		},
		graphQLRequests: () => [...graphQLRequests],
	};
}

export async function readProject44WalletRequests(page: Page) {
	return page.evaluate(() => (
		(window as unknown as { __project44WalletRequests?: Array<{ method: string; params?: unknown }> })
			.__project44WalletRequests ?? []
	));
}

export async function readHostCredentialStorage(page: Page): Promise<HostCredentialStorageSnapshot> {
	return page.evaluate(() => {
		const disallowedPattern = /hostToken|host[-_:]?token|hostBaseUrl|host[-_:]?base[-_:]?url|soulWorkflowHost|instanceKey|instance[-_:]?key|lesserHost/i;
		const localStorageKeys = Object.keys(window.localStorage);
		const sessionStorageKeys = Object.keys(window.sessionStorage);
		const disallowedKeys = [...localStorageKeys, ...sessionStorageKeys].filter((key) => disallowedPattern.test(key));
		return { localStorageKeys, sessionStorageKeys, disallowedKeys };
	});
}
