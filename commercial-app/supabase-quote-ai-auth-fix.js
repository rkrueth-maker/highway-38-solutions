(function () {
  'use strict';

  const config = window.H38_BUSINESS_OFFICE_SUPABASE || {};
  const Bridge = window.H38Bridge;
  const shared = window.H38_SUPABASE_SHARED_CLIENT;
  if (!config.enabled || !window.supabase || !Bridge || !Bridge.prototype || typeof window.fetch !== 'function') return;

  const previousRequest = Bridge.prototype.request;

  function text(value) { return String(value == null ? '' : value); }
  function client() {
    if (shared?.ensure) return shared.ensure();
    return window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      global: { headers: { 'x-client-info': 'h38-quote-ai-shared-auth-v2' } }
    });
  }
  async function responsePayload(response) {
    const raw = await response.text();
    if (!raw) return {};
    try { return JSON.parse(raw); }
    catch (error) { return { status: 'FAIL', message: `Quote AI returned unreadable data (${response.status}).` }; }
  }
  async function validSession(forceRefresh) {
    const recovery = window.H38_SUPABASE_SESSION_RECOVERY;
    if (recovery?.validate) {
      const valid = await recovery.validate();
      if (valid === false) throw new Error('Secure session expired. Sign in again before building the quote.');
    }

    const api = client();
    let result = await api.auth.getSession();
    if (result.error) throw result.error;
    let session = result.data?.session;
    if (!session) throw new Error('Sign in again before building the quote.');

    const expiresSoon = Number(session.expires_at || 0) * 1000 <= Date.now() + 120000;
    if (forceRefresh || expiresSoon) {
      const refreshed = await api.auth.refreshSession();
      if (refreshed.error || !refreshed.data?.session) {
        throw new Error(refreshed.error?.message || 'Secure session could not be refreshed. Sign in again.');
      }
      session = refreshed.data.session;
    }

    const verified = await api.auth.getUser(session.access_token);
    if (verified.error || !verified.data?.user) {
      throw new Error(verified.error?.message || 'Secure session is invalid. Sign in again before building the quote.');
    }
    return session;
  }
  async function postQuoteAi(args, timeout, forceRefresh) {
    const session = await validSession(forceRefresh);
    const controller = new AbortController();
    const timeoutMs = Math.max(30000, Number(timeout) || 180000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${config.url}/functions/v1/h38-quote-ai`, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': config.publishableKey,
          'Content-Type': 'application/json',
          'x-client-info': 'h38-quote-ai-shared-auth-v2'
        },
        body: JSON.stringify({ action: 'buildQuote', ...(args || {}) }),
        signal: controller.signal
      });
      const payload = await responsePayload(response);
      return { response, payload };
    } finally {
      clearTimeout(timer);
    }
  }
  async function directQuoteAi(args, timeout) {
    if (typeof window.sync === 'function') await window.sync(false);
    let attempt;
    try {
      attempt = await postQuoteAi(args, timeout, false);
      if (attempt.response.status === 401) attempt = await postQuoteAi(args, timeout, true);
      if (!attempt.response.ok || attempt.payload.status !== 'PASS') {
        throw new Error(text(attempt.payload.message || `Quote AI request failed (${attempt.response.status}).`));
      }
      return attempt.payload;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error('Quote AI timed out. The saved draft and photos were not approved or sent.');
      }
      throw error;
    }
  }

  Bridge.prototype.request = async function (action, args, timeout) {
    if (action === 'aiBuildQuoteDraft') return directQuoteAi(args, timeout);
    return previousRequest.call(this, action, args, timeout);
  };

  window.H38_QUOTE_AI_AUTH_FIX = Object.freeze({
    enabled: true,
    build: '20260806-2115',
    transport: 'direct-fetch-shared-client',
    endpoint: 'h38-quote-ai',
    authorizationHeader: 'refreshed-user-bearer',
    retryOnUnauthorized: true,
    publishableKeyHeader: true,
    ownerReviewRequired: true,
    automaticApproval: false,
    automaticSending: false
  });
})();
