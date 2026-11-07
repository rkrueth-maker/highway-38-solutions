/* H38 Today: AI command bar + setup checklist — build 20261107-gap8-fronthome-2
 *
 * GAP8 (2026-11-07): the front door (ask box + KPI strip + setup
 * checklist) is now RENDERED by owner-home.js, synchronously in the
 * owner home's first paint at the top of Today — a module inserting
 * it after paint at the top of the screen would shove everything
 * below it (the opening-bounce defect class). This module remains
 * the owner of chat ROUTING (openChat, used by the front door's ask
 * form and chips) and of the refresh path: render() delegates to
 * H38OwnerHome.refreshFrontDoor() when the owner-home front door is
 * on screen, and only falls back to its own legacy container when a
 * Today surface rendered without owner-home. computeSteps() likewise
 * delegates to the canonical H38OwnerHome.computeSetupSteps(); the
 * local copy below is the same step set, kept for the fallback path.
 * The step set itself changed in gap8: logo and AI-answering (optional
 * add-ons that nagged fully-set-up businesses) are out; first quote,
 * first job, and the portal/deposit settings reviews are in. A portal
 * or deposit step completes only when the Owner Controls save has
 * stamped config.updatedAt — provisioning creates both rows with an
 * empty config, so existence alone proves nothing.
 *
 * Renders ONLY on Today (page 'today'), below the Needs-you-now /
 * stat-strip zone (inserted just before the existing owner chat entry
 * card when present, otherwise at the end of the owner-home block).
 * It never touches the Phase 1 stat strip (customer-readiness-polish.js)
 * or the owner-home "Needs you now"/"All clear" rules — it is a
 * separate container inserted after those blocks paint.
 *
 * AI COMMAND BAR: a prominent input-looking bar (no mic — the task
 * specifies mic-free) that opens the EXISTING owner chat. It uses
 * owner-chat.js's public API only: window.H38_OWNER_CHAT.send() and
 * .handlesWorkspaceChat(). No second chat is built. Clicking a
 * suggestion chip opens the 'ai' page and submits that question through
 * owner-chat's send path when the chat is available; when it is not
 * (module off / offline, the exact condition owner-chat itself gates
 * on), the question is prefilled into the chat form and focused, so
 * the legacy Ask Hank path in app-16.js can still take it.
 *
 * Suggestion chips are drawn ONLY from capabilities owner-chat.js
 * documents in its own header and welcome text: Kit "reads this
 * tenant's records" and the thread covers "jobs, the schedule,
 * customers, quotes or money". Each chip maps to one of those:
 *   - "Who owes me money?"            -> money (open invoices)
 *   - "What's on the schedule today?" -> schedule (today's events)
 *   - "Who hasn't answered their quote?" -> quotes (SENT, awaiting
 *     answer — the same SENT/PRESENT rule the Today stat strip uses)
 * No chip was added for a capability not confirmed in owner-chat.js.
 *
 * SETUP CHECKLIST: derived from the app's own canonical setup lists,
 * not invented:
 *   - ai-onboarding.js STEPS: profile, services, customers, team
 *     (welcome/review are flow steps, not records, and are excluded)
 *   - muse-onboarding-checklist.js confirms the same four, and its
 *     extra items (Bouncie, QuickBooks, templates, notifications,
 *     online booking) are tracked as manual flags, not records, so
 *     they are NOT checklist steps here — a step must be computable
 *     from real records/state.
 *   - The two remaining steps the task names are both computable from
 *     real state: AI answering from snapshot.moduleSettings
 *     (owner-controls.js serverModuleOn('ai_receptionist')), and logo
 *     from snapshot.business.brandConfig.logoUrl (a custom logo URL
 *     vs. the H38 default logo in supabase-client-branding.js).
 * Progress is "X of Y set up" computed from the SAME step list that
 * renders: a step whose state cannot be determined from the snapshot
 * is shown with a "Check" state and excluded from both X and Y, with
 * that exclusion stated in the card — never a hardcoded number.
 * When every determinable step is done the card does not render.
 * No dismiss: setup state changes as records land, so a dismissed
 * card would need a re-appear rule for every new incomplete step;
 * hiding it only when complete is the honest, simpler rule.
 *
 * Module intake (MODULE_PERFORMANCE_STANDARD): route 'today'
 * (existing). Today-critical: yes, but read-only — it reuses the
 * already-loaded snapshot (records('customers'), records('priceBook'),
 * snapshot.users, snapshot.businessProfile, snapshot.moduleSettings,
 * snapshot.business.brandConfig). 0 new server reads, 0 new RPCs.
 * Cache: none — recomputed from the live snapshot on each Today
 * render. External actions: none; step links only navigate (openPage).
 */
