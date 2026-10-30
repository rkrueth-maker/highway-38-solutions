#!/usr/bin/env node
/**
 * Two-layer estimate regression (2026-10-30).
 *
 * Proves:
 *  1. The owner-only internal cost layer math in commercial-app/app-06.js
 *     (extended cost/sell, gross profit, margin %, markup %, quote totals).
 *  2. The price-book pull rule: sell_price is the customer price; unit_cost
 *     becomes internalUnitCost ONLY when sell_price is present. Legacy
 *     sell-in-cost rows (sell_price NULL) price from unit_cost and leave
 *     the internal cost empty.
 *  3. The customer-safe projection {description, quantity, unit, unitPrice,
 *     lineTotal} cannot carry internal fields, and Good/Better/Best tier
 *     totals are computed from sell figures only.
 *  4. No customer-surface file references internalUnitCost at all: customer
 *     preview, PDF/print, delivery/send, live preview/options, and the
 *     customer portal build output from explicit fields or the sanitizer.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'commercial-app');
const failures = [];
const check = (label, ok, detail) => {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  else console.log(`ok - ${label}`);
};
const read = (p) => fs.readFileSync(p, 'utf8');

/* ---- 1-3: functional checks against the real builder source ---- */
const sandbox = { console, setTimeout, clearTimeout, Date, JSON, Math, Number, String, Boolean, Array, Object, Promise, RegExp, Error };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.num = (v) => { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; };
sandbox.money = (v) => '$' + Number(v || 0).toFixed(2);
sandbox.esc = (v) => String(v == null ? '' : v);
sandbox.v = (row, ...keys) => { for (const k of keys) { if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k]; } return ''; };
sandbox.records = () => [];
sandbox.rowId = (row, ...keys) => sandbox.v(row, ...keys);
sandbox.newId = (p) => p + '-TEST';
sandbox.state = { quote: { lines: [] } };
vm.createContext(sandbox);
vm.runInContext(read(path.join(APP, 'app-06.js')), sandbox, { filename: 'app-06.js' });

const I = sandbox.window.H38_QUOTE_INTERNAL;
check('H38_QUOTE_INTERNAL is exposed', !!I);

const fig = I.lineFigures({ quantity: 2, unitPrice: 100, internalUnitCost: 60 });
check('line figures: extended sell/cost/profit', fig.extendedSell === 200 && fig.extendedCost === 120 && fig.grossProfit === 80, JSON.stringify(fig));
check('line figures: margin 40% / markup 66.7%', fig.grossMarginPct === 40 && fig.markupPct === 66.7, JSON.stringify(fig));
const noCost = I.lineFigures({ quantity: 3, unitPrice: 50 });
check('line without cost: cost figures are null, sell still computed', noCost.extendedCost === null && noCost.grossProfit === null && noCost.extendedSell === 150, JSON.stringify(noCost));

const totals = I.quoteTotals([
  { quantity: 2, unitPrice: 100, internalUnitCost: 60 },
  { quantity: 1, unitPrice: 50 },
]);
check('quote totals: cost/profit/margin over costed lines only', totals.totalCost === 120 && totals.grossProfit === 80 && totals.grossMarginPct === 40 && totals.costedLines === 1 && totals.lineCount === 2, JSON.stringify(totals));

const legacy = I.priceBookPricing({ 'Sell Price': '', 'Purchase Cost': 25, 'Selling Price': 25, 'Category': 'RAW MATERIAL | Drywall' });
check('legacy sell-in-cost row: price = unit_cost, internal cost empty', legacy.unitPrice === 25 && legacy.internalUnitCost === null && legacy.costSource === null, JSON.stringify(legacy));
const modern = I.priceBookPricing({ 'Sell Price': 40, 'Purchase Cost': 25, 'Selling Price': 40, 'Category': 'RAW MATERIAL | Drywall' });
check('sell_price row: sell = sell_price, internal = unit_cost, source material', modern.unitPrice === 40 && modern.internalUnitCost === 25 && modern.costSource === 'material' && modern.costOverride === false && !!modern.costUpdatedAt, JSON.stringify(modern));
const labor = I.priceBookPricing({ 'Sell Price': 85, 'Purchase Cost': 55, 'Selling Price': 85, 'Category': 'LABOR BENCHMARK' });
check('labor row: costSource labor', labor.costSource === 'labor' && labor.internalUnitCost === 55, JSON.stringify(labor));

const dirtyLine = { description: 'Drywall hang', quantity: 2, unit: 'SF', unitPrice: 10, internalUnitCost: 5, costSource: 'material', costUpdatedAt: '2026-10-30T00:00:00.000Z', costOverride: true, priceSource: 'Price Book' };
const clean = I.customerLine(dirtyLine);
check('customer projection has exactly the five customer fields', JSON.stringify(Object.keys(clean).sort()) === JSON.stringify(['description', 'lineTotal', 'quantity', 'unit', 'unitPrice']), JSON.stringify(clean));
check('customer projection carries no internal data', !JSON.stringify(clean).includes('internal') && !JSON.stringify(clean).includes('costSource') && clean.lineTotal === 20, JSON.stringify(clean));
const stripped = I.stripInternal(dirtyLine);
check('stripInternal removes all four internal fields, keeps the rest', !('internalUnitCost' in stripped) && !('costSource' in stripped) && !('costUpdatedAt' in stripped) && !('costOverride' in stripped) && stripped.description === 'Drywall hang', JSON.stringify(stripped));

