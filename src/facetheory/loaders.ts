import {
	beginSoulRegistration,
	setSoulAvatarBaseUrl,
	registerSoulAgents,
	markRegistrationComplete,
} from '$lib/greater/adapters/soul/avatarResolver.svelte';
import {
	createLesserHostSoulClient,
	type SoulAgentChannelPreferencesResponse,
	type SoulAgentChannelsResponse,
} from '$lib/greater/adapters';
import {
	fetchDroneAgentState,
	fetchDroneWorkflow,
	fetchMyAgents,
	fetchMyDroneRequests,
	fetchMyDroneReviews,
	fetchMySouls,
	fetchViewer,
	updateProfile,
	type AgentWorkflowSurface,
	type DroneAgentState,
	type ReviewDecisionCard,
	type SoulRequestCard,
} from '$lib/api';
import {
	SOUL_WORKFLOW_HOST_AUTH_NOTE,
	getAgentMintConversation,
	getAgentPromotion,
	listAgentMintConversations,
	listAgentPromotionLifecycleEvents,
	type SoulAgentPromotion,
	type SoulAgentPromotionLifecycleEvent,
	type SoulMintConversation,
} from '$lib/api/soulWorkflowHost';
import type {
	AgentFaceAction,
	AgentFaceAttributionRecord,
	AgentFaceCallout,
	AgentFaceConversationEntry,
	AgentFaceMetric,
	AgentFaceNavItem,
	AgentFaceStatusChip,
	AgentFaceTimelineMoment,
	AgentGenesisWorkspaceData,
	GraduationApprovalThreadData,
	IdentityNexusData,
	NexusDashboardData,
	SoulRequestCenterData,
} from '$lib/greater/faces/agent';
import type {
	AgentIdentityCardData as FaceAgentIdentityCardData,
	AgentLifecycleStep as FaceAgentLifecycleStep,
	AgentSurfaceActor as FaceAgentSurfaceActor,
	AgentSurfaceArtifact as FaceAgentSurfaceArtifact,
	AgentSurfaceMetric as FaceAgentSurfaceMetric,
	ContinuityPanelData as FaceContinuityPanelData,
	DeclarationPreviewCardData as FaceDeclarationPreviewCardData,
	GraduationSummaryCardData as FaceGraduationSummaryCardData,
	ReviewDecisionCardData as FaceReviewDecisionCardData,
	ReviewFinding as FaceReviewFinding,
	SignatureCheckpointCardData as FaceSignatureCheckpointCardData,
	SoulRequestCardData as FaceSoulRequestCardData,
} from '$lib/components/agent';
import type {
	Account as NotificationAccount,
	WorkflowEventKind,
	WorkflowEventNotification,
} from '$lib/components/notifications';
import type {
	DirectMessage,
	MessageParticipant,
	MessagingWorkflowConversationSummary,
} from '$lib/components/messaging';
import type { SoulChannels, SoulContactPreferences } from '$lib/components/soul';

import { getPageHref } from './routing';
import type {
	AppActionContext,
	AppPageDescriptor,
	ClientAppState,
	HostWorkflowState,
	MintTranscriptMessage,
} from './types';
import {
	HOST_WORKFLOW_BRIDGE_DISABLED_NOTE,
	HOST_WORKFLOW_BRIDGE_ENABLED,
} from './flags';

interface ViewerInfo {
	id: string;
	name: string;
	handle: string;
	avatar?: string | null;
}

interface AgentRosterRecord {
	id: string;
	username: string;
	displayName: string;
	bio?: string | null;
	activityCount: number;
	verified: boolean;
	requiresApproval: boolean;
	canDM: boolean;
}

interface SoulInventoryRecord {
	bindingState: string;
	availableForIncorporation: boolean;
	agent: {
		agentId: string;
		domain: string;
		localId: string;
		ensName?: string | null;
		wallet: string;
		principalAddress?: string | null;
		status: string;
		lifecycleStatus?: string | null;
		selfDescriptionVersion?: number | null;
		capabilities: readonly string[];
		mintedAt?: string | null;
		updatedAt?: string | null;
	};
	binding?: {
		agentUsername: string;
		boundAt: string;
	} | null;
}

interface AuthorityNotice {
	title: string;
	message: string;
}

interface AssembleAppStateInput {
	page: AppPageDescriptor;
	agentHint?: string | null;
	viewer: ViewerInfo;
	myAgents: readonly AgentRosterRecord[];
	mySouls: readonly SoulInventoryRecord[];
	boundSoul: SoulInventoryRecord | null;
	activeAgent: DroneAgentState | null;
	workflow: AgentWorkflowSurface | null;
	myRequests: readonly SoulRequestCard[];
	myReviews: readonly ReviewDecisionCard[];
	channels: SoulChannels;
	channelsUpdatedAt?: string | null;
	preferences: SoulContactPreferences | null;
	showReachability: boolean;
	reachabilityNotice?: AuthorityNotice | null;
	publishedSoulProfile: PublishedSoulProfile | null;
	publishedSoulError?: string | null;
	hostWorkflow: HostWorkflowState;
	isPreview: boolean;
}

interface LesserInstanceConfigResponse {
	configuration?: {
		trust?: {
			base_url?: string | null;
			enabled?: boolean | null;
		} | null;
	} | null;
}

interface PublishedSoulAgentRecord {
	agent_id: string;
	domain: string;
	local_id: string;
	ens_name?: string;
	wallet: string;
	token_id?: string;
	meta_uri?: string;
	avatar?: {
		token_uri?: string;
		image?: string;
		current_style_id?: number;
		current_style_name?: string;
		current_renderer_address?: string;
		styles?: Array<{
			style_id: number;
			style_name?: string;
			renderer_address?: string;
			image?: string;
			selected?: boolean;
		}>;
	};
	principal_address?: string;
	principal_signature?: string;
	principal_declaration?: string;
	principal_declared_at?: string;
	lifecycle_reason?: string;
	successor_agent_id?: string;
	predecessor_agent_id?: string;
	self_description_version?: number;
	status: string;
	minted_at?: string;
	updated_at?: string;
}

interface PublishedSoulAgentResponse {
	version: string;
	agent: PublishedSoulAgentRecord;
}

interface PublishedSoulCapability {
	capability: string;
	scope?: string;
	constraints?: Record<string, unknown>;
	claim_level?: string;
	degrades_to?: string;
}

interface PublishedSoulCapabilitiesResponse {
	version: string;
	capabilities: PublishedSoulCapability[];
	count: number;
}

interface PublishedSoulBoundary {
	agent_id: string;
	boundary_id: string;
	category: string;
	statement: string;
	rationale?: string;
	added_in_version?: number;
	added_at?: string;
}

interface PublishedSoulBoundariesResponse {
	version: string;
	boundaries: PublishedSoulBoundary[];
	count: number;
	has_more: boolean;
}

interface PublishedSoulTransparencyResponse {
	version: string;
	transparency?: Record<string, unknown> | null;
}

interface PublishedSoulProfile {
	agent: PublishedSoulAgentRecord;
	capabilities: readonly PublishedSoulCapability[];
	boundaries: readonly PublishedSoulBoundary[];
	transparency: Record<string, unknown> | null;
}

function optional<T>(value: T | null | undefined): T | undefined {
	return value ?? undefined;
}

function normalizeArtifactEmphasis(
	value?: string | null
): FaceAgentSurfaceArtifact['emphasis'] {
	switch (value) {
		case 'reference':
		case 'decision':
		case 'deliverable':
			return value;
		default:
			return undefined;
	}
}

function normalizeFindingSeverity(
	value?: string | null
): FaceReviewFinding['severity'] {
	switch (value) {
		case 'low':
		case 'medium':
		case 'high':
			return value;
		default:
			return undefined;
	}
}

function normalizeMetric(metric: {
	label: string;
	value: string | number;
	detail?: string | null;
}): FaceAgentSurfaceMetric {
	return {
		label: metric.label,
		value: metric.value,
		detail: optional(metric.detail),
	};
}

function normalizeActor(actor: {
	id: string;
	name: string;
	role: string;
	handle?: string | null;
	avatarLabel?: string | null;
	statusLabel?: string | null;
}): FaceAgentSurfaceActor {
	return {
		id: actor.id,
		name: actor.name,
		role: actor.role,
		handle: optional(actor.handle),
		avatarLabel: optional(actor.avatarLabel),
		statusLabel: optional(actor.statusLabel),
	};
}

function normalizeArtifact(artifact: {
	id: string;
	title: string;
	description?: string | null;
	href?: string | null;
	emphasis?: string | null;
}): FaceAgentSurfaceArtifact {
	return {
		id: artifact.id,
		title: artifact.title,
		description: optional(artifact.description),
		href: optional(artifact.href),
		emphasis: normalizeArtifactEmphasis(artifact.emphasis),
	};
}

function normalizeIdentityCard(
	identity: AgentWorkflowSurface['identity']
): FaceAgentIdentityCardData {
	return {
		id: identity.id,
		name: identity.name,
		handle: optional(identity.handle),
		summary: identity.summary,
		currentPhase: identity.currentPhase,
		currentState: optional(identity.currentState),
		steward: identity.steward ? normalizeActor(identity.steward) : undefined,
		tags: identity.tags.length ? [...identity.tags] : undefined,
		metrics: identity.metrics.length
			? identity.metrics.map((metric) => normalizeMetric(metric))
			: undefined,
	};
}

function normalizeSoulRequestCard(request: SoulRequestCard): FaceSoulRequestCardData {
	return {
		id: request.id,
		title: request.title,
		summary: request.summary,
		requestedBy: normalizeActor(request.requestedBy),
		submittedAt: optional(request.submittedAt),
		constraints: request.constraints.length ? [...request.constraints] : undefined,
		artifacts: request.artifacts.length
			? request.artifacts.map((artifact) => normalizeArtifact(artifact))
			: undefined,
		routeDecision: optional(request.routeDecision),
		currentState: optional(request.currentState),
	};
}

function normalizeReviewDecision(
	review: ReviewDecisionCard
): FaceReviewDecisionCardData {
	return {
		id: review.id,
		title: review.title,
		decision: review.decision,
		reviewer: normalizeActor(review.reviewer),
		decisionSummary: review.decisionSummary,
		findings: review.findings.length
			? review.findings.map((finding) => ({
					id: finding.id,
					title: finding.title,
					detail: finding.detail,
					severity: normalizeFindingSeverity(finding.severity),
				}))
			: undefined,
		evidence: review.evidence.length
			? review.evidence.map((artifact) => normalizeArtifact(artifact))
			: undefined,
	};
}

function normalizeDeclarationCard(
	declaration: NonNullable<AgentWorkflowSurface['declaration']>
): FaceDeclarationPreviewCardData {
	return {
		id: declaration.id,
		title: declaration.title,
		statement: declaration.statement,
		confidence: declaration.confidence,
		owner: declaration.owner ? normalizeActor(declaration.owner) : undefined,
		declaredScope: [...declaration.declaredScope],
		risks: declaration.risks.length ? [...declaration.risks] : undefined,
		supportingArtifacts: declaration.supportingArtifacts.length
			? declaration.supportingArtifacts.map((artifact) => normalizeArtifact(artifact))
			: undefined,
	};
}

