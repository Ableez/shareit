/* Shareit service worker. Hand-rolled — no Workbox dependency. */
const CACHE = "shareit-v1";
const PRECACHE = ["/dashboard", "/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        await cache.addAll(PRECACHE);
      } catch {
        // network may be unavailable on first install
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/")) return;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const offline = await caches.match("/offline");
          if (offline) return offline;
        }
        return new Response("Offline", { status: 503 });
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Shareit", body: "", url: "/dashboard", tag: undefined };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  const options = {
    body: data.body,
    icon: data.icon || "/icon",
    badge: data.badge || "/icon",
    tag: data.tag,
    data: { url: data.url || "/dashboard" },
    requireInteraction: !!data.requireInteraction,
    actions: data.actions,
    vibrate: [100, 50, 100],
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) {
          try {
            await client.navigate(target);
            return client.focus();
          } catch {
            // fall through
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const reg = await self.registration;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return;
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON(), replace: true }),
          credentials: "include",
        });
      } catch {
        // best-effort; the server sweep will clean up dead subs
      }
    })(),
  );
});
