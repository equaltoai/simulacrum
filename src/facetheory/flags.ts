/**
 * The legacy browser-side Host workflow bridge is disabled.
 *
 * Provisioned Lesser instances already know their lesser-host control-plane
 * account and instance-trust key server-side. Simulacrum must not ask the
 * browser to store or present lesser-host control-plane credentials. Re-enable
 * hosted/off-chain bootstrap only after Lesser exposes the same-origin
 * instance-trust creation bridge tracked by equaltoai/lesser#1154,
 * lesser-host exposes the paired instance-key write contract tracked by
 * equaltoai/lesser-host#703, and Greater exposes the generated client
 * adapters for Simulacrum to consume that bridge.
 */
export const HOST_WORKFLOW_BRIDGE_ENABLED = false;

export const HOST_WORKFLOW_BRIDGE_DISABLED_NOTE =
	'Hosted/off-chain soul creation is waiting on the Lesser same-origin instance-trust creation bridge and matching Greater adapters. This provisioned instance keeps request, review, identity, and continuity live, but Simulacrum will not ask the browser for lesser-host control-plane credentials.';
