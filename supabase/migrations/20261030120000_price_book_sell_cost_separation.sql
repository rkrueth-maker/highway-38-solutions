-- Price book sell/cost separation (2026-10-30, Fix Round 1 — data layer).
--
-- THE BUG: migration 20260812155839_contractor_assembly_catalog_sync.sql wrote
-- each assembly's customer SELL rate (price_book_assemblies.sell_rate) into
-- price_book_items.unit_cost and never set sell_price. unit_cost therefore
-- mixed genuine material/benchmark costs with assembly sell rates, so no
-- margin math could be trusted. price_book_assemblies.direct_cost_per_unit
-- is the genuine internal cost of an assembly; sell_rate is its price.
--
-- This migration:
--   1. Replaces sync_price_book_assembly_catalog() so future assembly syncs
--      write sell_price = sell_rate AND unit_cost = direct_cost_per_unit.
--      Everything else in the function is unchanged from the original.
--   2. Re-runs the corrected backfill for ALL assemblies (idempotent upsert
--      like the original trailing backfill) so rows the old backfill wrote —
--      and assemblies that only ever existed as alias items — end up right.
--   3. Repairs any remaining 'INSTALLED ASSEMBLY |%' items with no matching
--      assembly row (identity-safe alias rows): sell_price falls back to the
--      value currently stored in unit_cost, unit_cost becomes 0 (cost
--      unknown — never invented).
--   4. Repairs 'AI learned quote pricing' rows: the writer
--      (commercial-app/quote-ai-live-fix.js learnLocalResearchPrices, and its
--      bundled copy in bundle-features.js — both fixed in this same change)
--      stored a learned SELL rate in unit_cost. Those rows move the value to
--      sell_price and zero unit_cost. approval_status is never touched.
--   5. Adds internal cost columns to public.quote_items (relational quote
--      model) so a quote line can carry its own cost alongside its price.
--
-- Idempotent throughout: create or replace function, upserts, guarded
-- updates, add column if not exists. owner_review_required flags untouched.

-- ---------------------------------------------------------------------------
-- 1. Corrected sync function (identical to 20260812155839 except the
--    unit_cost / sell_price mapping).
-- ---------------------------------------------------------------------------
create or replace function public.sync_price_book_assembly_catalog()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.price_book_items
       set active = false,
           updated_at = now()
     where business_id = old.business_id
       and item_code = old.assembly_code;
    return old;
  end if;

  insert into public.price_book_items (
    business_id,
    item_code,
    category,
    description,
    unit,
    unit_cost,
    sell_price,
    source_type,
    source_note,
    approval_status,
    active,
    created_by,
    approved_by,
    approved_at,
    updated_at
  ) values (
    new.business_id,
    new.assembly_code,
    'INSTALLED ASSEMBLY | ' || new.category,
    'INSTALLED ASSEMBLY — ' || new.description,
    new.output_unit,
    new.direct_cost_per_unit,
    new.sell_rate,
    new.source_type,
    concat_ws(' ',
      new.source_note,
      'Assembly pricing method=' || new.pricing_method || '.',
      'Internal material waste=' || trim(to_char(new.material_waste_pct * 100, 'FM999990.##')) || '% minimum; do not inflate customer installed quantity.',
      'Recipe source: price_book_assemblies/' || new.assembly_code || '.'
    ),
    new.approval_status,
    new.active,
    new.created_by,
    new.approved_by,
    new.approved_at,
    now()
  )
  on conflict (business_id, item_code) do update set
    category = excluded.category,
    description = excluded.description,
    unit = excluded.unit,
    unit_cost = excluded.unit_cost,
    sell_price = excluded.sell_price,
    source_type = excluded.source_type,
    source_note = excluded.source_note,
    approval_status = excluded.approval_status,
    active = excluded.active,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.sync_price_book_assembly_catalog() from public, anon, authenticated;

drop trigger if exists price_book_assemblies_catalog_sync on public.price_book_assemblies;
create trigger price_book_assemblies_catalog_sync
  after insert or update or delete on public.price_book_assemblies
  for each row execute function public.sync_price_book_assembly_catalog();

