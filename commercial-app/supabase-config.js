/**
 * Browser-safe configuration for the standard Highway 38 Business Office.
 *
 * The publishable key is safe for browser use because tenant-owned records are
 * protected by Supabase Auth and Row Level Security. Never put a service-role
 * key, database password, or other private secret in browser code.
 */
window.H38_BUSINESS_OFFICE_SUPABASE = Object.freeze({
  enabled: true,
  stage: 'supabase-auth-production-standard',
  standardOffice: true,
  projectRef: 'jqukmwtsgcsaruucnqja',
  url: 'https://jqukmwtsgcsaruucnqja.supabase.co',
  publishableKey: 'sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1',
  fallbackUrl: '../legacy-business-office.html',
  authRedirectUrl: 'https://rkrueth-maker.github.io/highway-38-solutions/commercial-app/',
  offlineAuthorizationMaxAgeMs: 12 * 60 * 60 * 1000,
  productionPromotionAuthorized: false,
  northernLakesEnabled: false,
  externalActionsEnabled: false
});
