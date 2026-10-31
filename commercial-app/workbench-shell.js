/* H38 Workbench shell — build 20261031-workbench-3
 *
 * Direction B ("The Workbench") laptop layer, slice 1: shell + palette.
 *
 * - DARK ICON RAIL (laptop only, >=761px): replaces the 22-item text
 *   sidebar visually on wide screens. It builds NO second navigation
 *   tree: rail items mirror the canonical #mainNav buttons (owned by
 *   desktop-navigation-authority.js) and activate them by click, so
 *   module visibility, role gating and group state stay canonical.
 *   Favourites pin to the top of the rail, read from the SAME
 *   localStorage store favourites-rail.js owns ('h38-favourites-v1',
 *   Phase 1 per-user+business key standard); a hover star on each rail
 *   item writes that same store, so the phone rail and this rail never
 *   diverge.
 * - COMMAND PALETTE (Ctrl/Cmd+K, or the topbar button that prints the
 *   shortcut): global search across customers / jobs / quotes /
 *   invoices (existing records only), jump-to-page, and prepare-only
 *   commands. HARD FENCE: the palette NEVER sends anything
 *   customer-facing and NEVER moves money. Commands that sound like
 *   sends ("invoice Miller", "quote Miller") only navigate and
 *   pre-stage the existing gated flows (the page's own create form /
 *   the Customer 360 quote action); the send itself still happens
 *   through the app's normal owner-confirmed paths.
 * - ONE record renderer, TWO shells: this module adds no renderer and
 *   no data path. It decorates the shell only. Below 761px it is
 *   completely inert: no DOM, no styles apply (workbench.css is fully
 *   media-gated), phone flows are byte-identical.
 * - Re-sync is event-driven (nav access event, page-rendered,
 *   snapshot-updated) plus a slow idle re-check, in the style of
 *   favourites-rail.js / owner-chat.js. No MutationObserver.
 *
 * Module intake (MODULE_PERFORMANCE_STANDARD): route: all Office
 * routes (shell decoration, not a module). Canonical contract entry:
 * none — shell personalization + navigation aid, no module key, no
 * route, no API action. Server owner: none. Client owner: this file.
 * Today-critical: no — deferred, loads after the nav authorities,
 * never blocks startup. Data sources/reads: localStorage + the
 * already-loaded snapshot via records()/H38_CUSTOMER_360, 0 server
 * reads. Cache: none. External actions: none (navigation only).
 */
