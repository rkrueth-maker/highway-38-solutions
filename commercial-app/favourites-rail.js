/* H38 Favourites rail — build 20261030-r2-favourites-1
 *
 * Personal shortcuts for the canonical Office navigation. This module
 * DECORATES the one existing nav (#mainNav, owned by
 * desktop-navigation-authority.js on wide screens and by the mobile
 * primary-nav runtime on phones); it builds no second navigation tree.
 *
 * - Every sidebar nav item gets a star toggle (☆/★). Starring adds the
 *   page to a personal Favourites rail rendered at the TOP of the
 *   sidebar, above the first nav group. On phone widths the same rail
 *   renders as a compact horizontal shortcut row fixed just above the
 *   shell's bottom primary nav — the mobile pattern the shell already
 *   uses — and stars are offered inside the shell's More sheet, which
 *   is where the full nav lives on phones.
 * - Star clicks are intercepted in the WINDOW capture phase so they can
 *   never trigger the nav button's own navigation (several shell layers
 *   also listen for nav clicks in capture phases below window).
 * - Persistence follows the Phase 1 nav-collapse standard exactly:
 *   localStorage, one key per user + business, scoped with the same
 *   identity extraction as navCollapseStorageKey() in
 *   desktop-navigation-authority.js, under the sibling prefix
 *   'h38-favourites-v1'. The key carries no build stamp, and nothing in
 *   the service-worker update path or auth-cache-guard clears
 *   localStorage (the SW activate handler only deletes stale Cache
 *   Storage entries; auth-cache-guard removes only its own named
 *   keys), so favourites survive reloads and version updates.
 * - Re-decoration is event-driven: the nav's own render-complete event
 *   ('h38:office-navigation-access-updated', dispatched by both the
 *   desktop authority and the base renderNav), page-rendered and
 *   snapshot events, plus a slow idle re-check in the style of
 *   owner-chat.js's watch loop. No MutationObserver is used.
 * - Cap: 8 favourites. Beyond that a toast explains the cap and the
 *   star is not added — a rail longer than the sidebar group it sits
 *   above stops being a shortcut.
 *
 * Module intake (MODULE_PERFORMANCE_STANDARD): route: all Office routes
 * (shell decoration, not a module). Canonical contract entry: none —
 * shell personalization, no module key, no route, no API action.
 * Server owner: none. Client owner: this file. Today-critical: no —
 * deferred, loads after the nav authorities, never blocks startup.
 * Data sources/reads: localStorage only, 0 server reads. Cache: the
 * localStorage key itself; scope user+business; TTL: none (user
 * preference, invalidated only by the user's own star toggles or a
 * business/user switch changing the key). Prefetch: none. External
 * actions: none.
 */
