<script lang="ts">
	import { page } from '$app/stores';

	import {
		getMessagesContext,
		type Conversation,
		type ConversationFolder,
		type MessagesHandlers,
	} from '$lib/components/messaging';

	type RouteMessagesHandlers = MessagesHandlers & {
		onFetchConversation?: (conversationId: string) => Promise<Conversation | null>;
	};

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
			found =
				(await (handlers as RouteMessagesHandlers).onFetchConversation?.(conversationId)) ??
				null;
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
