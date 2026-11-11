/* H38 Contractor Calc service worker — offline copy of the calculator page.
   Release: 2026-11-10 — nine concrete shapes + first web-app release
   (pairs with Android app v1.9). Bump the cache name on every release that
   changes the page; old caches are deleted on activate.
   Safety: this worker only ever answers requests for the Contractor Calc
   page and its web-app icons. Every other request is left to the network
   exactly as if the worker were not installed. */
const CACHE = 'h38-contractor-calc-v20261111';
const PAGE = './contractor-calc.html';
const ASSETS = [
  PAGE,
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isPage = url.pathname.endsWith('/contractor-calc.html');
  const isAsset = ASSETS.some((a) => a !== PAGE && url.pathname.endsWith(a.slice(1)));
  if (!isPage && !isAsset) return; // not ours — network default, untouched
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(PAGE))
    )
  );
});