(function () {
  'use strict';

  var BUILD = '20261107-gap8-fronthome-2';
  var CONTAINER_ID = 'h38TodayCommandSetup';
  var CHECKLIST_ID = 'h38TodaySetupChecklist';
  var DEFAULT_LOGO_MARK = 'highway38-logo';

  function st() { try { return window.state || null; } catch (e) { return null; } }
  function text(v) { return String(v == null ? '' : v).trim(); }
  function esc(s) {
    s = String(s == null ? '' : s);
    if (typeof window.esc === 'function') return window.esc(s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function rows(name) {
    try {
      if (typeof window.records === 'function') { var r = window.records(name); if (Array.isArray(r)) return r; }
    } catch (e) {}
    var s = st();
    return (s && s.snapshot && Array.isArray(s.snapshot[name])) ? s.snapshot[name] : [];
  }
  function value(row) {
    var args = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < args.length; i++) {
      var k = args[i];
      if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
    }
    return '';
  }
  function isExample(row) {
    var hay = [value(row, 'Quote Number', 'Job Number', 'Invoice Number', 'Project Title', 'Status')].join(' ');
    return /\bDEMO\b|\bEX-/i.test(hay) || row && row['Example Data'] === true;
  }
  function setupAllowed() {
    try {
      var u = st() && st().snapshot && st().snapshot.user;
      if (!u) return false;
      return u.owner === true || u.permissions && (u.permissions.all === true || u.permissions.manageSettings === true || u.permissions.manageUsers === true);
    } catch (e) { return false; }
  }

  /* ---------- setup steps (same computation renders + counts) ---------- */

  function computeSteps() {
    if (window.H38OwnerHome && typeof window.H38OwnerHome.computeSetupSteps === 'function') return window.H38OwnerHome.computeSetupSteps();
    var s = st(), snap = (s && s.snapshot) || {};
    var steps = [];
    var profiles = snap.businessProfile;
    if (!Array.isArray(profiles)) {
      steps.push({ id: 'profile', title: 'Business profile', detail: 'Name, phone, email and address', page: 'settings', done: null });
    } else {
      var prof = profiles[0] || {};
      var profDone = !!text(value(prof, 'Business Name', 'businessName')) &&
        !!(text(value(prof, 'Phone', 'phone')) || text(value(prof, 'Email', 'email')) || text(value(prof, 'Address', 'address')));
      steps.push({ id: 'profile', title: 'Business profile', detail: 'Name, phone, email and address', page: 'settings', done: profDone });
    }
    var priceCount = rows('priceBook').length;
    steps.push({ id: 'services', title: 'Services & pricing', detail: priceCount + (priceCount === 1 ? ' price-book item' : ' price-book items'), page: 'quotes', done: priceCount >= 1 });
    var custCount = rows('customers').filter(function (r) { return !isExample(r); }).length;
    steps.push({ id: 'customers', title: 'Customers', detail: custCount + (custCount === 1 ? ' customer' : ' customers'), page: 'customers', done: custCount >= 1 });
    var quoteCount = rows('quotes').length;
    steps.push({ id: 'quote', title: 'First quote', detail: quoteCount + (quoteCount === 1 ? ' quote' : ' quotes'), page: 'quotes', done: quoteCount >= 1 });
    var jobCount = rows('jobs').length;
    steps.push({ id: 'job', title: 'First job', detail: jobCount + (jobCount === 1 ? ' job' : ' jobs'), page: 'work', done: jobCount >= 1 });
    var users = snap.users;
    if (!Array.isArray(users)) {
      steps.push({ id: 'team', title: 'Team', detail: 'Add someone besides the owner', page: 'people', done: null });
    } else {
      var teamCount = Math.max(0, users.length - 1);
      steps.push({ id: 'team', title: 'Team', detail: teamCount + (teamCount === 1 ? ' team member beyond the owner' : ' team members beyond the owner'), page: 'people', done: users.length >= 2 });
    }
    var settings = Array.isArray(snap.moduleSettings) ? snap.moduleSettings : [];
    function settingRow(key) { for (var i = 0; i < settings.length; i++) { if (text(settings[i].moduleKey || settings[i].module_key) === key) return settings[i]; } return null; }
    function reviewed(row) { return !!(row && row.config && text(row.config.updatedAt)); }
    var portalRow = settingRow('customer_portal');
    steps.push({ id: 'portal', title: 'Customer portal', detail: portalRow ? (reviewed(portalRow) ? 'Settings saved — portal is ' + (portalRow.enabled === true ? 'on' : 'off') + ' by your choice' : 'Portal is ' + (portalRow.enabled === true ? 'on' : 'off') + ' — review & save the setting') : 'Portal setting not saved yet', page: 'settings', done: reviewed(portalRow) });
    var depositRow = settingRow('signed_deposit_acceptance');
    var depositPct = depositRow && depositRow.config && isFinite(Number(depositRow.config.depositPercent)) && depositRow.config.depositPercent !== undefined && depositRow.config.depositPercent !== null ? Number(depositRow.config.depositPercent) : null;
    steps.push({ id: 'deposit', title: 'Deposit settings', detail: depositRow ? (reviewed(depositRow) ? 'Settings saved' + (depositPct !== null ? ' — default deposit ' + depositPct + '%' : '') : 'Review & save your deposit setting') : 'Deposit setting not saved yet', page: 'settings', done: reviewed(depositRow) });
    return steps;
  }

  function checklistHtml() {
    var steps = computeSteps();
    var determinable = steps.filter(function (s) { return s.done !== null; });
    var done = determinable.filter(function (s) { return s.done === true; }).length;
    if (determinable.length && done === determinable.length) return { html: '', done: done, total: determinable.length, complete: true };
    var rowsHtml = steps.map(function (step) {
      var state = step.done === null ? 'check' : (step.done ? 'done' : 'todo');
      var mark = step.done === null ? '?' : (step.done ? '✓' : '○');
      return '<button type="button" class="h38-setup-step h38-setup-step--' + state + '" data-h38-setup-page="' + esc(step.page) + '">' +
        '<span class="h38-setup-mark" aria-hidden="true">' + mark + '</span>' +
        '<span class="h38-setup-text"><strong>' + esc(step.title) + '</strong><small>' + esc(step.detail) + (step.done === null ? ' — couldn\'t confirm from your records' : '') + '</small></span>' +
        '<span class="h38-setup-go" aria-hidden="true">→</span></button>';
    }).join('');
    var unknown = steps.filter(function (s) { return s.done === null; }).length;
    var html = '<section class="card h38-setup-card" id="' + CHECKLIST_ID + '" aria-label="Finish setting up">' +
      '<h2>🧭 Finish setting up</h2>' +
      '<p class="h38-setup-progress"><strong>' + done + ' of ' + determinable.length + ' set up</strong>' +
      (unknown ? ' · ' + unknown + ' step' + (unknown === 1 ? '' : 's') + ' couldn\'t be confirmed from your records and isn\'t counted' : '') + '</p>' +
      '<div class="h38-setup-list">' + rowsHtml + '</div>' +
      '<p class="muted small">Tap a step to go where it\'s finished. This card disappears once every step above is set up — you can find setup again any time in Settings, under \u201cBusiness setup &amp; onboarding\u201d.</p></section>';
    return { html: html, done: done, total: determinable.length, complete: false };
  }

  /* ---------- owner chat opening (existing API only) ---------- */

  function openChat(question, sendIt) {
    if (typeof window.openPage === 'function') window.openPage('ai');
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var form = document.getElementById('kwAiForm');
      var input = form ? form.querySelector('textarea, input[name="question"]') : null;
      var chatApi = window.H38_OWNER_CHAT;
      var canSend = !!(chatApi && typeof chatApi.send === 'function' &&
        typeof chatApi.handlesWorkspaceChat === 'function' && chatApi.handlesWorkspaceChat());
      if (sendIt && canSend && question) {
        clearInterval(timer);
        chatApi.send(question);
        setTimeout(function () {
          var ta = document.querySelector('#kwAiForm textarea');
          if (ta) { try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); } }
        }, 300);
        return;
      }
      if (input) {
        clearInterval(timer);
        if (question) input.value = question;
        try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
        if (input.scrollIntoView) input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (tries >= 20) clearInterval(timer);
    }, 200);
  }

  /* ---------- Today render ---------- */

  var lastChecklistSig = '';
  function render() {
    var s = st();
    if (!s || !s.snapshot || !s.snapshot.user) return false;
    if (text(s.page) !== 'today') return false;
    var main = document.getElementById('mainContent');
    if (!main) return false;
    var frontDoor = document.getElementById(CONTAINER_ID);
    if (frontDoor && frontDoor.classList.contains('h38-front-door') &&
        window.H38OwnerHome && typeof window.H38OwnerHome.refreshFrontDoor === 'function') {
      window.H38OwnerHome.refreshFrontDoor();
      return true;
    }
    var existing = document.getElementById(CONTAINER_ID);
    if (!existing) {
      var container = document.createElement('div');
      container.id = CONTAINER_ID;
      container.className = 'h38-today-command-setup';
      container.innerHTML =
        '<section class="card h38-command-bar-card" aria-label="Ask your Office">' +
          '<h2>✨ Ask your Office</h2>' +
          '<form id="h38TodayCommandForm" class="h38-command-form">' +
            '<input type="text" id="h38TodayCommandInput" name="question" placeholder="Ask Kit — jobs, schedule, quotes, money…" aria-label="Ask Kit a question" autocomplete="off">' +
            '<button type="submit" class="primary">Ask Kit →</button>' +
          '</form>' +
          '<div class="h38-command-chips" role="group" aria-label="Try asking">' +
            '<button type="button" data-h38-command-chip="Who owes me money?">Who owes me money?</button>' +
            '<button type="button" data-h38-command-chip="What\'s on the schedule today?">What\'s on the schedule today?</button>' +
            '<button type="button" data-h38-command-chip="Who hasn\'t answered their quote?">Who hasn\'t answered their quote?</button>' +
          '</div>' +
          '<p class="muted small">Opens your saved thread with Kit — start on your phone, finish at your desk.</p>' +
        '</section>' +
        '<div id="h38TodaySetupSlot"></div>';
      /* Below the Needs-you-now/stat-strip zone: the owner chat entry
       * card sits after those blocks in the owner-home composition, so
       * inserting before it keeps this container below them. */
      var anchor = main.querySelector('.h38-owner-chat-entry');
      if (anchor) anchor.insertAdjacentElement('beforebegin', container);
      else {
        var home = main.querySelector('.h38-owner-home');
        if (home) home.appendChild(container);
        else main.appendChild(container);
      }
      container.querySelector('#h38TodayCommandForm').addEventListener('submit', function (event) {
        event.preventDefault();
        var q = text(document.getElementById('h38TodayCommandInput').value);
        openChat(q, !!q);
      });
      container.querySelector('#h38TodayCommandInput').addEventListener('click', function () {
        /* A bare tap on the bar opens the real chat and focuses it. */
        if (!text(document.getElementById('h38TodayCommandInput').value)) openChat('', false);
      });
      container.querySelectorAll('[data-h38-command-chip]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          openChat(btn.getAttribute('data-h38-command-chip'), true);
        });
      });
      existing = container;
    }
    /* Checklist refresh: only its own slot is rewritten, so text typed
     * into the command bar is never clobbered by a snapshot update. */
    if (setupAllowed()) {
      var slot = document.getElementById('h38TodaySetupSlot');
      if (slot) {
        var check = checklistHtml();
        var sig = check.html;
        if (sig !== lastChecklistSig) {
          lastChecklistSig = sig;
          slot.innerHTML = check.html;
          slot.querySelectorAll('[data-h38-setup-page]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              if (typeof window.openPage === 'function') window.openPage(btn.getAttribute('data-h38-setup-page'));
            });
          });
        }
      }
    } else {
      var slot2 = document.getElementById('h38TodaySetupSlot');
      if (slot2) { slot2.innerHTML = ''; lastChecklistSig = ''; }
    }
    return true;
  }

  window.addEventListener('h38:office-page-rendered', function (event) {
    if (event && event.detail && event.detail.page === 'today') {
      lastChecklistSig = '';
      setTimeout(render, 0);
      setTimeout(render, 400);
    }
  });
  window.addEventListener('h38:business-snapshot-updated', function () {
    if (text(st() && st().page) === 'today') setTimeout(render, 0);
  });
  window.addEventListener('pageshow', function () {
    if (text(st() && st().page) === 'today') setTimeout(render, 0);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(render, 0); }, { once: true });
  else setTimeout(render, 0);

  window.H38_TODAY_COMMAND_SETUP = Object.freeze({
    build: BUILD,
    render: render,
    computeSteps: computeSteps,
    openChat: openChat
  });
})();
