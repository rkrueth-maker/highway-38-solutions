-- Northern Lakes secure customer portal release.
-- Supabase remains the system of record. Live payment processing remains disabled.

create schema if not exists private;

create or replace function private.customer_portal_access(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.customer_accounts account
    where account.id = p_customer_id
      and account.auth_user_id = (select auth.uid())
      and account.status = 'active'
      and account.portal_enabled = true
  )
$$;

create or replace function private.customer_portal_access(p_customer_id uuid, p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.customer_accounts account
    where account.id = p_customer_id
      and account.business_id = p_business_id
      and account.auth_user_id = (select auth.uid())
      and account.status = 'active'
      and account.portal_enabled = true
  )
$$;

revoke all on function private.customer_portal_access(uuid) from public;
revoke all on function private.customer_portal_access(uuid, uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.customer_portal_access(uuid) to authenticated;
grant execute on function private.customer_portal_access(uuid, uuid) to authenticated;

alter table public.customer_quotes
  add column if not exists pdf_storage_path text;

alter table public.customer_invoices
  add column if not exists pdf_storage_path text;

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customer_accounts(id) on delete cascade,
  invoice_id uuid references public.customer_invoices(id) on delete set null,
  provider text not null default 'not_configured',
  provider_transaction_id text,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','authorized','paid','failed','refunded','voided','test')),
  paid_at timestamptz,
  receipt_storage_path text,
  test_mode boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider, provider_transaction_id)
);

create index if not exists customer_payments_business_customer_idx
  on public.customer_payments (business_id, customer_id, paid_at desc);
create index if not exists customer_payments_invoice_idx
  on public.customer_payments (invoice_id);

alter table public.customer_payments enable row level security;

-- Replace the original single-tenant customer policies with reusable business-aware policies.
drop policy if exists "customer or member reads jobs" on public.customer_jobs;
create policy "customer or member reads jobs"
on public.customer_jobs for select
to authenticated
using (
  (select private.customer_portal_access(customer_id, business_id))
  or (select private.business_access(business_id, null::text[]))
);

drop policy if exists "customer or member reads quotes" on public.customer_quotes;
create policy "customer or member reads quotes"
on public.customer_quotes for select
to authenticated
using (
  (select private.customer_portal_access(customer_id, business_id))
  or (select private.business_access(business_id, null::text[]))
);

drop policy if exists "customer or member reads invoices" on public.customer_invoices;
create policy "customer or member reads invoices"
on public.customer_invoices for select
to authenticated
using (
  (select private.customer_portal_access(customer_id, business_id))
  or (select private.business_access(business_id, null::text[]))
);

drop policy if exists "customer or member reads files" on public.customer_files;
create policy "customer or member reads files"
on public.customer_files for select
to authenticated
using (
  ((select private.customer_portal_access(customer_id, business_id)) and available_to_customer = true)
  or (select private.business_access(business_id, null::text[]))
);

drop policy if exists "customer or member reads messages" on public.customer_messages;
create policy "customer or member reads messages"
on public.customer_messages for select
to authenticated
using (
  (select private.customer_portal_access(customer_id, business_id))
  or (select private.business_access(business_id, null::text[]))
);

drop policy if exists "customer or member inserts messages" on public.customer_messages;
create policy "customer or member inserts messages"
on public.customer_messages for insert
to authenticated
with check (
  (
    (select private.customer_portal_access(customer_id, business_id))
    and created_by = (select auth.uid())
    and direction = 'customer_to_business'
    and status = 'pending_owner_review'
  )
  or (
    (select private.business_access(business_id, array['owner','administrator','staff']::text[]))
    and created_by = (select auth.uid())
    and direction = 'business_to_customer'
    and status = 'pending_owner_review'
  )
);

drop policy if exists "customer or member records portal events" on public.customer_portal_events;
create policy "customer or member records portal events"
on public.customer_portal_events for insert
to authenticated
with check (
  auth_user_id = (select auth.uid())
  and external_action_occurred = false
  and (
    (select private.customer_portal_access(customer_id, business_id))
    or (select private.business_access(business_id, null::text[]))
  )
);

create policy "customer or member reads payments"
on public.customer_payments for select
to authenticated
using (
  (select private.customer_portal_access(customer_id, business_id))
  or (select private.business_access(business_id, null::text[]))
);

create policy "administrators create business payments"
on public.customer_payments for insert
to authenticated
with check (
  (select private.business_access(business_id, array['owner','administrator']::text[]))
);

create policy "administrators update business payments"
on public.customer_payments for update
to authenticated
using (
  (select private.business_access(business_id, array['owner','administrator']::text[]))
)
with check (
  (select private.business_access(business_id, array['owner','administrator']::text[]))
);

revoke all on table public.customer_payments from anon;
grant select on table public.customer_payments to authenticated;
grant insert, update on table public.customer_payments to authenticated;

