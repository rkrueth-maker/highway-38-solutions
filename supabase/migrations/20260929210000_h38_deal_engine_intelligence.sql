-- H38 Deal Engine next-level intelligence foundation.
-- Additive and rollback-preserving: existing observations, history, actions, watches, and queue rows are preserved.

alter table public.deal_engine_sourcing_queue
  add column if not exists item_title text not null default '',
  add column if not exists retailer text not null default '',
  add column if not exists source_url text not null default '',
  add column if not exists upc text not null default '',
  add column if not exists sku text not null default '',
  add column if not exists unit_buy_price numeric,
  add column if not exists coupon_amount numeric,
  add column if not exists rebate_amount numeric,
  add column if not exists sales_tax numeric,
  add column if not exists travel_cost numeric,
  add column if not exists marketplace_fee numeric,
  add column if not exists payment_fee numeric,
  add column if not exists outbound_shipping numeric,
  add column if not exists packing_cost numeric,
  add column if not exists expected_sale_price numeric,
  add column if not exists target_roi_percent numeric,
  add column if not exists break_even_price numeric,
  add column if not exists max_buy_price numeric,
  add column if not exists projected_profit numeric,
  add column if not exists projected_roi_percent numeric,
  add column if not exists projected_margin_percent numeric,
  add column if not exists listing_marketplace text not null default '',
  add column if not exists listing_url text not null default '',
  add column if not exists listing_price numeric,
  add column if not exists storage_location text not null default '',
  add column if not exists receipt_url text not null default '',
  add column if not exists actual_marketplace_fee numeric,
  add column if not exists actual_payment_fee numeric,
  add column if not exists actual_shipping numeric,
  add column if not exists actual_packing_cost numeric,
  add column if not exists realized_profit numeric,
  add column if not exists realized_roi_percent numeric,
  add column if not exists purchased_at timestamptz,
  add column if not exists listed_at timestamptz,
  add column if not exists sold_at timestamptz;

create table if not exists public.deal_engine_market_evidence (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.coupon_households(id) on delete cascade,
  canonical_key text not null,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  evidence_type text not null check (evidence_type in ('sold','active','completed')),
  marketplace text not null default '',
  title text not null default '',
  source_url text not null default '',
  observed_price numeric,
  shipping_price numeric,
  condition_label text not null default '',
  upc text not null default '',
  sku text not null default '',
  asin text not null default '',
  confidence_score numeric not null default 0 check (confidence_score >= 0 and confidence_score <= 100),
  observed_at timestamptz not null default now(),
  sold_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists deal_engine_market_evidence_source_idx
  on public.deal_engine_market_evidence(household_id, canonical_key, evidence_type, source_url)
  where source_url <> '';

create index if not exists deal_engine_market_evidence_item_idx
  on public.deal_engine_market_evidence(household_id, canonical_key, evidence_type, observed_at desc);

create index if not exists deal_engine_queue_status_lifecycle_idx
  on public.deal_engine_sourcing_queue(household_id, status, sold_at desc, updated_at desc);

alter table public.deal_engine_market_evidence enable row level security;
revoke all on table public.deal_engine_market_evidence from anon, authenticated;
grant select,insert,update,delete on table public.deal_engine_market_evidence to authenticated;

drop policy if exists deal_engine_market_evidence_read on public.deal_engine_market_evidence;
create policy deal_engine_market_evidence_read on public.deal_engine_market_evidence
for select to authenticated
using (household_id in (select private.current_coupon_household_ids()));

drop policy if exists deal_engine_market_evidence_insert on public.deal_engine_market_evidence;
create policy deal_engine_market_evidence_insert on public.deal_engine_market_evidence
for insert to authenticated
with check (
  household_id in (select private.current_coupon_household_ids())
  and created_by = (select auth.uid())
);

drop policy if exists deal_engine_market_evidence_update on public.deal_engine_market_evidence;
create policy deal_engine_market_evidence_update on public.deal_engine_market_evidence
for update to authenticated
using (household_id in (select private.current_coupon_household_ids()))
with check (household_id in (select private.current_coupon_household_ids()));

drop policy if exists deal_engine_market_evidence_delete on public.deal_engine_market_evidence;
create policy deal_engine_market_evidence_delete on public.deal_engine_market_evidence
for delete to authenticated
using (household_id in (select private.current_coupon_household_ids()));
