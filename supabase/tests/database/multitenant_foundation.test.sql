-- Runs only against an isolated Supabase branch or local database.
-- All fixtures are rolled back.

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

select pg_temp.assert_true(
  (select count(*) = 9
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in (
       'businesses','profiles','business_memberships','business_invitations',
       'business_modules','approval_requests','proof_log','error_log',
       'external_action_queue'
     )
     and c.relkind = 'r'),
  'all nine foundation tables must exist'
);

select pg_temp.assert_true(
  (select count(*) = 9
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in (
       'businesses','profiles','business_memberships','business_invitations',
       'business_modules','approval_requests','proof_log','error_log',
       'external_action_queue'
     )
     and c.relrowsecurity),
  'RLS must be enabled on every foundation table'
);

select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.businesses', 'select')
  and not has_table_privilege('anon', 'public.external_action_queue', 'select'),
  'anonymous access must remain revoked'
);

-- Deterministic branch-only fixtures. Foreign-key triggers are bypassed only in
-- this rolled-back transaction; no Auth users or customer records are created.
set local session_replication_role = replica;

insert into public.businesses (id, business_key, legal_name, display_name, status)
values
  ('10000000-0000-0000-0000-000000000001', 'h38-test-a', 'H38 Test A LLC', 'H38 Test A', 'active'),
  ('10000000-0000-0000-0000-000000000002', 'h38-test-b', 'H38 Test B LLC', 'H38 Test B', 'active');

insert into public.business_memberships (business_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'viewer', 'active'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'staff', 'active'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'owner', 'active');

insert into public.business_modules (id, business_id, module_key, enabled)
values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'a-module', false),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'b-module', false);

insert into public.approval_requests (
  id, business_id, action_type, record_type, record_id, status, requested_by
)
values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'send_quote', 'quote', '50000000-0000-0000-0000-000000000001',
  'pending', '20000000-0000-0000-0000-000000000004'
);

set local session_replication_role = origin;

-- Business A owner: can see only A and cannot alter B.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select pg_temp.assert_true((select count(*) = 1 from public.businesses), 'owner sees only own business');
select pg_temp.assert_true((select count(*) = 1 from public.business_modules), 'owner sees only own modules');

select pg_temp.assert_true(
  (with changed as (
    update public.business_modules set enabled = true
    where id = '60000000-0000-0000-0000-000000000002'
    returning 1
  ) select count(*) = 0 from changed),
  'owner cannot update another business module'
);

select pg_temp.assert_true(
  (with changed as (
    update public.business_modules set enabled = true
    where id = '60000000-0000-0000-0000-000000000001'
    returning 1
  ) select count(*) = 1 from changed),
  'owner can update own business module'
);

reset role;

-- Viewer: read access only.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select pg_temp.assert_true(
  (with changed as (
    update public.business_modules set enabled = false
    where id = '60000000-0000-0000-0000-000000000001'
    returning 1
  ) select count(*) = 0 from changed),
  'viewer cannot change module configuration'
);

reset role;

-- Staff: may draft an external action but cannot approve it.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.external_action_queue (
  id, business_id, action_type, record_type, record_id, status, created_by
)
values (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'send_quote', 'quote', '50000000-0000-0000-0000-000000000001',
  'draft', '20000000-0000-0000-0000-000000000004'
);

select pg_temp.assert_true(
  (with changed as (
    update public.approval_requests
    set status = 'approved',
        decided_by = '20000000-0000-0000-0000-000000000004',
        decided_at = now()
    where id = '30000000-0000-0000-0000-000000000001'
    returning 1
  ) select count(*) = 0 from changed),
  'staff cannot approve an external action'
);

reset role;

-- Owner: can link the matching pending request, decide it once, and advance the
-- inert row to approved. Browser RLS still blocks execution.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select pg_temp.assert_true(
  (with changed as (
    update public.external_action_queue
    set status = 'pending_owner_approval',
        approval_request_id = '30000000-0000-0000-0000-000000000001'
    where id = '40000000-0000-0000-0000-000000000001'
    returning 1
  ) select count(*) = 1 from changed),
  'owner can link the matching pending approval'
);

select pg_temp.assert_true(
  (with changed as (
    update public.approval_requests
    set status = 'approved',
        decided_by = '20000000-0000-0000-0000-000000000001',
        decided_at = now()
    where id = '30000000-0000-0000-0000-000000000001'
    returning 1
  ) select count(*) = 1 from changed),
  'owner can approve the matching request'
);

select pg_temp.assert_true(
  (with changed as (
    update public.external_action_queue
    set status = 'approved'
    where id = '40000000-0000-0000-0000-000000000001'
    returning 1
  ) select count(*) = 1 from changed),
  'owner can mark the inert action approved after the matching decision'
);

select pg_temp.assert_true(
  (with changed as (
    update public.external_action_queue
    set status = 'executing'
    where id = '40000000-0000-0000-0000-000000000001'
    returning 1
  ) select count(*) = 0 from changed),
  'browser role cannot execute an external action'
);

select pg_temp.assert_true(
  (with changed as (
    update public.approval_requests
    set status = 'rejected',
        decided_by = '20000000-0000-0000-0000-000000000001',
        decided_at = now()
    where id = '30000000-0000-0000-0000-000000000001'
    returning 1
  ) select count(*) = 0 from changed),
  'an approval decision cannot be changed after it is final'
);

reset role;
rollback;
