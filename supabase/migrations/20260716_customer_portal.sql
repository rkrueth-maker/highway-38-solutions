-- Highway 38 Customer Portal on Supabase
-- Apply through the Supabase SQL editor or CLI migration runner.
-- Public browser code uses only the publishable key. Never expose service_role.

create extension if not exists pgcrypto;

create table if not exists public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  tenant_key text not null default 'highway38',
  customer_code text not null unique,
  display_name text not null,
  email text not null,
  status text not null default 'invited' check (status in ('invited','active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_accounts(id) on delete cascade,
  job_number text not null unique,
  title text not null,
  status text not null default 'open',
  next_action text,
  due_date date,
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_accounts(id) on delete cascade,
  quote_number text not null unique,
  title text not null,
  amount numeric(12,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','presented','accepted','rejected','expired','cancelled')),
  version integer not null default 1 check (version > 0),
  customer_decision text check (customer_decision in ('approved','declined','revision_requested')),
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_accounts(id) on delete cascade,
  invoice_number text not null unique,
  total numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  status text not null default 'open',
  due_date date,
  hosted_payment_url text check (hosted_payment_url is null or hosted_payment_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_accounts(id) on delete cascade,
  job_id uuid references public.customer_jobs(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  direction text not null default 'customer_to_business' check (direction in ('customer_to_business','business_to_customer')),
  status text not null default 'pending_owner_review',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.customer_files (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_accounts(id) on delete cascade,
  job_id uuid references public.customer_jobs(id) on delete set null,
  file_name text not null,
  storage_path text not null unique,
  status text not null default 'available',
  available_to_customer boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_portal_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customer_accounts(id) on delete set null,
  auth_user_id uuid default auth.uid(),
  event_type text not null,
  record_type text,
  record_id uuid,
  result text not null default 'PASS',
  external_action_occurred boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists customer_accounts_auth_user_idx on public.customer_accounts(auth_user_id);
create index if not exists customer_jobs_customer_idx on public.customer_jobs(customer_id);
create index if not exists customer_quotes_customer_idx on public.customer_quotes(customer_id);
create index if not exists customer_invoices_customer_idx on public.customer_invoices(customer_id);
create index if not exists customer_messages_customer_idx on public.customer_messages(customer_id);
create index if not exists customer_files_customer_idx on public.customer_files(customer_id);

create or replace function public.customer_portal_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.customer_accounts
  where auth_user_id = (select auth.uid())
    and status = 'active'
  limit 1
$$;

revoke all on function public.customer_portal_customer_id() from public;
grant execute on function public.customer_portal_customer_id() to authenticated;

alter table public.customer_accounts enable row level security;
alter table public.customer_jobs enable row level security;
alter table public.customer_quotes enable row level security;
alter table public.customer_invoices enable row level security;
alter table public.customer_messages enable row level security;
alter table public.customer_files enable row level security;
alter table public.customer_portal_events enable row level security;

drop policy if exists "customer reads own account" on public.customer_accounts;
create policy "customer reads own account"
on public.customer_accounts for select
to authenticated
using ((select auth.uid()) is not null and auth_user_id = (select auth.uid()) and status = 'active');

drop policy if exists "customer reads own jobs" on public.customer_jobs;
create policy "customer reads own jobs"
on public.customer_jobs for select
to authenticated
using (customer_id = (select public.customer_portal_customer_id()));

drop policy if exists "customer reads own quotes" on public.customer_quotes;
create policy "customer reads own quotes"
on public.customer_quotes for select
to authenticated
using (customer_id = (select public.customer_portal_customer_id()));

drop policy if exists "customer reads own invoices" on public.customer_invoices;
create policy "customer reads own invoices"
on public.customer_invoices for select
to authenticated
using (customer_id = (select public.customer_portal_customer_id()));

drop policy if exists "customer reads own messages" on public.customer_messages;
create policy "customer reads own messages"
on public.customer_messages for select
to authenticated
using (customer_id = (select public.customer_portal_customer_id()));

drop policy if exists "customer inserts own messages" on public.customer_messages;
create policy "customer inserts own messages"
on public.customer_messages for insert
to authenticated
with check (
  customer_id = (select public.customer_portal_customer_id())
  and created_by = (select auth.uid())
  and direction = 'customer_to_business'
  and status = 'pending_owner_review'
);

drop policy if exists "customer reads own files" on public.customer_files;
create policy "customer reads own files"
on public.customer_files for select
to authenticated
using (
  customer_id = (select public.customer_portal_customer_id())
  and available_to_customer = true
);

drop policy if exists "customer records own portal events" on public.customer_portal_events;
create policy "customer records own portal events"
on public.customer_portal_events for insert
to authenticated
with check (
  customer_id = (select public.customer_portal_customer_id())
  and auth_user_id = (select auth.uid())
  and external_action_occurred = false
);

create or replace function public.customer_portal_approve_quote(
  p_quote_id uuid,
  p_expected_version integer
)
returns public.customer_quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_quote public.customer_quotes;
begin
  v_customer_id := public.customer_portal_customer_id();
  if v_customer_id is null then
    raise exception 'Active customer account required';
  end if;

  select *
  into v_quote
  from public.customer_quotes
  where id = p_quote_id
    and customer_id = v_customer_id
  for update;

  if not found then
    raise exception 'Quote not found for this customer';
  end if;
  if v_quote.status <> 'presented' then
    raise exception 'Quote is not available for approval';
  end if;
  if v_quote.version <> p_expected_version then
    raise exception 'Quote version changed; refresh before approving';
  end if;
  if v_quote.customer_decision is not null then
    raise exception 'A customer decision is already recorded';
  end if;

  update public.customer_quotes
  set customer_decision = 'approved',
      decision_at = now(),
      updated_at = now()
  where id = p_quote_id
  returning * into v_quote;

  insert into public.customer_portal_events (
    customer_id, auth_user_id, event_type, record_type, record_id, result, external_action_occurred
  ) values (
    v_customer_id, auth.uid(), 'QUOTE_APPROVAL_RECORDED', 'quote', p_quote_id, 'PASS', false
  );

  return v_quote;
end;
$$;

revoke all on function public.customer_portal_approve_quote(uuid, integer) from public;
grant execute on function public.customer_portal_approve_quote(uuid, integer) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-portal',
  'customer-portal',
  false,
  26214400,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "customer downloads own portal objects" on storage.objects;
create policy "customer downloads own portal objects"
on storage.objects for select
to authenticated
using (
  bucket_id = 'customer-portal'
  and (storage.foldername(name))[1] = (select public.customer_portal_customer_id())::text
);

drop policy if exists "customer uploads own quarantined objects" on storage.objects;
create policy "customer uploads own quarantined objects"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'customer-portal'
  and (storage.foldername(name))[1] = (select public.customer_portal_customer_id())::text
  and (storage.foldername(name))[2] = 'uploads'
  and owner_id = (select auth.uid()::text)
);

grant select on public.customer_accounts to authenticated;
grant select on public.customer_jobs to authenticated;
grant select on public.customer_quotes to authenticated;
grant select on public.customer_invoices to authenticated;
grant select, insert on public.customer_messages to authenticated;
grant select on public.customer_files to authenticated;
grant insert on public.customer_portal_events to authenticated;
