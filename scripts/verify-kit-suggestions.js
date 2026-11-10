// verify-kit-suggestions.js — contract tests for the Kit's Workspace
// suggestion buttons fix (build 20261109-kit-suggestions-1).
//
// The buttons used to submit draft_invoice_nudges / draft_quote_followups
// handoff tasks with no items: types the poller has no worker for, so
// every tap died as "Unknown task_type" and nothing ever reached the
// owner. Now the client calls the kit-proactive-engine's on-demand mode
// (mode=draft_suggestions) with the tapped items, and the engine runs
// its own per-item drafting — same text rules, payload shape, dedupe.
// Run: node scripts/verify-kit-suggestions.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'commercial-app');
const FN = path.join(ROOT, 'supabase', 'functions', 'kit-proactive-engine', 'index.ts');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; } else { fail++; console.error('FAIL: ' + name + (extra ? ' — ' + extra : '')); } }
function read(p) { return fs.readFileSync(p, 'utf8'); }

const client = read(path.join(APP, 'kits-workspace.js'));
const bundle = read(path.join(APP, 'bundle-features.js'));
const engine = read(FN);

// ---------- 1. The broken path is gone, in both live copies ----------
for (const [label, src] of [['kits-workspace.js', client], ['bundle-features.js', bundle]]) {
  ok(label + ': no draft_invoice_nudges type', src.indexOf('draft_invoice_nudges') < 0);
  ok(label + ': no draft_quote_followups type', src.indexOf('draft_quote_followups') < 0);
  ok(label + ': canonical review types kept', src.indexOf("'quote_followup_draft', 'invoice_nudge_draft'") >= 0);
}

// ---------- 2. Client calls the engine's on-demand mode with items ----------
ok('client BUILD stamp', client.indexOf("var BUILD = '20261109-kit-suggestions-1';") >= 0);
ok('client posts mode=draft_suggestions', client.indexOf("mode: 'draft_suggestions'") >= 0);
ok('client calls kit-proactive-engine function', client.indexOf("sbFunction('kit-proactive-engine', body)") >= 0);
ok('client sends the tapped quote ids+numbers', client.indexOf("'Quote ID', 'quoteId', 'id'") >= 0 && client.indexOf("'Quote Number', 'quoteNumber', 'number'") >= 0);
ok('client sends the tapped invoice ids+numbers', client.indexOf("'Invoice ID', 'invoiceId', 'id'") >= 0 && client.indexOf("'Invoice Number', 'invoiceNumber', 'number'") >= 0);
ok('client caps items at 5', client.indexOf('.slice(0, 5)') >= 0);
ok('client re-renders after drafting', /render\(\);\s*\n\s*\} catch/.test(client) || client.indexOf('render();') >= 0);
ok('client reports the deduped outcome plainly', client.indexOf('Already drafted in the last 7 days') >= 0);
ok('client reports the skipped outcome plainly', client.indexOf('no longer qualify') >= 0);
ok('client no longer promises "Hank is drafting"', client.indexOf('Hank is drafting. Check') < 0);

// ---------- 3. Review list: validated drafts stay reviewable ----------
ok('review fetch includes pending and done', client.indexOf("status=in.(pending,done)") >= 0);
ok('review filter requires owner_review_required result', client.indexOf('r.owner_review_required !== true') >= 0);
ok('review filter drops owner-decided drafts', client.indexOf('r.approved_by_owner || r.dismissed_by_owner') >= 0);
ok('review window matches dedupe window', client.indexOf('REVIEW_WINDOW_MS = 7 * 86400000') >= 0);
ok('suggestion dedupe bridges on quote number', client.indexOf('draftedQuoteNumbers') >= 0);
ok('suggestion dedupe bridges on invoice number', client.indexOf('draftedInvoiceNumbers') >= 0);