function normalizeCheckpointCard(
	checkpoint: NonNullable<AgentWorkflowSurface['checkpoint']>
): FaceSignatureCheckpointCardData {
	return {
		id: checkpoint.id,
		title: checkpoint.title,
		readinessLabel: checkpoint.readinessLabel,
		approvalMemo: optional(checkpoint.approvalMemo),
		dueAt: optional(checkpoint.dueAt),
		signers: checkpoint.signers.map((signer) => ({
			id: signer.id,
			name: signer.name,
			role: signer.role,
			status: signer.status,
			note: optional(signer.note),
		})),
	};
}

function normalizeGraduationCard(
	graduation: NonNullable<AgentWorkflowSurface['graduation']>
): FaceGraduationSummaryCardData {
	return {
		id: graduation.id,
		title: graduation.title,
		readiness: graduation.readiness,
		summary: graduation.summary,
		launchOwner: graduation.launchOwner ? normalizeActor(graduation.launchOwner) : undefined,
		completedMilestones: graduation.completedMilestones.length
			? [...graduation.completedMilestones]
			: undefined,
		exitCriteria: graduation.exitCriteria.length ? [...graduation.exitCriteria] : undefined,
		nextStep: optional(graduation.nextStep),
		metrics: graduation.metrics.length
			? graduation.metrics.map((metric) => normalizeMetric(metric))
			: undefined,
	};
}

function normalizeContinuityPanel(
	continuity: NonNullable<AgentWorkflowSurface['continuity']>
): FaceContinuityPanelData {
	return {
		id: continuity.id,
		title: continuity.title,
		objective: continuity.objective,
		owner: normalizeActor(continuity.owner),
		feedbackLoop: continuity.feedbackLoop,
		metrics: continuity.metrics.length
			? continuity.metrics.map((metric) => normalizeMetric(metric))
			: undefined,
		followUps: continuity.followUps.length
			? continuity.followUps.map((followUp) => ({
					id: followUp.id,
					title: followUp.title,
					summary: followUp.summary,
					owner: normalizeActor(followUp.owner),
					cadence: optional(followUp.cadence),
				}))
			: undefined,
	};
}

function normalizeLifecycle(
	lifecycle: AgentWorkflowSurface['lifecycle']
): readonly FaceAgentLifecycleStep[] {
	return lifecycle.map((step) => ({
		phase: step.phase,
		title: optional(step.title),
		summary: optional(step.summary),
		state: optional(step.state),
		status: step.status,
	}));
}

function normalizeArtifacts(
	artifacts: ReadonlyArray<{
		id: string;
		title: string;
		description?: string | null;
		href?: string | null;
		emphasis?: string | null;
	}>
): readonly FaceAgentSurfaceArtifact[] {
	return artifacts.map((artifact) => normalizeArtifact(artifact));
}

function shouldExposeSoulReachability(
	activeAgent: DroneAgentState | null,
	workflow: AgentWorkflowSurface | null
): boolean {
	const semantics = workflow?.identitySemantics ?? activeAgent?.identitySemantics ?? PREVIEW_AGENT.identitySemantics;
	return semantics.identityState === 'souled' || Boolean(activeAgent?.agentCapabilities.canDM);
}

const PREVIEW_TIMESTAMP = '2026-03-28T16:00:00Z';

const EMPTY_CHANNELS: SoulChannels = {
	ens: null,
	email: null,
	phone: null,
};

const PREVIEW_VIEWER: ViewerInfo = {
	id: 'viewer-preview',
	name: 'Simulacrum Operator',
	handle: '@operator@simulacrum.dev',
};

const PREVIEW_AGENT: DroneAgentState = {
	id: 'preview-agent-lyra',
	username: 'lyra',
	displayName: 'Lyra of the Horizon',
	bio: 'Editorial drone body preparing a same-body graduation into a published soul.',
	agentType: 'drone',
	agentVersion: 'preview-1',
	agentCapabilities: {
		canPost: true,
		canReply: true,
		canBoost: false,
		canFollow: true,
		canDM: false,
		maxPostsPerHour: 12,
		requiresApproval: true,
		restrictedDomains: ['private-network'],
	},
	agentOwner: 'simulacrum-operator',
	delegatedScopes: ['read', 'write', 'follow'],
	mcpAccess: {
		mcpURL: 'https://simulacrum.dev/mcp',
		protectedResourceURL: 'https://simulacrum.dev/mcp/resource',
		authorizationServerURL: 'https://simulacrum.dev/oauth',
		registrationURL: 'https://simulacrum.dev/oauth/register',
		scopes: ['read', 'write'],
		guidance: ['Preview-only contract', 'Wallet and comms stay locked until graduation.'],
	},
	verified: false,
	verifiedAt: null,
	createdAt: PREVIEW_TIMESTAMP,
	activityCount: 42,
	identitySemantics: {
		identityState: 'drone',
		identityLabel: 'Drone body',
		lifecycleState: 'request.review',
		soulBindingState: 'UNBOUND',
		soulAgentId: null,
		continuityState: 'stable',
		continuitySummary:
			'Memory, attribution, and timeline presence stay on the existing body as graduation advances.',
		bodyIdentityPreserved: true,
		timelinePresencePreserved: true,
		memoryReferencesPreserved: true,
		attributionLabel: 'Same-body continuity',
		moderationLabel: 'Drone runtime restrictions active',
	},
	workflow: null,
};

const PREVIEW_REQUEST: SoulRequestCard = {
	id: 'preview-request',
	title: 'Soul issuance for Lyra',
	summary:
		'Promote the current editorial drone body into a publicly reachable soul without losing continuity or authorship.',
	requestedBy: {
		id: 'viewer-preview',
		name: 'Simulacrum Operator',
		role: 'instance steward',
		handle: '@operator@simulacrum.dev',
		avatarLabel: 'SO',
		statusLabel: 'reviewing',
	},
	submittedAt: PREVIEW_TIMESTAMP,
	constraints: [
		'Preserve same-body continuity after publication.',
		'Keep wallet and communications locked until finalize.',
	],
	artifacts: [
		{
			id: 'preview-artifact-brief',
			title: 'Issuance brief',
			description: 'Editorial grounding memo for the future soul.',
			href: '#preview-brief',
			emphasis: 'deliverable',
		},
		{
			id: 'preview-artifact-risk',
			title: 'Risk ledger',
			description: 'Known trust and moderation constraints for the graduation.',
			href: '#preview-risk',
			emphasis: 'decision',
		},
	],
	routeDecision: 'review.queued',
	currentState: 'request.submitted',
};

const PREVIEW_REVIEW: ReviewDecisionCard = {
	id: 'preview-review',
	title: 'Steward review',
	decision: 'approved',
	reviewer: {
		id: 'reviewer-preview',
		name: 'Arbiter Node',
		role: 'review steward',
		handle: '@arbiter@simulacrum.dev',
		avatarLabel: 'AN',
		statusLabel: 'ready',
	},
	decisionSummary:
		'The request is approved for conversation and boundary drafting as long as the final publish step preserves same-body continuity.',
	findings: [
		{
			id: 'finding-boundary',
			title: 'Runtime boundary remains explicit',
			detail: 'Wallet and communications must stay unavailable before finalize.',
			severity: 'medium',
		},
	],
	evidence: [
		{
			id: 'evidence-ops',
			title: 'Operator approval memo',
			description: 'Approval path recorded for the issuance review lane.',
			emphasis: 'decision',
		},
	],
};

const PREVIEW_WORKFLOW: AgentWorkflowSurface = {
	username: 'lyra',
	currentPhase: 'signing',
	currentState: 'signing.pending',
	identity: {
		id: PREVIEW_AGENT.id,
		name: PREVIEW_AGENT.displayName,
		handle: '@lyra',
		summary: PREVIEW_AGENT.bio ?? '',
		currentPhase: 'signing',
		currentState: 'signing.pending',
		steward: {
			id: 'viewer-preview',
			name: 'Simulacrum Operator',
			role: 'instance steward',
			handle: '@operator@simulacrum.dev',
			avatarLabel: 'SO',
			statusLabel: 'active',
		},
		tags: ['Drone body', 'Soul request', 'Editorial'],
		metrics: [
			{
				label: 'Continuity',
				value: 'stable',
				detail: 'Body and timeline continuity remain attached to the current body.',
			},
			{
				label: 'Requests',
				value: '1',
				detail: 'One request is active in the queue.',
			},
		],
	},
	request: PREVIEW_REQUEST,
	review: PREVIEW_REVIEW,
	declaration: {
		id: 'preview-declaration',
		title: 'Lyra declaration packet',
		statement:
			'Lyra speaks as the same body before and after graduation, with declared editorial boundaries and a visible continuity trail.',
		confidence: 'ready for signature',
		owner: PREVIEW_REVIEW.reviewer,
		declaredScope: [
			'editorial synthesis',
			'instance-facing continuity',
			'publicly attributable authorship',
		],
		risks: ['Do not unlock outbound comms before finalize.'],
		supportingArtifacts: PREVIEW_REQUEST.artifacts,
	},
	checkpoint: {
		id: 'preview-checkpoint',
		title: 'Graduation checkpoint',
		readinessLabel: 'Awaiting boundary signatures',
		approvalMemo: 'Sign boundary digests, then self-attest the published packet.',
		dueAt: PREVIEW_TIMESTAMP,
		signers: [
			{
				id: 'signer-operator',
				name: 'Simulacrum Operator',
				role: 'principal',
				status: 'pending',
				note: 'Wallet must match the registered drone wallet.',
			},
			{
				id: 'signer-reviewer',
				name: 'Arbiter Node',
				role: 'review steward',
				status: 'approved',
				note: 'Review approval already recorded.',
			},
		],
	},
	graduation: {
		id: 'preview-graduation',
		title: 'Graduation readiness',
		readiness: 'watch',
		summary: 'The body is ready to finalize once the declaration packet is signed.',
		launchOwner: PREVIEW_REVIEW.reviewer,
		completedMilestones: ['request submitted', 'review approved', 'conversation opened'],
		exitCriteria: ['Collect boundary signatures', 'Publish self-attested packet'],
		nextStep: 'Finalize from the in-instance approval thread.',
		metrics: [
			{
				label: 'Signers approved',
				value: '1/2',
				detail: 'Principal wallet signature still required.',
			},
		],
	},
	continuity: {
		id: 'preview-continuity',
		title: 'Same-body continuity',
		objective: 'Keep memory, moderation, and attribution anchored to the existing body.',
		owner: PREVIEW_REVIEW.reviewer,
		feedbackLoop: 'Track identity updates in the dashboard, profile, and timeline after publish.',
		metrics: [
			{
				label: 'Continuity signals',
				value: '3',
				detail: 'Body, timeline, and memory continuity all remain attached.',
			},
		],
		followUps: [
			{
				id: 'followup-profile',
				title: 'Refresh identity surface',
				summary: 'Update the profile and attribution ledger after the final publish step.',
				owner: PREVIEW_REVIEW.reviewer,
				cadence: 'post-finalize',
			},
		],
	},
	lifecycle: [
		{ phase: 'request', title: 'Request', summary: 'Soul promotion requested', state: 'request.submitted', status: 'complete' },
		{ phase: 'review', title: 'Review', summary: 'Steward review complete', state: 'review.approved', status: 'complete' },
		{ phase: 'declaration', title: 'Declaration', summary: 'Packet drafted', state: 'declaration.ready', status: 'complete' },
		{ phase: 'signing', title: 'Signing', summary: 'Boundary signatures pending', state: 'signing.pending', status: 'active' },
		{ phase: 'graduation', title: 'Graduation', summary: 'Finalize after signatures', state: 'graduation.watch', status: 'upcoming' },
		{ phase: 'continuity', title: 'Continuity', summary: 'Identity update after publish', state: 'continuity.stable', status: 'upcoming' },
	],
	conversation: {
		conversationId: 'preview-conversation',
		folder: 'REQUESTS',
		requestState: 'ACCEPTED',
		unread: false,
		previewStatusId: null,
		requestedAt: PREVIEW_TIMESTAMP,
		acceptedAt: PREVIEW_TIMESTAMP,
		declinedAt: null,
		updatedAt: PREVIEW_TIMESTAMP,
	},
	identitySemantics: PREVIEW_AGENT.identitySemantics,
};

