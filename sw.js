/* MST Workout Tracker - Service Worker */
const CACHE_NAME = "bolt-cache-v38"; // Bumped for Scope Fix

const CORE_ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "https://cdn.jsdelivr.net/npm/idb-keyval@6/dist/index-min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://cdn.jsdelivr.net/npm/chart.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        cache.add("fun_facts.json").catch(() => {});
        return cache.addAll(CORE_ASSETS);
      })
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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((res) => {
        caches.open(CACHE_NAME).then((c) => c.put(req, res.clone())).catch(()=>{});
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
