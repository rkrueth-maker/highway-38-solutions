#!/usr/bin/env node
'use strict';
/* Verifier: Machine Shop vertical v1.
 * Static wiring checks + a real runtime harness that loads the actual
 * commercial-app modules in a stubbed browser environment and executes the
 * full shop workflow end-to-end against an in-memory backend:
 *   RFQ intake -> supplier quote comparison -> markup -> quote draft ->
 *   PO draft (owner approval required) -> QC -> shipment -> reorder tracking,
 * plus the Owner Controls machine_shop toggle and the price-book template
 * installer (including the never-overwrite-approved rule).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const checks = [];
const assert = (name, cond) => {
  checks.push({ name, pass: Boolean(cond) });
  if (!cond) console.error(`FAIL: ${name}`);
  else console.log(`PASS: ${name}`);
};

/* ---------------- static checks ---------------- */
const ms = read('commercial-app/machine-shop.js');
const tpl = read('commercial-app/machine-shop-pricebook-templates.js');
const oc = read('commercial-app/owner-controls.js');
const ob = read('commercial-app/ai-onboarding.js');
const idx = read('commercial-app/index.html');

assert('machine-shop.js registers PAGE_DEFS.shop', /PAGE_DEFS\.shop=\['🏭','Machine Shop'\]/.test(ms));
assert('machine-shop.js pushes shop into OFFICE_PAGES', /OFFICE_PAGES\.push\('shop'\)/.test(ms));
assert('machine-shop.js inserts shop into desktop ORDER before quotes', /ORDER\.splice\(at,0,'shop'\)/.test(ms));
assert('machine-shop.js declares role requirements', /H38_PARITY_REQUIREMENTS\.shop=\['manageWork','manageQuotes'\]/.test(ms) && /REQUIREMENTS\.shop=\['manageWork','manageQuotes'\]/.test(ms));
assert('machine-shop.js gates allowedPages/expectedPages/renderPage', /__h38Shop/.test(ms) && /shopEnabled\(\)&&hasRole\(\)/.test(ms));
assert('machine-shop.js bounds every list to 50 records', (ms.match(/\.slice\(0,50\)/g) || []).length >= 4);
assert('machine-shop.js writes POs with Owner Approval Required', /'Approval Status':'Owner Approval Required'/.test(ms));
assert('machine-shop.js builds customer quotes via canonical SAVE_QUOTE', /queueOperation\('SAVE_QUOTE'/.test(ms));
assert('machine-shop.js keeps QC checklist, shipment, reorder tracking', /shopQcChecks/.test(ms) && /shopShipments/.test(ms) && /shopParts/.test(ms));
assert('templates define all six MACH codes', ['MACH_3AXIS_HR','MACH_LATHE_HR','MACH_5AXIS_HR','MACH_WELD_HR','MACH_SETUP_JOB','MACH_MINIMUM_LOT'].every(c => tpl.includes(c)));
assert('templates install as owner_review_required only', /approval_status:'owner_review_required'/.test(tpl));
assert('templates never overwrite an approved rate', /approval_status==='approved'/.test(tpl) && /skipped\+\+;continue/.test(tpl));
assert('owner-controls has Machine Shop card + server-backed setting', /MACHINE_SHOP_KEY='machine_shop'/.test(oc) && /isMachineShopEnabled/.test(oc) && /setMachineShop/.test(oc) && /business_module_settings/.test(oc));
assert('owner-controls toggle is owner/admin-only, default OFF', /canManageModules/.test(oc) && /row!==null\?row\.enabled===true:false/.test(oc));
assert('owner-controls asks for confirmation before enabling', /Turn ON the Machine Shop module\?/.test(oc));
assert('onboarding offers Machine Shop business type', /'Machine Shop'/.test(ob));
assert('onboarding has explicit module opt-in checkbox', /h38OnboardEnableShop/.test(ob));
assert('onboarding finish() enables via server setting, not localStorage', /setMachineShop\(true\)/.test(ob));
assert('index.html loads both shop scripts after owner-controls', idx.indexOf('owner-controls.js') < idx.indexOf('machine-shop-pricebook-templates.js') && idx.indexOf('machine-shop-pricebook-templates.js') < idx.indexOf('machine-shop.js?build='));

/* ---------------- runtime harness ---------------- */
const store = {};                 // collection -> Map(id -> record)
const priceBook = [];             // fake price_book_items rows
const moduleSettingsDb = [];      // fake business_module_settings rows
const supabaseLog = [];
const toasts = [];
const formHandlers = {};
const renderNavCalls = [];
let idSeq = 0;
const fakeForm = { reset(){} };

// Fake DOM elements the module binds to
const elements = {};
function mkEl(id, extra) {
  elements[id] = Object.assign({ id, dataset: {}, value: '', textContent: '', innerHTML: '', onclick: null, oninput: null, disabled: false, checked: false }, extra || {});
  return elements[id];
}
mkEl('mainContent');
mkEl('shopMarkupPct', { value: '25' });
mkEl('shopSellPrice');
mkEl('shopBuildQuote');
mkEl('shopCreatePo');
mkEl('shopInstallTemplates');

let lastRfqBtns = [], lastWinnerBtns = [], lastPoBtns = [];

const sandbox = {
  console,
  setTimeout: () => 0,
  clearTimeout: () => {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = {
  readyState: 'complete',
  getElementById: id => elements[id] || null,
  querySelector: () => null,
  querySelectorAll: sel => {
    if (sel === '[data-shop-rfq]') {
      lastRfqBtns = [...(store.shopRfqs || new Map()).values()].map(r => ({ dataset: { shopRfq: String(r.id) }, onclick: null }));
      return lastRfqBtns;
    }
    if (sel === '[data-shop-winner]') {
      lastWinnerBtns = [...(store.shopSupplierQuotes || new Map()).values()].map(q => ({ dataset: { shopWinner: String(q.id) }, onclick: null }));
      return lastWinnerBtns;
    }
    if (sel === '[data-shop-po]') {
      lastPoBtns = [...(store.purchaseOrders || new Map()).values()].map(p => ({ dataset: { shopPo: String(p.id) }, onclick: null }));
      return lastPoBtns;
    }
    return [];
  },
  createElement: () => ({ innerHTML: '', firstElementChild: null }),
  addEventListener: () => {},
};
const lsData = {};
sandbox.localStorage = {
  getItem: k => (k in lsData ? lsData[k] : null),
  setItem: (k, v) => { lsData[k] = String(v); },
  removeItem: k => { delete lsData[k]; },
};

// App-core globals the modules expect
sandbox.text = v => String(v == null ? '' : v).trim();
sandbox.num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
sandbox.businessId = () => 'biz-1';
sandbox.newId = p => `${p}-${++idSeq}`;
sandbox.v = (row, ...keys) => {
  for (const k of keys) {
    if (row && row[k] !== undefined && row[k] !== null && String(row[k]) !== '') return row[k];
  }
  return '';
};
sandbox.records = name => (store[name] ? [...store[name].values()] : []);
sandbox.requireValue = (val, msg) => { if (sandbox.text(val) === '') throw new Error(msg); return val; };
sandbox.toast = m => { toasts.push(String(m)); };
sandbox.confirm = () => true;
sandbox.can = () => true;
sandbox.money = n => '$' + sandbox.num(n).toFixed(2);
sandbox.esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
sandbox.pill = t => `[${t}]`;
sandbox.empty = m => `<div class="empty">${m}</div>`;
sandbox.pageHead = (t, sub) => `<h1>${t}</h1><p>${sub}</p>`;
sandbox.optionRows = () => '';
sandbox.dateOnly = s => String(s || '').slice(0, 10);
sandbox.bindForm = (id, fn) => { formHandlers[id] = fn; };
sandbox.$ = id => elements[id] || null;
sandbox.renderNav = () => { renderNavCalls.push(1); };

// In-memory backend for queueOperation (SAVE_ENTITY upsert + SAVE_QUOTE draft default)
sandbox.queueOperation = async (op, type, id, data, opts = {}) => {
  const coll = opts.collection || type;
  if (!store[coll]) store[coll] = new Map();
  if (op === 'SAVE_ENTITY' || op === 'SAVE_QUOTE') {
    const rec = Object.assign({}, opts.record || {}, data || {});
    if (op === 'SAVE_QUOTE' && !rec.Status) rec.Status = 'Draft'; // canonical default
    const key = String(id);
    store[coll].set(key, Object.assign({}, store[coll].get(key) || {}, rec, { id: key }));
  }
  return { ok: true };
};

// Fake Supabase shared client (templates installer + module settings)
function makeTable(table) {
  const filters = [];
  const api = {
    select() { return api; },
    eq(col, val) { filters.push([col, val]); return api; },
    maybeSingle: async () => {
      if (table === 'price_book_items') {
        const f = Object.fromEntries(filters);
        const row = priceBook.find(r => r.business_id === f.business_id && r.item_code === f.item_code);
        supabaseLog.push({ op: 'select', table, code: f.item_code, found: !!row });
        return { data: row ? { id: row.id, approval_status: row.approval_status } : null, error: null };
      }
      return { data: null, error: null };
    },
    insert: async payload => {
      supabaseLog.push({ op: 'insert', table, code: payload.item_code, status: payload.approval_status });
      if (table === 'price_book_items') priceBook.push(Object.assign({ id: 'pb-' + (priceBook.length + 1) }, payload));
      return { error: null };
    },
    update: payload => ({
      eq: (c1, v1) => ({
        eq: async (c2, v2) => {
          supabaseLog.push({ op: 'update', table, where: { [c1]: v1, [c2]: v2 } });
          if (table === 'price_book_items') {
            const row = priceBook.find(r => r.id === v1 && r.business_id === v2);
            if (row) Object.assign(row, payload);
          }
          return { error: null };
        },
      }),
    }),
    upsert: async row => {
      supabaseLog.push({ op: 'upsert', table, module_key: row.module_key, enabled: row.enabled });
      if (table === 'business_module_settings') {
        const i = moduleSettingsDb.findIndex(r => r.business_id === row.business_id && r.module_key === row.module_key);
        if (i >= 0) moduleSettingsDb[i] = Object.assign({}, moduleSettingsDb[i], row);
        else moduleSettingsDb.push(Object.assign({}, row));
      }
      return { error: null };
    },
  };
  return api;
}
sandbox.H38_SUPABASE_SHARED_CLIENT = {
  ensure: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }),
    },
    from: table => makeTable(table),
  }),
};

