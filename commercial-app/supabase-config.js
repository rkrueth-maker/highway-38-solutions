/**
 * Browser-safe configuration for the production Business Office.
 *
 * Supabase Auth, Row Level Security, tenant memberships, and the operational
 * record layer are the only supported Office runtime. No legacy Office fallback
 * is exposed or used.
 */
window.H38_BUSINESS_OFFICE_SUPABASE = Object.freeze({
  enabled: true,
  stage: 'supabase-production-only',
  standardOffice: true,
  projectRef: 'jqukmwtsgcsaruucnqja',
  url: 'https://jqukmwtsgcsaruucnqja.supabase.co',
  publishableKey: 'sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1',
  authRedirectUrl: 'https://rkrueth-maker.github.io/highway-38-solutions/commercial-app/',
  offlineAuthorizationMaxAgeMs: 12 * 60 * 60 * 1000,
  productionPromotionAuthorized: false,
  northernLakesEnabled: false,
  clientTenantsEnabled: true,
  legacyOfficeEnabled: false,
  externalActionsEnabled: false
});