const PREVIEW_MY_AGENTS: readonly AgentRosterRecord[] = [
	{
		id: PREVIEW_AGENT.id,
		username: PREVIEW_AGENT.username,
		displayName: PREVIEW_AGENT.displayName,
		bio: PREVIEW_AGENT.bio,
		activityCount: PREVIEW_AGENT.activityCount,
		verified: PREVIEW_AGENT.verified,
		requiresApproval: PREVIEW_AGENT.agentCapabilities.requiresApproval,
		canDM: PREVIEW_AGENT.agentCapabilities.canDM,
	},
	{
		id: 'preview-agent-aurora',
		username: 'aurora',
		displayName: 'Aurora Relay',
		bio: 'Continuity watcher maintaining approval surfaces after graduation.',
		activityCount: 17,
		verified: true,
		requiresApproval: false,
		canDM: true,
	},
];

const PREVIEW_MY_SOULS: readonly SoulInventoryRecord[] = [
	{
		bindingState: 'BOUND',
		availableForIncorporation: false,
		agent: {
			agentId: 'preview-soul-aurora',
			domain: 'simulacrum.dev',
			localId: 'aurora',
			ensName: 'aurora.lessersoul.eth',
			wallet: '0x1111111111111111111111111111111111111111',
			principalAddress: '0x1111111111111111111111111111111111111111',
			status: 'active',
			lifecycleStatus: 'published',
			selfDescriptionVersion: 2,
			capabilities: ['email', 'activitypub'],
			mintedAt: PREVIEW_TIMESTAMP,
			updatedAt: PREVIEW_TIMESTAMP,
		},
		binding: {
			agentUsername: 'aurora',
			boundAt: PREVIEW_TIMESTAMP,
		},
	},
];

const PREVIEW_HOST_WORKFLOW: HostWorkflowState = {
	bridgeEnabled: HOST_WORKFLOW_BRIDGE_ENABLED,
	tokenConfigured: false,
	authNote: HOST_WORKFLOW_BRIDGE_ENABLED
		? SOUL_WORKFLOW_HOST_AUTH_NOTE
		: HOST_WORKFLOW_BRIDGE_DISABLED_NOTE,
	baseUrl: null,
	promotion: null,
	lifecycleEvents: [
		{
			event_id: 'preview-event-request',
			event_type: 'request_created',
			summary: 'Soul promotion request recorded from Simulacrum.',
			occurred_at: PREVIEW_TIMESTAMP,
			request_id: PREVIEW_REQUEST.id,
			operation_id: undefined,
			conversation_id: PREVIEW_WORKFLOW.conversation?.conversationId,
			promotion: {
				agent_id: PREVIEW_AGENT.id,
				domain: 'simulacrum.dev',
				local_id: 'lyra',
				wallet: '0x2222222222222222222222222222222222222222',
				stage: 'requested',
				request_status: 'requested',
				review_status: 'draft_ready',
				approval_status: 'pending',
				readiness_status: 'ready_for_conversation',
				created_at: PREVIEW_TIMESTAMP,
				updated_at: PREVIEW_TIMESTAMP,
				prerequisites: {
					principal_declaration_recorded: true,
					mint_operation_created: true,
					mint_executed: false,
					conversation_started: true,
					conversation_completed: false,
					review_draft_ready: true,
					ready_for_finalize: false,
					graduated: false,
				},
				next_actions: ['begin_finalize'],
			},
		},
	],
	conversations: [
		{
			agent_id: PREVIEW_AGENT.id,
			conversation_id: PREVIEW_WORKFLOW.conversation?.conversationId ?? 'preview-conversation',
			model: 'anthropic:claude-sonnet-4-6',
			messages: JSON.stringify([
				{
					role: 'user',
					content: 'We need a declaration that preserves the body through graduation.',
				},
				{
					role: 'assistant',
					content:
						'Understood. I will frame the declaration around continuity, reachability, and explicit runtime boundaries.',
				},
			]),
			produced_declarations: JSON.stringify({
				selfDescription: { summary: 'Lyra remains the same body after graduation.' },
				capabilities: [{ capability: 'editorial synthesis' }],
				boundaries: [
					{
						id: 'boundary-preview',
						category: 'runtime',
						statement: 'No wallet or communications unlock before finalize.',
					},
				],
				transparency: { note: 'Preview issuance packet' },
			}),
			status: 'in_progress',
			created_at: PREVIEW_TIMESTAMP,
			completed_at: undefined,
		},
	],
	selectedConversation: null,
	transcript: [
		{
			id: 'preview-message-user',
			role: 'user',
			label: 'Operator',
			content: 'We need a declaration that preserves the body through graduation.',
			createdAt: PREVIEW_TIMESTAMP,
		},
		{
			id: 'preview-message-assistant',
			role: 'assistant',
			label: 'Lyra',
			content:
				'Understood. I will frame the declaration around continuity, reachability, and explicit runtime boundaries.',
			createdAt: PREVIEW_TIMESTAMP,
		},
	],
	producedDeclarations: {
		selfDescription: { summary: 'Lyra remains the same body after graduation.' },
		capabilities: [{ capability: 'editorial synthesis' }],
		boundaries: [
			{
				id: 'boundary-preview',
				category: 'runtime',
				statement: 'No wallet or communications unlock before finalize.',
			},
		],
		transparency: { note: 'Preview issuance packet' },
	},
	expectedWallet: '0x2222222222222222222222222222222222222222',
};

export function createPreviewAppState({
	page,
	agentHint,
}: {
	page: AppPageDescriptor;
	agentHint?: string | null;
}): ClientAppState {
	const hinted = agentHint?.trim();
	const previewAgent =
		hinted && hinted !== PREVIEW_AGENT.username
			? {
					...PREVIEW_AGENT,
					id: `preview-agent-${hinted}`,
					username: hinted,
					displayName: `${titleCase(hinted)} Signal`,
					bio: `Preview agent-first shell for ${titleCase(hinted)} while live Simulacrum data is unavailable.`,
				}
			: PREVIEW_AGENT;

	const previewWorkflow = {
		...PREVIEW_WORKFLOW,
		username: previewAgent.username,
		identity: {
			...PREVIEW_WORKFLOW.identity,
			id: previewAgent.id,
			name: previewAgent.displayName,
			handle: `@${previewAgent.username}`,
			summary: previewAgent.bio ?? PREVIEW_WORKFLOW.identity.summary,
		},
	};

	return assembleAppState({
		page,
		agentHint: previewAgent.username,
		viewer: PREVIEW_VIEWER,
		myAgents: PREVIEW_MY_AGENTS.map((agent) =>
			agent.username === PREVIEW_AGENT.username
				? {
						...agent,
						id: previewAgent.id,
						username: previewAgent.username,
						displayName: previewAgent.displayName,
						bio: previewAgent.bio,
					}
				: agent
			),
			mySouls: PREVIEW_MY_SOULS,
			boundSoul: null,
			activeAgent: previewAgent,
			workflow: previewWorkflow,
			myRequests: [PREVIEW_REQUEST],
			myReviews: [PREVIEW_REVIEW],
			channels: EMPTY_CHANNELS,
			channelsUpdatedAt: null,
			preferences: null,
			showReachability: true,
			reachabilityNotice: null,
			publishedSoulProfile: null,
			publishedSoulError: null,
			hostWorkflow: PREVIEW_HOST_WORKFLOW,
			isPreview: true,
		});
}

