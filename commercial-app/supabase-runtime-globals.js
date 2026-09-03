(function () {
  'use strict';
  const nativeAndroid = /H38SiteScannerAndroid\//.test(String(navigator.userAgent || ''));
  const nativeReturnReloadParam = 'h38NativeReturnCold';
  const mobileOffice = () => !!window.matchMedia?.('(max-width: 760px)').matches;
  const EARLY_PRIMARY = [['today','⌂','Today'],['work','🧰','Jobs'],['customers','👤','Customers'],['messages','💬','Messages']];

  function installMobileFirstFrameStyle() {
    if (!mobileOffice() || document.getElementById('h38MobileFirstFrameStyle')) return;
    const style = document.createElement('style');
    style.id = 'h38MobileFirstFrameStyle';
    style.textContent = `
@media(max-width:760px){
 html,body{height:100%!important;min-height:100%!important;max-height:100%!important;max-width:100%!important;overflow:hidden!important;overflow-x:hidden!important;overscroll-behavior:none!important}
 body:not(.h38-field-scroll-lock){height:100%!important;min-height:100%!important;max-height:100%!important;overflow:hidden!important;touch-action:auto!important}
 .topbar{position:relative!important;top:auto!important;z-index:1600;min-height:52px;padding:6px 8px!important;gap:6px!important;transform:translateZ(0);backface-visibility:hidden}
 .topbar .brand{flex:1 1 auto;min-width:0;gap:7px!important;overflow:hidden}.topbar .brand-logo{width:34px!important;height:34px!important;flex:0 0 34px!important;object-fit:contain;border-radius:8px}.topbar .brand>div{min-width:0}.topbar .brand strong{display:block;max-width:118px;font-size:.82rem;line-height:1.12;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.topbar .brand small{display:none}.topbar .top-actions{flex:0 0 auto;gap:4px!important}.topbar .icon-button,.topbar .ai-launcher{width:36px!important;height:36px!important;min-height:36px!important;padding:0!important;border-radius:10px!important}
 .business-bar:empty{display:none}.business-bar{position:relative!important;top:auto!important;z-index:1500;padding:5px 10px!important}.business-bar span{font-size:.72rem!important;line-height:1.2}
 body:not(.h38-field-scroll-lock) .app-shell{position:fixed!important;left:0!important;right:0!important;top:var(--h38-office-shell-top,58px)!important;bottom:0!important;display:block!important;width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:hidden!important;contain:layout paint!important;touch-action:auto!important}
 body:not(.h38-field-scroll-lock) #mainContent{position:absolute!important;inset:0!important;box-sizing:border-box!important;width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;overflow-x:hidden!important;overflow-y:scroll!important;overscroll-behavior-y:contain!important;padding:12px 10px calc(112px + env(safe-area-inset-bottom,0px))!important;contain:none!important;touch-action:pan-y!important;-webkit-overflow-scrolling:touch!important;scroll-behavior:auto!important;overflow-anchor:none!important}
 #mainContent .page-head{margin-bottom:10px!important}#mainContent .page-head h1{font-size:1.35rem!important;line-height:1.12}#mainContent .page-head p{margin-top:4px!important;font-size:.82rem!important;line-height:1.35}#mainContent .grid{gap:9px!important}#mainContent .card{padding:12px!important;border-radius:14px!important}#mainContent .row{padding:10px!important}#mainContent input,#mainContent textarea,#mainContent select{font-size:16px!important}
 #mainNav.h38-five-primary-nav{position:fixed!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;z-index:2500!important;margin:0!important;padding:6px 6px env(safe-area-inset-bottom,0px)!important;background:var(--card,#fff)!important;box-shadow:0 -8px 24px rgba(11,36,56,.12);transform:translateZ(0);backface-visibility:hidden;display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;overflow:visible!important}#mainNav.h38-five-primary-nav button{min-width:0!important;max-width:none!important;min-height:54px!important;padding:5px 2px!important;touch-action:manipulation!important;-webkit-tap-highlight-color:transparent}#mainNav.h38-five-primary-nav button span:last-child{font-size:.7rem!important;font-weight:850}
 .h38-mobile-tool-details,.h38-mobile-entry-details{grid-column:1/-1!important;width:100%!important;min-width:0!important;margin:0 0 9px;border:1px solid var(--line,#d6e0e8);border-radius:14px;background:var(--card,#fff);overflow:hidden}.h38-mobile-tool-details>summary,.h38-mobile-entry-details>summary{min-height:46px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:900;color:var(--navy,#0b2438);cursor:pointer;list-style:none}.h38-mobile-tool-details>summary::-webkit-details-marker,.h38-mobile-entry-details>summary::-webkit-details-marker{display:none}.h38-mobile-tool-details>summary::after,.h38-mobile-entry-details>summary::after{content:'＋';font-size:1rem}.h38-mobile-tool-details[open]>summary::after,.h38-mobile-entry-details[open]>summary::after{content:'−'}.h38-mobile-tool-details>.card,.h38-mobile-entry-details>.card{width:100%!important;min-width:0!important;margin:0!important;border:0!important;border-top:1px solid var(--line,#d6e0e8)!important;border-radius:0!important;box-shadow:none!important}.h38-mobile-record-card{order:-1}
}
`;
    document.head.appendChild(style);
  }

  function syncMobileShellTop() {
    if (!mobileOffice()) return;
    let shellTop = 0;
    for (const node of [document.querySelector('.topbar'), document.querySelector('.business-bar')]) {
      if (!node || node.hidden) continue;
      try {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || !node.getClientRects().length) continue;
        shellTop = Math.max(shellTop, Math.round(node.getBoundingClientRect().bottom));
      } catch (_) {}
    }
    if (shellTop) document.documentElement.style.setProperty('--h38-office-shell-top', `${shellTop}px`);
  }

  function firstFrameText(value) { return String(value == null ? '' : value).trim(); }
  function firstFrameAllowed() { try { return typeof window.allowedPages === 'function' ? window.allowedPages() : []; } catch (_) { return []; } }
  function firstFramePageLabel(key) { try { return typeof PAGE_DEFS !== 'undefined' && PAGE_DEFS[key] ? PAGE_DEFS[key][1] : key; } catch (_) { return key; } }
  function firstFramePageIcon(key) { try { return typeof PAGE_DEFS !== 'undefined' && PAGE_DEFS[key] ? PAGE_DEFS[key][0] : '•'; } catch (_) { return '•'; } }
  function firstFrameHtml(value) { return typeof window.esc === 'function' ? window.esc(value) : firstFrameText(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function ensureMobilePrimaryFirstFrame() {
    if (!mobileOffice() || window.state?.shell !== 'office') return;
    const nav = document.getElementById('mainNav');
    const pages = new Set(firstFrameAllowed());
    if (!nav || !pages.size) return;
    const current = firstFrameText(window.state?.page);
    const moreActive = !EARLY_PRIMARY.some(([key]) => key === current);
    const desired = [
      ...EARLY_PRIMARY.filter(([key]) => pages.has(key)).map(([key,icon,label]) => `<button type="button" data-h38-primary="${key}" class="${current===key?'active':''}"${current===key?' aria-current="page"':''}><span class="nav-icon">${icon}</span><span>${label}</span></button>`),
      `<button type="button" data-h38-primary="more" class="${moreActive?'active':''}" aria-haspopup="dialog"><span class="nav-icon">•••</span><span>More</span></button>`
    ].join('');
    nav.classList.add('h38-five-primary-nav');
    nav.classList.remove('h38-operator-scroll-nav');
    nav.dataset.h38PrimaryNav = 'first-frame';
    if (nav.innerHTML !== desired) nav.innerHTML = desired;
    nav.querySelectorAll('[data-h38-primary]').forEach(button => {
      button.onclick = () => {
        const target = firstFrameText(button.dataset.h38Primary);
        if (!target || target === 'more' || target === firstFrameText(window.state?.page)) return;
        window.openPage?.(target);
      };
    });
  }
  function firstFrameCardHeading(card) { return firstFrameText(card?.querySelector(':scope > h2,:scope > h3')?.textContent); }
  function firstFrameWrapCard(card, label, entry) {
    if (!card || card.closest('.h38-mobile-tool-details,.h38-mobile-entry-details')) return;
    const details = document.createElement('details');
    details.className = entry ? 'h38-mobile-entry-details' : 'h38-mobile-tool-details';
    const summary = document.createElement('summary');
    summary.textContent = label;
    card.parentNode?.insertBefore(details, card);
    details.append(summary, card);
  }
  function firstFrameMoveCards(grid, cards) {
    if (!grid) return;
    const valid = cards.filter(Boolean);
    for (let index = valid.length - 1; index >= 0; index -= 1) grid.insertBefore(valid[index], grid.firstChild);
  }
  function shapeMobileFirstFrame() {
    if (!mobileOffice()) return;
    const main = document.getElementById('mainContent');
    const current = firstFrameText(window.state?.page);
    if (!main) return;
    if (current === 'work') {
      const head = main.querySelector('.page-head');
      const h1 = head?.querySelector('h1');
      const p = head?.querySelector('p');
      if (h1 && /^(work|work\s*&\s*task assignment)$/i.test(firstFrameText(h1.textContent))) h1.textContent = 'Jobs';
      if (p && /turn requests into organized jobs/i.test(firstFrameText(p.textContent))) p.textContent = 'Keep jobs, requests, tasks and field work moving from one place.';
      const grid = main.querySelector(':scope > .grid');
      if (grid) {
        const cards = Array.from(grid.children).filter(node => node.classList?.contains('card'));
        const byName = name => cards.find(card => firstFrameCardHeading(card).toLowerCase() === name.toLowerCase());
        const requests = byName('Requests'), jobs = byName('Jobs'), tasks = byName('Tasks');
        [requests, jobs, tasks].forEach(card => card?.classList.add('h38-mobile-record-card'));
        firstFrameMoveCards(grid, [requests, jobs, tasks]);
        firstFrameWrapCard(byName('New request'), 'New request', false);
        firstFrameWrapCard(byName('New job'), 'New job', false);
        firstFrameWrapCard(byName('Assign task'), 'Assign task', false);
      }
    } else if (current === 'customers') {
      const p = main.querySelector('.page-head p');
      if (p && /installed product shell/i.test(firstFrameText(p.textContent))) p.textContent = 'Customers, contacts and properties in one place.';
      const grid = main.querySelector(':scope > .grid');
      if (grid) {
        const cards = Array.from(grid.children).filter(node => node.classList?.contains('card'));
        const byName = name => cards.find(card => firstFrameCardHeading(card).toLowerCase() === name.toLowerCase());
        const start = byName('Start work'), customers = byName('Customers'), properties = byName('Properties');
        [start, customers, properties].forEach(card => card?.classList.add('h38-mobile-record-card'));
        firstFrameMoveCards(grid, [start, customers, properties]);
        firstFrameWrapCard(byName('Add or update customer'), 'Add or edit customer', true);
        firstFrameWrapCard(byName('Add property'), 'Add property', true);
      }
    }
    ensureMobilePrimaryFirstFrame();
    syncMobileShellTop();
  }

  function installMobileFirstFrameOpenPage() {
    const base = window.openPage;
    if (typeof base !== 'function' || base.h38MobileFirstFrameStable) return;
    function firstFrameOpenPage(key, ...args) {
      const before = firstFrameText(window.state?.page);
      const target = firstFrameText(key);
      const main = document.getElementById('mainContent');
      if (mobileOffice() && main && target && target !== before && window.H38_FIELD_VISIT_CORE?.state?.open !== true) main.scrollTop = 0;
      const result = base.call(this, key, ...args);
      shapeMobileFirstFrame();
      return result;
    }
    firstFrameOpenPage.h38MobileFirstFrameStable = true;
    firstFrameOpenPage.h38Base = base;
    window.openPage = firstFrameOpenPage;
  }
  function installMobileFirstFrameRenderNav() {
    const base = window.renderNav;
    if (typeof base !== 'function' || base.h38MobileFirstFrameStable) return;
    function firstFrameRenderNav(...args) {
      const result = base.apply(this, args);
      ensureMobilePrimaryFirstFrame();
      return result;
    }
    firstFrameRenderNav.h38MobileFirstFrameStable = true;
    firstFrameRenderNav.h38Base = base;
    window.renderNav = firstFrameRenderNav;
  }

  function nativeReturnPending() {
    if (!nativeAndroid) return false;
    try {
      const info = JSON.parse(String(window.AndroidH38Native?.getRecoveredWalkthroughInfo?.() || '{}'));
      if (info?.ready === true && Number(info?.size || 0) > 0) return true;
    } catch (_) {}
    try {
      const photos = JSON.parse(String(window.AndroidH38Native?.getRecoveredWalkthroughPhotosInfo?.() || '{}'));
      if (photos?.ready === true && Number(photos?.count || photos?.photos?.length || 0) > 0) return true;
    } catch (_) {}
    return false;
  }

  function officeUsable() {
    try {
      const main = document.getElementById('mainContent');
      const nav = document.getElementById('mainNav');
      if (!main) return false;
      const body = String(main.textContent || '');
      if (/sign in|session expired|access denied|could not open/i.test(body)) return true;
      if (!window.state?.businessId || !window.state?.snapshot) return false;
      if (/Opening Business Office|Checking Supabase Auth/i.test(body)) return false;
      return !!nav?.querySelector('button');
    } catch (_) {
      return false;
    }
  }

  function clearEarlyNativeStartupCover() {
    document.documentElement.classList.remove('h38-early-native-startup');
    document.getElementById('h38EarlyNativeStartupStyle')?.remove();
  }

  function installNativeReturnColdReloadGuard() {
    if (!nativeAndroid || !nativeReturnPending()) return;
    let url;
    try { url = new URL(location.href); } catch (_) { return; }
    if (url.searchParams.get(nativeReturnReloadParam) === '1') {
      const clearMarker = function () {
        if (!officeUsable()) return false;
        clearEarlyNativeStartupCover();
        try {
          const clean = new URL(location.href);
          clean.searchParams.delete(nativeReturnReloadParam);
          history.replaceState(history.state, '', clean.toString());
        } catch (_) {}
        return true;
      };
      if (!clearMarker()) {
        const started = Date.now();
        const timer = setInterval(function () {
          if (clearMarker() || Date.now() - started > 10000) clearInterval(timer);
        }, 250);
      }
      return;
    }
    setTimeout(function () {
      if (!nativeReturnPending() || officeUsable()) return;
      try {
        const cold = new URL(location.href);
        cold.searchParams.set(nativeReturnReloadParam, '1');
        location.replace(cold.toString());
      } catch (_) {}
    }, 2200);
  }

  function loadFinalNativeVideoAttach() {
    if (!nativeAndroid || document.querySelector('script[data-h38-native-video-final-attach]')) return;
    const script = document.createElement('script');
    script.src = './android-native-video-final-attach.js?build=20260817-native-video-final-attach-1';
    script.dataset.h38NativeVideoFinalAttach = '1';
    document.head.appendChild(script);
  }

  function loadErpFoundation() {
    if (window.H38_ERP_FOUNDATION || document.querySelector('script[data-h38-erp-foundation]')) return;
    const script = document.createElement('script');
    script.src = './erp-foundation.js?build=20260903-erp-time-uptake-learning-1';
    script.async = false;
    script.dataset.h38ErpFoundation = '1';
    document.head.appendChild(script);
  }

  // Desktop navigation is intentionally owned by the Business Office renderNav/openPage
  // chain. The retired desktop-navigation-core interceptor must not be loaded here.

  installMobileFirstFrameStyle();
  syncMobileShellTop();

  if (nativeAndroid) {
    document.documentElement.classList.add('h38-early-native-startup');
    const style = document.createElement('style');
    style.id = 'h38EarlyNativeStartupStyle';
    style.textContent = 'html.h38-early-native-startup body{overflow:hidden!important}html.h38-early-native-startup body:after{content:"🔨  Opening Highway 38…";white-space:pre;position:fixed;inset:0;z-index:2147483199;display:grid;place-items:center;background:#eef3f7;color:#10212c;font:800 18px system-ui,sans-serif;text-align:center;padding:24px}';
    document.head.appendChild(style);
    setTimeout(clearEarlyNativeStartupCover, 3000);
  }

  window.state = state;
  window.PAGE_DEFS = PAGE_DEFS;
  window.esc = esc;
  window.pill = pill;
  window.empty = empty;
  window.jobName = jobName;
  window.userName = userName;
  window.dateTime = dateTime;
  window.optionRows = optionRows;
  window.toast = toast;
  window.openPage = openPage;
  window.renderNav = renderNav;
  window.newId = newId;
  window.renderToday = renderToday;
  window.renderWork = renderWork;
  if (typeof renderField !== 'undefined') window.renderField = renderField;
  else if (!window.renderField) window.renderField = function () {
    const openVisit = function () {
      if (window.H38_FIELD_VISIT?.open) {
        window.H38_FIELD_VISIT.open({quoteId: String(window.state?.quote?.quoteId || ''),customerId: String(window.state?.quote?.customerId || '')});
        return true;
      }
      return false;
    };
    if (openVisit()) return;
    let attempts = 0;
    const timer = setInterval(function () { attempts += 1; if (openVisit() || attempts >= 25) clearInterval(timer); }, 80);
  };
  window.renderSettings = renderSettings;
  window.queueOperation = queueOperation;

  installMobileFirstFrameOpenPage();
  installMobileFirstFrameRenderNav();
  loadErpFoundation();
  window.H38_MOBILE_FIRST_FRAME_AUTHORITY = Object.freeze({
    enabled: true,
    preStartup: true,
    criticalGeometryBeforeStartup: true,
    mobilePrimaryNavigationSingleAuthority: true,
    primaryNavigationBeforeStartup: true,
    preRenderScrollReset: true,
    jobsCustomersShapeBeforeFirstPaint: true,
    postPaintPageRebuildRequired: false,
    automaticApproval: false,
    automaticCustomerSending: false,
    automaticPurchasing: false,
    automaticPayment: false,
    automaticScheduling: false
  });

  installNativeReturnColdReloadGuard();
  loadFinalNativeVideoAttach();

  if (!document.querySelector('script[data-h38-startup-site-visit-stability]')) {
    const script = document.createElement('script');
    script.src = './startup-site-visit-stability.js?build=20260816-startup-site-visit-stability-3';
    script.dataset.h38StartupSiteVisitStability = '1';
    script.onload = function () { clearEarlyNativeStartupCover(); };
    script.onerror = function () { clearEarlyNativeStartupCover(); };
    document.head.appendChild(script);
  }
  if (!document.querySelector('script[data-h38-owner-phone-visual-fix]')) {
    const script = document.createElement('script');
    script.src = './owner-phone-visual-fix.js?build=20260816-owner-phone-visual-fix-1';
    script.dataset.h38OwnerPhoneVisualFix = '1';
    document.head.appendChild(script);
  }
})();