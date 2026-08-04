-- Highway 38 Business Office shared Supabase foundation
-- Additive, tenant-safe migration. Existing customer portal data and behavior remain intact.
-- No external action, automatic approval, automatic send, payment, publishing, or deployment is performed.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  business_key text not null unique check (business_key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  legal_name text,
  display_name text not null,
  status text not null default 'provisioning'
    check (status in ('provisioning', 'active', 'suspended', 'closed')),
  timezone text not null default 'America/Chicago',
  brand_config jsonb not null default '{}'::jsonb,
  module_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  auth_user_id uuid references auth.users(id) on delete set null,
  invited_email text not null,
  role text not null default 'viewer'
    check (role in ('owner', 'administrator', 'staff', 'viewer')),
  status text not null default 'invited'
    check (status in ('invited', 'active', 'suspended', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_memberships_user_unique
  on public.business_memberships (business_id, auth_user_id)
  where auth_user_id is not null and status <> 'revoked';

create unique index if not exists business_memberships_open_email_unique
  on public.business_memberships (business_id, lower(invited_email))
  where status in ('invited', 'active', 'suspended');

create index if not exists business_memberships_auth_user_idx
  on public.business_memberships (auth_user_id, status);

create table if not exists public.business_module_settings (
  business_id uuid not null references public.businesses(id) on delete cascade,
  module_key text not null check (module_key ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, module_key)
);

create table if not exists public.business_approvals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  entity_type text not null,
  entity_id uuid,
  action_type text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid default auth.uid() references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 4000),
  external_action_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_approvals_business_status_idx
  on public.business_approvals (business_id, status, requested_at desc);

create table if not exists public.business_proof_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  actor_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  action_type text not null,
  entity_type text,
  entity_id uuid,
  result text not null default 'PASS' check (result in ('PASS', 'HOLD', 'FAIL')),
  details jsonb not null default '{}'::jsonb,
  external_action_occurred boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists business_proof_log_business_created_idx
  on public.business_proof_log (business_id, created_at desc);

create table if not exists public.business_error_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  actor_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  source text not null,
  error_code text,
  message text not null check (char_length(message) <= 4000),
  severity text not null default 'error'
    check (severity in ('info', 'warning', 'error', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'resolved', 'ignored')),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists business_error_log_business_status_idx
  on public.business_error_log (business_id, status, created_at desc);

create table if not exists public.price_book_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  item_code text not null,
  category text not null,
  description text not null,
  unit text not null,
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  source_type text not null default 'business'
    check (source_type in ('business', 'local_research', 'vendor', 'historical')),
  source_note text,
  approval_status text not null default 'owner_review_required'
    check (approval_status in ('owner_review_required', 'approved', 'rejected')),
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, item_code)
);

create index if not exists price_book_items_business_category_idx
  on public.price_book_items (business_id, category, active);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  quote_id uuid not null references public.customer_quotes(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  work_package text,
  item_type text not null
    check (item_type in ('labor', 'material', 'equipment', 'subcontract', 'allowance', 'contingency')),
  description text not null,
  quantity numeric(14,4) not null default 1 check (quantity >= 0),
  unit text not null default 'each',
  unit_price numeric(14,4) not null default 0 check (unit_price >= 0),
  amount numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  price_book_item_id uuid references public.price_book_items(id) on delete set null,
  pricing_source text not null default 'price_book'
    check (pricing_source in ('price_book', 'local_research', 'owner_override', 'allowance')),
  owner_review_required boolean not null default true,
  approved boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, line_number)
);

create index if not exists quote_items_business_quote_idx
  on public.quote_items (business_id, quote_id, line_number);

insert into public.businesses (
  business_key, legal_name, display_name, status, timezone
) values (
  'highway38',
  'Highway 38 Solutions',
  'Highway 38 Solutions',
  'active',
  'America/Chicago'
)
on conflict (business_key) do update
set display_name = excluded.display_name,
    timezone = excluded.timezone,
    updated_at = now();

