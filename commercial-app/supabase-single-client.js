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
    sharedClient = originalCreateClient(url, key, options);
    createdCount += 1;
    return sharedClient;
  };

  window.H38_SUPABASE_SHARED_CLIENT = Object.freeze({
    enabled: true,
    build: '20260805-1745',
    get: function () { return sharedClient; },
    ensure: function () {
      return sharedClient || sdk.createClient(config.url, config.publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        },
        global: { headers: { 'x-client-info': 'h38-business-office-shared-client' } }
      });
    },
    stats: function () { return { createdCount, reusedCount, hasClient: Boolean(sharedClient) }; },
    rotatingRefreshOwner: 'single-client'
  });
})();