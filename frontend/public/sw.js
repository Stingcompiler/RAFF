// The shop's service worker. It keeps the app's own files (scripts, styles, icons) for a fast
// start and shows an offline page when a shop page cannot be reached. It never stores API
// replies or pages: prices and availability always come from the server.
const CACHE = "raff-store-v1";
const OFFLINE = "/offline";
const SHELL = [OFFLINE, "/pwa/icon-192.png"];
const SHOP_PAGES = /^\/(?:shop|store|cart|checkout|about|contact|orders|products|categories|policies)?(?:\/|$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate" && SHOP_PAGES.test(url.pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
  }
});
