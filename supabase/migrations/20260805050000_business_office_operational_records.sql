-- Highway 38 Business Office operational Supabase layer.
-- Additive only. No Google record import, external action, automatic approval,
-- customer send, payment, purchase, publishing, payroll, tax filing, or Northern Lakes activation.

create table if not exists public.business_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  collection text not null
    check (collection ~ '^[A-Za-z][A-Za-z0-9_-]{0,79}$'),
  record_key text not null
    check (char_length(record_key) between 1 and 160),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object')
    check (not (payload ? 'base64Data')),
  record_status text not null default 'active'
    check (record_status in ('active', 'archived')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (business_id, collection, record_key)
);

create index if not exists business_records_collection_updated_idx
  on public.business_records (business_id, collection, updated_at desc)
  where record_status = 'active';

create index if not exists business_records_payload_gin_idx
  on public.business_records using gin (payload jsonb_path_ops);

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

  new.updated_by := (select auth.uid());
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

drop trigger if exists business_records_touch on public.business_records;
create trigger business_records_touch
before update on public.business_records
for each row execute function private.touch_business_record();

alter table public.business_records enable row level security;

drop policy if exists "members read business records" on public.business_records;
create policy "members read business records"
on public.business_records for select
to authenticated
using ((select private.business_access(business_id, null)));

drop policy if exists "staff create business records" on public.business_records;
create policy "staff create business records"
on public.business_records for insert
to authenticated
with check (
  (select private.business_access(business_id, array['owner', 'administrator', 'staff']))
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and record_status = 'active'
);

drop policy if exists "staff update business records" on public.business_records;
create policy "staff update business records"
on public.business_records for update
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator', 'staff'])))
with check (
  (select private.business_access(business_id, array['owner', 'administrator', 'staff']))
  and updated_by = (select auth.uid())
);

revoke all on table public.business_records from anon;
grant select, insert, update on table public.business_records to authenticated;

create or replace function private.business_storage_access(
  p_object_name text,
  p_allowed_roles text[] default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, storage
as $$
declare
  v_business_id uuid;
begin
  begin
    v_business_id := nullif(split_part(p_object_name, '/', 1), '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return private.business_access(v_business_id, p_allowed_roles);
end
$$;

revoke all on function private.business_storage_access(text, text[]) from public;
revoke all on function private.business_storage_access(text, text[]) from anon;
grant execute on function private.business_storage_access(text, text[]) to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'business-office-files',
  'business-office-files',
  false,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf', 'text/plain',
    'audio/mpeg', 'audio/mp4', 'audio/webm',
    'video/mp4', 'application/octet-stream'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members read business office files" on storage.objects;
create policy "members read business office files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'business-office-files'
  and (select private.business_storage_access(name, null))
);

drop policy if exists "staff upload business office files" on storage.objects;
create policy "staff upload business office files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'business-office-files'
  and (select private.business_storage_access(name, array['owner', 'administrator', 'staff']))
);

drop policy if exists "staff replace business office files" on storage.objects;
create policy "staff replace business office files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'business-office-files'
  and (select private.business_storage_access(name, array['owner', 'administrator', 'staff']))
)
with check (
  bucket_id = 'business-office-files'
  and (select private.business_storage_access(name, array['owner', 'administrator', 'staff']))
);

insert into public.business_module_settings (business_id, module_key, enabled, config)
select b.id, module_key, true, '{}'::jsonb
from public.businesses b
cross join unnest(array[
  'today', 'customers', 'jobs', 'tasks', 'quotes', 'measure', 'schedule',
  'communications', 'field', 'daily-logs', 'checklists', 'time',
  'inventory', 'fleet', 'money', 'documents', 'social', 'ai', 'settings'
]) as module_key
where b.business_key = 'highway38'
on conflict (business_id, module_key) do update
set enabled = excluded.enabled,
    updated_at = now();

insert into public.business_proof_log (
  business_id,
  actor_user_id,
  action_type,
  entity_type,
  result,
  details,
  external_action_occurred
)
select
  b.id,
  null,
  'SUPABASE_OPERATIONAL_LAYER_PREPARED',
  'Business Office',
  'PASS',
  jsonb_build_object(
    'records_table', 'business_records',
    'storage_bucket', 'business-office-files',
    'google_data_imported', false,
    'external_actions_enabled', false,
    'northern_lakes_enabled', false
  ),
  false
from public.businesses b
where b.business_key = 'highway38';
