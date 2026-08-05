-- Add Supabase Auth and active-business resolution to the canonical Business Office foundation.
-- This migration reuses businesses, business_memberships, business_module_settings,
-- Proof Log, and the existing private.business_access(...) authorization boundary.
-- It does not migrate business records, activate Northern Lakes, or execute an external action.

begin;

create schema if not exists private;

do $$
begin
  if to_regclass('public.businesses') is null
     or to_regclass('public.business_memberships') is null
     or to_regclass('public.business_module_settings') is null
     or to_regclass('public.business_proof_log') is null then
    raise exception 'Canonical Business Office Auth foundation is missing; refusing to create a second identity system.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'business_memberships'
      and column_name = 'auth_user_id'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'business_memberships'
      and column_name = 'invited_email'
  ) then
    raise exception 'Canonical membership invitation boundary is incompatible.';
  end if;
end
$$;

create or replace function private.claim_current_business_invites()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  claimed_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  current_email := nullif(lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), '');
  if current_email is null then
    select nullif(lower(btrim(coalesce(account.email, ''))), '')
      into current_email
      from auth.users account
     where account.id = current_user_id;
  end if;

  if current_email is null then
    return 0;
  end if;

  with claimed as (
    update public.business_memberships membership
       set auth_user_id = current_user_id,
           status = 'active',
           accepted_at = coalesce(membership.accepted_at, now()),
           updated_at = now()
     where membership.auth_user_id is null
       and membership.status = 'invited'
       and lower(btrim(membership.invited_email)) = current_email
       and not exists (
         select 1
           from public.business_memberships existing
          where existing.business_id = membership.business_id
            and existing.auth_user_id = current_user_id
            and existing.status <> 'revoked'
       )
    returning membership.id, membership.business_id, membership.role
  ), logged as (
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
      claimed.business_id,
      current_user_id,
      'membership_invite_claimed',
      'business_membership',
      claimed.id,
      'PASS',
      jsonb_build_object(
        'role', claimed.role,
        'source', 'supabase_auth',
        'automatic_external_action', false
      ),
      false
    from claimed
    returning id
  )
  select count(*)::integer into claimed_count from logged;

  return claimed_count;
end
$$;

revoke all on function private.claim_current_business_invites() from public;
revoke all on function private.claim_current_business_invites() from anon;
revoke all on function private.claim_current_business_invites() from authenticated;

create or replace function public.business_office_auth_state()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  claimed_count integer := 0;
  membership_rows jsonb := '[]'::jsonb;
  active_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select nullif(lower(btrim(coalesce(account.email, ''))), '')
    into current_email
    from auth.users account
   where account.id = current_user_id;

  claimed_count := private.claim_current_business_invites();

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'membershipId', membership.id,
          'businessId', business.id,
          'businessKey', business.business_key,
          'businessName', business.display_name,
          'businessStatus', business.status,
          'timezone', business.timezone,
          'brandConfig', business.brand_config,
          'businessModuleConfig', business.module_config,
          'role', membership.role,
          'membershipStatus', membership.status,
          'acceptedAt', membership.accepted_at,
          'modules', coalesce(modules.module_rows, '[]'::jsonb)
        )
        order by business.display_name, business.id
      ),
      '[]'::jsonb
    ),
    count(*) filter (
      where membership.status = 'active'
        and business.status = 'active'
    )::integer
  into membership_rows, active_count
  from public.business_memberships membership
  join public.businesses business
    on business.id = membership.business_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'moduleKey', setting.module_key,
        'enabled', setting.enabled,
        'config', setting.config
      )
      order by setting.module_key
    ) as module_rows
    from public.business_module_settings setting
    where setting.business_id = business.id
  ) modules on true
  where membership.auth_user_id = current_user_id;

  return jsonb_build_object(
    'status', 'PASS',
    'serverTime', now(),
    'user', jsonb_build_object(
      'id', current_user_id,
      'email', current_email
    ),
    'claimedInviteCount', claimed_count,
    'activeMembershipCount', active_count,
    'canSwitchBusinesses', active_count > 1,
    'memberships', membership_rows,
    'safeguards', jsonb_build_object(
      'externalActionsEnabled', false,
      'productionMigrationEnabled', false,
      'automaticCustomerSending', false,
      'automaticSocialPublishing', false,
      'automaticFinancialActions', false,
      'northernLakesEnabled', false
    )
  );
end
$$;

revoke all on function public.business_office_auth_state() from public;
revoke all on function public.business_office_auth_state() from anon;
grant execute on function public.business_office_auth_state() to authenticated;
grant execute on function public.business_office_auth_state() to service_role;

comment on function public.business_office_auth_state() is
  'Returns only the signed-in user canonical Business Office memberships and safely claims exact-email pending invitations.';

commit;
