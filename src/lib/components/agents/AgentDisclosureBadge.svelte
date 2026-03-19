<script lang="ts">
	import { Badge } from '$lib/greater/primitives';
	import { formatAgentTypeLabel, type DisclosureActor } from './disclosure.js';

	interface Props {
		actor?: DisclosureActor | null;
		size?: 'sm' | 'md' | 'lg';
		label?: string;
		class?: string;
	}

	let { actor = null, size = 'sm', label = 'AI Agent', class: className = '' }: Props = $props();

	const isVisible = $derived(Boolean(actor?.isAgent));
	const verified = $derived(Boolean(actor?.agentInfo?.verified));
	const agentType = $derived(formatAgentTypeLabel(actor?.agentInfo?.agentType));
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
