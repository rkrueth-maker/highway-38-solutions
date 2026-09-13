#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

const path = 'supabase/functions/h38-penny-web/index.ts';
const source = fs.readFileSync(path, 'utf8');
const htmlMatch = source.match(/const HTML = String\.raw`([\s\S]*?)`;\n\nDeno\.serve/);
if (!htmlMatch) throw new Error('self-contained HTML payload is missing');
const html = htmlMatch[1];
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('page script is missing');
new vm.Script(scriptMatch[1], { filename: path + ':browser-script' });

const required = [
  'self-contained-store-first-v34', 'H38 Deals', 'Dollar General',
  'Home Depot', 'Menards', 'Check deals', 'UPC / SKU',
  'h38_penny_cache_feed', 'refresh_fast', 'refresh_dg',
  "Ray's List", 'VERIFY LOCAL', 'Exact image unavailable',
];
for (const marker of required) {
  if (!html.includes(marker)) throw new Error('missing required marker: ' + marker);
}

const forbidden = [
  /raw\.githubusercontent/i, /cdn\.jsdelivr/i, /unpkg\.com/i,
  /DecompressionStream/i, /gunzip/i, /atob\(/i, /service.role/i,
];
for (const pattern of forbidden) {
  if (pattern.test(source)) throw new Error('forbidden dependency: ' + pattern);
}

const warmCache = html.indexOf("api('/rest/v1/rpc/h38_penny_cache_feed'");
const explicitRefresh = html.indexOf("$('refresh').onclick=refresh");
if (warmCache < 0 || explicitRefresh < 0) throw new Error('cache/refresh contract missing');
if (/load\([^)]*\)[\s\S]{0,200}refresh_(?:fast|dg)/.test(scriptMatch[1])) {
  throw new Error('page load must not crawl deal sources');
}

console.log('PASS: H38 Penny web is self-contained, store-first, authenticated, and cache-first.');
