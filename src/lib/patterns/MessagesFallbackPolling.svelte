<script lang="ts">
	import { onDestroy } from 'svelte';

	import { getMessagesContext, type ConversationFolder } from '$lib/components/messaging';

	interface Props {
		intervalMs?: number;
	}

	let { intervalMs = 10_000 }: Props = $props();

	const { state, fetchConversations } = getMessagesContext();

	let polling = false;

	const poll = async () => {
		if (polling || state.realtimeStatus === 'connected') return;
		polling = true;

		try {
			const folder: ConversationFolder = state.folder ?? 'INBOX';

			await fetchConversations(folder, { preserveSelection: true, background: true });

			if (folder !== 'REQUESTS') {
				await fetchConversations('REQUESTS', { preserveSelection: true, background: true });
			}
		} finally {
			polling = false;
		}
	};

	let timer: ReturnType<typeof setInterval> | null = null;

	const stop = () => {
		if (!timer) return;
		clearInterval(timer);
		timer = null;
	};

	$effect(() => {
		stop();

		if (state.realtimeStatus === 'connected') return;

		void poll();
		timer = setInterval(() => {
			void poll();
		}, intervalMs);

		return stop;
	});

	onDestroy(stop);
</script>
