const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'enabled']);

const rawHostWorkflowBridgeValue =
	typeof import.meta.env.VITE_SIMULACRUM_ENABLE_HOST_WORKFLOW_BRIDGE === 'string'
		? import.meta.env.VITE_SIMULACRUM_ENABLE_HOST_WORKFLOW_BRIDGE.trim().toLowerCase()
		: '';

export const HOST_WORKFLOW_BRIDGE_ENABLED = ENABLED_VALUES.has(rawHostWorkflowBridgeValue);

export const HOST_WORKFLOW_BRIDGE_DISABLED_NOTE =
	'Live lesser-host conversation and finalize actions are disabled in this install until the host workflow bridge is deliberately enabled.';
