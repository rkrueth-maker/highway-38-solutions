(function () {
  'use strict';

  const WALKTHROUGH_RESUME_KEY = 'h38:field-visit-resume-step';
  const WALKTHROUGH_RETRY_KEY = 'h38:native-walkthrough-launch-retry';
  const WALKTHROUGH_USER_LAUNCH_KEY = 'h38:user-initiated-walkthrough-launch';
  const WALKTHROUGH_LAUNCH_TTL_MS = 10 * 60 * 1000;

  function androidShell() {
    return /H38SiteScannerAndroid\//.test(String(navigator.userAgent || '')) || !!window.AndroidH38Native;
  }

  function nativeWalkthroughReady() {
    if (!androidShell()) return false;
    try {
      const info = JSON.parse(String(window.AndroidH38Native?.getRecoveredWalkthroughInfo?.() || '{}'));
      if (info && info.ready === true && Number(info.size || 0) > 0) return true;
    } catch (error) {}
    try {
      return !!String(window.AndroidH38Native?.getRecoveredWalkthroughUrl?.() || '');
    } catch (error) {
      return false;
    }
  }

  function readUserLaunch() {
    try {
      const raw = localStorage.getItem(WALKTHROUGH_USER_LAUNCH_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (!value || !Number(value.time) || Date.now() - Number(value.time) > WALKTHROUGH_LAUNCH_TTL_MS) {
        localStorage.removeItem(WALKTHROUGH_USER_LAUNCH_KEY);
        return null;
      }
      return value;
    } catch (error) {
      return null;
    }
  }

  function activeVisitIdentity() {
    const visit = window.H38_FIELD_VISIT_CORE?.state?.visit || {};
    return {
      time: Date.now(),
      visitId: String(visit.visitId || ''),
      sessionId: String(visit.sessionId || ''),
      businessId: String(visit.businessId || window.state?.businessId || ''),
      userInitiated: true
    };
  }

  function armUserWalkthroughLaunch(event) {
    if (!androidShell()) return;
    const button = event.target?.closest?.('button');
    if (!button) return;
    const label = String(button.textContent || '').replace(/\s+/g, ' ').trim();
    const walkthroughButton = button.id === 'fieldWalkthrough'
      || /start video walkthrough|record another walkthrough|start walkthrough/i.test(label);
    if (!walkthroughButton) return;
    try {
      localStorage.setItem(WALKTHROUGH_USER_LAUNCH_KEY, JSON.stringify(activeVisitIdentity()));
    } catch (error) {}
  }

  function clearNativeRecoveryTracking() {
    try {
      window.AndroidH38Native?.confirmRecoveredWalkthroughConsumed?.();
      return true;
    } catch (error) {}
    try {
      window.H38NativeScanner?.confirmRecoveredWalkthroughConsumed?.();
      return true;
    } catch (error) {
      return false;
    }
  }

  function gateNativeWalkthroughRecovery(reason) {
    if (!androidShell()) return;
    const ready = nativeWalkthroughReady();
    const launch = readUserLaunch();
    if (ready && !launch) {
      clearNativeRecoveryTracking();
      try { localStorage.removeItem(WALKTHROUGH_RESUME_KEY); } catch (error) {}
      try { sessionStorage.removeItem(WALKTHROUGH_RETRY_KEY); } catch (error) {}
      console.warn('[H38 Android walkthrough] cleared stale native recovery tracking on ' + reason);
      return;
    }
    if (!ready && launch && document.visibilityState === 'visible') {
      try { localStorage.removeItem(WALKTHROUGH_USER_LAUNCH_KEY); } catch (error) {}
    }
  }

  document.addEventListener('pointerdown', armUserWalkthroughLaunch, true);
  gateNativeWalkthroughRecovery('startup');
  window.addEventListener('pageshow', () => gateNativeWalkthroughRecovery('pageshow'));
  window.addEventListener('focus', () => gateNativeWalkthroughRecovery('focus'));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) gateNativeWalkthroughRecovery('visible');
  });
  window.addEventListener('h38:native-scanner-ready', () => gateNativeWalkthroughRecovery('native-ready'));

  const BLOCKED_PATTERNS = [
    /legacy-business-office\.html/i,
    /script\.google\.com\/macros\/s\//i,
    /Google Office fallback/i,
    /Google Office rollback/i,
    /legacy Google Office/i
  ];

  function blocked(value) {
    const text = String(value == null ? '' : value);
    return BLOCKED_PATTERNS.some(pattern => pattern.test(text));
  }

  function removeLegacyControls(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('a,button,details').forEach(node => {
      const href = node.getAttribute && node.getAttribute('href');
      if (blocked(href) || blocked(node.textContent)) node.remove();
    });
  }

  document.addEventListener('click', event => {
    const link = event.target && event.target.closest ? event.target.closest('a') : null;
    if (!link) return;
    if (blocked(link.href) || blocked(link.textContent)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  const observer = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === 1) removeLegacyControls(node);
    }));
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  removeLegacyControls(document);

  if (window.H38Bridge && window.H38Bridge.prototype) {
    const previousRequest = window.H38Bridge.prototype.request;
    if (typeof previousRequest === 'function') {
      window.H38Bridge.prototype.request = async function () {
        try {
          return await previousRequest.apply(this, arguments);
        } catch (error) {
          const message = String(error && error.message || error || 'Business Office request failed.');
          if (blocked(message)) throw new Error('This action is unavailable in the Supabase Business Office.');
          throw error;
        }
      };
    }
  }

  function loadLifecycleAssistant() {
    if (!document.querySelector('link[data-h38-job-lifecycle]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = './job-lifecycle.css?build=20260807-2225';
      link.dataset.h38JobLifecycle = '1';
      document.head.appendChild(link);
    }
    if (!window.H38_JOB_LIFECYCLE && !document.querySelector('script[data-h38-job-lifecycle]')) {
      const script = document.createElement('script');
      script.src = './job-lifecycle.js?build=20260807-2225';
      script.dataset.h38JobLifecycle = '1';
      document.body.appendChild(script);
    }
  }

  function loadPersonalAssistant() {
    if (!document.querySelector('link[data-h38-personal-assistant]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = './personal-assistant.css?build=20260807-2245';
      link.dataset.h38PersonalAssistant = '1';
      document.head.appendChild(link);
    }
    if (!window.H38_PERSONAL_ASSISTANT && !document.querySelector('script[data-h38-personal-assistant]')) {
      const script = document.createElement('script');
      script.src = './personal-assistant.js?build=20260807-2245';
      script.dataset.h38PersonalAssistant = '1';
      document.body.appendChild(script);
    }
  }

  function loadOfficePolish() {
    if (!document.querySelector('link[data-h38-office-polish]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = './office-polish.css?build=20260807-2306';
      link.dataset.h38OfficePolish = '1';
      document.head.appendChild(link);
    }
    if (!window.H38_OFFICE_POLISH && !document.querySelector('script[data-h38-office-polish]')) {
      const script = document.createElement('script');
      script.src = './office-polish.js?build=20260807-2306';
      script.dataset.h38OfficePolish = '1';
      document.body.appendChild(script);
    }
  }

  function loadPlayCompliance() {
    if (!window.H38_PLAY_COMPLIANCE && !document.querySelector('script[data-h38-play-compliance]')) {
      const script = document.createElement('script');
      script.src = './play-compliance.js?build=20260807-2355';
      script.dataset.h38PlayCompliance = '1';
      document.body.appendChild(script);
    }
  }

  function loadSiteVisitController() {
    if (window.H38_FIELD_VISIT_GUIDED_CONTROLLER || window.H38_FIELD_VISIT_GUIDANCE) return;
    if (document.querySelector('script[data-h38-guided-site-visit]')) return;
    const script = document.createElement('script');
    script.src = './field-visit-guided-controller.js?build=20260811-guided-stable-1152';
    script.dataset.h38GuidedSiteVisit = '1';
    document.body.appendChild(script);
  }

  window.H38_ANDROID_WALKTHROUGH_RECOVERY_GATE = Object.freeze({
    userGestureRequired: true,
    staleNativeRecoveryCleared: true,
    launchMarkerTtlMs: WALKTHROUGH_LAUNCH_TTL_MS,
    cameraAuthority: false
  });

  window.H38_LEGACY_OFFICE_DISABLED = Object.freeze({
    enabled: true,
    publicRouteRemoved: true,
    automaticFallback: false,
    manualFallback: false,
    supportedRuntime: 'supabase'
  });

  loadLifecycleAssistant();
  loadPersonalAssistant();
  loadOfficePolish();
  loadPlayCompliance();
  loadSiteVisitController();
})();