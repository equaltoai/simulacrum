/**
 * The legacy browser-side Host workflow bridge is permanently disabled.
 *
 * Provisioned Lesser instances already know their lesser-host control-plane
 * account and instance-trust key server-side. Simulacrum must not ask the
 * browser to store or present lesser-host control-plane credentials. Project 44
 * M4.1 wires the Greater soul-bootstrap facade in `src/lib/api/soulBootstrap.ts`;
 * visible mint and signing controls remain parked for the M4.2/M4.3 UX work.
 */
export const HOST_WORKFLOW_BRIDGE_ENABLED = false;

export const HOST_WORKFLOW_BRIDGE_DISABLED_NOTE =
	'Hosted/off-chain soul creation now stays on the Lesser same-origin soul-bootstrap facade. This build vendors the Greater adapter boundary but keeps visible mint and signing controls parked for the M4.2/M4.3 UX work; Simulacrum will not ask the browser for lesser-host control-plane credentials.';
