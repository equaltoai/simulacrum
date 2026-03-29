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
	SoulAgentPromotion,
	SoulAgentPromotionLifecycleEvent,
	SoulMintConversation,
} from '$lib/api/soulWorkflowHost';

export type AppPageKey =
	| 'dashboard'
	| 'souls'
	| 'genesis'
	| 'approvals'
	| 'identity'
	| 'auth-callback'
	| 'not-found';

export interface AppPageDescriptor {
	key: AppPageKey;
	path: string;
	title: string;
	eyebrow: string;
	summary: string;
	requiresAuth?: boolean;
	requiresHostToken?: boolean;
}

export interface MintTranscriptMessage {
	id: string;
	role: MessageRole;
	label: string;
	content: string;
	createdAt?: string;
}

export interface HostWorkflowState {
	bridgeEnabled: boolean;
	tokenConfigured: boolean;
	authNote: string;
	promotion: SoulAgentPromotion | null;
	lifecycleEvents: readonly SoulAgentPromotionLifecycleEvent[];
	conversations: readonly SoulMintConversation[];
	selectedConversation: SoulMintConversation | null;
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
	currentUserId: string;
	currentUserName: string;
	agentCount: number;
	soulCount: number;
	requestCount: number;
	reviewCount: number;
	isPreview: boolean;
}
