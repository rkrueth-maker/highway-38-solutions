/* ============================================================================
 * H38 Payment schedule on a quote (gap2) — the schedule editor on the
 * Office quote record. The owner splits the quote total into scheduled
 * payments (each a percent of the total OR a fixed amount, with a label
 * and a due trigger: on acceptance / at job start / on completion / on a
 * date). The schedule is stored on the quote payload as "Payment
 * Schedule". When the customer signs acceptance in the portal, the portal
 * edge function turns the schedule into invoices: the on-acceptance entry
 * becomes the ONE deposit invoice (the proven signed-deposit path), and
 * each remaining entry becomes a scheduled Draft invoice with its due
 * trigger/date. Quotes without a schedule behave exactly as before.
 * ----------------------------------------------------------------------------
 * Module intake (MODULE_PERFORMANCE_STANDARD):
 *   - Canonical route: the existing Quotes workspace ('quotes'); this
 *     module is a secondary, on-demand surface loaded only with the Quotes
 *     script group (h38-script-loader PAGE_QUOTES). Nothing is added to
 *     startup or to Today.
 *   - Data sources: the already-hydrated snapshot only (quotes) at render;
 *     zero new server reads. Saving writes the one quote record through
 *     the shared Supabase client (same write path as the other Quotes
 *     group modules) and refreshes the business snapshot.
 *   - Math: the parts must add up to the quote total. The editor shows
 *     the remainder while editing and refuses to save an unreconciled
 *     schedule; the portal re-validates at signing time.
 *   - A signed quote's schedule is locked: signing pins the schedule of
 *     the exact accepted revision, and later edits never change invoices
 *     that were already generated.
 * ========================================================================== */
