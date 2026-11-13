// FitnessTrack service worker — lets the app open and show your last-loaded
// data without a connection. Set logging itself is handled by the client-side
// outbox (src/syncQueue.js), which works with or without this worker.
//
//   /assets/*          cache-first (Vite file names are content-hashed)
//   page navigations   network-first, falling back to the cached app shell
//   GET /api/*         network-first, falling back to the last good response
//                      (/auth/me is cached so the app knows who you are
//                      offline; other auth, admin, export and version are never
//                      cached; logging out deletes the API cache)
//   everything else    straight to the network

const SHELL  = 'ft-shell-v1';
const ASSETS = 'ft-assets';
const API    = 'ft-api';
const NEVER_CACHE = /^\/api\/(auth\/(?!me$)|admin|version|stats\/export)/;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => c.add('/')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys())
      if (k.startsWith('ft-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheName, cacheKey = request) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(cacheKey, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (NEVER_CACHE.test(url.pathname)) return;
    event.respondWith(networkFirst(request, API));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL, '/'));
  }
});
