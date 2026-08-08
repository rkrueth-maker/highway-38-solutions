(function () {
  'use strict';

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
})();
