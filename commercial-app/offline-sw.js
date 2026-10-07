/* H38 Office — offline field mode service worker.
   Conservative by design: caches ONLY same-origin GET responses for the app
   shell (scripts, styles, images, fonts, documents) after a successful load.
   API/Supabase traffic is never intercepted. If anything here misbehaves,
   bump CACHE to roll the whole cache forward. */
const CACHE = 'h38-office-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.add('./index.html')).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return; // API + CDNs: straight to network
  if (!url.pathname.includes('/commercial-app/')) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch (e) {
        const cached = await caches.match('./index.html');
        if (cached) return cached;
        throw e;
      }
    })());
    return;
  }

  const dest = req.destination;
  if (['script', 'style', 'image', 'font'].includes(dest)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) {
        fetch(req).then((fresh) => { if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {}); }).catch(() => {});
        return hit;
      }
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
      return fresh;
    })());
  }
});
