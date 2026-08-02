// Service Worker for push notifications
self.addEventListener("push", event => {
  const data = event.data?.json() || {};
  const options = {
    body: data.message || "New notification",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: data.id || "notification",
    requireInteraction: data.requireInteraction || false,
    data: {
      url: data.actionUrl || "/",
      ...data.metadata,
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "OSIRIS", options)
  );
});

// Handle notification click
self.addEventListener("notificationclick", event => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(clientList => {
        // Check if there's already a window/tab open with the target URL
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url === urlToOpen && "focus" in client) {
            return client.focus();
          }
        }
        // If not, open a new window/tab with the target URL
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle notification close
self.addEventListener("notificationclose", event => {
  // Optional: track notification dismissals
  console.log("Notification closed:", event.notification.tag);
});
