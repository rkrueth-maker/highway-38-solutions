-- Controlled multi-tenant installer for the Supabase Business Office.
-- Supabase remains the system of record. Provisioning never imports Google data,
-- enables an external action, activates a client automatically, or changes Apps Script.

create table if not exists public.business_onboarding_runs (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  package_id text not null
    check (package_id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  owner_email text not null,
  status text not null default 'provisioning'
    check (status in ('provisioning', 'ready', 'invited', 'active', 'suspended', 'closed')),
  requested_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(requested_config) = 'object')
    check (not (requested_config ?| array['access_token', 'refresh_token', 'client_secret', 'service_role_key', 'password'])),
  requested_by uuid not null references auth.users(id) on delete restrict,
  invitation_requested_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.business_onboarding_runs is
  'Non-secret client tenant provisioning state. External invitation delivery is separately owner-triggered and Proof Logged.';

create or replace function private.platform_owner_access(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.business_memberships membership
    join public.businesses business on business.id = membership.business_id
    where business.business_key = 'highway38'
      and business.status = 'active'
      and membership.auth_user_id = p_user_id
      and membership.role = 'owner'
      and membership.status = 'active'
  )
$$;

create or replace function private.touch_business_onboarding_run()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if new.business_id <> old.business_id
     or new.package_id <> old.package_id
     or new.requested_by <> old.requested_by then
    raise exception 'Business onboarding identity is immutable';
  end if;
  new.updated_at := now();
  return new;
end
$$;

revoke all on function private.platform_owner_access(uuid) from public;
revoke all on function private.platform_owner_access(uuid) from anon;
grant execute on function private.platform_owner_access(uuid) to authenticated;
revoke all on function private.touch_business_onboarding_run() from public;
revoke all on function private.touch_business_onboarding_run() from anon;
revoke all on function private.touch_business_onboarding_run() from authenticated;

drop trigger if exists business_onboarding_runs_touch on public.business_onboarding_runs;
create trigger business_onboarding_runs_touch
before update on public.business_onboarding_runs
for each row execute function private.touch_business_onboarding_run();

alter table public.business_onboarding_runs enable row level security;

drop policy if exists "platform owners manage onboarding runs" on public.business_onboarding_runs;
create policy "platform owners manage onboarding runs"
on public.business_onboarding_runs for all
to authenticated
using ((select private.platform_owner_access(auth.uid())))
with check ((select private.platform_owner_access(auth.uid())));

drop policy if exists "business administrators read onboarding state" on public.business_onboarding_runs;
create policy "business administrators read onboarding state"
on public.business_onboarding_runs for select
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])));

revoke all on table public.business_onboarding_runs from anon;
grant select on table public.business_onboarding_runs to authenticated;

