<script lang="ts">
	import { base } from '$app/paths';
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import { toNotification } from '$lib/api/adapters';
	import { getStreamingAdapter } from '$lib/realtime/adapter';
	import ContentRenderer from '$lib/components/ContentRenderer.svelte';
	import { describeSoulEmailAddress } from '$lib/components/soul/email.js';
	import type { CommunicationInboundNotification, Notification, Status } from '$lib/types';

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

	function profileHref(acct: string) {
		return `${base}/profile/${encodeURIComponent(acct)}`;
	}

	function statusHref(id: string) {
		return `${base}/status/${encodeURIComponent(id)}`;
	}

	function reachabilityHref(query: string) {
		return `${base}/reachability?q=${encodeURIComponent(query)}`;
	}

	function getNotificationStatus(notification: Notification): Status | null {
		return 'status' in notification ? (notification.status as Status) : null;
	}

	function getCommunication(notification: Notification): CommunicationInboundNotification['communication'] | null {
		if (notification.type !== 'communication_inbound') return null;
		return (notification as CommunicationInboundNotification).communication ?? null;
	}

	function communicationEmailMeta(communication: CommunicationInboundNotification['communication']) {
		if (communication.channel.toLowerCase() !== 'email') return null;
		return describeSoulEmailAddress(communication.from.address);
	}

	function formatTimestamp(value: string | Date): string {
		const d = typeof value === 'string' ? new Date(value) : value;
		if (Number.isNaN(d.getTime())) return String(value);
		return d.toLocaleString();
	}

	function formatBytes(bytes: number): string {
		if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${Math.round(bytes / (1024 * 1024))} MB`;
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
			const next = items.filter((item) => item.id !== id);
			items = next;
			unreadCount = next.reduce((count, n) => count + (n.read ? 0 : 1), 0);
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
		realtimeError = null;

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
				const nextNotification = result.data?.notificationStream;
				if (!nextNotification) return;
				prependUnique(toNotification(nextNotification as unknown as Parameters<typeof toNotification>[0]));
			},
			error: (err) => {
				console.warn('Notification stream subscription failed:', err);
				realtimeError = 'Realtime notifications are currently unavailable.';
			},
		});

		return () => subscription.unsubscribe();
	});
</script>

<svelte:head>
	<title>Notifications • Simulacrum</title>
</svelte:head>

<section class="page">
	<h1>Notifications</h1>

	{#if !$authSession}
		<p>Sign in to load notifications.</p>
	{:else}
		{#if unreadCount > 0}
			<div class="page__notice notifications-header">
				<span><strong>{unreadCount}</strong> unread</span>
				<button
					type="button"
					class="gr-button gr-button--outline"
					onclick={handleMarkAllRead}
					disabled={isMutating}
				>
					Mark all as read
				</button>
			</div>
		{/if}

		{#if error}
			<div class="page__notice page__notice--error" role="alert">{error}</div>
		{/if}

		{#if realtimeError}
			<div class="page__notice">{realtimeError}</div>
		{/if}

		{#if isLoading}
			<div class="page__notice">Loading notifications…</div>
		{:else if items.length === 0}
			<div class="page__notice">No notifications yet.</div>
		{:else}
			<div class="notifications-list" role="feed" aria-label="Notifications">
				{#each items as notification (notification.id)}
					{@const maybeStatus = getNotificationStatus(notification)}
					{@const communication = getCommunication(notification)}
					<article class="notification-card" aria-label={`Notification: ${notification.type}`}>
						<header class="notification-card__meta">
							<div class="notification-card__byline">
								<span class="notification-card__type">{notification.type}</span>
								{#if communication}
									{@const emailMeta = communicationEmailMeta(communication)}
									<span class="notification-card__author">
										{communication.from.displayName || communication.from.address}
									</span>
									{#if communication.from.displayName && communication.from.address}
										<span class="notification-card__handle">{communication.from.address}</span>
									{/if}
									{#if emailMeta?.badgeLabel}
										<span
											class={`notification-card__badge notification-card__badge--${emailMeta.badgeColor}`}
											title={emailMeta.description ?? emailMeta.badgeLabel}
											>{emailMeta.badgeLabel}</span
										>
									{/if}
									{#if communication.from.soulAgentId}
										<a
											class="notification-card__handle"
											href={reachabilityHref(communication.from.soulAgentId)}
										>
											soul: {communication.from.soulAgentId}
										</a>
									{/if}
								{:else}
									<a class="notification-card__author" href={profileHref(notification.account.acct)}>
										{notification.account.displayName || notification.account.username}
									</a>
									<a class="notification-card__handle" href={profileHref(notification.account.acct)}>
										@{notification.account.acct}
									</a>
								{/if}
							</div>

							<div class="notification-card__actions">
								{#if communication?.from.soulAgentId}
									<a class="notification-card__link" href={reachabilityHref(communication.from.soulAgentId)}
										>Reachability</a
									>
								{/if}
								{#if maybeStatus}
									<a class="notification-card__link" href={statusHref(maybeStatus.id)}>Open</a>
								{/if}

								<button
									type="button"
									class="gr-button gr-button--outline"
									onclick={() => handleMarkRead(notification.id)}
									disabled={isMutating || notification.read}
								>
									{notification.read ? 'Read' : 'Mark read'}
								</button>
							</div>
						</header>

						{#if communication}
							<div class="notification-card__content">
								<p class="notification-card__comm-meta">
									<span class="notification-card__comm-channel">
										{communication.channel.toUpperCase()}
									</span>
									<span aria-hidden="true">·</span>
									<span class="notification-card__comm-time">
										{formatTimestamp(communication.receivedAt)}
									</span>
								</p>

								{#if communication.subject}
									<p class="notification-card__comm-subject">{communication.subject}</p>
								{/if}

								{#if communication.body}
									<pre class="notification-card__comm-body">{communication.body}</pre>
								{/if}

								{#if communication.attachments.length}
									<ul class="notification-card__comm-attachments" aria-label="Attachments">
										{#each communication.attachments as attachment (attachment.id)}
											<li class="notification-card__comm-attachment">
												<span class="notification-card__comm-attachment-name">
													{attachment.filename}
												</span>
												<span class="notification-card__comm-attachment-meta">
													{formatBytes(attachment.sizeBytes)} · {attachment.contentType}
												</span>
											</li>
										{/each}
									</ul>
								{/if}

								{#if communication.messageId || communication.threadId || communication.inReplyTo}
									<p class="notification-card__comm-thread">
										{#if communication.messageId}
											<span>message {communication.messageId}</span>
										{/if}
										{#if communication.threadId}
											<span>thread {communication.threadId}</span>
										{/if}
										{#if communication.inReplyTo}
											<span>in reply to {communication.inReplyTo}</span>
										{/if}
									</p>
								{/if}
							</div>
						{:else if maybeStatus}
							<ContentRenderer
								class="notification-card__content"
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
	{/if}
</section>

<style>
	.notification-card__badge {
		display: inline-block;
		border: 1px solid var(--gr-color-border, #d1d5db);
		border-radius: 999px;
		padding: 0.1rem 0.45rem;
		font-size: 0.75rem;
		color: var(--gr-color-text-muted, #6b7280);
	}

	.notification-card__badge--warning {
		border-color: var(--gr-color-warning-300, #fbbf24);
		color: var(--gr-color-warning-800, #92400e);
	}

	.notification-card__badge--primary {
		border-color: var(--gr-color-primary-300, #93c5fd);
		color: var(--gr-color-primary-800, #1e40af);
	}
</style>
