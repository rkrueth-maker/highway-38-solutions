/* H38 Workbench panes — build 20261031-workbench-4
 *
 * Direction B ("The Workbench") laptop layer, page panes. Companion to
 * workbench-shell.js (slice 1: icon rail + palette). Everything here
 * is a laptop-only (>=761px) decoration over the SAME pages and the
 * SAME snapshot data the phone renders — one record renderer, two
 * shells. Nothing in this file writes records, sends anything, or
 * moves money; pane actions only call the pages' own existing
 * controls/APIs.
 *
 * Slice 2 — CUSTOMERS right rail (the reference implementation):
 * on the Customers page the existing master-detail grid gains a
 * third column (wide screens): a rail with
 *   - the customer's money summary, computed by the canonical
 *     H38_CUSTOMER_PROFILE_MONEY.computeProfileMoney over the
 *     canonical H38_CUSTOMER_360.customerBundle groups — the exact
 *     numbers the Customer 360 Money tab shows (arAging via
 *     H38_ACCOUNTING_ENGINE when present, the module's own mirror
 *     otherwise);
 *   - a compact chronological "everything that happened" timeline
 *     assembled from the same bundle groups the canonical
 *     customer-360-timeline module uses (meetings, site visits,
 *     documents/photos, quotes, jobs, invoices, payments,
 *     follow-ups, requests, change orders, inspections, recurring
 *     plans, and communicationLogs — calls & texts incl. AI call
 *     history). No new event store: the bundle IS the assembly.
 * Selection changes are picked up on the app's render/snapshot
 * events plus a slow (1.5s) watch while the Customers page is open —
 * the same event+idle pattern favourites-rail.js and
 * customer-profile-money.js already use. No MutationObserver.
 *
 * Module intake (MODULE_PERFORMANCE_STANDARD): routes: customers
 * (this slice). Canonical contract entry: none — shell decoration,
 * no module key, no route, no API action. Server owner: none.
 * Client owner: this file. Today-critical: no — deferred, never
 * blocks startup. Data: the already-loaded snapshot via the
 * canonical 360 bundle; 0 server reads. Cache: none — recomputed
 * per selection/snapshot change. External actions: none.
 */
