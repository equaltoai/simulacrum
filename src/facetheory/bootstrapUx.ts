import { PUBLIC_APP_BASE_PATH } from '../lib/publicRoutes.ts';

import type {
	AgentLifecycleStep,
	DroneGraduationReadiness,
	DroneWorkflowPhase,
	DroneWorkflowState,
	SignatureCheckpointCard,
	SignatureCheckpointSigner,
	SoulRequestCard,
} from '../lib/api/droneWorkflow.ts';
import type {
	SoulBootstrapActionableError,
	SoulBootstrapPhase,
	SoulBootstrapResult,
	SoulBootstrapSigningCheckpoint,
	SoulBootstrapState,
} from '../lib/api/soulBootstrap.ts';
import type { AgentFaceAction, AgentFaceCallout } from '../lib/greater/faces/agent/types.ts';

export type SoulBootstrapUxRouteKey = 'identity' | 'genesis' | 'approvals' | 'drones';

export type SoulBootstrapUxIssue =
	| 'none'
	| 'host_trust_not_configured'
	| 'host_instance_key_missing'
	| 'host_unavailable'
	| 'backend_contract_unsupported'
	| 'wallet_signature_rejected'
	| 'conversation_incomplete'
	| 'finalize_expired'
	| 'binding_conflict'
	| 'authorization_required'
	| 'body_required'
	| 'not_found'
	| 'validation'
	| 'backend_error';

export type SoulBootstrapUxTone = 'neutral' | 'accent' | 'success' | 'warning' | 'critical';

export interface SoulBootstrapUxState {
	issue: SoulBootstrapUxIssue;
	phase: SoulBootstrapPhase | 'UNAVAILABLE';
	stateLabel: string;
	title: string;
	summary: string;
	actionLabel: string;
	actionHref: string;
	actionDetail: string;
	routeKey: SoulBootstrapUxRouteKey;
	tone: SoulBootstrapUxTone;
	isProductionSoul: boolean;
	conversationVisible: boolean;
	finalizeReady: boolean;
	signingReady: boolean;
	statusDetail: string;
}

export interface DeriveSoulBootstrapUxInput {
	result: SoulBootstrapResult | null;
	activeUsername?: string | null;
	failureIssue?: SoulBootstrapUxIssue;
	failureMessage?: string | null;
}

const PHASE_LABELS: Record<SoulBootstrapPhase | 'UNAVAILABLE', string> = {
	UNAVAILABLE: 'Backend unavailable',
	NOT_STARTED: 'Ready to begin',
	BEGIN: 'Wallet challenge ready',
	WALLET_VERIFICATION: 'Wallet verification',
	PRINCIPAL_DECLARATION: 'Principal declaration',
	CONVERSATION: 'Genesis conversation',
	FINALIZE: 'Finalize readiness',
	COMPLETE: 'Production soul',
	ERROR: 'Backend action required',
};