-- ---------------------------------------------------------------------------
-- 2. Corrected backfill for all assemblies (the original migration's
--    trailing insert, with the sell/cost mapping fixed).
-- ---------------------------------------------------------------------------
insert into public.price_book_items (
  business_id,item_code,category,description,unit,unit_cost,sell_price,source_type,source_note,
  approval_status,active,created_by,approved_by,approved_at,updated_at
)
select
  a.business_id,
  a.assembly_code,
  'INSTALLED ASSEMBLY | ' || a.category,
  'INSTALLED ASSEMBLY — ' || a.description,
  a.output_unit,
  a.direct_cost_per_unit,
  a.sell_rate,
  a.source_type,
  concat_ws(' ',
    a.source_note,
    'Assembly pricing method=' || a.pricing_method || '.',
    'Internal material waste=' || trim(to_char(a.material_waste_pct * 100, 'FM999990.##')) || '% minimum; do not inflate customer installed quantity.',
    'Recipe source: price_book_assemblies/' || a.assembly_code || '.'
  ),
  a.approval_status,
  a.active,
  a.created_by,
  a.approved_by,
  a.approved_at,
  now()
from public.price_book_assemblies a
on conflict (business_id,item_code) do update set
  category=excluded.category,
  description=excluded.description,
  unit=excluded.unit,
  unit_cost=excluded.unit_cost,
  sell_price=excluded.sell_price,
  source_type=excluded.source_type,
  source_note=excluded.source_note,
  approval_status=excluded.approval_status,
  active=excluded.active,
  approved_by=excluded.approved_by,
  approved_at=excluded.approved_at,
  updated_at=now();

-- ---------------------------------------------------------------------------
-- 3. Remaining assembly items with no assembly row to join (alias rows):
--    the value sitting in unit_cost today IS the sell rate the old sync
--    wrote, so it becomes sell_price; cost is unknown, so unit_cost = 0.
--    The coalesce chain keeps a re-run from clobbering an already-moved
--    sell_price with the zeroed unit_cost.
-- ---------------------------------------------------------------------------
update public.price_book_items i
   set sell_price = coalesce(
         (select a.sell_rate
            from public.price_book_assemblies a
           where a.business_id = i.business_id
             and a.assembly_code = i.item_code),
         i.sell_price,
         i.unit_cost),
       unit_cost = coalesce(
         (select a.direct_cost_per_unit
            from public.price_book_assemblies a
           where a.business_id = i.business_id
             and a.assembly_code = i.item_code),
         0),
       updated_at = now()
 where i.category like 'INSTALLED ASSEMBLY |%';

-- ---------------------------------------------------------------------------
-- 4. Learned-price rows: unit_cost held a learned SELL rate. Move it to
--    sell_price (only where sell_price is not already set) and zero the
--    cost — the learned cost is unknown, never invented. SET expressions
--    read the pre-update row, and the sell_price-is-null guard makes a
--    re-run a no-op. approval_status is not touched.
-- ---------------------------------------------------------------------------
update public.price_book_items
   set sell_price = unit_cost,
       unit_cost = 0,
       updated_at = now()
 where category = 'AI learned quote pricing'
   and sell_price is null;

-- ---------------------------------------------------------------------------
-- 5. Internal cost columns on the relational quote model.
-- ---------------------------------------------------------------------------
alter table public.quote_items
  add column if not exists internal_unit_cost numeric(14,4)
    check (internal_unit_cost is null or internal_unit_cost >= 0);

alter table public.quote_items
  add column if not exists extended_cost numeric(14,2)
    generated always as (round(quantity * internal_unit_cost, 2)) stored;

alter table public.quote_items
  add column if not exists cost_source text
    check (cost_source is null or cost_source in
      ('material', 'labor', 'subcontractor', 'allowance', 'manual'));

alter table public.quote_items
  add column if not exists cost_updated_at timestamptz;

alter table public.quote_items
  add column if not exists cost_overridden boolean not null default false;

comment on column public.quote_items.internal_unit_cost is
  'Internal unit cost for this quote line (never customer-facing); NULL = cost unknown.';
comment on column public.quote_items.extended_cost is
  'Extended internal cost: round(quantity * internal_unit_cost, 2); NULL when internal_unit_cost is NULL.';
comment on column public.quote_items.cost_source is
  'Where the internal cost came from: material, labor, subcontractor, allowance, or manual.';
comment on column public.quote_items.cost_updated_at is
  'When internal_unit_cost was last set or changed.';
comment on column public.quote_items.cost_overridden is
  'True when an owner manually overrode the internal cost for this line.';
