(function () {
  'use strict';
  // The existing Office is intentionally kept as classic scripts. Its top-level
  // const bindings are shared across scripts but are not window properties.
  // Expose only runtime helpers that actually exist in this build so a retired
  // renderer cannot crash startup or Site Visit navigation.
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

  if (!document.querySelector('script[data-h38-startup-site-visit-stability]')) {
    const script = document.createElement('script');
    script.src = './startup-site-visit-stability.js?build=20260816-startup-site-visit-stability-1';
    script.dataset.h38StartupSiteVisitStability = '1';
    document.head.appendChild(script);
  }
})();
