(function () {
  'use strict';
  const nativeAndroid = /H38SiteScannerAndroid\//.test(String(navigator.userAgent || ''));
  const nativeReturnReloadParam = 'h38NativeReturnCold';

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
    try {
      url = new URL(location.href);
    } catch (_) {
      return;
    }
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

  function loadDesktopNavigationCore() {
    if (document.querySelector('script[data-h38-desktop-navigation-core]')) return;
    const script = document.createElement('script');
    script.src = './desktop-navigation-core.js?build=20260826-desktop-navigation-core-1';
    script.dataset.h38DesktopNavigationCore = '1';
    document.head.appendChild(script);
  }

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
  window.newId = newId;
  window.renderToday = renderToday;
  window.renderWork = renderWork;
  if (typeof renderField !== 'undefined') window.renderField = renderField;
  else if (!window.renderField) window.renderField = function () {
    const openVisit = function () {
      if (window.H38_FIELD_VISIT?.open) {
        window.H38_FIELD_VISIT.open({
          quoteId: String(window.state?.quote?.quoteId || ''),
          customerId: String(window.state?.quote?.customerId || '')
        });
        return true;
      }
      return false;
    };
    if (openVisit()) return;
    let attempts = 0;
    const timer = setInterval(function () {
      attempts += 1;
      if (openVisit() || attempts >= 25) clearInterval(timer);
    }, 80);
  };
  window.renderSettings = renderSettings;
  window.queueOperation = queueOperation;

  installNativeReturnColdReloadGuard();
  loadFinalNativeVideoAttach();
  loadDesktopNavigationCore();

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