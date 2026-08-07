(function () {
  'use strict';

  const BUILD = '20260806-2315';
  const AUTH_KEY = /^sb-[a-z0-9-]+-auth-token(?:\.[0-9]+)?$/i;
  const AUTH_PARAMS = ['access_token', 'refresh_token', 'token', 'token_hash', 'expires_at', 'expires_in', 'provider_token', 'provider_refresh_token', 'type'];

  function isJwt(value) {
    const token = String(value || '').trim();
    const parts = token.split('.');
    return parts.length === 3 && parts.every(part => part.length > 0 && /^[A-Za-z0-9_-]+$/.test(part));
  }

  function findAccessToken(value, depth) {
    if (!value || depth > 4) return '';
    if (typeof value === 'string') return isJwt(value) ? value : '';
    if (typeof value !== 'object') return '';
    if (typeof value.access_token === 'string') return value.access_token;
    if (value.currentSession && typeof value.currentSession.access_token === 'string') return value.currentSession.access_token;
    if (value.session && typeof value.session.access_token === 'string') return value.session.access_token;
    for (const key of Object.keys(value)) {
      const found = findAccessToken(value[key], depth + 1);
      if (found) return found;
    }
    return '';
  }

  function sanitizeStorage(storage) {
    if (!storage) return 0;
    let removed = 0;
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && AUTH_KEY.test(key)) keys.push(key);
    }
    keys.forEach(key => {
      try {
        const raw = storage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const token = findAccessToken(parsed, 0);
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

  function sanitizeUrl() {
    const url = new URL(window.location.href);
    const hashText = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    const hash = new URLSearchParams(hashText);
    const queryToken = url.searchParams.get('access_token');
    const hashToken = hash.get('access_token');
    const malformed = (queryToken && !isJwt(queryToken)) || (hashToken && !isJwt(hashToken));
    if (!malformed) return false;

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
  try { removed += sanitizeStorage(window.localStorage); } catch (error) {}
  try { removed += sanitizeStorage(window.sessionStorage); } catch (error) {}
  const urlCleaned = sanitizeUrl();

  window.H38_CUSTOMER_PORTAL_AUTH_SANITIZER = Object.freeze({
    enabled: true,
    build: BUILD,
    removedMalformedSessions: removed,
    removedMalformedUrlAuth: urlCleaned,
    isJwt
  });
})();
