/* ============================================================================
 * H38 Signed quote acceptance — the signature panel on the Office quote
 * record. When a customer accepts a quote in the portal by typing their
 * name (Owner Controls: "Signed quote acceptance + deposit"), the portal
 * edge function stores the signature on the quote and creates ONE deposit
 * invoice. This module shows that stored acceptance on the quote record in
 * the Office: who signed, when, which exact revision, and the deposit
 * invoice it created.
 * ----------------------------------------------------------------------------
 * Module intake (MODULE_PERFORMANCE_STANDARD):
 *   - Canonical route: the existing Quotes workspace ('quotes'); this
 *     module is a secondary, on-demand surface loaded only with the Quotes
 *     script group (h38-script-loader PAGE_QUOTES). Nothing is added to
 *     startup or to Today.
 *   - Data sources: the already-hydrated snapshot only (quotes + invoices).
 *     Zero new server reads at render.
 *   - Read-only: this panel never writes. The signature and the deposit
 *     invoice are created server-side by the portal at signing time; the
 *     deposit itself is recorded in Money against the deposit invoice
 *     (Venmo, Cash App, check or cash — the normal manual rails).
 *   - Visibility: the card renders only while a quote is open in the
 *     builder AND that quote's record carries a stored signature
 *     ("Signed By Name"). Quotes accepted the manual way (owner-recorded)
 *     or before this feature existed show nothing extra — the builder is
 *     unchanged for them.
 * ========================================================================== */
