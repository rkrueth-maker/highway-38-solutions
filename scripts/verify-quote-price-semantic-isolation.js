#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'apps-script/business-office/BusinessOffice_QuoteBuilder_Mobile_PriceResolve.gs'), 'utf8');
const recoverySource = fs.readFileSync(path.join(root, 'apps-script/business-office/BusinessOffice_QuoteBuilder_Mobile_AcceptanceRecovery.gs'), 'utf8');

[
  'boQuoteBuilderMobileAcceptanceCaptureQuoteState_',
  'boQuoteBuilderMobileAcceptanceRestoreQuoteState_',
  'boQuoteBuilderMobileAcceptanceRecoverPriorFailedRun_',
  'boQuoteBuilderMobileAcceptanceAuditColumnValue_',
  'boQuoteBuilderMobileAcceptanceAuditPrevious_',
  'boQuoteBuilderMobileAcceptanceAuditNew_',
  "boAudit_('RESTORE'",
  'original zero-line Draft'
].forEach(marker => {
  if (!recoverySource.includes(marker)) throw new Error(`Missing acceptance recovery contract: ${marker}`);
});
new Function(recoverySource);

const recoverySandbox = { console };
vm.runInNewContext(recoverySource, recoverySandbox);
const previousAuditValue = [{ 'Quote Line ID':'QL-OLD', Description:'Old line' }];
const newAuditValue = [{ 'Quote Line ID':'QL-NEW', Description:'New line' }];
const arbitraryAuditHeaders = {};
arbitraryAuditHeaders.__rowNumber = 42;
for (let index = 0; index < 14; index += 1) {
  arbitraryAuditHeaders[`Unrecognized Column ${index + 1}`] = '';
}
arbitraryAuditHeaders['Unrecognized Column 9'] = JSON.stringify(previousAuditValue);
arbitraryAuditHeaders['Unrecognized Column 10'] = JSON.stringify(newAuditValue);
const decodedPrevious = recoverySandbox.boQuoteBuilderMobileAcceptanceAuditPrevious_(arbitraryAuditHeaders, null);
const decodedNew = recoverySandbox.boQuoteBuilderMobileAcceptanceAuditNew_(arbitraryAuditHeaders, null);
if (JSON.stringify(decodedPrevious) !== JSON.stringify(previousAuditValue)) {
  throw new Error('Audit recovery did not decode the before JSON from physical column 9.');
}
if (JSON.stringify(decodedNew) !== JSON.stringify(newAuditValue)) {
  throw new Error('Audit recovery did not decode the after JSON from physical column 10.');
}

let productionRows = [
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

let legacyView = productionRows.map(item => ({
  'Product / Service ID': '',
  Name: item.Name,
  Description: item.Description || '',
  'Customer Description': item['Customer Description'] || '',
  Category: item.Family,
  Unit: item.Unit,
  'Standard Selling Price': item.Price,
  Price: item.Price,
  Status: 'Active'
}));

const sandbox = {
  console,
  H38_BO_SHEETS: { PRODUCTS: 'Products' },
  boNormalizeText_: value => String(value == null ? '' : value).trim(),
  boQuoteBuilderPriceBook_: () => legacyView,
  boQuoteBuilderSnapshot_: () => ({ rows: productionRows }),
  boSafeExecute_: (_source, callback) => callback(),
  boQuoteBuilderRequireAction_: () => ({}),
  boAssert_: (condition, message) => { if (!condition) throw new Error(message); },
  boProof_: () => {},
  boGetActiveEmail_: () => 'test@example.com',
  boQuoteBuilderAutoLocalPrice: () => ({})
};
vm.runInNewContext(source, sandbox);

function match(payload) {
  const result = sandbox.boQuoteBuilderExistingLinePrice_(payload);
  return result && result.item && (result.item['Product / Service ID'] || result.item['Catalog ID']);
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

productionRows = [productionRows[0]];
legacyView = [legacyView[0]];
if (match({ description: 'Leaf guard installation', query: 'Leaf guard installation', unit: 'linear foot' })) {
  throw new Error('Catalog Source history caused a gutter item to masquerade as leaf guard.');
}
if (match({ description: 'Downspout installation', query: 'Downspout installation', unit: 'each' })) {
  throw new Error('Catalog Source history caused a gutter item to masquerade as a downspout.');
}

productionRows = [];
legacyView = [];
sandbox.boQuoteBuilderAutoLocalPrice = () => ({
  saved: true,
  catalogId: '',
  item: {
    'Catalog ID': 'LOCAL-GUARD',
    Name: 'Leaf guard installation',
    Family: 'Locally Researched Prices',
    Price: 9.25,
    Active: 'Yes',
    Unit: 'linear foot'
  },
  finalPriceApproved: false,
  ownerReviewRequired: true
});
const researched = sandbox.boQuoteBuilderResolveLinePrice({
  description: 'Leaf guard installation',
  query: 'Leaf guard installation',
  unit: 'linear foot'
});
if (researched.catalogId !== 'LOCAL-GUARD') throw new Error(`Local research lost Catalog ID: ${researched.catalogId || 'blank'}.`);
if (researched.item['Product / Service ID'] !== 'LOCAL-GUARD') throw new Error('Local research item was not normalized to the quote-line catalog schema.');
if (researched.ownerReviewRequired !== true || researched.finalPriceApproved !== false) throw new Error('Local research escaped owner review.');

console.log('PASS — production Catalog IDs outrank blank legacy-view duplicates, source history cannot change component identity, researched Catalog IDs survive the mobile pricing handoff, audit before/after JSON is read by physical column order, and exact acceptance recovery is guarded.');