insert into public.business_module_settings (business_id, module_key, enabled)
select b.id, module_key, true
from public.businesses b
cross join unnest(array[
  'today',
  'customers',
  'quotes',
  'jobs',
  'price-book',
  'approvals',
  'proof-log',
  'error-log'
]) as module_key
where b.business_key = 'highway38'
on conflict (business_id, module_key) do nothing;

alter table public.customer_accounts
  add column if not exists business_id uuid,
  add column if not exists portal_enabled boolean not null default true;

update public.customer_accounts ca
set business_id = b.id
from public.businesses b
where ca.business_id is null
  and b.business_key = coalesce(nullif(ca.tenant_key, ''), 'highway38');

update public.customer_accounts ca
set business_id = b.id,
    tenant_key = b.business_key
from public.businesses b
where ca.business_id is null
  and b.business_key = 'highway38';

alter table public.customer_accounts
  alter column business_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_accounts_business_id_fkey'
  ) then
    alter table public.customer_accounts
      add constraint customer_accounts_business_id_fkey
      foreign key (business_id) references public.businesses(id) on delete restrict;
  end if;
end
$$;

alter table public.customer_accounts
  drop constraint if exists customer_accounts_auth_user_id_key,
  drop constraint if exists customer_accounts_customer_code_key;

drop index if exists public.customer_accounts_open_email_unique;

create unique index if not exists customer_accounts_business_auth_user_unique
  on public.customer_accounts (business_id, auth_user_id)
  where auth_user_id is not null and status <> 'closed';

create unique index if not exists customer_accounts_business_code_unique
  on public.customer_accounts (business_id, customer_code);

create unique index if not exists customer_accounts_business_open_email_unique
  on public.customer_accounts (business_id, lower(email))
  where status in ('invited', 'active', 'suspended');

create index if not exists customer_accounts_business_status_idx
  on public.customer_accounts (business_id, status, updated_at desc);

alter table public.customer_jobs add column if not exists business_id uuid;
alter table public.customer_quotes add column if not exists business_id uuid;
alter table public.customer_invoices add column if not exists business_id uuid;
alter table public.customer_messages add column if not exists business_id uuid;
alter table public.customer_files add column if not exists business_id uuid;
alter table public.customer_portal_events add column if not exists business_id uuid;

update public.customer_jobs target
set business_id = ca.business_id
from public.customer_accounts ca
where target.business_id is null and target.customer_id = ca.id;

update public.customer_quotes target
set business_id = ca.business_id
from public.customer_accounts ca
where target.business_id is null and target.customer_id = ca.id;

update public.customer_invoices target
set business_id = ca.business_id
from public.customer_accounts ca
where target.business_id is null and target.customer_id = ca.id;

update public.customer_messages target
set business_id = ca.business_id
from public.customer_accounts ca
where target.business_id is null and target.customer_id = ca.id;

update public.customer_files target
set business_id = ca.business_id
from public.customer_accounts ca
where target.business_id is null and target.customer_id = ca.id;

update public.customer_portal_events target
set business_id = ca.business_id
from public.customer_accounts ca
where target.business_id is null and target.customer_id = ca.id;

update public.customer_portal_events target
set business_id = b.id
from public.businesses b
where target.business_id is null and b.business_key = 'highway38';

alter table public.customer_jobs alter column business_id set not null;
alter table public.customer_quotes alter column business_id set not null;
alter table public.customer_invoices alter column business_id set not null;
alter table public.customer_messages alter column business_id set not null;
alter table public.customer_files alter column business_id set not null;
alter table public.customer_portal_events alter column business_id set not null;

do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('customer_jobs', 'customer_jobs_business_id_fkey'),
      ('customer_quotes', 'customer_quotes_business_id_fkey'),
      ('customer_invoices', 'customer_invoices_business_id_fkey'),
      ('customer_messages', 'customer_messages_business_id_fkey'),
      ('customer_files', 'customer_files_business_id_fkey'),
      ('customer_portal_events', 'customer_portal_events_business_id_fkey')
    ) as x(table_name, constraint_name)
  loop
    if not exists (
      select 1 from pg_constraint where conname = item.constraint_name
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (business_id) references public.businesses(id) on delete restrict',
        item.table_name,
        item.constraint_name
      );
    end if;
  end loop;
end
$$;

