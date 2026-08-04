-- Complete and harden the canonical Supabase Business Office foundation.
-- This migration intentionally reuses the existing businesses, memberships,
-- module settings, approvals, Proof Log, Error Log, Price Book, and quote items.
-- It does not migrate customer data or execute an external action.

begin;

create schema if not exists private;

do $$
begin
  if to_regclass('public.businesses') is null
     or to_regclass('public.business_memberships') is null
     or to_regclass('public.business_module_settings') is null
     or to_regclass('public.business_approvals') is null
     or to_regclass('public.business_proof_log') is null
     or to_regclass('public.business_error_log') is null
     or to_regclass('public.price_book_items') is null
     or to_regclass('public.quote_items') is null then
    raise exception 'Canonical Business Office foundation is missing; refusing to create a second tenant system.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'business_memberships'
      and column_name = 'auth_user_id'
  ) then
    raise exception 'Canonical membership boundary is incompatible; expected business_memberships.auth_user_id.';
  end if;
end
$$;

-- Enforce valid future approval states without rejecting historical rows before
-- they can be audited. NOT VALID still protects every new insert and update.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_approvals'::regclass
      and conname = 'business_approvals_review_consistency'
  ) then
    alter table public.business_approvals
      add constraint business_approvals_review_consistency
      check (
        (
          status = 'pending'
          and reviewed_by is null
          and reviewed_at is null
          and external_action_allowed = false
        )
        or
        (
          status in ('approved', 'rejected', 'cancelled')
          and reviewed_by is not null
          and reviewed_at is not null
          and (external_action_allowed = false or status = 'approved')
        )
      ) not valid;
  end if;
end
$$;

create or replace function private.guard_business_approval_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if old.status = 'pending' then
    if new.business_id is distinct from old.business_id
       or new.entity_type is distinct from old.entity_type
       or new.entity_id is distinct from old.entity_id
       or new.action_type is distinct from old.action_type
       or new.requested_by is distinct from old.requested_by
       or new.requested_at is distinct from old.requested_at
       or new.created_at is distinct from old.created_at then
      raise exception 'Approval identity and request fields are immutable.';
    end if;

    if new.external_action_allowed then
      raise exception 'External action authorization requires the separate Owner gate.';
    end if;

    if new.status = 'pending' then
      if new.reviewed_by is not null or new.reviewed_at is not null then
        raise exception 'Pending approvals cannot contain review fields.';
      end if;
    elsif new.status in ('approved', 'rejected', 'cancelled') then
      if new.reviewed_by is null or new.reviewed_at is null then
        raise exception 'Final approval decisions require reviewer and review time.';
      end if;
    else
      raise exception 'Unsupported approval transition.';
    end if;

    return new;
  end if;

  if old.status = 'approved'
     and old.external_action_allowed = false
     and new.status = 'approved'
     and new.external_action_allowed = true then
    if new.business_id is distinct from old.business_id
       or new.entity_type is distinct from old.entity_type
       or new.entity_id is distinct from old.entity_id
       or new.action_type is distinct from old.action_type
       or new.requested_by is distinct from old.requested_by
       or new.reviewed_by is distinct from old.reviewed_by
       or new.requested_at is distinct from old.requested_at
       or new.reviewed_at is distinct from old.reviewed_at
       or new.notes is distinct from old.notes
       or new.created_at is distinct from old.created_at then
      raise exception 'Owner external-action gate may only change external_action_allowed.';
    end if;

    return new;
  end if;

  raise exception 'Final approval decisions are immutable.';
end
$$;

revoke all on function private.guard_business_approval_transition() from public;

drop trigger if exists business_approvals_guard_transition on public.business_approvals;
create trigger business_approvals_guard_transition
before update on public.business_approvals
for each row execute function private.guard_business_approval_transition();

