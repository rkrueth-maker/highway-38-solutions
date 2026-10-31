'use strict';
/* Workbench (Direction B) static gate.
 *
 * Invariants this protects:
 *  - workbench files exist and are registered (index.html + service
 *    worker precache + version stamp agreement);
 *  - the phone fence: every CSS rule in workbench.css is inside the
 *    >=761px media block or scoped to workbench-owned elements, and
 *    the shell JS refuses to activate below 761px;
 *  - the send/money HARD FENCE: the palette contains no code path
 *    that sends a message/email or moves money — it may only call
 *    openPage, click existing create/open controls, set the Customer
 *    360 selection, or call openQuote (all existing gated flows);
 *  - the icon rail mirrors the canonical nav (reads #mainNav
 *    buttons) and never builds a second page registry;
 *  - favourites ride the shared 'h38-favourites-v1' store.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'commercial-app');
const failures = [];
const check = (name, ok) => { if (ok) console.log('ok - ' + name); else { failures.push(name); console.error('FAIL - ' + name); } };
const read = (p) => fs.readFileSync(path.join(APP, p), 'utf8');

const shell = read('workbench-shell.js');
const css = read('workbench.css');
const index = read('index.html');
const sw = read('service-worker.js');
const version = JSON.parse(read('version.json'));

check('workbench-shell.js exists and parses as an IIFE module', shell.includes('(function () {') && shell.includes('H38_WORKBENCH'));
check('index.html loads workbench.css', /workbench\.css\?build=/.test(index));
check('index.html loads workbench-shell.js deferred', /<script defer src="\.\/workbench-shell\.js\?build=/.test(index));
check('service worker precaches workbench files', sw.includes("'./workbench-shell.js'") && sw.includes("'./workbench.css'"));
check('service worker cache name carries the version stamp', sw.includes(version.version));
check('shell refuses to activate below 761px', shell.includes("matchMedia('(min-width: 761px)')"));
check('css is media-gated at 761px', css.includes('@media (min-width: 761px)'));
const cssBare = css.replace(/\/\*[\s\S]*?\*\//g, '');
const cssOutsideMedia = cssBare.slice(0, cssBare.indexOf('@media (min-width: 761px)')).trim();
check('no ungated css rules outside the media block', cssOutsideMedia === '');

/* Hard fence: forbidden send/money primitives must not appear in the
 * palette module at all. Navigation + staging APIs are allow-listed. */
const forbidden = ['sendEmail', 'sendSms', 'sendMessage(', 'H38_COMMUNICATIONS.startCall', 'H38_COMMUNICATIONS.startText', 'stripe', 'charge(', 'createPayment', 'recordPayment('];
forbidden.forEach((f) => check('palette fence: no ' + f, !shell.includes(f)));
check('palette fence: fence statement present', shell.includes('NEVER sends') || shell.includes('never sends'));
check('rail mirrors canonical #mainNav buttons', shell.includes("#mainNav button[data-page]"));
check('rail does not define its own page registry', !/const PAGES\s*=|var PAGES\s*=/.test(shell));
check('favourites use the shared store prefix', shell.includes("'h38-favourites-v1'"));
check('palette opens on Ctrl/Cmd+K', shell.includes("toLowerCase() === 'k'"));
check('shortcut printed on the topbar button', shell.includes('<kbd>Ctrl K</kbd>'));

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nPASS — workbench static gate');
process.exit(failures.length ? 1 : 0);
