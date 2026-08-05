-- Preserve the existing record updater when a migration or trusted server replay
-- has no browser Auth context. Browser writes still resolve to auth.uid().

create or replace function private.touch_business_record()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if new.business_id <> old.business_id
     or new.collection <> old.collection
     or new.record_key <> old.record_key
     or new.created_by <> old.created_by then
    raise exception 'Business record identity is immutable';
  end if;

  new.updated_by := coalesce((select auth.uid()), old.updated_by);
  new.updated_at := now();
  if new.record_status = 'archived' and old.record_status <> 'archived' then
    new.archived_at := now();
  elsif new.record_status = 'active' then
    new.archived_at := null;
  end if;
  return new;
end
$$;

revoke all on function private.touch_business_record() from public;
revoke all on function private.touch_business_record() from anon;
revoke all on function private.touch_business_record() from authenticated;