// Navigation registries before the shop module loads
sandbox.PAGE_DEFS = {};
sandbox.OFFICE_PAGES = ['today', 'quotes'];
sandbox.ORDER = ['today', 'quotes'];
sandbox.REQUIREMENTS = {};
sandbox.H38_PARITY_REQUIREMENTS = {};
const baseAllowed = () => ['today', 'quotes', 'shop'];
const baseExpected = () => ['today', 'quotes', 'shop'];
const renderPageCalls = [];
sandbox.allowedPages = baseAllowed;
sandbox.expectedPages = baseExpected;
sandbox.renderPage = function () { renderPageCalls.push(sandbox.state.page); };

sandbox.state = {
  businessId: 'biz-1',
  page: 'today',
  user: { roleName: 'owner' },
  snapshot: { moduleSettings: [], user: { userId: 'u1' } },
};

vm.createContext(sandbox);
vm.runInContext(tpl, sandbox, { filename: 'machine-shop-pricebook-templates.js' });
vm.runInContext(ms, sandbox, { filename: 'machine-shop.js' });
vm.runInContext(oc, sandbox, { filename: 'owner-controls.js' });

const H38Shop = sandbox.H38MachineShop;
const H38OC = sandbox.H38OwnerControls;
const H38Tpl = sandbox.H38MachineShopTemplates;

