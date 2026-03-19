<script lang="ts">
	import type { AgentAttribution } from '$lib/types';
	import AgentDisclosureBadge from './AgentDisclosureBadge.svelte';

	type DisclosureActor = {
		isAgent?: boolean | null;
		agentInfo?: {
			agentType?: string | null;
			verified?: boolean | null;
		} | null;
	};

	interface Props {
		actor?: DisclosureActor | null;
		attribution?: AgentAttribution | null;
		context?: 'account' | 'post' | 'conversation';
		title?: string;
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

	let {
		actor = null,
		attribution = null,
		context = 'account',
		title = 'AI disclosure',
		class: className = '',
	}: Props = $props();

	const isVisible = $derived(Boolean(actor?.isAgent || attribution));
	const agentType = $derived(formatAgentType(actor?.agentInfo?.agentType));
	const summary = $derived.by(() => {
		if (context === 'conversation') {
			return 'You are interacting with an AI agent account in this conversation.';
		}

		if (context === 'post') {
			return 'This post is from an AI agent account.';
		}

		return 'This account is operated by an AI agent.';
	});
	const details = $derived.by(() => {
		const values: string[] = [];
		if (agentType) values.push(`${agentType} agent`);
		if (actor?.agentInfo?.verified) values.push('verified');
		if (attribution?.triggerType?.trim()) values.push(`trigger ${attribution.triggerType.trim()}`);
		if (attribution?.delegatedBy?.trim()) values.push(`delegated by ${attribution.delegatedBy.trim()}`);
		if (attribution?.modelId?.trim()) values.push(`model ${attribution.modelId.trim()}`);
		return values;
	});
</script>

{#if isVisible}
	<aside class={['agent-disclosure-notice', className].filter(Boolean).join(' ')} aria-label={title}>
		<div class="agent-disclosure-notice__header">
			<div>
				<p class="agent-disclosure-notice__eyebrow">{title}</p>
				<p class="agent-disclosure-notice__copy">{summary}</p>
			</div>
			<AgentDisclosureBadge {actor} />
		</div>

		{#if details.length > 0}
			<p class="agent-disclosure-notice__meta">{details.join(' • ')}</p>
		{/if}
	</aside>
{/if}

<style>
	.agent-disclosure-notice {
		display: flex;
		flex-direction: column;
		gap: var(--gr-spacing-scale-2);
		padding: var(--gr-spacing-scale-3) var(--gr-spacing-scale-4);
		border-radius: var(--gr-radii-lg);
		border: 1px solid color-mix(in srgb, var(--gr-color-brand-500) 24%, transparent);
		background: color-mix(in srgb, var(--gr-color-brand-500) 8%, var(--gr-semantic-background-base));
	}

	.agent-disclosure-notice__header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--gr-spacing-scale-3);
	}

	.agent-disclosure-notice__eyebrow,
	.agent-disclosure-notice__copy,
	.agent-disclosure-notice__meta {
		margin: 0;
	}

	.agent-disclosure-notice__eyebrow {
		font-size: var(--gr-typography-fontSize-sm);
		font-weight: var(--gr-typography-fontWeight-medium);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--gr-semantic-foreground-secondary);
	}

	.agent-disclosure-notice__copy {
		margin-top: var(--gr-spacing-scale-1);
	}

	.agent-disclosure-notice__meta {
		font-size: var(--gr-typography-fontSize-sm);
		color: var(--gr-semantic-foreground-secondary);
	}

	@media (max-width: 640px) {
		.agent-disclosure-notice__header {
			flex-direction: column;
		}
	}
</style>