alter table public.customer_jobs
  drop constraint if exists customer_jobs_job_number_key;
alter table public.customer_quotes
  drop constraint if exists customer_quotes_quote_number_key;
alter table public.customer_invoices
  drop constraint if exists customer_invoices_invoice_number_key;

create unique index if not exists customer_jobs_business_number_unique
  on public.customer_jobs (business_id, job_number);
create unique index if not exists customer_quotes_business_number_unique
  on public.customer_quotes (business_id, quote_number);
create unique index if not exists customer_invoices_business_number_unique
  on public.customer_invoices (business_id, invoice_number);

create index if not exists customer_jobs_business_updated_idx
  on public.customer_jobs (business_id, updated_at desc);
create index if not exists customer_quotes_business_updated_idx
  on public.customer_quotes (business_id, updated_at desc);
create index if not exists customer_invoices_business_updated_idx
  on public.customer_invoices (business_id, updated_at desc);
create index if not exists customer_messages_business_created_idx
  on public.customer_messages (business_id, created_at desc);
create index if not exists customer_files_business_updated_idx
  on public.customer_files (business_id, updated_at desc);
create index if not exists customer_portal_events_business_created_idx
  on public.customer_portal_events (business_id, created_at desc);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create or replace function private.set_customer_account_business()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  v_business public.businesses;
begin
  if new.business_id is null then
    select *
    into v_business
    from public.businesses
    where business_key = coalesce(nullif(new.tenant_key, ''), 'highway38')
    limit 1;

    if v_business.id is null then
      raise exception 'Business tenant is not provisioned';
    end if;

    new.business_id := v_business.id;
    new.tenant_key := v_business.business_key;
  else
    select *
    into v_business
    from public.businesses
    where id = new.business_id;

    if v_business.id is null then
      raise exception 'Business tenant is not provisioned';
    end if;

    new.tenant_key := v_business.business_key;
  end if;

  return new;
end
$$;

create or replace function private.set_customer_child_business()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  v_business_id uuid;
begin
  select business_id
  into v_business_id
  from public.customer_accounts
  where id = new.customer_id;

  if v_business_id is null then
    raise exception 'Customer business tenant is unavailable';
  end if;

  if new.business_id is not null and new.business_id <> v_business_id then
    raise exception 'Customer and record business tenants do not match';
  end if;

  new.business_id := v_business_id;
  return new;
end
$$;

create or replace function private.set_customer_event_business()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  v_business_id uuid;
begin
  if new.customer_id is not null then
    select business_id
    into v_business_id
    from public.customer_accounts
    where id = new.customer_id;

    if new.business_id is not null and new.business_id <> v_business_id then
      raise exception 'Customer and event business tenants do not match';
    end if;

    new.business_id := v_business_id;
  end if;

  if new.business_id is null then
    select id
    into new.business_id
    from public.businesses
    where business_key = 'highway38';
  end if;

  return new;
end
$$;

create or replace function private.set_quote_item_business()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  v_business_id uuid;
begin
  select business_id
  into v_business_id
  from public.customer_quotes
  where id = new.quote_id;

  if v_business_id is null then
    raise exception 'Quote business tenant is unavailable';
  end if;

  if new.business_id is not null and new.business_id <> v_business_id then
    raise exception 'Quote and line item business tenants do not match';
  end if;

  new.business_id := v_business_id;
  return new;
end
$$;

drop trigger if exists customer_accounts_set_business on public.customer_accounts;
create trigger customer_accounts_set_business
before insert or update of business_id, tenant_key
on public.customer_accounts
for each row execute function private.set_customer_account_business();

drop trigger if exists customer_jobs_set_business on public.customer_jobs;
create trigger customer_jobs_set_business
before insert or update of customer_id, business_id
on public.customer_jobs
for each row execute function private.set_customer_child_business();

drop trigger if exists customer_quotes_set_business on public.customer_quotes;
create trigger customer_quotes_set_business
before insert or update of customer_id, business_id
on public.customer_quotes
for each row execute function private.set_customer_child_business();

drop trigger if exists customer_invoices_set_business on public.customer_invoices;
create trigger customer_invoices_set_business
before insert or update of customer_id, business_id
on public.customer_invoices
for each row execute function private.set_customer_child_business();

