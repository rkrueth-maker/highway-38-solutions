/**
 * Public Supabase configuration for the Highway 38 Customer Portal.
 *
 * The project URL and publishable key are safe for browser use because every
 * exposed table and storage bucket is protected by Row Level Security.
 * Never place a service_role key or any private secret in this file.
 */
window.H38_CUSTOMER_PORTAL_SUPABASE = Object.freeze({
  enabled: true,
  url: 'https://jqukmwtsgcsaruucnqja.supabase.co',
  publishableKey: 'sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1',
  redirectUrl: 'https://rkrueth-maker.github.io/highway-38-solutions/customer-portal.html',
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