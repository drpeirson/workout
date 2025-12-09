/* MST Workout Tracker - Service Worker */
const CACHE_NAME = "bolt-cache-v7";

// App shell (keep this small)
const CORE_ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())))
    ).then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  try { return new URL(url).origin === self.location.origin; } catch { return false; }
}

function isProgramJson(url) {
  try {
    const u = new URL(url);
    return u.origin === self.location.origin && u.pathname.includes("/data/") && u.pathname.endsWith(".json");
  } catch {
    return false;
  }
}

// Strategy:
// - Navigations: network-first (fresh HTML), fallback to cache
// - /data/*.json: stale-while-revalidate (fast + keeps updated)
// - Everything else (same-origin GET): cache-first, then network
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = req.url;

  // Navigations
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put("./", copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./"))
    );
    return;
  }

  // Program JSON
  if (isProgramJson(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Other same-origin assets
  if (isSameOrigin(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        });
      })
    );
  }
});