(function () {
  'use strict';

  var BUILD = '20261030-r2-favourites-1';
  var STORAGE_PREFIX = 'h38-favourites-v1';
  var MAX_FAVOURITES = 8;
  var RAIL_ID = 'h38FavouritesRail';

  function st() { try { return window.state || null; } catch (e) { return null; } }
  function text(v) { return String(v == null ? '' : v).trim(); }
  function esc(s) {
    s = String(s == null ? '' : s);
    if (typeof window.esc === 'function') return window.esc(s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(msg, bad) { try { if (typeof window.toast === 'function') window.toast(msg, !!bad); } catch (e) {} }
  function mobile() { try { return !!window.matchMedia('(max-width: 760px)').matches; } catch (e) { return false; } }

  /* Same identity extraction as navCollapseStorageKey() in
   * desktop-navigation-authority.js (Phase 1 persistence standard):
   * user email/userId/id/roleId, then businessId, both lower-cased. */
  function storageKey() {
    var s = st(), user = (s && s.snapshot && s.snapshot.user) || {};
    var who = text(user.email || user.userId || user.id || user.roleId || 'signed-in').toLowerCase() || 'signed-in';
    var business = text((s && s.businessId) || (s && s.snapshot && s.snapshot.business && s.snapshot.business.businessId) || 'office').toLowerCase() || 'office';
    return STORAGE_PREFIX + ':' + who + ':' + business;
  }

  function readFavourites() {
    try {
      var raw = window.localStorage && window.localStorage.getItem(storageKey());
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      var seen = {}, out = [];
      parsed.forEach(function (p) {
        var key = text(p);
        if (key && !seen[key]) { seen[key] = true; out.push(key); }
      });
      return out.slice(0, MAX_FAVOURITES);
    } catch (e) { return []; }
  }
  function writeFavourites(list) {
    try { if (window.localStorage) window.localStorage.setItem(storageKey(), JSON.stringify(list)); } catch (e) {}
  }

  function pageLabel(key) {
    try {
      var defs = window.PAGE_DEFS || {};
      var d = defs[key];
      if (Array.isArray(d)) return d.length > 1 ? String(d[1]) : String(d[0] || key);
    } catch (e) {}
    return key;
  }
  function pageIcon(key) {
    try {
      var defs = window.PAGE_DEFS || {};
      var d = defs[key];
      if (Array.isArray(d) && d.length > 1) return String(d[0] || '');
    } catch (e) {}
    return '';
  }
  function allowed(key) {
    try { return typeof window.allowedPages === 'function' ? window.allowedPages().indexOf(key) !== -1 : true; }
    catch (e) { return true; }
  }

  function toggleFavourite(page) {
    var list = readFavourites();
    var at = list.indexOf(page);
    if (at !== -1) {
      list.splice(at, 1);
      writeFavourites(list);
    } else {
      if (list.length >= MAX_FAVOURITES) {
        toast('Favourites is full (' + MAX_FAVOURITES + '). Un-star one to add another.', true);
        return;
      }
      list.push(page);
      writeFavourites(list);
    }
    decorate(true);
  }

  /* ---------- rail rendering ---------- */

  function railHtml(list) {
    return '<div class="h38-fav-label" id="h38FavouritesLabel">★ Favourites</div>' +
      '<div class="h38-fav-chips">' + list.map(function (page) {
        var icon = pageIcon(page);
        return '<span class="h38-fav-chip-wrap">' +
          '<button type="button" class="h38-fav-chip" data-h38-fav-page="' + esc(page) + '">' +
            (icon ? '<span class="nav-icon" aria-hidden="true">' + esc(icon) + '</span>' : '') +
            '<span>' + esc(pageLabel(page)) + '</span>' +
          '</button>' +
          '<button type="button" class="h38-fav-unstar" data-h38-fav-star="' + esc(page) + '" aria-label="Remove ' + esc(pageLabel(page)) + ' from favourites" title="Remove from favourites">★</button>' +
        '</span>';
      }).join('') + '</div>';
  }

  function ensureRail(nav, list) {
    var rail = document.getElementById(RAIL_ID);
    if (!list.length) {
      if (rail) rail.remove();
      return null;
    }
    if (!rail) {
      rail = document.createElement('div');
      rail.id = RAIL_ID;
      rail.className = 'h38-fav-rail';
      rail.setAttribute('role', 'group');
      rail.setAttribute('aria-labelledby', 'h38FavouritesLabel');
    }
    var html = railHtml(list);
    if (rail.innerHTML !== html) rail.innerHTML = html;
    if (mobile()) {
      /* Phone pattern: a horizontal row just above the fixed bottom
       * primary nav, as a sibling of #mainNav in the app shell. */
      rail.classList.add('h38-fav-rail--mobile');
      rail.classList.remove('h38-fav-rail--sidebar');
      if (nav && nav.parentElement && rail.parentElement !== nav.parentElement) {
        nav.parentElement.insertBefore(rail, nav);
      } else if (nav && rail.nextElementSibling !== nav && rail.parentElement === nav.parentElement) {
        nav.parentElement.insertBefore(rail, nav);
      }
    } else {
      /* Wide screens: top of the sidebar, above the first group. */
      rail.classList.add('h38-fav-rail--sidebar');
      rail.classList.remove('h38-fav-rail--mobile');
      if (nav && rail.parentElement !== nav) nav.insertBefore(rail, nav.firstChild);
    }
    rail.querySelectorAll('[data-h38-fav-page]').forEach(function (chip) {
      chip.onclick = function () {
        var page = chip.getAttribute('data-h38-fav-page');
        if (page && typeof window.openPage === 'function') window.openPage(page);
      };
    });
    return rail;
  }

  /* ---------- star decoration ---------- */

  function starSpan(page, isFav) {
    var span = document.createElement('span');
    span.className = 'h38-fav-star' + (isFav ? ' is-fav' : '');
    span.setAttribute('data-h38-fav-star', page);
    span.setAttribute('role', 'button');
    span.setAttribute('tabindex', '-1');
    span.setAttribute('aria-label', (isFav ? 'Remove ' : 'Add ') + pageLabel(page) + ' ' + (isFav ? 'from' : 'to') + ' favourites');
    span.setAttribute('title', isFav ? 'Remove from favourites' : 'Add to favourites');
    span.textContent = isFav ? '★' : '☆';
    return span;
  }

  function decorateButton(btn, page, favs) {
    if (!btn || !page) return;
    var isFav = favs.indexOf(page) !== -1;
    var star = btn.querySelector(':scope > [data-h38-fav-star]');
    if (!star) {
      star = starSpan(page, isFav);
      btn.appendChild(star);
      btn.classList.add('h38-fav-has-star');
    } else {
      var want = isFav ? '★' : '☆';
      if (star.textContent !== want) star.textContent = want;
      star.classList.toggle('is-fav', isFav);
      if (star.getAttribute('data-h38-fav-star') !== page) star.setAttribute('data-h38-fav-star', page);
    }
  }

  function decorate(force) {
    var s = st();
    var nav = document.getElementById('mainNav');
    if (!nav || !s || !s.snapshot || !s.snapshot.user) {
      var rail = document.getElementById(RAIL_ID);
      if (rail && (!s || !s.snapshot || !s.snapshot.user)) rail.remove();
      return false;
    }
    var favs = readFavourites().filter(allowed);
    ensureRail(nav, favs);
    /* Sidebar / primary-bar items. Desktop authority renders
     * button[data-page]; the mobile primary bar renders
     * button[data-h38-primary] (its "more" button is not a page). */
    nav.querySelectorAll(':scope > button[data-page], :scope > button[data-h38-primary]').forEach(function (btn) {
      var page = btn.getAttribute('data-page') || btn.getAttribute('data-h38-primary');
      if (!page || page === 'more') return;
      decorateButton(btn, page, favs);
    });
    /* Phone More sheet: the full nav on phones (buttons carry
     * data-more-page). Decorate whenever the sheet exists. */
    var dialog = document.getElementById('h38PrimaryMoreDialog');
    if (dialog) {
      dialog.querySelectorAll('button[data-more-page]').forEach(function (btn) {
        decorateButton(btn, btn.getAttribute('data-more-page'), favs);
      });
    }
    return true;
  }

  /* Star + un-star clicks: window CAPTURE phase, so the click is
   * consumed before any nav button handler (bubble onclick) or any
   * document-level capture handler in the shell can treat it as
   * navigation. */
  window.addEventListener('click', function (event) {
    var star = event.target && event.target.closest ? event.target.closest('[data-h38-fav-star]') : null;
    if (!star) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    var page = star.getAttribute('data-h38-fav-star');
    if (page) toggleFavourite(page);
  }, true);

  /* Keyboard parity: Enter/Space on a focused star span. */
  window.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var star = event.target && event.target.closest ? event.target.closest('[data-h38-fav-star]') : null;
    if (!star) return;
    event.preventDefault();
    event.stopPropagation();
    var page = star.getAttribute('data-h38-fav-star');
    if (page) toggleFavourite(page);
  }, true);

  function scheduleDecorate() {
    /* Run after the nav authorities' own reconcile microtasks. */
    setTimeout(function () { decorate(false); }, 0);
    setTimeout(function () { decorate(false); }, 250);
  }

  window.addEventListener('h38:office-navigation-access-updated', scheduleDecorate);
  window.addEventListener('h38:office-page-rendered', scheduleDecorate);
  window.addEventListener('h38:business-snapshot-updated', scheduleDecorate);
  window.addEventListener('h38:auth-cleared', scheduleDecorate);
  window.addEventListener('pageshow', scheduleDecorate);
  if (window.matchMedia) {
    var mq = window.matchMedia('(max-width: 760px)');
    if (mq.addEventListener) mq.addEventListener('change', scheduleDecorate);
    else if (mq.addListener) mq.addListener(scheduleDecorate);
  }
  /* Opening the phone More sheet rebuilds its grid; decorate it right
   * after the sheet's own open handler has run. */
  document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && event.target.closest('[data-h38-primary="more"]')) {
      setTimeout(function () { decorate(false); }, 60);
    }
  });

  /* Slow idle re-check (owner-chat.js watch-loop precedent): catches
   * nav rebuilds that arrive without one of the events above. Cheap —
   * it only writes to the DOM when a star or the rail is missing or
   * stale. */
  var lastSig = '';
  (function watch() {
    try {
      var nav = document.getElementById('mainNav');
      if (nav) {
        var favs = readFavourites().join(',');
        var buttons = nav.querySelectorAll(':scope > button[data-page], :scope > button[data-h38-primary]').length;
        var stars = nav.querySelectorAll('[data-h38-fav-star]').length;
        var rail = document.getElementById(RAIL_ID);
        var sig = favs + '|' + buttons + '|' + stars + '|' + (rail ? 'rail' : 'norail') + '|' + (mobile() ? 'm' : 'd');
        if (sig !== lastSig) { lastSig = sig; decorate(false); }
      }
    } catch (e) {}
    setTimeout(watch, 1200);
  })();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleDecorate, { once: true });
  else scheduleDecorate();

  window.H38_FAVOURITES = Object.freeze({
    build: BUILD,
    storageKey: storageKey,
    read: readFavourites,
    toggle: toggleFavourite,
    decorate: decorate,
    max: MAX_FAVOURITES
  });
})();
