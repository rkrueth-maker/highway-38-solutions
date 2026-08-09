(function () {
  'use strict';

  const config = window.H38_BUSINESS_OFFICE_SUPABASE || {};
  const sdk = window.supabase;
  if (!config.enabled || !sdk || typeof sdk.createClient !== 'function') return;
  if (window.H38_SUPABASE_SHARED_CLIENT?.enabled) return;

  const originalCreateClient = sdk.createClient.bind(sdk);
  let sharedClient = null;
  let createdCount = 0;
  let reusedCount = 0;

  function isOfficeClient(url, key, options) {
    const auth = options && options.auth || {};
    return String(url || '') === String(config.url || '') &&
      String(key || '') === String(config.publishableKey || '') &&
      auth.persistSession !== false;
  }

  sdk.createClient = function (url, key, options) {
    if (!isOfficeClient(url, key, options)) return originalCreateClient(url, key, options);
    if (sharedClient) {
      reusedCount += 1;
      return sharedClient;
    }
    const requested = options || {};
    const requestedAuth = requested.auth || {};
    sharedClient = originalCreateClient(url, key, {
      ...requested,
      auth: {
        ...requestedAuth,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Supabase admin invitation links do not support PKCE because the
        // browser requesting an invite is commonly different from the browser
        // accepting it. The Business Office uses one shared implicit-flow
        // client so invite, recovery, and existing password sessions resolve
        // through the same persisted session and exact-email membership claim.
        flowType: 'implicit'
      }
    });
    createdCount += 1;
    return sharedClient;
  };

  window.H38_SUPABASE_SHARED_CLIENT = Object.freeze({
    enabled: true,
    build: '20260808-2308-invite-auth',
    authFlow: 'implicit-invite-compatible',
    get: function () { return sharedClient; },
    ensure: function () {
      return sharedClient || sdk.createClient(config.url, config.publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'implicit'
        },
        global: { headers: { 'x-client-info': 'h38-business-office-shared-client' } }
      });
    },
    stats: function () { return { createdCount, reusedCount, hasClient: Boolean(sharedClient) }; },
    rotatingRefreshOwner: 'single-client'
  });
})();