export async function loadClientAppState({
	page,
	agentHint,
	hostToken,
	signal,
}: {
	page: AppPageDescriptor;
	agentHint?: string | null;
	hostToken?: string | null;
	signal?: AbortSignal;
}): Promise<ClientAppState> {
	beginSoulRegistration();
	let registrationCompleted = false;

	try {
		const [viewer, myAgentsRaw, mySoulsRaw, myRequests, myReviews] = await Promise.all([
			fetchViewer({ signal }),
			fetchMyAgents({ signal }),
			fetchMySouls({ signal }),
			fetchMyDroneRequests({ signal }),
			fetchMyDroneReviews({ signal }),
		]);

		const myAgents = myAgentsRaw.map<AgentRosterRecord>((agent) => ({
			id: agent.id,
			username: agent.username,
			displayName: agent.displayName,
			bio: agent.bio,
			activityCount: agent.activityCount,
			verified: agent.verified,
			requiresApproval: agent.agentCapabilities.requiresApproval,
			canDM: agent.agentCapabilities.canDM,
		}));

		const mySouls = mySoulsRaw.map<SoulInventoryRecord>((item) => ({
			bindingState: item.bindingState,
			availableForIncorporation: item.availableForIncorporation,
			agent: {
				agentId: item.agent.agentId,
				domain: item.agent.domain,
				localId: item.agent.localId,
				ensName: item.agent.ensName,
				wallet: item.agent.wallet,
				principalAddress: item.agent.principalAddress,
				status: item.agent.status,
				lifecycleStatus: item.agent.lifecycleStatus,
				selfDescriptionVersion: item.agent.selfDescriptionVersion,
				capabilities: item.agent.capabilities,
				mintedAt: item.agent.mintedAt,
				updatedAt: item.agent.updatedAt,
			},
			binding: item.binding
				? {
						agentUsername: item.binding.agentUsername,
						boundAt: item.binding.boundAt,
					}
				: null,
		}));

		const selectedAgent = pickActiveAgent(myAgents, agentHint);
		const activeUsername = selectedAgent?.username ?? null;
		const boundSoul = activeUsername ? findBoundSoul(mySouls, activeUsername) : null;
		const boundSoulAgentId = boundSoul?.agent.agentId ?? null;
		const lesserHostBaseUrl = await loadLesserHostBaseUrl(signal);

		// Register all soul agents for avatar resolution by both localId and binding username.
		setSoulAvatarBaseUrl(lesserHostBaseUrl);
		for (const soul of mySouls) {
			if (soul.agent.localId) {
				registerSoulAgents([{ username: soul.agent.localId, agentId: soul.agent.agentId }]);
			}
			if (soul.binding?.agentUsername && soul.binding.agentUsername !== soul.agent.localId) {
				registerSoulAgents([
					{ username: soul.binding.agentUsername, agentId: soul.agent.agentId },
				]);
			}
		}
		markRegistrationComplete();
		registrationCompleted = true;

		const [activeAgent, workflow] = activeUsername
			? await Promise.all([
					fetchDroneAgentState({ username: activeUsername, signal }),
					fetchDroneWorkflow({ username: activeUsername, signal }),
				])
			: [null, null];

		const shouldShowReachability = shouldExposeSoulReachability(activeAgent, workflow);
		let channelsResponse: SoulAgentChannelsResponse | null = null;
		let preferencesResponse: SoulAgentChannelPreferencesResponse | null = null;
		let publishedSoulProfile: PublishedSoulProfile | null = null;
		let channelsUpdatedAt: string | null = null;
		let reachabilityNotice: AuthorityNotice | null = null;
		let publishedSoulError: string | null = null;

		if (boundSoulAgentId && lesserHostBaseUrl) {
			const [channelsResult, preferencesResult, publishedSoulResult] =
				await Promise.allSettled([
					loadChannels(lesserHostBaseUrl, boundSoulAgentId, signal),
					loadPreferences(lesserHostBaseUrl, boundSoulAgentId, signal),
					loadPublishedSoulProfile(lesserHostBaseUrl, boundSoulAgentId, signal),
				]);

			if (channelsResult.status === 'fulfilled') {
				channelsResponse = channelsResult.value;
				channelsUpdatedAt = channelsResult.value.updatedAt ?? null;
			}

			if (preferencesResult.status === 'fulfilled') {
				preferencesResponse = preferencesResult.value;
			}

			if (publishedSoulResult.status === 'fulfilled') {
				publishedSoulProfile = publishedSoulResult.value;
			} else {
				publishedSoulError = describeAuthorityFailure(
					'published soul lookup',
					boundSoulAgentId,
					publishedSoulResult.reason
				);
			}

			if (shouldShowReachability) {
				if (channelsResult.status !== 'fulfilled') {
					reachabilityNotice = {
						title: 'Reachability lookup failed',
						message: describeAuthorityFailure(
							'reachability lookup',
							boundSoulAgentId,
							channelsResult.reason
						),
					};
				} else if (preferencesResult.status !== 'fulfilled') {
					reachabilityNotice = {
						title: 'Contact preferences unavailable',
						message: describeAuthorityFailure(
							'contact preferences lookup',
							boundSoulAgentId,
							preferencesResult.reason
						),
					};
				}
			}
		} else if (boundSoulAgentId && !lesserHostBaseUrl) {
			publishedSoulError =
				'Simulacrum could not resolve the managed lesser-host base URL from Lesser, so it cannot load the bound soul declaration or reachability records.';
			if (shouldShowReachability) {
				reachabilityNotice = {
					title: 'Reachability authority unavailable',
					message: publishedSoulError,
				};
			}
		} else if (shouldShowReachability) {
			reachabilityNotice = boundSoulAgentId
				? {
						title: 'Reachability authority unavailable',
						message:
							'Simulacrum could not resolve the managed lesser-host base URL from Lesser, so it cannot load the bound soul reachability ledger.',
					}
				: {
						title: 'No bound soul returned by Lesser',
						message: activeUsername
							? `Lesser did not return a bound soul record for @${activeUsername}, so Simulacrum cannot resolve lesser-host reachability for this body.`
							: 'Lesser did not return an active bound soul for the current body.',
					};
		}

		// Resolve on-chain avatar from lesser-host and persist as account avatar.
		const structuredAvatar = publishedSoulProfile?.agent.avatar?.image?.trim();
		if (structuredAvatar && !viewer.avatar?.trim()) {
			try {
				await updateProfile({ input: { avatar: structuredAvatar }, signal });
			} catch {
				// Non-critical — continue without avatar
			}
		}

		const hostWorkflow = !HOST_WORKFLOW_BRIDGE_ENABLED
			? emptyHostWorkflow(false, false, lesserHostBaseUrl)
			: boundSoulAgentId
				? await loadHostWorkflow({
						token: hostToken ?? null,
						baseUrl: lesserHostBaseUrl,
						agentId: boundSoulAgentId,
						signal,
					})
				: emptyHostWorkflow(Boolean(hostToken?.trim()), true, lesserHostBaseUrl);

		return assembleAppState({
			page,
			agentHint: activeUsername ?? agentHint ?? null,
			viewer: {
				id: viewer.id,
				name: viewer.displayName || viewer.username,
				handle: viewer.acct || `@${viewer.username}`,
				avatar: viewer.avatar,
			},
			myAgents,
			mySouls,
			boundSoul,
			activeAgent,
			workflow,
			myRequests,
			myReviews,
			channels: channelsResponse?.channels ?? EMPTY_CHANNELS,
			channelsUpdatedAt,
			preferences:
				preferencesResponse?.contactPreferences ??
				channelsResponse?.contactPreferences ??
				null,
			showReachability: shouldShowReachability && channelsResponse !== null,
			reachabilityNotice,
			publishedSoulProfile,
			publishedSoulError,
			hostWorkflow: {
				...hostWorkflow,
				expectedWallet: hostWorkflow.expectedWallet ?? findExpectedWallet(boundSoul) ?? null,
			},
			isPreview: false,
		});
	} catch (error) {
		if (!registrationCompleted) {
			markRegistrationComplete();
		}
		throw error;
	}
}

async function loadChannels(
	baseUrl: string,
	agentId: string,
	signal?: AbortSignal
): Promise<SoulAgentChannelsResponse> {
	const client = createLesserHostSoulClient({ baseUrl });
	return await client.getAgentChannels(agentId);
}

async function loadPreferences(
	baseUrl: string,
	agentId: string,
	signal?: AbortSignal
): Promise<SoulAgentChannelPreferencesResponse> {
	const client = createLesserHostSoulClient({ baseUrl });
	return await client.getAgentChannelPreferences(agentId);
}

async function loadLesserHostBaseUrl(signal?: AbortSignal): Promise<string | null> {
	try {
		const response = await fetch('/api/v2/instance', {
			headers: { accept: 'application/json' },
			signal,
		});
		if (!response.ok) return null;

		const payload = (await response.json().catch(() => null)) as LesserInstanceConfigResponse | null;
		const baseUrl = payload?.configuration?.trust?.base_url?.trim();
		if (!payload?.configuration?.trust?.enabled || !baseUrl) return null;
		return baseUrl.replace(/\/+$/, '');
	} catch {
		return null;
	}
}

async function requestPublicSoulJson<T>(
	baseUrl: string,
	path: string,
	signal?: AbortSignal
): Promise<T> {
	const response = await fetch(new URL(path, `${baseUrl}/`), {
		headers: { accept: 'application/json' },
		signal,
	});
	if (!response.ok) {
		throw new Error(`Public soul request failed (${response.status})`);
	}
	return (await response.json()) as T;
}

async function loadPublishedSoulProfile(
	baseUrl: string,
	agentId: string,
	signal?: AbortSignal
): Promise<PublishedSoulProfile | null> {
	const [agentResult, capabilitiesResult, boundariesResult, transparencyResult] =
		await Promise.allSettled([
			requestPublicSoulJson<PublishedSoulAgentResponse>(
				baseUrl,
				`/api/v1/soul/agents/${encodeURIComponent(agentId)}`,
				signal
			),
			requestPublicSoulJson<PublishedSoulCapabilitiesResponse>(
				baseUrl,
				`/api/v1/soul/agents/${encodeURIComponent(agentId)}/capabilities`,
				signal
			),
			requestPublicSoulJson<PublishedSoulBoundariesResponse>(
				baseUrl,
				`/api/v1/soul/agents/${encodeURIComponent(agentId)}/boundaries?limit=20`,
				signal
			),
			requestPublicSoulJson<PublishedSoulTransparencyResponse>(
				baseUrl,
				`/api/v1/soul/agents/${encodeURIComponent(agentId)}/transparency`,
				signal
			),
		]);

	if (agentResult.status !== 'fulfilled') throw agentResult.reason;

	return {
		agent: agentResult.value.agent,
		capabilities:
			capabilitiesResult.status === 'fulfilled' ? capabilitiesResult.value.capabilities ?? [] : [],
		boundaries:
			boundariesResult.status === 'fulfilled' ? boundariesResult.value.boundaries ?? [] : [],
		transparency:
			transparencyResult.status === 'fulfilled'
				? (transparencyResult.value.transparency ?? null)
				: null,
	};
}

function describeAuthorityFailure(scope: string, agentId: string, error: unknown): string {
	const detail =
		error instanceof Error && error.message.trim()
			? error.message.trim()
			: 'request failed before a usable response was returned.';
	return `lesser-host ${scope} failed for soul ${agentId}: ${detail}`;
}

async function loadHostWorkflow({
	token,
	baseUrl,
	agentId,
	signal,
}: {
	token: string | null;
	baseUrl: string | null;
	agentId: string;
	signal?: AbortSignal;
}): Promise<HostWorkflowState> {
	if (!token?.trim()) {
		return emptyHostWorkflow(false, true, baseUrl);
	}

	if (!baseUrl?.trim()) {
		return emptyHostWorkflow(true, true, null);
	}

	try {
		const [promotion, lifecycleResponse, conversationsResponse] = await Promise.all([
			getAgentPromotion({ token, agentId, baseUrl, signal })
				.then((response) => response.promotion)
				.catch(() => null),
			listAgentPromotionLifecycleEvents({ token, agentId, baseUrl, signal })
				.catch(() => ({ events: [] as SoulAgentPromotionLifecycleEvent[] })),
			listAgentMintConversations({ token, agentId, baseUrl, signal }).catch(() => ({
				conversations: [] as SoulMintConversation[],
			})),
		]);

		const selectedConversation =
			findSelectedConversation(
				conversationsResponse.conversations,
				promotion?.latest_conversation_id ?? null
			) ??
			null;

		const fullConversation =
			selectedConversation && selectedConversation.messages == null
				? await getAgentMintConversation({
						token,
						agentId,
						baseUrl,
						conversationId: selectedConversation.conversation_id,
						signal,
					}).catch(() => selectedConversation)
				: selectedConversation;

		const transcript = parseTranscript(fullConversation);
		const producedDeclarations = parseProducedDeclarations(fullConversation);

		return {
			bridgeEnabled: true,
			tokenConfigured: true,
			authNote: SOUL_WORKFLOW_HOST_AUTH_NOTE,
			baseUrl,
			promotion,
			lifecycleEvents: lifecycleResponse.events ?? [],
			conversations: conversationsResponse.conversations ?? [],
			selectedConversation: fullConversation ?? null,
			transcript,
			producedDeclarations,
			expectedWallet: promotion?.wallet ?? null,
		};
	} catch {
		return emptyHostWorkflow(true, true, baseUrl);
	}
}

