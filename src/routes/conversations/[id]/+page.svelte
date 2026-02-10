<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authSession } from '$lib/auth/session';
	import { toAccount, toStatus } from '$lib/api/adapters';
	import { getStreamingAdapter } from '$lib/realtime/adapter';
	import TimelineVirtualizedReactive from '$lib/components/TimelineVirtualizedReactive.svelte';
	import type { Account, Status } from '$lib/types';

	type ConversationDetail = {
		id: string;
		unread: boolean;
		updatedAt: string;
		accounts: Account[];
		lastStatus?: Status;
	};

	let conversation = $state<ConversationDetail | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let isMutating = $state(false);

	function statusHref(id: string) {
		return `${base}/status/${encodeURIComponent(id)}`;
	}

	function mapConversation(input: unknown): ConversationDetail {
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

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		const id = $page.params.id;

		conversation = null;
		isLoading = false;
		error = null;
		isMutating = false;

		if (!token || !id) return;

		const adapter = getStreamingAdapter(token);
		if (!adapter) return;

		isLoading = true;

		void (async () => {
			try {
				const result = await adapter.getConversation(id);
				conversation = result ? mapConversation(result) : null;
			} catch (err) {
				error = err instanceof Error ? err.message : String(err);
			} finally {
				isLoading = false;
			}
		})();
	});

	async function handleMarkRead() {
		if (isMutating) return;
		if (!conversation) return;
		if (!conversation.unread) return;
		if (!$authSession?.accessToken) return;

		const adapter = getStreamingAdapter($authSession.accessToken);
		if (!adapter) return;

		isMutating = true;
		error = null;

		try {
			const updated = await adapter.markConversationAsRead(conversation.id);
			conversation = mapConversation(updated);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isMutating = false;
		}
	}

	async function handleDelete() {
		if (isMutating) return;
		if (!conversation) return;
		if (!$authSession?.accessToken) return;

		if (typeof window !== 'undefined') {
			const confirmed = window.confirm('Delete this conversation?');
			if (!confirmed) return;
		}

		const adapter = getStreamingAdapter($authSession.accessToken);
		if (!adapter) return;

		isMutating = true;
		error = null;

		try {
			const ok = await adapter.deleteConversation(conversation.id);
			if (ok) {
				await goto(`${base}/conversations`);
			} else {
				error = 'Failed to delete conversation.';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isMutating = false;
		}
	}
</script>

<svelte:head>
	<title>Conversation • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Conversation</h1>

	<p class="page__meta">
		<a href={`${base}/conversations`}>Back to conversations</a>
	</p>

	{#if !$authSession}
		<p>Sign in to view conversations.</p>
	{:else if isLoading}
		<div class="page__notice">Loading conversation…</div>
	{:else if error}
		<div class="page__notice page__notice--error" role="alert">{error}</div>
	{:else if !conversation}
		<div class="page__notice">Conversation not found.</div>
	{:else}
		<header class="page__notice conversation-detail">
			<div class="conversation-detail__participants">
				<strong>Participants</strong>
				<ul class="conversation-detail__list">
					{#each conversation.accounts as account (account.id)}
						<li>
							<span class="conversation-detail__name">{account.displayName || account.username}</span>
							<span class="conversation-detail__handle">@{account.acct}</span>
						</li>
					{/each}
				</ul>
			</div>

			<div class="conversation-detail__actions">
				<button
					type="button"
					class="gr-button gr-button--outline"
					onclick={handleMarkRead}
					disabled={isMutating || !conversation.unread}
				>
					{conversation.unread ? 'Mark read' : 'Read'}
				</button>
				<button
					type="button"
					class="gr-button gr-button--outline"
					onclick={handleDelete}
					disabled={isMutating}
				>
					Delete
				</button>
			</div>
		</header>

		{#if conversation.lastStatus}
			<div class="page__notice">
				<a href={statusHref(conversation.lastStatus.id)}>Open thread</a>
			</div>
			<TimelineVirtualizedReactive items={[conversation.lastStatus]} />
		{:else}
			<div class="page__notice">No messages yet.</div>
		{/if}
	{/if}
</section>

