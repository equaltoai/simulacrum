<script lang="ts">
	import { getMessagesContext } from '$lib/components/messaging/context.svelte.js';

	interface Props {
		targetActorId?: string | null;
		onPendingChange?: (pending: boolean) => void;
		onError?: (message: string | null) => void;
		onResolved?: () => void;
	}

	let {
		targetActorId = null,
		onPendingChange,
		onError,
		onResolved,
	}: Props = $props();

	const context = getMessagesContext();
	let handledTarget = $state<string | null>(null);

	$effect(() => {
		const target = targetActorId?.trim() || null;
		if (!target || target === handledTarget) return;

		let cancelled = false;
		onPendingChange?.(true);
		onError?.(null);

		void (async () => {
			try {
				const conversation = await context.handlers.onCreateConversation?.([target]);
				if (!conversation) {
					throw new Error('Conversation creation returned no conversation.');
				}

				if (cancelled) return;
				await context.fetchConversations('INBOX', { preserveSelection: true });
				if (cancelled) return;
				await context.selectConversation(conversation);
				if (cancelled) return;

				handledTarget = target;
				onResolved?.();
			} catch (error) {
				if (cancelled) return;
				onError?.(error instanceof Error ? error.message : String(error));
			} finally {
				if (!cancelled) {
					onPendingChange?.(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	});
</script>