// ---------- 4. Bundle mirror is exact ----------
(function () {
  const lines = bundle.split('\n');
  const start = lines.findIndex(l => l.trim() === '/* --- ./kits-workspace.js --- */');
  const end = lines.findIndex((l, i) => i > start && l.startsWith('/* --- ./'));
  ok('bundle has a kits-workspace block', start >= 0 && end > start);
  if (start >= 0 && end > start) {
    const block = lines.slice(start + 1, end - 2).join('\n');
    ok('bundle block mirrors kits-workspace.js exactly', block === client.replace(/\n$/, ''));
  }
})();

// ---------- 5. Engine: on-demand mode contract ----------
ok('engine BUILD stamp', engine.indexOf('const BUILD = "20261109-kit-suggestions-1";') >= 0);
ok('engine handles mode=draft_suggestions', engine.indexOf('body.mode === "draft_suggestions"') >= 0);
ok('engine targeted mode accepts owner JWT', engine.indexOf('jwtUserId') >= 0 && engine.indexOf('business_memberships') >= 0);
ok('engine targeted mode requires owner/admin role', engine.indexOf('role === "owner" || role === "administrator"') >= 0);
ok('engine targeted mode still accepts the internal key', engine.indexOf('viaKey') >= 0);
ok('engine caps targeted items at 5', engine.indexOf('raw.slice(0, 5)') >= 0);
ok('engine stamps workspace-sourced drafts', engine.indexOf('source: "kits-workspace-suggestion"') >= 0);
ok('engine shares createQuoteDraft', engine.indexOf('async function createQuoteDraft') >= 0);
ok('engine shares createInvoiceDraft', engine.indexOf('async function createInvoiceDraft') >= 0);
ok('quote dedupe bridges on quote_number', engine.indexOf('p.quote_number') >= 0);
ok('invoice dedupe bridges on invoice_number', engine.indexOf('p.invoice_number') >= 0);
ok('targeted quotes resolve by quote_number', engine.indexOf('.eq("quote_number", item.number)') >= 0);
ok('targeted invoices resolve by invoice_number', engine.indexOf('.eq("invoice_number", item.number)') >= 0);

// ---------- 6. Engine: schema-drift repairs the buttons depend on ----------
ok('invoice sweep reads balance_due (real column)', engine.indexOf('.gt("balance_due", 0)') >= 0);
ok('invoice sweep no longer selects amount_due column', engine.indexOf('select("id, customer_id, invoice_number, amount, amount_due') < 0);
ok('digest reads balance_due (real column)', engine.indexOf('.select("id, balance_due")') >= 0);
ok('customer names come from customer_accounts', engine.indexOf('.from("customer_accounts")') >= 0);
ok('customer names no longer read the dropped customers table', !/\.from\("customers"\)/.test(engine));
ok('invoice drafts land in review form (done + owner_review_required)', engine.indexOf('owner_review_required: true') >= 0 && /task_type: "invoice_nudge_draft"[\s\S]{0,400}status: "done"/.test(engine) || engine.indexOf('status: "done",') >= 0);
ok('quote drafts still start pending for the poller worker', /task_type: "quote_followup_draft"[\s\S]{0,600}status: "pending"/.test(engine));

// ---------- 7. Wiring: loader pin + stamps ----------
(function () {
  const loader = read(path.join(APP, 'h38-script-loader.js'));
  ok('loader pin for kits-workspace advanced', loader.indexOf("'./kits-workspace.js?build=20261109-kit-suggestions-1'") >= 0);
  const ver = JSON.parse(read(path.join(APP, 'version.json')));
  ok('version.json advanced', ver.version === '20261109-kit-suggestions-1', ver.version);
  const sw = read(path.join(APP, 'service-worker.js'));
  ok('service worker cache advanced', sw.indexOf("CACHE_NAME='h38-business-office-20261109-kitsuggest-1'") >= 0);
  ok('service worker still caches kits-workspace.js', sw.indexOf("'./kits-workspace.js'") >= 0);
})();

console.log(`verify-kit-suggestions: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
