// Bump CACHE_VERSION whenever shell files change so updates roll cleanly.
const CACHE_VERSION = 'v0.3.3';
const CACHE_NAME = `gratitude-shell-${CACHE_VERSION}`;

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './sync.js',
  './manifest.json',
  './icons/icon.svg',
  './assets/vendor/dexie.min.js',
  './assets/fonts/fonts.css',
  './assets/fonts/caveat-latin.woff2',
  './assets/fonts/caveat-latin-ext.woff2',
  './assets/fonts/figtree-latin.woff2',
  './assets/fonts/figtree-latin-ext.woff2',
  './assets/heroes/springhero.jpg',
  './assets/heroes/earlysummerhero.jpg',
  './assets/heroes/latesummerhero.jpg',
  './assets/heroes/autumnhero.jpg',
  './assets/heroes/adventhero.jpg',
  './assets/heroes/winterhero.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Network-first with cache fallback. Updates land on the next online refresh; offline,
// requests fall back to the cached shell so the app stays usable.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
  );
});