(function () {
  'use strict';

  var BUILD = '20261031-workbench-3';

  function st() { try { return window.state || null; } catch (e) { return null; } }
  function text(v) { return String(v == null ? '' : v).trim(); }
  function esc(s) {
    s = String(s == null ? '' : s);
    if (typeof window.esc === 'function') return window.esc(s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function wide() { try { return !!window.matchMedia('(min-width: 761px)').matches; } catch (e) { return false; } }
  function value(row) {
    var args = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < args.length; i++) {
      var k = args[i];
      if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
    }
    return '';
  }
  function moneyFmt(v) {
    var n = Number(v || 0);
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }
  function snap() { var s = st(); return (s && s.snapshot) || {}; }

  /* ---------- shared timeline assembly (bundle groups -> events) ----------
   * Collection specs mirror customer-360-timeline.js (the canonical
   * customer story): same collections, labels, title/time keys. */
  var TL_TYPES = {
    meetings: { label: 'Meeting', icon: '🗣️', titles: ['Title', 'Meeting Type', 'Subject'] },
    siteCaptureSessions: { label: 'Site visit', icon: '📍', titles: ['Project Title', 'Site Visit ID', 'Capture Session ID'] },
    documents: { label: 'File / photo', icon: '📷', titles: ['Caption', 'File Name', 'Document Type'] },
    quotes: { label: 'Quote', icon: '🧾', titles: ['Project Title', 'Quote Number', 'Title'] },
    jobs: { label: 'Job', icon: '🧰', titles: ['Project Title', 'Job Number', 'Title'] },
    invoices: { label: 'Invoice', icon: '💵', titles: ['Invoice Number', 'Title'] },
    payments: { label: 'Payment', icon: '✓', titles: ['Payment Reference', 'Reference', 'Description'] },
    followUps: { label: 'Follow-up', icon: '↗', titles: ['Title', 'Description', 'Subject'] },
    requests: { label: 'Request', icon: '📥', titles: ['Subject', 'Title', 'Request Type'] },
    changeOrders: { label: 'Change order', icon: 'Δ', titles: ['Title', 'Description', 'Change Order Number'] },
    inspections: { label: 'Inspection', icon: '✓', titles: ['Title', 'Inspection Type', 'Description'] },
    recurringPlans: { label: 'Recurring work', icon: '↻', titles: ['Title', 'Service Type', 'Description'] },
    scheduleEvents: { label: 'Scheduled', icon: '🗓', titles: ['Title', 'Event Type'] }
  };
  var TL_TIME_KEYS = ['Updated Time', 'updatedAt', 'Created Time', 'createdAt', 'Start Time', 'startTime', 'Capture Time', 'captureTime', 'Meeting Time', 'meetingTime', 'Sent Time', 'sentAt', 'Paid Time', 'paidAt', 'Due Time', 'dueTime', 'Date', 'date'];
  function eventTime(row) {
    for (var i = 0; i < TL_TIME_KEYS.length; i++) {
      var raw = row && row[TL_TIME_KEYS[i]];
      if (raw === undefined || raw === null || raw === '') continue;
      var d = new Date(raw);
      if (Number.isFinite(d.getTime())) return d.getTime();
    }
    return 0;
  }
  function formatWhen(t) {
    if (!t) return 'No date';
    var d = new Date(t), today = new Date();
    return d.toDateString() === today.toDateString()
      ? 'Today · ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleString([], { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function bundleEvents(groups, opts) {
    opts = opts || {};
    var out = [];
    Object.keys(TL_TYPES).forEach(function (collection) {
      var spec = TL_TYPES[collection];
      (groups[collection] || []).forEach(function (row) {
        if (opts.onlyJobId) {
          var jid = text(value(row, 'Job ID', 'jobId', 'Related Record ID'));
          var selfJob = collection === 'jobs' && text(value(row, 'Job ID', 'jobId', 'id')) === opts.onlyJobId;
          if (!selfJob && jid !== opts.onlyJobId) return;
        }
        if (opts.onlyInvoiceId) {
          var iid = text(value(row, 'Invoice ID', 'invoiceId', 'Related Record ID'));
          var selfInv = collection === 'invoices' && text(value(row, 'Invoice ID', 'invoiceId', 'id')) === opts.onlyInvoiceId;
          if (!selfInv && iid !== opts.onlyInvoiceId) return;
        }
        var title = text(value.apply(null, [row].concat(spec.titles))) || spec.label;
        var status = text(value(row, 'Status', 'status', 'Outcome', 'Payment Status', 'Approval Status'));
        var extra = '';
        if (collection === 'quotes') extra = text(value(row, 'Quote Number'));
        if (collection === 'jobs') extra = text(value(row, 'Job Number'));
        if (collection === 'invoices') extra = moneyFmt(Number(value(row, 'Total', 'Amount', 'Balance Due')) || 0);
        if (collection === 'payments') extra = moneyFmt(Number(value(row, 'Amount', 'Payment Amount')) || 0);
        out.push({ icon: spec.icon, label: spec.label, title: title, status: status, extra: extra, time: eventTime(row) });
      });
    });
    /* Calls & texts incl. AI call history (communicationLogs). */
    var pm = window.H38_CUSTOMER_PROFILE_MONEY;
    if (groups.communicationLogs && pm && typeof pm.callHistoryFor === 'function') {
      pm.callHistoryFor(groups.communicationLogs, 50).forEach(function (c) {
        out.push({ icon: '📞', label: c.channel || 'Call', title: c.title || c.summary || 'Call / message', status: c.outcome || '', extra: c.duration || '', time: c.time || 0 });
      });
    }
    out.sort(function (a, b) { return b.time - a.time; });
    return out;
  }
  function timelineHtml(events, cap) {
    var list = events.slice(0, cap || 18);
    if (!list.length) return '<div class="h38-wb-empty">Nothing has happened yet on this record.</div>';
    return '<div class="h38-wb-tl">' + list.map(function (e) {
      return '<div class="h38-wb-tl-ev"><div class="h38-wb-tl-when">' + esc(formatWhen(e.time)) + '</div>' +
        '<strong>' + esc(e.icon + ' ' + e.title) + '</strong>' +
        '<div class="h38-wb-tl-meta">' + esc([e.label, e.status, e.extra].filter(Boolean).join(' · ')) + '</div></div>';
    }).join('') + '</div>' +
      (events.length > list.length ? '<div class="h38-wb-tl-meta">+ ' + (events.length - list.length) + ' earlier — full story in the customer timeline.</div>' : '');
  }
  function moneySummaryHtml(m, name) {
    if (!m) return '';
    var agingBits = [];
    var b = (m.aging && m.aging.buckets) || {};
    if (Number(b.current) > 0) agingBits.push('Current ' + moneyFmt(b.current));
    if (Number(b['1-30']) > 0) agingBits.push('1–30d ' + moneyFmt(b['1-30']));
    if (Number(b['31-60']) > 0) agingBits.push('31–60d ' + moneyFmt(b['31-60']));
    if (Number(b['61-90']) > 0) agingBits.push('61–90d ' + moneyFmt(b['61-90']));
    if (Number(b['90+']) > 0) agingBits.push('90+d ' + moneyFmt(b['90+']));
    return '<div class="h38-wb-money"><div>Owed by ' + esc(name || 'this customer') + '</div>' +
      '<div class="big">' + esc(moneyFmt(m.openBalance)) + (m.overdue ? ' <span class="bad">· ' + esc(moneyFmt(m.overdueBalance)) + ' overdue</span>' : '') + '</div>' +
      '<dl><dt>Invoiced (all time)</dt><dd>' + esc(moneyFmt(m.invoicedTotal)) + '</dd>' +
      '<dt>Paid (all time)</dt><dd>' + esc(moneyFmt(m.paidTotal)) + '</dd>' +
      '<dt>Open invoices</dt><dd>' + esc(String(m.openInvoiceCount)) + '</dd>' +
      (agingBits.length ? '<dt>Aging</dt><dd>' + esc(agingBits.join(' · ')) + '</dd>' : '') +
      '</dl></div>';
  }
  function computeMoney(groups) {
    var pm = window.H38_CUSTOMER_PROFILE_MONEY;
    if (!pm || typeof pm.computeProfileMoney !== 'function') return null;
    try { return pm.computeProfileMoney(groups || {}, { engine: window.H38_ACCOUNTING_ENGINE || null }); } catch (e) { return null; }
  }
  function bundleFor(customerId) {
    var api = window.H38_CUSTOMER_360;
    if (!api || typeof api.customerBundle !== 'function' || !customerId) return null;
    try { return api.customerBundle(snap(), customerId); } catch (e) { return null; }
  }

  /* ---------- slice 2: customers right rail ---------- */
  var custRailKey = '';
  function renderCustomerRail() {
    var main = document.getElementById('mainContent');
    if (!main || !st() || st().page !== 'customers' || !wide()) {
      var old = document.getElementById('h38WbCustomerRail');
      if (old) old.remove();
      custRailKey = '';
      return;
    }
    var host = main.querySelector('.h38-c360-master-detail');
    var api = window.H38_CUSTOMER_360;
    if (!host || !api) return;
    var cid = text(api.selectedCustomerId);
    if (!cid) return;
    var key = cid + '|' + text(snap().cachedAt) + '|' + text(snap().version);
    var rail = document.getElementById('h38WbCustomerRail');
    if (rail && custRailKey === key && rail.parentElement === host) return;
    var bundle = bundleFor(cid);
    if (!bundle || !bundle.customer) return;
    if (!rail) {
      rail = document.createElement('aside');
      rail.id = 'h38WbCustomerRail';
      rail.className = 'h38-wb-rail-right';
      rail.setAttribute('aria-label', 'Customer money and timeline');
    }
    if (rail.parentElement !== host) host.appendChild(rail);
    var name = text(value(bundle.customer, 'Customer Name', 'name')) || 'Customer';
    var m = computeMoney(bundle.groups || {});
    var events = bundleEvents(bundle.groups || {});
    rail.innerHTML = '<h3>Money — ' + esc(name) + '</h3>' + moneySummaryHtml(m, name) +
      '<h3>Everything that happened</h3>' + timelineHtml(events, 18);
    custRailKey = key;
  }

  /* ---------- dispatcher ---------- */
  function reconcile() {
    try { renderCustomerRail(); } catch (e) {}
  }
  window.addEventListener('h38:office-page-rendered', reconcile);
  window.addEventListener('h38:business-snapshot-updated', reconcile);
  window.addEventListener('pageshow', reconcile);
  try { window.matchMedia('(min-width: 761px)').addEventListener('change', reconcile); } catch (e) {}
  setInterval(function () { if (st() && st().page === 'customers') reconcile(); }, 1500);

  window.H38_WORKBENCH = window.H38_WORKBENCH || {};
  window.H38_WORKBENCH.panesBuild = BUILD;
  window.H38_WORKBENCH.bundleEvents = bundleEvents;
  window.H38_WORKBENCH.computeMoney = computeMoney;
  window.H38_WORKBENCH.bundleFor = bundleFor;
  window.H38_WORKBENCH.timelineHtml = timelineHtml;
  window.H38_WORKBENCH.moneySummaryHtml = moneySummaryHtml;
})();