(function() {
'use strict';
if (typeof window === 'undefined') return;

var BUILD = '20261027-signed-deposit-1';
var w = window;

/* ---------- helpers (same fallbacks as portal-requests) ---------- */
function text(v) { return String(v == null ? '' : v).trim(); }
function esc(s) {
  if (typeof w.esc === 'function') return w.esc(s);
  return text(s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function v(row) {
  var keys = Array.prototype.slice.call(arguments, 1);
  if (typeof w.v === 'function') return w.v.apply(w, [row].concat(keys));
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return '';
}
function num(x) {
  if (typeof w.num === 'function') return w.num(x);
  var n = Number(x); return Number.isFinite(n) ? n : 0;
}
function money(x) {
  if (typeof w.money === 'function') return w.money(x);
  var n = Number(x) || 0;
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function records(name) {
  if (typeof w.records === 'function') return w.records(name) || [];
  var s = w.state || {};
  return (s.snapshot && s.snapshot[name]) || [];
}
function fmtWhen(iso) {
  if (typeof w.dateTime === 'function') { try { return w.dateTime(iso); } catch (e) {} }
  var d = new Date(iso);
  return Number.isNaN(d.getTime()) ? text(iso) : d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/* ---------- data ---------- */
function openQuoteRecord() {
  var st = w.state || {};
  if (st.page !== 'quotes' || st.quoteView !== 'builder') return null;
  var qid = text(st.quote && st.quote.quoteId);
  if (!qid) return null;
  var quotes = records('quotes');
  for (var i = 0; i < quotes.length; i++) {
    if (text(v(quotes[i], 'Quote ID', 'quoteId')) === qid) return quotes[i];
  }
  return null;
}
function depositInvoiceOf(quote) {
  var invId = text(v(quote, 'Deposit Invoice ID', 'depositInvoiceId'));
  if (!invId) return null;
  var invoices = records('invoices');
  for (var i = 0; i < invoices.length; i++) {
    if (text(v(invoices[i], 'Invoice ID', 'invoiceId')) === invId) return invoices[i];
  }
  return null;
}

/* ---------- render ---------- */
var ui = { sig: '' };

function signature() {
  var q = openQuoteRecord();
  if (!q || !text(v(q, 'Signed By Name', 'signedByName'))) return '';
  return [
    text(v(q, 'Quote ID', 'quoteId')),
    text(v(q, 'Signed By Name', 'signedByName')),
    text(v(q, 'Signed At', 'signedAt')),
    text(v(q, 'Deposit Invoice ID', 'depositInvoiceId')),
  ].join('|');
}

function cardHtml(quote) {
  var signer = text(v(quote, 'Signed By Name', 'signedByName'));
  var signedAt = text(v(quote, 'Signed At', 'signedAt'));
  var signedRev = num(v(quote, 'Signed Revision', 'signedRevision'));
  var pct = num(v(quote, 'Deposit Percent', 'depositPercent'));
  var amount = num(v(quote, 'Deposit Amount', 'depositAmount'));
  var inv = depositInvoiceOf(quote);
  var invLine = '';
  if (inv) {
    var invNum = text(v(inv, 'Invoice Number', 'invoiceNumber')) || text(v(inv, 'Invoice ID', 'invoiceId'));
    var invStatus = text(v(inv, 'Status', 'status'));
    var invBalance = num(v(inv, 'Balance', 'balance'));
    invLine = '<div class="h38-qsa-meta">Deposit invoice ' + esc(invNum) + ' — ' + esc(invStatus || 'Draft') +
      (invBalance > 0 ? ', balance ' + money(invBalance) : ', paid in full') +
      '. Record the deposit in Money (Venmo, Cash App, check or cash).</div>';
  } else if (amount > 0) {
    invLine = '<div class="h38-qsa-meta">Deposit invoice ' + esc(text(v(quote, 'Deposit Invoice ID', 'depositInvoiceId'))) + ' was created on signing.</div>';
  }
  return '<h2>✍️ Signed acceptance</h2>' +
    '<div class="h38-qsa-meta">Signed by <strong>' + esc(signer) + '</strong>' +
    (signedAt ? ' · ' + esc(fmtWhen(signedAt)) : '') +
    ' · typed-name signature' +
    (signedRev ? ' · accepted revision ' + signedRev : '') +
    '</div>' +
    (amount > 0
      ? '<div class="h38-qsa-meta">Deposit: ' + esc(String(pct)) + '% of the quote total = <strong>' + money(amount) + '</strong></div>' + invLine
      : '<div class="h38-qsa-meta">No deposit was due on this signing.</div>');
}

var styleInjected = false;
function ensureStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  var css = [
    '.h38-qsa-card{margin-bottom:16px;border-left:4px solid #126132}',
    '.h38-qsa-meta{font-size:.95em;color:#444;margin-top:4px}'
  ].join('\n');
  var el = document.createElement('style');
  el.setAttribute('data-h38-quote-signed-acceptance', '1');
  el.textContent = css;
  document.head.appendChild(el);
}

/* ---------- page hook ---------- */
function hook(force) {
  if (typeof document === 'undefined') return;
  var card = document.getElementById('h38QuoteSignedAcceptance');
  var sig = signature();
  if (!sig) {
    if (card) card.remove();
    ui.sig = '';
    return;
  }
  var main = document.getElementById('mainContent');
  if (!main) return;
  ensureStyle();
  var quote = openQuoteRecord();
  if (!card) {
    card = document.createElement('section');
    card.className = 'card h38-qsa-card';
    card.id = 'h38QuoteSignedAcceptance';
    main.prepend(card);
    card.innerHTML = cardHtml(quote);
    ui.sig = sig;
    return;
  }
  if (force || sig !== ui.sig) {
    card.innerHTML = cardHtml(quote);
    ui.sig = sig;
  }
}

/* ---------- boot ---------- */
var booted = false;
function start() {
  if (booted) return;
  booted = true;
  if (typeof MutationObserver !== 'undefined') {
    var raf = false;
    new MutationObserver(function() {
      if (raf) return;
      raf = true;
      requestAnimationFrame(function() { raf = false; try { hook(false); } catch (e) {} });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  try { w.addEventListener('h38:business-snapshot-updated', function() { try { hook(false); } catch (e) {} }); } catch (e) {}
  hook(false);
  w.H38QuoteSignedAcceptance = Object.freeze({ build: BUILD, refresh: function() { hook(true); } });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
})();
