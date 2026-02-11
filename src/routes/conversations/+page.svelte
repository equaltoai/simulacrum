<script lang="ts">
	import { base } from '$app/paths';
	import { authSession } from '$lib/auth/session';
	import { toAccount, toStatus } from '$lib/api/adapters';
	import { getStreamingAdapter } from '$lib/realtime/adapter';
	import ContentRenderer from '$lib/components/ContentRenderer.svelte';
	import type { Account, Status } from '$lib/types';

	type ConversationItem = {
		id: string;
		unread: boolean;
		updatedAt: string;
		accounts: Account[];
		lastStatus?: Status;
	};

	let items = $state<ConversationItem[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let realtimeError = $state<string | null>(null);

	function conversationHref(id: string) {
		return `${base}/conversations/${encodeURIComponent(id)}`;
	}

	function labelFor(accounts: Account[]) {
		if (accounts.length === 0) return 'Direct message';
		const names = accounts
			.map((a) => a.displayName || a.username)
			.filter(Boolean)
			.slice(0, 3);
		const suffix = accounts.length > names.length ? ` +${accounts.length - names.length}` : '';
		return `${names.join(', ')}${suffix}`;
	}

	function mapConversation(input: unknown): ConversationItem {
		const record = input as {
			id: string;
			unread: boolean;
			updatedAt: string;
			accounts: Array<Parameters<typeof toAccount>[0]>;
			lastStatus?: Parameters<typeof toStatus>[0] | null;
		};

		return {
			id: record.id,
			unread: record.unread,
			updatedAt: record.updatedAt,
			accounts: record.accounts.map((actor) => toAccount(actor)),
			lastStatus: record.lastStatus ? toStatus(record.lastStatus) : undefined,
		};
	}

	function upsertConversation(next: ConversationItem) {
		items = [next, ...items.filter((item) => item.id !== next.id)]
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 100);
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;

		items = [];
		isLoading = false;
		error = null;
		realtimeError = null;

		if (!token) return;

		const adapter = getStreamingAdapter(token);
		if (!adapter) return;

		isLoading = true;

		void (async () => {
			try {
				const conversations = await adapter.getConversations({ first: 50 });
				items = conversations.map(mapConversation).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
			} catch (err) {
				error = err instanceof Error ? err.message : String(err);
			} finally {
				isLoading = false;
			}
		})();
	});

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		realtimeError = null;

		if (!token) return;

		const adapter = getStreamingAdapter(token);
		if (!adapter) return;

		const subscription = adapter.subscribeToConversationUpdates().subscribe({
			next: (result) => {
				const nextConversation = result.data?.conversationUpdates;
				if (!nextConversation) return;
				upsertConversation(mapConversation(nextConversation));
			},
			error: (err) => {
				console.warn('Conversation updates subscription failed:', err);
				realtimeError = 'Realtime updates are currently unavailable.';
			},
		});

		return () => subscription.unsubscribe();
	});
</script>

<svelte:head>
	<title>Conversations • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Conversations</h1>

	{#if !$authSession}
		<p>Sign in to view conversations.</p>
	{:else}
		{#if error}
			<div class="page__notice page__notice--error" role="alert">{error}</div>
		{/if}

		{#if realtimeError}
			<div class="page__notice">{realtimeError}</div>
		{/if}

		{#if isLoading}
			<div class="page__notice">Loading conversations…</div>
		{:else if items.length === 0}
			<div class="page__notice">No conversations yet.</div>
		{:else}
			<div class="conversations" role="list" aria-label="Direct message conversations">
				{#each items as convo (convo.id)}
					<a class={`conversation-card ${convo.unread ? 'is-unread' : ''}`} href={conversationHref(convo.id)}>
						<div class="conversation-card__meta">
							<strong>{labelFor(convo.accounts)}</strong>
							{#if convo.unread}
								<span class="conversation-card__badge" aria-label="Unread">Unread</span>
							{/if}
						</div>

						{#if convo.lastStatus}
							<ContentRenderer
								class="conversation-card__preview"
								content={convo.lastStatus.content}
								spoilerText={convo.lastStatus.spoilerText}
								mentions={convo.lastStatus.mentions ?? []}
								tags={convo.lastStatus.tags ?? []}
								collapsed
							/>
						{:else}
							<div class="conversation-card__preview">No messages yet.</div>
						{/if}
					</a>
				{/each}
			</div>
		{/if}
	{/if}
</section>

