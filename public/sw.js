// Lawstin service worker: keeps a copy of the app so it opens without a connection, shows
// notifications, and opens the app when one is tapped. The page itself is always fetched from
// the network first, so an online open gets the latest version; the copy is only a fallback.
const CACHE = "lawstin-shell-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("lawstin-shell-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()),
));

async function networkFirst(req, timeoutMs) {
  const cache = await caches.open(CACHE);
  try {
    const res = await (timeoutMs
      ? Promise.race([fetch(req), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))])
      : fetch(req));
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    if (hit) return hit;
    throw err;
  }
}

// Built files have a content hash in their name, so a cached copy never goes stale.
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone()).then(() => prune(cache));
  return res;
}

// Old builds' files pile up over deploys; keep only the most recent ones (oldest are listed first).
async function prune(cache) {
  const assets = (await cache.keys()).filter((r) => r.url.includes("/assets/"));
  await Promise.all(assets.slice(0, Math.max(0, assets.length - 60)).map((r) => cache.delete(r)));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (req.mode === "navigate") event.respondWith(networkFirst(req, 4000));
  else if (url.pathname.includes("/assets/")) event.respondWith(cacheFirst(req));
  else event.respondWith(networkFirst(req));
});

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
      // An open app gets the link (for example a question to answer) and comes to the front.
      for (const c of list) if (c.url.startsWith(self.registration.scope) && "focus" in c) { c.postMessage({ type: "open", url }); return c.focus(); }
      return self.clients.openWindow(url);
    }),
  );
});
