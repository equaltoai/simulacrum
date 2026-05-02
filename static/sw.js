/* global self */

function defaultNotificationUrl() {
	return new URL('notifications', self.registration.scope).toString();
}

function safeNotificationUrl(value) {
	const fallback = defaultNotificationUrl();
	if (typeof value !== 'string' || !value.trim()) return fallback;

	try {
		const candidate = new URL(value, self.registration.scope);
		const scope = new URL(self.registration.scope);
		if (candidate.origin !== scope.origin) return fallback;
		if (candidate.protocol !== 'https:' && candidate.protocol !== 'http:') return fallback;
		if (!candidate.pathname.startsWith(scope.pathname)) return fallback;
		return candidate.toString();
	} catch {
		return fallback;
	}
}

self.addEventListener('push', (event) => {
	event.waitUntil(
		(async () => {
			let payload = {};

			if (event.data) {
				try {
					payload = event.data.json();
				} catch {
					try {
						payload = { body: await event.data.text() };
					} catch {
						payload = {};
					}
				}
			}

			const title = payload.title || 'Simulacrum';
			const options = {
				body: payload.body || 'You have a new notification.',
				data: payload.url ? { url: safeNotificationUrl(payload.url) } : {},
			};

			await self.registration.showNotification(title, options);
		})()
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const targetUrl = safeNotificationUrl(event.notification.data && event.notification.data.url);

	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
			for (const client of clientsArr) {
				if ('focus' in client) {
					client.focus();
					client.navigate(targetUrl);
					return;
				}
			}

			if (self.clients.openWindow) {
				return self.clients.openWindow(targetUrl);
			}
		})
	);
});