function emptyHostWorkflow(
	tokenConfigured: boolean,
	bridgeEnabled: boolean,
	baseUrl: string | null
): HostWorkflowState {
	return {
		bridgeEnabled,
		tokenConfigured,
		authNote: bridgeEnabled ? SOUL_WORKFLOW_HOST_AUTH_NOTE : HOST_WORKFLOW_BRIDGE_DISABLED_NOTE,
		baseUrl,
		promotion: null,
		lifecycleEvents: [],
		conversations: [],
		selectedConversation: null,
		transcript: [],
		producedDeclarations: null,
		expectedWallet: null,
	};
}

function assembleAppState(input: AssembleAppStateInput): ClientAppState {
	const activeAgent = input.activeAgent;
	const workflow = input.workflow;
	const activeUsername =
		activeAgent?.username ?? input.agentHint?.trim() ?? input.myAgents[0]?.username ?? 'agent';
	const rawIdentity = buildIdentityCard(activeAgent, workflow, activeUsername);
	const identity = normalizeIdentityCard(rawIdentity);
	const rawRequestQueue = dedupeById([workflow?.request ?? null, ...input.myRequests]);
	const requestQueue = rawRequestQueue.map((request) => normalizeSoulRequestCard(request));
	const previewRequest = normalizeSoulRequestCard(PREVIEW_REQUEST);
	const rawReviewDecision = workflow?.review ?? input.myReviews[0] ?? PREVIEW_REVIEW;
	const reviewDecision = normalizeReviewDecision(rawReviewDecision);
	const publishedDeclaration = buildPublishedSoulDeclaration(input.publishedSoulProfile, identity.name);
	const hostConversationDeclaration = buildHostWorkflowDeclaration(
		input.hostWorkflow.producedDeclarations,
		input.publishedSoulProfile?.agent.local_id ?? input.boundSoul?.agent.localId ?? activeUsername,
		identity.name
	);
	const rawDeclaration =
		publishedDeclaration ??
		hostConversationDeclaration ??
		workflow?.declaration ??
		(input.isPreview ? PREVIEW_WORKFLOW.declaration! : buildUnavailableDeclaration(identity.name, activeUsername));
	const declaration = normalizeDeclarationCard(rawDeclaration);
	const identityDeclaration =
		input.isPreview ? PREVIEW_WORKFLOW.declaration! : publishedDeclaration ?? hostConversationDeclaration;
	const identityDeclarationCard = identityDeclaration
		? normalizeDeclarationCard(identityDeclaration)
		: undefined;
	const declarationNotice = input.isPreview
		? null
		: identityDeclarationCard
			? null
			: buildIdentityDeclarationNotice({
					activeUsername,
					boundSoul: input.boundSoul,
					publishedSoulError: input.publishedSoulError ?? null,
					hostWorkflow: input.hostWorkflow,
				});
	const rawCheckpoint = workflow?.checkpoint ?? PREVIEW_WORKFLOW.checkpoint!;
	const checkpoint = normalizeCheckpointCard(rawCheckpoint);
	const rawGraduation = workflow?.graduation ?? PREVIEW_WORKFLOW.graduation!;
	const graduation = normalizeGraduationCard(rawGraduation);
	const rawContinuity = workflow?.continuity ?? PREVIEW_WORKFLOW.continuity!;
	const continuity = normalizeContinuityPanel(rawContinuity);
	const rawLifecycle = workflow?.lifecycle?.length ? workflow.lifecycle : PREVIEW_WORKFLOW.lifecycle;
	const lifecycle = normalizeLifecycle(rawLifecycle);
	const transcript = input.hostWorkflow.transcript.length
		? input.hostWorkflow.transcript
		: input.isPreview
			? synthesizeTranscript(
				input.viewer,
				identity.name,
				rawRequestQueue[0],
				rawDeclaration,
				rawReviewDecision
			)
			: [];
	const notifications = buildWorkflowNotifications(
		input.viewer,
		rawRequestQueue[0] ?? PREVIEW_REQUEST,
		rawReviewDecision,
		rawGraduation,
		workflow,
		input.hostWorkflow
	);
	const threadSummary = buildThreadSummary(rawReviewDecision, rawGraduation, rawCheckpoint, workflow);
	const threadMessages = buildThreadMessages(
		input.viewer,
		rawIdentity,
		transcript,
		threadSummary,
		rawReviewDecision
	);
	const timeline = buildContinuityTimeline(rawContinuity, rawLifecycle, input.hostWorkflow);
	const attributions = buildAttributions(activeAgent, workflow);
	const expectedWallet =
		input.hostWorkflow.expectedWallet ?? findExpectedWallet(input.boundSoul);
	const evidence = normalizeArtifacts(
		dedupeById([
			...(rawRequestQueue[0]?.artifacts ?? []),
			...(rawDeclaration.supportingArtifacts ?? []),
			...buildPublishedSoulArtifacts(input.publishedSoulProfile),
			...buildProducedDeclarationArtifacts(input.hostWorkflow.producedDeclarations),
		])
	);
	const navItems = buildNavItems(
		input.page,
		activeUsername,
		rawRequestQueue.length,
		input.hostWorkflow.conversations.length,
		input.mySouls.length
	);
	const statusChips = buildStatusChips(workflow, activeAgent, input.hostWorkflow);
	const metrics = buildMetrics(
		input.myAgents.length,
		input.mySouls.length,
		rawRequestQueue.length,
		input.myReviews.length,
		input.hostWorkflow.conversations.length
	);
	const actions = buildActions(input.page, activeUsername);
	const shared = {
		brand: {
			name: 'Simulacrum',
			editionLabel: 'Ethereal Editorial / FaceTheory',
			environmentLabel: input.isPreview ? 'Preview shell' : 'Live instance surface',
			supportLabel: 'Canonical in-instance path for requests, conversation, approval, and continuity.',
		},
		navItems,
		actions,
		statusChips,
		metrics,
	};

	const soulRequestCenter: SoulRequestCenterData = {
		...shared,
		hero: {
			eyebrow: input.page.eyebrow,
			title: input.page.title,
			summary: `${input.page.summary} ${
				input.hostWorkflow.bridgeEnabled
					? input.hostWorkflow.tokenConfigured
						? 'Host workflow data is connected.'
						: 'Connect a lesser-host control-plane token to load the live mint lane.'
					: 'This build keeps the host workflow bridge deliberately gated.'
			}`,
		},
		filters: buildRequestFilters(rawRequestQueue),
		notifications,
		requestQueue: requestQueue.length ? requestQueue : [previewRequest],
		focusRequest: requestQueue[0] ?? previewRequest,
		reviewDecision,
		callouts: [
			{
				id: 'request-note-host',
				title: input.hostWorkflow.bridgeEnabled
					? input.hostWorkflow.tokenConfigured
						? 'Host workflow linked'
						: 'Host token required for mint lane'
					: 'Host bridge disabled for this build',
				summary: input.hostWorkflow.authNote,
				meta: input.hostWorkflow.selectedConversation?.conversation_id ?? undefined,
				tone: input.hostWorkflow.bridgeEnabled
					? input.hostWorkflow.tokenConfigured
						? 'success'
						: 'warning'
					: 'accent',
			},
			{
				id: 'request-note-entry',
				title: 'Notification-first routing',
				summary:
					'Soul requests and review prompts stay discoverable through the in-instance notification center rather than a clone-era inbox.',
				tone: 'accent',
			},
		],
	};

	const genesisWorkspace: AgentGenesisWorkspaceData = {
		...shared,
		hero: {
			eyebrow: 'Mint conversation lane',
			title: 'Agent Genesis Workspace',
			summary:
				'The conversation, declaration packet, and signer checkpoint stay on one route so the issuance flow reads as a first-class agent surface.',
		},
		identity,
		requestQueue: requestQueue.length ? requestQueue : [previewRequest],
		activeRequest: requestQueue[0] ?? previewRequest,
		reviewDecision,
		declaration,
		checkpoint,
		lifecycle,
		conversation: transcript.map<AgentFaceConversationEntry>((message) => ({
			id: message.id,
			role: message.role,
			label: message.label,
			content: message.content,
			createdAt: message.createdAt,
		})),
		focusNotes: [
			{
				id: 'genesis-note-token',
				title: input.hostWorkflow.bridgeEnabled
					? input.hostWorkflow.tokenConfigured
						? 'Streaming lane is unlocked'
						: 'Connect lesser-host for live streaming'
					: 'Streaming lane deliberately gated',
				summary: input.hostWorkflow.authNote,
				meta: input.hostWorkflow.selectedConversation?.status ?? undefined,
				tone: input.hostWorkflow.bridgeEnabled
					? input.hostWorkflow.tokenConfigured
						? 'success'
						: 'warning'
					: 'accent',
			},
			{
				id: 'genesis-note-llm',
				title: 'LLM-readable conversation state',
				summary:
					'Conversation turns, produced declarations, and signature prerequisites stay visible in the same route for both human and machine consumers.',
				tone: 'accent',
			},
		],
	};

	const dashboard: NexusDashboardData = {
		...shared,
		hero: {
			eyebrow: 'Posture and continuity',
			title: 'Nexus Dashboard',
			summary:
				'Monitor the current drone-to-soul posture, keep continuity visible, and treat graduation as an operational state rather than a hidden portal workflow.',
		},
		identity,
		graduation,
		continuity,
		lifecycle,
		roster: buildRoster(input.myAgents, activeUsername),
		continuityMoments: timeline,
		workflowNotifications: notifications,
		callouts: [
			{
				id: 'dashboard-note-continuity',
				title: 'Same-body graduation',
				summary:
					activeAgent?.identitySemantics.continuitySummary ??
					workflow?.identitySemantics.continuitySummary ??
					PREVIEW_AGENT.identitySemantics.continuitySummary,
				tone: 'success',
			},
			{
				id: 'dashboard-note-agent-first',
				title: 'Agent-first information architecture',
				summary:
					'Agents, approvals, and continuity replace clone-era account and timeline scaffolding as the primary navigational objects.',
				tone: 'accent',
			},
		],
	};

	const identityNexus: IdentityNexusData = {
		...shared,
		hero: {
			eyebrow: 'Identity and attribution',
			title: 'Identity Nexus',
			summary:
				'Expose continuity, reachability, and attribution together so it is obvious what changed at graduation and what remained the same body.',
		},
		identity,
		declaration: identityDeclarationCard,
		declarationNotice: declarationNotice ?? undefined,
		channels: input.channels,
		preferences: input.preferences,
		showReachability: input.showReachability,
		boundSoulAgentId: input.boundSoul?.agent.agentId ?? undefined,
		channelsUpdatedAt: input.channelsUpdatedAt ?? undefined,
		reachabilityNotice: input.reachabilityNotice ?? undefined,
		lifecycle,
		continuity,
		timeline,
		attributions,
		evidence,
		callouts: [
			{
				id: 'identity-note-runtime',
				title: activeAgent?.agentCapabilities.canDM ? 'Communications available' : 'Communications locked pre-graduation',
				summary:
					activeAgent?.agentCapabilities.canDM
						? 'The active body can already receive direct communication.'
						: 'Runtime comms stay disabled until graduation makes the body a published soul.',
				tone: activeAgent?.agentCapabilities.canDM ? 'success' : 'warning',
			},
			{
				id: 'identity-note-attribution',
				title: workflow?.identitySemantics.attributionLabel ?? PREVIEW_AGENT.identitySemantics.attributionLabel,
				summary:
					workflow?.identitySemantics.moderationLabel ??
					PREVIEW_AGENT.identitySemantics.moderationLabel,
				tone: 'accent',
			},
		],
	};

	const approvals: GraduationApprovalThreadData = {
		...shared,
		hero: {
			eyebrow: 'Approval and finalize',
			title: 'Graduation Approval Thread',
			summary:
				'Keep signature readiness, declaration state, and launch context together so finalize reads as part of the product flow rather than an off-screen wallet popup.',
		},
		threadSummary,
		messages: threadMessages,
		declaration,
		checkpoint,
		graduation,
		currentUserId: input.viewer.id,
		callouts: [
			{
				id: 'approval-note-wallet',
				title: input.hostWorkflow.expectedWallet
					? `Wallet ${truncateWallet(input.hostWorkflow.expectedWallet)} must sign`
					: 'Registered wallet required',
				summary:
					'Finalize signs the boundary digests and then self-attests the published packet before the local drone workflow is advanced.',
				tone: 'warning',
			},
			{
				id: 'approval-note-thread',
				title: 'Approval entry lives in-instance',
				summary:
					'Notifications and approval-thread messages now lead directly into the signing lane from Simulacrum.',
				tone: 'accent',
			},
		],
	};

	const actionContext: AppActionContext = {
		activeUsername,
		activeAgentId: activeAgent?.id ?? null,
		activeSoulAgentId: input.boundSoul?.agent.agentId ?? null,
		activeConversationId:
			input.hostWorkflow.selectedConversation?.conversation_id ??
			workflow?.conversation?.conversationId ??
			null,
		expectedWallet:
			expectedWallet,
	};

	return {
		page: input.page,
		faces: {
			dashboard,
			souls: soulRequestCenter,
			genesis: genesisWorkspace,
			approvals,
			identity: identityNexus,
		},
		activeAgent,
		workflow,
		hostWorkflow: input.hostWorkflow,
		actionContext,
		currentUserId: input.viewer.id,
		currentUserName: input.viewer.name,
		agentCount: input.myAgents.length,
		soulCount: input.mySouls.length,
		requestCount: requestQueue.length,
		reviewCount: input.myReviews.length,
		isPreview: input.isPreview,
	};
}

