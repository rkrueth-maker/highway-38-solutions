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

create trigger price_book_assemblies_catalog_sync
  after insert or update or delete on public.price_book_assemblies
  for each row execute function public.sync_price_book_assembly_catalog();

insert into public.price_book_items (
  business_id,item_code,category,description,unit,unit_cost,source_type,source_note,
  approval_status,active,created_by,approved_by,approved_at,updated_at
)
select
  a.business_id,
  a.assembly_code,
  'INSTALLED ASSEMBLY | ' || a.category,
  'INSTALLED ASSEMBLY — ' || a.description,
  a.output_unit,
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
  source_type=excluded.source_type,
  source_note=excluded.source_note,
  approval_status=excluded.approval_status,
  active=excluded.active,
  approved_by=excluded.approved_by,
  approved_at=excluded.approved_at,
  updated_at=now();

update public.price_book_items
   set description = 'RAW MATERIAL ONLY — ' || description,
       updated_at = now()
 where category like 'RAW MATERIAL |%'
   and description not like 'RAW MATERIAL ONLY — %';
