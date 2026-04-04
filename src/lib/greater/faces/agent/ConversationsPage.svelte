<script lang="ts">
	import { onMount } from 'svelte';

	import { authSession } from '$lib/auth/session';
	import * as Messages from '$lib/components/messaging';
	import type { MessagesHandlers } from '$lib/components/messaging';
	import { createLesserMessagesHandlers } from '$lib/greater/adapters';
	import MessagesFallbackPolling from '$lib/patterns/MessagesFallbackPolling.svelte';
	import { PUBLIC_APP_BASE_PATH } from '$lib/publicRoutes';
	import { getStreamingAdapter } from '$lib/realtime/adapter';

	import AgentFaceFrame from './internal/AgentFaceFrame.svelte';
	import ConversationRouteBootstrap from './internal/ConversationRouteBootstrap.svelte';
	import type { AgentFaceBaseData } from './types.js';

	interface Props {
		data: AgentFaceBaseData;
		composeActorId?: string | null;
		class?: string;
	}

	let { data, composeActorId = null, class: className = '' }: Props = $props();

	let handlers = $state<MessagesHandlers | null>(null);
	let viewerId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let initializing = $state(false);
	let composeBusy = $state(false);
	let composeError = $state<string | null>(null);
	let hydrated = $state(false);
	const hasSession = $derived(Boolean($authSession?.accessToken));
	const handlersReady = $derived(
		Boolean(
			handlers?.onFetchConversations &&
				handlers?.onFetchMessages &&
				handlers?.onCreateConversation &&
				handlers?.onSearchParticipants &&
				viewerId
		)
	);

	onMount(() => {
		hydrated = true;
	});

	function clearComposeIntent() {
		if (typeof window === 'undefined' || !composeActorId) return;
		composeActorId = null;
		window.history.replaceState(window.history.state, '', `${PUBLIC_APP_BASE_PATH}/conversations`);
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		handlers = null;
		viewerId = null;
		error = null;
		composeError = null;
		initializing = false;

		if (!token) return;

		const adapter = getStreamingAdapter(token);
		if (!adapter) {
			error = 'GraphQL adapter unavailable.';
			return;
		}

		let cancelled = false;
		initializing = true;

			void (async () => {
				try {
					const viewer = await adapter.verifyCredentials();
					if (cancelled) return;

					viewerId = viewer.id;
				handlers = createLesserMessagesHandlers({ adapter }) as MessagesHandlers;
			} catch (err) {
				if (cancelled) return;
				error = err instanceof Error ? err.message : String(err);
			} finally {
				if (!cancelled) {
					initializing = false;
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	});
</script>

<AgentFaceFrame
	hero={data.hero}
	brand={data.brand}
	navItems={data.navItems}
	actions={data.actions}
	statusChips={data.statusChips}
	metrics={data.metrics}
	class={className}
>
	{#snippet children()}
		<div class="conversations-page">
			{#if error}
				<div class="conversations-page__notice conversations-page__notice--error" role="alert">
					{error}
				</div>
			{/if}

			{#if composeError}
				<div class="conversations-page__notice conversations-page__notice--error" role="alert">
					{composeError}
				</div>
			{/if}

			{#if composeBusy}
				<div class="conversations-page__notice" role="status" aria-busy="true">
					Preparing direct message…
				</div>
			{/if}

			{#if hydrated && hasSession && handlersReady && handlers}
				<Messages.Root handlers={handlers}>
					<MessagesFallbackPolling />
					<ConversationRouteBootstrap
						targetActorId={composeActorId}
						onPendingChange={(pending) => {
							composeBusy = pending;
						}}
						onError={(message) => {
							composeError = message;
						}}
						onResolved={clearComposeIntent}
					/>
					<Messages.NewConversation />
					<Messages.Conversations currentUserId={viewerId ?? undefined} />

					<div class="conversations-page__thread">
						<Messages.Thread currentUserId={viewerId ?? undefined} />
						<Messages.Composer />
					</div>
				</Messages.Root>
			{:else if hydrated && hasSession && initializing}
				<div class="conversations-page__notice" role="status" aria-busy="true">
					Loading live conversations…
				</div>
			{:else if hydrated && hasSession && !error}
				<div class="conversations-page__notice" role="status">
					Messages are waiting for live session data.
				</div>
			{:else if hydrated}
				<div class="conversations-page__notice" role="status">
					Sign in to load live conversations.
				</div>
			{:else}
				<div class="conversations-page__notice" role="status" aria-busy="true">
					Loading conversations…
				</div>
			{/if}
		</div>
	{/snippet}
</AgentFaceFrame>

<style>
	.conversations-page {
		display: grid;
		gap: 0.75rem;
		min-width: 0;
		min-height: 60vh;
	}

	.conversations-page__thread {
		display: grid;
		gap: 0.5rem;
		min-height: 0;
	}

	.conversations-page__notice {
		padding: 1rem;
		border-radius: 0.75rem;
		background: rgba(255, 255, 255, 0.6);
		color: var(--gr-semantic-foreground-secondary);
	}

	.conversations-page__notice--error {
		background: color-mix(in srgb, var(--gr-color-error-100) 72%, white 28%);
		color: var(--gr-color-error-800);
	}
</style>
