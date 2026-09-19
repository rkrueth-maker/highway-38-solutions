alter table public.coupon_watch_rules
  add column if not exists source text not null default 'all',
  add column if not exists source_ref text not null default '',
  add column if not exists source_url text not null default '',
  add column if not exists last_price numeric,
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_status text not null default '';

alter table public.coupon_watch_rules
  drop constraint if exists coupon_watch_rules_source_check;

alter table public.coupon_watch_rules
  add constraint coupon_watch_rules_source_check
  check (source in ('all','amazon'));

create index if not exists coupon_watch_rules_user_source_idx
  on public.coupon_watch_rules(user_id, source)
  where enabled = true;
