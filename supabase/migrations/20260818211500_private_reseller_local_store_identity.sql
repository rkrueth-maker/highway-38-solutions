-- Give every private reseller find a physical-store identity so finds can be grouped
-- under nearby stores instead of mixed into a generic online feed.
alter table public.reseller_deals add column if not exists store_key text not null default '';
alter table public.reseller_deals add column if not exists store_name text not null default '';
alter table public.reseller_deals add column if not exists store_address text not null default '';
alter table public.reseller_deals add column if not exists store_lat double precision;
alter table public.reseller_deals add column if not exists store_lon double precision;
alter table public.reseller_deals add column if not exists verified_at timestamptz;
alter table public.reseller_deals add column if not exists verification_status text not null default 'reported';
alter table public.reseller_deals add column if not exists reported_quantity integer not null default 0;

alter table public.reseller_deals drop constraint if exists reseller_deals_verification_status_check;
alter table public.reseller_deals add constraint reseller_deals_verification_status_check
  check (verification_status in ('reported','price_confirmed','in_stock','empty','refused','expired'));

create index if not exists reseller_deals_store_key_idx on public.reseller_deals(store_key);
create index if not exists reseller_deals_verified_at_idx on public.reseller_deals(verified_at desc);

update public.reseller_deals
set store_name = case when store_name = '' then retailer else store_name end,
    store_address = case when store_address = '' then location_text else store_address end,
    verified_at = coalesce(verified_at, updated_at)
where store_name = '' or store_address = '' or verified_at is null;
