/* Wafers Please — minimal offline shell. App shell only; models stay network-first. */
const CACHE = 'wafers-please-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never cache GLBs / heavy models — pass through network explicitly
  // (bare `return` left some Chromium builds with XHR status 0).
  if (url.pathname.startsWith('/models/') || url.pathname === '/meshopt_decoder.js') {
    event.respondWith(fetch(event.request));
    return;
  }
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname === '/')) {
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'));
    }),
  );
});
