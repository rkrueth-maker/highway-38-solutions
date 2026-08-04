-- Highway 38 Business Office multitenant foundation.
-- Schema-only: no production records are migrated, deleted, approved, sent,
-- published, charged, or otherwise acted on by this migration.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  business_key text not null unique,
  legal_name text not null,
  display_name text not null,
  status text not null default 'provisioning'
    check (status in ('provisioning', 'active', 'suspended', 'archived')),
  timezone text not null default 'America/Chicago',
  branding jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  source_system text not null default 'supabase',
  legacy_business_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'administrator', 'staff', 'viewer')),
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'revoked')),
  invited_by uuid references auth.users(id),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists business_memberships_user_idx
  on public.business_memberships (user_id, status);
create index if not exists business_memberships_business_idx
  on public.business_memberships (business_id, status);

create table if not exists public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'administrator', 'staff', 'viewer')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_invitations_pending_email_idx
  on public.business_invitations (business_id, lower(email))
  where status = 'pending';

create table if not exists public.business_modules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, module_key)
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  action_type text not null,
  record_type text not null,
  record_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  requested_by uuid not null references auth.users(id),
  decided_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz,
  constraint approval_decision_consistency check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or
    (status in ('approved', 'rejected') and decided_by is not null and decided_at is not null)
    or
    (status in ('cancelled', 'expired') and decided_at is not null)
  )
);

create index if not exists approval_requests_business_status_idx
  on public.approval_requests (business_id, status, requested_at desc);

