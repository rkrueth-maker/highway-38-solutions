/* H38 View as Customer — portal preview entry (gap10, 2026-11-07).
 * One click from the customer record (Customers page) or from the
 * Customer Portal settings card (Owner Controls) opens the REAL customer
 * portal in preview mode for one chosen customer:
 *   customer-portal.html?preview=1&business=<business id>&customer=<key>
 *
 * HARD LIMITS (by design):
 * - This file only opens the preview URL in a new tab. It performs no
 *   server reads or writes of its own, mints no portal link or token,
 *   and creates no session. The preview itself is authorized in the
 *   h38-customer-portal edge function by the owner's own authenticated
 *   session (preview-session action), is scoped to exactly that one
 *   customer of that one tenant, and is refused server-side for every
 *   mutating action.
 * - The customer list for the picker comes from the already-loaded
 *   snapshot via records('customers') — 0 added server requests, 0
 *   startup work (deferred script; decorates only the Customers and
 *   Owner Controls pages, on page-render events).
 *
 * Module intake (MODULE_PERFORMANCE_STANDARD): route: none — an entry
 * decoration on the existing 'customers' and 'controls' pages plus a
 * preview mode of the existing customer portal. Canonical module
 * contract entry: none (view decoration, like queue-board.js; no module
 * key, no new API action in the Office). Server owner: the existing
 * h38-customer-portal edge function (preview-session). Client owners:
 * this file (owner entry) + customer-portal.html (preview mode).
 * Today-critical: no. Cache: none. Prefetch: none. External actions:
 * none (opening a preview sends nothing to the customer).
 * Rollback: remove this file, its CSS, their two index.html tags, the
 * preview mode in customer-portal.html, and the preview-session action
 * in the edge function.
 */
(function () {
  'use strict';

  var BUILD = '20261107-gap10-portalpreview-1';
  var HOST_PAGES = { customers: 1, controls: 1, settings: 1 };

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
  function businessId() {
    var s = st();
    return text((s && (s.businessId || s.business_id)) || (s && s.snapshot && s.snapshot.businessId) || '');
  }
  function customers() {
    return rows('customers').filter(function (r) {
      var status = text(value(r, 'Status', 'status')).toUpperCase();
      return !/DELET|VOID|CANCEL/.test(status) && text(value(r, 'Customer ID', 'customerId', 'id'));
    }).map(function (r) {
      return { id: text(value(r, 'Customer ID', 'customerId', 'id')), name: text(value(r, 'Customer Name', 'name')) || 'Customer' };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  function selectedCustomerId() {
    try {
      if (window.H38_CUSTOMER_360 && text(window.H38_CUSTOMER_360.selectedCustomerId)) return text(window.H38_CUSTOMER_360.selectedCustomerId);
    } catch (e) {}
    return '';
  }
  function portalEnabled() {
    try {
      var list = (st() && st().snapshot && st().snapshot.moduleSettings) || [];
      for (var i = 0; i < list.length; i++) {
        var r = list[i] || {};
        if (text(r.moduleKey || r.module_key) === 'customer_portal') return r.enabled === true;
      }
    } catch (e) {}
    return null; /* unknown — the server is the authority either way */
  }
  function previewUrl(customerId) {
    return './customer-portal.html?preview=1&business=' + encodeURIComponent(businessId()) +
      '&customer=' + encodeURIComponent(customerId);
  }
  function openPreview(customerId) {
    if (!customerId) {
      if (typeof window.toast === 'function') window.toast('Pick a customer first.', true);
      return;
    }
    if (!businessId()) {
      if (typeof window.toast === 'function') window.toast('Open a business first.', true);
      return;
    }
    window.open(previewUrl(customerId), '_blank', 'noopener');
  }

  function barHtml(idSuffix) {
    var list = customers();
    var sel = selectedCustomerId();
    var on = portalEnabled();
    var options = list.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
    return '<div class="h38-pp-bar" data-h38-portal-preview="' + idSuffix + '">' +
      '<div class="h38-pp-text"><strong>👁 View as Customer</strong>' +
      '<span>See the customer portal exactly as a customer sees it — read-only preview. Nothing is sent and no sign-in link is created.</span>' +
      (on === false ? '<span class="h38-pp-off">The customer portal is OFF for this business — turn it on in Owner Controls and the preview will open.</span>' : '') +
      '</div>' +
      '<label class="h38-pp-pick"><span>Customer</span>' +
      '<select data-pp-select aria-label="Choose a customer to preview">' + (options || '<option value="">No customers yet</option>') + '</select></label>' +
      '<button type="button" class="h38-pp-btn" data-pp-open' + (list.length ? '' : ' disabled') + '>View as Customer</button>' +
      '</div>';
  }
  function bindBar(node) {
    if (!node || node.dataset.h38PpBound) return;
    node.dataset.h38PpBound = '1';
    var btn = node.querySelector('[data-pp-open]');
    var selEl = node.querySelector('[data-pp-select]');
    if (btn) btn.addEventListener('click', function () { openPreview(selEl ? selEl.value : selectedCustomerId()); });
  }
  function wrap(html, suffix) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var node = tmp.firstElementChild;
    if (node) { node.setAttribute('data-h38-portal-preview-wrap', suffix); bindBar(node); }
    return node;
  }

  function decorate() {
    var s = st();
    if (!s || !HOST_PAGES[s.page]) return;
    var main = document.getElementById('mainContent');
    if (!main) return;
    if (s.page === 'customers') {
      if (main.querySelector('[data-h38-portal-preview="customers"]')) return;
      var node = wrap(barHtml('customers'), 'customers');
      if (node) main.insertBefore(node, main.firstChild);
      return;
    }
    /* Owner Controls / Settings: the preview entry belongs with the
     * Customer Portal card — the portal settings area. */
    var card = main.querySelector('#customerPortalCard');
    var host = card || main;
    if (host.querySelector('[data-h38-portal-preview="controls"]')) return;
    var cnode = wrap(barHtml('controls'), 'controls');
    if (!cnode) return;
    if (card && card.parentNode) card.parentNode.insertBefore(cnode, card.nextSibling);
    else host.insertBefore(cnode, host.firstChild);
  }
  function scheduleDecorate() { setTimeout(decorate, 0); setTimeout(decorate, 600); }

  window.addEventListener('h38:office-page-rendered', scheduleDecorate);
  window.addEventListener('h38:business-snapshot-updated', scheduleDecorate);
  window.addEventListener('pageshow', scheduleDecorate);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleDecorate, { once: true });
  else scheduleDecorate();

  window.H38_PORTAL_PREVIEW = {
    build: BUILD,
    readOnly: true,
    open: openPreview,
    urlFor: previewUrl,
    customers: customers,
  };
  document.documentElement.dataset.h38PortalPreviewReady = 'ready';
  window.dispatchEvent(new CustomEvent('h38:portal-preview-ready', { detail: { build: BUILD } }));
})();
