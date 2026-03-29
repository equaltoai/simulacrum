function normalizeBooleanEnv(value: string | undefined): boolean {
	if (!value) return false;

	switch (value.trim().toLowerCase()) {
		case '1':
		case 'true':
		case 'yes':
		case 'on':
			return true;
		default:
			return false;
	}
}

export const HOST_WORKFLOW_BRIDGE_ENABLED = normalizeBooleanEnv(
	import.meta.env.VITE_SIMULACRUM_ENABLE_HOST_WORKFLOW_BRIDGE
);

export const HOST_WORKFLOW_BRIDGE_DISABLED_NOTE =
	'This build keeps the lesser-host control-plane bridge disabled. Request, review, identity, and continuity stay live, while mint conversation and finalize remain deliberately gated until the bridge is enabled.';
