#!/usr/bin/env node
/* Self-update mechanism verifier (2026-10-13).
 * Rick's rule (2026-10-11, recurred 2026-10-13): customers must never clear
 * cache/history to receive a fix. The Office heals stuck clients through
 * commercial-app/version.json + the inline startup version check in
 * index.html. That mechanism silently died once already: version.json froze
 * at 20261012-usability-audit-fixes-1 while ~10 builds rolled the SW
 * CACHE_NAME stamp, so the check saw "no change" forever and shipped UI
 * (card-top bands) never reached an installed client. This verifier pins the
 * whole chain so the next build stamp roll cannot drift away from
 * version.json again:
 *   1. version.json parses and carries a version stamp + deployed time.
 *   2. The SW CACHE_NAME is exactly 'h38-business-office-' + version.json's
 *      version (one build stamp, two readers, zero drift).
 *   3. version.json is in the SW LIVE_FIRST set — otherwise the SW answers
 *      the timestamped version probe from its cache (ignoreSearch match)
 *      and the check can never see a new version.
 *   4. The auto-update check stays the FIRST script in index.html <head>,
 *      inline (never deferred), and still carries the load-time check, the
 *      foreground re-check (pageshow + visibilitychange), the _refresh
 *      cache-busting reload via location.replace, and the per-session heal
 *      marker that caps it at one reload per version (no loop).
 *   5. The SW precache can never silently kill the install again (the
 *      2026-10-13 round-2 root cause, proven in Chromium): SHELL carried
 *      duplicate './job-lifecycle.css', './personal-assistant.css' and
 *      './office-polish.css' entries since ~2026-09-30, and the install
 *      handler's single atomic cache.addAll(SHELL) rejects the WHOLE batch
 *      on a duplicate — so the canonical worker never activated on any
 *      Chromium client, the #1328 heal had no worker to land on, and only
 *      the legacy offline-sw (stale-while-revalidate) kept serving old
 *      app files. SHELL must have no duplicate entries, every entry must
 *      exist on disk, and the install handler must dedupe + cache entries
 *      independently instead of one atomic addAll over the raw list. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log('PASS  ' + label); }
  else { failures.push(label); console.log('FAIL  ' + label + (detail ? ' — ' + detail : '')); }
}

/* ---- version.json ---- */
let manifest = null;
try { manifest = JSON.parse(read('commercial-app/version.json')); } catch (e) { /* handled below */ }
check('version.json parses as JSON', !!manifest);
const version = manifest && typeof manifest.version === 'string' ? manifest.version.trim() : '';
check('version.json carries a non-empty version stamp', version.length >= 8, JSON.stringify(manifest));
check('version.json carries a deployed timestamp', !!(manifest && typeof manifest.deployed === 'string' && manifest.deployed.length >= 10));

/* ---- service worker lockstep ---- */
const sw = read('commercial-app/service-worker.js');
check('SW CACHE_NAME is exactly h38-business-office- + version.json version',
  version !== '' && sw.includes("const CACHE_NAME='h38-business-office-" + version + "';"),
  'version.json version=' + version);
const liveFirstMatch = sw.match(/const LIVE_FIRST=new Set\(\[([^\]]*)\]\)/);
check('SW LIVE_FIRST includes version.json (version probe is never cache-served)',
  !!liveFirstMatch && liveFirstMatch[1].includes("'version.json'"));

/* ---- precache integrity: an uninstallable worker heals nobody ---- */
const shellMatch = sw.match(/const SHELL=\[([\s\S]*?)\];/);
const shellEntries = shellMatch ? [...shellMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : [];
check('SW SHELL precache list is parseable and non-trivial', shellEntries.length >= 100,
  'entries=' + shellEntries.length);
const seenShell = new Set();
const dupeShell = [];
for (const entry of shellEntries) { if (seenShell.has(entry)) dupeShell.push(entry); seenShell.add(entry); }
check('SW SHELL has no duplicate entries (a duplicate makes cache.addAll reject the whole precache and the install fails)',
  dupeShell.length === 0, 'duplicates: ' + dupeShell.join(', '));
const missingShell = shellEntries.filter(entry => {
  if (!entry.startsWith('./') && !entry.startsWith('../')) return false;
  return !fs.existsSync(path.resolve(ROOT, 'commercial-app', entry));
});
check('every SHELL entry exists on disk (a 404 entry must never be able to kill the install)',
  missingShell.length === 0, 'missing: ' + missingShell.join(', '));
check('install handler does not precache with one atomic cache.addAll(SHELL)',
  !sw.includes('addAll(SHELL)'));
check('install handler dedupes SHELL and caches entries independently (new Set(SHELL) + per-entry cache.add)',
  sw.includes('new Set(SHELL)') && sw.includes('cache.add(url)'));

/* ---- index.html startup check ---- */
const index = read('commercial-app/index.html');
const headEnd = index.indexOf('</head>');
const head = headEnd >= 0 ? index.slice(0, headEnd) : index;
const firstScriptAt = head.indexOf('<script');
const firstExternalAt = head.search(/<script[^>]*\ssrc=/);
const blockStart = head.indexOf('H38 Auto-Update');
check('auto-update block is present in <head>', blockStart >= 0);
check('auto-update block is the first script in <head> (runs before any app script)',
  blockStart >= 0 && firstScriptAt >= 0 && blockStart < firstExternalAt,
  'firstScriptAt=' + firstScriptAt + ' firstExternalAt=' + firstExternalAt + ' blockStart=' + blockStart);
const block = blockStart >= 0 ? head.slice(head.lastIndexOf('<script', blockStart), head.indexOf('</script>', blockStart)) : '';
check('auto-update script tag is inline and not deferred/async',
  block !== '' && !/\b(defer|async)\b/.test(head.slice(head.lastIndexOf('<script', blockStart), blockStart)));
check('check fetches version.json with a timestamp cache-buster', block.includes("'./version.json?_='+"));
check('check stores the seen version under h38-app-version before reloading',
  block.includes("'h38-app-version'") && block.includes('localStorage.setItem(KEY,v)') && block.indexOf('localStorage.setItem(KEY,v)') < block.indexOf('location.replace'));
check('check reloads once with a _refresh cache-busting URL via location.replace',
  block.includes("'_refresh='") && block.includes('window.location.replace(u)'));
check('check is loop-capped by the per-session heal marker (h38-app-version-heal)',
  block.includes("'h38-app-version-heal'") && block.includes('sessionStorage'));
check('check re-runs when the app returns to the foreground (pageshow + visibilitychange)',
  block.includes("addEventListener('pageshow'") && block.includes("'visibilitychange'") && block.includes('document.hidden'));

console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) { process.exit(1); }