drop trigger if exists customer_messages_set_business on public.customer_messages;
create trigger customer_messages_set_business
before insert or update of customer_id, business_id
on public.customer_messages
for each row execute function private.set_customer_child_business();

drop trigger if exists customer_files_set_business on public.customer_files;
create trigger customer_files_set_business
before insert or update of customer_id, business_id
on public.customer_files
for each row execute function private.set_customer_child_business();

drop trigger if exists customer_portal_events_set_business on public.customer_portal_events;
create trigger customer_portal_events_set_business
before insert or update of customer_id, business_id
on public.customer_portal_events
for each row execute function private.set_customer_event_business();

drop trigger if exists quote_items_set_business on public.quote_items;
create trigger quote_items_set_business
before insert or update of quote_id, business_id
on public.quote_items
for each row execute function private.set_quote_item_business();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'businesses',
    'business_memberships',
    'business_module_settings',
    'business_approvals',
    'price_book_items',
    'quote_items'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      table_name || '_touch_updated_at',
      table_name
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.touch_updated_at()',
      table_name || '_touch_updated_at',
      table_name
    );
  end loop;
end
$$;

create or replace function private.business_access(
  p_business_id uuid,
  p_allowed_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.business_memberships membership
    where membership.business_id = p_business_id
      and membership.auth_user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        p_allowed_roles is null
        or membership.role = any (p_allowed_roles)
      )
  )
$$;

revoke all on function private.business_access(uuid, text[]) from public;
revoke all on function private.business_access(uuid, text[]) from anon;
grant usage on schema private to authenticated;
grant execute on function private.business_access(uuid, text[]) to authenticated;

create or replace function private.link_invited_business_memberships()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.email is null then
    return new;
  end if;

  update public.business_memberships
  set auth_user_id = new.id,
      status = 'active',
      accepted_at = coalesce(accepted_at, now()),
      updated_at = now()
  where auth_user_id is null
    and status = 'invited'
    and lower(invited_email) = lower(new.email);

  return new;
end
$$;

revoke all on function private.link_invited_business_memberships() from public;
revoke all on function private.link_invited_business_memberships() from anon;
revoke all on function private.link_invited_business_memberships() from authenticated;

drop trigger if exists business_office_link_invited_memberships on auth.users;
create trigger business_office_link_invited_memberships
after insert or update of email on auth.users
for each row execute function private.link_invited_business_memberships();

create or replace function private.link_invited_customer_account()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.email is null then
    return new;
  end if;

  with linked as (
    update public.customer_accounts
    set auth_user_id = new.id,
        status = 'active',
        updated_at = now()
    where auth_user_id is null
      and status = 'invited'
      and lower(email) = lower(new.email)
    returning id, business_id
  )
  insert into public.customer_portal_events (
    business_id,
    customer_id,
    auth_user_id,
    event_type,
    record_type,
    record_id,
    result,
    external_action_occurred
  )
  select
    business_id,
    id,
    new.id,
    'CUSTOMER_AUTH_LINKED',
    'customer_account',
    id,
    'PASS',
    false
  from linked;

  return new;
end
$$;

revoke all on function private.link_invited_customer_account() from public;
revoke all on function private.link_invited_customer_account() from anon;
revoke all on function private.link_invited_customer_account() from authenticated;

create or replace function public.customer_portal_customer_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select id
  from public.customer_accounts
  where auth_user_id = (select auth.uid())
    and status = 'active'
    and tenant_key = 'highway38'
  order by created_at
  limit 1
$$;

revoke all on function public.customer_portal_customer_id() from public;
revoke execute on function public.customer_portal_customer_id() from anon;
grant execute on function public.customer_portal_customer_id() to authenticated;

create or replace view public.business_office_my_businesses
with (security_invoker = true)
as
select
  b.id as business_id,
  b.business_key,
  b.display_name,
  b.status as business_status,
  b.timezone,
  b.brand_config,
  b.module_config,
  m.role,
  m.status as membership_status
from public.businesses b
join public.business_memberships m on m.business_id = b.id
where m.auth_user_id = (select auth.uid())
  and m.status = 'active';

alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;
alter table public.business_module_settings enable row level security;
alter table public.business_approvals enable row level security;
alter table public.business_proof_log enable row level security;
alter table public.business_error_log enable row level security;
alter table public.price_book_items enable row level security;
alter table public.quote_items enable row level security;

drop policy if exists "members read businesses" on public.businesses;
create policy "members read businesses"
on public.businesses for select
to authenticated
using ((select private.business_access(id, null)));

drop policy if exists "members read own memberships" on public.business_memberships;
create policy "members read own memberships"
on public.business_memberships for select
to authenticated
using (
  auth_user_id = (select auth.uid())
  or (select private.business_access(business_id, array['owner', 'administrator']))
);

drop policy if exists "owners create memberships" on public.business_memberships;
create policy "owners create memberships"
on public.business_memberships for insert
to authenticated
with check ((select private.business_access(business_id, array['owner'])));

drop policy if exists "owners update memberships" on public.business_memberships;
create policy "owners update memberships"
on public.business_memberships for update
to authenticated
using ((select private.business_access(business_id, array['owner'])))
with check ((select private.business_access(business_id, array['owner'])));

drop policy if exists "owners revoke memberships" on public.business_memberships;
create policy "owners revoke memberships"
on public.business_memberships for delete
to authenticated
using ((select private.business_access(business_id, array['owner'])));

drop policy if exists "members read module settings" on public.business_module_settings;
create policy "members read module settings"
on public.business_module_settings for select
to authenticated
using ((select private.business_access(business_id, null)));

drop policy if exists "administrators manage module settings" on public.business_module_settings;
create policy "administrators manage module settings"
on public.business_module_settings for all
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])))
with check ((select private.business_access(business_id, array['owner', 'administrator'])));

drop policy if exists "members read approvals" on public.business_approvals;
create policy "members read approvals"
on public.business_approvals for select
to authenticated
using ((select private.business_access(business_id, null)));

drop policy if exists "members request approvals" on public.business_approvals;
create policy "members request approvals"
on public.business_approvals for insert
to authenticated
with check (
  (select private.business_access(business_id, null))
  and requested_by = (select auth.uid())
  and status = 'pending'
  and external_action_allowed = false
);

drop policy if exists "administrators review approvals" on public.business_approvals;
create policy "administrators review approvals"
on public.business_approvals for update
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])))
with check (
  (select private.business_access(business_id, array['owner', 'administrator']))
  and external_action_allowed = false
);

drop policy if exists "members read proof log" on public.business_proof_log;
create policy "members read proof log"
on public.business_proof_log for select
to authenticated
using ((select private.business_access(business_id, null)));

drop policy if exists "members write proof log" on public.business_proof_log;
create policy "members write proof log"
on public.business_proof_log for insert
to authenticated
with check (
  (select private.business_access(business_id, null))
  and actor_user_id = (select auth.uid())
  and external_action_occurred = false
);

drop policy if exists "administrators read error log" on public.business_error_log;
create policy "administrators read error log"
on public.business_error_log for select
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])));

drop policy if exists "members write error log" on public.business_error_log;
create policy "members write error log"
on public.business_error_log for insert
to authenticated
with check (
  (select private.business_access(business_id, null))
  and actor_user_id = (select auth.uid())
);

drop policy if exists "administrators update error log" on public.business_error_log;
create policy "administrators update error log"
on public.business_error_log for update
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])))
with check ((select private.business_access(business_id, array['owner', 'administrator'])));

drop policy if exists "members read price book" on public.price_book_items;
create policy "members read price book"
on public.price_book_items for select
to authenticated
using ((select private.business_access(business_id, null)));

drop policy if exists "staff propose price book items" on public.price_book_items;
create policy "staff propose price book items"
on public.price_book_items for insert
to authenticated
with check (
  (select private.business_access(business_id, array['owner', 'administrator', 'staff']))
  and created_by = (select auth.uid())
  and (
    approval_status = 'owner_review_required'
    or (select private.business_access(business_id, array['owner', 'administrator']))
  )
);

