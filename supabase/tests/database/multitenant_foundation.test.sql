-- Run only against an isolated Supabase branch or local database.
-- All deterministic fixtures are rolled back.

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'multitenant acceptance failed: %', message;
  end if;
end
$$;

create or replace function pg_temp.assert_affected(
  command text,
  expected_count bigint,
  message text
)
returns void
language plpgsql
as $$
declare
  affected_count bigint;
begin
  execute command;
  get diagnostics affected_count = row_count;
  if affected_count <> expected_count then
    raise exception 'multitenant acceptance failed: % (expected %, got %)',
      message, expected_count, affected_count;
  end if;
end
$$;

select pg_temp.assert_true(
  (select count(*) = 9
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in (
       'businesses',
       'business_memberships',
       'business_module_settings',
       'business_approvals',
       'business_proof_log',
       'business_error_log',
       'price_book_items',
       'quote_items',
       'external_action_queue'
     )
     and c.relkind = 'r'),
  'canonical foundation and external action queue must exist'
);

select pg_temp.assert_true(
  (select count(*) = 9
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in (
       'businesses',
       'business_memberships',
       'business_module_settings',
       'business_approvals',
       'business_proof_log',
       'business_error_log',
       'price_book_items',
       'quote_items',
       'external_action_queue'
     )
     and c.relrowsecurity),
  'RLS must be enabled on every tenant-owned foundation table'
);

select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.external_action_queue', 'select'),
  'anonymous users cannot read the external action queue'
);

set local session_replication_role = replica;

insert into public.businesses (id, business_key, legal_name, display_name, status)
values
  ('10000000-0000-0000-0000-000000000001', 'h38-test-a', 'H38 Test A LLC', 'H38 Test A', 'active'),
  ('10000000-0000-0000-0000-000000000002', 'h38-test-b', 'H38 Test B LLC', 'H38 Test B', 'active');

insert into public.business_memberships (
  business_id, auth_user_id, invited_email, role, status
)
values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'owner-a@example.test', 'owner', 'active'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'viewer-a@example.test', 'viewer', 'active'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'staff-a@example.test', 'staff', 'active'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'admin-a@example.test', 'administrator', 'active'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'owner-b@example.test', 'owner', 'active');

insert into public.business_module_settings (business_id, module_key, enabled)
values
  ('10000000-0000-0000-0000-000000000001', 'a-module', false),
  ('10000000-0000-0000-0000-000000000002', 'b-module', false);

insert into public.business_approvals (
  id, business_id, entity_type, entity_id, action_type, status, requested_by
)
values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'quote',
  '50000000-0000-0000-0000-000000000001',
  'send_quote',
  'pending',
  '20000000-0000-0000-0000-000000000004'
);

set local session_replication_role = origin;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select pg_temp.assert_true((select count(*) = 1 from public.businesses), 'owner sees only own business');
select pg_temp.assert_true((select count(*) = 1 from public.business_module_settings), 'owner sees only own module settings');
select pg_temp.assert_affected(
  $$update public.business_module_settings set enabled = true
    where business_id = '10000000-0000-0000-0000-000000000002'
      and module_key = 'b-module'$$,
  0,
  'owner cannot update another business module'
);
select pg_temp.assert_affected(
  $$update public.business_module_settings set enabled = true
    where business_id = '10000000-0000-0000-0000-000000000001'
      and module_key = 'a-module'$$,
  1,
  'owner can update own module setting'
);

reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select pg_temp.assert_affected(
  $$update public.business_module_settings set enabled = false
    where business_id = '10000000-0000-0000-0000-000000000001'
      and module_key = 'a-module'$$,
  0,
  'viewer cannot change module settings'
);

reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.external_action_queue (
  id, business_id, action_type, entity_type, entity_id, status, created_by
)
values (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'send_quote',
  'quote',
  '50000000-0000-0000-0000-000000000001',
  'draft',
  '20000000-0000-0000-0000-000000000004'
);

select pg_temp.assert_affected(
  $$update public.business_approvals
    set status = 'approved',
        reviewed_by = '20000000-0000-0000-0000-000000000004',
        reviewed_at = now()
    where id = '30000000-0000-0000-0000-000000000001'$$,
  0,
  'staff cannot approve an action'
);

reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select pg_temp.assert_affected(
  $$update public.external_action_queue
    set status = 'pending_owner_approval',
        approval_id = '30000000-0000-0000-0000-000000000001'
    where id = '40000000-0000-0000-0000-000000000001'$$,
  1,
  'owner can link the matching pending approval'
);
select pg_temp.assert_affected(
  $$update public.business_approvals
    set status = 'approved',
        reviewed_by = '20000000-0000-0000-0000-000000000001',
        reviewed_at = now()
    where id = '30000000-0000-0000-0000-000000000001'$$,
  1,
  'owner can review the pending request'
);

reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select pg_temp.assert_affected(
  $$update public.business_approvals
    set external_action_allowed = true
    where id = '30000000-0000-0000-0000-000000000001'$$,
  0,
  'administrator cannot grant external-action authorization'
);

reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select pg_temp.assert_affected(
  $$update public.business_approvals
    set external_action_allowed = true
    where id = '30000000-0000-0000-0000-000000000001'$$,
  1,
  'owner can grant the separate external-action authorization'
);
select pg_temp.assert_affected(
  $$update public.external_action_queue
    set status = 'approved'
    where id = '40000000-0000-0000-0000-000000000001'$$,
  1,
  'owner can prepare the inert action after explicit authorization'
);
select pg_temp.assert_affected(
  $$update public.external_action_queue
    set status = 'executing'
    where id = '40000000-0000-0000-0000-000000000001'$$,
  0,
  'browser role cannot execute an external action'
);
select pg_temp.assert_affected(
  $$update public.business_approvals
    set status = 'rejected'
    where id = '30000000-0000-0000-0000-000000000001'$$,
  0,
  'final approval and Owner gate are immutable'
);

reset role;
rollback;
