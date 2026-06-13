import type {
	AgentGenesisWorkspaceData,
	GraduationApprovalThreadData,
	IdentityNexusData,
	NexusDashboardData,
	SoulRequestCenterData,
} from '$lib/greater/faces/agent';
import type { MessageRole } from '$lib/components/chat';
import type { AgentWorkflowSurface, DroneAgentState } from '$lib/api';
import type {
	SoulBootstrapResult,
	SoulBootstrapSigningCheckpoint,
	SoulBootstrapState,
	SoulBootstrapSurface,
} from '$lib/api/soulBootstrap';
import type { SoulAnchorAssurance } from '$lib/components/soul';
import type { SoulBootstrapUxState } from './bootstrapUx';

export type AppPageKey =
	| 'dashboard'
	| 'drones'
	| 'souls'
	| 'genesis'
	| 'approvals'
	| 'identity'
	| 'timeline'
	| 'conversations'
	| 'notifications'
	| 'explore'
	| 'profile'
	| 'status'
	| 'auth-callback'
	| 'not-found';

export interface AppPageDescriptor {
	key: AppPageKey;
	path: string;
	title: string;
	eyebrow: string;
	summary: string;
	requiresAuth?: boolean;
}

export interface MintTranscriptMessage {
	id: string;
	role: MessageRole;
	label: string;
	content: string;
	createdAt?: string;
}

export interface HostWorkflowState {
	hostBridgeAvailable: boolean | null;
	creationReady: boolean;
	authNote: string;
	bootstrap: SoulBootstrapUxState;
	baseUrl: string | null;
	result: SoulBootstrapResult | null;
	surface: SoulBootstrapSurface | null;
	state: SoulBootstrapState | null;
	nextAction: string | null;
	signingCheckpoints: readonly SoulBootstrapSigningCheckpoint[];
	conversationCount: number;
	lifecycleEventCount: number;
	activeConversationId: string | null;
	activeConversationStatus: string | null;
	transcript: readonly MintTranscriptMessage[];
	producedDeclarations: Record<string, unknown> | null;
	expectedWallet: string | null;
}

export interface AppActionContext {
	activeUsername: string | null;
	activeAgentId: string | null;
	activeSoulAgentId: string | null;
	activeConversationId: string | null;
	expectedWallet: string | null;
}

export interface HostedBoundSoulActivationDisclosureData {
	anchorAssurance: SoulAnchorAssurance | null;
	publicLaunchStatus: 'blocked';
	reviewState: 'prototype';
}

export interface FaceCollection {
	dashboard: NexusDashboardData;
	souls: SoulRequestCenterData;
	genesis: AgentGenesisWorkspaceData;
	approvals: GraduationApprovalThreadData;
	identity: IdentityNexusData;
}

export interface ClientAppState {
	page: AppPageDescriptor;
	faces: FaceCollection;
	activeAgent: DroneAgentState | null;
	workflow: AgentWorkflowSurface | null;
	hostWorkflow: HostWorkflowState;
	actionContext: AppActionContext;
	activationDisclosure: HostedBoundSoulActivationDisclosureData;
	currentUserId: string;
	currentUserName: string;
	agentCount: number;
	soulCount: number;
	requestCount: number;
	reviewCount: number;
	isPreview: boolean;
}
