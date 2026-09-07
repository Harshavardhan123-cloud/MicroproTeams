/**
 * Micropro Commute Web Push Service Worker
 * Handles background push notifications and OS notification click events.
 */

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', function (event) {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || 'Micropro Commute Notification';
    const options = {
      body: payload.body || '',
      icon: payload.icon || '/favicon.ico',
      badge: payload.badge || '/favicon.ico',
      tag: payload.notificationId || `push-${Date.now()}`,
      data: payload,
      requireInteraction: payload.priority === 'CRITICAL'
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('[ServiceWorker] Push notification parse error:', err);
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const data = event.notification.data || {};
  const conversationId = data.conversationId;
  const callId = data.callId;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // 1. If any window tab of our application is already open, focus it and dispatch tab/chat navigation!
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          return client.focus().then(function () {
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              conversationId: conversationId,
              callId: callId,
              data: data
            });
          });
        }
      }

      // 2. Only if NO app window/tab is open, open a single primary window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
