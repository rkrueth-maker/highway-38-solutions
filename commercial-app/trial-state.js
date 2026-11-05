(function () {
  'use strict';

  // 30-day free trial: days-left banner, Keep-the-Office action, and the
  // client half of the expired-trial read-only rule. The server is the
  // authority (private.trial_read_only + write triggers stamp/block from
  // business_trials.trial_end); this file only mirrors that state for UX.
  // Non-trial tenants never see or feel any of this: my_trial_state returns
  // isTrial=false and every hook below stays inert.

  const config = window.H38_BUSINESS_OFFICE_SUPABASE || {};
  const auth = window.H38_SUPABASE_AUTH;
  if (!auth || auth.enabled !== true || !window.supabase) return;

  const READ_ONLY_MESSAGE =
    'Trial ended — your data is here and exportable free; keep the Office to pick up where you left off.';

  let trialClient = null;
  let trialState = null;
  let keepRequested = false;

  function client() {
    if (trialClient) return trialClient;
    trialClient = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      global: { headers: { 'x-client-info': 'h38-trial-state' } }
    });
    return trialClient;
  }

  function text(value) { return String(value == null ? '' : value); }
  function escape(value) {
    return window.esc
      ? window.esc(value)
      : text(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function bannerHtml() {
    if (!trialState || !trialState.isTrial || trialState.converted) return '';
    const days = Number(trialState.daysLeft || 0);
    if (trialState.expired) {
      return '<strong>Trial ended.</strong> <span>Your Office is read-only — your data is here and exportable free, any time.</span>'
        + keepButtonHtml('Keep the Office to pick up where you left off');
    }
    if (days <= 7) {
      return '<strong>Your trial ends in ' + days + (days === 1 ? ' day' : ' days') + '.</strong>'
        + ' <span>Keep the Office and nothing stops — your customers, jobs and quotes stay right where they are.</span>'
        + keepButtonHtml('Keep the Office');
    }
    return '<span>Free trial — ' + days + ' days left.</span>' + keepButtonHtml('Keep the Office');
  }

  function keepButtonHtml(label) {
    if (keepRequested || trialState.keepOfficeRequestedAt) {
      return ' <span style="font-weight:600">Keep the Office: request sent — we will be in touch.</span>';
    }
    return ' <button type="button" data-trial-keep style="margin-left:10px;padding:6px 12px;border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer">'
      + escape(label) + '</button>';
  }

  function renderBanner() {
    const html = bannerHtml();
    let bar = document.getElementById('trialBanner');
    if (!html) {
      if (bar) bar.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'trialBanner';
      bar.setAttribute('role', 'status');
      document.body.insertBefore(bar, document.body.firstChild);
    }
    const urgent = trialState.expired || Number(trialState.daysLeft || 0) <= 7;
    bar.style.cssText = 'position:relative;z-index:60;padding:10px 16px;text-align:center;font-size:.95rem;line-height:1.4;'
      + (urgent
        ? 'background:#fdf3e3;color:#6b4a00;border-bottom:1px solid #e8cf9f'
        : 'background:#eef4fb;color:#274b73;border-bottom:1px solid #cfdff2');
    if (bar.innerHTML !== html) bar.innerHTML = html;
    const button = bar.querySelector('[data-trial-keep]');
    if (button) button.addEventListener('click', requestKeepOffice);
  }

  async function requestKeepOffice() {
    try {
      const { data, error } = await client().rpc('request_keep_office');
      if (error) throw error;
      if (!data || data.status !== 'PASS') throw new Error('Keep the Office request did not return PASS.');
      keepRequested = true;
      if (trialState) trialState.keepOfficeRequestedAt = data.keepOfficeRequestedAt || new Date().toISOString();
      renderBanner();
    } catch (error) {
      window.alert('That request could not be sent just now. Please try again in a moment.');
    }
  }

  // Client read-only guard: refuse record mutations once the trial has
  // expired. The server trigger enforces the same rule for every client;
  // this guard exists so the owner sees the plain message instead of a
  // failed sync. Reads never pass through queueOperation, so sign-in,
  // viewing and export stay untouched.
  function installWriteGuard() {
    const legacy = window.queueOperation;
    if (typeof legacy !== 'function' || legacy.__h38TrialGuard) return;
    const guarded = function (action, recordType, recordId, payload, optimistic, autoSync) {
      if (trialState && trialState.isTrial && trialState.expired && !trialState.converted) {
        return Promise.reject(new Error(READ_ONLY_MESSAGE));
      }
      return legacy.apply(this, arguments);
    };
    guarded.__h38TrialGuard = true;
    window.queueOperation = guarded;
    try { queueOperation = guarded; } catch (ignore) {}
  }

  let loadInFlight = false;
  async function loadTrialState() {
    if (loadInFlight || trialState) return;
    loadInFlight = true;
    try {
      const { data: sessionData } = await client().auth.getSession();
      if (!sessionData || !sessionData.session) return;
      const { data, error } = await client().rpc('my_trial_state');
      if (error || !data) return;
      trialState = data;
      window.H38Trial = { state: trialState, requestKeepOffice };
      if (trialState.isTrial) {
        installWriteGuard();
        renderBanner();
      }
    } catch (ignore) {
      // Trial state is an enhancement layer; the server enforces expiry
      // regardless of whether this check could run.
    } finally {
      loadInFlight = false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTrialState);
  } else {
    loadTrialState();
  }
  // The Office signs in without a page reload, so a session that appears
  // after this script first ran must trigger the same load.
  try {
    client().auth.onAuthStateChange((_event, session) => {
      if (session) loadTrialState();
    });
  } catch (ignore) {}
  window.addEventListener('h38:business-snapshot-updated', () => {
    if (trialState && trialState.isTrial) renderBanner();
    else loadTrialState();
  });
})();