const ISSUE_COPY: Record<SoulBootstrapUxIssue, {
	title: string;
	summary: string;
	actionLabel: string;
	routeKey: SoulBootstrapUxRouteKey;
	tone: SoulBootstrapUxTone;
}> = {
	none: {
		title: 'Sim-led soul creation is available',
		summary:
			'Lesser is relaying Project 44 soul-bootstrap state over same-origin GraphQL, so Simulacrum can keep the creation path in-instance without a lesser-host portal detour.',
		actionLabel: 'Open Genesis Lane',
		routeKey: 'genesis',
		tone: 'accent',
	},
	host_trust_not_configured: {
		title: 'Host trust is not configured',
		summary:
			'Lesser reports that this instance does not have server-side Host trust configured. Ask the instance operator to configure Host trust for this Lesser instance; Simulacrum will continue here after the same-origin bridge is available.',
		actionLabel: 'Return to Identity Nexus',
		routeKey: 'identity',
		tone: 'critical',
	},
	host_instance_key_missing: {
		title: 'Host instance key is missing or unavailable',
		summary:
			'Lesser reached the soul-bootstrap bridge but cannot use the server-side Host instance key. The operator must provision or rotate the instance key server-side; the browser should not receive a Host token.',
		actionLabel: 'Return to Identity Nexus',
		routeKey: 'identity',
		tone: 'critical',
	},
	host_unavailable: {
		title: 'Host is unavailable through Lesser',
		summary:
			'Lesser is the same-origin backend for Simulacrum, and its server-side Host bridge is currently unavailable or timed out. Retry from Simulacrum after Lesser/Host recovers; do not switch to a portal token workflow.',
		actionLabel: 'Return to Identity Nexus',
		routeKey: 'identity',
		tone: 'warning',
	},
	backend_contract_unsupported: {
		title: 'Backend contract is unsupported',
		summary:
			'This Lesser instance does not expose the Project 44 soul-bootstrap GraphQL contract expected by the vendored Greater adapter. Upgrade or sync Lesser/Greater contracts; Simulacrum will not add a REST or raw Host workaround.',
		actionLabel: 'Return to Identity Nexus',
		routeKey: 'identity',
		tone: 'critical',
	},
	wallet_signature_rejected: {
		title: 'Wallet or signature was rejected',
		summary:
			'Lesser rejected the wallet, principal, or finalize signature material. Review the signer readiness in Simulacrum; M4.3 owns the interactive signing controls.',
		actionLabel: 'Open Approvals',
		routeKey: 'approvals',
		tone: 'critical',
	},
	conversation_incomplete: {
		title: 'Conversation must complete first',
		summary:
			'Lesser cannot finalize until the mint conversation is complete. Continue the Simulacrum genesis lane so the declaration packet can be prepared.',
		actionLabel: 'Open Genesis Lane',
		routeKey: 'genesis',
		tone: 'warning',
	},
	finalize_expired: {
		title: 'Finalize payload expired',
		summary:
			'Lesser reports that the finalize signing window expired. Re-prepare finalize state from the in-instance approvals lane when the backend supports it.',
		actionLabel: 'Open Approvals',
		routeKey: 'approvals',
		tone: 'warning',
	},
	binding_conflict: {
		title: 'Soul binding conflict',
		summary:
			'Lesser reports a binding conflict for this body or soul. Inspect the Identity Nexus and resolve the conflicting binding before continuing creation.',
		actionLabel: 'Open Identity Nexus',
		routeKey: 'identity',
		tone: 'critical',
	},
	authorization_required: {
		title: 'Authorization required',
		summary:
			'Lesser did not authorize the soul-bootstrap read. Refresh the Lesser session and continue from Simulacrum once the same-origin bearer token is valid.',
		actionLabel: 'Open Identity Nexus',
		routeKey: 'identity',
		tone: 'warning',
	},
	body_required: {
		title: 'Create a drone body first',
		summary:
			'This account does not have a local drone body yet. Create the body inside Simulacrum first; Lesser soul-bootstrap starts only after there is a body to attach a hosted/off-chain soul to.',
		actionLabel: 'Create Drone Body',
		routeKey: 'drones',
		tone: 'accent',
	},
	not_found: {
		title: 'Bootstrap target was not found',
		summary:
			'Lesser could not find a local body for this bootstrap request. Create or select a local drone body, then return to its Identity Nexus.',
		actionLabel: 'Open Identity Nexus',
		routeKey: 'identity',
		tone: 'warning',
	},
	validation: {
		title: 'Bootstrap input needs review',
		summary:
			'Lesser rejected the current bootstrap state as invalid. Keep the correction inside Simulacrum and retry only after the backend state is corrected.',
		actionLabel: 'Open Identity Nexus',
		routeKey: 'identity',
		tone: 'warning',
	},
	backend_error: {
		title: 'Bootstrap backend needs attention',
		summary:
			'Lesser returned a soul-bootstrap backend error. The user remains in the canonical Simulacrum flow while the operator resolves the backend state.',
		actionLabel: 'Open Identity Nexus',
		routeKey: 'identity',
		tone: 'warning',
	},
};

