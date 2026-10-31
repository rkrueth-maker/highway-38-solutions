/* H38 Workbench panes — build 20261031-workbench-13
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
    scheduleEvents: { label: 'Scheduled', icon: '🗓', titles: ['Title', 'Event Type'] },
    jobNotes: { label: 'Note', icon: '📝', titles: ['Title', 'Note', 'Text', 'Description'] }
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

  /* ---------- slice 3: jobs list pane + record rail ----------
   * The Jobs page keeps its own record rendering in the middle
   * (job command home + lifecycle — the one renderer). The
   * workbench adds: a compact list pane on the left (records('jobs'),
   * click = select) and the record rail on the right: pinned header
   * (title, status, the page's own primary "next step" action,
   * proxied — never reimplemented) + the job's chronological
   * timeline assembled from snapshot rows that reference the job
   * (typed Job ID / Related Record ID links; schedule events also
   * by exact title match — see jobEvents). The Customer 360 bundle
   * is not used here: it lazy-loads with the Customers page.
   * DATA LIMIT (honest): invoices carry Customer ID only — there is
   * no invoice<->job link in the record model, so invoice events
   * appear on the customer rail, not invented onto the job rail.
   * Selection drives the page's own current-job <select>s (job
   * checklist / change request) so the middle column follows the
   * same selection the phone would make — one state, two shells. */
  var jobSel = '';
  var jobKey = '';
  function rows(name) {
    try { if (typeof window.records === 'function') { var r = window.records(name); if (Array.isArray(r)) return r; } } catch (e) {}
    var s = snap();
    return Array.isArray(s[name]) ? s[name] : [];
  }
  function jobCustomerName(j) { return customerNameOf(text(value(j, 'Customer ID', 'customerId'))); }
  function customerNameOf(id) {
    if (!id) return '';
    var c = rows('customers').filter(function (r) { return text(value(r, 'Customer ID', 'customerId', 'id')) === text(id); })[0];
    return c ? text(value(c, 'Customer Name', 'name')) : '';
  }
  function selectJob(id) {
    if (!id) return;
    jobSel = id;
    /* Drive ONLY the Job checklist card's job picker — the page's
     * current-job view state (its options carry Job ID values).
     * Other selects on this page (e.g. the change-request form's job
     * field) are form inputs, not view state: setting them fires
     * handlers that re-render sections and reset the checklist —
     * learned live 2026-10-31. */
    var job = rows('jobs').filter(function (j) { return text(value(j, 'Job ID', 'jobId', 'id')) === id; })[0];
    var num = job ? text(value(job, 'Job Number')) : '';
    var sel = document.querySelector('#supabaseChecklist select');
    if (sel) {
      var match = -1;
      for (var i = 0; i < sel.options.length; i++) {
        var o = sel.options[i];
        if (o.value === id || (num && o.text.indexOf(num) >= 0)) { match = i; break; }
      }
      if (match >= 0 && sel.selectedIndex !== match) {
        sel.selectedIndex = match;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sel.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    renderJobsPane(true);
  }
  /* Job timeline from raw snapshot rows (the Customer 360 bundle is
   * lazy-loaded with the Customers page and is not present here).
   * Links used, strongest first: typed references (Job ID /
   * Related Record ID); then — for schedule events only — an exact
   * title match with no typed reference, which is how the business's
   * own calendar names job visits. Quotes in real data often carry
   * an empty Job ID; unlinked quotes stay off the job rail (they are
   * on the customer rail) rather than being guessed onto a job. */
  function jobEvents(job) {
    var id = text(value(job, 'Job ID', 'jobId', 'id'));
    var title = text(value(job, 'Project Title', 'Title'));
    function references(r) {
      return text(value(r, 'Job ID', 'jobId', 'Related Record ID', 'Source ID', 'sourceId')) === id;
    }
    var groups = {
      quotes: rows('quotes').filter(references),
      scheduleEvents: rows('scheduleEvents').filter(function (r) {
        if (references(r)) return true;
        return !text(value(r, 'Related Record ID')) && title && text(value(r, 'Title')) === title;
      }),
      documents: rows('documents').filter(references),
      jobNotes: rows('jobNotes').filter(references),
      changeOrders: rows('changeOrders').filter(references),
      inspections: rows('inspections').filter(references),
      followUps: rows('followUps').filter(references)
    };
    return bundleEvents(groups, {});
  }
  function renderJobsPane(force) {
    var main = document.getElementById('mainContent');
    if (!main || !st() || st().page !== 'work' || !wide()) {
      var l0 = document.getElementById('h38WbJobList'), r0 = document.getElementById('h38WbJobRail');
      if (l0) l0.remove(); if (r0) r0.remove();
      if (main) main.classList.remove('h38-wb-grid-work');
      jobKey = '';
      return;
    }
    var jobs = rows('jobs').slice().sort(function (a, b) { return eventTime(b) - eventTime(a); });
    if (!jobs.length) return;
    if (!jobSel || !jobs.some(function (j) { return text(value(j, 'Job ID', 'jobId', 'id')) === jobSel; })) {
      jobSel = text(value(jobs[0], 'Job ID', 'jobId', 'id'));
    }
    var key = jobSel + '|' + jobs.length + '|' + text(snap().cachedAt);
    if (!force && jobKey === key && document.getElementById('h38WbJobList')) return;
    main.classList.add('h38-wb-grid-work');
    var list = document.getElementById('h38WbJobList');
    if (!list) {
      list = document.createElement('aside');
      list.id = 'h38WbJobList';
      list.className = 'h38-wb-listpane';
      list.setAttribute('aria-label', 'Jobs list');
      main.appendChild(list);
    }
    list.innerHTML = '<div class="h38-wb-listpane-hd">Jobs <span>· ' + jobs.length + ' · click one, it opens here</span></div>' +
      jobs.map(function (j) {
        var id = text(value(j, 'Job ID', 'jobId', 'id'));
        var title = text(value(j, 'Project Title', 'Title')) || text(value(j, 'Job Number')) || 'Job';
        var meta = [text(value(j, 'Job Number')), jobCustomerName(j), text(value(j, 'Status', 'status'))].filter(Boolean).join(' · ');
        var next = text(value(j, 'Next Action'));
        return '<button type="button" class="h38-wb-jobrow' + (id === jobSel ? ' sel' : '') + '" data-wb-job="' + esc(id) + '">' +
          '<span class="t">' + esc(title) + '</span><span class="s">' + esc(meta) + '</span>' +
          (next ? '<span class="s">Next: ' + esc(next) + '</span>' : '') + '</button>';
      }).join('');
    list.querySelectorAll('[data-wb-job]').forEach(function (b) {
      b.addEventListener('click', function () { selectJob(b.getAttribute('data-wb-job')); });
    });
    var rail = document.getElementById('h38WbJobRail');
    if (!rail) {
      rail = document.createElement('aside');
      rail.id = 'h38WbJobRail';
      rail.className = 'h38-wb-rail-right h38-wb-jobrail';
      rail.setAttribute('aria-label', 'Job record and timeline');
      main.appendChild(rail);
    }
    var job = jobs.filter(function (j) { return text(value(j, 'Job ID', 'jobId', 'id')) === jobSel; })[0];
    if (job) {
      var title = text(value(job, 'Project Title', 'Title')) || 'Job';
      var status = text(value(job, 'Status', 'status'));
      var primary = document.querySelector('#mainContent [data-job-command].primary, #mainContent .h38-job-next');
      var primaryLabel = primary ? text(primary.textContent) || 'Do next step' : '';
      var events = jobEvents(job);
      /* The job's own created/updated stamps always anchor the story. */
      var created = eventTime({ 'Created Time': value(job, 'Created Time', 'createdAt') });
      if (created) events.push({ icon: '🧰', label: 'Job', title: title + ' — created', status: status, extra: text(value(job, 'Job Number')), time: created });
      events.sort(function (a, b) { return b.time - a.time; });
      rail.innerHTML = '<div class="h38-wb-rec-head"><h3 class="h38-wb-rec-title">' + esc(title) + '</h3>' +
        '<div class="h38-wb-rec-meta">' + esc([text(value(job, 'Job Number')), jobCustomerName(job), status, text(value(job, 'Due Date')) ? 'Due ' + text(value(job, 'Due Date')) : ''].filter(Boolean).join(' · ')) + '</div>' +
        (primaryLabel ? '<button type="button" class="h38-wb-rec-primary" id="h38WbJobPrimary">' + esc(primaryLabel) + ' →</button>' : '') +
        '</div><h3>Everything that happened</h3>' + timelineHtml(events, 18);
      var pb = rail.querySelector('#h38WbJobPrimary');
      if (pb && primary) pb.addEventListener('click', function () { primary.click(); });
    }
    jobKey = key;
  }

  /* ---------- slice 4: money — invoice list pane + invoice rail ----------
   * The other crew owns the invoice EDITOR (the draft form + its live
   * customer preview in the middle column, shipped 2026-10-31). This
   * slice is the surrounding shell only: a compact invoice list pane
   * (records('invoices')) and a right rail for the selected invoice:
   * pinned header + the page row's own Invoice PDF button (proxied)
   * + Record payment (scrolls to the page's own payment form and
   * picks the invoice in its select — the owner still submits it;
   * nothing is recorded by this code) + the customer's money summary
   * (canonical computeProfileMoney over raw invoice/payment groups)
   * + payment history for the invoice and the customer.
   * BATCH CHASE: no native select-many chase exists on the Money
   * page (checked live 2026-10-31: zero checkboxes). The list pane
   * adds checkboxes on open invoices and a "prepare chase" action
   * that hands Kit (owner chat) an instruction listing the picked
   * invoices and requiring drafts for owner approval — the existing
   * gated flow. The pane itself sends nothing. */
  var invSel = '';
  var invKey = '';
  var chaseSet = {};
  function isRemovedInv(r) {
    var s = text(value(r, 'Status', 'status')).toUpperCase();
    return /DELET|VOID/.test(s);
  }
  function invBalance(r) { return Number(value(r, 'Balance', 'balance')) || 0; }
  function invOverdue(r) {
    if (isRemovedInv(r) || invBalance(r) <= 0.005) return false;
    var due = text(value(r, 'Due Date', 'dueDate'));
    if (!due) return false;
    var d = new Date(due);
    return Number.isFinite(d.getTime()) && d.getTime() < Date.now();
  }
  function customerGroups(customerId) {
    var invs = rows('invoices').filter(function (r) { return text(value(r, 'Customer ID', 'customerId')) === text(customerId); });
    var ids = {};
    invs.forEach(function (r) { ids[text(value(r, 'Invoice ID', 'invoiceId', 'id'))] = 1; });
    var pays = rows('payments').filter(function (r) { return ids[text(value(r, 'Invoice ID', 'invoiceId'))]; });
    return { invoices: invs, payments: pays };
  }
  function pageInvoiceRow(num) {
    var secs = document.querySelectorAll('#mainContent section.card');
    for (var i = 0; i < secs.length; i++) {
      var rs = secs[i].querySelectorAll('.row');
      for (var j = 0; j < rs.length; j++) {
        var strong = rs[j].querySelector('strong');
        if (strong && text(strong.textContent) === num) return rs[j];
      }
    }
    return null;
  }
  function selectInvoice(id, fromPage) {
    if (!id) return;
    invSel = id;
    var inv = rows('invoices').filter(function (r) { return text(value(r, 'Invoice ID', 'invoiceId', 'id')) === id; })[0];
    if (inv && !fromPage) {
      var num = text(value(inv, 'Invoice Number'));
      var rowEl = num ? pageInvoiceRow(num) : null;
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        rowEl.classList.add('h38-wb-flash');
        setTimeout(function () { rowEl.classList.remove('h38-wb-flash'); }, 1500);
      }
    }
    renderMoneyPane(true);
  }
  function stageKitMessage(msg) {
    try { if (typeof window.openPage === 'function') window.openPage('ai'); } catch (e) {}
    setTimeout(function () {
      try {
        var chat = window.H38_OWNER_CHAT;
        if (chat && typeof chat.send === 'function' && (typeof chat.handlesWorkspaceChat !== 'function' || chat.handlesWorkspaceChat())) { chat.send(msg); return; }
        var input = document.querySelector('#mainContent textarea, #mainContent input[type="text"]');
        if (input) { input.value = msg; input.focus(); }
      } catch (e) {}
    }, 450);
  }
  function prepareChase() {
    var picked = rows('invoices').filter(function (r) { return chaseSet[text(value(r, 'Invoice ID', 'invoiceId', 'id'))]; });
    if (!picked.length) return;
    var lines = picked.map(function (r) {
      return 'Invoice ' + text(value(r, 'Invoice Number')) + ' — ' + customerNameOf(text(value(r, 'Customer ID', 'customerId'))) +
        ', balance ' + moneyFmt(invBalance(r)) + ', due ' + (text(value(r, 'Due Date', 'dueDate')) || 'n/a');
    });
    stageKitMessage('Prepare payment reminders for these open invoices. Show me each draft for my approval before anything is sent:\n' + lines.join('\n'));
  }
  function renderMoneyPane(force) {
    var main = document.getElementById('mainContent');
    if (!main || !st() || st().page !== 'money' || !wide()) {
      var l0 = document.getElementById('h38WbInvoiceList'), r0 = document.getElementById('h38WbInvoiceRail');
      if (l0) l0.remove(); if (r0) r0.remove();
      if (main) main.classList.remove('h38-wb-grid-money');
      invKey = '';
      return;
    }
    var invs = rows('invoices').filter(function (r) { return !isRemovedInv(r); }).slice().sort(function (a, b) {
      var oa = invBalance(a) > 0.005 ? 0 : 1, ob = invBalance(b) > 0.005 ? 0 : 1;
      if (oa !== ob) return oa - ob;
      return eventTime(b) - eventTime(a);
    });
    if (!invs.length) return;
    if (!invSel || !invs.some(function (r) { return text(value(r, 'Invoice ID', 'invoiceId', 'id')) === invSel; })) {
      invSel = text(value(invs[0], 'Invoice ID', 'invoiceId', 'id'));
    }
    var chaseCount = Object.keys(chaseSet).length;
    var key = invSel + '|' + invs.length + '|' + chaseCount + '|' + text(snap().cachedAt);
    if (!force && invKey === key && document.getElementById('h38WbInvoiceList')) return;
    main.classList.add('h38-wb-grid-money');
    var list = document.getElementById('h38WbInvoiceList');
    if (!list) {
      list = document.createElement('aside');
      list.id = 'h38WbInvoiceList';
      list.className = 'h38-wb-listpane';
      list.setAttribute('aria-label', 'Invoices list');
      main.appendChild(list);
    }
    var shown = invs.slice(0, 50);
    list.innerHTML = '<div class="h38-wb-listpane-hd">Invoices <span>· ' + invs.length + ' · tick open ones to chase</span></div>' +
      shown.map(function (r) {
        var id = text(value(r, 'Invoice ID', 'invoiceId', 'id'));
        var num = text(value(r, 'Invoice Number')) || id;
        var bal = invBalance(r), od = invOverdue(r);
        var meta = [customerNameOf(text(value(r, 'Customer ID', 'customerId'))), text(value(r, 'Status', 'status'))].filter(Boolean).join(' · ');
        var due = text(value(r, 'Due Date', 'dueDate'));
        return '<div class="h38-wb-invrow' + (id === invSel ? ' sel' : '') + '" data-wb-invrow="' + esc(id) + '">' +
          (bal > 0.005 ? '<input type="checkbox" class="h38-wb-chase" data-wb-chase="' + esc(id) + '"' + (chaseSet[id] ? ' checked' : '') + ' aria-label="Pick invoice ' + esc(num) + ' for a reminder">' : '<span class="h38-wb-chasepad"></span>') +
          '<button type="button" class="h38-wb-invgo" data-wb-inv="' + esc(id) + '"><span class="t">' + esc(num) + (od ? ' <span class="h38-wb-od">OVERDUE</span>' : '') + '</span>' +
          '<span class="s">' + esc(meta) + '</span><span class="s">' + esc('Total ' + moneyFmt(Number(value(r, 'Total', 'total')) || 0) + ' · Balance ' + moneyFmt(bal) + (due ? ' · Due ' + due : '')) + '</span></button></div>';
      }).join('') +
      '<div class="h38-wb-listpane-ft"><button type="button" class="h38-wb-chasebtn" id="h38WbChaseBtn"' + (chaseCount ? '' : ' disabled') + '>Prepare chase for ' + chaseCount + ' picked → Kit drafts, you approve</button></div>';
    list.querySelectorAll('[data-wb-inv]').forEach(function (b) {
      b.addEventListener('click', function () { selectInvoice(b.getAttribute('data-wb-inv'), false); });
    });
    list.querySelectorAll('[data-wb-chase]').forEach(function (c) {
      c.addEventListener('change', function () {
        var id = c.getAttribute('data-wb-chase');
        if (c.checked) chaseSet[id] = 1; else delete chaseSet[id];
        renderMoneyPane(true);
      });
    });
    var chaseBtn = list.querySelector('#h38WbChaseBtn');
    if (chaseBtn) chaseBtn.addEventListener('click', prepareChase);
    var rail = document.getElementById('h38WbInvoiceRail');
    if (!rail) {
      rail = document.createElement('aside');
      rail.id = 'h38WbInvoiceRail';
      rail.className = 'h38-wb-rail-right h38-wb-invrail';
      rail.setAttribute('aria-label', 'Invoice record, customer money and payments');
      main.appendChild(rail);
    }
    var inv = invs.filter(function (r) { return text(value(r, 'Invoice ID', 'invoiceId', 'id')) === invSel; })[0];
    if (inv) {
      var num = text(value(inv, 'Invoice Number')) || invSel;
      var cid = text(value(inv, 'Customer ID', 'customerId'));
      var groups = customerGroups(cid);
      var m = computeMoney(groups);
      var pays = groups.payments.filter(function (p) { return text(value(p, 'Invoice ID', 'invoiceId')) === invSel; })
        .sort(function (a, b) { return eventTime(b) - eventTime(a); });
      var events = bundleEvents({ invoices: [inv], payments: pays }, {});
      rail.innerHTML = '<div class="h38-wb-rec-head"><h3 class="h38-wb-rec-title">Invoice ' + esc(num) + '</h3>' +
        '<div class="h38-wb-rec-meta">' + esc([customerNameOf(cid), text(value(inv, 'Status', 'status')), 'Total ' + moneyFmt(Number(value(inv, 'Total', 'total')) || 0), 'Balance ' + moneyFmt(invBalance(inv)), text(value(inv, 'Due Date', 'dueDate')) ? 'Due ' + text(value(inv, 'Due Date', 'dueDate')) : ''].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="h38-wb-rec-actions"><button type="button" class="h38-wb-rec-primary" id="h38WbInvPdf">Invoice PDF</button>' +
        '<button type="button" class="h38-wb-rec-alt" id="h38WbInvPay">Record payment ↓</button></div></div>' +
        '<h3>Customer money — ' + esc(customerNameOf(cid) || 'customer') + '</h3>' + moneySummaryHtml(m, customerNameOf(cid)) +
        '<h3>Payments on this invoice</h3>' +
        (pays.length ? '<div class="h38-wb-tl">' + pays.map(function (p) {
          return '<div class="h38-wb-tl-ev"><div class="h38-wb-tl-when">' + esc(formatWhen(eventTime(p))) + '</div><strong>✓ ' + esc(moneyFmt(Number(value(p, 'Amount', 'Payment Amount')) || 0)) + '</strong><div class="h38-wb-tl-meta">' + esc([text(value(p, 'Method', 'method')), text(value(p, 'Reference', 'reference')) ? 'Ref ' + text(value(p, 'Reference', 'reference')) : '', text(value(p, 'Status', 'status'))].filter(Boolean).join(' · ')) + '</div></div>';
        }).join('') + '</div>' : '<div class="h38-wb-empty">No payments recorded on this invoice yet.</div>') +
        '<h3>Invoice history</h3>' + timelineHtml(events, 10);
      var pdfBtn = rail.querySelector('#h38WbInvPdf');
      if (pdfBtn) pdfBtn.addEventListener('click', function () {
        var rowEl = pageInvoiceRow(num);
        var b = rowEl && rowEl.querySelector('[data-h38-record-pdf]');
        if (b) b.click();
      });
      var payBtn = rail.querySelector('#h38WbInvPay');
      if (payBtn) payBtn.addEventListener('click', function () {
        var form = document.getElementById('h38-money-payments');
        if (!form) return;
        var sel = form.querySelector('select');
        if (sel) {
          for (var i = 0; i < sel.options.length; i++) {
            if (sel.options[i].text.indexOf(num) >= 0 || sel.options[i].value === invSel) {
              sel.selectedIndex = i;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        form.classList.add('h38-wb-flash');
        setTimeout(function () { form.classList.remove('h38-wb-flash'); }, 1500);
      });
    }
    invKey = key;
  }

  /* ---------- slice 5: today — priority queue + day rail ----------
   * Today keeps its own frames in the middle (time clock, Phase 1
   * stat strip, Needs-you-now, Kit command bar — the one renderer).
   * The workbench adds the inbox shape around them:
   *  - LEFT: a priority queue assembled from the same records the
   *    Today stat strip counts: overdue invoices (balance > 0, due
   *    date passed), quotes awaiting an answer (SENT / PRESENTED —
   *    the stat strip's own rule), and open requests. Clicking a
   *    queue row goes to the page that owns the work (Money /
   *    Quotes / Schedule), where the workbench panes take over.
   *  - RIGHT: today's schedule mini-list (scheduleEvents starting
   *    today) + the stat strip's numbers read from its own DOM, so
   *    the rail can never disagree with the strip.
   *  - Kit's command bar gains a palette entry button: the command
   *    palette (slice 1) becomes the command entry point on Today;
   *    asking Kit stays one of the palette's commands. */
  var todayKey = '';
  function renderTodayPanes() {
    var main = document.getElementById('mainContent');
    if (!main || !st() || st().page !== 'today' || !wide()) {
      var q0 = document.getElementById('h38WbTodayQueue'), r0 = document.getElementById('h38WbTodayRail');
      if (q0) q0.remove(); if (r0) r0.remove();
      if (main) main.classList.remove('h38-wb-grid-today');
      todayKey = '';
      return;
    }
    var key = text(snap().cachedAt) + '|' + rows('invoices').length + '|' + rows('quotes').length + '|' + rows('scheduleEvents').length;
    if (todayKey === key && document.getElementById('h38WbTodayQueue')) { wireTodayPaletteEntry(); return; }
    main.classList.add('h38-wb-grid-today');
    var queue = document.getElementById('h38WbTodayQueue');
    if (!queue) {
      queue = document.createElement('aside');
      queue.id = 'h38WbTodayQueue';
      queue.className = 'h38-wb-listpane';
      queue.setAttribute('aria-label', 'Priority queue');
      main.appendChild(queue);
    }
    var overdue = rows('invoices').filter(function (r) { return invOverdue(r); })
      .sort(function (a, b) { return String(value(a, 'Due Date', 'dueDate')).localeCompare(String(value(b, 'Due Date', 'dueDate'))); });
    var waiting = rows('quotes').filter(function (r) {
      var s = text(value(r, 'Status', 'status')).toUpperCase();
      return s === 'SENT' || s === 'PRESENTED';
    });
    var requests = rows('requests').filter(function (r) {
      var s = text(value(r, 'Status', 'status')).toUpperCase();
      return s !== 'DONE' && s !== 'CLOSED' && s !== 'COMPLETED';
    });
    var qHtml = '<div class="h38-wb-listpane-hd">Priority queue <span>· work top-down</span></div>';
    if (!overdue.length && !waiting.length && !requests.length) {
      qHtml += '<div class="h38-wb-queue-empty">All clear — nothing overdue, waiting or requested.</div>';
    }
    overdue.forEach(function (r) {
      qHtml += '<button type="button" class="h38-wb-qrow" data-wb-q="money"><span class="t">💵 Chase invoice ' + esc(text(value(r, 'Invoice Number'))) + '</span><span class="s">' + esc([customerNameOf(text(value(r, 'Customer ID', 'customerId'))), moneyFmt(invBalance(r)) + ' open', 'due ' + text(value(r, 'Due Date', 'dueDate'))].filter(Boolean).join(' · ')) + '</span></button>';
    });
    waiting.forEach(function (r) {
      qHtml += '<button type="button" class="h38-wb-qrow" data-wb-q="quotes"><span class="t">🧾 Quote waiting: ' + esc(text(value(r, 'Quote Number')) || text(value(r, 'Project Title')) || 'Quote') + '</span><span class="s">' + esc([customerNameOf(text(value(r, 'Customer ID', 'customerId'))), moneyFmt(Number(value(r, 'Total', 'total')) || 0), text(value(r, 'Status', 'status'))].filter(Boolean).join(' · ')) + '</span></button>';
    });
    requests.forEach(function (r) {
      qHtml += '<button type="button" class="h38-wb-qrow" data-wb-q="schedule"><span class="t">📥 Request: ' + esc(text(value(r, 'Subject', 'Title', 'Request Type')) || 'Request') + '</span><span class="s">' + esc([customerNameOf(text(value(r, 'Customer ID', 'customerId'))), text(value(r, 'Status', 'status'))].filter(Boolean).join(' · ')) + '</span></button>';
    });
    queue.innerHTML = qHtml;
    queue.querySelectorAll('[data-wb-q]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-wb-q');
        try { if (typeof window.openPage === 'function') window.openPage(p); } catch (e) {}
      });
    });
    var rail = document.getElementById('h38WbTodayRail');
    if (!rail) {
      rail = document.createElement('aside');
      rail.id = 'h38WbTodayRail';
      rail.className = 'h38-wb-rail-right';
      rail.setAttribute('aria-label', 'Today schedule and numbers');
      main.appendChild(rail);
    }
    var now = new Date();
    var todays = rows('scheduleEvents').filter(function (e) {
      var s = new Date(value(e, 'Start Time', 'startTime'));
      return Number.isFinite(s.getTime()) && s.toDateString() === now.toDateString();
    }).sort(function (a, b) { return new Date(value(a, 'Start Time', 'startTime')) - new Date(value(b, 'Start Time', 'startTime')); });
    var strip = main.querySelector('.h38-today-stats');
    var statsHtml = '';
    if (strip) {
      var kids = Array.prototype.slice.call(strip.children || []);
      var parts = kids.length >= 2 ? kids.map(function (k) { return k.textContent.replace(/\s+/g, ' ').trim(); }).filter(Boolean) : [strip.textContent.replace(/\s+/g, ' ').trim()];
      statsHtml = '<div class="h38-wb-today-stats">' + parts.map(function (part) { return '<div>' + esc(part) + '</div>'; }).join('') + '</div>';
    }
    rail.innerHTML = '<h3>Today\'s schedule</h3>' +
      (todays.length ? '<div class="h38-wb-tl">' + todays.map(function (e) {
        var s = new Date(value(e, 'Start Time', 'startTime'));
        return '<div class="h38-wb-tl-ev"><div class="h38-wb-tl-when">' + esc(s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + '</div><strong>' + esc(text(value(e, 'Title')) || 'Scheduled') + '</strong><div class="h38-wb-tl-meta">' + esc([text(value(e, 'Location')), text(value(e, 'Status', 'status'))].filter(Boolean).join(' · ')) + '</div></div>';
      }).join('') + '</div>' : '<div class="h38-wb-empty">Nothing scheduled today.</div>') +
      (statsHtml ? '<h3>The numbers</h3>' + statsHtml : '');
    wireTodayPaletteEntry();
    todayKey = key;
  }
  function wireTodayPaletteEntry() {
    var host = document.getElementById('h38TodayCommandSetup');
    if (!host || document.getElementById('h38WbTodayPaletteBtn')) return;
    var b = document.createElement('button');
    b.id = 'h38WbTodayPaletteBtn';
    b.type = 'button';
    b.className = 'h38-wb-today-palbtn';
    b.textContent = '⌘ Search everything / run a command — Ctrl K';
    b.addEventListener('click', function () {
      if (window.H38_WORKBENCH && typeof window.H38_WORKBENCH.openPalette === 'function') window.H38_WORKBENCH.openPalette();
    });
    host.appendChild(b);
  }

  /* ---------- slice 6: schedule — job panel over the board ----------
   * The 7-day board (and the events list under it) stays exactly as
   * shipped; the dispatch map screen is untouched. On laptop, a
   * click that resolves to a scheduled item opens the record panel
   * OVER the board instead of navigating away. Resolution is
   * conservative: the click target's ancestors are walked (max 6
   * levels, small elements only) looking for a typed reference
   * (data-job-id / data-related-record-id) or text carrying a known
   * schedule-event / job title. Clicks on buttons, links and form
   * controls always pass through untouched, and an unresolvable
   * click is never intercepted. The panel shows the event, the
   * linked job's pinned header + timeline (jobEvents), and an
   * "Open full job" action that uses the Jobs page's own selection. */
  function jobById(id) { return rows('jobs').filter(function (j) { return text(value(j, 'Job ID', 'jobId', 'id')) === text(id); })[0] || null; }
  function resolveScheduleClick(target) {
    var titles = {};
    rows('scheduleEvents').forEach(function (e) { var t = text(value(e, 'Title')); if (t) titles[t] = { event: e }; });
    rows('jobs').forEach(function (j) {
      var t = text(value(j, 'Project Title', 'Title'));
      if (t && !titles[t]) titles[t] = { job: j };
      var n = text(value(j, 'Job Number'));
      if (n) titles[n] = { job: j };
    });
    var el = target, depth = 0;
    while (el && el !== document.body && depth < 7) {
      var ref = el.getAttribute && (el.getAttribute('data-job-id') || el.getAttribute('data-related-record-id') || el.getAttribute('data-jobid'));
      if (ref) { var jb = jobById(ref); if (jb) return { job: jb }; }
      var tx = text(el.textContent);
      if (tx && tx.length <= 300) {
        var keys = Object.keys(titles);
        for (var i = 0; i < keys.length; i++) {
          if (tx.indexOf(keys[i]) >= 0) {
            var hit = titles[keys[i]];
            if (hit.event && !hit.job) {
              var rel = text(value(hit.event, 'Related Record ID'));
              var linked = rel ? jobById(rel) : rows('jobs').filter(function (j) { return text(value(j, 'Project Title', 'Title')) === text(value(hit.event, 'Title')); })[0];
              if (linked) hit.job = linked;
            }
            return hit;
          }
        }
      }
      el = el.parentElement;
      depth++;
    }
    return null;
  }
  function closeSchedPanel() {
    var p = document.getElementById('h38WbSchedPanel');
    if (p) p.remove();
  }
  function openSchedPanel(hit) {
    closeSchedPanel();
    var panel = document.createElement('div');
    panel.id = 'h38WbSchedPanel';
    panel.className = 'h38-wb-sched-panel';
    var ev = hit.event, job = hit.job;
    var when = '';
    if (ev) {
      var s = new Date(value(ev, 'Start Time', 'startTime')), en = new Date(value(ev, 'End Time', 'endTime'));
      if (Number.isFinite(s.getTime())) when = s.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + (Number.isFinite(en.getTime()) ? ' – ' + en.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
    }
    var title = ev ? (text(value(ev, 'Title')) || 'Scheduled item') : (job ? (text(value(job, 'Project Title', 'Title')) || 'Job') : 'Scheduled item');
    var meta = [];
    if (when) meta.push(when);
    if (ev && text(value(ev, 'Location'))) meta.push(text(value(ev, 'Location')));
    if (ev && text(value(ev, 'Status', 'status'))) meta.push(text(value(ev, 'Status', 'status')));
    if (job) meta.push(jobCustomerName(job));
    var events = job ? jobEvents(job) : [];
    var created = job ? eventTime({ 'Created Time': value(job, 'Created Time', 'createdAt') }) : 0;
    if (job && created) events.push({ icon: '🧰', label: 'Job', title: (text(value(job, 'Project Title', 'Title')) || 'Job') + ' — created', status: text(value(job, 'Status', 'status')), extra: text(value(job, 'Job Number')), time: created });
    events.sort(function (a, b) { return b.time - a.time; });
    panel.innerHTML = '<div class="h38-wb-sched-head"><h3 class="h38-wb-rec-title">' + esc(title) + '</h3>' +
      '<button type="button" class="h38-wb-sched-close" id="h38WbSchedClose" aria-label="Close panel">✕</button></div>' +
      '<div class="h38-wb-rec-meta">' + esc(meta.join(' · ')) + '</div>' +
      (ev && text(value(ev, 'Notes', 'notes')) ? '<p class="h38-wb-sched-notes">' + esc(text(value(ev, 'Notes', 'notes'))) + '</p>' : '') +
      (job ? '<button type="button" class="h38-wb-rec-primary" id="h38WbSchedOpenJob">Open full job →</button>' +
        '<h3>Everything that happened</h3>' + timelineHtml(events, 14)
        : '<div class="h38-wb-empty">This scheduled item is not linked to a job record.</div>');
    document.body.appendChild(panel);
    panel.querySelector('#h38WbSchedClose').addEventListener('click', closeSchedPanel);
    var openBtn = panel.querySelector('#h38WbSchedOpenJob');
    if (openBtn && job) openBtn.addEventListener('click', function () {
      var id = text(value(job, 'Job ID', 'jobId', 'id'));
      closeSchedPanel();
      try { if (typeof window.openPage === 'function') window.openPage('work'); } catch (e) {}
      /* The Jobs page's checklist renders with its lazy page group —
       * a single early select can land before the <select> exists and
       * be silently overwritten by the page's own first render.
       * Retry until the selection verifiably sticks (live-proven race,
       * slice 6 proof). */
      [400, 1200, 2200, 3400].forEach(function (ms) {
        setTimeout(function () {
          if (!st() || st().page !== 'work') return;
          var sel = document.querySelector('#supabaseChecklist select');
          if (sel && sel.value !== id) selectJob(id);
        }, ms);
      });
    });
  }
  document.addEventListener('click', function (e) {
    if (!wide() || !st() || st().page !== 'schedule') return;
    if (document.getElementById('h38WbSchedPanel')) return;
    var t = e.target;
    if (!t || !document.getElementById('mainContent') || !document.getElementById('mainContent').contains(t)) return;
    if (t.closest && t.closest('button, a, select, input, textarea, [data-wb-q]')) return;
    var hit = null;
    try { hit = resolveScheduleClick(t); } catch (err) {}
    if (hit) {
      e.preventDefault();
      e.stopPropagation();
      openSchedPanel(hit);
    }
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSchedPanel();
  });

  /* ---------- slice 7: quotes — saved-quotes list pane ----------
   * The builder keeps its shipped split form/preview (Round 1) and
   * its own Saved quotes card; the workbench adds the same list as
   * a persistent left pane on laptop so switching quotes never
   * needs a scroll hunt. Row clicks go through the ONE open path
   * the app already exposes, window.openQuote(id) — the pane never
   * renders or edits a quote itself. Totals shown are the quote's
   * customer-facing Total (the canonical customer projection), never
   * internal cost fields. */
  var selectedQuoteId = '';
  var quotesKey = '';
  function renderQuotesPane() {
    var main = document.getElementById('mainContent');
    if (!main || !st() || st().page !== 'quotes' || !wide()) {
      var old = document.getElementById('h38WbQuotesList');
      if (old) old.remove();
      if (main) main.classList.remove('h38-wb-grid-quotes');
      quotesKey = '';
      return;
    }
    var key = rows('quotes').length + '|' + text(snap().cachedAt) + '|' + selectedQuoteId;
    if (quotesKey === key && document.getElementById('h38WbQuotesList')) return;
    main.classList.add('h38-wb-grid-quotes');
    var pane = document.getElementById('h38WbQuotesList');
    if (!pane) {
      pane = document.createElement('aside');
      pane.id = 'h38WbQuotesList';
      pane.className = 'h38-wb-listpane';
      pane.setAttribute('aria-label', 'Saved quotes');
      main.appendChild(pane);
    }
    var list = rows('quotes').slice().sort(function (a, b) {
      return eventTime({ 'Created Time': value(b, 'Updated Time', 'updatedAt', 'Created Time', 'createdAt') }) - eventTime({ 'Created Time': value(a, 'Updated Time', 'updatedAt', 'Created Time', 'createdAt') });
    });
    pane.innerHTML = '<div class="h38-wb-listpane-hd">Saved quotes <span>· ' + list.length + ' · click opens it in the builder</span></div>' +
      (list.length ? list.map(function (q) {
        var id = text(value(q, 'Quote ID', 'quoteId', 'id'));
        var sel = id && id === selectedQuoteId ? ' sel' : '';
        return '<button type="button" class="h38-wb-qitem' + sel + '" data-wb-quote="' + esc(id) + '"><span class="t">' + esc(text(value(q, 'Quote Number')) || 'Quote') + ' · ' + esc(text(value(q, 'Project Title')) || '') + '</span><span class="s">' + esc([customerNameOf(text(value(q, 'Customer ID', 'customerId'))), moneyFmt(Number(value(q, 'Total', 'total')) || 0), text(value(q, 'Status', 'status'))].filter(Boolean).join(' · ')) + '</span></button>';
      }).join('') : '<div class="h38-wb-queue-empty">No saved quotes yet.</div>');
    pane.querySelectorAll('[data-wb-quote]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-wb-quote');
        if (!id) return;
        selectedQuoteId = id;
        if (typeof window.openQuote === 'function') {
          try { window.openQuote(id); } catch (e) {}
        }
        quotesKey = '';
        renderQuotesPane();
      });
    });
    quotesKey = key;
  }

  /* ---------- dispatcher ---------- */
  function reconcile() {
    try { renderCustomerRail(); } catch (e) {}
    try { renderJobsPane(false); } catch (e) {}
    try { renderMoneyPane(false); } catch (e) {}
    try { renderTodayPanes(); } catch (e) {}
    try { renderQuotesPane(); } catch (e) {}
    if (!st() || st().page !== 'schedule') closeSchedPanel();
  }
  window.addEventListener('h38:office-page-rendered', reconcile);
  window.addEventListener('h38:business-snapshot-updated', reconcile);
  window.addEventListener('pageshow', reconcile);
  try { window.matchMedia('(min-width: 761px)').addEventListener('change', reconcile); } catch (e) {}
  setInterval(function () { if (st() && (st().page === 'customers' || st().page === 'work' || st().page === 'money' || st().page === 'today' || st().page === 'quotes')) reconcile(); }, 1500);

  window.H38_WORKBENCH = window.H38_WORKBENCH || {};
  window.H38_WORKBENCH.panesBuild = BUILD;
  window.H38_WORKBENCH.selectJob = selectJob;
  window.H38_WORKBENCH.selectInvoice = selectInvoice;
  window.H38_WORKBENCH.selectedJobId = function () { return jobSel; };
  window.H38_WORKBENCH.bundleEvents = bundleEvents;
  window.H38_WORKBENCH.computeMoney = computeMoney;
  window.H38_WORKBENCH.bundleFor = bundleFor;
  window.H38_WORKBENCH.timelineHtml = timelineHtml;
  window.H38_WORKBENCH.moneySummaryHtml = moneySummaryHtml;
})();
