-- Supabase is the only supported Business Office runtime.
-- Remove legacy Office fallback metadata from every business and record the retirement.
-- This does not import data or execute any customer-facing external action.

update public.businesses
set module_config = (coalesce(module_config, '{}'::jsonb) - 'legacyGoogleOffice') || jsonb_build_object(
      'systemOfRecord', 'supabase',
      'legacyOfficeEnabled', false,
      'legacyOfficeFallback', false,
      'externalActionsEnabled', false
    ),
    updated_at = now()
where coalesce(module_config ->> 'legacyOfficeEnabled', 'true') <> 'false'
   or coalesce(module_config ->> 'legacyOfficeFallback', 'true') <> 'false'
   or module_config ? 'legacyGoogleOffice';

insert into public.business_proof_log (
  business_id,
  actor_user_id,
  action_type,
  entity_type,
  entity_id,
  result,
  details,
  external_action_occurred
)
select
  business.id,
  null,
  'LEGACY_OFFICE_DISABLED',
  'Business Office',
  business.id,
  'PASS',
  jsonb_build_object(
    'businessKey', business.business_key,
    'supportedRuntime', 'supabase',
    'legacyOfficeEnabled', false,
    'legacyOfficeFallback', false,
    'publicLegacyRouteRemoved', true,
    'googleDataImported', false,
    'externalActionsEnabled', false
  ),
  false
from public.businesses business
where business.business_key in ('highway38', 'northern-lakes')
  and not exists (
    select 1
    from public.business_proof_log proof
    where proof.business_id = business.id
      and proof.action_type = 'LEGACY_OFFICE_DISABLED'
  );
