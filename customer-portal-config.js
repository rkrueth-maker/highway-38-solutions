/**
 * Public Supabase configuration for the Highway 38 Customer Portal.
 *
 * The project URL and publishable key are safe for browser use because every
 * exposed table and storage bucket is protected by Row Level Security.
 * Never place a service_role key or any private secret in this file.
 */
(function sanitizeCustomerPortalAuth() {
  'use strict';

  const AUTH_KEY = /^sb-[a-z0-9-]+-auth-token(?:\.[0-9]+)?$/i;
  const AUTH_PARAMS = ['access_token', 'refresh_token', 'token', 'token_hash', 'expires_at', 'expires_in', 'provider_token', 'provider_refresh_token', 'type'];

  function isJwt(value) {
    const parts = String(value || '').trim().split('.');
    return parts.length === 3 && parts.every(part => part.length > 0 && /^[A-Za-z0-9_-]+$/.test(part));
  }

  function storedAccessToken(value, depth) {
    if (!value || depth > 4) return '';
    if (typeof value !== 'object') return '';
    if (typeof value.access_token === 'string') return value.access_token;
    if (value.currentSession && typeof value.currentSession.access_token === 'string') return value.currentSession.access_token;
    if (value.session && typeof value.session.access_token === 'string') return value.session.access_token;
    for (const key of Object.keys(value)) {
      const token = storedAccessToken(value[key], depth + 1);
      if (token) return token;
    }
    return '';
  }

  function cleanStorage(storage) {
    if (!storage) return 0;
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && AUTH_KEY.test(key)) keys.push(key);
    }
    let removed = 0;
    keys.forEach(key => {
      try {
        const parsed = JSON.parse(storage.getItem(key) || 'null');
        const token = storedAccessToken(parsed, 0);
        if (!token || !isJwt(token)) {
          storage.removeItem(key);
          removed += 1;
        }
      } catch (error) {
        try { storage.removeItem(key); removed += 1; } catch (ignored) {}
      }
    });
    return removed;
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
  try { removed += cleanStorage(window.localStorage); } catch (error) {}
  try { removed += cleanStorage(window.sessionStorage); } catch (error) {}
  const urlCleaned = cleanUrl();

  window.H38_CUSTOMER_PORTAL_AUTH_SANITIZER = Object.freeze({
    enabled: true,
    build: '20260806-2315',
    removedMalformedSessions: removed,
    removedMalformedUrlAuth: urlCleaned,
    isJwt
  });
})();

window.H38_CUSTOMER_PORTAL_SUPABASE = Object.freeze({
  enabled: true,
  url: 'https://jqukmwtsgcsaruucnqja.supabase.co',
  publishableKey: 'sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1',
  redirectUrl: 'https://highway38solutions.com/customer-portal.html',
  storageBucket: 'customer-portal',
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