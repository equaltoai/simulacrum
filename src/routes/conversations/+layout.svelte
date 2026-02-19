<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';

	import { authSession } from '$lib/auth/session';
	import { getStreamingAdapter } from '$lib/realtime/adapter';
	import { createLesserMessagesHandlers } from '$lib/greater/adapters';
	import * as Messages from '$lib/components/messaging';
	import type { MessagesHandlers } from '$lib/components/messaging';
	import MessagesFallbackPolling from '$lib/patterns/MessagesFallbackPolling.svelte';

	let { children } = $props<{ children?: Snippet }>();

	let handlers = $state<MessagesHandlers>({});
	let viewerId = $state<string | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		handlers = {};
		viewerId = null;
		error = null;

		if (!token) return;

		const adapter = getStreamingAdapter(token);
		if (!adapter) {
			error = 'GraphQL adapter unavailable.';
			return;
		}

		const baseHandlers = createLesserMessagesHandlers({ adapter }) as unknown as MessagesHandlers;
		const baseOnDeleteConversation = baseHandlers.onDeleteConversation;

		const nextHandlers: MessagesHandlers = {
			...baseHandlers,
			onConversationClick: (conversation) => {
				void goto(`${base}/conversations/${encodeURIComponent(conversation.id)}`);
			},
		};

		if (baseOnDeleteConversation) {
			nextHandlers.onDeleteConversation = async (conversationId) => {
				const ok = await baseOnDeleteConversation(conversationId);
				if (ok === false) return false;

				void goto(`${base}/conversations`);
				return ok;
			};
		}

		handlers = nextHandlers;

		void (async () => {
			try {
				const viewer = await adapter.verifyCredentials();
				viewerId = viewer.id;
			} catch (err) {
				error = err instanceof Error ? err.message : String(err);
			}
		})();
	});
</script>

{#if !$authSession}
	<section class="page">
		<h1>Conversations</h1>
		<p>Sign in to view conversations.</p>
	</section>
{:else}
	<section class="messages-page">
		<h1 class="sr-only">Conversations</h1>

		{#if error}
			<div class="page__notice page__notice--error" role="alert">{error}</div>
		{/if}

			<div class="messages-page__body">
				<Messages.Root {handlers}>
					<MessagesFallbackPolling />
					{#if children}
						{@render children()}
					{/if}

					<Messages.Conversations currentUserId={viewerId ?? 'me'} />

				<div class="messages-page__thread">
					<Messages.Thread currentUserId={viewerId ?? 'me'} />
					<Messages.Composer />
				</div>
			</Messages.Root>
		</div>
	</section>
{/if}
