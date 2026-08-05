(function () {
  'use strict';
  // The existing Office is intentionally kept as classic scripts. Its top-level
  // const bindings are shared across scripts but are not window properties.
  // Expose only the runtime helpers required by the Supabase operational adapter.
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
  window.renderField = renderField;
  window.renderSettings = renderSettings;
  window.queueOperation = queueOperation;
})();
