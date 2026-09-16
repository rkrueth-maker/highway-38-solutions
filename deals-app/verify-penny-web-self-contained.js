#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

const path = 'supabase/functions/h38-penny-web/index.ts';
const source = fs.readFileSync(path, 'utf8');
const htmlMatch = source.match(/const HTML = String\.raw`([\s\S]*?)`;\n\nDeno\.serve/);
if (!htmlMatch) throw new Error('self-contained HTML payload is missing');
const html = htmlMatch[1];
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1]);
if (!scripts.length) throw new Error('page script is missing');
scripts.forEach((script, i) => new vm.Script(script, { filename: path + ':browser-script-' + i }));
const browserScript = scripts.join('\n');

const required = [
  'store-actionable-v36', 'H38 Deals', 'Dollar General',
  'Home Depot', 'Menards', 'Check deals', 'UPC / SKU',
  'h38_penny_cache_feed', 'refresh_fast', 'refresh_dg',
  "Ray's List", 'VERIFY LOCAL', 'Photo recovery queued',
  'Where are you shopping?', 'Use my location', 'Find deal stores',
  "action:'stores'", 'h38-penny-shopping-location-v1',
  'Clear filters', 'AndroidH38Deals.requestLocation',
  'H38NativeLocationResult', 'filtered of ',
  'refresh_menards', 'quantity_available', 'store_city',
  'h38RefreshWithNearbyStores', 'await findStores()',
  'h38-shopping-location-v1', 'Deal stores at a glance',
  'Check this store', 'data-store-check', 'data-coverage-store',
  'No saved leads yet', 'not a supported H38 deal source yet',
  'Zero means no saved lead', 'Check resale', 'Build coupon stack',
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
const startup = scripts[0].slice(scripts[0].lastIndexOf("chips('interests'"));
if (!startup.includes('load(true);') || /(?:refresh\(|refresh_(?:fast|dg))/.test(startup)) {
  throw new Error('page startup must only load the warm cache');
}
if (!/refresh_fast'[\s\S]{0,300}payload:p/.test(browserScript) ||
    !/refresh_dg'[\s\S]{0,300}payload:p/.test(browserScript)) {
  throw new Error('chosen location is not passed to explicit refresh');
}
if (!/p\.stores=\[s\][\s\S]{0,500}refresh_fast/.test(browserScript)) {
  throw new Error('per-store check must bind the selected store to refresh_fast');
}
if (!/S\.nearby\.filter\([\s\S]{0,180}supportedStore/.test(browserScript)) {
  throw new Error('global refresh must prioritize supported nearby deal stores');
}
if (!browserScript.includes("$('price').value=''")) {
  throw new Error('browser-restored price filter is not cleared on startup');
}

console.log('PASS: H38 Penny web is self-contained, actionable by store, authenticated, and cache-first.');
