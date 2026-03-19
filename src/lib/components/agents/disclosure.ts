export type DisclosureActor = {
	isAgent?: boolean | null;
	agentInfo?: {
		agentType?: string | null;
		verified?: boolean | null;
	} | null;
};

export function formatAgentTypeLabel(value?: string | null): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;

	return trimmed
		.toLowerCase()
		.split('_')
		.map((segment) => (segment ? `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1)}` : ''))
		.join(' ');
}
