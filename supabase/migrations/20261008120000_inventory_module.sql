-- Inventory & Materials module (2026-10-08).
-- Ricky restarted this build because Northern Lakes (live Tier-2 tenant)
-- rents equipment and sells salt/materials they advertise, and reorder
-- support was missing. Additive only: existing rows keep today's behavior
-- (app falls back to unit_cost when sell_price is null; sellable defaults
-- true to match the pre-module price book; reorder point stays unset so
-- nothing new alerts until an owner sets one).
alter table public.price_book_items
  add column if not exists sell_price numeric(14,4),
  add column if not exists reorder_point numeric(14,4),
  add column if not exists sellable boolean not null default true,
  add column if not exists rentable boolean not null default false,
  add column if not exists rental_rate numeric(14,4),
  add column if not exists advertise boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'price_book_items_sell_price_nonneg') then
    alter table public.price_book_items
      add constraint price_book_items_sell_price_nonneg check (sell_price is null or sell_price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'price_book_items_reorder_point_nonneg') then
    alter table public.price_book_items
      add constraint price_book_items_reorder_point_nonneg check (reorder_point is null or reorder_point >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'price_book_items_rental_rate_nonneg') then
    alter table public.price_book_items
      add constraint price_book_items_rental_rate_nonneg check (rental_rate is null or rental_rate >= 0);
  end if;
end $$;

comment on column public.price_book_items.sell_price is 'Customer-facing sell price; NULL = app falls back to unit_cost (pre-2026-10 behavior).';
comment on column public.price_book_items.reorder_point is 'Low-stock threshold; on-hand at or below this flags the reorder view.';
comment on column public.price_book_items.sellable is 'May be sold on quotes/invoices (Inventory & Materials module).';
comment on column public.price_book_items.rentable is 'May be rented (Inventory & Materials module); rental_rate is the per-unit rental price.';
comment on column public.price_book_items.advertise is 'Owner opted this item into the advertised-stock list (name + availability only, never cost or exact counts).';
