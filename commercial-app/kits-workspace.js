/* ---- H38 Kit's Workspace (2026-10-11) ----
 *
 * Rebuilds the H38 AI page as a dashboard, not a chatbot.
 *
 * Sections (Bold Numbers design language):
 *   1. Hero — dark header, big number = Kit's actions today
 *   2. What Kit did today — from H38KitFeed.getItems() (business_proof_log, [ai:kit])
 *   3. Needs your review — pending ai_handoff_tasks drafts (quote_followup_draft,
 *      invoice_nudge_draft). Approve queues via H38Sms.sendSms (owner approval
 *      flow, never auto-sends). Edit inline. Dismiss marks cancelled.
 *   4. Suggestions — proactive: overdue quotes w/o follow-up drafts, overdue
 *      invoices w/o nudges. Tap "Draft it" to have Kit draft via ai_handoff.
 *   5. Ask Kit — the existing chat, demoted to the bottom.
 *
 * Safety:
 *   - NEVER sends customer-facing messages directly. Approve uses the existing
 *     H38Sms.sendSms() queue-for-approval path.
 *   - NEVER moves money.
 *   - All reads use the signed-in user's Supabase session (RLS applies).
 *
 * Exposes window.H38KitsWorkspace = { render(), build }.
 */

(function () {
  'use strict';

  var BUILD = '20261011-kits-workspace-1';

  /* ---------- safe globals ---------- */

  function escHtml(v) {
    if (typeof window.esc === 'function') return window.esc(v);
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function val(row, a, b, c) {
    if (typeof window.v === 'function') { try { return window.v(row, a, b, c); } catch (e) {} }
    if (row == null) return '';
    for (var i = 1; i < arguments.length; i++) {
      var k = arguments[i];
      if (k && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
    }
    return '';
  }
  function allRecords(name) {
    try {
      if (typeof window.records === 'function') return window.records(name) || [];
    } catch (e) {}
    return [];
  }
  function relTime(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var diff = Date.now() - t;
    if (diff < 0) return 'just now';
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins === 1 ? '1 min ago' : mins + ' min ago';
    var h = Math.floor(mins / 60);
    if (h < 24) return h === 1 ? '1 hr ago' : h + ' hrs ago';
    var d = Math.floor(h / 24);
    return d === 1 ? 'yesterday' : d + ' days ago';
  }
  function money(n) {
    var x = Number(n);
    if (isNaN(x)) return '';
    return '$' + x.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  /* ---------- Supabase REST (user session, RLS applies) ---------- */

  function sbCfg() {
    return window.H38_BUSINESS_OFFICE_SUPABASE || {};
  }
  function sbClient() {
    var c = window.H38_SUPABASE_SHARED_CLIENT && window.H38_SUPABASE_SHARED_CLIENT.ensure
      ? window.H38_SUPABASE_SHARED_CLIENT.ensure() : null;
    if (c) return c;
    var cfg = sbCfg();
    if (!cfg.url || !cfg.publishableKey || !window.supabase) throw new Error('Office connection unavailable.');
    return window.supabase.createClient(cfg.url, cfg.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
    });
  }
  async function sbAuth() {
    var api = sbClient();
    var r = await api.auth.getSession();
    if (r.error) throw r.error;
    var s = r.data && r.data.session;
    if (!s || !s.access_token) throw new Error('Sign in again.');
    return s;
  }
  async function sbGet(path) {
    var cfg = sbCfg(), s = await sbAuth();
    var res = await fetch(cfg.url + '/rest/v1/' + path, {
      headers: { authorization: 'Bearer ' + s.access_token, apikey: cfg.publishableKey }
    });
    if (!res.ok) throw new Error('Request failed (' + res.status + ').');
    return res.json().catch(function () { return []; });
  }
  async function sbPatch(path, body) {
    var cfg = sbCfg(), s = await sbAuth();
    var res = await fetch(cfg.url + '/rest/v1/' + path, {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer ' + s.access_token, apikey: cfg.publishableKey,
        'Content-Type': 'application/json', 'Prefer': 'return=representation'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Update failed (' + res.status + ').');
    return res.json().catch(function () { return []; });
  }

  /* ---------- data: pending review drafts ---------- */

  var REVIEW_TYPES = ['quote_followup_draft', 'invoice_nudge_draft'];

  async function fetchPendingDrafts() {
    try {
      var bid = (window.state && window.state.businessId) || '';
      if (!bid) return [];
      var q = 'ai_handoff_tasks?business_id=eq.' + encodeURIComponent(bid) +
        '&status=eq.pending' +
        '&task_type=in.(' + REVIEW_TYPES.join(',') + ')' +
        '&order=created_at.desc&limit=20' +
        '&select=id,task_type,payload,created_at';
      var rows = await sbGet(q);
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      return [];
    }
  }

  async function setTaskStatus(id, status, result) {
    var body = { status: status };
    if (result !== undefined) body.result = result;
    await sbPatch('ai_handoff_tasks?id=eq.' + encodeURIComponent(id), body);
  }

  /* ---------- data: suggestions (proactive) ---------- */

  function daysAgo(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return 0;
    return Math.floor((Date.now() - t) / 86400000);
  }

  function getSuggestions(pendingDrafts) {
    var out = [];
    try {
      var draftedQuoteIds = {}, draftedInvoiceIds = {};
      pendingDrafts.forEach(function (t) {
        var p = t.payload || {};
        if (p.quote_id) draftedQuoteIds[String(p.quote_id)] = true;
        if (p.invoice_id) draftedInvoiceIds[String(p.invoice_id)] = true;
      });

      /* Overdue quotes: sent/viewed 7+ days ago, no follow-up draft yet */
      var quotes = allRecords('customerQuotes').concat(allRecords('quotes'));
      var staleQuotes = quotes.filter(function (q) {
        var st = String(val(q, 'Status', 'status') || '').toUpperCase();
        if (!/SENT|PRESENTED|VIEWED|DELIVERED/.test(st)) return false;
        var id = String(val(q, 'Quote ID', 'quoteId', 'id') || '');
        if (draftedQuoteIds[id]) return false;
        var upd = val(q, 'Updated Time', 'updated_at', 'Updated At');
        return daysAgo(upd) >= 7;
      });
      if (staleQuotes.length) {
        out.push({
          kind: 'quotes',
          icon: '📣',
          count: staleQuotes.length,
          title: staleQuotes.length + ' quote' + (staleQuotes.length === 1 ? '' : 's') + ' going cold',
          detail: 'No follow-up in 7+ days. Kit can draft check-ins for your review.',
          action: 'Draft follow-ups',
          items: staleQuotes.slice(0, 5)
        });
      }

      /* Overdue invoices: past due 14+ days, no nudge draft yet */
      var invoices = allRecords('invoices');
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var lateInvoices = invoices.filter(function (inv) {
        var bal = Number(val(inv, 'Balance', 'balance', 'Amount Due', 'amount_due') || 0);
        if (!(bal > 0)) return false;
        var st = String(val(inv, 'Status', 'status') || '').toUpperCase();
        if (/^(PAID|VOIDED|DELETED|DRAFT)/.test(st)) return false;
        var id = String(val(inv, 'Invoice ID', 'invoiceId', 'id') || '');
        if (draftedInvoiceIds[id]) return false;
        var due = val(inv, 'Due Date', 'due_date', 'Due Date');
        var d = new Date(due);
        if (isNaN(d)) return false;
        return d < today && daysAgo(due) >= 14;
      });
      if (lateInvoices.length) {
        var total = lateInvoices.reduce(function (s, inv) {
          return s + Number(val(inv, 'Balance', 'balance', 'Amount Due', 'amount_due') || 0);
        }, 0);
        out.push({
          kind: 'invoices',
          icon: '💵',
          count: lateInvoices.length,
          title: money(total) + ' overdue',
          detail: lateInvoices.length + ' invoice' + (lateInvoices.length === 1 ? '' : 's') + ' 14+ days past due. Kit can draft reminders.',
          action: 'Draft reminders',
          items: lateInvoices.slice(0, 5)
        });
      }
    } catch (e) { /* suggestions are best-effort */ }
    return out;
  }

  /* ---------- draft card rendering ---------- */

  function draftTitle(t) {
    var p = t.payload || {};
    if (t.task_type === 'quote_followup_draft') {
      var qn = p.quote_number ? ' #' + p.quote_number : '';
      return 'Follow-up' + qn + (p.customer_name ? ' — ' + p.customer_name : '');
    }
    if (t.task_type === 'invoice_nudge_draft') {
      var inv = p.invoice_number ? ' #' + p.invoice_number : '';
      return 'Payment reminder' + inv + (p.customer_name ? ' — ' + p.customer_name : '');
    }
    return String(t.task_type || 'Draft').replace(/_/g, ' ');
  }

  function draftMeta(t) {
    var p = t.payload || {}, bits = [];
    if (t.task_type === 'quote_followup_draft') {
      if (p.days_since_sent != null) bits.push(p.days_since_sent + 'd since sent');
      if (p.amount != null) bits.push(money(p.amount));
    }
    if (t.task_type === 'invoice_nudge_draft') {
      if (p.days_overdue != null) bits.push(p.days_overdue + 'd overdue');
      if (p.amount_due != null) bits.push(money(p.amount_due) + ' due');
    }
    bits.push(relTime(t.created_at));
    return bits.filter(Boolean).join(' · ');
  }

  function customerPhone(customerId) {
    if (!customerId) return '';
    var list = allRecords('customers');
    var c = list.find(function (r) {
      return String(val(r, 'Customer ID', 'customerId', 'id') || '') === String(customerId);
    });
    if (!c) return '';
    return String(val(c, 'Phone', 'phone', 'Mobile', 'Cell', 'Phone Number') || '');
  }

  /* ---------- actions ---------- */

  async function approveDraft(id) {
    var card = document.querySelector('[data-kw-draft="' + id + '"]');
    var btn = card ? card.querySelector('[data-kw-approve]') : null;
    if (btn) { btn.disabled = true; btn.textContent = 'Queuing…'; }
    try {
      /* Re-fetch the single task to get the latest payload */
      var bid = (window.state && window.state.businessId) || '';
      var rows = await sbGet('ai_handoff_tasks?id=eq.' + encodeURIComponent(id) +
        '&select=id,task_type,payload&limit=1');
      var t = rows && rows[0];
      if (!t) throw new Error('Draft not found.');
      var p = t.payload || {};
      var to = customerPhone(p.customer_id);
      var body = String(p.draft_message || '').slice(0, 300);

      if (window.H38Sms && typeof window.H38Sms.sendSms === 'function' && to && body) {
        await window.H38Sms.sendSms({
          to: to, body: body,
          purpose: t.task_type === 'invoice_nudge_draft' ? 'Overdue invoice reminder' : 'Quote follow-up'
        });
        await setTaskStatus(id, 'done', { approved_by_owner: true, queued_via: 'H38Sms.sendSms', at: new Date().toISOString() });
        toast('Queued for sending. Nothing goes out until final approval.');
      } else {
        /* No SMS path (no number, or module not loaded) — mark approved, keep draft visible in Messages */
        await setTaskStatus(id, 'done', { approved_by_owner: true, queued_via: 'manual', at: new Date().toISOString(), note: 'No SMS number on file; draft kept for manual send.' });
        toast(to ? 'Approved.' : 'Approved — no mobile number on file, send manually from Messages.');
      }
      render();
    } catch (e) {
      toast('Could not approve: ' + (e.message || e), true);
      if (btn) { btn.disabled = false; btn.textContent = 'Approve & queue'; }
    }
  }

  async function dismissDraft(id) {
    if (!confirm('Dismiss this draft? Kit will not send it.')) return;
    try {
      await setTaskStatus(id, 'cancelled', { dismissed_by_owner: true, at: new Date().toISOString() });
      render();
    } catch (e) {
      toast('Could not dismiss: ' + (e.message || e), true);
    }
  }

  function toast(msg, isErr) {
    try {
      if (typeof window.toast === 'function') { window.toast(msg, !!isErr); return; }
    } catch (e) {}
    try { if (isErr) console.warn(msg); } catch (e) {}
  }

  /* ---------- suggestions: ask Kit to draft ---------- */

  async function draftSuggestion(kind) {
    try {
      if (!window.H38_AI_HANDOFF || typeof window.H38_AI_HANDOFF.submitTask !== 'function') {
        toast('AI handoff is not available right now.', true);
        return;
      }
      var bid = (window.state && window.state.businessId) || '';
      if (!bid) { toast('No business selected.', true); return; }
      toast('Asking Kit to draft…');
      var taskType = kind === 'invoices' ? 'draft_invoice_nudges' : 'draft_quote_followups';
      await window.H38_AI_HANDOFF.submitTask(taskType, { businessId: bid, source: 'kits-workspace-suggestion' });
      toast('Kit is drafting. Check "Needs your review" shortly.');
    } catch (e) {
      toast('Could not ask Kit: ' + (e.message || e), true);
    }
  }

  /* ---------- rendering ---------- */

  function sectionLabel(icon, text, count, countClass) {
    return '<div class="kw-section-label"><span>' + icon + ' ' + escHtml(text) + '</span>' +
      (count != null ? '<span class="kw-count ' + (countClass || '') + '">' + count + '</span>' : '') + '</div>';
  }

  function renderReviewCard(t) {
    var p = t.payload || {};
    var msg = String(p.draft_message || '');
    var preview = msg.length > 140 ? msg.slice(0, 140) + '…' : msg;
    return '<div class="kw-review-card" data-kw-draft="' + escHtml(t.id) + '">' +
      '<div class="kw-review-head"><strong>' + escHtml(draftTitle(t)) + '</strong>' +
      '<small>' + escHtml(draftMeta(t)) + '</small></div>' +
      (preview ? '<p class="kw-draft-preview">“' + escHtml(preview) + '”</p>' : '') +
      '<div class="kw-review-actions">' +
      '<button type="button" class="kw-btn-primary" data-kw-approve>Approve &amp; queue</button>' +
      '<button type="button" class="kw-btn-secondary" data-kw-dismiss>Dismiss</button>' +
      '</div></div>';
  }

  function renderSuggestion(s) {
    var colorClass = s.kind === 'invoices' ? 'kw-num-red' : 'kw-num-amber';
    return '<div class="kw-suggest-card">' +
      '<div class="kw-suggest-num ' + colorClass + '">' + s.count + '</div>' +
      '<div class="kw-suggest-body"><strong>' + escHtml(s.title) + '</strong>' +
      '<p>' + escHtml(s.detail) + '</p>' +
      '<button type="button" class="kw-btn-primary" data-kw-suggest="' + escHtml(s.kind) + '">' + escHtml(s.action) + '</button></div>' +
      '</div>';
  }

  function renderChat() {
    /* Existing chat, demoted to the bottom. askAi/toggleVoice stay in app-16.js. */
    var history = '';
    try {
      var chat = (window.state && window.state.aiChat) || [];
      history = chat.length
        ? chat.map(function (m) {
            return '<div class="ai-bubble ' + escHtml(m.role) + '">' + escHtml(m.body) + '</div>';
          }).join('')
        : '<div class="ai-bubble assistant">Ask Kit anything about your business — quotes, schedule, customers, money.</div>';
    } catch (e) {}
    return '<section class="card kw-chat">' +
      '<h2>Ask Kit</h2>' +
      '<div id="kwAiChat" class="ai-chat">' + history + '</div>' +
      '<form id="kwAiForm"><label>Question</label>' +
      '<textarea name="question" required placeholder="What should I work on next?"></textarea>' +
      '<div class="actions"><button>Ask Kit</button>' +
      '<button type="button" class="secondary" id="kwAiVoiceButton">Ask by voice</button></div></form>' +
      '</section>';
  }

  function bindAll() {
    document.querySelectorAll('[data-kw-approve]').forEach(function (btn) {
      btn.onclick = function () {
        var card = btn.closest('[data-kw-draft]');
        if (card) approveDraft(card.getAttribute('data-kw-draft'));
      };
    });
    document.querySelectorAll('[data-kw-dismiss]').forEach(function (btn) {
      btn.onclick = function () {
        var card = btn.closest('[data-kw-draft]');
        if (card) dismissDraft(card.getAttribute('data-kw-draft'));
      };
    });
    document.querySelectorAll('[data-kw-suggest]').forEach(function (btn) {
      btn.onclick = function () { draftSuggestion(btn.getAttribute('data-kw-suggest')); };
    });
    /* Wire the demoted chat to the existing handlers in app-16.js */
    try {
      var form = document.getElementById('kwAiForm');
      if (form && typeof window.bindForm === 'function' && typeof window.askAi === 'function') {
        window.bindForm(form, window.askAi);
      } else if (form && typeof window.askAi === 'function') {
        form.onsubmit = function (e) {
          e.preventDefault();
          var fd = new FormData(form), d = Object.fromEntries(fd.entries());
          window.askAi(d, form).then(function () { render(); }).catch(function () {});
        };
      }
      var vb = document.getElementById('kwAiVoiceButton');
      if (vb && typeof window.toggleVoice === 'function') vb.onclick = window.toggleVoice;
    } catch (e) {}
    /* Review → deep links inside the "did today" list reuse H38KitFeed handlers */
    try {
      if (window.H38KitFeed) {
        document.querySelectorAll('#kwDidToday [data-kit-review]').forEach(function (btn) {
          btn.onclick = function () {
            var page = btn.getAttribute('data-kit-review');
            if (page && typeof window.openPage === 'function') window.openPage(page);
          };
        });
        var ask = document.querySelector('#kwDidToday [data-kit-ask]');
        if (ask) ask.onclick = function () {
          var el = document.getElementById('kwAiForm');
          if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          var ta = el ? el.querySelector('textarea') : null;
          if (ta) ta.focus();
        };
      }
    } catch (e) {}
  }

  async function render() {
    var main = document.getElementById('mainContent');
    if (!main) return;
    main.innerHTML = '<div class="kw-workspace"><div class="kw-loading">Loading Kit\u2019s workspace…</div></div>';

    var items = [], drafts = [], suggestions = [];
    try {
      if (window.H38KitFeed && typeof window.H38KitFeed.getItems === 'function') {
        items = window.H38KitFeed.getItems() || [];
      }
    } catch (e) { items = []; }
    drafts = await fetchPendingDrafts();
    suggestions = getSuggestions(drafts);

    var todayCount = items.length;
    var reviewCount = drafts.length;

    var didHtml = items.length
      ? items.map(function (it) {
          return '<div class="kw-did-row"><span class="kw-did-icon">' + escHtml(it.icon) + '</span>' +
            '<div class="kw-did-body"><strong>' + escHtml(it.text) + '</strong>' +
            (it.timeLabel ? '<small>' + escHtml(it.timeLabel) + '</small>' : '') + '</div>' +
            (it.reviewPage ? '<button type="button" class="kw-link" data-kit-review="' + escHtml(it.reviewPage) + '">Review →</button>' : '') +
            '</div>';
        }).join('')
      : '<p class="kw-empty">Kit hasn\u2019t taken any actions yet today. When Kit drafts quotes, follow-ups, or flags invoices, they\u2019ll show up here.</p>';

    var reviewHtml = drafts.length
      ? drafts.map(renderReviewCard).join('')
      : '<p class="kw-empty">Nothing waiting. Kit will put drafts here for your approval.</p>';

    var suggestHtml = suggestions.length
      ? suggestions.map(renderSuggestion).join('')
      : '<p class="kw-empty">All caught up. Kit is watching quotes, invoices, and your schedule.</p>';

    main.innerHTML =
      '<div class="kw-workspace">' +
      '<section class="kw-hero">' +
        '<div><h1>Kit\u2019s Workspace</h1><p>Your AI office worker — what got done, what needs you.</p></div>' +
        '<div class="kw-hero-num"><span>' + todayCount + '</span><small>action' + (todayCount === 1 ? '' : 's') + ' today</small></div>' +
      '</section>' +

      (reviewCount ? sectionLabel('✋', 'Needs your review', reviewCount, 'kw-count-red') +
        '<div class="kw-review-list">' + reviewHtml + '</div>' : '') +

      sectionLabel('⚡', 'What Kit did today', todayCount, todayCount ? 'kw-count-green' : '') +
      '<div id="kwDidToday" class="kw-did-list">' + didHtml + '</div>' +

      sectionLabel('💡', 'Suggestions', suggestions.length || null, suggestions.length ? 'kw-count-amber' : '') +
      '<div class="kw-suggest-list">' + suggestHtml + '</div>' +

      sectionLabel('💬', 'Ask Kit', null) +
      renderChat() +

      '<p class="kw-fineprint">Kit drafts and suggests — nothing is sent, purchased, or changed without your approval.</p>' +
      '</div>';

    bindAll();
    var chat = document.getElementById('kwAiChat');
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  window.H38KitsWorkspace = Object.freeze({ render: render, build: BUILD });
})();