drop policy if exists "administrators approve price book items" on public.price_book_items;
create policy "administrators approve price book items"
on public.price_book_items for update
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])))
with check ((select private.business_access(business_id, array['owner', 'administrator'])));

drop policy if exists "members read quote items" on public.quote_items;
create policy "members read quote items"
on public.quote_items for select
to authenticated
using (
  (select private.business_access(business_id, null))
  or exists (
    select 1
    from public.customer_quotes q
    join public.customer_accounts ca on ca.id = q.customer_id
    where q.id = quote_items.quote_id
      and ca.auth_user_id = (select auth.uid())
      and ca.status = 'active'
      and q.status in ('presented', 'accepted')
  )
);

drop policy if exists "staff create unapproved quote items" on public.quote_items;
create policy "staff create unapproved quote items"
on public.quote_items for insert
to authenticated
with check (
  (select private.business_access(business_id, array['owner', 'administrator', 'staff']))
  and created_by = (select auth.uid())
  and approved = false
  and owner_review_required = true
);

drop policy if exists "administrators update quote items" on public.quote_items;
create policy "administrators update quote items"
on public.quote_items for update
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])))
with check ((select private.business_access(business_id, array['owner', 'administrator'])));

drop policy if exists "staff read business customers" on public.customer_accounts;
create policy "staff read business customers"
on public.customer_accounts for select
to authenticated
using ((select private.business_access(business_id, null)));

drop policy if exists "staff create business customers" on public.customer_accounts;
create policy "staff create business customers"
on public.customer_accounts for insert
to authenticated
with check ((select private.business_access(business_id, array['owner', 'administrator', 'staff'])));

drop policy if exists "staff update business customers" on public.customer_accounts;
create policy "staff update business customers"
on public.customer_accounts for update
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator', 'staff'])))
with check ((select private.business_access(business_id, array['owner', 'administrator', 'staff'])));

drop policy if exists "staff read business jobs" on public.customer_jobs;
create policy "staff read business jobs"
on public.customer_jobs for select
to authenticated
using ((select private.business_access(business_id, null)));

drop policy if exists "staff create business jobs" on public.customer_jobs;
create policy "staff create business jobs"
on public.customer_jobs for insert
to authenticated
with check ((select private.business_access(business_id, array['owner', 'administrator', 'staff'])));

drop policy if exists "staff update business jobs" on public.customer_jobs;
create policy "staff update business jobs"
on public.customer_jobs for update
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator', 'staff'])))
with check ((select private.business_access(business_id, array['owner', 'administrator', 'staff'])));

drop policy if exists "staff read business quotes" on public.customer_quotes;
create policy "staff read business quotes"
on public.customer_quotes for select
to authenticated
using ((select private.business_access(business_id, null)));

drop policy if exists "staff create draft business quotes" on public.customer_quotes;
create policy "staff create draft business quotes"
on public.customer_quotes for insert
to authenticated
with check (
  (select private.business_access(business_id, array['owner', 'administrator', 'staff']))
  and (
    status = 'draft'
    or (select private.business_access(business_id, array['owner', 'administrator']))
  )
);

drop policy if exists "administrators update business quotes" on public.customer_quotes;
create policy "administrators update business quotes"
on public.customer_quotes for update
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])))
with check ((select private.business_access(business_id, array['owner', 'administrator'])));

drop policy if exists "staff read business invoices" on public.customer_invoices;
create policy "staff read business invoices"
on public.customer_invoices for select
to authenticated
using ((select private.business_access(business_id, null)));

drop policy if exists "administrators create business invoices" on public.customer_invoices;
create policy "administrators create business invoices"
on public.customer_invoices for insert
to authenticated
with check ((select private.business_access(business_id, array['owner', 'administrator'])));

drop policy if exists "administrators update business invoices" on public.customer_invoices;
create policy "administrators update business invoices"
on public.customer_invoices for update
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])))
with check ((select private.business_access(business_id, array['owner', 'administrator'])));

drop policy if exists "staff read business messages" on public.customer_messages;
create policy "staff read business messages"
on public.customer_messages for select
to authenticated
using ((select private.business_access(business_id, null)));

