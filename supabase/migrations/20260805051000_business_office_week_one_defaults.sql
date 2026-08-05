-- Highway 38 week-one Supabase Business Office defaults.
-- Adds only app configuration and the internal Generic Quote Customer record.
-- No Google records are imported and no external action is enabled.

insert into public.business_module_settings (business_id, module_key, enabled, config)
select b.id, module_key, true, '{}'::jsonb
from public.businesses b
cross join unnest(array[
  'people',
  'accounting',
  'payroll-prep',
  'tax-prep',
  'controls',
  'reports',
  'storage-providers'
]) as module_key
where b.business_key = 'highway38'
on conflict (business_id, module_key) do update
set enabled = excluded.enabled,
    updated_at = now();

with owner_user as (
  select b.id as business_id, m.auth_user_id
  from public.businesses b
  join public.business_memberships m on m.business_id = b.id
  where b.business_key = 'highway38'
    and m.role = 'owner'
    and m.status = 'active'
    and m.auth_user_id is not null
  order by m.accepted_at nulls last, m.created_at
  limit 1
)
insert into public.business_records (
  business_id,
  collection,
  record_key,
  payload,
  record_status,
  created_by,
  updated_by
)
select
  business_id,
  'customers',
  'GENERIC-QUOTE-CUSTOMER',
  jsonb_build_object(
    'Customer ID', 'GENERIC-QUOTE-CUSTOMER',
    'Business ID', business_id::text,
    'Customer Name', 'Generic Quote Customer',
    'Email', '',
    'Phone', '',
    'Status', 'Active',
    'Internal Only', true,
    'Created Time', now(),
    'Updated Time', now(),
    'Record Version', 1
  ),
  'active',
  auth_user_id,
  auth_user_id
from owner_user
on conflict (business_id, collection, record_key) do update
set payload = excluded.payload,
    record_status = 'active',
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
  'WEEK_ONE_APP_DEFAULTS_PREPARED',
  'Business Office',
  'PASS',
  jsonb_build_object(
    'generic_quote_customer', true,
    'complete_office_modules_enabled', true,
    'google_records_imported', false,
    'external_actions_enabled', false
  ),
  false
from public.businesses b
where b.business_key = 'highway38';
