// Service Worker — Push notifications + install prompt support
// Não faz cache do app-shell. Só push + click.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Nova notificação", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Povo que Batalha";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    image: data.image || undefined,
    tag: data.tag || "pqb-notif",
    renotify: true,
    requireInteraction: !!data.requireInteraction,
    vibrate: [200, 100, 200, 100, 400],
    data: {
      url: data.url || "/",
      notificationId: data.notificationId || null,
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try { await client.navigate(url); } catch {}
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