create table if not exists public.proof_log (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  event_type text not null,
  record_type text,
  record_id uuid,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists proof_log_business_created_idx
  on public.proof_log (business_id, created_at desc);

create table if not exists public.error_log (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  source text not null,
  severity text not null default 'error'
    check (severity in ('info', 'warning', 'error', 'critical')),
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists error_log_business_created_idx
  on public.error_log (business_id, created_at desc);

create table if not exists public.external_action_queue (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  action_type text not null,
  record_type text not null,
  record_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'pending_owner_approval', 'approved', 'executing', 'completed', 'failed', 'cancelled')),
  approval_request_id uuid references public.approval_requests(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_action_requires_approval check (
    (status = 'draft' and approval_request_id is null)
    or status = 'cancelled'
    or (status in ('pending_owner_approval', 'approved', 'executing', 'completed', 'failed')
        and approval_request_id is not null)
  )
);

create unique index if not exists external_action_queue_approval_once_idx
  on public.external_action_queue (approval_request_id)
  where approval_request_id is not null;

comment on table public.external_action_queue is
  'External actions are inert records. Browser users cannot execute them; service execution must re-check an approved, matching owner decision.';

create or replace function private.membership_role(target_business_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select bm.role
  from public.business_memberships bm
  where bm.business_id = target_business_id
    and bm.user_id = auth.uid()
    and bm.status = 'active'
  limit 1
$$;

create or replace function private.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.membership_role(target_business_id) is not null
$$;

create or replace function private.has_business_role(
  target_business_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(private.membership_role(target_business_id) = any(allowed_roles), false)
$$;

create or replace function private.approval_matches_external_action(
  target_business_id uuid,
  target_approval_id uuid,
  target_action_type text,
  target_record_type text,
  target_record_id uuid,
  required_status text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.approval_requests ar
    where ar.id = target_approval_id
      and ar.business_id = target_business_id
      and ar.action_type = target_action_type
      and ar.record_type = target_record_type
      and ar.record_id is not distinct from target_record_id
      and ar.status = required_status
  )
$$;

revoke all on function private.membership_role(uuid) from public;
revoke all on function private.is_business_member(uuid) from public;
revoke all on function private.has_business_role(uuid, text[]) from public;
revoke all on function private.approval_matches_external_action(uuid, uuid, text, text, uuid, text) from public;

grant usage on schema private to authenticated;
grant execute on function private.membership_role(uuid) to authenticated;
grant execute on function private.is_business_member(uuid) to authenticated;
grant execute on function private.has_business_role(uuid, text[]) to authenticated;
grant execute on function private.approval_matches_external_action(uuid, uuid, text, text, uuid, text) to authenticated;

alter table public.businesses enable row level security;
alter table public.profiles enable row level security;
alter table public.business_memberships enable row level security;
alter table public.business_invitations enable row level security;
alter table public.business_modules enable row level security;
alter table public.approval_requests enable row level security;
alter table public.proof_log enable row level security;
alter table public.error_log enable row level security;
alter table public.external_action_queue enable row level security;

create policy businesses_select_member
on public.businesses for select
to authenticated
using (private.is_business_member(id));

create policy businesses_update_admin
on public.businesses for update
to authenticated
using (private.has_business_role(id, array['owner','administrator']))
with check (private.has_business_role(id, array['owner','administrator']));

create policy profiles_select_self
on public.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy profiles_insert_self
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy profiles_update_self
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy memberships_select_business
on public.business_memberships for select
to authenticated
using (private.is_business_member(business_id));

create policy memberships_insert_owner_admin
on public.business_memberships for insert
to authenticated
with check (private.has_business_role(business_id, array['owner','administrator']));

create policy memberships_update_owner_admin
on public.business_memberships for update
to authenticated
using (private.has_business_role(business_id, array['owner','administrator']))
with check (private.has_business_role(business_id, array['owner','administrator']));

create policy invitations_select_owner_admin
on public.business_invitations for select
to authenticated
using (private.has_business_role(business_id, array['owner','administrator']));

create policy invitations_insert_owner_admin
on public.business_invitations for insert
to authenticated
with check (
  invited_by = (select auth.uid())
  and private.has_business_role(business_id, array['owner','administrator'])
);

create policy invitations_update_owner_admin
on public.business_invitations for update
to authenticated
using (private.has_business_role(business_id, array['owner','administrator']))
with check (private.has_business_role(business_id, array['owner','administrator']));

create policy modules_select_member
on public.business_modules for select
to authenticated
using (private.is_business_member(business_id));

create policy modules_write_owner_admin
on public.business_modules for all
to authenticated
using (private.has_business_role(business_id, array['owner','administrator']))
with check (private.has_business_role(business_id, array['owner','administrator']));

create policy approvals_select_member
on public.approval_requests for select
to authenticated
using (private.is_business_member(business_id));

create policy approvals_insert_member
on public.approval_requests for insert
to authenticated
with check (
  requested_by = (select auth.uid())
  and private.is_business_member(business_id)
  and status = 'pending'
  and decided_by is null
  and decided_at is null
);

create policy approvals_decide_owner_admin_once
on public.approval_requests for update
to authenticated
using (
  status = 'pending'
  and private.has_business_role(business_id, array['owner','administrator'])
)
with check (
  private.has_business_role(business_id, array['owner','administrator'])
  and (
    (status = 'pending' and decided_by is null and decided_at is null)
    or (status in ('approved','rejected')
        and decided_by = (select auth.uid())
        and decided_at is not null)
    or (status = 'cancelled' and decided_at is not null)
  )
);

create policy proof_select_member
on public.proof_log for select
to authenticated
using (private.is_business_member(business_id));

create policy proof_insert_member
on public.proof_log for insert
to authenticated
with check (
  private.is_business_member(business_id)
  and actor_user_id = (select auth.uid())
);

create policy errors_select_admin
on public.error_log for select
to authenticated
using (
  business_id is not null
  and private.has_business_role(business_id, array['owner','administrator'])
);

create policy errors_insert_member
on public.error_log for insert
to authenticated
with check (
  business_id is not null
  and private.is_business_member(business_id)
  and actor_user_id = (select auth.uid())
);

create policy external_actions_select_member
on public.external_action_queue for select
to authenticated
using (private.is_business_member(business_id));

create policy external_actions_insert_member_draft_only
on public.external_action_queue for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and private.is_business_member(business_id)
  and status = 'draft'
  and approval_request_id is null
);

create policy external_actions_update_owner_admin_gate
on public.external_action_queue for update
to authenticated
using (
  status in ('draft', 'pending_owner_approval')
  and private.has_business_role(business_id, array['owner','administrator'])
)
with check (
  private.has_business_role(business_id, array['owner','administrator'])
  and (
    (status = 'draft' and approval_request_id is null)
    or status = 'cancelled'
    or (
      status = 'pending_owner_approval'
      and private.approval_matches_external_action(
        business_id, approval_request_id, action_type, record_type, record_id, 'pending'
      )
    )
    or (
      status = 'approved'
      and private.approval_matches_external_action(
        business_id, approval_request_id, action_type, record_type, record_id, 'approved'
      )
    )
  )
);

-- Scope grants only to the new foundation objects. Do not alter privileges on
-- any pre-existing Customer Portal or gateway tables in the public schema.
revoke all on table public.businesses from anon;
revoke all on table public.profiles from anon;
revoke all on table public.business_memberships from anon;
revoke all on table public.business_invitations from anon;
revoke all on table public.business_modules from anon;
revoke all on table public.approval_requests from anon;
revoke all on table public.proof_log from anon;
revoke all on table public.error_log from anon;
revoke all on table public.external_action_queue from anon;

grant usage on schema public to authenticated;
grant select, update on public.businesses to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.business_memberships to authenticated;
grant select, insert, update on public.business_invitations to authenticated;
grant select, insert, update, delete on public.business_modules to authenticated;
grant select, insert, update on public.approval_requests to authenticated;
grant select, insert on public.proof_log to authenticated;
grant select, insert on public.error_log to authenticated;
grant select, insert, update on public.external_action_queue to authenticated;
grant usage, select on sequence public.proof_log_id_seq to authenticated;
grant usage, select on sequence public.error_log_id_seq to authenticated;

commit;