-- Private portal objects use the customer UUID as the first path segment.
drop policy if exists "customer downloads own portal objects" on storage.objects;
create policy "customer downloads own portal objects"
on storage.objects for select
to authenticated
using (
  bucket_id = 'customer-portal'
  and coalesce((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (select private.customer_portal_access(((storage.foldername(name))[1])::uuid))
);

-- Generalize quote decisions without trusting a browser-provided customer or business ID.
create or replace function public.customer_portal_decide_quote(
  p_quote_id uuid,
  p_expected_version integer,
  p_decision text,
  p_notes text default null
)
returns public.customer_quotes
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_quote public.customer_quotes;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_notes text := trim(coalesce(p_notes, ''));
  v_event_type text;
begin
  if v_decision not in ('approved', 'declined', 'revision_requested') then
    raise exception 'Decision must be approved, declined, or revision_requested';
  end if;
  if v_decision = 'revision_requested' and char_length(v_notes) < 3 then
    raise exception 'Describe the requested change';
  end if;
  if char_length(v_notes) > 2000 then
    raise exception 'Decision notes are limited to 2,000 characters';
  end if;

  select quote.* into v_quote
  from public.customer_quotes quote
  join public.customer_accounts account on account.id = quote.customer_id
  where quote.id = p_quote_id
    and quote.business_id = account.business_id
    and account.auth_user_id = (select auth.uid())
    and account.status = 'active'
    and account.portal_enabled = true
  for update of quote;

  if not found then raise exception 'Quote not found for this customer'; end if;
  if v_quote.status <> 'presented' then raise exception 'Quote is not available for a customer decision'; end if;
  if v_quote.version <> p_expected_version then raise exception 'Quote version changed; refresh before deciding'; end if;
  if v_quote.customer_decision is not null then raise exception 'A customer decision is already recorded'; end if;

  if v_decision = 'approved' and (
    coalesce(v_quote.amount, 0) <= 0
    or nullif(trim(coalesce(v_quote.deliverables, '')), '') is null
    or nullif(trim(coalesce(v_quote.timing, '')), '') is null
    or nullif(trim(coalesce(v_quote.revision_allowance, '')), '') is null
    or nullif(trim(coalesce(v_quote.exclusions, '')), '') is null
    or nullif(trim(coalesce(v_quote.approval_consequence, '')), '') is null
  ) then raise exception 'Every required quote term must be posted before approval'; end if;

  update public.customer_quotes
  set customer_decision = v_decision,
      decision_at = now(),
      status = case when v_decision = 'approved' then 'accepted' when v_decision = 'declined' then 'rejected' else status end,
      updated_at = now()
  where id = p_quote_id
  returning * into v_quote;

  v_event_type := case v_decision when 'approved' then 'QUOTE_APPROVAL_RECORDED' when 'declined' then 'QUOTE_DECLINE_RECORDED' else 'QUOTE_REVISION_REQUESTED' end;

  insert into public.customer_portal_events (business_id, customer_id, auth_user_id, event_type, record_type, record_id, result, external_action_occurred)
  values (v_quote.business_id, v_quote.customer_id, auth.uid(), v_event_type, 'quote', p_quote_id, 'PASS', false);

  if v_notes <> '' then
    insert into public.customer_messages (business_id, customer_id, job_id, body, direction, status, created_by)
    values (
      v_quote.business_id,
      v_quote.customer_id,
      v_quote.job_id,
      case v_decision when 'revision_requested' then 'Quote revision requested: ' || v_notes when 'declined' then 'Quote declined: ' || v_notes else 'Quote approval note: ' || v_notes end,
      'customer_to_business',
      'pending_owner_review',
      auth.uid()
    );
  end if;

  return v_quote;
end;
$$;

create or replace function public.customer_portal_approve_quote(p_quote_id uuid, p_expected_version integer)
returns public.customer_quotes
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.customer_portal_decide_quote(p_quote_id, p_expected_version, 'approved', null)
$$;

revoke all on function public.customer_portal_decide_quote(uuid, integer, text, text) from public;
revoke all on function public.customer_portal_approve_quote(uuid, integer) from public;
grant execute on function public.customer_portal_decide_quote(uuid, integer, text, text) to authenticated;
grant execute on function public.customer_portal_approve_quote(uuid, integer) to authenticated;

-- Release the authenticated customer portal while retaining all financial and outbound locks.
update public.businesses
set module_config = jsonb_set(
      jsonb_set(
        jsonb_set(module_config, '{customerPortalReleaseEnabled}', 'true'::jsonb, true),
        '{directPaymentProcessing}', 'false'::jsonb, true
      ),
      '{externalActionsEnabled}', 'false'::jsonb, true
    ),
    brand_config = jsonb_set(
      brand_config,
      '{logoUrl}',
      to_jsonb('https://highway38solutions.com/businesses/northern-lakes/assets/diamond-logo.svg?v=nl-site-portal-20260805'::text),
      true
    ),
    updated_at = now()
where business_key = 'northern-lakes';
