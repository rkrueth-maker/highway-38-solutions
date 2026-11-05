-- 30-day free full trial for the H38 Office (Rick's pick, 2026-11-05).
--
-- Self-serve trial tenants:
--   * public.business_trials is the trial registry (server-stamped start/end).
--   * public.provision_trial_business mirrors the client tenant installer and
--     copies the fleet-converged standard from the highway38 tenant itself
--     (55 module rows, 49 ON / 6 OFF, and the standard FeatureToggles object),
--     so a trial tenant is the standard package, never a divergent template.
--     It is callable only by the service role (the h38-trial-signup edge
--     function), never by anon/authenticated.
--   * public.my_trial_state lets the Office show the days-left banner.
--   * public.request_keep_office records the tenant's upgrade intent as an
--     owner task in the Highway 38 tenant (no checkout; H38 Stripe is parked).
--   * Expired trials become READ-ONLY, enforced server-side by triggers on
--     business_records and business_module_settings: writes arriving with a
--     user JWT (authenticated/anon) are refused once trial_end passes and the
--     trial has not converted. Service-role and direct SQL paths are not
--     blocked, so platform operations, exports and cleanup keep working.
--     Reads and the one-click export are untouched. No data is deleted.
--   * client_tenant_installer_state() gains trial fields so the platform
--     owner's tenant list shows a trial badge and days left.
-- Existing tenants are untouched: every rule keys off a business_trials row,
-- which only trial signups create.

create table if not exists public.business_trials (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete restrict,
  email text not null,
  owner_name text not null default '',
  trial_start timestamptz not null default now(),
  trial_end timestamptz not null,
  status text not null default 'active'
    check (status in ('active', 'converted', 'closed')),
  keep_office_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_trials_email_unique
  on public.business_trials (lower(email));

comment on table public.business_trials is
  'Self-serve 30-day trial registry. trial_end is server-stamped at provisioning; expiry is computed from trial_end everywhere (status only tracks conversion/closure).';

alter table public.business_trials enable row level security;

drop policy if exists "platform owners read trials" on public.business_trials;
create policy "platform owners read trials"
on public.business_trials for select
to authenticated
using ((select private.platform_owner_access(auth.uid())));

revoke all on table public.business_trials from anon;
grant select on table public.business_trials to authenticated;

-- ---------------------------------------------------------------------------
-- Trial expiry helper (single source of truth for "this tenant is read-only")
-- ---------------------------------------------------------------------------

create or replace function private.trial_read_only(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.business_trials trial
    where trial.business_id = p_business_id
      and trial.status <> 'converted'
      and trial.trial_end <= now()
  )
$$;

revoke all on function private.trial_read_only(uuid) from public;
revoke all on function private.trial_read_only(uuid) from anon;
revoke all on function private.trial_read_only(uuid) from authenticated;
grant execute on function private.trial_read_only(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Trial provisioning (service role only; called by h38-trial-signup)
-- ---------------------------------------------------------------------------

create or replace function public.provision_trial_business(
  p_auth_user_id uuid,
  p_business_key text,
  p_business_name text,
  p_owner_name text,
  p_owner_email text,
  p_timezone text default 'America/Chicago'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  v_template_id uuid;
  v_business_id uuid;
  v_owner_email text := lower(btrim(coalesce(p_owner_email, '')));
  v_toggles jsonb;
  v_trial_start timestamptz := now();
  v_trial_end timestamptz := now() + interval '30 days';
begin
  if p_auth_user_id is null then
    raise exception 'TRIAL_USER_REQUIRED';
  end if;
  if p_business_key is null
     or p_business_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
     or p_business_key = 'highway38' then
    raise exception 'TRIAL_BUSINESS_KEY_INVALID';
  end if;
  if nullif(btrim(coalesce(p_business_name, '')), '') is null then
    raise exception 'TRIAL_BUSINESS_NAME_REQUIRED';
  end if;
  if v_owner_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'TRIAL_EMAIL_INVALID';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'TRIAL_TIMEZONE_INVALID';
  end if;
  if exists (select 1 from public.businesses where business_key = p_business_key) then
    raise exception 'TRIAL_BUSINESS_KEY_TAKEN';
  end if;
  if exists (select 1 from public.business_trials where lower(email) = v_owner_email) then
    raise exception 'TRIAL_EMAIL_EXISTS';
  end if;
  if exists (
    select 1 from public.business_trials trial
    join public.business_memberships membership
      on membership.business_id = trial.business_id
    where membership.auth_user_id = p_auth_user_id
  ) then
    raise exception 'TRIAL_USER_EXISTS';
  end if;

  select id into v_template_id
  from public.businesses
  where business_key = 'highway38';
  if v_template_id is null then
    raise exception 'TRIAL_TEMPLATE_MISSING';
  end if;

  insert into public.businesses (
    business_key, legal_name, display_name, status, timezone, brand_config, module_config
  ) values (
    p_business_key,
    btrim(p_business_name),
    btrim(p_business_name),
    'active',
    p_timezone,
    jsonb_build_object(
      'currency', 'USD',
      'sourcePack', 'trial-30day',
      'systemOfRecord', 'supabase',
      'trial', true
    ),
    jsonb_build_object(
      'systemOfRecord', 'supabase',
      'packageId', 'trial-30day',
      'closedBeta', false,
      'externalActionsEnabled', false,
      'productionMigrationEnabled', false,
      'automaticCustomerSending', false,
      'automaticSocialPublishing', false,
      'automaticFinancialActions', false,
      'googleRecordImportEnabled', false,
      'googleRollbackPreserved', true,
      'storageProvider', 'supabase'
    )
  ) returning id into v_business_id;

  -- The fleet-converged standard, copied from the template tenant itself:
  -- every module row with its enabled flag exactly as the fleet runs it.
  insert into public.business_module_settings (business_id, module_key, enabled, config)
  select v_business_id, module_key, enabled, config
  from public.business_module_settings
  where business_id = v_template_id
  on conflict (business_id, module_key) do nothing;

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
    p_auth_user_id,
    now()
  ) on conflict (business_id) do nothing;

  insert into public.business_memberships (
    business_id, auth_user_id, invited_email, role, status, invited_by, accepted_at
  ) values (
    v_business_id, p_auth_user_id, v_owner_email, 'owner', 'active', p_auth_user_id, now()
  );

  insert into public.business_onboarding_runs (
    business_id, package_id, owner_email, status, requested_config, requested_by, activated_at
  ) values (
    v_business_id,
    'trial-30day',
    v_owner_email,
    'active',
    jsonb_build_object('source', 'self-serve-trial-signup'),
    p_auth_user_id,
    now()
  );

  -- Standard FeatureToggles object, copied from the template tenant.
  select payload -> 'Toggles' into v_toggles
  from public.business_records
  where business_id = v_template_id
    and collection = 'FeatureToggles'
  order by created_at
  limit 1;

  insert into public.business_records (
    business_id, collection, record_key, payload, created_by, updated_by
  ) values
  (
    v_business_id,
    'businessProfiles',
    'PRIMARY-BUSINESS-PROFILE',
    jsonb_build_object(
      'Business Profile ID', 'PRIMARY-BUSINESS-PROFILE',
      'Business ID', v_business_id::text,
      'Business Key', p_business_key,
      'Legal Name', btrim(p_business_name),
      'Display Name', btrim(p_business_name),
      'Owner Name', coalesce(nullif(btrim(p_owner_name), ''), ''),
      'Owner Email', v_owner_email,
      'Timezone', p_timezone,
      'Package ID', 'trial-30day',
      'System of Record', 'Supabase',
      'Storage Provider', 'Supabase private storage',
      'External Actions Enabled', false,
      'Google Records Imported', false,
      'Trial', true,
      'Trial Start', v_trial_start,
      'Trial End', v_trial_end,
      'Created Time', now(),
      'Updated Time', now(),
      'Record Version', 1
    ),
    p_auth_user_id,
    p_auth_user_id
  ),
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
    p_auth_user_id,
    p_auth_user_id
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
      'Created By', p_auth_user_id::text,
      'Created Time', now(),
      'Updated Time', now(),
      'Record Version', 1
    ),
    p_auth_user_id,
    p_auth_user_id
  ),
  (
    v_business_id,
    'FeatureToggles',
    v_business_id::text,
    jsonb_build_object(
      'Business ID', v_business_id::text,
      'Toggles', coalesce(v_toggles, '{}'::jsonb),
      'Updated Time', now(),
      'Record Version', 1
    ),
    p_auth_user_id,
    p_auth_user_id
  );

  insert into public.business_trials (
    business_id, email, owner_name, trial_start, trial_end, status
  ) values (
    v_business_id, v_owner_email, coalesce(btrim(p_owner_name), ''), v_trial_start, v_trial_end, 'active'
  );

  return jsonb_build_object(
    'status', 'PASS',
    'businessId', v_business_id,
    'businessKey', p_business_key,
    'trialStart', v_trial_start,
    'trialEnd', v_trial_end
  );
end
$$;

revoke all on function public.provision_trial_business(uuid, text, text, text, text, text) from public;
revoke all on function public.provision_trial_business(uuid, text, text, text, text, text) from anon;
revoke all on function public.provision_trial_business(uuid, text, text, text, text, text) from authenticated;
grant execute on function public.provision_trial_business(uuid, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- App-facing trial state (drives the days-left banner + client read-only UX)
-- ---------------------------------------------------------------------------

create or replace function public.my_trial_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_row record;
begin
  if v_user is null then
    return jsonb_build_object('isTrial', false);
  end if;

  select trial.business_id, business.business_key, business.display_name,
         trial.trial_start, trial.trial_end, trial.status,
         trial.keep_office_requested_at
    into v_row
  from public.business_trials trial
  join public.businesses business on business.id = trial.business_id
  join public.business_memberships membership
    on membership.business_id = trial.business_id
   and membership.auth_user_id = v_user
   and membership.status = 'active'
   and membership.role in ('owner', 'administrator')
  order by trial.trial_start desc
  limit 1;

  if not found then
    return jsonb_build_object('isTrial', false);
  end if;

  return jsonb_build_object(
    'isTrial', true,
    'businessId', v_row.business_id,
    'businessKey', v_row.business_key,
    'displayName', v_row.display_name,
    'trialStart', v_row.trial_start,
    'trialEnd', v_row.trial_end,
    'daysLeft', greatest(0, ceil(extract(epoch from (v_row.trial_end - now())) / 86400.0))::integer,
    'expired', v_row.status <> 'converted' and v_row.trial_end <= now(),
    'converted', v_row.status = 'converted',
    'keepOfficeRequestedAt', v_row.keep_office_requested_at
  );
end
$$;

revoke all on function public.my_trial_state() from public;
revoke all on function public.my_trial_state() from anon;
grant execute on function public.my_trial_state() to authenticated;

-- ---------------------------------------------------------------------------
-- Keep the Office: record upgrade intent + notify the platform owner with a
-- task in the Highway 38 tenant (the existing owner-visible channel).
-- ---------------------------------------------------------------------------

create or replace function public.request_keep_office()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_trial record;
  v_h38_id uuid;
  v_task_key text;
  v_now timestamptz := now();
begin
  if v_user is null then
    raise exception 'Authentication is required.';
  end if;

  select trial.business_id, trial.email, trial.trial_end,
         business.business_key, business.display_name
    into v_trial
  from public.business_trials trial
  join public.businesses business on business.id = trial.business_id
  join public.business_memberships membership
    on membership.business_id = trial.business_id
   and membership.auth_user_id = v_user
   and membership.status = 'active'
   and membership.role in ('owner', 'administrator')
  order by trial.trial_start desc
  limit 1;

  if not found then
    raise exception 'No trial Office is attached to this account.';
  end if;

  update public.business_trials
     set keep_office_requested_at = coalesce(keep_office_requested_at, v_now),
         updated_at = v_now
   where business_id = v_trial.business_id;

  select id into v_h38_id from public.businesses where business_key = 'highway38';
  v_task_key := 'TRIAL-KEEP-' || upper(v_trial.business_key);

  if v_h38_id is not null then
    insert into public.business_records (
      business_id, collection, record_key, payload, created_by, updated_by
    ) values (
      v_h38_id,
      'tasks',
      v_task_key,
      jsonb_build_object(
        'Task ID', v_task_key,
        'Task Title', 'Keep the Office — trial wants to stay: ' || v_trial.display_name,
        'Task Type', 'Trial Upgrade',
        'Task Domain', 'trial.upgrade',
        'Status', 'Open',
        'Priority', 'High',
        'Assigned Role', 'Owner',
        'Assigned User ID', '',
        'Business ID', v_h38_id::text,
        'Customer ID', '',
        'Linked Record ID', v_trial.business_id::text,
        'Linked Record Type', 'Trial Business',
        'Source Record ID', v_trial.business_id::text,
        'Source Actor User ID', v_user::text,
        'Instructions', 'Trial business "' || v_trial.display_name || '" (' || v_trial.business_key || ') asked to Keep the Office. Contact: ' || v_trial.email || '. Trial ends ' || to_char(v_trial.trial_end, 'YYYY-MM-DD') || '. Set up their subscription with them (founding $99/mo locked for life while spots last, standard $149/mo).',
        'Source Event', 'trial.keep_office',
        'Auto Managed', true,
        'External Action Occurred', false,
        'Created Time', v_now,
        'Updated Time', v_now,
        'Record Version', 1
      ),
      v_user,
      v_user
    )
    on conflict (business_id, collection, record_key) do nothing;
  end if;

  return jsonb_build_object(
    'status', 'PASS',
    'businessId', v_trial.business_id,
    'keepOfficeRequestedAt', coalesce(
      (select keep_office_requested_at from public.business_trials where business_id = v_trial.business_id),
      v_now
    )
  );
end
$$;

revoke all on function public.request_keep_office() from public;
revoke all on function public.request_keep_office() from anon;
grant execute on function public.request_keep_office() to authenticated;

-- ---------------------------------------------------------------------------
-- Read-only enforcement for expired trial tenants (server-side).
-- Only user-JWT writes are refused; service role and direct SQL keep working
-- so exports, platform operations and cleanup are never trapped.
-- ---------------------------------------------------------------------------

create or replace function private.block_expired_trial_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  v_business_id uuid := coalesce(new.business_id, old.business_id);
  v_role text := coalesce(auth.role(), '');
begin
  if v_role in ('authenticated', 'anon') and private.trial_read_only(v_business_id) then
    raise exception 'TRIAL_READ_ONLY: Trial ended — this Office is read-only. Your data is here and exportable free; choose Keep the Office to pick up where you left off.'
      using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke all on function private.block_expired_trial_write() from public;
revoke all on function private.block_expired_trial_write() from anon;
revoke all on function private.block_expired_trial_write() from authenticated;

drop trigger if exists business_records_trial_read_only on public.business_records;
create trigger business_records_trial_read_only
before insert or update or delete on public.business_records
for each row execute function private.block_expired_trial_write();

drop trigger if exists business_module_settings_trial_read_only on public.business_module_settings;
create trigger business_module_settings_trial_read_only
before insert or update or delete on public.business_module_settings
for each row execute function private.block_expired_trial_write();

-- ---------------------------------------------------------------------------
-- Platform owner tenant list: add trial badge fields.
-- (Same body as the installer state function, plus a business_trials join.)
-- ---------------------------------------------------------------------------

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
      'googleDataImported', false,
      'isTrial', trial.business_id is not null,
      'trialStart', trial.trial_start,
      'trialEnd', trial.trial_end,
      'trialDaysLeft', case
        when trial.business_id is null then null
        when trial.trial_end <= now() then 0
        else ceil(extract(epoch from (trial.trial_end - now())) / 86400.0)::integer
      end,
      'trialExpired', case
        when trial.business_id is null then false
        else trial.status <> 'converted' and trial.trial_end <= now()
      end,
      'trialStatus', trial.status,
      'keepOfficeRequestedAt', trial.keep_office_requested_at
    ) order by business.display_name
  ), '[]'::jsonb)
  into v_rows
  from public.businesses business
  join public.business_onboarding_runs onboarding on onboarding.business_id = business.id
  left join public.business_trials trial on trial.business_id = business.id
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

revoke all on function public.client_tenant_installer_state() from public;
revoke all on function public.client_tenant_installer_state() from anon;
grant execute on function public.client_tenant_installer_state() to authenticated;
