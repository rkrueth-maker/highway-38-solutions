/* ---- Human document numbers (Wave 1A, 2026-10-31) ----
 * One display rule for the whole Office: a raw internal id (LOCAL-…,
 * H38-<digits>, QUOTE-<hex> record keys) is NEVER a document number.
 * Quotes, invoices and jobs always show a human number:
 *   - the record's stored number when it is already human
 *     (Q-2026-2077, DEMO-Q-206, DEMO-I-301, …), otherwise
 *   - a number derived deterministically from the loaded snapshot,
 *     following the same Q-<year>-<seq> shape quote-ai-draft-persistence.js
 *     assigns at save time: existing human numbers keep their sequence
 *     space, and records without one are numbered after them in
 *     created-time order. The derivation is stable for a given snapshot,
 *     so every surface (Workbench panes, lists, timelines, tasks, the
 *     customer preview) shows the SAME number for the same record.
 * Save paths that used to stamp LOCAL-<timestamp> as the number call
 * nextNumber() here (or the P0 humanQuoteNumber) instead, so new
 * records are born with a human number.
 *
 * Module intake (MODULE_PERFORMANCE_STANDARD): authenticated web app,
 * shared display utility. Canonical owner: this file. No module key,
 * no route, no API action, no server reads — it reads only the
 * already-loaded snapshot. No writes, no external actions. Load:
 * deferred core script in index.html, before the Workbench panes.
 */
