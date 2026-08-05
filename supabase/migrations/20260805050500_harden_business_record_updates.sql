-- Preserve the existing record updater when a migration or trusted server replay
-- has no browser Auth context. Browser writes still resolve to auth.uid().
-- Keep Viewer access read-only and limited to normal customer/work visibility.

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

create or replace function private.business_record_access(
  p_business_id uuid,
  p_collection text,
  p_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.business_memberships membership
    where membership.business_id = p_business_id
      and membership.auth_user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        membership.role in ('owner', 'administrator')
        or (
          membership.role = 'staff'
          and p_collection not in (
            'payments', 'expenses', 'invoices', 'settings', 'providers',
            'approvals', 'proofLog', 'errorLog', 'socialAccounts'
          )
        )
        or (
          membership.role = 'viewer'
          and p_write = false
          and p_collection in (
            'customers', 'contacts', 'properties', 'requests', 'jobs',
            'workOrders', 'tasks', 'scheduleEvents', 'jobNotes',
            'quotes', 'measurements', 'documents', 'attachments',
            'invoices', 'portalThreads', 'portalMessages'
          )
        )
      )
  )
$$;

revoke all on function private.touch_business_record() from public;
revoke all on function private.touch_business_record() from anon;
revoke all on function private.touch_business_record() from authenticated;
revoke all on function private.business_record_access(uuid, text, boolean) from public;
revoke all on function private.business_record_access(uuid, text, boolean) from anon;
grant execute on function private.business_record_access(uuid, text, boolean) to authenticated;
