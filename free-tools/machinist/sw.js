/* H38 Quick Calc service worker — full offline after first load. */
const CACHE = 'h38-quickcalc-v7';  // v7: Welding screen — fillet throat & heat input calculators, MIG starting points, TIG rule-of-thumb amps, AWS A5.1 electrode decoder + common electrodes, AWS A2.4 weld symbols (2026-10-27). v6: RPM quick chart, NPT dimensions (ASME B1.20.1), keyway & keyseat chart (ASME B17.1), AS568 O-ring chart, center drill chart (2026-10-27). v5: gears & taper, SFM chart, NPT drills, metric pitches, ISO fits, insert decoder, metric screw tables (2026-10-27). v4: G & M code quick reference + socket-head screw table (2026-10-27). v3: polish pass — grid input alignment, Drill & Tap tile icon, density label wrap
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './calc.js', './data.js',
  './manifest.webmanifest', './logo.png',
  './icon-192.png', './icon-512.png', './icon-maskable-192.png', './icon-maskable-512.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
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