export function deriveSoulBootstrapUx({
	result,
	activeUsername,
	failureIssue,
	failureMessage,
}: DeriveSoulBootstrapUxInput): SoulBootstrapUxState {
	const issue = result?.error
		? issueFromActionableError(result.error)
		: result && isHostBridgeUnavailableIssue(result)
			? 'host_unavailable'
			: failureIssue ?? 'none';
	const phase = result?.state?.phase ?? (issue === 'none' && result ? 'NOT_STARTED' : 'UNAVAILABLE');
	const username = activeUsername?.trim() || result?.surface?.username || result?.state?.username || null;
	const isProductionSoul = isProductionSoulBootstrapResult(result);

	if (isProductionSoul) {
		const soulAgentId =
			result?.surface?.existingSoulAgentId ??
			result?.state?.publication?.agentId ??
			result?.state?.hostSoulAgentId ??
			'published soul';
		return {
			issue: 'none',
			phase,
			stateLabel: PHASE_LABELS.COMPLETE,
			title: 'Production soul is active',
			summary: `Lesser reports hosted/off-chain finalization is complete and bound to ${soulAgentId}. Simulacrum treats that as production soul state and keeps continuity on the Identity Nexus.`,
			actionLabel: 'Inspect Identity Nexus',
			actionHref: pageHref('identity', username),
			actionDetail: 'Hosted/off-chain publication is accepted once finalized and bound.',
			routeKey: 'identity',
			tone: 'success',
			isProductionSoul: true,
			conversationVisible: true,
			finalizeReady: false,
			signingReady: false,
			statusDetail: 'hosted/off-chain soul bound',
		};
	}

	if (issue !== 'none') {
		const copy = ISSUE_COPY[issue];
		const detail = result?.error?.message ??
			(issue === 'body_required' || issue === 'authorization_required' ? null : failureMessage);
		return {
			issue,
			phase,
			stateLabel: PHASE_LABELS[phase],
			title: copy.title,
			summary: withBackendDetail(copy.summary, detail),
			actionLabel: copy.actionLabel,
			actionHref: pageHref(copy.routeKey, username),
			actionDetail: 'Action stays in Simulacrum; no lesser-host portal token is required.',
			routeKey: copy.routeKey,
			tone: copy.tone,
			isProductionSoul: false,
			conversationVisible: phase === 'CONVERSATION',
			finalizeReady: phase === 'FINALIZE',
			signingReady: isSoulBootstrapSigningPhase(phase),
			statusDetail: result?.state?.state ?? result?.error?.code ?? issue.replaceAll('_', ' '),
		};
	}

	const normal = normalPhaseCopy(phase, result);
	return {
		issue: 'none',
		phase,
		stateLabel: PHASE_LABELS[phase],
		title: normal.title,
		summary: normal.summary,
		actionLabel: normal.actionLabel,
		actionHref: pageHref(normal.routeKey, username),
		actionDetail: normal.actionDetail,
		routeKey: normal.routeKey,
		tone: normal.tone,
		isProductionSoul: false,
		conversationVisible: phase === 'CONVERSATION',
		finalizeReady: phase === 'FINALIZE',
		signingReady: isSoulBootstrapSigningPhase(phase),
		statusDetail: result?.nextAction ?? result?.state?.state ?? 'same-origin GraphQL state loaded',
	};
}

export function classifySoulBootstrapFailure(error: unknown): SoulBootstrapUxIssue {
	const record = asRecord(error);
	const message = readErrorText(error);
	const category = typeof record.category === 'string' ? record.category : '';
	const code = typeof record.code === 'string' ? record.code : '';
	const statusCode = typeof record.statusCode === 'number' ? record.statusCode : null;
	const graphQLErrors = Array.isArray(record.graphQLErrors)
		? record.graphQLErrors.map(readErrorText).join(' ')
		: '';
	const normalized = normalizeText([category, code, message, graphQLErrors].join(' '));

	if (looksUnsupportedContract(normalized)) return 'backend_contract_unsupported';
	if (includesAny(normalized, ['missing trust', 'trust not configured', 'insufficient trust'])) {
		return 'host_trust_not_configured';
	}
	if (includesAny(normalized, ['missing instance key', 'instance key missing', 'no instance key'])) {
		return 'host_instance_key_missing';
	}
	if (includesAny(normalized, ['signature rejected', 'invalid signature', 'signature mismatch', 'signature verification'])) {
		return 'wallet_signature_rejected';
	}
	if (includesAny(normalized, ['host unavailable', 'host timeout', 'network error']) || (statusCode ?? 0) >= 500) {
		return 'host_unavailable';
	}
	if (includesAny(normalized, ['unauthorized', 'unauthenticated', 'forbidden'])) {
		return 'authorization_required';
	}
	if (includesAny(normalized, ['not found'])) return 'not_found';
	if (includesAny(normalized, ['validation', 'bad user input', 'invalid input'])) return 'validation';
	return 'backend_error';
}

export function isProductionSoulBootstrapResult(result: SoulBootstrapResult | null): boolean {
	if (!result?.state || result.error) return false;
	const phaseComplete = result.state.phase === 'COMPLETE';
	const bound = result.surface?.soulBindingState === 'BOUND';
	const hasSoulId = Boolean(
		result.surface?.existingSoulAgentId ?? result.state.publication?.agentId ?? result.state.hostSoulAgentId
	);
	return phaseComplete && (bound || hasSoulId);
}

