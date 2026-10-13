/* ---- H38 Owner Notifications — bell, panel, Today card (2026-10-13) ----
 *
 * Rick's requirement: "office should notify of any customer activity or
 * when new items need review."
 *
 * Producer: the h38-owner-notify edge function (pg_cron, every 5 min)
 * scans the canonical sources and writes rows into business_records
 * collection 'notifications' with Audience 'owners-admins'. This module
 * is only the surface: it renders those rows (plus the legacy per-user
 * task notes send-task.js writes into the same collection) as a topbar
 * bell with an unread badge, a dropdown panel with deep links, and a
 * compact card on Today. Read state is per user ('Read By JSON'), so
 * one owner reading an alert never hides it from another.
 *
 * Category switches live in Owner Controls (server-mirrored
 * business_module_settings 'owner_notifications'); this surface honors
 * the same resolved values. Push delivery rides the shared push
 * dispatcher via the rows' 'Push Status' — nothing here sends pushes.
 */
(function () {
  'use strict';

  var BUILD = '20261013-owner-notify-1';
  var MAX_PANEL = 40;

  function text(v) { return String(v == null ? '' : v).trim(); }
  function escHtml(s) {
    if (typeof window.esc === 'function') return window.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function field(row, key) {
    if (typeof window.v === 'function') return window.v(row, key);
    return row ? row[key] : '';
  }
  function snap() { return (window.state && window.state.snapshot) || null; }
  function myId() { var s = snap(); return s && s.user ? text(s.user.userId) : ''; }
  function myRole() { var s = snap(); return s && s.user ? text(s.user.roleName).toLowerCase() : ''; }
  function isOwnerAdmin() { return ['owner', 'administrator'].indexOf(myRole()) >= 0; }
  function businessId() { return window.state ? text(window.state.businessId) : ''; }

  function categoryOn(kind) {
    try {
      if (window.H38OwnerControls && typeof window.H38OwnerControls.isOwnerNotifyEnabled === 'function') {
        return window.H38OwnerControls.isOwnerNotifyEnabled(kind) === true;
      }
    } catch (e) { /* fall through to defaults */ }
    return true; // customer + review default ON (push is not a display category)
  }

  /* ---------- row model ---------- */

  function readBy(row) {
    var raw = field(row, 'Read By JSON');
    if (Array.isArray(raw)) return raw.map(text);
    if (typeof raw === 'string' && raw) {
      try { var parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed.map(text); } catch (e) { /* ignore */ }
    }
    return [];
  }
  function isMine(row) {
    var audience = text(field(row, 'Audience'));
    if (audience === 'owners-admins') return true;
    var uid = text(field(row, 'User ID'));
    return !!uid && uid === myId(); // legacy per-user task notes
  }
  function isVisible(row) {
    if (!row || !isMine(row)) return false;
    var audience = text(field(row, 'Audience'));
    if (audience !== 'owners-admins') return true; // legacy rows always show
    var cat = text(field(row, 'Category'));
    if (cat === 'customer') return categoryOn('customer');
    if (cat === 'review') return categoryOn('review');
    return true;
  }
  function isUnread(row) {
    if (text(field(row, 'Status')) === 'Read') return false;
    return readBy(row).indexOf(myId()) < 0;
  }
  function rowTime(row) {
    var t = new Date(field(row, 'Created Time') || field(row, 'Created At') || 0).getTime();
    return isNaN(t) ? 0 : t;
  }
  function allRows() {
    var s = snap();
    var list = (s && Array.isArray(s.notifications)) ? s.notifications : [];
    return list.filter(isVisible).slice().sort(function (a, b) { return rowTime(b) - rowTime(a); });
  }
  function unreadRows() { return allRows().filter(isUnread); }

  var EVENT_ICONS = {
    booking_request: '📅', customer_request: '📥', customer_message: '💬',
    quote_approved: '✅', quote_declined: '❌', quote_review: '🧾',
    payment_recorded: '💵', online_payment: '💳', customer_upload: '📎',
    approval_pending: '✍️', action_pending: '⏳', action_failed: '⚠️',
    handoff_pending: '🤖', price_review: '🏷️'
  };
  function iconFor(row) {
    var t = text(field(row, 'Event Type'));
    if (EVENT_ICONS[t]) return EVENT_ICONS[t];
    return text(field(row, 'Category')) === 'customer' ? '👤' : '🔔';
  }
  function relTime(row) {
    var t = rowTime(row); if (!t) return '';
    var mins = Math.max(1, Math.round((Date.now() - t) / 60000));
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.round(hrs / 24) + 'd ago';
  }

  /* ---------- persistence (mark read) ---------- */

  function sharedClient() {
    var c = window.H38_SUPABASE_SHARED_CLIENT;
    return c && typeof c.ensure === 'function' ? c.ensure() : null;
  }
  async function persistRead(row) {
    var key = text(field(row, 'Notification ID'));
    var bid = businessId();
    if (!key || !bid) return;
    var by = readBy(row);
    if (by.indexOf(myId()) < 0) by.push(myId());
    var next = Object.assign({}, row, { 'Read By JSON': JSON.stringify(by) });
    if (text(field(row, 'Audience')) !== 'owners-admins') next['Status'] = 'Read';
    // Local copies first so the UI updates instantly.
    var s = snap();
    if (s && Array.isArray(s.notifications)) {
      var i = s.notifications.indexOf(row);
      if (i >= 0) s.notifications[i] = next;
    }
    try {
      var api = sharedClient();
      if (!api) return;
      var existing = await api.from('business_records').select('id,payload')
        .eq('business_id', bid).eq('collection', 'notifications').eq('record_key', key).maybeSingle();
      if (existing && existing.data) {
        var payload = Object.assign({}, existing.data.payload || {}, {
          'Read By JSON': next['Read By JSON'],
          'Status': next['Status'] || existing.data.payload['Status']
        });
        await api.from('business_records').update({ payload: payload, updated_at: new Date().toISOString() }).eq('id', existing.data.id);
      }
    } catch (e) { /* read state is best-effort; never break navigation */ }
  }

  /* ---------- direct fetch (panel open / after Check now) ---------- */

  async function fetchFresh() {
    var bid = businessId();
    var api = sharedClient();
    if (!bid || !api) return;
    try {
      var res = await api.from('business_records')
        .select('record_key,payload,updated_at')
        .eq('business_id', bid).eq('collection', 'notifications').eq('record_status', 'active')
        .order('updated_at', { ascending: false }).limit(100);
      if (res.error || !Array.isArray(res.data)) return;
      var s = snap(); if (!s) return;
      var byKey = {};
      (s.notifications || []).forEach(function (r) { byKey[text(field(r, 'Notification ID'))] = r; });
      res.data.forEach(function (row) {
        var p = row.payload || {};
        var k = text(p['Notification ID']) || row.record_key;
        if (k) byKey[k] = p;
      });
      s.notifications = Object.keys(byKey).map(function (k) { return byKey[k]; });
    } catch (e) { /* snapshot data still renders */ }
  }

  /* ---------- rendering ---------- */

  function badgeEl() { return document.getElementById('ownerNotifyBadge'); }
  function bellEl() { return document.getElementById('ownerNotifyBell'); }

  function renderBadge() {
    var bell = bellEl(); if (!bell) return;
    if (!isOwnerAdmin() || !snap()) { bell.hidden = true; return; }
    bell.hidden = false;
    var n = unreadRows().length;
    var badge = badgeEl();
    if (badge) {
      badge.hidden = n === 0;
      badge.textContent = n > 99 ? '99+' : String(n);
    }
    bell.setAttribute('aria-label', n ? ('Notifications, ' + n + ' unread') : 'Notifications');
  }

  function panelEl() { return document.getElementById('ownerNotifyPanel'); }

  function rowHtml(row) {
    var unread = isUnread(row);
    return '<button type="button" class="owner-notify-row' + (unread ? ' unread' : '') + '" data-notify-key="' + escHtml(text(field(row, 'Notification ID'))) + '">'
      + '<span class="owner-notify-icon" aria-hidden="true">' + iconFor(row) + '</span>'
      + '<span class="owner-notify-text"><strong>' + escHtml(text(field(row, 'Title')) || 'Notification') + '</strong>'
      + (text(field(row, 'Body')) ? '<small>' + escHtml(text(field(row, 'Body'))) + '</small>' : '')
      + '</span>'
      + '<span class="owner-notify-time">' + escHtml(relTime(row)) + '</span>'
      + '</button>';
  }

  function renderPanel() {
    var panel = panelEl(); if (!panel) return;
    var rows = allRows().slice(0, MAX_PANEL);
    var unread = unreadRows().length;
    panel.innerHTML =
      '<div class="owner-notify-head"><strong>Notifications</strong>'
      + '<span class="owner-notify-head-actions">'
      + (unread ? '<button type="button" class="secondary" id="ownerNotifyMarkAll">Mark all read</button>' : '')
      + '<button type="button" class="secondary" id="ownerNotifyCheck">Check now</button>'
      + '<button type="button" class="icon-button" id="ownerNotifyClose" aria-label="Close notifications">✕</button>'
      + '</span></div>'
      + '<div class="owner-notify-list">'
      + (rows.length ? rows.map(rowHtml).join('') : '<div class="owner-notify-empty">Nothing needs you right now. New customer activity and items to review will land here.</div>')
      + '</div>'
      + '<div class="owner-notify-foot">Alert switches live in Settings → Owner Controls → Notifications.</div>';
    var close = document.getElementById('ownerNotifyClose');
    if (close) close.onclick = closePanel;
    var markAll = document.getElementById('ownerNotifyMarkAll');
    if (markAll) markAll.onclick = async function () {
      var pending = unreadRows();
      for (var i = 0; i < pending.length; i++) { try { await persistRead(pending[i]); } catch (e) { /* continue */ } }
      renderBadge(); renderPanel(); renderTodayCard();
    };
    var check = document.getElementById('ownerNotifyCheck');
    if (check) check.onclick = function () { checkNow(check); };
    panel.querySelectorAll('[data-notify-key]').forEach(function (btn) {
      btn.addEventListener('click', function () { onRowClick(btn.getAttribute('data-notify-key')); });
    });
  }

  async function onRowClick(key) {
    var row = allRows().find(function (r) { return text(field(r, 'Notification ID')) === key; });
    if (!row) return;
    try { await persistRead(row); } catch (e) { /* navigate anyway */ }
    renderBadge(); renderTodayCard();
    var page = text(field(row, 'Link Page'));
    var recordId = text(field(row, 'Link Record ID'));
    closePanel();
    if (page) {
      window.H38NotifyFocus = { page: page, recordId: recordId, at: Date.now() };
      try { window.dispatchEvent(new CustomEvent('h38:notify-focus', { detail: window.H38NotifyFocus })); } catch (e) { /* ignore */ }
      if (typeof window.openPage === 'function') window.openPage(page);
    }
  }

  function openPanel() {
    var panel = panelEl(); if (!panel) return;
    renderPanel();
    panel.hidden = false;
    fetchFresh().then(function () { if (!panel.hidden) { renderPanel(); renderBadge(); } });
  }
  function closePanel() { var panel = panelEl(); if (panel) panel.hidden = true; }
  function togglePanel() { var panel = panelEl(); if (!panel) return; if (panel.hidden) openPanel(); else closePanel(); }

  async function checkNow(btn) {
    var bid = businessId();
    var cfg = window.H38_BUSINESS_OFFICE_SUPABASE || {};
    var api = sharedClient();
    if (!bid || !api || !cfg.url || !cfg.publishableKey) {
      if (typeof window.toast === 'function') window.toast('Notifications check is unavailable right now.', true);
      return;
    }
    btn.disabled = true;
    try {
      var sess = await api.auth.getSession();
      var token = sess && sess.data && sess.data.session ? sess.data.session.access_token : '';
      if (!token) throw new Error('Sign in again to check for new alerts.');
      var res = await fetch(cfg.url + '/functions/v1/h38-owner-notify', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'apikey': cfg.publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan', businessId: bid })
      });
      var data = {};
      try { data = await res.json(); } catch (e) { /* ignore */ }
      if (!res.ok || data.status !== 'PASS') throw new Error(data.message || ('Check failed (' + res.status + ')'));
      await fetchFresh();
      renderBadge(); renderPanel(); renderTodayCard();
      if (typeof window.toast === 'function') {
        window.toast(data.created ? ('Checked — ' + data.created + ' new alert' + (data.created === 1 ? '' : 's') + '.') : 'Checked — nothing new.');
      }
    } catch (e) {
      if (typeof window.toast === 'function') window.toast('Could not check: ' + (e && e.message ? e.message : e), true);
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- Today card ---------- */

  function renderTodayCard() {
    var card = document.getElementById('ownerNotifyTodayCard');
    if (!window.state || window.state.page !== 'today' || !isOwnerAdmin()) { if (card) card.remove(); return; }
    var rows = unreadRows();
    if (!rows.length) { if (card) card.remove(); return; }
    var customers = rows.filter(function (r) { return text(field(r, 'Category')) === 'customer'; }).length;
    var review = rows.length - customers;
    var parts = [];
    if (customers) parts.push(customers + ' customer activit' + (customers === 1 ? 'y' : 'ies'));
    if (review) parts.push(review + ' item' + (review === 1 ? '' : 's') + ' to review');
    var html = '<div class="owner-notify-today-inner"><div><strong>🔔 ' + rows.length + ' thing' + (rows.length === 1 ? '' : 's') + ' need' + (rows.length === 1 ? 's' : '') + ' you</strong>'
      + '<small>' + escHtml(parts.join(' · ')) + '</small></div>'
      + '<button type="button" id="ownerNotifyTodayOpen">View alerts</button></div>';
    if (!card) {
      var main = document.getElementById('mainContent');
      var grid = main ? (main.querySelector('.h38-digest-grid') || main.querySelector('.grid')) : null;
      if (!grid || !grid.parentNode) return;
      card = document.createElement('section');
      card.className = 'card span12 owner-notify-today';
      card.id = 'ownerNotifyTodayCard';
      grid.parentNode.insertBefore(card, grid);
    }
    card.innerHTML = html;
    var btn = document.getElementById('ownerNotifyTodayOpen');
    if (btn) btn.onclick = openPanel;
  }

  /* ---------- wiring ---------- */

  function ensurePanel() {
    if (panelEl()) return;
    var panel = document.createElement('div');
    panel.id = 'ownerNotifyPanel';
    panel.className = 'owner-notify-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Notifications');
    document.body.appendChild(panel);
    document.addEventListener('click', function (e) {
      if (panel.hidden) return;
      var bell = bellEl();
      if (panel.contains(e.target) || (bell && bell.contains(e.target))) return;
      closePanel();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });
  }

  var bound = false;
  function refresh() {
    ensurePanel();
    renderBadge();
    renderTodayCard();
    var bell = bellEl();
    if (bell && !bound) {
      bound = true;
      bell.addEventListener('click', togglePanel);
    }
    var panel = panelEl();
    if (panel && !panel.hidden) renderPanel();
  }

  window.H38OwnerNotify = { refresh: refresh, openPanel: openPanel, closePanel: closePanel, BUILD: BUILD };

  window.addEventListener('h38:office-page-rendered', function () { refresh(); });
  var lastBid = '';
  setInterval(function () {
    var bid = businessId();
    if (bid && bid !== lastBid) { lastBid = bid; refresh(); }
    else if (snap()) renderBadge();
  }, 5000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
