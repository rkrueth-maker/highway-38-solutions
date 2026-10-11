/* ---- H38 "While You Were Away" — Kit's AI activity feed (2026-10-11) ----
 *
 * Shows owners what Kit (the in-Office AI) did while they were gone, sourced
 * from the real business_proof_log rows already loaded as state.snapshot.proofLog.
 *
 * - Only last 7 days, max 10 items, newest first
 * - An item counts as "AI activity" when its details carry the [ai:kit] tag
 *   (details._ai_actor / details.aiActor / details.ai_actor / details.notes)
 *   OR when its action_type matches one of the AI-ish patterns below.
 * - Technical action_types are translated to owner-friendly plain language.
 * - Exposes window.H38KitFeed = { render(container), renderHtml(), getItems() }.
 * - Owner Home embeds it via a slot section and calls window.H38KitFeed.render(el).
 */

(function () {
  'use strict';

  const BUILD = '20261011-kit-feed-1';
  const KIT_TAG = '[ai:kit]';
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_ITEMS = 10;

  /* ---------- tiny helpers (global esc/openPage may exist) ---------- */

  function escHtml(v) {
    if (typeof window.esc === 'function') return window.esc(v);
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Accept either the mapped snapshot keys ('Action Type') or raw DB keys. */
  function field(row, mappedKey, rawKey) {
    if (row == null) return '';
    const v = row[mappedKey] !== undefined && row[mappedKey] !== null && row[mappedKey] !== ''
      ? row[mappedKey]
      : (row[rawKey] !== undefined ? row[rawKey] : '');
    return v;
  }

  /* ---------- AI-action detection ---------- */

  /* action_types that count as AI-type work even without the [ai:kit] tag */
  const AI_ACTION_PATTERN = /QUOTE|ESTIMATE|PROPOSAL|FOLLOW.?UP|REMINDER|NUDGE|INVOICE|MESSAGE|SMS|TEXT|EMAIL|DOCUMENT|SCAN|RECEIPT|ATTACH|PHOTO|VIDEO|WALKTHROUGH|APPOINTMENT|SCHEDUL|LEAD|CALL|TRIAGE|SUMMAR|DRAFT|TRANSCRIPT/i;

  function detailsHaveKitTag(details) {
    if (!details || typeof details !== 'object') return false;
    if (details._ai_actor === KIT_TAG || details.aiActor === KIT_TAG || details.ai_actor === KIT_TAG) return true;
    const note = details.notes || details.note || details.summary || '';
    if (typeof note === 'string' && note.indexOf(KIT_TAG) !== -1) return true;
    /* Shallow scan of string values for the tag (e.g. payload._ai_actor nested). */
    try {
      for (const k of Object.keys(details)) {
        const v = details[k];
        if (typeof v === 'string' && v.indexOf(KIT_TAG) !== -1) return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function isAiAction(row) {
    const details = field(row, 'Details', 'details');
    if (detailsHaveKitTag(details)) return true;
    const actionType = String(field(row, 'Action Type', 'action_type') || '');
    return actionType.length > 0 && AI_ACTION_PATTERN.test(actionType);
  }

  /* ---------- plain-language description ---------- */

  function customerName(details, entityType, entityId) {
    if (details && typeof details === 'object') {
      const c = details.customerName || details.customer_name || details['Customer Name'] ||
        details.customer || details.clientName || details.client_name ||
        details.leadName || details.lead_name || details.name || details.title || '';
      if (c) return String(c);
    }
    if (String(entityType || '').toLowerCase() === 'customer' && entityId) return String(entityId);
    return '';
  }

  function shortId(v) {
    const s = String(v || '');
    return s.length > 24 ? s.slice(0, 21) + '…' : s;
  }

  function humanizeActionType(actionType) {
    return String(actionType || '')
      .toLowerCase()
      .split('_')
      .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w)
      .join(' ')
      .trim() || 'An action';
  }

  /* Returns { icon, text, reviewPage } — reviewPage is an openPage() key or null. */
  function describe(row) {
    const actionType = String(field(row, 'Action Type', 'action_type') || '').toUpperCase();
    const details = field(row, 'Details', 'details');
    const d = (details && typeof details === 'object') ? details : {};
    const entityType = String(field(row, 'Entity Type', 'entity_type') || '');
    const entityId = String(field(row, 'Entity ID', 'entity_id') || '');
    const who = customerName(d, entityType, entityId);
    const whoSuffix = who ? ' for ' + who : '';

    /* Exact known mappings first (owner-friendly text). */
    switch (actionType) {
      case 'DRAFT_QUOTE_CREATED':
      case 'QUOTE_DRAFT_CREATED':
      case 'AI_QUOTE_DRAFTED':
        return { icon: '🧾', text: 'Drafted a quote' + whoSuffix, reviewPage: 'quotes' };
      case 'FOLLOW_UP_SENT':
      case 'FOLLOWUP_SENT':
        return { icon: '📣', text: 'Sent a follow-up' + (who ? ' to ' + who : ''), reviewPage: 'messages' };
      case 'REMINDER_SENT':
      case 'OVERDUE_NUDGE_SENT':
        return { icon: '🔔', text: 'Sent a reminder' + (who ? ' to ' + who : ''), reviewPage: 'messages' };
      case 'INVOICE_FLAGGED_OVERDUE':
      case 'OVERDUE_INVOICE_FLAGGED':
        return { icon: '💵', text: 'Flagged overdue invoice' + (entityId ? ' ' + shortId(entityId) : '') + whoSuffix, reviewPage: 'money' };
      case 'MESSAGE_DRAFTED':
      case 'SMS_DRAFTED':
      case 'TEXT_DRAFTED':
        return { icon: '💬', text: 'Drafted a message' + (who ? ' to ' + who : ''), reviewPage: 'messages' };
      case 'MESSAGE_SENT':
      case 'SMS_SENT':
      case 'TEXT_SENT':
      case 'TEXT_MESSAGE_SENT':
        return { icon: '💬', text: 'Sent a message' + (who ? ' to ' + who : ''), reviewPage: 'messages' };
      case 'DOCUMENT_SCAN_SAVED':
      case 'SAVE_DOCUMENT_SCAN':
        return { icon: '📄', text: 'Filed a receipt/document', reviewPage: 'documents' };
      case 'RECEIPT_FILED':
      case 'RECEIPT_SAVED':
      case 'SAVE_RECEIPT':
        return { icon: '🧾', text: 'Filed a receipt', reviewPage: 'documents' };
      case 'RELEASE_DOCUMENT_TO_CUSTOMER':
        return { icon: '📤', text: 'Released a document' + (who ? ' to ' + who : ''), reviewPage: 'documents' };
      case 'SAVE_QUOTE_PHOTO':
        return { icon: '📸', text: 'Saved a quote photo' + whoSuffix, reviewPage: 'quotes' };
      case 'SAVE_SITE_WALKTHROUGH_VIDEO':
        return { icon: '🎥', text: 'Saved a site walkthrough video', reviewPage: 'field' };
      case 'LEAD_CAPTURED':
      case 'NEW_LEAD':
      case 'LEAD_CREATED':
        return { icon: '📥', text: 'Captured a new lead' + (who ? ': ' + who : ''), reviewPage: 'customers' };
      case 'APPOINTMENT_SCHEDULED':
      case 'JOB_SCHEDULED':
      case 'VISIT_SCHEDULED':
      case 'SITE_VISIT_SCHEDULED':
        return { icon: '📅', text: 'Scheduled ' + (d.title || d.jobTitle || d.visitType || 'an appointment') + whoSuffix, reviewPage: 'schedule' };
      case 'TASK_CREATED':
      case 'AI_TASK_CREATED':
        return { icon: '✅', text: 'Created a task: ' + (d.title || d.taskTitle || 'untitled'), reviewPage: 'tasks' };
      case 'CALL_LEAD_CREATED':
      case 'VOICEMAIL_LEAD_CREATED':
        return { icon: '📞', text: 'Logged a call lead' + (who ? ' from ' + who : ''), reviewPage: 'customers' };
      case 'MEETING_SUMMARIZED':
      case 'MEETING_TRANSCRIBED':
        return { icon: '🗣️', text: 'Summarized a meeting', reviewPage: null };
      case 'ERROR_TRIAGED':
      case 'AI_ERROR_TRIAGED':
        return { icon: '🛠️', text: 'Triaged an app issue', reviewPage: null };
      case 'PRICE_CHECKED':
      case 'PRICE_BOOK_LOOKUP':
        return { icon: '🏷️', text: 'Looked up pricing' + whoSuffix, reviewPage: null };
    }

    /* Pattern fallbacks for action_types we haven't mapped exactly. */
    if (/QUOTE|ESTIMATE|PROPOSAL/.test(actionType))
      return { icon: '🧾', text: 'Worked on a quote' + whoSuffix, reviewPage: 'quotes' };
    if (/FOLLOW.?UP|REMINDER|NUDGE/.test(actionType))
      return { icon: '📣', text: 'Sent a follow-up' + (who ? ' to ' + who : ''), reviewPage: 'messages' };
    if (/INVOICE/.test(actionType))
      return { icon: '💵', text: 'Handled an invoice' + (entityId ? ' ' + shortId(entityId) : ''), reviewPage: 'money' };
    if (/MESSAGE|SMS|TEXT|EMAIL/.test(actionType))
      return { icon: '💬', text: 'Handled a message' + (who ? ' with ' + who : ''), reviewPage: 'messages' };
    if (/DOCUMENT|SCAN|RECEIPT|ATTACH/.test(actionType))
      return { icon: '📄', text: 'Filed a document', reviewPage: 'documents' };
    if (/PHOTO|VIDEO|WALKTHROUGH/.test(actionType))
      return { icon: '📸', text: 'Saved site media', reviewPage: 'field' };
    if (/LEAD/.test(actionType))
      return { icon: '📥', text: 'Worked a lead' + (who ? ': ' + who : ''), reviewPage: 'customers' };
    if (/SCHEDUL|APPOINTMENT|ROUTE/.test(actionType))
      return { icon: '📅', text: 'Updated the schedule', reviewPage: 'schedule' };
    if (/TASK|TODO/.test(actionType))
      return { icon: '✅', text: 'Handled a task', reviewPage: 'tasks' };
    if (/CALL|VOICEMAIL/.test(actionType))
      return { icon: '📞', text: 'Handled a call' + (who ? ' with ' + who : ''), reviewPage: 'customers' };

    return { icon: '🤖', text: humanizeActionType(actionType), reviewPage: null };
  }

  /* ---------- timestamps ---------- */

  function relTime(iso) {
    const t = Date.parse(iso);
    if (isNaN(t)) return '';
    const diffMs = Date.now() - t;
    if (diffMs < 0) return 'just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins === 1 ? '1 minute ago' : mins + ' minutes ago';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours === 1 ? 'an hour ago' : hours + ' hours ago';
    const days = Math.floor(hours / 24);
    if (days < 2) return 'yesterday';
    return days + ' days ago';
  }

  /* ---------- data pipeline: real rows from state.snapshot.proofLog ---------- */

  function getItems() {
    let rows = [];
    try {
      const snap = (window.state && window.state.snapshot) || {};
      rows = Array.isArray(snap.proofLog) ? snap.proofLog : [];
    } catch (e) { rows = []; }

    const now = Date.now();
    const items = [];
    for (const row of rows) {
      if (!row || !isAiAction(row)) continue;
      const createdRaw = field(row, 'Created Time', 'created_at');
      const createdMs = Date.parse(createdRaw);
      /* Keep unparseable dates (can't prove they're old); drop anything older than 7 days. */
      if (!isNaN(createdMs) && now - createdMs > SEVEN_DAYS_MS) continue;
      const described = describe(row);
      items.push({
        actionType: String(field(row, 'Action Type', 'action_type') || ''),
        createdAt: createdRaw || '',
        createdMs: isNaN(createdMs) ? 0 : createdMs,
        icon: described.icon,
        text: described.text,
        reviewPage: described.reviewPage,
        timeLabel: relTime(createdRaw)
      });
    }
    items.sort((a, b) => b.createdMs - a.createdMs);
    return items.slice(0, MAX_ITEMS);
  }

  /* ---------- AI opener ---------- */

  function openAi() {
    try {
      if (typeof window.openGlobalAi === 'function') { window.openGlobalAi(); return; }
      const dialog = document.getElementById('globalAiDialog');
      if (dialog && typeof dialog.showModal === 'function' && !dialog.open) { dialog.showModal(); return; }
    } catch (e) { /* fall through */ }
    if (typeof window.openPage === 'function') window.openPage('ai');
  }

  /* ---------- rendering ---------- */

  function renderHtml() {
    const items = getItems();
    const rowsHtml = items.map((item, i) => `
      <div class="h38-kit-feed-row">
        <span class="h38-kit-feed-icon" aria-hidden="true">${escHtml(item.icon)}</span>
        <div class="h38-kit-feed-body">
          <strong>${escHtml(item.text)}</strong>
          ${item.timeLabel ? `<small>${escHtml(item.timeLabel)}</small>` : ''}
        </div>
        ${item.reviewPage ? `<button type="button" class="h38-kit-feed-review" data-kit-review="${escHtml(item.reviewPage)}" data-kit-row="${i}">Review →</button>` : ''}
      </div>`).join('');

    const emptyHtml = `
      <p class="h38-kit-feed-empty">Kit hasn't taken any actions yet. Ask Kit to draft a quote or send a follow-up to see it here.</p>`;

    return `
      <section class="card h38-kit-feed" aria-label="Kit's recent activity">
        <div class="h38-kit-feed-head">
          <h2>🤖 While You Were Away</h2>
          <button type="button" class="secondary small h38-kit-feed-ask" data-kit-ask="1">Ask Kit</button>
        </div>
        ${items.length ? `<div class="h38-kit-feed-list">${rowsHtml}</div>` : emptyHtml}
      </section>`;
  }

  function render(container) {
    if (!container) return;
    container.innerHTML = renderHtml();
    const ask = container.querySelector('[data-kit-ask]');
    if (ask) ask.onclick = openAi;
    container.querySelectorAll('[data-kit-review]').forEach(btn => {
      btn.onclick = () => {
        const page = btn.getAttribute('data-kit-review');
        if (page && typeof window.openPage === 'function') window.openPage(page);
      };
    });
  }

  window.H38KitFeed = Object.freeze({
    render,
    renderHtml,
    getItems,
    build: BUILD
  });
})();
