create table if not exists public.coupon_watch_discovery_cache (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.coupon_watch_rules(id) on delete cascade,
  user_id uuid not null,
  source text not null default 'web',
  title text not null,
  snippet text not null default '',
  source_url text not null,
  price numeric,
  original_price numeric,
  discount_percent numeric,
  signal text not null default '',
  result_kind text not null default 'product',
  observed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '36 hours'),
  created_at timestamptz not null default now(),
  unique (watch_id, source_url)
);

alter table public.coupon_watch_discovery_cache enable row level security;

revoke all on table public.coupon_watch_discovery_cache from anon, authenticated;
grant select on table public.coupon_watch_discovery_cache to authenticated;

drop policy if exists coupon_watch_discovery_shared_select on public.coupon_watch_discovery_cache;
create policy coupon_watch_discovery_shared_select
on public.coupon_watch_discovery_cache
for select
to authenticated
using ((select private.coupon_can_access_owner(user_id)));

create index if not exists coupon_watch_discovery_watch_idx
  on public.coupon_watch_discovery_cache(watch_id, observed_at desc);

create index if not exists coupon_watch_discovery_expiry_idx
  on public.coupon_watch_discovery_cache(expires_at);