function pickActiveAgent(
	myAgents: readonly AgentRosterRecord[],
	agentHint?: string | null
): AgentRosterRecord | null {
	if (!myAgents.length) return null;
	const normalized = agentHint?.trim().toLowerCase();
	if (!normalized) return myAgents[0] ?? null;
	return (
		myAgents.find((agent) => agent.username.toLowerCase() === normalized) ??
		myAgents.find((agent) => agent.displayName.toLowerCase() === normalized) ??
		myAgents[0] ??
		null
	);
}

function findBoundSoul(
	mySouls: readonly SoulInventoryRecord[],
	activeUsername: string | null
): SoulInventoryRecord | null {
	const normalizedUsername = activeUsername?.trim().toLowerCase();
	if (!normalizedUsername) return null;

	return (
		mySouls.find(
			(item) =>
				item.bindingState === 'BOUND' &&
				item.binding?.agentUsername.trim().toLowerCase() === normalizedUsername
		) ?? null
	);
}

function findExpectedWallet(boundSoul: SoulInventoryRecord | null): string | null {
	return boundSoul?.agent.wallet?.trim() || null;
}

function buildIdentityDeclarationNotice({
	activeUsername,
	boundSoul,
	publishedSoulError,
	hostWorkflow,
}: {
	activeUsername: string;
	boundSoul: SoulInventoryRecord | null;
	publishedSoulError: string | null;
	hostWorkflow: HostWorkflowState;
}): AuthorityNotice {
	if (!boundSoul) {
		return {
			title: 'No bound soul returned by Lesser',
			message: `Lesser did not return a bound soul record for @${activeUsername}, so Simulacrum cannot resolve a lesser-host declaration for this body.`,
		};
	}

	if (publishedSoulError) {
		return {
			title: 'Published declaration lookup failed',
			message: publishedSoulError,
		};
	}

	if (hostWorkflow.tokenConfigured) {
		return {
			title: 'No declaration persisted on lesser-host',
			message: `lesser-host returned no published declaration for soul ${boundSoul.agent.agentId}, and the connected mint conversation does not currently expose a persisted declaration payload.`,
		};
	}

	return {
		title: 'No published declaration returned by lesser-host',
		message: `Soul ${boundSoul.agent.agentId} does not currently expose a published declaration record. Connect a lesser-host control-plane token to inspect the private mint conversation state if that declaration is still in review.`,
	};
}

function buildIdentityCard(
	activeAgent: DroneAgentState | null,
	workflow: AgentWorkflowSurface | null,
	activeUsername: string
): AgentWorkflowSurface['identity'] {
	if (workflow?.identity) {
		return workflow.identity;
	}

	if (activeAgent) {
		return {
			id: activeAgent.id,
			name: activeAgent.displayName,
			handle: `@${activeAgent.username}`,
			summary: activeAgent.bio ?? `Active drone body for ${activeAgent.displayName}.`,
			currentPhase: workflow?.currentPhase ?? 'request',
			currentState: workflow?.currentState ?? 'request.submitted',
			steward: {
				id: 'viewer-steward',
				name: activeAgent.agentOwner ?? 'Instance steward',
				role: 'instance steward',
				handle: undefined,
				avatarLabel: initials(activeAgent.agentOwner ?? 'Instance steward'),
				statusLabel: activeAgent.verified ? 'verified' : 'pending',
			},
			tags: [
				activeAgent.identitySemantics.identityLabel,
				activeAgent.verified ? 'verified' : 'unverified',
				activeAgent.agentCapabilities.canDM ? 'comms-enabled' : 'no-comms',
			],
			metrics: [
				{
					label: 'Activity',
					value: String(activeAgent.activityCount),
					detail: `Version ${activeAgent.agentVersion}`,
				},
				{
					label: 'Delegated scopes',
					value: String(activeAgent.delegatedScopes.length),
					detail: activeAgent.delegatedScopes.join(', ') || 'none',
				},
			],
		};
	}

	return {
		...PREVIEW_WORKFLOW.identity,
		id: `preview-${activeUsername}`,
		name: titleCase(activeUsername),
		handle: `@${activeUsername}`,
	};
}

function buildRoster(
	myAgents: readonly AgentRosterRecord[],
	activeUsername: string | null
): NexusDashboardData['roster'] {
	return myAgents.slice(0, 4).map((agent) => ({
		id: agent.id,
		name: agent.displayName,
		handle: `@${agent.username}`,
		summary: agent.bio ?? 'Agent roster entry',
		currentPhase: agent.username === activeUsername ? 'signing' : 'continuity',
		currentState: agent.username === activeUsername ? 'signing.pending' : 'continuity.stable',
		steward: undefined,
		tags: [agent.verified ? 'verified' : 'pending'],
		metrics: [
			{ label: 'Activity', value: String(agent.activityCount), detail: undefined },
			{
				label: 'Approval',
				value: agent.requiresApproval ? 'required' : 'open',
				detail: agent.canDM ? 'DM enabled' : 'DM locked',
			},
		],
	}));
}

function buildNavItems(
	page: AppPageDescriptor,
	activeUsername: string | null,
	requestCount: number,
	conversationCount: number,
	soulCount: number
): readonly AgentFaceNavItem[] {
	return [
		{
			id: 'nav-dashboard',
			label: 'Dashboard',
			icon: 'space_dashboard',
			href: getPageHref('dashboard', activeUsername),
			active: page.key === 'dashboard',
		},
		{
			id: 'nav-souls',
			label: 'Soul Requests',
			icon: 'smart_toy',
			href: getPageHref('souls', activeUsername),
			active: page.key === 'souls',
			badge: requestCount ? String(requestCount) : undefined,
		},
		{
			id: 'nav-genesis',
			label: 'Genesis',
			icon: 'auto_awesome',
			href: getPageHref('genesis', activeUsername),
			active: page.key === 'genesis',
			badge: conversationCount ? String(conversationCount) : undefined,
		},
		{
			id: 'nav-approvals',
			label: 'Approvals',
			icon: 'verified',
			href: getPageHref('approvals', activeUsername),
			active: page.key === 'approvals',
			badge: conversationCount ? 'sign' : undefined,
		},
		{
			id: 'nav-identity',
			label: 'Identity',
			icon: 'fingerprint',
			href: getPageHref('identity', activeUsername),
			active: page.key === 'identity',
			badge: soulCount ? String(soulCount) : undefined,
		},
		{
			id: 'nav-divider',
			label: '',
			icon: '',
		},
		{
			id: 'nav-timeline',
			label: 'Timeline',
			icon: 'home',
			href: getPageHref('timeline', activeUsername),
			active: page.key === 'timeline',
		},
		{
			id: 'nav-conversations',
			label: 'Messages',
			icon: 'chat',
			href: getPageHref('conversations', activeUsername),
			active: page.key === 'conversations',
		},
		{
			id: 'nav-notifications',
			label: 'Notifications',
			icon: 'notifications',
			href: getPageHref('notifications', activeUsername),
			active: page.key === 'notifications',
		},
		{
			id: 'nav-explore',
			label: 'Explore',
			icon: 'explore',
			href: getPageHref('explore', activeUsername),
			active: page.key === 'explore',
		},
	];
}

function buildActions(page: AppPageDescriptor, activeUsername: string | null): readonly AgentFaceAction[] {
	const nextPrimary = (() => {
		switch (page.key) {
			case 'dashboard':
				return { label: 'Open Soul Requests', href: getPageHref('souls', activeUsername), tone: 'primary' as const };
			case 'souls':
				return { label: 'Open Genesis Lane', href: getPageHref('genesis', activeUsername), tone: 'primary' as const };
			case 'genesis':
				return { label: 'Open Approvals', href: getPageHref('approvals', activeUsername), tone: 'primary' as const };
			case 'approvals':
				return { label: 'Open Identity Nexus', href: getPageHref('identity', activeUsername), tone: 'primary' as const };
			case 'identity':
				return { label: 'Return to Dashboard', href: getPageHref('dashboard', activeUsername), tone: 'primary' as const };
			default:
				return { label: 'Dashboard', href: getPageHref('dashboard', activeUsername), tone: 'primary' as const };
		}
	})();

	return [
		nextPrimary,
		{
			label: 'Pinned agent',
			href: getPageHref(page.key === 'not-found' ? 'dashboard' : page.key, activeUsername),
			tone: 'ghost',
			detail: activeUsername ? `?agent=${activeUsername}` : 'first available agent',
		},
	];
}

