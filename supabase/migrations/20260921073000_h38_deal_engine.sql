create table if not exists public.deal_engine_observations (
  household_id uuid not null references public.coupon_households(id) on delete cascade,
  canonical_key text not null,
  product_area text not null check (product_area in ('penny','resale','coupon','watch')),
  source_name text not null default '',
  source_kind text not null default '',
  source_scope text not null default '',
  retailer text not null default '',
  title text not null,
  upc text not null default '',
  sku text not null default '',
  image_url text not null default '',
  source_url text not null default '',
  observed_price numeric,
  regular_price numeric,
  expected_resale numeric,
  estimated_fees numeric,
  estimated_shipping numeric,
  estimated_travel numeric,
  other_costs numeric,
  discount_percent numeric,
  estimated_profit numeric,
  roi_percent numeric,
  confidence_score numeric not null default 0,
  opportunity_score numeric not null default 0,
  evidence_status text not null default 'VERIFY',
  availability_label text not null default '',
  location_text text not null default '',
  distance_miles numeric,
  observed_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  primary key (household_id, canonical_key)
);

create table if not exists public.deal_engine_price_history (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.coupon_households(id) on delete cascade,
  canonical_key text not null,
  retailer text not null default '',
  title text not null default '',
  source_name text not null default '',
  observed_price numeric,
  regular_price numeric,
  expected_resale numeric,
  discount_percent numeric,
  estimated_profit numeric,
  roi_percent numeric,
  confidence_score numeric not null default 0,
  opportunity_score numeric not null default 0,
  observed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.deal_engine_watch_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.coupon_households(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  query_text text not null,
  retailer text not null default '',
  product_area text not null default 'all' check (product_area in ('all','penny','resale','coupon','watch')),
  watch_mode text not null default 'keyword' check (watch_mode in ('specific','keyword','category','rule')),
  source_ref text not null default '',
  source_url text not null default '',
  max_buy_price numeric,
  min_discount_percent numeric,
  min_expected_profit numeric,
  min_roi_percent numeric,
  enabled boolean not null default true,
  last_checked_at timestamptz,
  last_status text not null default '',
  legacy_reseller_watch_id uuid,
  legacy_coupon_watch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deal_engine_actions (
  household_id uuid not null references public.coupon_households(id) on delete cascade,
  canonical_key text not null,
  action text not null check (action in ('buy','pass','watch')),
  notes text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, canonical_key)
);

create table if not exists public.deal_engine_sourcing_queue (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.coupon_households(id) on delete cascade,
  canonical_key text not null,
  selected_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'planned' check (status in ('planned','purchased','listed','sold','cancelled')),
  estimated_cost numeric,
  actual_cost numeric,
  actual_sale_price numeric,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deal_engine_state (
  household_id uuid primary key references public.coupon_households(id) on delete cascade,
  last_refresh_at timestamptz,
  last_refresh_by uuid references auth.users(id) on delete set null,
  observation_count integer not null default 0,
  source_counts jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists deal_engine_observations_score_idx
  on public.deal_engine_observations(household_id, active, opportunity_score desc);
create index if not exists deal_engine_observations_seen_idx
  on public.deal_engine_observations(household_id, observed_at desc);
create index if not exists deal_engine_observations_retailer_idx
  on public.deal_engine_observations(household_id, retailer);
create index if not exists deal_engine_history_item_idx
  on public.deal_engine_price_history(household_id, canonical_key, observed_at desc);
create index if not exists deal_engine_watch_household_idx
  on public.deal_engine_watch_rules(household_id, enabled, updated_at desc);
create index if not exists deal_engine_queue_household_idx
  on public.deal_engine_sourcing_queue(household_id, status, updated_at desc);
create unique index if not exists deal_engine_queue_open_item_idx
  on public.deal_engine_sourcing_queue(household_id, canonical_key)
  where status in ('planned','purchased','listed');

alter table public.deal_engine_observations enable row level security;
alter table public.deal_engine_price_history enable row level security;
alter table public.deal_engine_watch_rules enable row level security;
alter table public.deal_engine_actions enable row level security;
alter table public.deal_engine_sourcing_queue enable row level security;
alter table public.deal_engine_state enable row level security;

revoke all on table public.deal_engine_observations from anon, authenticated;
revoke all on table public.deal_engine_price_history from anon, authenticated;
revoke all on table public.deal_engine_watch_rules from anon, authenticated;
revoke all on table public.deal_engine_actions from anon, authenticated;
revoke all on table public.deal_engine_sourcing_queue from anon, authenticated;
revoke all on table public.deal_engine_state from anon, authenticated;

grant select on table public.deal_engine_observations to authenticated;
grant select on table public.deal_engine_price_history to authenticated;
grant select,insert,update,delete on table public.deal_engine_watch_rules to authenticated;
grant select,insert,update,delete on table public.deal_engine_actions to authenticated;
grant select,insert,update,delete on table public.deal_engine_sourcing_queue to authenticated;
grant select on table public.deal_engine_state to authenticated;

drop policy if exists deal_engine_observations_read on public.deal_engine_observations;
create policy deal_engine_observations_read on public.deal_engine_observations
for select to authenticated
using (household_id in (select private.current_coupon_household_ids()));

drop policy if exists deal_engine_history_read on public.deal_engine_price_history;
create policy deal_engine_history_read on public.deal_engine_price_history
for select to authenticated
using (household_id in (select private.current_coupon_household_ids()));

drop policy if exists deal_engine_state_read on public.deal_engine_state;
create policy deal_engine_state_read on public.deal_engine_state
for select to authenticated
using (household_id in (select private.current_coupon_household_ids()));

drop policy if exists deal_engine_watch_read on public.deal_engine_watch_rules;
create policy deal_engine_watch_read on public.deal_engine_watch_rules
for select to authenticated
using (household_id in (select private.current_coupon_household_ids()));
drop policy if exists deal_engine_watch_insert on public.deal_engine_watch_rules;
create policy deal_engine_watch_insert on public.deal_engine_watch_rules
for insert to authenticated
with check (
  household_id in (select private.current_coupon_household_ids())
  and created_by = (select auth.uid())
);
drop policy if exists deal_engine_watch_update on public.deal_engine_watch_rules;
create policy deal_engine_watch_update on public.deal_engine_watch_rules
for update to authenticated
using (household_id in (select private.current_coupon_household_ids()))
with check (household_id in (select private.current_coupon_household_ids()));
drop policy if exists deal_engine_watch_delete on public.deal_engine_watch_rules;
create policy deal_engine_watch_delete on public.deal_engine_watch_rules
for delete to authenticated
using (household_id in (select private.current_coupon_household_ids()));

drop policy if exists deal_engine_actions_read on public.deal_engine_actions;
create policy deal_engine_actions_read on public.deal_engine_actions
for select to authenticated
using (household_id in (select private.current_coupon_household_ids()));
drop policy if exists deal_engine_actions_insert on public.deal_engine_actions;
create policy deal_engine_actions_insert on public.deal_engine_actions
for insert to authenticated
with check (
  household_id in (select private.current_coupon_household_ids())
  and created_by = (select auth.uid())
);
drop policy if exists deal_engine_actions_update on public.deal_engine_actions;
create policy deal_engine_actions_update on public.deal_engine_actions
for update to authenticated
using (household_id in (select private.current_coupon_household_ids()))
with check (household_id in (select private.current_coupon_household_ids()));
drop policy if exists deal_engine_actions_delete on public.deal_engine_actions;
create policy deal_engine_actions_delete on public.deal_engine_actions
for delete to authenticated
using (household_id in (select private.current_coupon_household_ids()));

drop policy if exists deal_engine_queue_read on public.deal_engine_sourcing_queue;
create policy deal_engine_queue_read on public.deal_engine_sourcing_queue
for select to authenticated
using (household_id in (select private.current_coupon_household_ids()));
drop policy if exists deal_engine_queue_insert on public.deal_engine_sourcing_queue;
create policy deal_engine_queue_insert on public.deal_engine_sourcing_queue
for insert to authenticated
with check (
  household_id in (select private.current_coupon_household_ids())
  and selected_by = (select auth.uid())
);
drop policy if exists deal_engine_queue_update on public.deal_engine_sourcing_queue;
create policy deal_engine_queue_update on public.deal_engine_sourcing_queue
for update to authenticated
using (household_id in (select private.current_coupon_household_ids()))
with check (household_id in (select private.current_coupon_household_ids()));
drop policy if exists deal_engine_queue_delete on public.deal_engine_sourcing_queue;
create policy deal_engine_queue_delete on public.deal_engine_sourcing_queue
for delete to authenticated
using (household_id in (select private.current_coupon_household_ids()));