export function buildSoulBootstrapAction(ux: SoulBootstrapUxState): AgentFaceAction {
	return {
		label: ux.actionLabel,
		href: ux.actionHref,
		tone: ux.tone === 'success' || ux.tone === 'accent' ? 'primary' : 'secondary',
		detail: ux.actionDetail,
	};
}

export function buildSoulBootstrapCallout(ux: SoulBootstrapUxState, id: string): AgentFaceCallout {
	return {
		id,
		title: ux.title,
		summary: ux.summary,
		meta: `${ux.stateLabel} · ${ux.actionLabel}`,
		tone: ux.tone,
	};
}

export function buildSoulBootstrapRequestCard({
	ux,
	state,
	username,
	viewerName,
	viewerId,
	viewerHandle,
}: {
	ux: SoulBootstrapUxState;
	state: SoulBootstrapState | null;
	username: string;
	viewerName: string;
	viewerId: string;
	viewerHandle?: string | null;
}): SoulRequestCard | null {
	if (ux.isProductionSoul) return null;
	if (!state && (ux.issue === 'body_required' || ux.issue === 'authorization_required')) return null;
	return {
		id: `bootstrap-request-${username}`,
		title: `Sim-led soul creation for @${username}`,
		summary: ux.summary,
		requestedBy: {
			id: viewerId || 'viewer',
			name: viewerName || 'Simulacrum operator',
			role: 'instance operator',
			handle: viewerHandle ?? null,
			avatarLabel: initials(viewerName || 'Simulacrum operator'),
			statusLabel: ux.stateLabel,
		},
		submittedAt: state?.updatedAt ?? null,
		constraints: [
			'Stay in Simulacrum as the canonical UX.',
			'Use Lesser same-origin GraphQL as the backend boundary.',
			'Do not ask the browser for lesser-host control-plane credentials.',
		],
		artifacts: [
			{
				id: `bootstrap-route-${username}`,
				title: ux.actionLabel,
				description: ux.actionDetail,
				href: ux.actionHref,
				emphasis: ux.tone === 'critical' ? 'decision' : 'reference',
			},
		],
		routeDecision: `sim.${ux.routeKey}`,
		currentState: workflowStateFromBootstrap(ux),
	};
}

export function buildSoulBootstrapLifecycle(ux: SoulBootstrapUxState): readonly AgentLifecycleStep[] {
	const activePhase = workflowPhaseFromBootstrap(ux);
	const phaseOrder: readonly DroneWorkflowPhase[] = [
		'request',
		'review',
		'declaration',
		'signing',
		'graduation',
		'continuity',
	];
	const activeIndex = phaseOrder.indexOf(activePhase);
	return phaseOrder.map((phase, index) => ({
		phase,
		title: titleCase(phase),
		summary: lifecycleSummary(phase, ux),
		state: phase === activePhase ? workflowStateFromBootstrap(ux) : undefined,
		status: ux.issue !== 'none' && phase === activePhase
			? 'blocked'
			: ux.isProductionSoul || index < activeIndex
				? 'complete'
				: index === activeIndex
					? 'active'
					: 'upcoming',
	}));
}

export function buildSoulBootstrapCheckpoint(
	ux: SoulBootstrapUxState,
	checkpoints: readonly SoulBootstrapSigningCheckpoint[]
): SignatureCheckpointCard | null {
	if (!checkpoints.length && !ux.signingReady && !ux.finalizeReady) return null;
	const signers = checkpoints.length
		? checkpoints.map(checkpointToSigner)
		: [{
				id: `bootstrap-signer-${ux.phase.toLowerCase()}`,
				name: ux.stateLabel,
				role: 'Lesser-provided signing material',
				status: 'pending' as const,
				note: ux.summary,
			}];
	return {
		id: `bootstrap-checkpoint-${ux.phase.toLowerCase()}`,
		title: ux.finalizeReady ? 'Finalize signing readiness' : 'Bootstrap signing readiness',
		readinessLabel: ux.title,
		approvalMemo: ux.summary,
		dueAt: firstCheckpointDate(checkpoints),
		signers,
	};
}

