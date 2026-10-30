#!/usr/bin/env node
/* Script-src integrity gate (added 2026-10-30 after a sed pin-bump ate the
   closing quotes on app-06/app-20 tags in index.html and on 7 entries in
   h38-script-loader.js, silently breaking app-07 loading and the whole
   deferred loader). Invariant: every local script reference in
   commercial-app/index.html and commercial-app/h38-script-loader.js is a
   well-formed './file.js' or './file.js?build=<stamp>' URL, the referenced
   file exists, and the loader parses. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'commercial-app');
const failures = [];
const check = (name, ok) => { if (ok) console.log('ok - ' + name); else { failures.push(name); console.error('FAIL - ' + name); } };

const SRC_RE = /^\.\/[A-Za-z0-9._-]+\.js(\?build=[A-Za-z0-9._-]+)?$/;

// index.html: every <script ... src="..."> local reference
const index = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const indexSrcs = [...index.matchAll(/<script[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1]).filter((s) => s.startsWith('./'));
check('index.html has local script tags', indexSrcs.length > 20);
for (const src of indexSrcs) {
  check(`index.html src well-formed: ${src}`, SRC_RE.test(src));
  const file = src.split('?')[0].slice(2);
  check(`index.html src file exists: ${file}`, fs.existsSync(path.join(APP, file)));
}
// no unterminated script tag (a src line that never closes on the same tag)
check('index.html has no unterminated script src line', !/src="[^"]*$/.test(index.split('\n').find((l) => l.includes('src="./app-06')) || ''));

// h38-script-loader.js: parses + every './...' string literal is a clean entry
const loaderPath = path.join(APP, 'h38-script-loader.js');
try { execFileSync(process.execPath, ['--check', loaderPath]); check('h38-script-loader.js parses', true); }
catch { check('h38-script-loader.js parses', false); }
const loader = fs.readFileSync(loaderPath, 'utf8');
const entries = [...loader.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
check('loader has entries', entries.length > 50);
for (const entry of entries) {
  check(`loader entry well-formed: ${entry}`, SRC_RE.test(entry));
  const file = entry.split('?')[0].slice(2);
  check(`loader entry file exists: ${file}`, fs.existsSync(path.join(APP, file)));
}

if (failures.length) { console.error(`\nFAIL (${failures.length})`); process.exit(1); }
console.log('\nPASS: script-src integrity — index.html tags and loader entries well-formed, all files exist.');
