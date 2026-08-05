(function () {
  'use strict';

  const config = window.H38_BUSINESS_OFFICE_SUPABASE || {};
  const Bridge = window.H38Bridge;
  if (!config.enabled || !window.supabase || !Bridge || !Bridge.prototype || typeof window.fetch !== 'function') return;

  const previousRequest = Bridge.prototype.request;
  let db = null;

  function text(value) { return String(value == null ? '' : value); }
  function client() {
    if (db) return db;
    db = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      global: { headers: { 'x-client-info': 'h38-quote-ai-direct-auth-v1' } }
    });
    return db;
  }
  async function responsePayload(response) {
    const raw = await response.text();
    if (!raw) return {};
    try { return JSON.parse(raw); }
    catch (error) { return { status: 'FAIL', message: `Quote AI returned unreadable data (${response.status}).` }; }
  }
  async function directQuoteAi(args, timeout) {
    if (typeof window.sync === 'function') await window.sync(false);
    const api = client();
    const { data: sessionData, error: sessionError } = await api.auth.getSession();
    if (sessionError) throw sessionError;
    const session = sessionData.session;
    if (!session?.access_token) throw new Error('Sign in again before building the quote.');

    const { data: userData, error: userError } = await api.auth.getUser();
    if (userError || !userData?.user) throw new Error('Supabase Auth session is invalid or expired. Sign in again before building the quote.');

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
          'x-client-info': 'h38-quote-ai-direct-auth-v1'
        },
        body: JSON.stringify({ action: 'buildQuote', ...(args || {}) }),
        signal: controller.signal
      });
      const payload = await responsePayload(response);
      if (!response.ok || payload.status !== 'PASS') {
        throw new Error(text(payload.message || `Quote AI request failed (${response.status}).`));
      }
      return payload;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error('Quote AI timed out. The saved draft and photos were not approved or sent.');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  Bridge.prototype.request = async function (action, args, timeout) {
    if (action === 'aiBuildQuoteDraft') return directQuoteAi(args, timeout);
    return previousRequest.call(this, action, args, timeout);
  };

  window.H38_QUOTE_AI_AUTH_FIX = Object.freeze({
    enabled: true,
    transport: 'direct-fetch',
    endpoint: 'h38-quote-ai',
    authorizationHeader: 'single-user-bearer',
    publishableKeyHeader: true,
    ownerReviewRequired: true,
    automaticApproval: false,
    automaticSending: false
  });
})();