export function buildSoulBootstrapGraduation(
	ux: SoulBootstrapUxState,
	checkpoints: readonly SoulBootstrapSigningCheckpoint[]
) {
	if (!ux.finalizeReady && !ux.isProductionSoul && ux.issue !== 'wallet_signature_rejected') return null;
	const completed = checkpoints.filter((checkpoint) => signerStatusFromCheckpoint(checkpoint) === 'approved').length;
	const readiness: DroneGraduationReadiness = ux.isProductionSoul
		? 'ready'
		: ux.issue === 'wallet_signature_rejected'
			? 'hold'
			: 'watch';
	return {
		id: `bootstrap-graduation-${ux.phase.toLowerCase()}`,
		title: ux.isProductionSoul ? 'Hosted/off-chain soul finalized' : 'Finalize readiness',
		readiness,
		summary: ux.summary,
		launchOwner: undefined,
		completedMilestones: ux.isProductionSoul
			? ['same-origin bridge', 'hosted/off-chain publication', 'Lesser binding']
			: ['same-origin bridge', 'conversation state', `${completed} signer checkpoint${completed === 1 ? '' : 's'} complete`],
		exitCriteria: ux.isProductionSoul
			? ['Inspect continuity on Identity Nexus']
			: ['Review Lesser-provided signing material', 'Wait for M4.3 interactive signing controls'],
		nextStep: ux.actionLabel,
		metrics: [
			{
				label: 'Bootstrap state',
				value: ux.stateLabel,
				detail: ux.statusDetail,
			},
		],
	};
}

export function buildSoulBootstrapConversationMessages({
	ux,
	state,
	checkpoints,
}: {
	ux: SoulBootstrapUxState;
	state: SoulBootstrapState | null;
	checkpoints: readonly SoulBootstrapSigningCheckpoint[];
}) {
	const conversationCheckpoint = checkpoints.find(
		(checkpoint) => checkpoint.name.toLowerCase().includes('conversation') && checkpoint.message
	);
	if (conversationCheckpoint?.message) {
		return [{
			id: `bootstrap-${conversationCheckpoint.name}`,
			role: 'assistant' as const,
			label: 'Lesser',
			content: conversationCheckpoint.message,
			createdAt:
				conversationCheckpoint.completedAt ??
				conversationCheckpoint.declaredAt ??
				conversationCheckpoint.issuedAt ??
				state?.updatedAt ??
				undefined,
		}];
	}
	if (!ux.conversationVisible && !ux.finalizeReady && !ux.isProductionSoul) return [];
	return [{
		id: `bootstrap-${ux.phase.toLowerCase()}-state`,
		role: 'system' as const,
		label: 'Lesser',
		content: ux.conversationVisible
			? 'Lesser has routed this local body into the same-origin mint conversation. Continue from /l/souls/genesis; Simulacrum remains the canonical UX.'
			: ux.finalizeReady
				? 'Lesser reports the mint conversation is complete and finalize readiness belongs on /l/approvals.'
				: 'Hosted/off-chain finalization is complete and bound; inspect continuity from the Identity Nexus.',
		createdAt: state?.updatedAt ?? undefined,
	}];
}

function issueFromActionableError(error: SoulBootstrapActionableError): SoulBootstrapUxIssue {
	switch (error.category) {
		case 'missing_trust':
			return 'host_trust_not_configured';
		case 'missing_instance_key':
			return 'host_instance_key_missing';
		case 'host_unavailable':
		case 'network_error':
			return 'host_unavailable';
		case 'signature_rejection':
			return 'wallet_signature_rejected';
		case 'incomplete_conversation':
			return 'conversation_incomplete';
		case 'finalize_expiry':
			return 'finalize_expired';
		case 'binding_conflict':
			return 'binding_conflict';
		case 'unauthorized':
			return 'authorization_required';
		case 'not_found':
			return 'not_found';
		case 'validation':
			return 'validation';
		case 'graphql_error':
			return looksUnsupportedContract(normalizeText(`${error.code ?? ''} ${error.message}`))
				? 'backend_contract_unsupported'
				: 'backend_error';
		case 'backend_error':
			return looksUnsupportedContract(normalizeText(`${error.code ?? ''} ${error.message}`))
				? 'backend_contract_unsupported'
				: 'backend_error';
		case 'unknown':
		default:
			return 'backend_error';
	}
}

