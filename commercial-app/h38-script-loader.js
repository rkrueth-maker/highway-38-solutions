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
      './app-07.js?build=20261030-two-layer-6',
      './app-10.js?build=20261020-ws4-field-1',
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
      './site-visit-photo-quote-runtime-repair.js?build=20261031-kitquote-4',
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
      './field-visit-quote-handoff.js?build=20261030-two-layer-1',
      './field-visit-finish-build.js?build=20260821-finish-site-visit-build-quote-4',
      './site-visit-top-action.js?build=20261011-e2e-lifecycle-fixes-1',
      './site-visit-native-launch-final.js?build=20260816-native-launch-handoff-fallback-5',
      './repair-guide-integration.js?build=20261020-ws4-placeholders-1',
      './voice-commands.js?build=20261005-voice-1',
    ];
    const PAGE_QUOTES = [
      './app-07.js?build=20261030-two-layer-6',
      './app-06.js?build=20261030-two-layer-7',
      './app-20.js?build=20261031-kitquote-4',
      './quick-start.js?build=20261013-rescan-fixes-1',
      './h38-first-quote-guide.js?build=20261010-first-quote-guide-1',
      './supabase-client-quote-branding.js?build=20261031-wave1ab-1',
      './quote-ai-draft-persistence.js?build=20261031-kitquote-4',
      './supabase-quote-ai.js?build=20261030-two-layer-1',
      './supabase-quote-ai-auth-fix.js?build=20261031-kitquote-4',
      './estimator-shell.js?build=20261031-wave1ab-1',
      './quote-mobile-stabilization.js?build=20261031-wave1ab-1',
      './quote-ai-live-fix.js?build=20261030-two-layer-1',
      './quote-working-hammer.js?build=20260825-quote-working-ui-only-20-phone-authority',
      './quote-total-lock.js?build=20261020-gbb-ws1-1',
      './quote-drift-control.js?build=20261013-fix-sweep-1',
      './quote-render-approval.js?build=20260821-render-saved-action-picture-2-phone',
      './quote-final-acceptance-fix.js?build=20260807-1230',
      './quote-photo-restore.js?build=20260816-explicit-quote-photo-selection-2',
      './supabase-quote-delivery.js?build=20261031-wave1ab-1',
      './quote-pdf-send-live-fix.js?build=20261030-two-layer-1',
      './quote-delivery-final-fix.js?build=20261020-gbb-ws1-1',
      './quote-print-safe.js?build=20261030-two-layer-1',
      './owner-flow-polish.js?build=20261031-schedtruth-1',
      './quote-customer-options.js?build=20261031-tier-aware-1',
      './quote-final-phone-fix.js?build=20261030-two-layer-11',
      './quote-live-customer-options.js?build=20261031-tier-aware-1',
      './quote-manual-image-controls.js?build=20260807-1450',
      './price-history.js?build=20261004-price-history-1',
      './trade-packages.js?build=20261005-trade-1',
      './quote-signed-acceptance.js?build=20261027-signed-deposit-1',
    ];
    const PAGE_CUSTOMERS = [
      './customer-import-intelligence.js?build=20261010-customer-onboarding-redesign-1',
      './smart-upload.js?build=20260920-final-real-office-1',
      './smart-upload-ai.js?build=20261011-smart-upload-ai-1',
      './customer-360-authority.js?build=20261013-complete-scan-fixes-1',
      './customer-360-browser-integration-v3.js?build=20261013-search-nomatch-1',
      './accounting-engine.js?build=20261020-payroll-engine-1',
      './customer-profile-money.js?build=20261031-wave1ab-1',
      // CI triage fix (2026-10-13, class-b): site-visit-top-action.js is the
      // Customers-page top action bar ("Start Site Visit" / "Add Customer");
      // grouping it only under field/measure lost that bar on a
      // customers-first session (verified by browser probe). It stays in
      // FIELD_AND_MEASURE as well; the loader dedupes repeat loads.
      './site-visit-top-action.js?build=20261011-e2e-lifecycle-fixes-1',
      './customer-readiness-polish.js?build=20261031-schedtruth-2',
    ];
    const PAGE_MEETINGS = [
      './conversation-meeting-assistant.js?build=20260913-meeting-report-documents-1',
    ];
    const PAGE_TASKS = [
      './tasks-page.js?build=20261031-wave1ab-1',
      './send-task.js?build=20261011-phase4-1',
    ];
    // Work (2026-10-26): the Work page's Mark Complete buttons and status
    // select route through H38CustomerComms.markJobComplete (review prompt
    // + auto invoice draft), but customer-comms only loaded with the
    // Messages group — a cold Work session silently fell back to a bare
    // status save with none of that behavior. Load it with Work too; same
    // ?build= URL as PAGE_MESSAGES so the loader dedupes it.
    const PAGE_WORK = [
      './customer-comms.js?build=20261026-auto-invoice-3',
    ];
    const PAGE_SCHEDULE = [
      './app-08.js?build=20261020-myhank-settings-1',
      './business-hours.js?build=20261030-r2-business-hours-1',
      './guided-schedule.js?build=20261030-swivl-round2-1',
      './plow-flow.js?build=20261011-plow-flow-1',
      './route-planner.js?build=20261031-wave1ab-1',
      './portal-requests.js?build=20261031-wave1ab-1',
      './route-optimization.js?build=20261004-route-1',
    ];
    const PAGE_MESSAGES = [
      './app-08.js?build=20261020-myhank-settings-1',
      './app-09.js?build=20261013-messages-entry-3',
      './business-hours.js?build=20261030-r2-business-hours-1',
      './sms-provider.js?build=20261004-sms-seam-2',
      './sms-triggers.js?build=20261004-sms-kit-1',
      './sms-approval-runtime.js?build=20261011-sms-approval-1',
      './email-send-runtime.js?build=20261011-email-send-1',
      './customer-comms.js?build=20261026-auto-invoice-3',
      './communications-native-receptionist.js?build=20261030-swivl-round2-1',
    ];
    const PAGE_FLEET = [
      './app-12.js?build=20261020-ws4-remaining-1',
      './route-manager.js?build=20261026-map-tiles-1',
      './route-planner.js?build=20261031-wave1ab-1',
      './northern-bouncie-fleet.js?build=20261026-bouncie-plumb-1',
      './fleet-providers.js?build=20261026-fleet-providers-6',
      './gps-dispatch.js?build=20261030-r2-map-1',
      './crew-phone-location.js?build=20261008-crew-phone-location-4',
      './mileage.js?build=20261031-trippath-1',
      './plow-flow.js?build=20261011-plow-flow-1',
      './route-optimization.js?build=20261004-route-1',
    ];
    // Mileage (2026-10-22): detection has to start when the app opens, and
    // Today is the landing workspace — so the module also loads with the
    // Today group. It stays dark unless the tenant pilot switch and the
    // Owner Controls feature toggle are both on (see mileage.js).
    const PAGE_TODAY = [
      './kit-activity-feed.js?build=20261011-kit-feed-bold-numbers-1',
      './daily-digest.js?build=20261031-schedtruth-2',
      './owner-controls.js?build=20261027-signed-deposit-2',
      './owner-notifications.js?build=20261013-owner-notify-4',
      './today-command-setup.js?build=20261030-r2-today-1',
      './mileage.js?build=20261031-trippath-1',
    ];
    const PAGE_MONEY = [
      './price-history.js?build=20261004-price-history-1',
      './email-send-runtime.js?build=20261011-email-send-1',
      './membership-engine.js?build=20261020-ws4-remaining-1',
      './card-vault.js?build=20261005-cardvault-1',
      // Tally cold-mount fix (2026-10-20): money-agent's brief reads its
      // books state from the accounting workspace or, failing that, this
      // engine's snapshot fallback — neither was in the Money group, so a
      // cold Money render mounted the card with an empty state sentence.
      // The engine is a pure calc module (no DOM side effects); the loader
      // dedupes it when Accounting/Payroll/Reports load it too.
      './accounting-engine.js?build=20261020-payroll-engine-1',
      // E2E findings fix (2026-10-20): the posting bridge mirrors
      // RECORD_PAYMENT -> GL-PAYMENT and SAVE_INVOICE -> GL-INVOICE, but it
      // only loaded with the Accounting group — a payment recorded in a
      // Money-first session was never mirrored (no backfill exists). Money
      // is where manual payments are recorded, so the bridge belongs here
      // too; same ?build= URL as PAGE_ACCOUNTING so the loader dedupes it.
      './accounting-posting-bridge.js?build=20260929-bank-csv-records-2',
      './money-agent.js?build=20261022-perperson-1',
      './invoice-live-customer-preview.js?build=20261031-invoice-split-1',
      // Workbench Money rail (2026-10-31): the rail's customer money
      // summary must come from the canonical computeProfileMoney —
      // that module otherwise loads only with the Customers group, so
      // a Money-first session had no canonical money math available.
      // Same ?build= URL as PAGE_CUSTOMERS so the loader dedupes it.
      './customer-profile-money.js?build=20261031-wave1ab-1',
      './pay-bills.js?build=20261011-phase2-1',
      './overdue-nudge.js?build=20261011-phase3-1',
      './stripe-payments.js?build=20261006-stripepay-1',
    ];
    const PAGE_ACCOUNTING = [
      './accounting-engine.js?build=20261020-payroll-engine-1',
      './accounting-workspace.js?build=20261022-perperson-1',
      './accounting-posting-bridge.js?build=20260929-bank-csv-records-2',
      // WS3: payroll calc joins the accounting chain (loaded before the
      // bridge pulls in operations-ui) so Reports/accounting surfaces can
      // share the one withholding module. Loader dedupes repeat loads.
      './payroll-calc.js?build=20261020-payroll-calc-1',
      './money-agent.js?build=20261022-perperson-1',
    ];
    const PAGE_PAYROLL = [
      // WS3 run pipeline deps first (loader dedupes if Accounting ran first):
      // engine → operations (payrollPreparation) → calc → run → presentation.
      './accounting-engine.js?build=20261020-payroll-engine-1',
      './accounting-operations.js?build=20261002-payroll-approved-period-1',
      './payroll-calc.js?build=20261020-payroll-calc-1',
      './payroll-run.js?build=20261020-payroll-run-1',
      './payroll-workflow.js?build=20261020-payroll-presentation-1',
      './money-agent.js?build=20261022-perperson-1',
      './guided-payroll.js?build=20261020-payroll-run-1',
    ];
    const PAGE_TAX = [
      './tax-packet.js?build=20261005-tax-packet-2',
      './cpa-package.js?build=20261011-cpa-package-1',
      './money-agent.js?build=20261022-perperson-1',
    ];
    const PAGE_REPORTS = [
      // WS3 library deps (loader dedupes): engine for R1/R2/R3/R8 ledger
      // math, operations for R5 jobCost. R6 stays dependency-free.
      './accounting-engine.js?build=20261020-payroll-engine-1',
      './accounting-operations.js?build=20261002-payroll-approved-period-1',
      './reports-section.js?build=20261030-laptop-phase1-1',
      './accountant-share.js?build=20261030-laptop-phase1-1',
      './money-agent.js?build=20261022-perperson-1',
    ];
    const PAGE_BOOKS = [
      // Phase 2 (2026-10-22): in-app Books spreadsheet tabs. Self-contained:
      // reads the workbook through the h38-accountant-view edge function's
      // authenticated action via the shared Supabase client; no money math
      // lives client-side, so no accounting deps are needed here.
      './books-spreadsheet.js?build=20261022-native-bridge-1',
    ];
    const PAGE_DOCUMENTS = [
      './smart-upload.js?build=20260920-final-real-office-1',
      './smart-upload-ai.js?build=20261011-smart-upload-ai-1',
    ];
    const PAGE_AI = [
      './app-16.js?build=20261026-owner-chat-5',
      './assistant-tenant-actions.js?build=20260929-readable-action-preview-8',
      './owner-chat.js?build=20261026-owner-chat-5',
      './kits-workspace.js?build=20261026-owner-chat-5',
    ];
    const PAGE_ASSISTANT = [
      './app-16.js?build=20261026-owner-chat-5',
      './assistant-tenant-actions.js?build=20260929-readable-action-preview-8',
      './owner-chat.js?build=20261026-owner-chat-5',
      './kits-workspace.js?build=20261026-owner-chat-5',
    ];
    const PAGE_SOCIAL = [
      './app-15.js?build=20261020-ws4-remaining-1',
      './deal-alerts.js?build=20261008-inventory-module-1',
    ];
    const PAGE_PEOPLE = [
      './employee-onboarding.js?build=20261011-phase3-1',
    ];
    const PAGE_SETTINGS = [
      './business-hours.js?build=20261030-r2-business-hours-1',
      './health-dashboard.js?build=20261011-health-dashboard-1',
      './sms-provider-setup.js?build=20261004-sms-providers-1',
      './muse-permissions.js?build=20261006-muse-permissions-2',
      './data-usage.js?build=20261022-perperson-1',
      './example-data-manager.js?build=20260824-example-data-manager-2',
      './example-data-full-office.js?build=20261007-example-full-office-tenant-gate-1',
      './machine-shop-pricebook-templates.js?build=20261004-machine-shop-templates-1',
      './machine-shop.js?build=20261020-ws4-placeholders-1',
      './recommended-vendors.js?build=20261020-ws4-placeholders-1',
      './communications-native-receptionist.js?build=20261030-swivl-round2-1',
    ];

    const PAGE_INVENTORY = [
      './inventory-checker.js?build=20261008-inventory-module-2',
      './app-11.js?build=20261020-ws4-pricebook-1',
      './inventory-module.js?build=20261020-ws4-pricebook-1',
      './order-inventory.js?build=20261011-phase2-1',
    ];

  // Map of page -> script URLs needed for that page.
  // URLs must match the ?build= params the files ship with.
  // Only list scripts that are SAFE to lazy-load (page-specific, no startup dependencies).
  const PAGE_SCRIPTS = {
    'today': PAGE_TODAY,
    'field': FIELD_AND_MEASURE_SCRIPTS,
    'measure': FIELD_AND_MEASURE_SCRIPTS,
    'quotes': PAGE_QUOTES,
    'customers': PAGE_CUSTOMERS,
    'meetings': PAGE_MEETINGS,
    'tasks': PAGE_TASKS,
    'work': PAGE_WORK,
    'schedule': PAGE_SCHEDULE,
    'messages': PAGE_MESSAGES,
    'fleet': PAGE_FLEET,
    'inventory': PAGE_INVENTORY,
    'money': PAGE_MONEY,
    'accounting': PAGE_ACCOUNTING,
    'payroll': PAGE_PAYROLL,
    'tax': PAGE_TAX,
    'reports': PAGE_REPORTS,
    'books': PAGE_BOOKS,
    'documents': PAGE_DOCUMENTS,
    'ai': PAGE_AI,
    'assistant': PAGE_ASSISTANT,
    'social': PAGE_SOCIAL,
    'people': PAGE_PEOPLE,
    'settings': PAGE_SETTINGS
  };

  // Scripts that should preload in background after initial page load.
  // 2026-10-31 cold-start pass: index.html no longer loads page renderers /
  // page features upfront (they live in the PAGE_SCRIPTS groups above and
  // load on first navigation). So that every feature is also simply
  // PRESENT shortly after startup (guided flows launched from the owner
  // home, Ask Hank, voice helpers), the idle preload below walks every
  // page group sequentially once Today has rendered. Sequential + idle
  // scheduled: it must never compete with the first usable Today.
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
  // Group loads (2026-10-31 cold-start follow-up): fetch the whole group in
  // PARALLEL but execute in group order (script.async=false on dynamically
  // inserted classic scripts preserves insertion execution order). The old
  // sequential chain paid one network round-trip per script — with 6-30
  // scripts per group that serialized seconds into first navigation and
  // into the Today group's first render. Execution order is unchanged, so
  // wrapper/override scripts still land after the renderers they wrap.
  function loadScriptOrdered(url) {
    if (loaded.has(url)) return Promise.resolve();
    if (loading.has(url)) return loading.get(url);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = false;
      script.onload = () => { loaded.add(url); loading.delete(url); resolve(); };
      script.onerror = (e) => { loading.delete(url); reject(new Error('Failed to load script: ' + url)); };
      document.head.appendChild(script);
    });
    loading.set(url, promise);
    return promise;
  }
  function loadPageScripts(page) {
    const scripts = PAGE_SCRIPTS[page] || [];
    if (!scripts.length) return Promise.resolve();
    return Promise.all(scripts.map(url =>
      loadScriptOrdered(url).catch(() => loadScriptOrdered(url)).catch(err => {
        try { console.error('[H38 lazy load] script failed for page', page, err); } catch (e) {}
      })
    ));
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
      // Priority order: the pages a user is most likely to open next first.
      const order = ['ai', 'assistant', 'quotes', 'schedule', 'money', 'customers', 'work', 'messages', 'tasks', 'field', 'fleet', 'inventory', 'accounting', 'payroll', 'tax', 'reports', 'books', 'documents', 'social', 'people', 'settings', 'meetings', 'today'];
      const seen = new Set();
      const queue = [];
      order.forEach(page => {
        (PAGE_SCRIPTS[page] || []).forEach(url => { if (!seen.has(url)) { seen.add(url); queue.push(url); } });
      });
      PRELOAD_AFTER_IDLE.forEach(url => { if (!seen.has(url)) { seen.add(url); queue.push(url); } });
      // Ordered insertion (loadScriptOrdered) everywhere keeps global
      // execution order == insertion order, and this chain inserts the
      // next preload script only after the previous one executed — so at
      // any moment the executed set is a prefix of this queue, and a page
      // group opened mid-preload only ever inserts scripts whose
      // dependencies are already executed or earlier in its own group.
      queue.reduce((chain, url) => chain.then(() => loadScriptOrdered(url).catch(() => {})), Promise.resolve());
    }, { timeout: 4000 });
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