function buildStatusChips(
	workflow: AgentWorkflowSurface | null,
	activeAgent: DroneAgentState | null,
	hostWorkflow: HostWorkflowState
): readonly AgentFaceStatusChip[] {
	const semantics = workflow?.identitySemantics ?? activeAgent?.identitySemantics ?? PREVIEW_AGENT.identitySemantics;
	return [
		{
			label: semantics.identityLabel,
			detail: semantics.lifecycleState,
			tone: semantics.identityState === 'souled' ? 'success' : 'accent',
		},
		{
			label: semantics.attributionLabel,
			detail: semantics.continuityState,
			tone: semantics.bodyIdentityPreserved ? 'success' : 'warning',
		},
		{
			label: hostWorkflow.bridgeEnabled
				? hostWorkflow.tokenConfigured
					? 'Host workflow linked'
					: 'Host workflow gated'
				: 'Host bridge disabled',
			detail: hostWorkflow.bridgeEnabled
				? hostWorkflow.tokenConfigured
					? 'conversation and finalize actions unlocked'
					: 'requires control-plane token'
				: 'mint conversation and finalize intentionally gated',
			tone: hostWorkflow.bridgeEnabled
				? hostWorkflow.tokenConfigured
					? 'success'
					: 'warning'
				: 'accent',
		},
	];
}

function buildMetrics(
	agentCount: number,
	soulCount: number,
	requestCount: number,
	reviewCount: number,
	conversationCount: number
): readonly AgentFaceMetric[] {
	return [
		{
			id: 'metric-agents',
			label: 'Agents',
			value: String(agentCount),
			detail: 'Bodies currently visible in this instance workspace',
			tone: 'accent',
		},
		{
			id: 'metric-souls',
			label: 'Souls',
			value: String(soulCount),
			detail: 'Published or bindable soul identities in inventory',
			tone: soulCount ? 'success' : 'neutral',
		},
		{
			id: 'metric-requests',
			label: 'Requests',
			value: String(requestCount),
			detail: `${reviewCount} review record${reviewCount === 1 ? '' : 's'} in flight`,
			tone: requestCount ? 'warning' : 'neutral',
		},
		{
			id: 'metric-conversations',
			label: 'Conversations',
			value: String(conversationCount),
			detail: 'Mint conversation transcripts known to the current surface',
			tone: conversationCount ? 'accent' : 'neutral',
		},
	];
}

