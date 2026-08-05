/**
 * Browser-safe configuration for the isolated Business Office Auth stage.
 *
 * This branch points only to the isolated Supabase preview project. The key is
 * publishable and every tenant-owned table remains protected by RLS. Never put
 * a service-role key, database password, or other secret in browser code.
 */
window.H38_BUSINESS_OFFICE_SUPABASE = Object.freeze({
  enabled: true,
  stage: 'supabase-auth-active-business-preview',
  projectRef: 'uvcqnkjidllhdmjnqshk',
  url: 'https://uvcqnkjidllhdmjnqshk.supabase.co',
  publishableKey: 'sb_publishable_CMkRPG2Qn3VvunVO-Gxo5w_uLQXysUo',
  fallbackUrl: '/open-business-office.html',
  authRedirectUrl: location.origin + location.pathname,
  offlineAuthorizationMaxAgeMs: 12 * 60 * 60 * 1000,
  productionPromotionAuthorized: false,
  northernLakesEnabled: false,
  externalActionsEnabled: false
});