/* Good/Better/Best: tier totals come from sell figures only, even when tier
   items carry internal costs. h38TierTotal is a builder global in app-06. */
const tierTotal = sandbox.h38TierTotal({ items: [
  { quantity: 2, unitPrice: 100, internalUnitCost: 60 },
  { quantity: 1, unitPrice: 50, internalUnitCost: 10 },
] });
check('GBB tier total uses sell only (250, internal costs ignored)', tierTotal === 250, String(tierTotal));

/* ---- 4: static leak gates ---- */
const CUSTOMER_SURFACES = [
  path.join(APP, 'quote-live-customer-preview.js'),
  path.join(APP, 'quote-print-safe.js'),
  path.join(APP, 'quote-pdf-send-live-fix.js'),
  path.join(APP, 'quote-delivery-final-fix.js'),
  path.join(APP, 'supabase-quote-delivery.js'),
  path.join(APP, 'quote-live-customer-options.js'),
  path.join(ROOT, 'customer-portal-supabase.js'),
  path.join(ROOT, 'customer-portal-quote-delivery.js'),
  path.join(ROOT, 'customer-portal-quote-decisions.js'),
  path.join(ROOT, 'supabase', 'functions', 'h38-quote-delivery', 'index.ts'),
];
for (const file of CUSTOMER_SURFACES) {
  check(`customer surface has no internalUnitCost reference: ${path.relative(ROOT, file)}`, !read(file).includes('internalUnitCost'));
}

const app06 = read(path.join(APP, 'app-06.js'));
check('builder renders per-line internal cost editor', app06.includes('data-line-cost-field') && app06.includes('data-line-cost-summary'));
check('builder renders owner-only internal summary bar', app06.includes('quoteInternalSummary') && app06.includes('h38InternalSummaryHtml'));
check('builder price-book pull applies sell + internal cost', app06.includes('h38ApplyPriceBookPricing'));
const app20 = read(path.join(APP, 'app-20.js'));
check('customer preview line uses the sanitized projection', app20.includes('H38_QUOTE_INTERNAL') && app20.includes('customerLine(normalized)'));
check('GBB presentation uses the sanitized projection', app20.includes('window.H38_QUOTE_INTERNAL.customerLine(l)') || app20.includes('H38_QUOTE_INTERNAL') && app20.includes('customerLine(l)'));
const options = read(path.join(APP, 'quote-customer-options.js'));
check('options catalog selects sell_price', options.includes('unit_cost,sell_price'));
check('options catalog rate is sell_price ?? unit_cost', options.includes('row.sell_price!=null?row.sell_price:row.unit_cost'));
check('options catalog carries internalCost only when sell_price present', options.includes('row.sell_price!=null?number(row.unit_cost):null'));
const profit = read(path.join(APP, 'profitability-operating-layer.js'));
check('profitability layer checks the line snapshot cost before any price-book match', profit.indexOf("'internalUnitCost'") >= 0 && profit.indexOf("'internalUnitCost'") < profit.indexOf('directCostPerUnit'));
check('photo-quote application carries agent internal cost onto lines', app06.includes('newLine.internalUnitCost=agentCost'));
check('photo-quote application resolves price book cost when agent sends none', app06.includes('h38ApplyPriceBookPricing(newLine,row,true)'));

// 9. Renderer-shadow regression (found live 2026-10-30): quote-mobile-stabilization
//    must delegate line rendering to the canonical app-06 renderer and must carry
//    the internal cost fields through its save map — in BOTH the standalone file
//    and its bundle-features.js copy.
for (const f of ['quote-mobile-stabilization.js', 'bundle-features.js']) {
  const src = fs.readFileSync(path.join(APP, f), 'utf8');
  check(f + ': no legacy renderQuoteLines override', !src.includes('window.renderQuoteLines=editLines'));
  check(f + ': renderQuoteLines delegates to base renderer', src.includes('baseRenderQuoteLines'));
  check(f + ': save map carries internalUnitCost', src.includes('internalUnitCost:num(l.internalUnitCost)'));
}

// 10. Hydration regression (found live 2026-10-30): openQuote must carry the
//     internal cost snapshot from the saved record into builder state, in both
//     the app-07.js source and its bundle-pages.js copy — otherwise reopened
//     quotes lose their cost layer and the profit guard reports $0.
for (const f of ['app-07.js', 'bundle-pages.js']) {
  const src = fs.readFileSync(path.join(APP, f), 'utf8');
  check(f + ': openQuote hydrates cost snapshot', src.includes('...h38LineCostSnapshot(line)'));
  check(f + ': snapshot helper reads internalUnitCost', src.includes("snap.internalUnitCost=num(cost)"));
}

if (failures.length) {
  console.error(`\nFAIL (${failures.length}):`);
  failures.forEach((f) => console.error(' - ' + f));
  process.exit(1);
}
console.log('\nPASS: two-layer estimate — internal cost layer, price-book pull, sanitizer gate, GBB totals.');