(function () {
  'use strict';
  if (window.H38_HUMAN_NUMBERS) return;
  var BUILD = '20261031-wave1a-1';

  function text(v) { return String(v == null ? '' : v).trim(); }
  function src(row) { return row && row.payload && typeof row.payload === 'object' ? row.payload : (row || {}); }
  function val(row) {
    var s = src(row);
    for (var i = 1; i < arguments.length; i++) {
      var k = arguments[i];
      if (s && s[k] !== undefined && s[k] !== null && s[k] !== '') return s[k];
    }
    return '';
  }
  function isHuman(v) {
    var n = text(v);
    if (!n) return false;
    if (/^LOCAL-/i.test(n)) return false;
    if (/^H38-\d+$/i.test(n)) return false;
    if (/^(QUOTE|JOB|INVOICE|TASK|CUSTOMER|SCHEDULE)-[A-Z0-9]{4,}/i.test(n)) return false;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(n)) return false;
    return true;
  }
  var KINDS = {
    quotes: { numKeys: ['Quote Number', 'quoteNumber'], idKeys: ['Quote ID', 'quoteId'], prefix: 'Q', pattern: /^Q-(\d{4})-(\d+)$/ },
    invoices: { numKeys: ['Invoice Number', 'invoiceNumber'], idKeys: ['Invoice ID', 'invoiceId'], prefix: 'I', pattern: /^I-(\d{4})-(\d+)$/ },
    jobs: { numKeys: ['Job Number', 'jobNumber'], idKeys: ['Job ID', 'jobId'], prefix: 'J', pattern: /^J-(\d{4})-(\d+)$/ }
  };
  function snapRows(collection) {
    try {
      var s = window.state && window.state.snapshot;
      return s && Array.isArray(s[collection]) ? s[collection] : [];
    } catch (e) { return []; }
  }
  function yearOf(row) {
    var created = text(val(row, 'Created Time', 'createdTime', 'Invoice Date', 'invoiceDate'));
    var d = created ? new Date(created) : null;
    if (d && Number.isFinite(d.getTime())) return d.getFullYear();
    var joined = text(val(row, 'Quote Number', 'quoteNumber')) + ' ' + text(val(row, 'Invoice Number', 'invoiceNumber')) + ' ' + text(val(row, 'Job Number', 'jobNumber'));
    var m = /LOCAL-(\d{10,})/i.exec(joined);
    if (m) { var dd = new Date(Number(m[1])); if (Number.isFinite(dd.getTime())) return dd.getFullYear(); }
    return new Date().getFullYear();
  }

  /* Derived assignments per collection, cached against the snapshot
     array identity so every surface in one render pass agrees. */
  var cache = {};
  function assignments(collection) {
    var kind = KINDS[collection]; if (!kind) return {};
    var rows = snapRows(collection);
    var hit = cache[collection];
    if (hit && hit.rows === rows) return hit.map;
    var map = {};
    var baseByYear = {};
    rows.forEach(function (row) {
      var stored = text(val.apply(null, [row].concat(kind.numKeys)));
      var m = kind.pattern.exec(stored);
      if (m) { var y = Number(m[1]); baseByYear[y] = Math.max(baseByYear[y] || 0, Number(m[2])); }
    });
    var pending = rows.filter(function (row) {
      return !isHuman(text(val.apply(null, [row].concat(kind.numKeys))));
    });
    pending.sort(function (a, b) {
      var ca = text(val(a, 'Created Time', 'createdTime')), cb = text(val(b, 'Created Time', 'createdTime'));
      if (ca !== cb) return ca < cb ? -1 : 1;
      var ia = text(val.apply(null, [a].concat(kind.idKeys))), ib = text(val.apply(null, [b].concat(kind.idKeys)));
      return ia < ib ? -1 : ia > ib ? 1 : 0;
    });
    var seqByYear = {};
    pending.forEach(function (row) {
      var y = yearOf(row);
      var seq = (seqByYear[y] != null ? seqByYear[y] : (baseByYear[y] || 0)) + 1;
      seqByYear[y] = seq;
      var id = text(val.apply(null, [row].concat(kind.idKeys)));
      if (id) map[id] = kind.prefix + '-' + y + '-' + String(seq).padStart(4, '0');
    });
    cache[collection] = { rows: rows, map: map };
    return map;
  }
  function fallbackFromToken(stored, collection) {
    var kind = KINDS[collection] || KINDS.quotes;
    var m = /^LOCAL-(\d{10,})/i.exec(text(stored));
    if (m) {
      var d = new Date(Number(m[1]));
      var y = Number.isFinite(d.getTime()) ? d.getFullYear() : new Date().getFullYear();
      return kind.prefix + '-' + y + '-' + String(Number(m[1]) % 10000).padStart(4, '0');
    }
    return kind.prefix + '-' + new Date().getFullYear() + '-0001';
  }
  function numberFor(collection, row) {
    var kind = KINDS[collection]; if (!kind || !row) return '';
    var stored = text(val.apply(null, [row].concat(kind.numKeys)));
    if (isHuman(stored)) return stored;
    var id = text(val.apply(null, [row].concat(kind.idKeys)));
    if (id) {
      var map = assignments(collection);
      if (map[id]) return map[id];
    }
    if (stored) return fallbackFromToken(stored, collection);
    return '';
  }
  function nextNumber(collection) {
    var kind = KINDS[collection]; if (!kind) return '';
    var year = new Date().getFullYear();
    var max = 0;
    snapRows(collection).forEach(function (row) {
      var stored = text(val.apply(null, [row].concat(kind.numKeys)));
      var m = kind.pattern.exec(stored);
      if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]));
    });
    Object.keys(assignments(collection)).forEach(function (id) {
      var m = kind.pattern.exec(assignments(collection)[id]);
      if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]));
    });
    var seq = max + 1;
    if (seq < 1000) seq = 1000 + seq;
    return kind.prefix + '-' + year + '-' + String(seq).padStart(4, '0');
  }
  /* Replace any LOCAL-… token in user-visible text (task titles are
     named by a database trigger from the quote's number at shell-save
     time, so stored titles can carry the raw id). Resolution order:
     the task's linked quote, then any record whose stored number IS
     the token, then a deterministic token-derived number. */
  function scrubText(value, taskRow) {
    var out = text(value);
    if (!/LOCAL-/i.test(out)) return out;
    var linked = '';
    if (taskRow) {
      var qid = text(val(taskRow, 'Quote ID', 'Linked Record ID', 'quoteId'));
      if (qid) {
        var q = snapRows('quotes').find(function (r) { return text(val(r, 'Quote ID', 'quoteId')) === qid; });
        if (q) linked = numberFor('quotes', q);
      }
    }
    return out.replace(/LOCAL-[A-Za-z0-9-]+/gi, function (token) {
      if (linked) return linked;
      var collections = ['quotes', 'invoices', 'jobs'];
      for (var ci = 0; ci < collections.length; ci++) {
        var kind = KINDS[collections[ci]];
        var found = snapRows(collections[ci]).find(function (r) {
          return text(val.apply(null, [r].concat(kind.numKeys))).toLowerCase() === token.toLowerCase();
        });
        if (found) return numberFor(collections[ci], found);
      }
      var kindHint = /invoice/i.test(out) ? 'invoices' : (/job/i.test(out) ? 'jobs' : 'quotes');
      return fallbackFromToken(token, kindHint);
    });
  }

  window.H38_HUMAN_NUMBERS = Object.freeze({
    build: BUILD,
    isHuman: isHuman,
    numberFor: numberFor,
    quoteNumber: function (row) { return numberFor('quotes', row); },
    invoiceNumber: function (row) { return numberFor('invoices', row); },
    jobNumber: function (row) { return numberFor('jobs', row); },
    nextNumber: nextNumber,
    nextQuoteNumber: function () { return nextNumber('quotes'); },
    nextInvoiceNumber: function () { return nextNumber('invoices'); },
    nextJobNumber: function () { return nextNumber('jobs'); },
    scrubText: scrubText
  });
})();
