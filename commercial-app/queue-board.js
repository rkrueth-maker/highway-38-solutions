/* H38 Queue Board (gap9, 2026-11-07) — a read-only board view of work,
 * in the spirit of the ServiceM8 queue board: the day's work sorted into
 * a small set of plain queues, each card opening the EXISTING full
 * record. It is a view option inside the existing Jobs and Quotes pages
 * — not a new page, module, route, shell, or navigation tree.
 *
 * HARD LIMITS (by design):
 * - READ-ONLY: renders from the already-loaded snapshot via records();
 *   opening the board performs no server reads and no writes, and
 *   opening a card writes nothing — it only navigates through the
 *   existing record-opening paths (H38_JOB_LIFECYCLE.focusJob for jobs,
 *   window.openQuote for quotes, H38_WORKBENCH.selectInvoice / the
 *   Money page for invoices).
 * - NO status changes here and NO drag-between-queues: status changes
 *   stay where they already live, inside the record/list flows. A
 *   status changed there moves the card on the next board render
 *   (the board re-renders on h38:business-snapshot-updated while open,
 *   and always renders fresh when opened).
 * - The existing list views are untouched: the board replaces the page
 *   body only while it is open, and "List view" returns through the
 *   canonical openPage() for the host page.
 *
 * QUEUE DEFINITIONS (exact status mappings — statuses are matched
 * normalized: lower-cased, underscores read as spaces, because the
 * snapshot merges two real sources the existing list views already
 * show together: business_records (Title-Case statuses) and the
 * Customer Portal tables customer_jobs / customer_quotes /
 * customer_invoices (snake_case statuses, flagged
 * 'Supabase Portal Record'). Recountable from SQL as:
 * business_records (record_status='active') + the portal tables):
 * 1. quotes-waiting  "Quotes waiting"      quotes:  status IN ('sent','presented')
 * 2. booked          "Booked — not started" jobs:   status IN ('approved','scheduled')
 * 3. in-progress     "In progress"          jobs:   status = 'in progress' (portal: 'in_progress')
 * 4. waiting-payment "Waiting on payment"   invoices: status IN ('sent','open','partially paid')
 *                                            AND numeric Balance > 0.005
 * Deliberately off the board: Draft quotes and Draft invoices (not yet
 * sent), Lead/Quoted jobs (not yet won work), Paid invoices, and
 * Complete jobs with no open invoice (nothing waiting on anyone).
 * Soft-deleted rows (Deleted flag, or a status matching
 * DELETED/VOID/CANCELLED) are excluded everywhere, matching the
 * existing list views.
 *
 * Module intake (MODULE_PERFORMANCE_STANDARD): route: none — a view
 * option decorating the existing 'work' and 'quotes' pages. Canonical
 * module contract entry: none (view decoration of the jobs/quotes
 * modules, like workbench-shell.js; no module key, no API action).
 * Server owner: none. Client owner: this file. Today-critical: no —
 * deferred script, renders only on an explicit click. Data sources:
 * the already-loaded snapshot (records('quotes'|'jobs'|'invoices'|
 * 'customers'|'scheduleEvents')), 0 server reads, 0 startup requests.
 * Normal first render: at most 50 cards per queue (bounded; the count
 * shown is the true queue count). Cache: none — every open renders
 * from the current snapshot. Prefetch: none. External actions: none.
 * Rollback: remove this file, its CSS, and their two index.html tags.
 */
