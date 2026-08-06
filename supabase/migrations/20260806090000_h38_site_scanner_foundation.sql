-- H38 Site Scanner shared Supabase foundation.
-- Additive and idempotent. Uses existing tenant-scoped business_records and
-- business-office-files storage. Does not create another database, quote system,
-- customer system, approval system, or production application.

update storage.buckets
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/svg+xml',
      'application/pdf','application/json','text/plain',
      'audio/mpeg','audio/mp4','audio/webm',
      'video/mp4','video/webm','application/octet-stream'
    ]
where id = 'business-office-files';

insert into public.business_module_settings (
  business_id,
  module_key,
  enabled,
  config
)
select
  b.id,
  'measure',
  true,
  jsonb_build_object(
    'feature_name', 'H38 Site Scanner',
    'scanner_version', 'site-scanner-v1',
    'load_strategy', 'on-demand',
    'cache_ttl_seconds', 0,
    'capture_modes', jsonb_build_array(
      'LIDAR_PRECISION',
      'ANDROID_DEPTH',
      'CAMERA_GUIDED',
      'GUIDED_LASER'
    ),
    'record_collections', jsonb_build_array(
      'siteCaptureSessions',
      'siteSpatialEntities',
      'siteMeasurements',
      'siteGeometryOutputs',
      'siteAiReviews'
    ),
    'storage_bucket', 'business-office-files',
    'native_clients_are_capture_clients', true,
    'supabase_is_authoritative', true,
    'automatic_approval', false,
    'automatic_customer_sending', false,
    'automatic_financial_action', false
  )
from public.businesses b
where b.business_key = 'highway38'
on conflict (business_id, module_key) do update
set enabled = true,
    config = coalesce(public.business_module_settings.config, '{}'::jsonb) || excluded.config,
    updated_at = now();

insert into public.business_proof_log (
  business_id,
  actor_user_id,
  action_type,
  entity_type,
  result,
  details,
  external_action_occurred
)
select
  b.id,
  null,
  'H38_SITE_SCANNER_FOUNDATION_PREPARED',
  'Business Office Measure Module',
  'PASS',
  jsonb_build_object(
    'database_authority', 'existing Supabase Business Office',
    'record_table', 'business_records',
    'storage_bucket', 'business-office-files',
    'new_parallel_database_created', false,
    'native_clients_are_capture_clients', true,
    'owner_review_required', true,
    'automatic_approval', false,
    'automatic_customer_sending', false,
    'retired_apps_script_restored', false
  ),
  false
from public.businesses b
where b.business_key = 'highway38'
and not exists (
  select 1
  from public.business_proof_log p
  where p.business_id = b.id
    and p.action_type = 'H38_SITE_SCANNER_FOUNDATION_PREPARED'
    and p.result = 'PASS'
);