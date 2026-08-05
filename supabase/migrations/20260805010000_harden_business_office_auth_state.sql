-- Preserve denied membership states without weakening tenant RLS.
-- The public RPC remains SECURITY INVOKER. A private SECURITY DEFINER helper
-- is callable only by authenticated users and always filters by auth.uid().

begin;

create or replace function private.current_business_office_auth_state()
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

  current_email := nullif(lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), '');
  if current_email is null then
    select nullif(lower(btrim(coalesce(account.email, ''))), '')
      into current_email
      from auth.users account
     where account.id = current_user_id;
  end if;

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

revoke all on function private.current_business_office_auth_state() from public;
revoke all on function private.current_business_office_auth_state() from anon;
grant execute on function private.current_business_office_auth_state() to authenticated;
grant execute on function private.current_business_office_auth_state() to service_role;

create or replace function public.business_office_auth_state()
returns jsonb
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$
  select private.current_business_office_auth_state()
$$;

revoke all on function public.business_office_auth_state() from public;
revoke all on function public.business_office_auth_state() from anon;
grant execute on function public.business_office_auth_state() to authenticated;
grant execute on function public.business_office_auth_state() to service_role;

comment on function public.business_office_auth_state() is
  'Invoker-scoped wrapper around a private auth.uid()-filtered resolver. No tenant identifier is accepted from the browser.';

commit;