function normalPhaseCopy(phase: SoulBootstrapPhase | 'UNAVAILABLE', result: SoulBootstrapResult | null) {
	switch (phase) {
		case 'NOT_STARTED':
			return {
				title: 'Start Sim-led soul creation',
				summary:
					'Lesser reports that the same-origin soul-bootstrap bridge is available for this unsouled local body. Begin from Simulacrum and keep the user on the in-instance creation path.',
				actionLabel: 'Open Genesis Lane',
				actionDetail: 'Begin the visible creation path at /l/souls/genesis.',
				routeKey: 'genesis' as const,
				tone: 'accent' as const,
			};
		case 'BEGIN':
			return {
				title: 'Wallet challenge is ready',
				summary:
					'Lesser began the same-origin soul-bootstrap registration and returned wallet challenge material. Continue signing inside Simulacrum; the browser still never receives Host control-plane credentials.',
				actionLabel: 'Open Approvals',
				actionDetail: 'Review the Lesser-provided wallet challenge signing material.',
				routeKey: 'approvals' as const,
				tone: 'warning' as const,
			};
		case 'CONVERSATION':
			return {
				title: 'Genesis conversation is ready',
				summary:
					'Lesser has routed this body to the mint conversation phase. Continue in /l/souls/genesis; Simulacrum is the canonical UX and Lesser remains the same-origin backend.',
				actionLabel: 'Open Genesis Lane',
				actionDetail: result?.state?.hostConversationId
					? `Conversation ${result.state.hostConversationId}`
					: 'Conversation phase is visible in Simulacrum.',
				routeKey: 'genesis' as const,
				tone: 'accent' as const,
			};
		case 'WALLET_VERIFICATION':
		case 'PRINCIPAL_DECLARATION':
			return {
				title: 'Signature readiness is visible',
				summary:
					'Lesser returned signing readiness for the wallet/principal phase. M4.2 surfaces the state on /l/approvals; M4.3 owns the interactive signing UX.',
				actionLabel: 'Open Approvals',
				actionDetail: 'Review signer readiness without exposing Host credentials.',
				routeKey: 'approvals' as const,
				tone: 'warning' as const,
			};
		case 'FINALIZE':
			return {
				title: 'Finalize signing is ready',
				summary:
					'Lesser reports that the conversation phase is complete and finalize/signing readiness belongs in the approval thread. Simulacrum shows the readiness state now; M4.3 adds signing controls.',
				actionLabel: 'Open Approvals',
				actionDetail: 'Finalize readiness is routed to /l/approvals.',
				routeKey: 'approvals' as const,
				tone: 'warning' as const,
			};
		case 'ERROR':
			return {
				title: ISSUE_COPY.backend_error.title,
				summary: ISSUE_COPY.backend_error.summary,
				actionLabel: ISSUE_COPY.backend_error.actionLabel,
				actionDetail: 'Review the backend state from Identity.',
				routeKey: ISSUE_COPY.backend_error.routeKey,
				tone: ISSUE_COPY.backend_error.tone,
			};
		case 'COMPLETE':
			return {
				title: 'Bootstrap complete',
				summary:
					'Lesser reports bootstrap completion. If the soul is not bound yet, refresh Identity after Lesser returns the binding state.',
				actionLabel: 'Open Identity Nexus',
				actionDetail: 'Inspect continuity and binding state.',
				routeKey: 'identity' as const,
				tone: 'success' as const,
			};
		case 'UNAVAILABLE':
		default:
			return {
				title: ISSUE_COPY.backend_error.title,
				summary: ISSUE_COPY.backend_error.summary,
				actionLabel: ISSUE_COPY.backend_error.actionLabel,
				actionDetail: 'Review the backend state from Identity.',
				routeKey: ISSUE_COPY.backend_error.routeKey,
				tone: ISSUE_COPY.backend_error.tone,
			};
	}
}

function isHostBridgeUnavailableIssue(result: SoulBootstrapResult): boolean {
	if (result.hostBridgeAvailable !== false) return false;
	const phase = result.state?.phase;
	const nextAction = result.nextAction?.trim() ?? '';
	if (phase === 'NOT_STARTED' && (nextAction === '' || nextAction === 'begin')) {
		return false;
	}
	return true;
}

function isSoulBootstrapSigningPhase(phase: SoulBootstrapPhase | 'UNAVAILABLE'): boolean {
	return phase === 'BEGIN' ||
		phase === 'WALLET_VERIFICATION' ||
		phase === 'PRINCIPAL_DECLARATION' ||
		phase === 'FINALIZE';
}

