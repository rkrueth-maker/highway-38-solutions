/* H38 Script Lazy Loader (2026-10-11, expanded 2026-10-13 startup deferral pass)
 * Loads page-specific scripts on demand instead of all upfront.
 *
 * How it works:
 * - Core scripts (auth, db, shell, Today) load upfront with defer (see index.html)
 * - Page scripts load when openPage() is called for that page (openPage is wrapped below)
 * - Scripts are cached after first load (loaded Set); the service worker also precaches
 *   them, so first navigation to a page is normally served from cache.
 * - Concurrent requests for same script share one promise
 * - Scripts inside a page group load SEQUENTIALLY in index.html document order:
 *   several feature scripts wrap/override renderers defined earlier, so order matters.
 *
 * Safety:
 * - If a script fails to load, navigation still proceeds; page renderers in this
 *   codebase already self-heal with loading placeholders and retries.
 * - The PAGE_SCRIPTS map is conservative — when in doubt, keep script upfront.
 * - A navigation sequence guard prevents a slow earlier navigation from
 *   rendering over a newer route selection.
 */

(function() {
  'use strict';

  const loaded = new Set();
  const loading = new Map();

    const FIELD_AND_MEASURE_SCRIPTS = [
      './site-scanner.js?build=20260806-0605',
      './site-scanner-mobile-guidance.js?build=20260806-0605',
      './site-scanner-cad-export.js?build=20260811-cad-review-dxf-0143',
      './site-scanner-cad-save-guard.js?build=20260811-cad-save-guard-1156',
      './webxr-measure.js?build=20261011-webxr-ar-1',
      './voice-dimensions.js?build=20261011-voice-dims-1',
      './field-visit-core.js?build=20261011-webxr-ar-1',
      './field-visit-server-recovery.js?build=20260811-server-draft-recovery-1158',
      './field-visit-ui.js?build=20260808-2017',
      './site-visit-diagnose.js?build=20261005-diagnose-1',
      './repair-failure-chains.js?build=20261005-failure-chains-1',
      './repair-bulletins.js?build=20261005-repair-bulletins-1',
      './field-visit.js?build=20261013-fix-sweep-1',
      './field-visit-recovery.js?build=20260814-garage-processing-2',
      './field-visit-photo-review.js?build=20260816-explicit-quote-photo-selection-1',
      './site-visit-ai-evidence-bridge.js?build=20260817-private-site-visit-ai-evidence-1',
      './measurement-verification-authority.js?build=20260825-measurement-verification-authority-2',
      './quote-measurement-action-photo-guard.js?build=20260814-quote-measurement-action-photo-guard-4',
      './site-visit-photo-quote-runtime-repair.js?build=20260821-site-visit-photo-quote-runtime-repair-3',
      './android-camera-direct-fix.js?build=20260918-one-shell-field-experience-1',
      './field-visit-voice-capture.js?build=20260810-2008',
      './field-visit-transcription.js?build=20260810-2010',
      './field-visit-owner-controls.js?build=20261013-fix-sweep-1',
      './operator-direct-controls.js?build=20261006-delete-dialog-2',
      './field-visit-guided-controller.js?build=20260811-guided-ar-advance-1',
      './field-visit-guided-photo-camera.js?build=20260811-guided-photo-camera-1',
      './field-visit-measurement-classification.js?build=20260810-measurement-classification-2140',
      './field-visit-video-measurements.js?build=20260811-video-headless-stable-1154',
      './field-visit-acceptance-fix.js?build=20260810-site-visit-acceptance-2230',
      './site-visit-delete-server-authority.js?build=20260821-site-visit-delete-server-authority-1',
      './android-native-walkthrough-guard.js?build=20260809-1725',
      './field-visit-quote-handoff.js?build=20260922-site-visit-quote-customer-authority-7',
      './field-visit-finish-build.js?build=20260821-finish-site-visit-build-quote-4',
      './site-visit-top-action.js?build=20261011-e2e-lifecycle-fixes-1',
      './site-visit-native-launch-final.js?build=20260816-native-launch-handoff-fallback-5',
      './repair-guide-integration.js?build=20261004-repair-guide-1',
    ];
    const PAGE_QUOTES = [
      './h38-first-quote-guide.js?build=20261010-first-quote-guide-1',
      './supabase-client-quote-branding.js?build=20260806-0344',
      './supabase-quote-ai.js?build=20260807-0945',
      './supabase-quote-ai-auth-fix.js?build=20260814-quote-ai-auth-measurement-split-2',
      './quote-mobile-stabilization.js?build=20261013-quote-trust-clutter-1',
      './quote-ai-live-fix.js?build=20260807-1115',
      './quote-working-hammer.js?build=20260825-quote-working-ui-only-20-phone-authority',
      './quote-total-lock.js?build=20261013-fix-sweep-1',
      './quote-drift-control.js?build=20261013-fix-sweep-1',
      './quote-render-approval.js?build=20260821-render-saved-action-picture-2-phone',
      './quote-final-acceptance-fix.js?build=20260807-1230',
      './quote-photo-restore.js?build=20260816-explicit-quote-photo-selection-2',
      './supabase-quote-delivery.js?build=20261013-quote-trust-clutter-1',
      './quote-pdf-send-live-fix.js?build=20260806-2245',
      './quote-delivery-final-fix.js?build=20260807-0105',
      './quote-print-safe.js?build=20260815-2105',
      './owner-flow-polish.js?build=20260929-1738',
      './quote-customer-options.js?build=20260815-2045',
      './quote-final-phone-fix.js?build=20261012-mobile-polish3-1',
      './quote-live-customer-options.js?build=20260815-2055',
      './quote-manual-image-controls.js?build=20260807-1450',
      './price-history.js?build=20261004-price-history-1',
      './trade-packages.js?build=20261005-trade-1',
    ];
    const PAGE_CUSTOMERS = [
      './customer-import-intelligence.js?build=20261010-customer-onboarding-redesign-1',
      './smart-upload.js?build=20260920-final-real-office-1',
      './smart-upload-ai.js?build=20261011-smart-upload-ai-1',
      './customer-360-authority.js?build=20261012-offline-polish-1',
      './customer-360-browser-integration-v3.js?build=20260922-preserve-explicit-test-selection-2',
    ];
    const PAGE_MEETINGS = [
      './conversation-meeting-assistant.js?build=20260913-meeting-report-documents-1',
    ];
    const PAGE_TASKS = [
      './tasks-page.js?build=20261011-phase4-1',
    ];
    const PAGE_SCHEDULE = [
      './guided-schedule.js?build=20261011-phase3-1',
      './plow-flow.js?build=20261011-plow-flow-1',
    ];
    const PAGE_MESSAGES = [
      './sms-provider.js?build=20261004-sms-seam-2',
      './sms-triggers.js?build=20261004-sms-kit-1',
      './sms-approval-runtime.js?build=20261011-sms-approval-1',
      './email-send-runtime.js?build=20261011-email-send-1',
      './customer-comms.js?build=20261007-mark-complete-fix-2',
    ];
    const PAGE_FLEET = [
      './route-manager.js?build=20261013-route-optimize-proof-1',
      './northern-bouncie-fleet.js?build=20261007-northern-bouncie-fleet-3',
      './gps-dispatch.js?build=20261004-dispatch-2',
      './crew-phone-location.js?build=20261008-crew-phone-location-4',
      './plow-flow.js?build=20261011-plow-flow-1',
    ];
    const PAGE_MONEY = [
      './price-history.js?build=20261004-price-history-1',
      './email-send-runtime.js?build=20261011-email-send-1',
      './membership-engine.js?build=20261005-membership-1',
      './card-vault.js?build=20261005-cardvault-1',
    ];
    const PAGE_ACCOUNTING = [
      './accounting-engine.js?build=20260927-wave1-accounting-core-1',
      './accounting-workspace.js?build=20260927-wave1-accounting-workspace-1',
      './accounting-posting-bridge.js?build=20260929-bank-csv-records-2',
    ];
    const PAGE_PAYROLL = [
      './payroll-workflow.js?build=20261005-payroll-v2-1',
    ];
    const PAGE_TAX = [
      './tax-packet.js?build=20261005-tax-packet-2',
      './cpa-package.js?build=20261011-cpa-package-1',
    ];
    const PAGE_REPORTS = [
      './reports-section.js?build=20261012-reports-section-2',
    ];
    const PAGE_DOCUMENTS = [
      './smart-upload.js?build=20260920-final-real-office-1',
      './smart-upload-ai.js?build=20261011-smart-upload-ai-1',
    ];
    const PAGE_AI = [
      './kits-workspace.js?build=20261011-kits-workspace-1',
    ];
    const PAGE_ASSISTANT = [
      './kits-workspace.js?build=20261011-kits-workspace-1',
    ];
    const PAGE_SOCIAL = [
      './deal-alerts.js?build=20261008-inventory-module-1',
    ];
    const PAGE_PEOPLE = [
      './employee-onboarding.js?build=20261011-phase3-1',
    ];
    const PAGE_SETTINGS = [
      './health-dashboard.js?build=20261011-health-dashboard-1',
      './sms-provider-setup.js?build=20261004-sms-providers-1',
      './muse-permissions.js?build=20261006-muse-permissions-2',
    ];

  // Map of page -> script URLs needed for that page.
  // URLs must match the ?build= params the files ship with.
  // Only list scripts that are SAFE to lazy-load (page-specific, no startup dependencies).
  const PAGE_SCRIPTS = {
    'field': FIELD_AND_MEASURE_SCRIPTS,
    'measure': FIELD_AND_MEASURE_SCRIPTS,
    'quotes': PAGE_QUOTES,
    'customers': PAGE_CUSTOMERS,
    'meetings': PAGE_MEETINGS,
    'tasks': PAGE_TASKS,
    'schedule': PAGE_SCHEDULE,
    'messages': PAGE_MESSAGES,
    'fleet': PAGE_FLEET,
    'money': PAGE_MONEY,
    'accounting': PAGE_ACCOUNTING,
    'payroll': PAGE_PAYROLL,
    'tax': PAGE_TAX,
    'reports': PAGE_REPORTS,
    'documents': PAGE_DOCUMENTS,
    'ai': PAGE_AI,
    'assistant': PAGE_ASSISTANT,
    'social': PAGE_SOCIAL,
    'people': PAGE_PEOPLE,
    'settings': PAGE_SETTINGS
  };

  // Scripts that should preload in background after initial page load.
  // Kept empty by the 2026-10-13 deferral pass: page groups load on first
  // navigation instead (service-worker precache keeps that fast + offline-safe).
  const PRELOAD_AFTER_IDLE = [];

  function loadScript(url) {
    if (loaded.has(url)) return Promise.resolve();
    if (loading.has(url)) return loading.get(url);

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => {
        loaded.add(url);
        loading.delete(url);
        resolve();
      };
      script.onerror = (e) => {
        loading.delete(url);
        reject(new Error('Failed to load script: ' + url));
      };
      document.head.appendChild(script);
    });

    loading.set(url, promise);
    return promise;
  }

  // Load a page group sequentially so override/wrapper scripts execute in
  // the same order they had as deferred tags in index.html.
  function loadPageScripts(page) {
    const scripts = PAGE_SCRIPTS[page] || [];
    if (!scripts.length) return Promise.resolve();
    return scripts.reduce((chain, url) => chain.then(() =>
      loadScript(url).catch(() => loadScript(url)).catch(err => {
        try { console.error('[H38 lazy load] script failed for page', page, err); } catch (e) {}
      })
    ), Promise.resolve());
  }

  function pageScriptsReady(page) {
    const scripts = PAGE_SCRIPTS[page] || [];
    return scripts.every(url => {
      if (loaded.has(url)) return true;
      try { return loaded.has(new URL(url, window.location.href).pathname); } catch (e) { return false; }
    });
  }

  function preloadInBackground() {
    const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 2000));
    schedule(() => {
      PRELOAD_AFTER_IDLE.forEach(url => {
        loadScript(url).catch(() => {}); // Silently fail background preloads
      });
    });
  }

  // Mark scripts already loaded via index.html as loaded
  // This prevents the loader from re-loading them
  function markExistingScripts() {
    document.querySelectorAll('script[src]').forEach(s => {
      const src = s.getAttribute('src');
      if (src) {
        loaded.add(src);
        try {
          const url = new URL(src, window.location.href);
          loaded.add(url.pathname);
        } catch (e) {}
      }
    });
  }

  // Wrap openPage so a page's script group is loaded before its first render.
  // The current workspace stays visible while the group loads (no blank screen).
  // When the group is already loaded, navigation stays fully synchronous,
  // exactly as before this pass.
  let navSeq = 0;
  function wrapOpenPage() {
    const original = window.openPage;
    if (typeof original !== 'function' || original.__h38LazyWrapped) return;
    const wrapped = function(page, track) {
      if (!PAGE_SCRIPTS[page] || pageScriptsReady(page)) {
        return original.apply(this, arguments);
      }
      const seq = ++navSeq;
      // Claim the route immediately: the boot sequence re-asserts
      // openPage(state.page) several times while it settles, and those calls
      // must re-target the page the user actually chose, not the previous one.
      try { if (window.state) window.state.page = page; } catch (e) {}
      return loadPageScripts(page)
        .catch(err => { try { console.error('[H38 lazy load] page scripts failed for', page, err); } catch (e) {} })
        .then(() => { if (seq === navSeq) return original.call(this, page, track); });
    };
    wrapped.__h38LazyWrapped = true;
    window.openPage = wrapped;
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      markExistingScripts();
      wrapOpenPage();
      preloadInBackground();
    });
  } else {
    markExistingScripts();
    wrapOpenPage();
    preloadInBackground();
  }

  window.H38ScriptLoader = Object.freeze({
    load: loadScript,
    loadPageScripts: loadPageScripts,
    isLoaded: (url) => loaded.has(url),
    PAGE_SCRIPTS: PAGE_SCRIPTS,
  });
})();
