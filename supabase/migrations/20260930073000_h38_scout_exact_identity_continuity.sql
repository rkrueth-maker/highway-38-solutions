-- Preserve verified market evidence when the same exact product is observed under a new
-- canonical key. Matching is deliberately conservative:
--   * exact normalized UPC may bridge retailers/sources;
--   * exact SKU may bridge keys only inside the same canonical source/retailer namespace.
-- No fuzzy title matching is used, so nearby variants do not inherit each other's comps.

create index if not exists deal_engine_market_evidence_upc_idx
  on public.deal_engine_market_evidence (household_id, (regexp_replace(upc, '[^0-9]', '', 'g')))
  where coalesce(trim(upc), '') <> '';

create index if not exists deal_engine_market_evidence_sku_idx
  on public.deal_engine_market_evidence (household_id, lower(sku))
  where coalesce(trim(sku), '') <> '';

create index if not exists deal_engine_observations_upc_idx
  on public.deal_engine_observations (household_id, (regexp_replace(upc, '[^0-9]', '', 'g')))
  where coalesce(trim(upc), '') <> '';

create index if not exists deal_engine_observations_sku_idx
  on public.deal_engine_observations (household_id, lower(sku))
  where coalesce(trim(sku), '') <> '';

-- Backfill evidence aliases that can be proven by an exact strong identifier.
insert into public.deal_engine_market_evidence (
  household_id, canonical_key, created_by, evidence_type, marketplace, title,
  source_url, observed_price, shipping_price, condition_label, upc, sku, asin,
  confidence_score, observed_at, sold_at, notes, created_at, updated_at
)
select
  e.household_id,
  o.canonical_key,
  e.created_by,
  e.evidence_type,
  e.marketplace,
  e.title,
  e.source_url,
  e.observed_price,
  e.shipping_price,
  e.condition_label,
  e.upc,
  e.sku,
  e.asin,
  e.confidence_score,
  e.observed_at,
  e.sold_at,
  e.notes,
  e.created_at,
  e.updated_at
from public.deal_engine_market_evidence e
join public.deal_engine_observations o
  on o.household_id = e.household_id
 and o.canonical_key <> e.canonical_key
 and coalesce(trim(e.source_url), '') <> ''
 and (
   (
     coalesce(trim(e.upc), '') <> ''
     and coalesce(trim(o.upc), '') <> ''
     and regexp_replace(e.upc, '[^0-9]', '', 'g') = regexp_replace(o.upc, '[^0-9]', '', 'g')
     and regexp_replace(e.upc, '[^0-9]', '', 'g') <> ''
   )
   or
   (
     coalesce(trim(e.sku), '') <> ''
     and coalesce(trim(o.sku), '') <> ''
     and lower(trim(e.sku)) = lower(trim(o.sku))
     and split_part(lower(e.canonical_key), '|', 1) = split_part(lower(o.canonical_key), '|', 1)
   )
 )
on conflict do nothing;

create or replace function private.h38_deal_engine_evidence_alias_out()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if coalesce(trim(new.source_url), '') = '' then return new; end if;
  if coalesce(trim(new.upc), '') = '' and coalesce(trim(new.sku), '') = '' then return new; end if;

  insert into public.deal_engine_market_evidence (
    household_id, canonical_key, created_by, evidence_type, marketplace, title,
    source_url, observed_price, shipping_price, condition_label, upc, sku, asin,
    confidence_score, observed_at, sold_at, notes, created_at, updated_at
  )
  select
    new.household_id,
    o.canonical_key,
    new.created_by,
    new.evidence_type,
    new.marketplace,
    new.title,
    new.source_url,
    new.observed_price,
    new.shipping_price,
    new.condition_label,
    new.upc,
    new.sku,
    new.asin,
    new.confidence_score,
    new.observed_at,
    new.sold_at,
    new.notes,
    new.created_at,
    new.updated_at
  from public.deal_engine_observations o
  where o.household_id = new.household_id
    and o.canonical_key <> new.canonical_key
    and (
      (
        coalesce(trim(new.upc), '') <> ''
        and coalesce(trim(o.upc), '') <> ''
        and regexp_replace(new.upc, '[^0-9]', '', 'g') = regexp_replace(o.upc, '[^0-9]', '', 'g')
        and regexp_replace(new.upc, '[^0-9]', '', 'g') <> ''
      )
      or
      (
        coalesce(trim(new.sku), '') <> ''
        and coalesce(trim(o.sku), '') <> ''
        and lower(trim(new.sku)) = lower(trim(o.sku))
        and split_part(lower(new.canonical_key), '|', 1) = split_part(lower(o.canonical_key), '|', 1)
      )
    )
  on conflict do nothing;

  return new;
end;
$$;

create or replace function private.h38_deal_engine_observation_alias_in()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if coalesce(trim(new.upc), '') = '' and coalesce(trim(new.sku), '') = '' then return new; end if;

  insert into public.deal_engine_market_evidence (
    household_id, canonical_key, created_by, evidence_type, marketplace, title,
    source_url, observed_price, shipping_price, condition_label, upc, sku, asin,
    confidence_score, observed_at, sold_at, notes, created_at, updated_at
  )
  select
    e.household_id,
    new.canonical_key,
    e.created_by,
    e.evidence_type,
    e.marketplace,
    e.title,
    e.source_url,
    e.observed_price,
    e.shipping_price,
    e.condition_label,
    e.upc,
    e.sku,
    e.asin,
    e.confidence_score,
    e.observed_at,
    e.sold_at,
    e.notes,
    e.created_at,
    e.updated_at
  from public.deal_engine_market_evidence e
  where e.household_id = new.household_id
    and e.canonical_key <> new.canonical_key
    and coalesce(trim(e.source_url), '') <> ''
    and (
      (
        coalesce(trim(new.upc), '') <> ''
        and coalesce(trim(e.upc), '') <> ''
        and regexp_replace(new.upc, '[^0-9]', '', 'g') = regexp_replace(e.upc, '[^0-9]', '', 'g')
        and regexp_replace(new.upc, '[^0-9]', '', 'g') <> ''
      )
      or
      (
        coalesce(trim(new.sku), '') <> ''
        and coalesce(trim(e.sku), '') <> ''
        and lower(trim(new.sku)) = lower(trim(e.sku))
        and split_part(lower(new.canonical_key), '|', 1) = split_part(lower(e.canonical_key), '|', 1)
      )
    )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists z_h38_deal_engine_evidence_alias_out on public.deal_engine_market_evidence;
create trigger z_h38_deal_engine_evidence_alias_out
after insert or update of canonical_key, upc, sku, source_url
on public.deal_engine_market_evidence
for each row execute function private.h38_deal_engine_evidence_alias_out();

drop trigger if exists z_h38_deal_engine_observation_alias_in on public.deal_engine_observations;
create trigger z_h38_deal_engine_observation_alias_in
after insert or update of canonical_key, upc, sku
on public.deal_engine_observations
for each row execute function private.h38_deal_engine_observation_alias_in();

revoke all on function private.h38_deal_engine_evidence_alias_out() from public, anon, authenticated;
revoke all on function private.h38_deal_engine_observation_alias_in() from public, anon, authenticated;
