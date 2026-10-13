/* H38 Office — LEGACY offline field mode service worker: SELF-DESTRUCT STUB.
   The canonical worker is service-worker.js (registered by
   supabase-startup.js). This file used to register a second worker for the
   same scope and cache a competing shell. It now exists only so browsers
   that still hold the old registration receive an update that removes it:
   on activate it claims clients (so the canonical worker can take over on
   the next navigation), deletes the legacy h38-office-shell-* caches, and
   unregisters itself. There is deliberately NO fetch handler: with nothing
   intercepting, requests go straight to the network / canonical worker
   instead of being answered by a worker that is about to disappear. */
const CACHE = 'h38-office-shell-v2-20261011';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('h38-office-shell-') || k === CACHE).map((k) => caches.delete(k)));
    await self.registration.unregister();
  })());
});