function workflowPhaseFromBootstrap(ux: SoulBootstrapUxState): DroneWorkflowPhase {
	if (ux.isProductionSoul) return 'continuity';
	if (ux.conversationVisible) return 'declaration';
	if (ux.signingReady) return 'signing';
	if (ux.finalizeReady) return 'graduation';
	if (ux.issue !== 'none') return 'review';
	return 'request';
}

function workflowStateFromBootstrap(ux: SoulBootstrapUxState): DroneWorkflowState {
	if (ux.isProductionSoul) return 'continuity.stable';
	if (ux.issue === 'wallet_signature_rejected' || ux.issue === 'binding_conflict') return 'review.blocked';
	if (ux.issue !== 'none') return 'review.queued';
	if (ux.finalizeReady) return 'graduation.ready';
	if (ux.signingReady) return 'signing.pending';
	if (ux.conversationVisible) return 'declaration.ready';
	return 'request.submitted';
}

function lifecycleSummary(phase: DroneWorkflowPhase, ux: SoulBootstrapUxState): string {
	if (phase === workflowPhaseFromBootstrap(ux)) return ux.summary;
	switch (phase) {
		case 'request':
			return 'Bootstrap lane is visible from the local body Identity Nexus.';
		case 'review':
			return 'Backend/config readiness remains explicit and actionable.';
		case 'declaration':
			return 'Mint conversation shapes the declaration packet in Simulacrum.';
		case 'signing':
			return 'Signer readiness is shown without Host-token browser storage.';
		case 'graduation':
			return 'Hosted/off-chain finalization is accepted once finalized and bound.';
		case 'continuity':
			return 'Identity continuity remains visible on the same local body.';
	}
}

function checkpointToSigner(checkpoint: SoulBootstrapSigningCheckpoint): SignatureCheckpointSigner {
	return {
		id: `bootstrap-signer-${checkpoint.name}`,
		name: titleCase(checkpoint.name.replaceAll('_', ' ')),
		role: checkpoint.signingMethod ?? 'Lesser-provided signing material',
		status: signerStatusFromCheckpoint(checkpoint),
		note: checkpoint.message ?? checkpoint.hostRequestId ?? null,
	};
}

function signerStatusFromCheckpoint(checkpoint: SoulBootstrapSigningCheckpoint): SignatureCheckpointSigner['status'] {
	const normalized = normalizeText(checkpoint.status);
	if (includesAny(normalized, ['complete', 'completed', 'signed', 'verified', 'approved'])) return 'approved';
	if (includesAny(normalized, ['reject', 'failed', 'error', 'invalid'])) return 'rejected';
	return 'pending';
}

function firstCheckpointDate(checkpoints: readonly SoulBootstrapSigningCheckpoint[]): string | null {
	for (const checkpoint of checkpoints) {
		const value = checkpoint.issuedAt ?? checkpoint.declaredAt ?? checkpoint.completedAt;
		if (value) return value;
	}
	return null;
}

function pageHref(key: SoulBootstrapUxRouteKey, agentHint?: string | null): string {
	const path = key === 'identity'
		? '/identity'
		: key === 'genesis'
			? '/souls/genesis'
			: key === 'drones'
				? '/drones'
				: '/approvals';
	const trimmedAgent = agentHint?.trim();
	if (key === 'identity' && trimmedAgent) {
		return `${PUBLIC_APP_BASE_PATH}/identity/${encodeURIComponent(trimmedAgent)}`;
	}
	return `${PUBLIC_APP_BASE_PATH}${path}`;
}

function withBackendDetail(summary: string, detail?: string | null): string {
	const trimmed = detail?.trim();
	if (!trimmed) return summary;
	return `${summary} Latest Lesser response: ${trimmed}`;
}

function readErrorText(error: unknown): string {
	if (typeof error === 'string') return error;
	const record = asRecord(error);
	return typeof record.message === 'string' ? record.message : '';
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function looksUnsupportedContract(value: string): boolean {
	return includesAny(value, [
		'cannot query field soulbootstrap',
		'cannot query field',
		'unknown field soulbootstrap',
		'soulbootstrap is not defined',
		'unknown operation',
		'contract unsupported',
		'unsupported contract',
		'backend contract unsupported',
	]);
}

function normalizeText(value: string): string {
	return value.toLowerCase().replace(/[_\-"`]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function includesAny(value: string, terms: readonly string[]): boolean {
	return terms.some((term) => value.includes(term));
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
