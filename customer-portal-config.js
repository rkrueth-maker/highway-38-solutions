/**
 * Public Supabase configuration for the Highway 38 Customer Portal.
 *
 * The project URL and publishable key are safe for browser use because every
 * exposed table and storage bucket is protected by Row Level Security.
 * Never place a service_role key or any private secret in this file.
 */
(function sanitizeCustomerPortalAuth() {
  'use strict';

  const PORTAL_AUTH_KEY = 'h38-customer-portal-auth-v1';
  const AUTH_PARAMS = ['access_token', 'refresh_token', 'token', 'token_hash', 'expires_at', 'expires_in', 'provider_token', 'provider_refresh_token', 'type'];

  function isJwt(value) {
    const parts = String(value || '').trim().split('.');
    return parts.length === 3 && parts.every(part => part.length > 0 && /^[A-Za-z0-9_-]+$/.test(part));
  }

  function storedAccessToken(value, depth) {
    if (!value || depth > 4 || typeof value !== 'object') return '';
    if (typeof value.access_token === 'string') return value.access_token;
    if (value.currentSession && typeof value.currentSession.access_token === 'string') return value.currentSession.access_token;
    if (value.session && typeof value.session.access_token === 'string') return value.session.access_token;
    for (const key of Object.keys(value)) {
      const token = storedAccessToken(value[key], depth + 1);
      if (token) return token;
    }
    return '';
  }

  function cleanPortalStorage(storage) {
    if (!storage) return 0;
    const raw = storage.getItem(PORTAL_AUTH_KEY);
    if (!raw) return 0;
    try {
      const parsed = JSON.parse(raw);
      const token = storedAccessToken(parsed, 0);
      if (token && isJwt(token)) return 0;
    } catch (error) {}
    try { storage.removeItem(PORTAL_AUTH_KEY); return 1; } catch (error) { return 0; }
  }

  function cleanUrl() {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
    const queryToken = url.searchParams.get('access_token');
    const hashToken = hash.get('access_token');
    if (!((queryToken && !isJwt(queryToken)) || (hashToken && !isJwt(hashToken)))) return false;
    AUTH_PARAMS.forEach(name => {
      url.searchParams.delete(name);
      hash.delete(name);
    });
    const cleanHash = hash.toString();
    url.hash = cleanHash ? '#' + cleanHash : '';
    history.replaceState(null, document.title, url.pathname + url.search + url.hash);
    return true;
  }

  let removed = 0;
  try { removed += cleanPortalStorage(window.localStorage); } catch (error) {}
  try { removed += cleanPortalStorage(window.sessionStorage); } catch (error) {}
  const urlCleaned = cleanUrl();

  window.H38_CUSTOMER_PORTAL_AUTH_SANITIZER = Object.freeze({
    enabled: true,
    build: '20260807-1415',
    storageKey: PORTAL_AUTH_KEY,
    removedMalformedSessions: removed,
    removedMalformedUrlAuth: urlCleaned,
    preservesBusinessOfficeAuth: true,
    isJwt
  });
})();

window.H38_CUSTOMER_PORTAL_SUPABASE = Object.freeze({
  enabled: true,
  url: 'https://jqukmwtsgcsaruucnqja.supabase.co',
  publishableKey: 'sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1',
  redirectUrl: 'https://highway38solutions.com/customer-portal.html',
  storageBucket: 'customer-portal',
  authStorageKey: 'h38-customer-portal-auth-v1',
  maxUploadBytes: 26214400,
  allowedMimeTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
});

(function isolateCustomerPortalAuthStorage() {
  'use strict';
  const supabase = window.supabase;
  const config = window.H38_CUSTOMER_PORTAL_SUPABASE;
  if (!supabase || typeof supabase.createClient !== 'function' || !config?.authStorageKey || supabase.__h38CustomerPortalIsolated) return;
  const create = supabase.createClient.bind(supabase);
  supabase.createClient = function(url, key, options) {
    const next = Object.assign({}, options || {});
    next.auth = Object.assign({}, next.auth || {}, { storageKey: config.authStorageKey });
    return create(url, key, next);
  };
  Object.defineProperty(supabase, '__h38CustomerPortalIsolated', { value: true });
})();
