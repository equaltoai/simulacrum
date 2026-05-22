<script lang="ts">
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import { toNotification } from '$lib/api/adapters';
	import { getStreamingAdapter } from '$lib/realtime/adapter';
	import ContentRenderer from '$lib/components/ContentRenderer.svelte';
	import { describeSoulEmailAddress } from '$lib/components/soul/email.js';
	import type { CommunicationInboundNotification, Notification, Status } from '$lib/types';
	import AgentFaceFrame from '$lib/greater/faces/agent/internal/AgentFaceFrame.svelte';
	import type { AgentFaceBaseData } from '$lib/greater/faces/agent';

	interface Props {
		data: AgentFaceBaseData;
		class?: string;
	}

	let { data, class: className = '' }: Props = $props();

	let items = $state<Notification[]>([]);
	let unreadCount = $state(0);
	let isLoading = $state(false);
	let isMutating = $state(false);
	let error = $state<string | null>(null);
	let realtimeError = $state<string | null>(null);

	function prependUnique(notification: Notification) {
		items = [notification, ...items.filter((item) => item.id !== notification.id)].slice(0, 200);
		unreadCount = items.reduce((count, next) => count + (next.read ? 0 : 1), 0);
	}

	function getNotificationStatus(notification: Notification): Status | null {
		return 'status' in notification ? (notification.status as Status) : null;
	}

	function getCommunication(
		notification: Notification
	): CommunicationInboundNotification['communication'] | null {
		if (notification.type !== 'communication_inbound') return null;
		return (notification as CommunicationInboundNotification).communication ?? null;
	}

	function communicationEmailMeta(communication: CommunicationInboundNotification['communication']) {
		if (communication.channel.toLowerCase() !== 'email') return null;
		return describeSoulEmailAddress(communication.from.address, { context: 'observed-message' });
	}

	function formatTimestamp(value: string | Date): string {
		const d = typeof value === 'string' ? new Date(value) : value;
		if (Number.isNaN(d.getTime())) return String(value);
		return d.toLocaleString();
	}

	async function handleMarkAllRead() {
		if (isMutating) return;
		isMutating = true;
		error = null;
		try {
			await api.clearNotifications();
			items = [];
			unreadCount = 0;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isMutating = false;
		}
	}

	async function handleMarkRead(id: string) {
		if (isMutating) return;
		isMutating = true;
		error = null;
		try {
			await api.dismissNotification({ id });
			items = items.filter((item) => item.id !== id);
			unreadCount = items.reduce((count, n) => count + (n.read ? 0 : 1), 0);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isMutating = false;
		}
	}

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		items = [];
		unreadCount = 0;
		error = null;
		isLoading = false;

		if (!token) return;

		const controller = new AbortController();
		isLoading = true;

		void (async () => {
			try {
				const result = await api.fetchNotifications({ signal: controller.signal });
				items = result.items;
				unreadCount = result.unreadCount;
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				error = err instanceof Error ? err.message : String(err);
			} finally {
				isLoading = false;
			}
		})();

		return () => controller.abort();
	});

	$effect(() => {
		const token = $authSession?.accessToken ?? null;
		realtimeError = null;

		if (!token) return;

		const adapter = getStreamingAdapter(token);
		if (!adapter) return;

		const subscription = adapter.subscribeToNotificationStream().subscribe({
			next: (result) => {
				const next = result.data?.notificationStream;
				if (!next) return;
				prependUnique(
					toNotification(next as unknown as Parameters<typeof toNotification>[0])
				);
			},
			error: (err) => {
				console.warn('Notification stream subscription failed:', err);
				realtimeError = 'Realtime notifications are currently unavailable.';
			},
		});

		return () => subscription.unsubscribe();
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
		<div class="notifications-page">
			{#if unreadCount > 0}
				<div class="notifications-page__header">
					<span><strong>{unreadCount}</strong> unread</span>
					<button
						class="notifications-page__action"
						type="button"
						onclick={handleMarkAllRead}
						disabled={isMutating}
					>
						Mark all as read
					</button>
				</div>
			{/if}

			{#if error}
				<div class="notifications-page__notice notifications-page__notice--error" role="alert">
					{error}
				</div>
			{/if}

			{#if realtimeError}
				<div class="notifications-page__notice">{realtimeError}</div>
			{/if}

			{#if isLoading}
				<div class="notifications-page__notice">Loading notifications...</div>
			{:else if items.length === 0}
				<div class="notifications-page__notice">No notifications yet.</div>
			{:else}
				<div class="notifications-page__list" role="feed" aria-label="Notifications">
					{#each items as notification (notification.id)}
						{@const maybeStatus = getNotificationStatus(notification)}
						{@const communication = getCommunication(notification)}
						<article class="notifications-page__card">
							<header class="notifications-page__card-meta">
								<div class="notifications-page__card-byline">
									<span class="notifications-page__card-type">{notification.type}</span>
									{#if communication}
										{@const emailMeta = communicationEmailMeta(communication)}
										<span>{communication.from.displayName || communication.from.address}</span>
										{#if communication.from.displayName && communication.from.address}
											<small>{communication.from.address}</small>
										{/if}
										{#if emailMeta?.badgeLabel}
											<span
												class={`notifications-page__badge notifications-page__badge--${emailMeta.badgeColor}`}
												title={emailMeta.description ?? emailMeta.badgeLabel}
												>{emailMeta.badgeLabel}</span
											>
										{/if}
									{:else}
										<span>
											{notification.account.displayName || notification.account.username}
										</span>
										<small>@{notification.account.acct}</small>
									{/if}
								</div>
								<button
									class="notifications-page__action"
									type="button"
									onclick={() => handleMarkRead(notification.id)}
									disabled={isMutating || notification.read}
								>
									{notification.read ? 'Read' : 'Dismiss'}
								</button>
							</header>

							{#if communication}
								<div class="notifications-page__card-content">
									<p class="notifications-page__comm-meta">
										<span>{communication.channel.toUpperCase()}</span>
										<span>{formatTimestamp(communication.receivedAt)}</span>
									</p>
									{#if communication.subject}
										<p><strong>{communication.subject}</strong></p>
									{/if}
									{#if communication.body}
										<pre class="notifications-page__comm-body">{communication.body}</pre>
									{/if}
								</div>
							{:else if maybeStatus}
								<ContentRenderer
									class="notifications-page__card-content"
									content={maybeStatus.content}
									spoilerText={maybeStatus.spoilerText}
									mentions={maybeStatus.mentions ?? []}
									tags={maybeStatus.tags ?? []}
								/>
							{/if}
						</article>
					{/each}
				</div>
			{/if}
		</div>
	{/snippet}
</AgentFaceFrame>

<style>
	.notifications-page {
		display: grid;
		gap: 0.75rem;
		min-width: 0;
	}

	.notifications-page__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		background: rgba(255, 255, 255, 0.6);
	}

	.notifications-page__action {
		padding: 0.4rem 0.75rem;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--gr-semantic-border-subtle) 65%, white 35%);
		background: rgba(255, 255, 255, 0.8);
		font: inherit;
		font-size: 0.82rem;
		cursor: pointer;
	}

	.notifications-page__action:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.notifications-page__list {
		display: grid;
		gap: 0.5rem;
	}

	.notifications-page__card {
		display: grid;
		gap: 0.5rem;
		padding: 1rem;
		border-radius: 0.75rem;
		background: rgba(255, 255, 255, 0.6);
	}

	.notifications-page__card-meta {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.notifications-page__card-byline {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.4rem;
	}

	.notifications-page__card-type {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--gr-semantic-foreground-tertiary);
	}

	.notifications-page__card-byline small {
		color: var(--gr-semantic-foreground-secondary);
		overflow-wrap: anywhere;
	}

	.notifications-page__badge {
		display: inline-block;
		border: 1px solid var(--gr-color-border, #d1d5db);
		border-radius: 999px;
		padding: 0.1rem 0.45rem;
		font-size: 0.75rem;
		color: var(--gr-color-text-muted, #6b7280);
	}

	.notifications-page__badge--warning {
		border-color: var(--gr-color-warning-300, #fbbf24);
		color: var(--gr-color-warning-800, #92400e);
	}

	.notifications-page__badge--primary {
		border-color: var(--gr-color-primary-300, #93c5fd);
		color: var(--gr-color-primary-800, #1e40af);
	}

	.notifications-page__card-content,
	.notifications-page__card-content :global(p) {
		margin: 0;
		line-height: 1.55;
		color: var(--gr-semantic-foreground-secondary);
		overflow-wrap: anywhere;
	}

	.notifications-page__comm-meta {
		display: flex;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--gr-semantic-foreground-tertiary);
	}

	.notifications-page__comm-body {
		margin: 0;
		white-space: pre-wrap;
		font-family: inherit;
		font-size: 0.9rem;
	}

	.notifications-page__notice {
		padding: 1rem;
		border-radius: 0.75rem;
		background: rgba(255, 255, 255, 0.6);
		color: var(--gr-semantic-foreground-secondary);
	}

	.notifications-page__notice--error {
		background: color-mix(in srgb, var(--gr-color-error-100) 72%, white 28%);
		color: var(--gr-color-error-800);
	}
</style>
