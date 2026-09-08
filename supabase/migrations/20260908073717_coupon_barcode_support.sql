alter table public.coupon_list_items add column if not exists barcode text not null default '';
alter table public.coupon_price_observations add column if not exists barcode text not null default '';
create index if not exists coupon_price_observations_user_barcode_idx on public.coupon_price_observations(user_id,barcode) where barcode <> '';
create index if not exists coupon_price_observations_user_item_idx on public.coupon_price_observations(user_id,item_name);
