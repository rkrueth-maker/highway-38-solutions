#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'apps-script/business-office/BusinessOffice_QuoteBuilder_Mobile_PriceResolve.gs'), 'utf8');

let priceBook = [
  {
    'Catalog ID': 'CAT-GUTTER',
    Name: '6-inch white gutters replacement',
    Family: 'Gutters',
    Price: 15,
    Active: 'Yes',
    Unit: 'linear foot',
    'Catalog Source': JSON.stringify({
      description: '6-inch white gutter replacement',
      notes: 'The customer scope also requested leaf guard and one downspout.'
    })
  },
  {
    'Catalog ID': 'CAT-GUARD',
    Name: 'Leaf guard installation',
    Family: 'Gutter Accessories',
    Price: 8,
    Active: 'Yes',
    Unit: 'linear foot'
  },
  {
    'Catalog ID': 'CAT-DOWN',
    Name: 'White downspout replacement',
    Family: 'Gutters',
    Price: 95,
    Active: 'Yes',
    Unit: 'each'
  }
];

const sandbox = {
  console,
  H38_BO_SHEETS: { PRODUCTS: 'Products' },
  boNormalizeText_: value => String(value == null ? '' : value).trim(),
  boQuoteBuilderPriceBook_: () => priceBook,
  boQuoteBuilderSnapshot_: () => ({ rows: [] })
};
vm.runInNewContext(source, sandbox);

function match(payload) {
  const result = sandbox.boQuoteBuilderExistingLinePrice_(payload);
  return result && result.item && result.item['Product / Service ID'];
}

const guard = match({
  description: 'Leaf guard installation on all new gutter runs',
  query: 'Leaf guard installation. Work scope: replace gutters and one downspout.',
  unit: 'linear foot'
});
const downspout = match({
  description: 'Include one visible downspout with the new gutter system',
  query: 'Include one visible downspout. Work scope: replace gutters and add leaf guard.',
  unit: 'each'
});
const gutter = match({
  description: '6-inch white gutters replacement',
  query: '6-inch white gutters replacement. Work scope: add leaf guard and one downspout.',
  unit: 'linear foot'
});

if (guard !== 'CAT-GUARD') throw new Error(`Leaf guard matched ${guard || 'nothing'} instead of CAT-GUARD.`);
if (downspout !== 'CAT-DOWN') throw new Error(`Downspout matched ${downspout || 'nothing'} instead of CAT-DOWN.`);
if (gutter !== 'CAT-GUTTER') throw new Error(`Gutter matched ${gutter || 'nothing'} instead of CAT-GUTTER.`);

priceBook = [priceBook[0]];
if (match({ description: 'Leaf guard installation', query: 'Leaf guard installation', unit: 'linear foot' })) {
  throw new Error('Catalog Source history caused a gutter item to masquerade as leaf guard.');
}
if (match({ description: 'Downspout installation', query: 'Downspout installation', unit: 'each' })) {
  throw new Error('Catalog Source history caused a gutter item to masquerade as a downspout.');
}

console.log('PASS — product identity ignores project/source history and keeps gutter, downspout, and leaf-guard prices distinct.');
