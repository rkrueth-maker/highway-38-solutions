alter table public.coupon_watch_rules
  add column if not exists watch_mode text not null default 'specific';

alter table public.coupon_watch_rules
  drop constraint if exists coupon_watch_rules_watch_mode_check;

alter table public.coupon_watch_rules
  add constraint coupon_watch_rules_watch_mode_check
  check (watch_mode in ('specific','discovery'));

update public.coupon_watch_rules
set watch_mode = 'specific'
where watch_mode is null or watch_mode not in ('specific','discovery');
