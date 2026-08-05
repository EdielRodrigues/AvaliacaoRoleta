const CACHE_NAME = 'passadoria-v38-confirmar-libera-reacao-auto';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './offline.html',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const item of APP_SHELL) {
        try { await cache.add(item); } catch (e) { console.warn('Não foi possível salvar no cache:', item, e); }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (url.hostname.includes('firebaseio.com') || url.hostname.includes('gstatic.com') || url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  const isAppFile = url.origin === self.location.origin && (url.pathname.endsWith('/') || /\.(html|js|css|json)$/.test(url.pathname));
  if (isAppFile) {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then(r => r || caches.match('./offline.html'))));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match('./offline.html'));
    })
  );
});
