\set ON_ERROR_STOP on

create temp table installer_acceptance (
  test_name text primary key,
  passed boolean not null,
  detail text not null
);

insert into installer_acceptance
select 'northern_lakes_provisioned',
       count(*)=1,
       'Northern Lakes exists exactly once after seed migration'
from public.businesses where business_key='northern-lakes';

insert into installer_acceptance
select 'provisioning_not_automatic_activation',
       status='provisioning',
       'Seed leaves Northern Lakes in provisioning state'
from public.businesses where business_key='northern-lakes';

insert into installer_acceptance
select 'onboarding_ready',
       status='ready' and owner_email='northernlakesproperty@gmail.com',
       'Onboarding is ready with the exact owner email'
from public.business_onboarding_runs
where business_id=(select id from public.businesses where business_key='northern-lakes');

insert into installer_acceptance
select 'owner_invitation_prepared',
       count(*)=1,
       'Owner membership is prepared but not automatically claimed'
from public.business_memberships
where business_id=(select id from public.businesses where business_key='northern-lakes')
  and role='owner'
  and status='invited'
  and auth_user_id is null
  and lower(invited_email)='northernlakesproperty@gmail.com';

insert into installer_acceptance
select 'platform_support_visible',
       count(*)=1,
       'Highway 38 Owner has one visible active Administrator support membership'
from public.business_memberships
where business_id=(select id from public.businesses where business_key='northern-lakes')
  and auth_user_id='11111111-1111-4111-8111-111111111111'
  and role='administrator'
  and status='active';

insert into installer_acceptance
select 'additional_support_invited',
       count(*)=1,
       'Additional customer-visible support is invited, not silently activated'
from public.business_memberships
where business_id=(select id from public.businesses where business_key='northern-lakes')
  and lower(invited_email)='mandakw55@gmail.com'
  and role='administrator'
  and status='invited'
  and auth_user_id is null;

insert into installer_acceptance
select 'all_modules_enabled',
       count(*)=26,
       'All approved week-one modules are enabled'
from public.business_module_settings
where business_id=(select id from public.businesses where business_key='northern-lakes')
  and enabled;

insert into installer_acceptance
select 'supabase_private_storage_default',
       provider='supabase' and connection_status='connected',
       'Supabase private storage is the default provider'
from public.business_storage_settings
where business_id=(select id from public.businesses where business_key='northern-lakes');

insert into installer_acceptance
select 'generic_quote_customer_seeded',
       count(*)=1,
       'Generic Quote Customer exists exactly once'
from public.business_records
where business_id=(select id from public.businesses where business_key='northern-lakes')
  and collection='customers'
  and record_key='GENERIC-QUOTE-CUSTOMER'
  and payload->>'Customer Name'='Generic Quote Customer';

insert into installer_acceptance
select 'support_record_customer_visible',
       count(*)=1,
       'Support access is explicit, visible, revocable and auditable'
from public.business_records
where business_id=(select id from public.businesses where business_key='northern-lakes')
  and collection='supportAccess'
  and record_key='H38-CUSTOMER-VISIBLE-SUPPORT'
  and (payload->>'Customer Visible')::boolean
  and (payload->>'Revocable')::boolean
  and (payload->>'Audit Required')::boolean;

insert into installer_acceptance
select 'proof_logs_no_provisioning_external_action',
       count(*)=0,
       'Provisioning and seeding do not claim an external action'
from public.business_proof_log
where business_id=(select id from public.businesses where business_key='northern-lakes')
  and action_type in ('CLIENT_TENANT_PROVISIONED','NORTHERN_LAKES_CLOSED_BETA_PROVISIONED')
  and external_action_occurred=true;

insert into installer_acceptance
select 'external_queue_empty',
       count(*)=0,
       'No external action queue item is created'
from public.external_action_queue
where business_id=(select id from public.businesses where business_key='northern-lakes');

insert into installer_acceptance
select 'google_import_disabled',
       coalesce((module_config->>'googleRecordImportEnabled')::boolean,false)=false
       and coalesce((module_config->>'externalActionsEnabled')::boolean,false)=false,
       'Google record import and external actions remain disabled'
from public.businesses where business_key='northern-lakes';

-- Non-owner cannot invoke provisioning.
insert into auth.users (
  id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,
  created_at,updated_at,is_sso_user,is_anonymous
) values (
  '22222222-2222-4222-8222-222222222222','authenticated','authenticated',
  'installer-outsider@example.invalid',now(),'{}','{}',now(),now(),false,false
) on conflict (id) do nothing;

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
set role authenticated;
do $$
begin
  begin
    perform public.provision_client_business(
      'unauthorized-client','Unauthorized Client LLC','Unauthorized Client',
      'owner@example.invalid','America/Chicago','{}'::jsonb,null,
      'standard-business-office',null
    );
    insert into installer_acceptance values (
      'non_owner_provision_denied',false,'Non-owner unexpectedly provisioned a tenant'
    );
  exception when others then
    insert into installer_acceptance values (
      'non_owner_provision_denied',true,'Non-owner provisioning denied'
    );
  end;
end $$;
reset role;

-- Highway 38 Owner can read installer state and activate the prepared tenant.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
set role authenticated;
insert into installer_acceptance
select 'installer_state_owner_only',
       (public.client_tenant_installer_state()->>'status')='PASS',
       'Highway 38 Owner can read installer state';

select public.activate_client_business((select id from public.businesses where business_key='northern-lakes'));
insert into installer_acceptance
select 'explicit_activation_passed',
       status='active',
       'Explicit Owner activation changes business to active'
from public.businesses where business_key='northern-lakes';

insert into installer_acceptance
select 'activation_proof_safe',
       count(*)=1,
       'Activation is Proof Logged without an external action'
from public.business_proof_log
where business_id=(select id from public.businesses where business_key='northern-lakes')
  and action_type='CLIENT_TENANT_ACTIVATED'
  and external_action_occurred=false;

select public.suspend_client_business(
  (select id from public.businesses where business_key='northern-lakes'),
  'Disposable database acceptance suspension.'
);
insert into installer_acceptance
select 'explicit_suspension_passed',
       status='suspended',
       'Online business status becomes suspended'
from public.businesses where business_key='northern-lakes';

insert into installer_acceptance
select 'suspension_proof_safe',
       count(*)=1,
       'Suspension is Proof Logged without an external action'
from public.business_proof_log
where business_id=(select id from public.businesses where business_key='northern-lakes')
  and action_type='CLIENT_TENANT_SUSPENDED'
  and external_action_occurred=false;
reset role;

-- Anonymous access remains denied.
set role anon;
do $$
begin
  begin
    perform public.client_tenant_installer_state();
    insert into installer_acceptance values (
      'anonymous_installer_denied',false,'Anonymous role unexpectedly opened installer state'
    );
  exception when others then
    insert into installer_acceptance values (
      'anonymous_installer_denied',true,'Anonymous installer access denied'
    );
  end;
end $$;
reset role;

select jsonb_pretty(jsonb_build_object(
  'status',case when bool_and(passed) then 'PASS' else 'FAIL' end,
  'passed',count(*) filter(where passed),
  'total',count(*),
  'failures',coalesce(jsonb_agg(jsonb_build_object('test',test_name,'detail',detail)) filter(where not passed),'[]'::jsonb)
)) as installer_acceptance
from installer_acceptance;

do $$
begin
  if exists(select 1 from installer_acceptance where not passed) then
    raise exception 'Client tenant installer database acceptance failed.';
  end if;
end $$;
