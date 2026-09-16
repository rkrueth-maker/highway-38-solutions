-- H38 Deals maintenance hardening
-- Scope: Scout / Deals subsystem only.

alter function public.sanitize_reseller_store_discovery_tiles()
  set search_path = public, pg_temp;

revoke execute on function public.sanitize_reseller_store_discovery_tiles() from public;
revoke execute on function public.sanitize_reseller_store_discovery_tiles() from anon;
revoke execute on function public.sanitize_reseller_store_discovery_tiles() from authenticated;
grant execute on function public.sanitize_reseller_store_discovery_tiles() to service_role;

create index if not exists coupon_list_items_list_id_idx
  on public.coupon_list_items (list_id);

create index if not exists coupon_list_items_user_id_idx
  on public.coupon_list_items (user_id);

create index if not exists coupon_receipts_user_id_idx
  on public.coupon_receipts (user_id);

create index if not exists coupon_shopping_lists_user_id_idx
  on public.coupon_shopping_lists (user_id);

create index if not exists coupon_watch_rules_user_id_idx
  on public.coupon_watch_rules (user_id);

create index if not exists reseller_deals_updated_by_idx
  on public.reseller_deals (updated_by);
