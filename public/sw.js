// Lawstin service worker: shows notifications and opens the app when one is tapped.
// It does not cache anything, so the app always loads its latest version.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Lawstin";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag,
      icon: "icon-192.png",
      badge: "icon-192.png",
      data: { url: data.url || self.registration.scope },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.startsWith(self.registration.scope) && "focus" in c) return c.focus();
      return self.clients.openWindow(url);
    }),
  );
});
