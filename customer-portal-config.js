/**
 * Public Supabase configuration for the Highway 38 Customer Portal.
 *
 * The project URL and publishable/anon key are safe for browser use only when
 * every exposed table and storage bucket is protected by Row Level Security.
 * Never place a service_role key or any private secret in this file.
 */
window.H38_CUSTOMER_PORTAL_SUPABASE = Object.freeze({
  enabled: false,
  url: 'https://YOUR_PROJECT.supabase.co',
  publishableKey: 'REPLACE_WITH_SUPABASE_PUBLISHABLE_KEY',
  redirectUrl: '',
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
