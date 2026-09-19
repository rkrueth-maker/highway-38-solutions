drop policy if exists coupon_items_shared_insert on public.coupon_list_items;

create policy coupon_items_shared_insert
on public.coupon_list_items
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.coupon_shopping_lists l
    where l.id = list_id
  )
);