drop policy if exists "administrators review approvals" on public.business_approvals;
drop policy if exists "administrators review pending approvals" on public.business_approvals;
drop policy if exists "owners allow approved external actions" on public.business_approvals;
drop policy if exists "review and authorize approvals" on public.business_approvals;
create policy "review and authorize approvals"
on public.business_approvals for update
to authenticated
using (
  (
    status = 'pending'
    and (select private.business_access(business_id, array['owner','administrator']))
  )
  or
  (
    status = 'approved'
    and external_action_allowed = false
    and (select private.business_access(business_id, array['owner']))
  )
)
with check (
  (
    (select private.business_access(business_id, array['owner','administrator']))
    and external_action_allowed = false
    and (
      (
        status = 'pending'
        and reviewed_by is null
        and reviewed_at is null
      )
      or
      (
        status in ('approved', 'rejected', 'cancelled')
        and reviewed_by = (select auth.uid())
        and reviewed_at is not null
      )
    )
  )
  or
  (
    status = 'approved'
    and external_action_allowed = true
    and reviewed_by is not null
    and reviewed_at is not null
    and (select private.business_access(business_id, array['owner']))
  )
);

create table if not exists public.external_action_queue (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  approval_id uuid references public.business_approvals(id) on delete restrict,
  action_type text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in (
      'draft',
      'pending_owner_approval',
      'approved',
      'executing',
      'completed',
      'failed',
      'cancelled'
    )),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  executed_at timestamptz,
  last_error text,
  constraint external_action_queue_approval_link check (
    (status = 'draft' and approval_id is null)
    or status = 'cancelled'
    or (
      status in ('pending_owner_approval', 'approved', 'executing', 'completed', 'failed')
      and approval_id is not null
    )
  )
);

create unique index if not exists external_action_queue_approval_unique
  on public.external_action_queue (approval_id)
  where approval_id is not null;

create index if not exists external_action_queue_business_status_idx
  on public.external_action_queue (business_id, status, created_at desc);

create index if not exists external_action_queue_created_by_idx
  on public.external_action_queue (created_by);

comment on table public.external_action_queue is
  'Inert external-action records. No trigger, schedule, or browser policy executes an action.';

create or replace function private.approval_matches_external_action(
  p_business_id uuid,
  p_approval_id uuid,
  p_action_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_required_status text,
  p_external_action_allowed boolean
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    private.business_access(p_business_id, null)
    and exists (
      select 1
      from public.business_approvals approval
      where approval.id = p_approval_id
        and approval.business_id = p_business_id
        and approval.action_type = p_action_type
        and approval.entity_type = p_entity_type
        and approval.entity_id is not distinct from p_entity_id
        and approval.status = p_required_status
        and approval.external_action_allowed = p_external_action_allowed
    )
$$;

revoke all on function private.approval_matches_external_action(
  uuid, uuid, text, text, uuid, text, boolean
) from public;
grant usage on schema private to authenticated;
grant execute on function private.approval_matches_external_action(
  uuid, uuid, text, text, uuid, text, boolean
) to authenticated;

alter table public.external_action_queue enable row level security;

drop policy if exists "members read external action queue" on public.external_action_queue;
create policy "members read external action queue"
on public.external_action_queue for select
to authenticated
using ((select private.business_access(business_id, null)));

drop policy if exists "staff draft external actions" on public.external_action_queue;
create policy "staff draft external actions"
on public.external_action_queue for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'draft'
  and approval_id is null
  and (select private.business_access(business_id, array['owner','administrator','staff']))
);

drop policy if exists "administrators prepare approved external actions" on public.external_action_queue;
create policy "administrators prepare approved external actions"
on public.external_action_queue for update
to authenticated
using (
  status in ('draft', 'pending_owner_approval')
  and (select private.business_access(business_id, array['owner','administrator']))
)
with check (
  (select private.business_access(business_id, array['owner','administrator']))
  and (
    (status = 'draft' and approval_id is null)
    or status = 'cancelled'
    or (
      status = 'pending_owner_approval'
      and private.approval_matches_external_action(
        business_id,
        approval_id,
        action_type,
        entity_type,
        entity_id,
        'pending',
        false
      )
    )
    or (
      status = 'approved'
      and private.approval_matches_external_action(
        business_id,
        approval_id,
        action_type,
        entity_type,
        entity_id,
        'approved',
        true
      )
    )
  )
);

drop trigger if exists external_action_queue_touch_updated_at on public.external_action_queue;
create trigger external_action_queue_touch_updated_at
before update on public.external_action_queue
for each row execute function private.touch_updated_at();

revoke all on table public.external_action_queue from anon;
grant select, insert, update on public.external_action_queue to authenticated;
grant all on table public.external_action_queue to service_role;

commit;