(function() {
'use strict';
if (typeof window === 'undefined') return;

var BUILD = '20261107-polish-a1-quote-1';
var w = window;

/* ---------- helpers (same fallbacks as quote-signed-acceptance) ---------- */
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
function round2(x) { return Math.round((Number(x) || 0) * 100) / 100; }
function records(name) {
  if (typeof w.records === 'function') return w.records(name) || [];
  var s = w.state || {};
  return (s.snapshot && s.snapshot[name]) || [];
}
function bid() {
  var st = w.state || {};
  var auth = (w.H38_SUPABASE_AUTH && w.H38_SUPABASE_AUTH.getState) ? w.H38_SUPABASE_AUTH.getState() : {};
  return text(st.businessId || auth.selectedBusinessId || '');
}
function actor() {
  var auth = (w.H38_SUPABASE_AUTH && w.H38_SUPABASE_AUTH.getState) ? w.H38_SUPABASE_AUTH.getState() : {};
  return text(auth.userId || (auth.user && auth.user.id) || '');
}
function db() {
  return (w.H38_SUPABASE_SHARED_CLIENT && w.H38_SUPABASE_SHARED_CLIENT.ensure) ? w.H38_SUPABASE_SHARED_CLIENT.ensure() : null;
}

/* ---------- schedule model (mirrors the portal edge function) ---------- */
var TRIGGERS = [
  { id: 'acceptance', label: 'On acceptance — deposit' },
  { id: 'job_start', label: 'At job start' },
  { id: 'completion', label: 'On completion' },
  { id: 'date', label: 'On a date' },
];
function triggerLabel(t, dueDate) {
  if (t === 'acceptance') return 'Due on acceptance';
  if (t === 'job_start') return 'Due at job start';
  if (t === 'completion') return 'Due on completion';
  if (t === 'date') return dueDate ? 'Due ' + dueDate : 'Due on date';
  return String(t || '');
}
function storedEntries(quote) {
  var raw = v(quote, 'Payment Schedule', 'paymentSchedule');
  if (!Array.isArray(raw)) return [];
  return raw.map(function(e) {
    e = e || {};
    return {
      label: text(e.label || e.Label),
      basis: text(e.basis || e.Basis) === 'amount' ? 'amount' : 'percent',
      percent: num(e.percent || e.Percent),
      amount: num(e.amount || e.Amount),
      trigger: text(e.trigger || e.Trigger) || 'completion',
      dueDate: text(e.dueDate || e['Due Date']),
    };
  });
}
function entryAmount(entry, total) {
  return entry.basis === 'amount' ? round2(entry.amount) : round2(total * entry.percent / 100);
}
/* Resolve + validate a draft against a total. Returns
 * { entries:[{...entry, amount}], sum, remainder, problems:[...] }.
 * A rounding remainder of <= 5 cents is absorbed by the last entry. */
function resolveDraft(entries, total) {
  var problems = [];
  var resolved = entries.map(function(e, i) {
    var c = { label: text(e.label), basis: e.basis === 'amount' ? 'amount' : 'percent',
      percent: num(e.percent), amount: num(e.amount), trigger: text(e.trigger) || 'completion',
      dueDate: text(e.dueDate), index: i };
    c.resolvedAmount = entryAmount(c, total);
    if (!c.label) problems.push('Payment ' + (i + 1) + ' needs a name.');
    if (c.basis === 'percent' && !(c.percent > 0 && c.percent <= 100)) problems.push('"' + (c.label || 'Payment ' + (i + 1)) + '" needs a percent between 0 and 100.');
    if (c.basis === 'amount' && !(c.amount > 0)) problems.push('"' + (c.label || 'Payment ' + (i + 1)) + '" needs an amount over $0.');
    if (c.trigger === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(c.dueDate)) problems.push('"' + (c.label || 'Payment ' + (i + 1)) + '" needs a due date.');
    return c;
  });
  var deposits = resolved.filter(function(e) { return e.trigger === 'acceptance'; });
  if (resolved.length && deposits.length !== 1) {
    problems.push('The schedule needs exactly one payment due on acceptance — that one is the deposit.');
  }
  var sum = round2(resolved.reduce(function(s, e) { return s + e.resolvedAmount; }, 0));
  var remainder = round2(total - sum);
  if (resolved.length && remainder !== 0 && Math.abs(remainder) <= 0.05) {
    resolved[resolved.length - 1].resolvedAmount = round2(resolved[resolved.length - 1].resolvedAmount + remainder);
    sum = round2(resolved.reduce(function(s, e) { return s + e.resolvedAmount; }, 0));
    remainder = round2(total - sum);
  }
  return { entries: resolved, sum: sum, remainder: remainder, problems: problems,
    valid: resolved.length > 0 && !problems.length && remainder === 0 };
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
function quoteTotal(quote) { return round2(num(v(quote, 'Total', 'total'))); }
function isSigned(quote) { return !!text(v(quote, 'Signed By Name', 'signedByName')); }

/* ---------- ui state ---------- */
var ui = { quoteId: '', draft: null, dirty: false, status: '', sig: '' };

function storedSig(quote) {
  return [text(v(quote, 'Quote ID', 'quoteId')), JSON.stringify(storedEntries(quote)),
    String(quoteTotal(quote)), text(v(quote, 'Signed By Name', 'signedByName')),
    text(v(quote, 'Payment Schedule Status', 'paymentScheduleStatus'))].join('|');
}
function ensureDraft(quote) {
  var qid = text(v(quote, 'Quote ID', 'quoteId'));
  if (ui.quoteId !== qid) {
    ui.quoteId = qid;
    ui.draft = storedEntries(quote);
    ui.dirty = false;
    ui.status = '';
  }
  return ui.draft;
}

/* ---------- render ---------- */
function rowHtml(entry, i, locked) {
  var trigOpts = TRIGGERS.map(function(t) {
    return '<option value="' + t.id + '"' + (entry.trigger === t.id ? ' selected' : '') + '>' + t.label + '</option>';
  }).join('');
  var basisOpts = '<option value="percent"' + (entry.basis === 'percent' ? ' selected' : '') + '>% of total</option>' +
    '<option value="amount"' + (entry.basis === 'amount' ? ' selected' : '') + '>$ amount</option>';
  return '<div class="h38-qps-row" data-qps-row="' + i + '">' +
    '<input type="text" data-qps="label" value="' + esc(entry.label) + '" placeholder="Name this payment — e.g. Deposit" aria-label="Payment name"' + (locked ? ' disabled' : '') + '>' +
    '<select data-qps="basis" aria-label="Percent or amount"' + (locked ? ' disabled' : '') + '>' + basisOpts + '</select>' +
    '<input type="number" min="0" step="0.01" data-qps="value" value="' + esc(entry.basis === 'amount' ? (entry.amount || '') : (entry.percent || '')) + '" placeholder="' + (entry.basis === 'amount' ? '$' : '%') + '" aria-label="Percent or amount value"' + (locked ? ' disabled' : '') + '>' +
    '<select data-qps="trigger" aria-label="When is it due"' + (locked ? ' disabled' : '') + '>' + trigOpts + '</select>' +
    '<input type="date" data-qps="dueDate" value="' + esc(entry.dueDate || '') + '" aria-label="Due date"' + (entry.trigger === 'date' && !locked ? '' : ' disabled') + '>' +
    (locked ? '' : '<button type="button" class="secondary" data-qps-remove="' + i + '">Remove</button>') +
    '</div>';
}
function cardHtml(quote) {
  var total = quoteTotal(quote);
  var locked = isSigned(quote);
  var draft = ensureDraft(quote);
  var res = resolveDraft(draft, total);
  var head = '<h2>💳 Payment schedule</h2>';
  if (locked) {
    var stored = storedEntries(quote);
    var sres = resolveDraft(stored, total);
    var list = sres.entries.map(function(e) {
      return '<div class="h38-qps-meta">' + esc(e.label) + ' — <strong>' + money(e.resolvedAmount) + '</strong> · ' + esc(triggerLabel(e.trigger, e.dueDate)) + '</div>';
    }).join('');
    return head +
      '<div class="h38-qps-meta">This quote was signed by <strong>' + esc(text(v(quote, 'Signed By Name', 'signedByName'))) + '</strong>. Its schedule is locked to the signed version — the invoices it created do not change if the quote is edited later.</div>' +
      (stored.length ? list : '<div class="h38-qps-meta">No payment schedule — a single deposit invoice was created on signing.</div>') +
      (text(v(quote, 'Payment Schedule Status', 'paymentScheduleStatus'))
        ? '<div class="h38-qps-meta">' + esc(text(v(quote, 'Payment Schedule Status', 'paymentScheduleStatus'))) + '</div>' : '');
  }
  var rows = draft.map(function(e, i) { return rowHtml(e, i, false); }).join('');
  var sumLine;
  if (!draft.length) {
    sumLine = '<div class="h38-qps-meta">No schedule yet. Without one, signing creates a single deposit invoice (' +
      esc(String(num(v(quote, 'Deposit Percent', 'depositPercent')) || 50)) + '% by default). Add payments to split the total.</div>';
  } else if (res.valid) {
    sumLine = '<div class="h38-qps-meta">Adds up: ' + money(res.sum) + ' of ' + money(total) + ' ✓ — the on-acceptance payment becomes the deposit invoice; the rest become scheduled invoices when the customer signs.</div>';
  } else {
    sumLine = '<div class="h38-qps-meta">Scheduled ' + money(res.sum) + ' of ' + money(total) + ' — <strong>' +
      (res.remainder > 0 ? money(res.remainder) + ' left to schedule' : money(-res.remainder) + ' over the total') + '</strong> Adjust the payments above until they add up to the quote total \u2014 Save stays off until they do.</div>' +
      (res.problems.length ? '<div class="h38-qps-meta">' + res.problems.map(esc).join(' ') + '</div>' : '');
  }
  return head + rows +
    '<div class="h38-qps-actions">' +
    '<button type="button" class="secondary" data-qps-add>Add a payment</button>' +
    '<button type="button" data-qps-save' + (res.valid && ui.dirty ? '' : ' disabled') + '>Save payment schedule</button>' +
    (storedEntries(quote).length ? '<button type="button" class="secondary" data-qps-clear>Remove schedule</button>' : '') +
    '</div>' + sumLine +
    (ui.status ? '<div class="h38-qps-meta"><strong>' + esc(ui.status) + '</strong></div>' : '');
}

var styleInjected = false;
function ensureStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  var css = [
    '.h38-qps-card{margin-bottom:16px;border-left:4px solid #1c5d8f}',
    '.h38-qps-meta{font-size:.95em;color:#444;margin-top:6px}',
    '.h38-qps-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px}',
    '.h38-qps-row input[type=text]{flex:2 1 150px}',
    '.h38-qps-row input[type=number]{flex:0 1 90px}',
    '.h38-qps-row select{flex:1 1 130px}',
    '.h38-qps-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
    '.h38-qps-row input,.h38-qps-row select,.h38-qps-row button{min-height:44px}',
    '.h38-qps-actions button{min-height:44px}',
  ].join('\n');
  var el = document.createElement('style');
  el.setAttribute('data-h38-quote-payment-schedule', '1');
  el.textContent = css;
  document.head.appendChild(el);
}

/* ---------- interactions ---------- */
function syncDraftFromDom(card) {
  var rows = card.querySelectorAll('[data-qps-row]');
  var out = [];
  rows.forEach(function(rowEl) {
    var basis = rowEl.querySelector('[data-qps="basis"]').value;
    var rawVal = Number(rowEl.querySelector('[data-qps="value"]').value) || 0;
    out.push({
      label: rowEl.querySelector('[data-qps="label"]').value,
      basis: basis,
      percent: basis === 'percent' ? rawVal : 0,
      amount: basis === 'amount' ? rawVal : 0,
      trigger: rowEl.querySelector('[data-qps="trigger"]').value,
      dueDate: rowEl.querySelector('[data-qps="dueDate"]').value,
    });
  });
  ui.draft = out;
  ui.dirty = true;
}
function refresh(card, quote) {
  ui.sig = storedSig(quote);
  card.innerHTML = cardHtml(quote);
}
async function saveSchedule(clear) {
  var quote = openQuoteRecord();
  if (!quote) return;
  var qid = text(v(quote, 'Quote ID', 'quoteId'));
  var total = quoteTotal(quote);
  var entries = clear ? [] : resolveDraft(ui.draft || [], total).entries.map(function(e) {
    return { label: e.label, basis: e.basis, percent: e.basis === 'percent' ? e.percent : 0,
      amount: e.basis === 'amount' ? e.amount : 0, trigger: e.trigger, dueDate: e.trigger === 'date' ? e.dueDate : '' };
  });
  var c = db();
  if (!c || !bid() || !actor()) { ui.status = 'Sign in to save the schedule.'; rerender(); return; }
  ui.status = 'Saving…'; rerender();
  try {
    var found = await c.from('business_records').select('id,payload')
      .eq('business_id', bid()).eq('collection', 'quotes').eq('record_key', qid).maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) throw new Error('Quote record not found.');
    var payload = Object.assign({}, found.data.payload || {});
    if (clear) {
      delete payload['Payment Schedule'];
      delete payload['Payment Schedule Status'];
    } else {
      payload['Payment Schedule'] = entries;
      delete payload['Payment Schedule Status'];
      var dep = entries.filter(function(e) { return e.trigger === 'acceptance'; })[0];
      if (dep) {
        var depAmt = entryAmount(dep, total);
        payload['Deposit Percent'] = dep.basis === 'percent' ? dep.percent : (total > 0 ? round2(depAmt / total * 100) : 0);
      }
      // A schedule change on an already-presented quote bumps the quote
      // revision, so a customer holding the old version hits the portal's
      // "quote changed — reload" guard instead of signing a schedule
      // they never saw.
      var status = text(v(payload, 'Status', 'status')).toUpperCase();
      if (status === 'PRESENTED' || status === 'SENT') {
        if (payload['Revision'] !== undefined) payload['Revision'] = num(payload['Revision']) + 1;
        if (payload['Locked Revision'] !== undefined) payload['Locked Revision'] = num(payload['Locked Revision']) + 1;
        if (payload['Revision'] === undefined && payload['Locked Revision'] === undefined) payload['Revision'] = 2;
      }
    }
    payload['Updated Time'] = new Date().toISOString();
    var upd = await c.from('business_records').update({ payload: payload, record_status: 'active', updated_by: actor() }).eq('id', found.data.id);
    if (upd.error) throw upd.error;
    ui.dirty = false;
    ui.status = clear ? 'Schedule removed. Signing will create the single deposit invoice, as before.' : 'Schedule saved.';
    if (typeof w.loadBusiness === 'function') { try { await w.loadBusiness(bid(), true); } catch (e) {} }
  } catch (e) {
    ui.status = 'Save failed: ' + (e.message || 'unknown error');
  }
  rerender();
}
function rerender() {
  var card = document.getElementById('h38QuotePaymentSchedule');
  var quote = openQuoteRecord();
  if (card && quote) refresh(card, quote);
}
function bind(card) {
  if (card.dataset.qpsBound) return;
  card.dataset.qpsBound = '1';
  card.addEventListener('input', function(e) {
    if (!e.target.closest || !e.target.closest('#h38QuotePaymentSchedule')) return;
    syncDraftFromDom(card);
    var quote = openQuoteRecord();
    if (quote) refresh(card, quote);
    // Restore focus to the field being edited after the re-render.
    var key = e.target.getAttribute && e.target.getAttribute('data-qps');
    var rowEl = e.target.closest && e.target.closest('[data-qps-row]');
    if (key && rowEl) {
      var idx = rowEl.getAttribute('data-qps-row');
      var next = card.querySelector('[data-qps-row="' + idx + '"] [data-qps="' + key + '"]');
      if (next) { next.focus(); try { next.setSelectionRange(next.value.length, next.value.length); } catch (err) {} }
    }
  });
  card.addEventListener('change', function(e) {
    if (!e.target.closest || !e.target.closest('#h38QuotePaymentSchedule')) return;
    syncDraftFromDom(card);
    var quote = openQuoteRecord();
    if (quote) refresh(card, quote);
  });
  card.addEventListener('click', function(e) {
    var t = e.target;
    if (!t.closest) return;
    var quote = openQuoteRecord();
    if (!quote) return;
    if (t.closest('[data-qps-add]')) {
      syncDraftFromDom(card);
      var draft = ui.draft || [];
      draft.push(draft.length === 0
        ? { label: 'Deposit', basis: 'percent', percent: 30, amount: 0, trigger: 'acceptance', dueDate: '' }
        : { label: '', basis: 'percent', percent: 0, amount: 0, trigger: 'completion', dueDate: '' });
      ui.draft = draft; ui.dirty = true;
      refresh(card, quote);
    } else if (t.closest('[data-qps-remove]')) {
      syncDraftFromDom(card);
      var idx = Number(t.closest('[data-qps-remove]').getAttribute('data-qps-remove'));
      (ui.draft || []).splice(idx, 1);
      ui.dirty = true;
      refresh(card, quote);
    } else if (t.closest('[data-qps-save]')) {
      syncDraftFromDom(card);
      saveSchedule(false);
    } else if (t.closest('[data-qps-clear]')) {
      if (w.confirm('Remove the payment schedule from this quote? Signing will go back to a single deposit invoice.')) saveSchedule(true);
    }
  });
}

/* ---------- page hook ---------- */
function hook(force) {
  if (typeof document === 'undefined') return;
  var card = document.getElementById('h38QuotePaymentSchedule');
  var quote = openQuoteRecord();
  if (!quote) {
    if (card) card.remove();
    ui.sig = ''; ui.quoteId = '';
    return;
  }
  var main = document.getElementById('mainContent');
  if (!main) return;
  ensureStyle();
  var sig = storedSig(quote);
  if (!card) {
    card = document.createElement('section');
    card.className = 'card h38-qps-card';
    card.id = 'h38QuotePaymentSchedule';
    main.prepend(card);
    bind(card);
    ui.sig = '';
  }
  // While the owner is mid-edit, only our own handlers re-render (they
  // preserve the draft); snapshot-driven renders must not clobber typing.
  if (ui.dirty && !force) return;
  if (force || sig !== ui.sig) {
    ensureDraft(quote);
    refresh(card, quote);
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
  w.H38QuotePaymentSchedule = Object.freeze({ build: BUILD,
    resolveDraft: function(entries, total) {
      var r = resolveDraft(entries || [], num(total));
      return { valid: r.valid, sum: r.sum, remainder: r.remainder, problems: r.problems,
        entries: r.entries.map(function(e) { return { label: e.label, basis: e.basis, percent: e.percent, amount: e.resolvedAmount, trigger: e.trigger, dueDate: e.dueDate }; }) };
    },
    refresh: function() { hook(true); } });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
})();