(async () => {
  /* ---- nav registration ---- */
  assert('runtime: PAGE_DEFS.shop registered', JSON.stringify(sandbox.PAGE_DEFS.shop) === JSON.stringify(['🏭', 'Machine Shop']));
  assert('runtime: OFFICE_PAGES includes shop', sandbox.OFFICE_PAGES.includes('shop'));
  assert('runtime: ORDER places shop before quotes', sandbox.ORDER.indexOf('shop') !== -1 && sandbox.ORDER.indexOf('shop') < sandbox.ORDER.indexOf('quotes'));
  assert('runtime: allowedPages wrapped for gating', typeof sandbox.allowedPages === 'function' && sandbox.allowedPages.__h38Shop === true);

  /* ---- toggle gating ---- */
  assert('runtime: toggle defaults OFF (missing row)', H38OC.isMachineShopEnabled() === false);
  assert('runtime: shop hidden from nav while OFF', !sandbox.allowedPages().includes('shop') && !sandbox.expectedPages().includes('shop'));

  const enabled = await H38OC.setMachineShop(true);
  assert('runtime: setMachineShop(true) resolves true', enabled === true);
  const up = supabaseLog.find(e => e.op === 'upsert' && e.module_key === 'machine_shop');
  assert('runtime: toggle upserts business_module_settings row', !!up && up.enabled === true);
  assert('runtime: snapshot synced so nav and card agree', sandbox.state.snapshot.moduleSettings.some(r => r.module_key === 'machine_shop' && r.enabled === true));
  assert('runtime: nav refresh requested on toggle', renderNavCalls.length >= 1);
  assert('runtime: shop visible in nav while ON', sandbox.allowedPages().includes('shop') && sandbox.expectedPages().includes('shop'));
  assert('runtime: H38MachineShop.enabled() follows toggle', H38Shop.enabled() === true);

  sandbox.state.user.roleName = 'staff';
  let threw = false;
  try { await H38OC.setMachineShop(false); } catch (e) { threw = /Only a business owner/.test(e.message); }
  assert('runtime: non-owner cannot flip the toggle', threw === true);
  sandbox.state.user.roleName = 'owner';

  /* ---- renderPage routes to shop workspace ---- */
  sandbox.state.page = 'shop';
  sandbox.renderPage();
  const html = elements.mainContent.innerHTML;
  assert('runtime: shop page renders workspace', html.includes('Machine Shop') && html.includes('New RFQ') && html.includes('Supplier quotes'));

  /* ---- RFQ intake ---- */
  await formHandlers.shopRfqForm({
    customerId: '', partName: 'Bearing housing', partNumber: 'HB-1042', quantity: '10',
    material: '4140 steel', tolerance: '±0.001', dueDate: '2026-11-01', notes: 'test rfq',
  }, fakeForm);
  const rfqs = [...store.shopRfqs.values()];
  assert('runtime: RFQ saved with Status New', rfqs.length === 1 && rfqs[0]['Status'] === 'New');
  assert('runtime: RFQ captures part detail', rfqs[0]['Part Name'] === 'Bearing housing' && rfqs[0]['Quantity'] === 10 && rfqs[0]['Material'] === '4140 steel');
  const rfqId = rfqs[0].id;

  /* ---- open RFQ, add supplier quotes ---- */
  lastRfqBtns.find(b => b.dataset.shopRfq === String(rfqId)).onclick();
  assert('runtime: RFQ opens its quote comparison', elements.mainContent.innerHTML.includes('Bearing housing'));
  await formHandlers.shopQuoteForm({ supplierName: 'Acme Prototype', price: '1000', leadDays: '14', notes: '' }, fakeForm);
  await formHandlers.shopQuoteForm({ supplierName: 'Budget Mill', price: '1200', leadDays: '7', notes: '' }, fakeForm);
  const quotes = [...store.shopSupplierQuotes.values()];
  assert('runtime: two supplier quotes stored', quotes.length === 2);
  assert('runtime: RFQ moves to Quoted', store.shopRfqs.get(String(rfqId))['Status'] === 'Quoted');

  /* ---- select winner ---- */
  const acme = quotes.find(q => q['Supplier Name'] === 'Acme Prototype');
  await lastWinnerBtns.find(b => b.dataset.shopWinner === String(acme.id)).onclick();
  const after = [...store.shopSupplierQuotes.values()];
  assert('runtime: winner marked Selected, other Compared',
    after.find(q => q.id === acme.id)['Status'] === 'Selected' &&
    after.find(q => q.id !== acme.id)['Status'] === 'Compared');
  assert('runtime: RFQ moves to Supplier Selected', store.shopRfqs.get(String(rfqId))['Status'] === 'Supplier Selected');

  /* ---- markup -> customer quote draft ---- */
  await elements.shopBuildQuote.onclick();
  const custQuotes = [...(store.quotes || new Map()).values()];
  const line = custQuotes[0] && custQuotes[0].lines && custQuotes[0].lines[0];
  assert('runtime: quote draft created in canonical quotes', custQuotes.length === 1 && custQuotes[0].Status === 'Draft');
  assert('runtime: markup math exact (1000 cost +25% over qty 10 = 125 each)', line && line.unitPrice === 125 && line.quantity === 10);
  assert('runtime: RFQ moves to Quote Drafted', store.shopRfqs.get(String(rfqId))['Status'] === 'Quote Drafted');

  /* ---- PO draft, owner approval required ---- */
  await elements.shopCreatePo.onclick();
  const pos = [...(store.purchaseOrders || new Map()).values()];
  assert('runtime: PO draft in canonical purchaseOrders', pos.length === 1);
  assert('runtime: PO requires owner approval, nothing auto-ordered',
    pos[0]['Approval Status'] === 'Owner Approval Required' && pos[0]['Status'] === 'Draft' && pos[0]['Total'] === 1000);
  assert('runtime: RFQ moves to PO Drafted', store.shopRfqs.get(String(rfqId))['Status'] === 'PO Drafted');
  const poId = pos[0].id;

  /* ---- QC checklist ---- */
  lastPoBtns.find(b => b.dataset.shopPo === String(poId)).onclick();
  await formHandlers.shopQcForm({ dimOk: 'on', qtyOk: 'on', finishOk: 'on', paperOk: 'on', damageOk: 'on', notes: '' }, fakeForm);
  await formHandlers.shopQcForm({ dimOk: 'on', qtyOk: '', finishOk: 'on', paperOk: 'on', damageOk: 'on', notes: 'qty short' }, fakeForm);
  const qcs = [...store.shopQcChecks.values()];
  assert('runtime: QC pass/fail recorded honestly', qcs.length === 2 && qcs[0]['Result'] === 'Pass' && qcs[1]['Result'] === 'Fail');

  /* ---- shipment ---- */
  await formHandlers.shopShipForm({ shipDate: '2026-10-10', carrier: 'UPS', tracking: '1Z999' }, fakeForm);
  const ships = [...store.shopShipments.values()];
  assert('runtime: shipment recorded', ships.length === 1 && ships[0]['Status'] === 'Shipped' && ships[0]['Tracking'] === '1Z999');

  /* ---- reorder tracking ---- */
  await formHandlers.shopPartForm({ partName: '4140 round bar', partNumber: 'RB-2', supplier: 'MetalCo', onHand: '3', reorderPoint: '10', lastOrder: '', notes: '' }, fakeForm);
  const parts = [...store.shopParts.values()];
  assert('runtime: part tracked for reorder', parts.length === 1 && parts[0]['Part Name'] === '4140 round bar');
  sandbox.state.page = 'shop';
  sandbox.renderPage();
  assert('runtime: low-stock part flagged Reorder', elements.mainContent.innerHTML.includes('Reorder'));

  /* ---- toggle OFF hides everything again ---- */
  await H38OC.setMachineShop(false);
  assert('runtime: toggle OFF removes shop from nav', !sandbox.allowedPages().includes('shop'));
  sandbox.state.page = 'shop';
  sandbox.renderPage();
  assert('runtime: shop page shows disabled notice when OFF', elements.mainContent.innerHTML.includes('module is disabled'));

  /* ---- price-book templates ---- */
  const rows = H38Tpl.templateRows();
  assert('runtime: templateRows exposes 6 owner-review rows',
    rows.length === 6 && rows.every(r => r.status === 'owner_review_required'));
  assert('runtime: template rates match queued machining rules',
    JSON.stringify(rows.map(r => r.rate)) === JSON.stringify([80, 75, 160, 90, 100, 200]));

  let res = await H38Tpl.installTemplates();
  assert('runtime: installer seeds 6 drafts on empty book', res.installed === 6 && res.skipped === 0 && priceBook.length === 6);
  assert('runtime: installed rows are owner-review drafts, never live',
    priceBook.every(r => r.approval_status === 'owner_review_required' && r.active === true && r.business_id === 'biz-1'));

  priceBook.length = 0;
  priceBook.push({ id: 'pb-1', business_id: 'biz-1', item_code: 'MACH_3AXIS_HR', approval_status: 'approved', unit_cost: 999 });
  res = await H38Tpl.installTemplates();
  const approved = priceBook.find(r => r.item_code === 'MACH_3AXIS_HR');
  assert('runtime: approved rate skipped, never overwritten', res.skipped === 1 && res.installed === 5 && approved.unit_cost === 999);

  priceBook.push({ id: 'pb-2', business_id: 'biz-1', item_code: 'MACH_LATHE_HR', approval_status: 'owner_review_required', unit_cost: 1 });
  const before = priceBook.length;
  res = await H38Tpl.installTemplates();
  assert('runtime: existing draft updated in place, no duplicates', priceBook.length === before && res.installed === 5 && res.skipped === 1);

  /* ---- no external action occurred ---- */
  const external = supabaseLog.filter(e => !['select', 'insert', 'update', 'upsert'].includes(e.op));
  assert('runtime: no external action (no send/order/charge) in workflow', external.length === 0 && toasts.every(t => !/sent|ordered|charged/i.test(t)));

  const failed = checks.filter(c => !c.pass);
  if (failed.length) {
    console.error(JSON.stringify({ status: 'FAIL', failed: failed.map(c => c.name) }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: 'PASS', checks: checks.length, scope: 'machine-shop vertical: toggle gating, RFQ->quote->PO->QC->ship->reorder, template installer' }, null, 2));
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
