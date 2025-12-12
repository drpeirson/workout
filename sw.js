/* MST Workout Tracker - Service Worker */
const CACHE_NAME = "bolt-cache-v33"; // Bumped for Sanity Check

const CORE_ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  // "fun_facts.json", // Optional, handled dynamically
  "https://cdn.jsdelivr.net/npm/idb-keyval@6/dist/index-min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Try to cache fun_facts, but don't fail if missing
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
  
  // 1. Navigation
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./"))
    );
    return;
  }

  // 2. Program Data & Assets (Stale-While-Revalidate)
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => cached); // If offline, return cached
      return cached || fetchPromise;
    })
  );
});