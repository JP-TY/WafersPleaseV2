/* Wafers Please — minimal offline shell. Navigations are network-first; hashed assets stay cache-first. */
const CACHE = 'wafers-please-shell-v2';
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

  const isNavigation =
    event.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html';

  if (isNavigation) {
    // Network-first so returning users pick up new HTML/asset hashes.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then((hit) => hit || caches.match('/index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'));
    }),
  );
});
