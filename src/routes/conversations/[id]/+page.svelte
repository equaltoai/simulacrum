<script lang="ts">
	import { page } from '$app/stores';

	import { getMessagesContext, type ConversationFolder } from '$lib/components/messaging';

	const { state, handlers, fetchConversations, selectConversation } = getMessagesContext();

	async function ensureSelected(conversationId: string) {
		if (state.selectedConversation?.id === conversationId) return;

		const existing = state.conversations.find((c) => c.id === conversationId);
		if (existing) {
			await selectConversation(existing);
			return;
		}

		const tryFolder = async (folder: ConversationFolder) => {
			await fetchConversations(folder, { preserveSelection: true });
			return state.conversations.find((c) => c.id === conversationId) ?? null;
		};

		const currentFolder: ConversationFolder = state.folder ?? 'INBOX';

		let found = await tryFolder(currentFolder);
		if (!found) {
			const other: ConversationFolder = currentFolder === 'INBOX' ? 'REQUESTS' : 'INBOX';
			found = await tryFolder(other);
		}

		if (!found) {
			found = (await handlers.onFetchConversation?.(conversationId)) ?? null;
		}

		if (found) {
			await selectConversation(found);
		}
	}

	$effect(() => {
		const id = $page.params.id;
		if (!id) return;
		void ensureSelected(id);
	});
</script>

<svelte:head>
	<title>Conversation • Simulacrum</title>
</svelte:head>
