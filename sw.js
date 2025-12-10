/* MST Workout Tracker - Service Worker */
const CACHE_NAME = "bolt-cache-v14"; // Bumped for Remove Button

// App shell & External Libraries
const CORE_ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "https://cdn.jsdelivr.net/npm/idb-keyval@6/dist/index-min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = req.url;

  // 1. Navigations (HTML)
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

  // 2. Program JSON
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

  // 3. Assets & Libraries
  if (isSameOrigin(url) || CORE_ASSETS.includes(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if(res.ok) {
             const copy = res.clone();
             caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        });
      })
    );
  }
});