-- Run only against an isolated Supabase branch or local database.
-- Every Auth, business, membership, module, and Proof Log fixture is rolled back.

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'Business Office Auth acceptance failed: %', message;
  end if;
end
$$;

select pg_temp.assert_true(
  to_regprocedure('public.business_office_auth_state()') is not null,
  'canonical Auth state resolver must exist'
);
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.business_office_auth_state()', 'execute'),
  'anonymous users cannot execute the Auth resolver'
);
select pg_temp.assert_true(
  has_function_privilege('authenticated', 'public.business_office_auth_state()', 'execute'),
  'authenticated users can execute the Auth resolver'
);
select pg_temp.assert_true(
  not (
    select procedure.prosecdef
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'business_office_auth_state'
  ),
  'public Auth resolver remains SECURITY INVOKER'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('21000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'multi@example.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('21000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'suspended@example.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('21000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'revoked@example.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('21000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'other@example.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('21000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'none@example.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

insert into public.businesses (id, business_key, legal_name, display_name, status)
values
  ('11000000-0000-0000-0000-000000000001', 'auth-test-a', 'Auth Test A LLC', 'Auth Test A', 'active'),
  ('11000000-0000-0000-0000-000000000002', 'auth-test-b', 'Auth Test B LLC', 'Auth Test B', 'active'),
  ('11000000-0000-0000-0000-000000000003', 'auth-test-c', 'Auth Test C LLC', 'Auth Test C', 'active');

-- User already exists before this invitation, so the resolver must safely claim it.
insert into public.business_memberships (
  id, business_id, auth_user_id, invited_email, role, status
)
values
  ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', null, 'MULTI@example.test', 'owner', 'invited'),
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000001', 'multi@example.test', 'administrator', 'active'),
  ('31000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002', 'suspended@example.test', 'staff', 'suspended'),
  ('31000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000003', 'revoked@example.test', 'viewer', 'revoked'),
  ('31000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000004', 'other@example.test', 'owner', 'active');

insert into public.business_module_settings (business_id, module_key, enabled, config)
values
  ('11000000-0000-0000-0000-000000000001', 'today', true, '{}'::jsonb),
  ('11000000-0000-0000-0000-000000000001', 'quotes', true, '{"ownerReviewRequired":true}'::jsonb),
  ('11000000-0000-0000-0000-000000000002', 'today', true, '{}'::jsonb),
  ('11000000-0000-0000-0000-000000000003', 'today', true, '{}'::jsonb);

select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.email', 'multi@example.test', true);
select set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000001","role":"authenticated","email":"multi@example.test"}', true);
set local role authenticated;

do $$
declare
  auth_state jsonb := public.business_office_auth_state();
begin
  perform pg_temp.assert_true(auth_state ->> 'status' = 'PASS', 'resolver returns PASS');
  perform pg_temp.assert_true((auth_state ->> 'claimedInviteCount')::integer = 1, 'exact-email invitation is claimed once');
  perform pg_temp.assert_true((auth_state ->> 'activeMembershipCount')::integer = 2, 'two active businesses resolve');
  perform pg_temp.assert_true((auth_state ->> 'canSwitchBusinesses')::boolean, 'multi-business selector is enabled');
  perform pg_temp.assert_true(jsonb_array_length(auth_state -> 'memberships') = 2, 'another user business is excluded');
  perform pg_temp.assert_true(
    jsonb_path_exists(auth_state, '$.memberships[*] ? (@.businessKey == "auth-test-a" && @.role == "owner" && @.membershipStatus == "active")'),
    'claimed owner membership is active'
  );
  perform pg_temp.assert_true(
    jsonb_path_exists(auth_state, '$.memberships[*] ? (@.businessKey == "auth-test-b" && @.role == "administrator")'),
    'second active membership and role resolve'
  );
  perform pg_temp.assert_true(
    jsonb_path_exists(auth_state, '$.memberships[*].modules[*] ? (@.moduleKey == "quotes" && @.enabled == true)'),
    'module settings remain canonical'
  );
end
$$;

select pg_temp.assert_true(
  (select count(*) = 2 from public.businesses),
  'RLS exposes only the signed-in user active businesses'
);
select pg_temp.assert_true(
  exists (
    select 1
    from public.business_proof_log
    where action_type = 'membership_invite_claimed'
      and entity_id = '31000000-0000-0000-0000-000000000001'
      and external_action_occurred = false
  ),
  'invite claim is recorded without an external action'
);

reset role;

select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000002","role":"authenticated","email":"suspended@example.test"}', true);
set local role authenticated;
select pg_temp.assert_true(
  (public.business_office_auth_state() ->> 'activeMembershipCount')::integer = 0
  and jsonb_path_exists(public.business_office_auth_state(), '$.memberships[*] ? (@.membershipStatus == "suspended")'),
  'suspended membership is visible as denied and not active'
);
reset role;

select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000003","role":"authenticated","email":"revoked@example.test"}', true);
set local role authenticated;
select pg_temp.assert_true(
  (public.business_office_auth_state() ->> 'activeMembershipCount')::integer = 0
  and jsonb_path_exists(public.business_office_auth_state(), '$.memberships[*] ? (@.membershipStatus == "revoked")'),
  'revoked membership is visible as denied and not active'
);
reset role;

select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000005","role":"authenticated","email":"none@example.test"}', true);
set local role authenticated;
select pg_temp.assert_true(
  (public.business_office_auth_state() ->> 'activeMembershipCount')::integer = 0
  and jsonb_array_length(public.business_office_auth_state() -> 'memberships') = 0,
  'no-membership state opens no tenant'
);
reset role;

rollback;
