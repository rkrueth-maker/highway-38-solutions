-- H38 Scout P0 continuity repair.
-- Truth-first: snapshot what is known at Buy time, preserve unknown economics as NULL,
-- remove acceptance-only QA rows from live feeds, and cover the market-evidence creator FK.

create index if not exists deal_engine_market_evidence_created_by_idx
  on public.deal_engine_market_evidence(created_by);

create or replace function public.h38_deal_engine_snapshot_queue()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  o record;
begin
  select
    title,
    retailer,
    source_url,
    upc,
    sku,
    observed_price,
    expected_resale
  into o
  from public.deal_engine_observations
  where household_id = new.household_id
    and canonical_key = new.canonical_key
  order by active desc, observed_at desc
  limit 1;

  if found then
    if coalesce(new.item_title, '') = '' then new.item_title := coalesce(o.title, ''); end if;
    if coalesce(new.retailer, '') = '' then new.retailer := coalesce(o.retailer, ''); end if;
    if coalesce(new.source_url, '') = '' then new.source_url := coalesce(o.source_url, ''); end if;
    if coalesce(new.upc, '') = '' then new.upc := coalesce(o.upc, ''); end if;
    if coalesce(new.sku, '') = '' then new.sku := coalesce(o.sku, ''); end if;
    if new.unit_buy_price is null then new.unit_buy_price := o.observed_price; end if;
    if new.estimated_cost is null then new.estimated_cost := o.observed_price; end if;
    if new.expected_sale_price is null then new.expected_sale_price := o.expected_resale; end if;
  end if;

  return new;
end;
$$;

drop trigger if exists a_h38_deal_engine_queue_snapshot on public.deal_engine_sourcing_queue;
create trigger a_h38_deal_engine_queue_snapshot
before insert or update on public.deal_engine_sourcing_queue
for each row execute function public.h38_deal_engine_snapshot_queue();

-- Backfill only source/item facts that can be recovered from the exact canonical observation.
-- Do not manufacture coupons, fees, shipping, tax, travel, resale, or realized economics.
with latest as (
  select distinct on (household_id, canonical_key)
    household_id,
    canonical_key,
    title,
    retailer,
    source_url,
    upc,
    sku,
    observed_price,
    expected_resale
  from public.deal_engine_observations
  order by household_id, canonical_key, active desc, observed_at desc
)
update public.deal_engine_sourcing_queue q
set
  item_title = case when coalesce(q.item_title,'') = '' then coalesce(o.title,'') else q.item_title end,
  retailer = case when coalesce(q.retailer,'') = '' then coalesce(o.retailer,'') else q.retailer end,
  source_url = case when coalesce(q.source_url,'') = '' then coalesce(o.source_url,'') else q.source_url end,
  upc = case when coalesce(q.upc,'') = '' then coalesce(o.upc,'') else q.upc end,
  sku = case when coalesce(q.sku,'') = '' then coalesce(o.sku,'') else q.sku end,
  unit_buy_price = coalesce(q.unit_buy_price, o.observed_price),
  estimated_cost = coalesce(q.estimated_cost, o.observed_price),
  expected_sale_price = coalesce(q.expected_sale_price, o.expected_resale),
  updated_at = q.updated_at
from latest o
where o.household_id = q.household_id
  and o.canonical_key = q.canonical_key
  and (
    coalesce(q.item_title,'') = '' or coalesce(q.retailer,'') = '' or
    coalesce(q.source_url,'') = '' or coalesce(q.upc,'') = '' or coalesce(q.sku,'') = '' or
    q.unit_buy_price is null or q.estimated_cost is null or q.expected_sale_price is null
  );

-- Acceptance rows are deliberately recognizable. Remove only that exact QA namespace.
delete from public.coupon_price_observations
where lower(coalesce(store,'')) = 'qa store'
  and lower(coalesce(item_name,'')) like 'h38 qa%';

update public.deal_engine_observations
set active = false
where active = true
  and lower(coalesce(retailer,'')) = 'qa store'
  and lower(coalesce(title,'')) like 'h38 qa%'
  and source_kind = 'coupon_price_observation';