(function () {
  'use strict';

  var BUILD = '20261107-gap9-queueboard-2';
  var HOST_PAGES = { work: 1, quotes: 1 };
  var MAX_CARDS = 50;
  var boardOpen = false;
  var hostPage = 'work';

  /* Statuses are stored normalized (lower-case, underscores as spaces)
   * so the Title-Case business_records vocabulary and the snake_case
   * portal vocabulary land in the same queues. */
  var QUEUES = [
    { key: 'quotes-waiting', title: 'Quotes waiting', hint: 'Sent — waiting on the customer', collection: 'quotes', statuses: ['sent', 'presented'] },
    { key: 'booked', title: 'Booked — not started', hint: 'Won work, not yet underway', collection: 'jobs', statuses: ['approved', 'scheduled'] },
    { key: 'in-progress', title: 'In progress', hint: 'Crew is on it now', collection: 'jobs', statuses: ['in progress'] },
    { key: 'waiting-payment', title: 'Waiting on payment', hint: 'Sent invoices with money still owed', collection: 'invoices', statuses: ['sent', 'open', 'partially paid'], needsBalance: true }
  ];
  function normStatus(row) {
    return text(value(row, 'Status', 'status')).toLowerCase().replace(/_/g, ' ');
  }

  function st() { try { return window.state || null; } catch (e) { return null; } }
  function text(x) { return String(x == null ? '' : x).trim(); }
  function esc(s) {
    s = String(s == null ? '' : s);
    if (typeof window.esc === 'function') return window.esc(s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function rows(name) {
    try { if (typeof window.records === 'function') { var r = window.records(name); if (Array.isArray(r)) return r; } } catch (e) {}
    var s = st();
    return (s && s.snapshot && Array.isArray(s.snapshot[name])) ? s.snapshot[name] : [];
  }
  function value(row) {
    for (var i = 1; i < arguments.length; i++) {
      var k = arguments[i];
      if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
    }
    return '';
  }
  function num(x) { var n = Number(String(x == null ? '' : x).replace(/[$,]/g, '')); return Number.isFinite(n) ? n : 0; }
  function moneyFmt(n) {
    try { if (typeof window.money === 'function') return window.money(n); } catch (e) {}
    return Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }
  function humanNumber(collection, row) {
    try { if (window.H38_HUMAN_NUMBERS) return window.H38_HUMAN_NUMBERS.numberFor(collection, row); } catch (e) {}
    return '';
  }
  function isGone(row) {
    if (!row) return true;
    if (row.Deleted === true || String(row.Deleted || '').toLowerCase() === 'true') return true;
    return /DELET|VOID|CANCEL/.test(String(value(row, 'Status', 'status') || '').toUpperCase());
  }
  function customerName(id) {
    if (!id) return '';
    var c = rows('customers').filter(function (r) {
      return text(value(r, 'Customer ID', 'customerId', 'id')) === text(id);
    })[0];
    return c ? text(value(c, 'Customer Name', 'name')) : '';
  }
  function dateLabel(raw) {
    var s = text(raw);
    if (!s) return '';
    var d = new Date(s);
    if (!Number.isFinite(d.getTime())) return s;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      (d.getFullYear() !== new Date().getFullYear() ? ', ' + d.getFullYear() : '');
  }
  function timeOf(raw) { var d = new Date(raw || 0); var t = d.getTime(); return Number.isFinite(t) ? t : 0; }

  /* ---------- queue membership (the published status mappings) ---------- */
  function queueRows(q) {
    var all = rows(q.collection).filter(function (r) { return !isGone(r); });
    var picked = all.filter(function (r) {
      if (q.statuses.indexOf(normStatus(r)) < 0) return false;
      if (q.needsBalance && !(num(value(r, 'Balance', 'balance')) > 0.005)) return false;
      return true;
    });
    if (q.key === 'waiting-payment') {
      picked.sort(function (a, b) { return timeOf(value(a, 'Due Date', 'dueDate') || '2999-01-01') - timeOf(value(b, 'Due Date', 'dueDate') || '2999-01-01'); });
    } else if (q.collection === 'jobs') {
      picked.sort(function (a, b) {
        var da = timeOf(value(a, 'Start Date', 'Due Date') || '2999-01-01');
        var db = timeOf(value(b, 'Start Date', 'Due Date') || '2999-01-01');
        if (da !== db) return da - db;
        return timeOf(value(b, 'Updated Time')) - timeOf(value(a, 'Updated Time'));
      });
    } else {
      picked.sort(function (a, b) { return timeOf(value(b, 'Updated Time', 'Created Time')) - timeOf(value(a, 'Updated Time', 'Created Time')); });
    }
    return picked;
  }
  function counts() {
    var out = {};
    QUEUES.forEach(function (q) { out[q.key] = queueRows(q).length; });
    return out;
  }

  /* ---------- card content ---------- */
  function jobWhen(job) {
    var own = value(job, 'Start Date', 'Due Date');
    if (own) return dateLabel(own);
    var jid = text(value(job, 'Job ID', 'jobId'));
    var ev = rows('scheduleEvents').filter(function (e) {
      return text(value(e, 'Related Record ID')) === jid || text(value(e, 'Job ID', 'jobId')) === jid;
    }).sort(function (a, b) { return timeOf(value(a, 'Start Time')) - timeOf(value(b, 'Start Time')); })[0];
    return ev ? dateLabel(value(ev, 'Start Time')) : '';
  }
  function jobAmount(job) {
    var rev = num(value(job, 'Revenue', 'revenue'));
    if (rev > 0) return rev;
    var qid = text(value(job, 'Quote ID', 'Source Quote ID'));
    if (qid) {
      var q = rows('quotes').filter(function (r) { return text(value(r, 'Quote ID', 'quoteId')) === qid; })[0];
      if (q) return num(value(q, 'Total', 'total'));
    }
    return 0;
  }
  function statusLabel(row) {
    var s = text(value(row, 'Status', 'status')).replace(/_/g, ' ');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }
  function cardFor(q, row) {
    var cust = customerName(value(row, 'Customer ID', 'customerId')) || text(value(row, 'Customer Name')) || 'Customer';
    if (q.collection === 'quotes') {
      var qid = text(value(row, 'Quote ID', 'quoteId'));
      var qn = humanNumber('quotes', row) || text(value(row, 'Quote Number'));
      var when = dateLabel(value(row, 'Quote Date') || value(row, 'Updated Time', 'Created Time'));
      var qTitle = text(value(row, 'Project Title', 'projectTitle'));
      if (!qTitle) {
        var scope = text(value(row, 'Scope', 'scope'));
        if (scope && scope.length > 64) { var cut = scope.slice(0, 64); scope = cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : 64).trim() + '…'; }
        if (scope) qTitle = scope;
      }
      return { kind: 'quote', id: qid, title: qTitle || 'Quote', cust: cust,
        meta: [qn, statusLabel(row)].filter(Boolean).join(' · '),
        when: when, amount: num(value(row, 'Total', 'total')) };
    }
    if (q.collection === 'jobs') {
      var jid = text(value(row, 'Job ID', 'jobId'));
      var jn = humanNumber('jobs', row) || text(value(row, 'Job Number'));
      return { kind: 'job', id: jid, title: text(value(row, 'Project Title', 'projectTitle')) || 'Job', cust: cust,
        meta: [jn, statusLabel(row)].filter(Boolean).join(' · '),
        when: jobWhen(row), amount: jobAmount(row) };
    }
    var iid = text(value(row, 'Invoice ID', 'invoiceId'));
    var inum = humanNumber('invoices', row) || text(value(row, 'Invoice Number')) || 'Invoice';
    var bal = num(value(row, 'Balance', 'balance'));
    var due = value(row, 'Due Date', 'dueDate');
    var overdue = bal > 0.005 && due && timeOf(due) < Date.now();
    var jobTitle = '';
    var invJobId = text(value(row, 'Job ID', 'jobId'));
    if (invJobId) {
      var j = rows('jobs').filter(function (r) { return text(value(r, 'Job ID', 'jobId')) === invJobId; })[0];
      if (j) jobTitle = text(value(j, 'Project Title', 'projectTitle'));
    }
    var invTitle = jobTitle || inum;
    return { kind: 'invoice', id: iid, title: invTitle, cust: cust,
      meta: [invTitle === inum ? '' : inum, statusLabel(row)].filter(Boolean).join(' · '),
      when: due ? (overdue ? 'Overdue — due ' : 'Due ') + dateLabel(due) : '', amount: bal, amountLabel: ' owed' };
  }

  /* ---------- rendering ---------- */
  function switchBar(active) {
    return '<div class="h38-qb-switch" role="tablist" aria-label="Work view">' +
      '<button type="button" class="h38-qb-switch-btn' + (active === 'list' ? ' on' : '') + '" data-qb-view="list">☰ List view</button>' +
      '<button type="button" class="h38-qb-switch-btn' + (active === 'board' ? ' on' : '') + '" data-qb-view="board">▦ Queue board</button>' +
      '</div>';
  }
  function boardHtml() {
    var cols = QUEUES.map(function (q) {
      var all = queueRows(q);
      var shown = all.slice(0, MAX_CARDS);
      var cards = shown.map(function (row) {
        var c = cardFor(q, row);
        return '<button type="button" class="h38-qb-card" data-qb-kind="' + esc(c.kind) + '" data-qb-id="' + esc(c.id) + '">' +
          '<span class="h38-qb-card-title">' + esc(c.title) + '</span>' +
          '<span class="h38-qb-card-cust">' + esc(c.cust) + '</span>' +
          '<span class="h38-qb-card-meta">' + esc([c.meta, c.when].filter(Boolean).join(' · ')) + '</span>' +
          (c.amount > 0 ? '<span class="h38-qb-card-amt">' + esc(moneyFmt(c.amount)) + esc(c.amountLabel || '') + '</span>' : '') +
          '</button>';
      }).join('');
      return '<section class="h38-qb-col" data-qb-queue="' + esc(q.key) + '" aria-label="' + esc(q.title) + '">' +
        '<header class="h38-qb-col-head"><h3>' + esc(q.title) + ' <span class="h38-qb-count" data-qb-count="' + esc(q.key) + '">' + all.length + '</span></h3>' +
        '<p>' + esc(q.hint) + '</p></header>' +
        '<div class="h38-qb-cards">' + (cards || '<p class="h38-qb-empty">Nothing here right now.</p>') +
        (all.length > shown.length ? '<p class="h38-qb-more">+ ' + (all.length - shown.length) + ' more — see the list view for all of them.</p>' : '') +
        '</div></section>';
    }).join('');
    return switchBar('board') +
      '<section class="h38-qb-board" id="h38QueueBoard" aria-label="Queue board">' +
      '<div class="h38-qb-board-head"><h2>Queue board</h2>' +
      '<p class="muted">Every card opens the full record. Moving work between queues happens inside the record — this board never changes a status.</p></div>' +
      '<div class="h38-qb-cols">' + cols + '</div></section>';
  }
  function bindBoard(root) {
    root.querySelectorAll('[data-qb-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-qb-view') === 'board') openBoard();
        else closeBoard();
      });
    });
    root.querySelectorAll('[data-qb-kind]').forEach(function (b) {
      b.addEventListener('click', function () { openCard(b.getAttribute('data-qb-kind'), b.getAttribute('data-qb-id')); });
    });
  }
  var WB_GRID_CLASSES = ['h38-wb-grid-work', 'h38-wb-grid-quotes', 'h38-wb-grid-money', 'h38-wb-grid-today', 'h38-wb-grid-settings'];
  function openBoard() {
    var main = document.getElementById('mainContent');
    if (!main) return;
    boardOpen = true;
    hostPage = (st() && HOST_PAGES[st().page]) ? st().page : 'work';
    /* On wide screens the workbench lays #mainContent out as a grid
     * (h38-wb-grid-work / -quotes); a board rendered inside that grid
     * is squeezed into one column. The board is a full-page view, so
     * the grid classes come off while it is open — the workbench
     * re-adds its own class the next time it renders its panes (on
     * List view / any page render), exactly as it does today. */
    WB_GRID_CLASSES.forEach(function (c) { main.classList.remove(c); });
    main.innerHTML = boardHtml();
    /* Sibling panels other modules (re)insert into #mainContent are
     * hidden by CSS while the board is open (queue-board.css,
     * #mainContent.h38-qb-active), so insertion order and repaint
     * timing cannot push the board down the page. The siblings stay in
     * the DOM untouched; the class comes off when the board closes. */
    main.classList.add('h38-qb-active');
    bindBoard(main);
    try { main.focus({ preventScroll: true }); } catch (e) {}
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  function closeBoard() {
    boardOff();
    try { if (typeof window.openPage === 'function') window.openPage(hostPage); } catch (e) {}
  }
  function openCard(kind, id) {
    if (!id) return;
    boardOff();
    if (kind === 'job') {
      try { if (typeof window.openPage === 'function') window.openPage('work'); } catch (e) {}
      setTimeout(function () {
        try {
          if (window.H38_JOB_LIFECYCLE && typeof window.H38_JOB_LIFECYCLE.focusJob === 'function') { window.H38_JOB_LIFECYCLE.focusJob(id); return; }
          if (window.H38_JOB_LIFECYCLE && typeof window.H38_JOB_LIFECYCLE.selectJob === 'function') window.H38_JOB_LIFECYCLE.selectJob(id);
        } catch (e) {}
      }, 350);
      return;
    }
    if (kind === 'quote') {
      try { if (typeof window.openPage === 'function') window.openPage('quotes'); } catch (e) {}
      setTimeout(function () { try { if (typeof window.openQuote === 'function') window.openQuote(id); } catch (e) {} }, 60);
      return;
    }
    if (kind === 'invoice') {
      try { if (typeof window.openPage === 'function') window.openPage('money'); } catch (e) {}
      setTimeout(function () {
        try {
          if (window.H38_WORKBENCH && typeof window.H38_WORKBENCH.selectInvoice === 'function') { window.H38_WORKBENCH.selectInvoice(id, false); return; }
        } catch (e) {}
        var inv = rows('invoices').filter(function (r) { return text(value(r, 'Invoice ID', 'invoiceId')) === id; })[0];
        var numLabel = inv ? (humanNumber('invoices', inv) || text(value(inv, 'Invoice Number'))) : '';
        if (numLabel) {
          var els = document.querySelectorAll('#mainContent .row, #mainContent section');
          for (var i = 0; i < els.length; i++) {
            if ((els[i].innerText || '').indexOf(numLabel) >= 0) { els[i].scrollIntoView({ behavior: 'smooth', block: 'center' }); break; }
          }
        }
      }, 400);
    }
  }

  /* ---------- page decoration: the view switch on Jobs / Quotes ---------- */
  function decorate() {
    var s = st();
    if (!s || !HOST_PAGES[s.page]) { if (!boardOpen) return; boardOff(); return; }
    if (boardOpen) { openBoard(); return; }
    var main = document.getElementById('mainContent');
    if (!main) return;
    main.classList.remove('h38-qb-active');
    if (main.querySelector('.h38-qb-switch')) return;
    var bar = document.createElement('div');
    bar.innerHTML = switchBar('list');
    var node = bar.firstElementChild;
    if (!node) return;
    main.insertBefore(node, main.firstChild);
    node.querySelectorAll('[data-qb-view]').forEach(function (b) {
      b.addEventListener('click', function () { if (b.getAttribute('data-qb-view') === 'board') openBoard(); });
    });
  }
  function scheduleDecorate() { setTimeout(decorate, 0); }
  /* The app re-renders the current page on snapshot/sync passes; other
   * modules' handlers can repaint the host page over the open board.
   * Restore it (deferred, so those handlers settle first) whenever it
   * was open and the user is still on a host page — the same
   * event-driven + slow idle re-check style as workbench-shell.js. */
  function restoreIfNeeded() {
    if (!boardOpen) return;
    var s = st();
    if (!s || !HOST_PAGES[s.page]) { boardOff(); return; }
    if (!document.getElementById('h38QueueBoard')) { openBoard(); return; }
    var main = document.getElementById('mainContent');
    if (main) {
      WB_GRID_CLASSES.forEach(function (c) { main.classList.remove(c); });
      main.classList.add('h38-qb-active');
    }
  }
  function boardOff() {
    boardOpen = false;
    var main = document.getElementById('mainContent');
    if (main) main.classList.remove('h38-qb-active');
  }
  function scheduleRestore() { setTimeout(restoreIfNeeded, 400); setTimeout(restoreIfNeeded, 1400); }

  window.addEventListener('h38:office-page-rendered', function (event) {
    var page = event && event.detail && event.detail.page;
    if (page && !HOST_PAGES[page]) boardOff();
    if (boardOpen) scheduleRestore(); else scheduleDecorate();
  });
  window.addEventListener('h38:business-snapshot-updated', function () {
    if (boardOpen) {
      var main = document.getElementById('mainContent');
      if (main && document.getElementById('h38QueueBoard')) { main.innerHTML = boardHtml(); bindBoard(main); }
      scheduleRestore();
      return;
    }
    scheduleDecorate();
  });
  window.addEventListener('h38:sync-pass-complete', function () { if (boardOpen) scheduleRestore(); });
  setInterval(restoreIfNeeded, 2500);
  window.addEventListener('pageshow', scheduleDecorate);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleDecorate, { once: true });
  else scheduleDecorate();

  window.H38_QUEUE_BOARD = {
    build: BUILD,
    queues: QUEUES.map(function (q) { return { key: q.key, title: q.title, collection: q.collection, statuses: q.statuses.slice(), needsBalance: !!q.needsBalance }; }),
    counts: counts,
    open: openBoard,
    close: closeBoard,
    isOpen: function () { return boardOpen; },
    readOnly: true,
    dragEnabled: false
  };
  document.documentElement.dataset.h38QueueBoardReady = 'ready';
  window.dispatchEvent(new CustomEvent('h38:queue-board-ready', { detail: { build: BUILD } }));
})();
