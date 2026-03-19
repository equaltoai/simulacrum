<script lang="ts">
	import { Badge } from '$lib/greater/primitives';

	type DisclosureActor = {
		isAgent?: boolean | null;
		agentInfo?: {
			agentType?: string | null;
			verified?: boolean | null;
		} | null;
	};

	interface Props {
		actor?: DisclosureActor | null;
		size?: 'sm' | 'md' | 'lg';
		label?: string;
		class?: string;
	}

	function formatAgentType(value?: string | null): string | null {
		const trimmed = value?.trim();
		if (!trimmed) return null;

		return trimmed
			.toLowerCase()
			.split('_')
			.map((segment) => (segment ? `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1)}` : ''))
			.join(' ');
	}

	let { actor = null, size = 'sm', label = 'AI Agent', class: className = '' }: Props = $props();

	const isVisible = $derived(Boolean(actor?.isAgent));
	const verified = $derived(Boolean(actor?.agentInfo?.verified));
	const agentType = $derived(formatAgentType(actor?.agentInfo?.agentType));
	const description = $derived.by(() => {
		if (agentType && verified) return `${agentType} • verified`;
		if (agentType) return agentType;
		if (verified) return 'Verified';
		return 'Agent-backed account';
	});
</script>

{#if isVisible}
	<Badge
		variant="pill"
		color={verified ? 'success' : 'primary'}
		{size}
		{label}
		{description}
		class={['agent-disclosure-badge', className].filter(Boolean).join(' ')}
	/>
{/if}
