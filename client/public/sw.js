// Enkel service worker: cachar app-skalet så appen startar snabbt.
// Data (Supabase) kräver nät — offline-kö är en steg 2-funktion.
const CACHE = "traningslogg-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // rör aldrig API-anrop eller annat som inte är GET på vår egen origin
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  // html: nätet först (så nya versioner kommer in), cache som fallback
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // statiska filer: cache först, nät som fallback (Vite hashar filnamnen)
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
    )
  );
});