(function () {
  'use strict';

  var BUILD = '20261031-authfix-1';
  var RAIL_ID = 'h38WorkbenchRail';
  var PALETTE_ID = 'h38WorkbenchPalette';
  var TOPBTN_ID = 'h38WorkbenchPaletteButton';
  var FAV_PREFIX = 'h38-favourites-v1';
  var MAX_FAVOURITES = 8;

  function st() { try { return window.state || null; } catch (e) { return null; } }
  function text(v) { return String(v == null ? '' : v).trim(); }
  function esc(s) {
    s = String(s == null ? '' : s);
    if (typeof window.esc === 'function') return window.esc(s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(msg, bad) { try { if (typeof window.toast === 'function') window.toast(msg, !!bad); } catch (e) {} }
  function wide() { try { return !!window.matchMedia('(min-width: 761px)').matches; } catch (e) { return false; } }
  function rows(name) {
    try { if (typeof window.records === 'function') { var r = window.records(name); if (Array.isArray(r)) return r; } } catch (e) {}
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
  function money(v) {
    var n = Number(String(v == null ? '' : v).replace(/[$,]/g, ''));
    if (!Number.isFinite(n)) return '';
    try { if (typeof window.money === 'function') return window.money(n); } catch (e) {}
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }
  function pageDefs() { try { return window.PAGE_DEFS || {}; } catch (e) { return {}; } }
  function navPages() {
    var out = [], seen = {};
    document.querySelectorAll('#mainNav button[data-page]').forEach(function (b) {
      var p = b.getAttribute('data-page');
      if (p && !seen[p]) { seen[p] = 1; out.push(p); }
    });
    return out;
  }
  function customerName(id) {
    if (!id) return '';
    var c = rows('customers').filter(function (r) { return text(value(r, 'Customer ID', 'customerId', 'id')) === text(id); })[0];
    return c ? text(value(c, 'Customer Name', 'name')) : '';
  }

  /* ---------- favourites store (same key standard as favourites-rail.js) ---------- */
  function favKey() {
    var s = st(), user = (s && s.snapshot && s.snapshot.user) || {};
    var who = text(user.email || user.userId || user.id || user.roleId || 'signed-in').toLowerCase() || 'signed-in';
    var business = text((s && s.businessId) || (s && s.snapshot && s.snapshot.business && s.snapshot.business.businessId) || 'office').toLowerCase() || 'office';
    return FAV_PREFIX + ':' + who + ':' + business;
  }
  function readFavs() {
    try {
      var raw = window.localStorage && window.localStorage.getItem(favKey());
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(function (p) { return typeof p === 'string' && p; }) : [];
    } catch (e) { return []; }
  }
  function writeFavs(list) {
    try { window.localStorage && window.localStorage.setItem(favKey(), JSON.stringify(list)); } catch (e) {}
  }
  function toggleFav(page) {
    var favs = readFavs(), i = favs.indexOf(page);
    if (i >= 0) favs.splice(i, 1);
    else {
      if (favs.length >= MAX_FAVOURITES) { toast('Favourites is full (' + MAX_FAVOURITES + '). Unstar one first.', true); return; }
      favs.push(page);
    }
    writeFavs(favs);
    renderRail();
  }

  /* ---------- icon rail ---------- */
  function railItem(page, favs, isFavSection) {
    var defs = pageDefs(), def = defs[page] || ['•', page];
    var icon = def.length > 1 ? def[0] : '•', label = def.length > 1 ? def[1] : def[0];
    var starred = favs.indexOf(page) >= 0;
    var current = st() && st().page === page;
    return '<div class="h38-wb-rail-item' + (current ? ' active' : '') + '" data-wb-page="' + esc(page) + '">' +
      '<button type="button" class="h38-wb-rail-go" data-wb-go="' + esc(page) + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' +
      '<span class="h38-wb-rail-icon" aria-hidden="true">' + esc(icon) + '</span>' +
      '<span class="h38-wb-rail-label">' + esc(label) + '</span></button>' +
      (isFavSection ? '' : '<button type="button" class="h38-wb-rail-star' + (starred ? ' on' : '') + '" data-wb-star="' + esc(page) + '" title="' + (starred ? 'Remove from favourites' : 'Add to favourites') + '" aria-label="' + (starred ? 'Remove ' : 'Add ') + esc(label) + (starred ? ' from favourites' : ' to favourites') + '">' + (starred ? '★' : '☆') + '</button>') +
      '</div>';
  }
  function renderRail() {
    var shell = document.querySelector('.app-shell');
    if (!shell || !st() || !st().snapshot) return;
    var rail = document.getElementById(RAIL_ID);
    if (!wide()) { if (rail) rail.remove(); document.body.classList.remove('h38-wb-on'); return; }
    var pages = navPages();
    if (!pages.length) return; // nav not rendered yet; a later event will retry
    if (!rail) {
      rail = document.createElement('nav');
      rail.id = RAIL_ID;
      rail.className = 'h38-wb-rail';
      rail.setAttribute('aria-label', 'Workbench quick navigation');
      shell.insertBefore(rail, shell.firstChild);
    }
    document.body.classList.add('h38-wb-on');
    var favs = readFavs().filter(function (p) { return pages.indexOf(p) >= 0; });
    var html = '';
    if (favs.length) {
      html += '<div class="h38-wb-rail-head" title="Your favourites">★</div>' +
        favs.map(function (p) { return railItem(p, favs, true); }).join('') +
        '<div class="h38-wb-rail-div" role="separator"></div>';
    }
    html += pages.map(function (p) { return railItem(p, favs, false); }).join('');
    html += '<button type="button" class="h38-wb-rail-palette" id="h38WbRailPalette" title="Search or command">⌘<span>Ctrl K</span></button>';
    if (rail._wbHtml !== html) {
      rail._wbHtml = html;
      rail.innerHTML = html;
      rail.querySelectorAll('[data-wb-go]').forEach(function (b) {
        b.addEventListener('click', function () { goPage(b.getAttribute('data-wb-go')); });
      });
      rail.querySelectorAll('[data-wb-star]').forEach(function (b) {
        b.addEventListener('click', function (ev) { ev.stopPropagation(); toggleFav(b.getAttribute('data-wb-star')); });
      });
      var pal = rail.querySelector('#h38WbRailPalette');
      if (pal) pal.addEventListener('click', openPalette);
    }
  }
  function goPage(page) {
    var btn = document.querySelector('#mainNav button[data-page="' + page + '"]');
    if (btn) { btn.click(); return; }
    try { if (typeof window.openPage === 'function') window.openPage(page); } catch (e) {}
  }

  /* ---------- topbar palette button ---------- */
  function renderTopButton() {
    var actions = document.querySelector('.top-actions');
    if (!actions || document.getElementById(TOPBTN_ID) || !st() || !st().snapshot) return;
    var b = document.createElement('button');
    b.id = TOPBTN_ID;
    b.type = 'button';
    b.className = 'h38-wb-topbtn';
    b.title = 'Search jobs, customers, quotes and invoices — or run a command';
    b.innerHTML = '🔍 <span>Search / command</span> <kbd>Ctrl K</kbd>';
    b.addEventListener('click', openPalette);
    actions.insertBefore(b, actions.firstChild);
  }

  /* ---------- palette ---------- */
  var palState = { items: [], active: 0 };

  function commandsFor(q) {
    var out = [];
    var lower = q.toLowerCase();
    var cmds = [
      { kind: 'command', icon: '🧾', title: 'New quote', hint: 'Opens the quote builder — nothing is sent', kw: 'new quote create estimate', run: function () { goPage('quotes'); setTimeout(function () { var b = document.getElementById('newQuoteButton'); if (b) b.click(); }, 350); } },
      { kind: 'command', icon: '💵', title: 'New invoice', hint: 'Opens the invoice form — nothing is sent or charged', kw: 'new invoice create bill', run: function () { goPage('money'); setTimeout(function () { var b = document.querySelector('[data-h38-create="invoiceForm"]'); if (b) b.click(); }, 350); } },
      { kind: 'command', icon: '🧰', title: 'New request', hint: 'Opens the new-request form on Jobs', kw: 'new request job intake', run: function () { goPage('work'); setTimeout(function () { var b = document.querySelector('[data-h38-create="requestForm"]'); if (b) b.click(); }, 350); } },
      { kind: 'command', icon: '👤', title: 'Add customer', hint: 'Opens the add-customer form', kw: 'new add customer', run: function () { goPage('customers'); setTimeout(function () { var b = document.getElementById('h38AddCustomerTop'); if (b) b.click(); }, 350); } },
      { kind: 'command', icon: '🤖', title: 'Ask Kit' + (q ? ': “' + q + '”' : ''), hint: 'Asks the Office assistant about your records', kw: 'ask kit hank ai question', run: function () { askKit(q); } }
    ];
    cmds.forEach(function (c) { if (!q || c.kw.indexOf(lower.split(' ')[0]) >= 0 || c.title.toLowerCase().indexOf(lower) >= 0 || c.kind === 'command' && lower.length < 3) out.push(c); });
    /* "invoice <customer>" / "quote <customer>" — prepare-only staging */
    var m = lower.match(/^(invoice|quote)\s+(.+)$/);
    if (m) {
      var tail = m[2], verb = m[1];
      rows('customers').forEach(function (c) {
        var name = text(value(c, 'Customer Name', 'name'));
        if (name && name.toLowerCase().indexOf(tail) >= 0) {
          var cid = text(value(c, 'Customer ID', 'customerId', 'id'));
          out.unshift({
            kind: 'command', icon: verb === 'invoice' ? '💵' : '🧾',
            title: (verb === 'invoice' ? 'Start invoice for ' : 'Start quote for ') + name,
            hint: 'Opens the ' + verb + ' flow with this customer picked — you review before anything is sent',
            run: verb === 'invoice' ? function () { stageInvoiceFor(cid); } : function () { stageQuoteFor(cid); }
          });
        }
      });
    }
    return out;
  }
  /* The Customer 360 module lazy-loads with the Customers page; retry
   * briefly until it exists, then apply the selection through its own
   * API (selectedCustomerId + renderNow — the same path its own search
   * UI uses). Bounded: gives up quietly after ~2.5s. */
  function selectCustomerWhenReady(cid, attempt) {
    var api = null;
    try { api = window.H38_CUSTOMER_360; } catch (e) {}
    if (api && typeof api.renderNow === 'function') {
      try { api.selectedCustomerId = cid; api.selectedTab = 'overview'; api.renderNow(window); } catch (e) {}
      return true;
    }
    if (attempt < 6) setTimeout(function () { selectCustomerWhenReady(cid, attempt + 1); }, 400);
    return false;
  }
  function stageQuoteFor(cid) {
    goPage('customers');
    var tries = 0;
    (function attempt() {
      if (selectCustomerWhenReady(cid, 99)) {
        setTimeout(function () {
          var b = document.querySelector('[data-c360-action="quote"]');
          if (b) b.click();
        }, 250);
        return;
      }
      if (++tries < 6) setTimeout(attempt, 400);
    })();
  }
  function stageInvoiceFor(cid) {
    goPage('money');
    setTimeout(function () {
      var b = document.querySelector('[data-h38-create="invoiceForm"]');
      if (b) b.click();
      setTimeout(function () {
        var form = document.getElementById('h38-money-invoices');
        if (!form) return;
        var sel = form.querySelector('select');
        if (sel) {
          for (var i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === cid || sel.options[i].text === customerName(cid)) { sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true })); break; }
          }
        }
      }, 250);
    }, 400);
  }
  function askKit(q) {
    goPage('ai');
    setTimeout(function () {
      try {
        var chat = window.H38_OWNER_CHAT;
        if (q && chat && typeof chat.send === 'function' && (typeof chat.handlesWorkspaceChat !== 'function' || chat.handlesWorkspaceChat())) { chat.send(q); return; }
        var input = document.querySelector('#mainContent textarea, #mainContent input[type="text"]');
        if (input && q) { input.value = q; input.focus(); }
      } catch (e) {}
    }, 400);
  }
  function resultsFor(q) {
    var out = [], lower = q.toLowerCase(), defs = pageDefs();
    navPages().forEach(function (p) {
      var def = defs[p] || ['•', p], label = def.length > 1 ? def[1] : def[0];
      if (!q || label.toLowerCase().indexOf(lower) >= 0 || p.indexOf(lower) >= 0) {
        out.push({ kind: 'page', icon: def[0], title: label, hint: 'Go to page', run: function () { goPage(p); } });
      }
    });
    if (q) {
      /* Customer search: the canonical H38_CUSTOMER_360.searchCustomers
       * when that (lazy-loaded) module has loaded; otherwise a local
       * name/city/address match over the same snapshot rows, so a
       * customer is findable before the Customers page was ever opened.
       * Selection likewise retries briefly for the lazy module. */
      var custHits = [], custSeen = {};
      try {
        var api = window.H38_CUSTOMER_360, snap = st() && st().snapshot;
        if (api && snap && typeof api.searchCustomers === 'function') {
          api.searchCustomers(snap, q).slice(0, 5).forEach(function (hit) {
            var c = hit.bundle && hit.bundle.customer;
            custSeen[hit.customerId] = 1;
            custHits.push({ id: hit.customerId, name: text(value(c, 'Customer Name', 'name')) || 'Customer', reason: hit.reason || '' });
          });
        }
      } catch (e) {}
      rows('customers').forEach(function (c) {
        if (custHits.length >= 5) return;
        var cid = text(value(c, 'Customer ID', 'customerId', 'id'));
        if (!cid || custSeen[cid]) return;
        var name = text(value(c, 'Customer Name', 'name'));
        var hay = (name + ' ' + text(value(c, 'City', 'city')) + ' ' + text(value(c, 'Service Address', 'Address'))).toLowerCase();
        if (name && hay.indexOf(lower) >= 0) { custSeen[cid] = 1; custHits.push({ id: cid, name: name, reason: text(value(c, 'City', 'city')) }); }
      });
      custHits.forEach(function (hit) {
        out.push({ kind: 'customer', icon: '👤', title: hit.name, hint: 'Customer' + (hit.reason ? ' · ' + hit.reason : ''), run: function () { goPage('customers'); selectCustomerWhenReady(hit.id, 0); } });
      });
      rows('jobs').forEach(function (j) {
        var title = text(value(j, 'Project Title', 'Title')), num = text(value(j, 'Job Number')), cust = customerName(value(j, 'Customer ID', 'customerId'));
        if ((title + ' ' + num + ' ' + cust).toLowerCase().indexOf(lower) < 0) return;
        out.push({ kind: 'job', icon: '🧰', title: title || num || 'Job', hint: ['Job', num, text(value(j, 'Status', 'status')), cust].filter(Boolean).join(' · '), run: function () { goPage('work'); if (window.H38_WORKBENCH) window.H38_WORKBENCH.pendingJobId = text(value(j, 'Job ID', 'jobId', 'id')); setTimeout(function () { if (window.H38_WORKBENCH && typeof window.H38_WORKBENCH.selectJob === 'function') window.H38_WORKBENCH.selectJob(text(value(j, 'Job ID', 'jobId', 'id'))); }, 400); } });
      });
      rows('quotes').forEach(function (qt) {
        var title = text(value(qt, 'Project Title', 'Title')), num = text(value(qt, 'Quote Number')), cust = customerName(value(qt, 'Customer ID', 'customerId'));
        if ((title + ' ' + num + ' ' + cust).toLowerCase().indexOf(lower) < 0) return;
        var id = text(value(qt, 'Quote ID', 'quoteId', 'id'));
        out.push({ kind: 'quote', icon: '🧾', title: (num ? num + ' — ' : '') + (title || 'Quote'), hint: ['Quote', text(value(qt, 'Status', 'status')), money(value(qt, 'Total', 'total')), cust].filter(Boolean).join(' · '), run: function () { goPage('quotes'); setTimeout(function () { try { if (typeof window.openQuote === 'function') window.openQuote(id); } catch (e) {} }, 350); } });
      });
      rows('invoices').forEach(function (inv) {
        var num = text(value(inv, 'Invoice Number')), cust = customerName(value(inv, 'Customer ID', 'customerId'));
        if ((num + ' ' + cust).toLowerCase().indexOf(lower) < 0) return;
        out.push({ kind: 'invoice', icon: '💵', title: 'Invoice ' + (num || ''), hint: ['Invoice', text(value(inv, 'Status', 'status')), 'total ' + money(value(inv, 'Total', 'total')), 'balance ' + money(value(inv, 'Balance', 'balance')), cust].filter(Boolean).join(' · '), run: function () { goPage('money'); setTimeout(function () { flashInvoiceRow(num); }, 400); } });
      });
    }
    return commandsFor(q).concat(out).slice(0, 14);
  }
  function flashInvoiceRow(num) {
    if (!num) return;
    var rowsEls = document.querySelectorAll('#mainContent .row');
    for (var i = 0; i < rowsEls.length; i++) {
      if (rowsEls[i].textContent && rowsEls[i].textContent.indexOf(num) >= 0) {
        rowsEls[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
        rowsEls[i].classList.add('h38-wb-flash');
        setTimeout(function (el) { el.classList.remove('h38-wb-flash'); }, 1800, rowsEls[i]);
        return;
      }
    }
  }
  function ensurePalette() {
    var pal = document.getElementById(PALETTE_ID);
    if (pal) return pal;
    pal = document.createElement('div');
    pal.id = PALETTE_ID;
    pal.className = 'h38-wb-palette-backdrop';
    pal.hidden = true;
    pal.innerHTML = '<div class="h38-wb-palette" role="dialog" aria-modal="true" aria-label="Search or command">' +
      '<input id="h38WbPaletteInput" type="text" autocomplete="off" spellcheck="false" placeholder="Search jobs, customers, quotes, invoices… or type a command (invoice Miller)">' +
      '<div class="h38-wb-palette-list" id="h38WbPaletteList" role="listbox"></div>' +
      '<div class="h38-wb-palette-foot">↑ ↓ choose · Enter open · Esc close — commands only open screens and stage work; nothing is sent or charged from here.</div></div>';
    document.body.appendChild(pal);
    pal.addEventListener('mousedown', function (e) { if (e.target === pal) closePalette(); });
    var input = pal.querySelector('#h38WbPaletteInput');
    input.addEventListener('input', function () { paintPalette(input.value.trim()); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); runActive(); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    });
    return pal;
  }
  function paintPalette(q) {
    var list = document.getElementById('h38WbPaletteList');
    if (!list) return;
    palState.items = resultsFor(q);
    palState.active = 0;
    if (!palState.items.length) {
      list.innerHTML = '<div class="h38-wb-palette-empty">No matches in your records. Commands like “invoice Miller” stage work without sending anything.</div>';
      return;
    }
    list.innerHTML = palState.items.map(function (it, i) {
      return '<button type="button" role="option" class="h38-wb-palette-item' + (i === palState.active ? ' active' : '') + '" data-wb-pal="' + i + '">' +
        '<span class="h38-wb-palette-icon" aria-hidden="true">' + esc(it.icon || '•') + '</span>' +
        '<span class="h38-wb-palette-main"><strong>' + esc(it.title) + '</strong><small>' + esc(it.hint || '') + '</small></span></button>';
    }).join('');
    list.querySelectorAll('[data-wb-pal]').forEach(function (b) {
      b.addEventListener('click', function () { palState.active = Number(b.getAttribute('data-wb-pal')); runActive(); });
      b.addEventListener('mousemove', function () {
        var i = Number(b.getAttribute('data-wb-pal'));
        if (palState.active !== i) { palState.active = i; markActive(); }
      });
    });
  }
  function markActive() {
    var list = document.getElementById('h38WbPaletteList');
    if (!list) return;
    list.querySelectorAll('[data-wb-pal]').forEach(function (b) {
      b.classList.toggle('active', Number(b.getAttribute('data-wb-pal')) === palState.active);
    });
  }
  function moveActive(d) {
    if (!palState.items.length) return;
    palState.active = (palState.active + d + palState.items.length) % palState.items.length;
    markActive();
    var el = document.querySelector('[data-wb-pal="' + palState.active + '"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
  function runActive() {
    var it = palState.items[palState.active];
    closePalette();
    if (it && typeof it.run === 'function') { try { it.run(); } catch (e) {} }
  }
  function openPalette() {
    if (!wide() || !st() || !st().snapshot) return;
    var pal = ensurePalette();
    pal.hidden = false;
    var input = pal.querySelector('#h38WbPaletteInput');
    input.value = '';
    paintPalette('');
    setTimeout(function () { input.focus(); }, 0);
  }
  function closePalette() {
    var pal = document.getElementById(PALETTE_ID);
    if (pal) pal.hidden = true;
  }
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key || '').toLowerCase() === 'k') {
      e.preventDefault();
      var pal = document.getElementById(PALETTE_ID);
      if (pal && !pal.hidden) closePalette(); else openPalette();
    }
  });

  /* ---------- lifecycle ---------- */
  function reconcile() {
    /* Auth lock (Rick 2026-10-31): no workbench chrome over the sign-in screen. */
    if (document.body && document.body.classList.contains('h38-auth-locked')) {
      ['.h38-wb-rail', '.h38-wb-topbtn'].forEach(function (sel) { var n = document.querySelector(sel); if (n) n.remove(); });
      return;
    }
    renderRail(); renderTopButton();
  }
  window.addEventListener('h38:office-navigation-access-updated', reconcile);
  window.addEventListener('h38:office-page-rendered', reconcile);
  window.addEventListener('h38:business-snapshot-updated', reconcile);
  window.addEventListener('pageshow', reconcile);
  try { window.matchMedia('(min-width: 761px)').addEventListener('change', reconcile); } catch (e) {}
  var ticks = 0;
  var timer = setInterval(function () { reconcile(); if (++ticks > 40) clearInterval(timer); }, 500);

  window.H38_WORKBENCH = window.H38_WORKBENCH || {};
  window.H38_WORKBENCH.build = BUILD;
  window.H38_WORKBENCH.openPalette = openPalette;
  window.H38_WORKBENCH.flashInvoiceRow = flashInvoiceRow;
})();
