create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.coupon_households (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.coupon_household_members (
  household_id uuid not null references public.coupon_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (household_id,user_id)
);

create index if not exists coupon_household_members_user_idx
  on public.coupon_household_members(user_id);

alter table public.coupon_households enable row level security;
alter table public.coupon_household_members enable row level security;

revoke all on table public.coupon_households from anon, authenticated;
revoke all on table public.coupon_household_members from anon, authenticated;
grant select on table public.coupon_households to authenticated;

create or replace function private.current_coupon_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id
  from public.coupon_household_members m
  where m.user_id = (select auth.uid())
$$;

revoke all on function private.current_coupon_household_ids() from public;
grant execute on function private.current_coupon_household_ids() to authenticated;

create or replace function private.coupon_can_access_owner(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coupon_household_members self_m
    join public.coupon_household_members target_m
      on target_m.household_id = self_m.household_id
    where self_m.user_id = (select auth.uid())
      and target_m.user_id = target_user_id
  )
$$;

revoke all on function private.coupon_can_access_owner(uuid) from public;
grant execute on function private.coupon_can_access_owner(uuid) to authenticated;

drop policy if exists coupon_households_read on public.coupon_households;
create policy coupon_households_read
on public.coupon_households
for select
to authenticated
using (id in (select private.current_coupon_household_ids()));

insert into public.coupon_households (slug,name,created_by)
select 'rick-amanda','Rick + Amanda',u.id
from auth.users u
where lower(u.email)=lower('highway38solutions@gmail.com')
on conflict (slug) do update set name=excluded.name;

insert into public.coupon_household_members (household_id,user_id,role)
select h.id,u.id,
       case when lower(u.email)=lower('highway38solutions@gmail.com') then 'owner' else 'member' end
from public.coupon_households h
join auth.users u
  on lower(u.email) in (lower('highway38solutions@gmail.com'),lower('mandakw55@gmail.com'))
where h.slug='rick-amanda'
on conflict (household_id,user_id) do update set role=excluded.role;

do $$
declare
  canonical_list uuid;
begin
  select l.id into canonical_list
  from public.coupon_shopping_lists l
  join auth.users u on u.id=l.user_id
  where lower(u.email)=lower('highway38solutions@gmail.com')
    and l.status in ('active','shopping')
  order by l.updated_at desc
  limit 1;

  if canonical_list is null then
    select l.id into canonical_list
    from public.coupon_shopping_lists l
    join public.coupon_household_members m on m.user_id=l.user_id
    join public.coupon_households h on h.id=m.household_id
    where h.slug='rick-amanda'
      and l.status in ('active','shopping')
    order by l.updated_at desc
    limit 1;
  end if;

  if canonical_list is not null then
    delete from public.coupon_list_items i
    using public.coupon_shopping_lists l,
          public.coupon_household_members m,
          public.coupon_households h
    where i.list_id=l.id
      and l.user_id=m.user_id
      and m.household_id=h.id
      and h.slug='rick-amanda'
      and i.list_id<>canonical_list
      and exists (
        select 1
        from public.coupon_list_items x
        where x.list_id=canonical_list
          and lower(trim(x.item_name))=lower(trim(i.item_name))
      );

    update public.coupon_list_items i
    set list_id=canonical_list, updated_at=now()
    from public.coupon_shopping_lists l,
         public.coupon_household_members m,
         public.coupon_households h
    where i.list_id=l.id
      and l.user_id=m.user_id
      and m.household_id=h.id
      and h.slug='rick-amanda'
      and i.list_id<>canonical_list;

    update public.coupon_shopping_lists l
    set status='archived', updated_at=now()
    from public.coupon_household_members m,
         public.coupon_households h
    where l.user_id=m.user_id
      and m.household_id=h.id
      and h.slug='rick-amanda'
      and l.id<>canonical_list
      and l.status in ('active','shopping');

    update public.coupon_shopping_lists
    set name='Shared Shopping List', status='active', updated_at=now()
    where id=canonical_list;
  end if;
end $$;

drop policy if exists coupon_lists_own on public.coupon_shopping_lists;
drop policy if exists coupon_items_own on public.coupon_list_items;
drop policy if exists coupon_prices_own on public.coupon_price_observations;
drop policy if exists coupon_receipts_own on public.coupon_receipts;
drop policy if exists coupon_watch_own on public.coupon_watch_rules;

create policy coupon_lists_shared_select on public.coupon_shopping_lists
for select to authenticated
using ((select private.coupon_can_access_owner(user_id)));
create policy coupon_lists_shared_insert on public.coupon_shopping_lists
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy coupon_lists_shared_update on public.coupon_shopping_lists
for update to authenticated
using ((select private.coupon_can_access_owner(user_id)))
with check ((select private.coupon_can_access_owner(user_id)));
create policy coupon_lists_shared_delete on public.coupon_shopping_lists
for delete to authenticated
using ((select private.coupon_can_access_owner(user_id)));

create policy coupon_items_shared_select on public.coupon_list_items
for select to authenticated
using ((select private.coupon_can_access_owner(user_id)));
create policy coupon_items_shared_insert on public.coupon_list_items
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy coupon_items_shared_update on public.coupon_list_items
for update to authenticated
using ((select private.coupon_can_access_owner(user_id)))
with check ((select private.coupon_can_access_owner(user_id)));
create policy coupon_items_shared_delete on public.coupon_list_items
for delete to authenticated
using ((select private.coupon_can_access_owner(user_id)));

create policy coupon_prices_shared_select on public.coupon_price_observations
for select to authenticated
using ((select private.coupon_can_access_owner(user_id)));
create policy coupon_prices_shared_insert on public.coupon_price_observations
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy coupon_prices_shared_update on public.coupon_price_observations
for update to authenticated
using ((select private.coupon_can_access_owner(user_id)))
with check ((select private.coupon_can_access_owner(user_id)));
create policy coupon_prices_shared_delete on public.coupon_price_observations
for delete to authenticated
using ((select private.coupon_can_access_owner(user_id)));

create policy coupon_receipts_shared_select on public.coupon_receipts
for select to authenticated
using ((select private.coupon_can_access_owner(user_id)));
create policy coupon_receipts_shared_insert on public.coupon_receipts
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy coupon_receipts_shared_update on public.coupon_receipts
for update to authenticated
using ((select private.coupon_can_access_owner(user_id)))
with check ((select private.coupon_can_access_owner(user_id)));
create policy coupon_receipts_shared_delete on public.coupon_receipts
for delete to authenticated
using ((select private.coupon_can_access_owner(user_id)));

create policy coupon_watch_shared_select on public.coupon_watch_rules
for select to authenticated
using ((select private.coupon_can_access_owner(user_id)));
create policy coupon_watch_shared_insert on public.coupon_watch_rules
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy coupon_watch_shared_update on public.coupon_watch_rules
for update to authenticated
using ((select private.coupon_can_access_owner(user_id)))
with check ((select private.coupon_can_access_owner(user_id)));
create policy coupon_watch_shared_delete on public.coupon_watch_rules
for delete to authenticated
using ((select private.coupon_can_access_owner(user_id)));
