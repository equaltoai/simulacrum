<script lang="ts">
	import type { Poll } from '$lib/types';

	interface Props {
		poll: Poll;
		class?: string;
	}

	let { poll, class: className = '' }: Props = $props();

	const resultsHidden = $derived(Boolean(poll.hideTotals) && !poll.voted && !poll.expired);

	function percent(votes: number, total: number): number {
		if (!total || total <= 0) return 0;
		return Math.round((votes / total) * 100);
	}

	function formatExpiresAt(value?: string | Date): string | null {
		if (!value) return null;
		const date = typeof value === 'string' ? new Date(value) : value;
		if (!Number.isFinite(date.getTime())) return null;
		return date.toLocaleString();
	}
</script>

<section class={`poll-card ${className}`} aria-label="Poll">
	<ul class="poll-card__options">
		{#each poll.options as option, index (option.title + '-' + index)}
			{@const votes = option.votesCount ?? 0}
			{@const total = poll.votersCount ?? poll.votesCount ?? 0}
			{@const pct = percent(votes, total)}

			<li class="poll-card__option">
				<div class="poll-card__row">
					<span class="poll-card__title">{option.title}</span>
					{#if !resultsHidden}
						<span class="poll-card__meta">
							{votes} ({pct}%)
						</span>
					{/if}
				</div>
				{#if !resultsHidden}
					<progress
						class="poll-card__progress"
						value={votes}
						max={Math.max(1, total)}
						aria-label={`${pct}%`}
					>
						{pct}%
					</progress>
				{/if}
			</li>
		{/each}
	</ul>

	<div class="poll-card__footer">
		<span>{poll.votersCount ?? poll.votesCount} votes</span>
		{#if poll.expired}
			<span>Ended</span>
		{:else}
			{@const expiresAt = formatExpiresAt(poll.expiresAt)}
			{#if expiresAt}
				<span>Ends {expiresAt}</span>
			{/if}
		{/if}
	</div>
</section>

<style>
	.poll-card {
		display: flex;
		flex-direction: column;
		gap: var(--gr-spacing-scale-3);
		padding: var(--gr-spacing-scale-4);
		border-radius: var(--gr-radii-xl);
		border: 1px solid var(--gr-semantic-border-default);
		background: var(--gr-semantic-background-secondary);
	}

	.poll-card__options {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--gr-spacing-scale-3);
	}

	.poll-card__row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--gr-spacing-scale-3);
	}

	.poll-card__title {
		color: var(--gr-semantic-foreground-primary);
	}

	.poll-card__meta,
	.poll-card__footer {
		color: var(--gr-semantic-foreground-secondary);
		font-size: var(--gr-typography-fontSize-sm);
	}

	.poll-card__progress {
		margin-top: var(--gr-spacing-scale-2);
		width: 100%;
		height: 0.75rem;
	}

	.poll-card__footer {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gr-spacing-scale-3);
		justify-content: space-between;
	}
</style>
