-- CI-only fixture used to replay historical H38 migrations that depended on
-- a production owner account already existing. This file is never deployed.

do $$
declare
  v_business_id uuid;
  v_user_id constant uuid := 'f3800000-0000-0000-0000-000000000001';
begin
  select id into v_business_id
  from public.businesses
  where business_key = 'highway38'
  limit 1;

  if v_business_id is null then
    raise exception 'CI replay fixture requires the Highway 38 business row';
  end if;

  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_user_id,
    'authenticated',
    'authenticated',
    'ci-platform-owner@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ) on conflict (id) do nothing;

  if not exists (
    select 1 from public.business_memberships
    where business_id = v_business_id
      and auth_user_id = v_user_id
      and role = 'owner'
      and status = 'active'
  ) then
    insert into public.business_memberships (
      business_id, auth_user_id, invited_email, role, status, accepted_at
    ) values (
      v_business_id,
      v_user_id,
      'ci-platform-owner@example.test',
      'owner',
      'active',
      now()
    );
  end if;
end
$$;
