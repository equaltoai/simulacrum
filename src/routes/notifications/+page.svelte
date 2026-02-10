<script lang="ts">
	import { base } from '$app/paths';
	import { api } from '$lib/api';
	import { authSession } from '$lib/auth/session';
	import { toNotification } from '$lib/api/adapters';
	import { getStreamingAdapter } from '$lib/realtime/adapter';
	import ContentRenderer from '$lib/components/ContentRenderer.svelte';
	import type { Notification, Status } from '$lib/types';

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

	function getNotificationStatus(notification: Notification): Status | null {
		return 'status' in notification ? (notification.status as Status) : null;
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
					<article class="notification-card" aria-label={`Notification: ${notification.type}`}>
						<header class="notification-card__meta">
							<div class="notification-card__byline">
								<span class="notification-card__type">{notification.type}</span>
								<a class="notification-card__author" href={profileHref(notification.account.acct)}>
									{notification.account.displayName || notification.account.username}
								</a>
								<a class="notification-card__handle" href={profileHref(notification.account.acct)}>
									@{notification.account.acct}
								</a>
							</div>

							<div class="notification-card__actions">
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

						{#if maybeStatus}
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
