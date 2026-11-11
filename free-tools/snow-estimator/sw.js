/* H38 Snow & Seasonal Estimator — Highway 38 Solutions service worker — offline copy of this tool page.
   Cache v20261111; bump on every release that changes the page or engine. */
const CACHE = 'h38-snow-estimator-v20261111';
const ASSETS = ['./', './index.html', '../field-tools.js', '../field-tools.css',
  './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './icon-maskable-512.png', './apple-touch-icon.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k.indexOf('h38-snow-estimator-') === 0 && k !== CACHE).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const ours = ASSETS.some((a) => url.pathname.endsWith(a.replace('./', '/')) || (a === './' && url.pathname.endsWith('/snow-estimator/')));
  if (!ours && url.pathname.indexOf('/free-tools/') === -1) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
