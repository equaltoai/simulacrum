/* global self */

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
				data: payload.url ? { url: payload.url } : {},
			};

			await self.registration.showNotification(title, options);
		})()
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const targetUrl =
		(event.notification.data && event.notification.data.url) ||
		new URL('notifications', self.registration.scope).toString();

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
