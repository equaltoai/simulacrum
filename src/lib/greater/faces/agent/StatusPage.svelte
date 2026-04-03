<script lang="ts">
	import { untrack } from 'svelte';
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import StatusCard from '$lib/components/StatusCard.svelte';
	import { applySoulAvatarsToStatuses } from '$lib/greater/adapters/soul/avatarResolver.svelte';
	import { buildPublicStatusHref } from '$lib/publicRoutes';
	import type { Status } from '$lib/types';
	import AgentFaceFrame from './internal/AgentFaceFrame.svelte';
	import type { AgentFaceBaseData } from './types.js';

	interface Props {
		data: AgentFaceBaseData;
		statusId: string;
		class?: string;
	}

	let { data, statusId, class: className = '' }: Props = $props();

	let status = $state<Status | null>(null);
	let ancestors = $state<Status[]>([]);
	let descendants = $state<Status[]>([]);
	let isLoading = $state(false);
	let hasLoaded = $state(false);
	let error = $state<string | null>(null);

	function handleStatusClick(nextStatus: Status) {
		if (typeof window === 'undefined') return;
		window.location.assign(buildPublicStatusHref(nextStatus.id));
	}

	$effect(() => {
		const accessToken = $authSession?.accessToken ?? null;
		const id = statusId;
		void accessToken;

		return untrack(() => {
			status = null;
			ancestors = [];
			descendants = [];
			error = null;
			isLoading = false;
			hasLoaded = false;

			if (!id) {
				hasLoaded = true;
				return;
			}

			const controller = new AbortController();
			isLoading = true;

			void (async () => {
				try {
					const thread = await api.fetchThreadContext({ noteId: id, signal: controller.signal });
					if (!thread) {
						hasLoaded = true;
						return;
					}

					const [rootNotes, ancestorNotes, descendantNotes] = await Promise.all([
						applySoulAvatarsToStatuses([thread.rootNote]),
						applySoulAvatarsToStatuses(thread.ancestors),
						applySoulAvatarsToStatuses(thread.descendants),
					]);

					if (controller.signal.aborted) return;

					status = rootNotes[0] ?? thread.rootNote;
					ancestors = ancestorNotes;
					descendants = descendantNotes;
					hasLoaded = true;
				} catch (err) {
					if (err instanceof DOMException && err.name === 'AbortError') return;
					error = err instanceof Error ? err.message : String(err);
					hasLoaded = true;
				} finally {
					if (!controller.signal.aborted) {
						isLoading = false;
					}
				}
			})();

			return () => controller.abort();
		});
	});
</script>

<AgentFaceFrame
	hero={data.hero}
	brand={data.brand}
	navItems={data.navItems}
	actions={data.actions}
	statusChips={[]}
	metrics={[]}
	class={className}
>
	{#snippet children()}
		<div class="status-page">
			{#if error}
				<div class="status-page__notice status-page__notice--error" role="alert">{error}</div>
			{/if}

			{#if isLoading || !hasLoaded}
				<div class="status-page__notice">Loading post...</div>
			{:else if status}
				{#if ancestors.length}
					<div class="status-page__ancestors">
						{#each ancestors as ancestor (ancestor.id)}
							<StatusCard status={ancestor} density="compact" onclick={handleStatusClick} />
						{/each}
					</div>
				{/if}

				<div class="status-page__focus">
					<StatusCard status={status} onclick={handleStatusClick} />
				</div>

				{#if descendants.length}
					<div class="status-page__descendants">
						{#each descendants as descendant (descendant.id)}
							<StatusCard status={descendant} onclick={handleStatusClick} />
						{/each}
					</div>
				{/if}
			{:else if !isLoading}
				<div class="status-page__notice">Post not found.</div>
			{/if}
		</div>
	{/snippet}
</AgentFaceFrame>

<style>
	.status-page {
		display: grid;
		gap: 0;
		min-width: 0;
	}

	.status-page__ancestors {
		opacity: 0.75;
		border-left: 3px solid color-mix(in srgb, var(--gr-semantic-border-subtle) 50%, transparent 50%);
	}

	.status-page__focus {
		border-left: 3px solid var(--gr-color-primary-400, #e6a645);
	}

	.status-page__notice {
		padding: 1rem;
		border-radius: 0.75rem;
		background: rgba(255, 255, 255, 0.6);
		color: var(--gr-semantic-foreground-secondary);
	}

	.status-page__notice--error {
		background: color-mix(in srgb, var(--gr-color-error-100) 72%, white 28%);
		color: var(--gr-color-error-800);
	}
</style>
