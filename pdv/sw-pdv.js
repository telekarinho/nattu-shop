const CACHE_NAME = 'pdv-v3';
const ASSETS = [
  '/pdv/',
  '/pdv/index.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // CDN resources: cache-first
  if (e.request.url.includes('cdn.jsdelivr.net') || e.request.url.includes('gstatic.com')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          const fetched = fetch(e.request).then(response => {
            cache.put(e.request, response.clone());
            return response;
          }).catch(() => cached);
          return cached || fetched;
        })
      )
    );
  } else {
    // HTML & JS: network-first (always get latest, fallback to cache)
    e.respondWith(
      fetch(e.request).then(response => {
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, response.clone()));
        return response;
      }).catch(() => caches.match(e.request).then(cached => cached || caches.match('/pdv/')))
    );
  }
});
