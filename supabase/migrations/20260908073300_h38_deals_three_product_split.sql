create table if not exists public.h38_product_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_key text not null check (product_key in ('penny','resale','coupon')),
  active boolean not null default true,
  plan text not null default 'owner_test',
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_key)
);
alter table public.h38_product_entitlements enable row level security;
revoke all on public.h38_product_entitlements from anon;
grant select on public.h38_product_entitlements to authenticated;
create policy h38_entitlements_read_own on public.h38_product_entitlements for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.coupon_shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Shopping List',
  status text not null default 'active' check (status in ('active','shopping','complete','archived')),
  optimize_mode text not null default 'practical' check (optimize_mode in ('single_store','two_stores','practical','maximum_savings')),
  max_stores integer not null default 2 check (max_stores between 1 and 8),
  budget numeric null check (budget is null or budget >= 0),
  travel_cost_per_mile numeric not null default 0.25 check (travel_cost_per_mile >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.coupon_shopping_lists enable row level security;
grant select,insert,update,delete on public.coupon_shopping_lists to authenticated;
create policy coupon_lists_own on public.coupon_shopping_lists for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create table if not exists public.coupon_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.coupon_shopping_lists(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_name text not null,
  brand_preference text not null default '',
  category text not null default 'other',
  quantity numeric not null default 1 check (quantity > 0),
  unit text not null default 'each',
  required boolean not null default true,
  target_price numeric null check (target_price is null or target_price >= 0),
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.coupon_list_items enable row level security;
grant select,insert,update,delete on public.coupon_list_items to authenticated;
create policy coupon_items_own on public.coupon_list_items for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create table if not exists public.coupon_price_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_name text not null,
  brand text not null default '',
  store text not null,
  shelf_price numeric not null check (shelf_price >= 0),
  sale_discount numeric not null default 0 check (sale_discount >= 0),
  store_coupon numeric not null default 0 check (store_coupon >= 0),
  manufacturer_coupon numeric not null default 0 check (manufacturer_coupon >= 0),
  rebate numeric not null default 0 check (rebate >= 0),
  loyalty_value numeric not null default 0 check (loyalty_value >= 0),
  required_qty numeric not null default 1 check (required_qty > 0),
  package_qty numeric not null default 1 check (package_qty > 0),
  unit_label text not null default 'each',
  distance_miles numeric not null default 0 check (distance_miles >= 0),
  confidence text not null default 'medium' check (confidence in ('high','medium','low')),
  source_note text not null default '',
  observed_at timestamptz not null default now()
);
alter table public.coupon_price_observations enable row level security;
grant select,insert,update,delete on public.coupon_price_observations to authenticated;
create policy coupon_prices_own on public.coupon_price_observations for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create table if not exists public.coupon_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  store text not null default '',
  total numeric not null default 0 check (total >= 0),
  purchased_at timestamptz not null default now(),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items)='array'),
  notes text not null default '',
  created_at timestamptz not null default now()
);
alter table public.coupon_receipts enable row level security;
grant select,insert,update,delete on public.coupon_receipts to authenticated;
create policy coupon_receipts_own on public.coupon_receipts for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create table if not exists public.coupon_watch_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_name text not null,
  brand text not null default '',
  target_effective_price numeric null check (target_effective_price is null or target_effective_price >= 0),
  target_discount_percent numeric null check (target_discount_percent is null or target_discount_percent between 0 and 100),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.coupon_watch_rules enable row level security;
grant select,insert,update,delete on public.coupon_watch_rules to authenticated;
create policy coupon_watch_own on public.coupon_watch_rules for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