create or replace function private.provision_client_business_internal(
  p_actor_user_id uuid,
  p_business_key text,
  p_legal_name text,
  p_display_name text,
  p_owner_email text,
  p_timezone text,
  p_brand_config jsonb,
  p_module_keys text[],
  p_package_id text,
  p_support_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  v_business_id uuid;
  v_business_status text;
  v_actor_email text;
  v_owner_email text := lower(btrim(coalesce(p_owner_email, '')));
  v_support_email text := nullif(lower(btrim(coalesce(p_support_email, ''))), '');
  v_owner_membership_id uuid;
  v_support_membership_id uuid;
  v_invited_support_membership_id uuid;
  v_required_modules text[] := array[
    'today', 'customers', 'jobs', 'tasks', 'quotes', 'measure', 'schedule',
    'communications', 'field', 'daily-logs', 'checklists', 'time',
    'inventory', 'fleet', 'money', 'documents', 'social', 'ai', 'settings',
    'people', 'accounting', 'payroll-prep', 'tax-prep', 'controls', 'reports',
    'storage-providers'
  ];
  v_modules text[];
begin
  if p_actor_user_id is null or not private.platform_owner_access(p_actor_user_id) then
    raise exception 'Highway 38 Owner authorization is required.';
  end if;

  if p_business_key is null
     or p_business_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
     or p_business_key = 'highway38' then
    raise exception 'Client business key is invalid.';
  end if;
  if nullif(btrim(coalesce(p_display_name, '')), '') is null then
    raise exception 'Client display name is required.';
  end if;
  if v_owner_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Client owner email is invalid.';
  end if;
  if p_package_id is null or p_package_id !~ '^[a-z0-9][a-z0-9-]{1,79}$' then
    raise exception 'Client package ID is invalid.';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Client timezone is invalid.';
  end if;
  if coalesce(jsonb_typeof(p_brand_config), '') <> 'object' then
    raise exception 'Brand configuration must be an object.';
  end if;

  select array_agg(distinct module_key order by module_key)
    into v_modules
    from unnest(coalesce(p_module_keys, v_required_modules)) module_key;
  if coalesce(array_length(v_modules, 1), 0) = 0
     or exists (select 1 from unnest(v_modules) module_key where module_key !~ '^[a-z0-9][a-z0-9-]{1,79}$') then
    raise exception 'Client module configuration is invalid.';
  end if;
  if exists (
    select 1
    from unnest(array['today','customers','jobs','tasks','quotes','schedule','field','documents','settings']) required_key
    where not required_key = any(v_modules)
  ) then
    raise exception 'Required week-one Business Office modules are missing.';
  end if;

  select lower(btrim(email)) into v_actor_email
  from auth.users where id = p_actor_user_id;
  if v_actor_email is null then
    raise exception 'Installer account email is unavailable.';
  end if;

  select id, status into v_business_id, v_business_status
  from public.businesses
  where business_key = p_business_key
  for update;

  if v_business_id is null then
    insert into public.businesses (
      business_key, legal_name, display_name, status, timezone, brand_config, module_config
    ) values (
      p_business_key,
      nullif(btrim(coalesce(p_legal_name, '')), ''),
      btrim(p_display_name),
      'provisioning',
      p_timezone,
      coalesce(p_brand_config, '{}'::jsonb) || jsonb_build_object(
        'currency', coalesce(p_brand_config ->> 'currency', 'USD'),
        'sourcePack', p_package_id,
        'systemOfRecord', 'supabase'
      ),
      jsonb_build_object(
        'systemOfRecord', 'supabase',
        'packageId', p_package_id,
        'closedBeta', true,
        'externalActionsEnabled', false,
        'productionMigrationEnabled', false,
        'automaticCustomerSending', false,
        'automaticSocialPublishing', false,
        'automaticFinancialActions', false,
        'googleRecordImportEnabled', false,
        'googleRollbackPreserved', true,
        'storageProvider', 'supabase'
      )
    ) returning id, status into v_business_id, v_business_status;
  elsif v_business_status = 'closed' then
    raise exception 'Closed client businesses cannot be reprovisioned.';
  else
    update public.businesses
       set legal_name = nullif(btrim(coalesce(p_legal_name, legal_name, '')), ''),
           display_name = btrim(p_display_name),
           timezone = p_timezone,
           brand_config = coalesce(p_brand_config, '{}'::jsonb) || jsonb_build_object(
             'currency', coalesce(p_brand_config ->> 'currency', 'USD'),
             'sourcePack', p_package_id,
             'systemOfRecord', 'supabase'
           ),
           module_config = module_config || jsonb_build_object(
             'systemOfRecord', 'supabase',
             'packageId', p_package_id,
             'closedBeta', true,
             'externalActionsEnabled', false,
             'productionMigrationEnabled', false,
             'automaticCustomerSending', false,
             'automaticSocialPublishing', false,
             'automaticFinancialActions', false,
             'googleRecordImportEnabled', false,
             'googleRollbackPreserved', true,
             'storageProvider', 'supabase'
           ),
           updated_at = now()
     where id = v_business_id;
  end if;

  insert into public.business_module_settings (business_id, module_key, enabled, config)
  select v_business_id, module_key, true, '{}'::jsonb
  from unnest(v_modules) module_key
  on conflict (business_id, module_key) do update
    set enabled = true, updated_at = now();

  if v_business_status = 'provisioning' then
    update public.business_module_settings
       set enabled = false, updated_at = now()
     where business_id = v_business_id
       and not (module_key = any(v_modules));
  end if;

  insert into public.business_storage_settings (
    business_id, provider, connection_status, config, connected_by, connected_at
  ) values (
    v_business_id,
    'supabase',
    'connected',
    jsonb_build_object(
      'bucket', 'business-office-files',
      'client_google_drive_supported', true,
      'oauth_secrets_in_browser', false
    ),
    p_actor_user_id,
    now()
  ) on conflict (business_id) do update
    set provider = case
          when public.business_storage_settings.provider = 'google_drive'
               and public.business_storage_settings.connection_status = 'connected'
            then 'google_drive'
          else 'supabase'
        end,
        connection_status = case
          when public.business_storage_settings.provider = 'google_drive'
               and public.business_storage_settings.connection_status = 'connected'
            then 'connected'
          else 'connected'
        end,
        config = public.business_storage_settings.config || excluded.config,
        updated_at = now();

  select id into v_owner_membership_id
  from public.business_memberships
  where business_id = v_business_id
    and lower(btrim(invited_email)) = v_owner_email
    and status <> 'revoked'
  order by created_at
  limit 1;

  if v_owner_membership_id is null then
    insert into public.business_memberships (
      business_id, auth_user_id, invited_email, role, status, invited_by
    ) values (
      v_business_id, null, v_owner_email, 'owner', 'invited', p_actor_user_id
    ) returning id into v_owner_membership_id;
  else
    update public.business_memberships
       set role = 'owner',
           status = case when auth_user_id is null then 'invited' else 'active' end,
           invited_by = p_actor_user_id,
           updated_at = now()
     where id = v_owner_membership_id;
  end if;

  if v_actor_email <> v_owner_email then
    select id into v_support_membership_id
    from public.business_memberships
    where business_id = v_business_id
      and (
        auth_user_id = p_actor_user_id
        or lower(btrim(invited_email)) = v_actor_email
      )
      and status <> 'revoked'
    order by created_at
    limit 1;

    if v_support_membership_id is null then
      insert into public.business_memberships (
        business_id, auth_user_id, invited_email, role, status, invited_by, accepted_at
      ) values (
        v_business_id, p_actor_user_id, v_actor_email, 'administrator', 'active', p_actor_user_id, now()
      ) returning id into v_support_membership_id;
    else
      update public.business_memberships
         set auth_user_id = p_actor_user_id,
             role = 'administrator',
             status = 'active',
             invited_by = p_actor_user_id,
             accepted_at = coalesce(accepted_at, now()),
             updated_at = now()
       where id = v_support_membership_id;
    end if;
  end if;

  if v_support_email is not null
     and v_support_email <> v_owner_email
     and v_support_email <> v_actor_email then
    select id into v_invited_support_membership_id
    from public.business_memberships
    where business_id = v_business_id
      and lower(btrim(invited_email)) = v_support_email
      and status <> 'revoked'
    order by created_at
    limit 1;

    if v_invited_support_membership_id is null then
      insert into public.business_memberships (
        business_id, auth_user_id, invited_email, role, status, invited_by
      ) values (
        v_business_id, null, v_support_email, 'administrator', 'invited', p_actor_user_id
      ) returning id into v_invited_support_membership_id;
    end if;
  end if;

  insert into public.business_records (
    business_id, collection, record_key, payload, created_by, updated_by
  ) values
  (
    v_business_id,
    'customers',
    'GENERIC-QUOTE-CUSTOMER',
    jsonb_build_object(
      'Customer ID', 'GENERIC-QUOTE-CUSTOMER',
      'Business ID', v_business_id::text,
      'Customer Name', 'Generic Quote Customer',
      'Email', '',
      'Phone', '',
      'Status', 'Active',
      'Internal Only', true,
      'Created Time', now(),
      'Updated Time', now(),
      'Record Version', 1
    ),
    p_actor_user_id,
    p_actor_user_id
  ),
  (
    v_business_id,
    'businessProfiles',
    'PRIMARY-BUSINESS-PROFILE',
    jsonb_build_object(
      'Business Profile ID', 'PRIMARY-BUSINESS-PROFILE',
      'Business ID', v_business_id::text,
      'Business Key', p_business_key,
      'Legal Name', p_legal_name,
      'Display Name', p_display_name,
      'Owner Email', v_owner_email,
      'Timezone', p_timezone,
      'Package ID', p_package_id,
      'System of Record', 'Supabase',
      'Storage Provider', 'Supabase private storage',
      'External Actions Enabled', false,
      'Google Records Imported', false,
      'Created Time', now(),
      'Updated Time', now(),
      'Record Version', 1
    ),
    p_actor_user_id,
    p_actor_user_id
  ),
  (
    v_business_id,
    'checklists',
    'CLIENT-ONBOARDING-CHECKLIST',
    jsonb_build_object(
      'Checklist ID', 'CLIENT-ONBOARDING-CHECKLIST',
      'Business ID', v_business_id::text,
      'Title', 'Client Business Office onboarding',
      'Status', 'Open',
      'Items', jsonb_build_array(
        jsonb_build_object('text', 'Owner activates the Supabase invitation', 'complete', false),
        jsonb_build_object('text', 'Owner signs in on Android and Chromebook', 'complete', false),
        jsonb_build_object('text', 'Invite one real staff user', 'complete', false),
        jsonb_build_object('text', 'Review Price Book and tax settings', 'complete', false),
        jsonb_build_object('text', 'Create one customer, job and assigned task', 'complete', false),
        jsonb_build_object('text', 'Capture one field photo and daily log', 'complete', false),
        jsonb_build_object('text', 'Build one owner-reviewed quote and invoice draft', 'complete', false),
        jsonb_build_object('text', 'Verify sign-out and tenant isolation', 'complete', false)
      ),
      'Created By', p_actor_user_id::text,
      'Created Time', now(),
      'Updated Time', now(),
      'Record Version', 1
    ),
    p_actor_user_id,
    p_actor_user_id
  ),
  (
    v_business_id,
    'supportAccess',
    'H38-CUSTOMER-VISIBLE-SUPPORT',
    jsonb_build_object(
      'Support Access ID', 'H38-CUSTOMER-VISIBLE-SUPPORT',
      'Business ID', v_business_id::text,
      'Provider', 'Highway 38 Solutions',
      'Implementation User ID', p_actor_user_id::text,
      'Implementation Email', v_actor_email,
      'Additional Support Email', coalesce(v_support_email, ''),
      'Customer Visible', true,
      'Revocable', true,
      'Audit Required', true,
      'Status', 'Active during closed beta',
      'Created Time', now(),
      'Updated Time', now(),
      'Record Version', 1
    ),
    p_actor_user_id,
    p_actor_user_id
  )
  on conflict (business_id, collection, record_key) do update
    set payload = excluded.payload,
        record_status = 'active',
        updated_at = now();

  insert into public.business_onboarding_runs (
    business_id, package_id, owner_email, status, requested_config, requested_by
  ) values (
    v_business_id,
    p_package_id,
    v_owner_email,
    case when v_business_status = 'active' then 'active' else 'ready' end,
    jsonb_build_object(
      'moduleKeys', to_jsonb(v_modules),
      'storageProvider', 'supabase',
      'supportEmail', coalesce(v_support_email, ''),
      'googleDataImported', false,
      'externalActionsEnabled', false
    ),
    p_actor_user_id
  ) on conflict (business_id) do update
    set owner_email = excluded.owner_email,
        status = case
          when public.business_onboarding_runs.status = 'active' then 'active'
          else 'ready'
        end,
        requested_config = excluded.requested_config,
        updated_at = now();

  insert into public.business_proof_log (
    business_id, actor_user_id, action_type, entity_type, entity_id,
    result, details, external_action_occurred
  ) values (
    v_business_id,
    p_actor_user_id,
    'CLIENT_TENANT_PROVISIONED',
    'Business',
    v_business_id,
    'PASS',
    jsonb_build_object(
      'businessKey', p_business_key,
      'packageId', p_package_id,
      'ownerEmail', v_owner_email,
      'ownerInvitationCreated', true,
      'supportAccessCreated', v_support_membership_id is not null,
      'storageProvider', 'supabase',
      'googleDataImported', false,
      'appsScriptChanged', false,
      'automaticActivation', false,
      'externalActionsEnabled', false
    ),
    false
  );

  return jsonb_build_object(
    'status', 'PASS',
    'businessId', v_business_id,
    'businessKey', p_business_key,
    'businessStatus', (select status from public.businesses where id = v_business_id),
    'onboardingStatus', (select status from public.business_onboarding_runs where business_id = v_business_id),
    'ownerMembershipId', v_owner_membership_id,
    'supportMembershipId', v_support_membership_id,
    'moduleCount', cardinality(v_modules),
    'storageProvider', 'supabase',
    'externalActionOccurred', false
  );
end
$$;

create or replace function public.provision_client_business(
  p_business_key text,
  p_legal_name text,
  p_display_name text,
  p_owner_email text,
  p_timezone text default 'America/Chicago',
  p_brand_config jsonb default '{}'::jsonb,
  p_module_keys text[] default null,
  p_package_id text default 'standard-business-office',
  p_support_email text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, auth, public, private
as $$
begin
  return private.provision_client_business_internal(
    auth.uid(), p_business_key, p_legal_name, p_display_name, p_owner_email,
    p_timezone, p_brand_config, p_module_keys, p_package_id, p_support_email
  );
end
$$;

create or replace function private.activate_client_business_internal(
  p_actor_user_id uuid,
  p_business_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  v_business_key text;
  v_status text;
  v_required_module_count integer;
begin
  if p_actor_user_id is null or not private.platform_owner_access(p_actor_user_id) then
    raise exception 'Highway 38 Owner authorization is required.';
  end if;

  select business_key, status into v_business_key, v_status
  from public.businesses
  where id = p_business_id
  for update;

  if v_business_key is null or v_business_key = 'highway38' then
    raise exception 'Client business is invalid.';
  end if;
  if v_status = 'closed' then
    raise exception 'Closed client businesses cannot be activated.';
  end if;
  if not exists (
    select 1 from public.business_memberships
    where business_id = p_business_id and role = 'owner' and status in ('invited', 'active')
  ) then
    raise exception 'Client owner invitation is missing.';
  end if;
  if not exists (
    select 1 from public.business_storage_settings
    where business_id = p_business_id and connection_status = 'connected'
  ) then
    raise exception 'Client storage is not connected.';
  end if;
  if not exists (
    select 1 from public.business_records
    where business_id = p_business_id
      and collection = 'customers'
      and record_key = 'GENERIC-QUOTE-CUSTOMER'
      and record_status = 'active'
  ) then
    raise exception 'Generic Quote Customer is missing.';
  end if;

  select count(*) into v_required_module_count
  from public.business_module_settings
  where business_id = p_business_id
    and enabled
    and module_key = any(array['today','customers','jobs','tasks','quotes','schedule','field','documents','settings']);
  if v_required_module_count <> 9 then
    raise exception 'Required client modules are incomplete.';
  end if;

  update public.businesses
     set status = 'active',
         module_config = module_config || jsonb_build_object(
           'closedBeta', true,
           'externalActionsEnabled', false,
           'automaticCustomerSending', false,
           'automaticSocialPublishing', false,
           'automaticFinancialActions', false
         ),
         updated_at = now()
   where id = p_business_id;

  update public.business_onboarding_runs
     set status = 'active',
         activated_at = coalesce(activated_at, now()),
         suspended_at = null,
         updated_at = now()
   where business_id = p_business_id;

  insert into public.business_proof_log (
    business_id, actor_user_id, action_type, entity_type, entity_id,
    result, details, external_action_occurred
  ) values (
    p_business_id,
    p_actor_user_id,
    'CLIENT_TENANT_ACTIVATED',
    'Business',
    p_business_id,
    'PASS',
    jsonb_build_object(
      'businessKey', v_business_key,
      'closedBeta', true,
      'ownerInvitationPresent', true,
      'storageConnected', true,
      'requiredModules', 9,
      'googleDataImported', false,
      'appsScriptChanged', false,
      'externalActionsEnabled', false
    ),
    false
  );

  return jsonb_build_object(
    'status', 'PASS',
    'businessId', p_business_id,
    'businessKey', v_business_key,
    'businessStatus', 'active',
    'onboardingStatus', 'active',
    'externalActionOccurred', false
  );
end
$$;

create or replace function public.activate_client_business(p_business_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, auth, public, private
as $$
begin
  return private.activate_client_business_internal(auth.uid(), p_business_id);
end
$$;

create or replace function public.suspend_client_business(
  p_business_id uuid,
  p_reason text default 'Owner suspended closed beta access.'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_business_key text;
begin
  if v_actor is null or not private.platform_owner_access(v_actor) then
    raise exception 'Highway 38 Owner authorization is required.';
  end if;
  select business_key into v_business_key from public.businesses where id = p_business_id for update;
  if v_business_key is null or v_business_key = 'highway38' then
    raise exception 'Client business is invalid.';
  end if;

  update public.businesses set status = 'suspended', updated_at = now() where id = p_business_id;
  update public.business_onboarding_runs
     set status = 'suspended', suspended_at = now(), updated_at = now()
   where business_id = p_business_id;

  insert into public.business_proof_log (
    business_id, actor_user_id, action_type, entity_type, entity_id,
    result, details, external_action_occurred
  ) values (
    p_business_id, v_actor, 'CLIENT_TENANT_SUSPENDED', 'Business', p_business_id,
    'PASS', jsonb_build_object('businessKey', v_business_key, 'reason', left(coalesce(p_reason, ''), 500)), false
  );

  return jsonb_build_object(
    'status', 'PASS', 'businessId', p_business_id, 'businessKey', v_business_key,
    'businessStatus', 'suspended', 'externalActionOccurred', false
  );
end
$$;

create or replace function public.client_tenant_installer_state()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_rows jsonb;
begin
  if v_actor is null or not private.platform_owner_access(v_actor) then
    raise exception 'Highway 38 Owner authorization is required.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'businessId', business.id,
      'businessKey', business.business_key,
      'displayName', business.display_name,
      'legalName', business.legal_name,
      'businessStatus', business.status,
      'timezone', business.timezone,
      'packageId', onboarding.package_id,
      'onboardingStatus', onboarding.status,
      'ownerEmail', onboarding.owner_email,
      'ownerMembershipStatus', owner_membership.status,
      'ownerAuthUserId', owner_membership.auth_user_id,
      'storageProvider', storage.provider,
      'storageConnectionStatus', storage.connection_status,
      'enabledModuleCount', modules.enabled_count,
      'recordCount', records.record_count,
      'invitationRequestedAt', onboarding.invitation_requested_at,
      'activatedAt', onboarding.activated_at,
      'externalActionsEnabled', false,
      'googleDataImported', false
    ) order by business.display_name
  ), '[]'::jsonb)
  into v_rows
  from public.businesses business
  join public.business_onboarding_runs onboarding on onboarding.business_id = business.id
  left join lateral (
    select membership.status, membership.auth_user_id
    from public.business_memberships membership
    where membership.business_id = business.id and membership.role = 'owner' and membership.status <> 'revoked'
    order by membership.created_at
    limit 1
  ) owner_membership on true
  left join public.business_storage_settings storage on storage.business_id = business.id
  left join lateral (
    select count(*) filter (where enabled)::integer as enabled_count
    from public.business_module_settings setting where setting.business_id = business.id
  ) modules on true
  left join lateral (
    select count(*)::integer as record_count
    from public.business_records record where record.business_id = business.id and record.record_status = 'active'
  ) records on true
  where business.business_key <> 'highway38';

  return jsonb_build_object(
    'status', 'PASS',
    'serverTime', now(),
    'businesses', v_rows,
    'safeguards', jsonb_build_object(
      'systemOfRecord', 'supabase',
      'externalActionsEnabled', false,
      'googleDataImported', false,
      'automaticActivation', false,
      'appsScriptChanged', false
    )
  );
end
$$;

revoke all on function private.provision_client_business_internal(uuid,text,text,text,text,text,jsonb,text[],text,text) from public;
revoke all on function private.provision_client_business_internal(uuid,text,text,text,text,text,jsonb,text[],text,text) from anon;
revoke all on function private.provision_client_business_internal(uuid,text,text,text,text,text,jsonb,text[],text,text) from authenticated;
revoke all on function private.activate_client_business_internal(uuid,uuid) from public;
revoke all on function private.activate_client_business_internal(uuid,uuid) from anon;
revoke all on function private.activate_client_business_internal(uuid,uuid) from authenticated;

revoke all on function public.provision_client_business(text,text,text,text,text,jsonb,text[],text,text) from public;
revoke all on function public.provision_client_business(text,text,text,text,text,jsonb,text[],text,text) from anon;
grant execute on function public.provision_client_business(text,text,text,text,text,jsonb,text[],text,text) to authenticated;
revoke all on function public.activate_client_business(uuid) from public;
revoke all on function public.activate_client_business(uuid) from anon;
grant execute on function public.activate_client_business(uuid) to authenticated;
revoke all on function public.suspend_client_business(uuid,text) from public;
revoke all on function public.suspend_client_business(uuid,text) from anon;
grant execute on function public.suspend_client_business(uuid,text) to authenticated;
revoke all on function public.client_tenant_installer_state() from public;
revoke all on function public.client_tenant_installer_state() from anon;
grant execute on function public.client_tenant_installer_state() to authenticated;