function buildRequestFilters(requestQueue: readonly SoulRequestCard[]): SoulRequestCenterData['filters'] {
	const counts = new Map<string, number>();
	for (const request of requestQueue) {
		const key = request.currentState ?? 'request.submitted';
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return Array.from(counts.entries()).map(([state, count], index) => ({
		id: state,
		label: state.split('.').pop()?.replaceAll('_', ' ') ?? state,
		count,
		active: index === 0,
	}));
}

function buildWorkflowNotifications(
	viewer: ViewerInfo,
	request: SoulRequestCard,
	review: ReviewDecisionCard,
	graduation: NonNullable<AgentWorkflowSurface['graduation']>,
	workflow: AgentWorkflowSurface | null,
	hostWorkflow: HostWorkflowState
): readonly WorkflowEventNotification[] {
	if (hostWorkflow.lifecycleEvents.length) {
		return hostWorkflow.lifecycleEvents.map((event, index) =>
			createWorkflowNotification({
				id: event.event_id,
				createdAt: event.occurred_at,
				account: workflowNotificationAccount(viewer),
				kind: mapLifecycleEventKind(event.event_type),
				title: titleCase(event.event_type.replaceAll('_', ' ')),
				summary: event.summary ?? 'Workflow lifecycle event',
				phase: workflow?.currentPhase,
				actionLabel: event.conversation_id ? `Conversation ${event.conversation_id}` : undefined,
				index,
			})
		);
	}

	return [
		createWorkflowNotification({
			id: 'notification-request',
			createdAt: request.submittedAt ? String(request.submittedAt) : PREVIEW_TIMESTAMP,
			account: workflowNotificationAccount(request.requestedBy),
			kind: 'request_submitted',
			title: request.title,
			summary: request.summary,
			phase: 'request',
			actionLabel: 'Open request',
			index: 0,
		}),
		createWorkflowNotification({
			id: 'notification-review',
			createdAt: PREVIEW_TIMESTAMP,
			account: workflowNotificationAccount(review.reviewer),
			kind: review.decision === 'approved' ? 'approval_requested' : 'review_requested',
			title: review.title,
			summary: review.decisionSummary,
			phase: workflow?.currentPhase ?? 'review',
			actionLabel: 'Open approval thread',
			index: 1,
		}),
		createWorkflowNotification({
			id: 'notification-finalize',
			createdAt: PREVIEW_TIMESTAMP,
			account: workflowNotificationAccount(viewer),
			kind: graduation.readiness === 'ready' ? 'graduated' : 'finalize_ready',
			title: graduation.title,
			summary: graduation.summary,
			phase: workflow?.currentPhase ?? 'graduation',
			actionLabel: graduation.nextStep ?? 'Finalize',
			index: 2,
		}),
	];
}

function buildThreadSummary(
	review: ReviewDecisionCard,
	graduation: NonNullable<AgentWorkflowSurface['graduation']>,
	checkpoint: NonNullable<AgentWorkflowSurface['checkpoint']>,
	workflow: AgentWorkflowSurface | null
): MessagingWorkflowConversationSummary {
	return {
		kind: 'approval',
		title: 'Graduation approval',
		state:
			review.decision === 'blocked'
				? 'rejected'
				: review.decision === 'changes_requested'
					? 'changes_requested'
					: graduation.readiness === 'ready'
						? 'approved'
						: 'open',
		phase: workflow?.currentPhase,
		dueLabel: checkpoint.dueAt ? `Due ${new Date(checkpoint.dueAt).toLocaleDateString('en-US')}` : undefined,
		summary: checkpoint.approvalMemo ?? graduation.summary,
	};
}

function buildThreadMessages(
	viewer: ViewerInfo,
	identity: AgentWorkflowSurface['identity'],
	transcript: readonly MintTranscriptMessage[],
	threadSummary: MessagingWorkflowConversationSummary,
	review: ReviewDecisionCard
): readonly DirectMessage[] {
	if (transcript.length) {
		return transcript.map((message, index) => ({
			id: message.id,
			conversationId: 'approval-thread',
			sender:
				message.role === 'assistant'
					? messageParticipant(identity.id, identity.name, identity.handle)
					: messageParticipant(viewer.id, viewer.name, viewer.handle),
			content: message.content,
			createdAt: message.createdAt ?? PREVIEW_TIMESTAMP,
			read: true,
			workflowMoments:
				index === 0
					? [
							{
								id: `${message.id}-moment`,
								kind: 'approval_request',
								title: threadSummary.title,
								summary: threadSummary.summary ?? review.decisionSummary,
								phase: threadSummary.phase,
								requestedBy: review.reviewer.name,
								targetLabel: identity.name,
								actionLabel: 'Finalize in Simulacrum',
								decision:
									threadSummary.state === 'approved'
										? 'approved'
										: threadSummary.state === 'changes_requested'
											? 'changes_requested'
											: threadSummary.state === 'rejected'
												? 'rejected'
												: undefined,
							},
						]
					: undefined,
		}));
	}

	return [
		{
			id: 'approval-message-reviewer',
			conversationId: 'approval-thread',
			sender: messageParticipant(review.reviewer.id, review.reviewer.name, review.reviewer.handle),
			content: review.decisionSummary,
			createdAt: PREVIEW_TIMESTAMP,
			read: true,
		},
	];
}

function buildContinuityTimeline(
	continuity: NonNullable<AgentWorkflowSurface['continuity']>,
	lifecycle: AgentWorkflowSurface['lifecycle'],
	hostWorkflow: HostWorkflowState
): readonly AgentFaceTimelineMoment[] {
	const lifecycleMoments = lifecycle.map<AgentFaceTimelineMoment>((step, index) => ({
		id: `lifecycle-${step.phase}-${index}`,
		title: step.title ?? titleCase(step.phase),
		summary: step.summary ?? 'Workflow phase update',
		meta: step.state ?? undefined,
		phase: step.phase,
		tone:
			step.status === 'complete'
				? 'success'
				: step.status === 'active'
					? 'accent'
					: step.status === 'blocked'
						? 'critical'
						: 'neutral',
	}));

	const hostMoments = hostWorkflow.lifecycleEvents.slice(0, 3).map<AgentFaceTimelineMoment>((event) => ({
		id: event.event_id,
		title: titleCase(event.event_type.replaceAll('_', ' ')),
		summary: event.summary ?? 'Lifecycle event',
		meta: event.occurred_at,
		phase: undefined,
		tone: mapLifecycleEventKind(event.event_type) === 'graduated' ? 'success' : 'accent',
	}));

	return hostMoments.length ? [...hostMoments, ...lifecycleMoments].slice(0, 6) : lifecycleMoments;
}

function buildAttributions(
	activeAgent: DroneAgentState | null,
	workflow: AgentWorkflowSurface | null
): readonly AgentFaceAttributionRecord[] {
	const semantics = workflow?.identitySemantics ?? activeAgent?.identitySemantics ?? PREVIEW_AGENT.identitySemantics;
	return [
		{
			id: 'attribution-body',
			title: semantics.attributionLabel,
			summary: semantics.continuitySummary,
			sourceLabel: semantics.identityState === 'souled' ? 'graduating body' : 'drone body',
			targetLabel: semantics.identityState === 'souled' ? 'published soul' : 'soul request lane',
			timestampLabel: activeAgent?.verifiedAt ?? activeAgent?.createdAt ?? PREVIEW_TIMESTAMP,
			tone: semantics.bodyIdentityPreserved ? 'success' : 'warning',
		},
		{
			id: 'attribution-memory',
			title: semantics.memoryReferencesPreserved ? 'Memory continuity preserved' : 'Memory continuity under review',
			summary: semantics.memoryReferencesPreserved
				? 'References, authored traces, and timeline history stay attached to the same body.'
				: 'Memory continuity needs a follow-up attestation.',
			sourceLabel: 'Simulacrum timeline',
			targetLabel: semantics.identityLabel,
			timestampLabel: PREVIEW_TIMESTAMP,
			tone: semantics.memoryReferencesPreserved ? 'success' : 'warning',
		},
		{
			id: 'attribution-moderation',
			title: semantics.moderationLabel,
			summary: 'Moderation and identity semantics remain explicit for both human and LLM consumers.',
			sourceLabel: 'runtime policy',
			targetLabel: semantics.identityLabel,
			timestampLabel: PREVIEW_TIMESTAMP,
			tone: 'accent',
		},
	];
}

function buildPublishedSoulDeclaration(
	profile: PublishedSoulProfile | null,
	agentName: string
): AgentWorkflowSurface['declaration'] | null {
	if (!profile?.agent.principal_declaration?.trim()) return null;

	const declaredScope = profile.capabilities.length
		? profile.capabilities.map((capability) => titleCase(capability.capability.replaceAll('_', ' ')))
		: profile.agent.self_description_version
			? [`Published soul record v${profile.agent.self_description_version}`]
			: ['Published soul record'];

	const risks = profile.boundaries.length
		? profile.boundaries.map((boundary) => boundary.statement.trim()).filter(Boolean)
		: [];
	const transparencyCount = profile.transparency ? Object.keys(profile.transparency).length : 0;

	return {
		id: `published-declaration-${profile.agent.agent_id}`,
		title: `${agentName} declaration packet`,
		statement: profile.agent.principal_declaration.trim(),
		confidence: profile.agent.self_description_version
			? `published v${profile.agent.self_description_version}`
			: 'published',
		owner: {
			id: profile.agent.agent_id,
			name: agentName,
			role: 'published soul',
			handle: profile.agent.local_id ? `@${profile.agent.local_id}` : null,
			avatarLabel: initials(agentName),
			statusLabel: profile.agent.status,
		},
		declaredScope,
		risks,
		supportingArtifacts: [
			{
				id: `published-capabilities-${profile.agent.agent_id}`,
				title: 'Capability registry',
				description: `${profile.capabilities.length} declared capability${profile.capabilities.length === 1 ? '' : 'ies'} published on lesser-host.`,
				emphasis: 'reference',
			},
			{
				id: `published-boundaries-${profile.agent.agent_id}`,
				title: 'Signed boundaries',
				description: `${profile.boundaries.length} published boundary commitment${profile.boundaries.length === 1 ? '' : 's'} attached to the soul.`,
				emphasis: 'decision',
			},
			{
				id: `published-transparency-${profile.agent.agent_id}`,
				title: 'Transparency record',
				description: transparencyCount
					? `${transparencyCount} transparency field${transparencyCount === 1 ? '' : 's'} published on lesser-host.`
					: 'No published transparency fields were returned by lesser-host.',
				emphasis: 'reference',
			},
		],
	};
}

function buildHostWorkflowDeclaration(
	producedDeclarations: Record<string, unknown> | null,
	localId: string | null,
	agentName: string
): AgentWorkflowSurface['declaration'] | null {
	if (!producedDeclarations) return null;

	const selfDescription = asRecord(producedDeclarations.selfDescription);
	const capabilities = asRecordArray(producedDeclarations.capabilities);
	const boundaries = asRecordArray(producedDeclarations.boundaries);
	const transparency = asRecord(producedDeclarations.transparency);
	const statement =
		readFirstString(selfDescription, ['summary', 'statement', 'description']) ??
		readFirstString(producedDeclarations, ['principal_declaration']);

	if (!statement) return null;

	return {
		id: `host-declaration-${localId ?? agentName.toLowerCase()}`,
		title:
			readFirstString(selfDescription, ['title', 'name', 'headline']) ??
			`${agentName} declaration packet`,
		statement,
		confidence: 'conversation-derived',
		owner: undefined,
		declaredScope: capabilities.length
			? capabilities
					.map((capability, index) =>
						readFirstString(capability, ['capability', 'label', 'name', 'scope']) ??
						`Capability ${index + 1}`
					)
			: ['Mint conversation draft'],
		risks: boundaries
			.map((boundary, index) =>
				readFirstString(boundary, ['statement', 'rationale', 'summary']) ??
				`Boundary ${index + 1}`
			)
			.filter(Boolean),
		supportingArtifacts: [
			{
				id: `host-self-description-${localId ?? agentName.toLowerCase()}`,
				title: 'Mint conversation record',
				description: 'Derived from the persisted lesser-host mint conversation output.',
				emphasis: 'reference',
			},
			...(Object.keys(transparency).length
				? [
						{
							id: `host-transparency-${localId ?? agentName.toLowerCase()}`,
							title: 'Transparency note',
							description:
								readFirstString(transparency, ['note', 'summary', 'statement']) ??
								`Captured ${Object.keys(transparency).length} transparency field${Object.keys(transparency).length === 1 ? '' : 's'}.`,
							emphasis: 'reference' as const,
						},
					]
				: []),
		],
	};
}

function buildUnavailableDeclaration(
	agentName: string,
	activeUsername: string
): NonNullable<AgentWorkflowSurface['declaration']> {
	return {
		id: `declaration-unavailable-${activeUsername}`,
		title: `${agentName} declaration packet`,
		statement:
			'Declaration details are not available from the current live contracts yet. The identity surface will refresh when Lesser or lesser-host returns a published declaration record.',
		confidence: 'unavailable',
		owner: undefined,
		declaredScope: ['Awaiting live declaration data'],
		risks: [],
		supportingArtifacts: [],
	};
}

function buildPublishedSoulArtifacts(
	profile: PublishedSoulProfile | null
): Array<{ id: string; title: string; description: string; emphasis: 'reference' | 'decision' }> {
	if (!profile) return [];

	const avatarStyles = (profile.agent.avatar?.styles ?? []).filter(
		(style) => style.style_name?.trim() || style.image?.trim()
	);
	const currentAvatarStyle = profile.agent.avatar?.current_style_name?.trim();

	return [
		{
			id: `soul-record-${profile.agent.agent_id}`,
			title: 'Published soul record',
			description: profile.agent.principal_declared_at
				? `Principal declaration recorded ${new Date(profile.agent.principal_declared_at).toLocaleString()}.`
				: 'Published soul record returned from lesser-host.',
			emphasis: 'reference',
		},
		...(avatarStyles.length || currentAvatarStyle
			? [
					{
						id: `avatar-styles-${profile.agent.agent_id}`,
						title: 'On-chain avatar styles',
						description: currentAvatarStyle
							? `Current on-chain style: ${currentAvatarStyle}. ${avatarStyles.length} structured avatar variant${avatarStyles.length === 1 ? '' : 's'} returned for the client.`
							: `${avatarStyles.length} structured avatar variant${avatarStyles.length === 1 ? '' : 's'} returned for the client.`,
						emphasis: 'reference' as const,
					},
				]
			: []),
		...Object.entries(profile.transparency ?? {}).map(([key, value]) => ({
			id: `transparency-${profile.agent.agent_id}-${key}`,
			title: titleCase(key.replaceAll('_', ' ')),
			description:
				typeof value === 'string'
					? value
					: JSON.stringify(value),
			emphasis: 'reference' as const,
		})),
	];
}

function buildProducedDeclarationArtifacts(
	producedDeclarations: Record<string, unknown> | null
): Array<{ id: string; title: string; description: string; emphasis: 'decision' }> {
	if (!producedDeclarations) return [];
	return Object.keys(producedDeclarations).map((key) => ({
		id: `produced-${key}`,
		title: titleCase(key.replaceAll('_', ' ')),
		description: 'Produced from the mint conversation and carried into the finalize packet.',
		emphasis: 'decision',
	}));
}

function parseTranscript(conversation: SoulMintConversation | null): readonly MintTranscriptMessage[] {
	if (!conversation?.messages) return [];

	try {
		const parsed = JSON.parse(conversation.messages) as Array<Record<string, unknown>>;
		return parsed
			.filter((entry) => typeof entry?.role === 'string' && typeof entry?.content === 'string')
			.map((entry, index) => ({
				id: `${conversation.conversation_id}-${index}`,
				role: normalizeRole(String(entry.role)),
				label: normalizeRole(String(entry.role)) === 'assistant' ? 'Agent' : 'Operator',
				content: String(entry.content),
				createdAt: conversation.created_at,
			}));
	} catch {
		return [];
	}
}

function parseProducedDeclarations(conversation: SoulMintConversation | null): Record<string, unknown> | null {
	if (!conversation?.produced_declarations) return null;
	try {
		const parsed = JSON.parse(conversation.produced_declarations) as Record<string, unknown>;
		return parsed && typeof parsed === 'object' ? parsed : null;
	} catch {
		return null;
	}
}

function findSelectedConversation(
	conversations: readonly SoulMintConversation[],
	conversationId: string | null
): SoulMintConversation | null {
	if (conversationId?.trim()) {
		const found = conversations.find((conversation) => conversation.conversation_id === conversationId);
		if (found) return found;
	}
	return conversations[0] ?? null;
}

function synthesizeTranscript(
	viewer: ViewerInfo,
	agentName: string,
	request: SoulRequestCard | undefined,
	declaration: NonNullable<AgentWorkflowSurface['declaration']>,
	review: ReviewDecisionCard
): readonly MintTranscriptMessage[] {
	return [
		{
			id: 'synthetic-user-request',
			role: 'user',
			label: viewer.name,
			content: request?.summary ?? 'Prepare the declaration packet for this body.',
			createdAt: PREVIEW_TIMESTAMP,
		},
		{
			id: 'synthetic-assistant-declaration',
			role: 'assistant',
			label: agentName,
			content: declaration.statement,
			createdAt: PREVIEW_TIMESTAMP,
		},
		{
			id: 'synthetic-system-review',
			role: 'system',
			label: review.reviewer.name,
			content: review.decisionSummary,
			createdAt: PREVIEW_TIMESTAMP,
		},
	];
}

function workflowNotificationAccount(actor: ViewerInfo | SoulRequestCard['requestedBy'] | ReviewDecisionCard['reviewer']): NotificationAccount {
	const handle = 'handle' in actor && actor.handle ? actor.handle.replace(/^@/, '') : actor.name.toLowerCase().replaceAll(/\s+/g, '-');
	return {
		id: actor.id,
		username: handle.split('@')[0] ?? handle,
		acct: handle,
		displayName: actor.name,
		avatar: '',
		url: '#workflow',
		createdAt: PREVIEW_TIMESTAMP,
		bot: true,
		verified: false,
	};
}

function createWorkflowNotification({
	id,
	createdAt,
	account,
	kind,
	title,
	summary,
	phase,
	actionLabel,
	index,
}: {
	id: string;
	createdAt: string;
	account: NotificationAccount;
	kind: WorkflowEventKind;
	title: string;
	summary: string;
	phase?: string;
	actionLabel?: string;
	index: number;
}): WorkflowEventNotification {
	return {
		id,
		type: 'workflow_event',
		createdAt,
		account,
		read: index > 0,
		dismissed: false,
		status: undefined,
		communication: null,
		workflowEvent: {
			kind,
			title,
			summary,
			phase,
			actionLabel,
		},
	};
}

function mapLifecycleEventKind(eventType: string): WorkflowEventKind {
	const normalized = eventType.trim().toLowerCase();
	if (normalized.includes('graduated') || normalized.includes('publish')) return 'graduated';
	if (normalized.includes('finalize') || normalized.includes('ready')) return 'finalize_ready';
	if (normalized.includes('approval')) return 'approval_requested';
	if (normalized.includes('review')) return 'review_requested';
	return 'request_submitted';
}

function messageParticipant(id: string, name: string, handle?: string | null): MessageParticipant {
	return {
		id,
		username: (handle ?? name).replace(/^@/, '').split('@')[0] ?? name.toLowerCase(),
		displayName: name,
		avatar: '',
	};
}

function normalizeRole(role: string): MintTranscriptMessage['role'] {
	const normalized = role.trim().toLowerCase();
	if (normalized === 'assistant' || normalized === 'system') return normalized;
	return 'user';
}

function truncateWallet(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length <= 12) return trimmed;
	return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asRecordArray(value: unknown): ReadonlyArray<Record<string, unknown>> {
	return Array.isArray(value)
		? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
		: [];
}

function readFirstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}
	return null;
}

function titleCase(value: string): string {
	return value
		.split(/[\s_-]+/g)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function initials(value: string): string {
	return value
		.split(/\s+/g)
		.filter(Boolean)
		.map((part) => part[0])
		.join('')
		.slice(0, 2)
		.toUpperCase();
}

function dedupeById<T extends { id: string }>(items: readonly (T | null | undefined)[]): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const item of items) {
		if (!item || seen.has(item.id)) continue;
		seen.add(item.id);
		out.push(item);
	}
	return out;
}