drop policy if exists "staff stage business messages" on public.customer_messages;
create policy "staff stage business messages"
on public.customer_messages for insert
to authenticated
with check (
  (select private.business_access(business_id, array['owner', 'administrator', 'staff']))
  and created_by = (select auth.uid())
  and direction = 'business_to_customer'
  and status = 'pending_owner_review'
);

drop policy if exists "administrators review business messages" on public.customer_messages;
create policy "administrators review business messages"
on public.customer_messages for update
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])))
with check ((select private.business_access(business_id, array['owner', 'administrator'])));

drop policy if exists "staff read business files" on public.customer_files;
create policy "staff read business files"
on public.customer_files for select
to authenticated
using ((select private.business_access(business_id, null)));

drop policy if exists "staff stage business files" on public.customer_files;
create policy "staff stage business files"
on public.customer_files for insert
to authenticated
with check (
  (select private.business_access(business_id, array['owner', 'administrator', 'staff']))
  and (
    available_to_customer = false
    or (select private.business_access(business_id, array['owner', 'administrator']))
  )
);

drop policy if exists "administrators update business files" on public.customer_files;
create policy "administrators update business files"
on public.customer_files for update
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])))
with check ((select private.business_access(business_id, array['owner', 'administrator'])));

drop policy if exists "members read business portal events" on public.customer_portal_events;
create policy "members read business portal events"
on public.customer_portal_events for select
to authenticated
using ((select private.business_access(business_id, null)));

drop policy if exists "members record business portal events" on public.customer_portal_events;
create policy "members record business portal events"
on public.customer_portal_events for insert
to authenticated
with check (
  (select private.business_access(business_id, null))
  and auth_user_id = (select auth.uid())
  and external_action_occurred = false
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-office',
  'business-office',
  false,
  26214400,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/dxf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members read business office objects" on storage.objects;
create policy "members read business office objects"
on storage.objects for select
to authenticated
using (
  bucket_id = 'business-office'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (select private.business_access(((storage.foldername(name))[1])::uuid, null))
);

drop policy if exists "staff upload business office objects" on storage.objects;
create policy "staff upload business office objects"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'business-office'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and owner_id = (select auth.uid()::text)
  and (select private.business_access(
    ((storage.foldername(name))[1])::uuid,
    array['owner', 'administrator', 'staff']
  ))
);

drop policy if exists "staff update business office objects" on storage.objects;
create policy "staff update business office objects"
on storage.objects for update
to authenticated
using (
  bucket_id = 'business-office'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (select private.business_access(
    ((storage.foldername(name))[1])::uuid,
    array['owner', 'administrator', 'staff']
  ))
)
with check (
  bucket_id = 'business-office'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (select private.business_access(
    ((storage.foldername(name))[1])::uuid,
    array['owner', 'administrator', 'staff']
  ))
);

revoke all on public.businesses from anon;
revoke all on public.business_memberships from anon;
revoke all on public.business_module_settings from anon;
revoke all on public.business_approvals from anon;
revoke all on public.business_proof_log from anon;
revoke all on public.business_error_log from anon;
revoke all on public.price_book_items from anon;
revoke all on public.quote_items from anon;

grant select on public.businesses to authenticated;
grant select, insert, update, delete on public.business_memberships to authenticated;
grant select, insert, update, delete on public.business_module_settings to authenticated;
grant select, insert, update on public.business_approvals to authenticated;
grant select, insert on public.business_proof_log to authenticated;
grant select, insert, update on public.business_error_log to authenticated;
grant select, insert, update on public.price_book_items to authenticated;
grant select, insert, update on public.quote_items to authenticated;
grant select on public.business_office_my_businesses to authenticated;

grant select, insert, update on public.customer_accounts to authenticated;
grant select, insert, update on public.customer_jobs to authenticated;
grant select, insert, update on public.customer_quotes to authenticated;
grant select, insert, update on public.customer_invoices to authenticated;
grant select, insert, update on public.customer_messages to authenticated;
grant select, insert, update on public.customer_files to authenticated;
grant select, insert on public.customer_portal_events to authenticated;

-- Existing public quote-decision RPCs remain signed-in, customer-owned, version-checked,
-- and explicitly record external_action_occurred = false.
