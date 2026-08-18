-- Private Reseller Scout data for the two approved H38 owner accounts only.
-- Source branch: agent/private-reseller-scout

create table if not exists public.reseller_deals (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  title text not null,
  retailer text not null default '',
  location_text text not null default '',
  upc text not null default '',
  sku text not null default '',
  source_type text not null default 'manual',
  source_url text not null default '',
  buy_price numeric(12,2) not null default 0 check (buy_price >= 0),
  retail_price numeric(12,2) not null default 0 check (retail_price >= 0),
  expected_resale numeric(12,2) not null default 0 check (expected_resale >= 0),
  estimated_fees numeric(12,2) not null default 0 check (estimated_fees >= 0),
  estimated_shipping numeric(12,2) not null default 0 check (estimated_shipping >= 0),
  other_costs numeric(12,2) not null default 0 check (other_costs >= 0),
  marketplace text not null default '',
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'lead' check (status in ('lead','watch','bought','sold','skipped','expired')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reseller_watch_rules (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id),
  query_text text not null,
  retailer text not null default '',
  max_buy_price numeric(12,2) not null default 0 check (max_buy_price >= 0),
  min_expected_profit numeric(12,2) not null default 0 check (min_expected_profit >= 0),
  min_roi_percent numeric(12,2) not null default 0 check (min_roi_percent >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reseller_deals enable row level security;
alter table public.reseller_watch_rules enable row level security;

revoke all on table public.reseller_deals from anon;
revoke all on table public.reseller_watch_rules from anon;
grant select, insert, update, delete on table public.reseller_deals to authenticated;
grant select, insert, update, delete on table public.reseller_watch_rules to authenticated;

create index if not exists reseller_deals_updated_at_idx on public.reseller_deals(updated_at desc);
create index if not exists reseller_deals_created_by_idx on public.reseller_deals(created_by);
create index if not exists reseller_watch_rules_created_at_idx on public.reseller_watch_rules(created_at desc);
create index if not exists reseller_watch_rules_created_by_idx on public.reseller_watch_rules(created_by);

drop policy if exists reseller_deals_private_select on public.reseller_deals;
create policy reseller_deals_private_select on public.reseller_deals
for select to authenticated
using ((select auth.uid()) in (
  'ccf25333-47cd-42ca-a20b-cdbc63a8a695'::uuid,
  '6dd51b31-5974-4691-b8b8-83e5877528c0'::uuid
));

drop policy if exists reseller_deals_private_insert on public.reseller_deals;
create policy reseller_deals_private_insert on public.reseller_deals
for insert to authenticated
with check (
  (select auth.uid()) in (
    'ccf25333-47cd-42ca-a20b-cdbc63a8a695'::uuid,
    '6dd51b31-5974-4691-b8b8-83e5877528c0'::uuid
  ) and created_by = (select auth.uid())
);

drop policy if exists reseller_deals_private_update on public.reseller_deals;
create policy reseller_deals_private_update on public.reseller_deals
for update to authenticated
using ((select auth.uid()) in (
  'ccf25333-47cd-42ca-a20b-cdbc63a8a695'::uuid,
  '6dd51b31-5974-4691-b8b8-83e5877528c0'::uuid
))
with check ((select auth.uid()) in (
  'ccf25333-47cd-42ca-a20b-cdbc63a8a695'::uuid,
  '6dd51b31-5974-4691-b8b8-83e5877528c0'::uuid
));

drop policy if exists reseller_deals_private_delete on public.reseller_deals;
create policy reseller_deals_private_delete on public.reseller_deals
for delete to authenticated
using ((select auth.uid()) in (
  'ccf25333-47cd-42ca-a20b-cdbc63a8a695'::uuid,
  '6dd51b31-5974-4691-b8b8-83e5877528c0'::uuid
));

drop policy if exists reseller_watch_private_select on public.reseller_watch_rules;
create policy reseller_watch_private_select on public.reseller_watch_rules
for select to authenticated
using ((select auth.uid()) in (
  'ccf25333-47cd-42ca-a20b-cdbc63a8a695'::uuid,
  '6dd51b31-5974-4691-b8b8-83e5877528c0'::uuid
));

drop policy if exists reseller_watch_private_insert on public.reseller_watch_rules;
create policy reseller_watch_private_insert on public.reseller_watch_rules
for insert to authenticated
with check (
  (select auth.uid()) in (
    'ccf25333-47cd-42ca-a20b-cdbc63a8a695'::uuid,
    '6dd51b31-5974-4691-b8b8-83e5877528c0'::uuid
  ) and created_by = (select auth.uid())
);

drop policy if exists reseller_watch_private_update on public.reseller_watch_rules;
create policy reseller_watch_private_update on public.reseller_watch_rules
for update to authenticated
using ((select auth.uid()) in (
  'ccf25333-47cd-42ca-a20b-cdbc63a8a695'::uuid,
  '6dd51b31-5974-4691-b8b8-83e5877528c0'::uuid
))
with check ((select auth.uid()) in (
  'ccf25333-47cd-42ca-a20b-cdbc63a8a695'::uuid,
  '6dd51b31-5974-4691-b8b8-83e5877528c0'::uuid
));

drop policy if exists reseller_watch_private_delete on public.reseller_watch_rules;
create policy reseller_watch_private_delete on public.reseller_watch_rules
for delete to authenticated
using ((select auth.uid()) in (
  'ccf25333-47cd-42ca-a20b-cdbc63a8a695'::uuid,
  '6dd51b31-5974-4691-b8b8-83e5877528c0'::uuid
));

create or replace function public.h38_private_reseller_touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by = old.created_by;
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.h38_private_reseller_touch_row() from public, anon, authenticated;

drop trigger if exists reseller_deals_touch on public.reseller_deals;
create trigger reseller_deals_touch before update on public.reseller_deals
for each row execute function public.h38_private_reseller_touch_row();

drop trigger if exists reseller_watch_rules_touch on public.reseller_watch_rules;
create trigger reseller_watch_rules_touch before update on public.reseller_watch_rules
for each row execute function public.h38_private_reseller_touch_row();
