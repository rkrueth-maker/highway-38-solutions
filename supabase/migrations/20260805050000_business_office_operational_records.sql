-- Highway 38 Business Office operational Supabase layer.
-- Additive only. No Google record import, external action, automatic approval,
-- customer send, payment, purchase, publishing, payroll, tax filing, or Northern Lakes activation.
-- Supabase remains the system of record. File storage may be Supabase Storage or a
-- separately authorized client-owned Google Drive connection; no OAuth secrets are stored here.

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

create table if not exists public.business_storage_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  provider text not null default 'supabase'
    check (provider in ('supabase', 'google_drive')),
  connection_status text not null default 'connected'
    check (connection_status in ('not_configured', 'connecting', 'connected', 'disabled', 'error')),
  provider_account_email text,
  root_folder_id text,
  config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object')
    check (not (config ?| array['access_token', 'refresh_token', 'client_secret', 'service_role_key'])),
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    provider <> 'google_drive'
    or connection_status <> 'connected'
    or (root_folder_id is not null and char_length(root_folder_id) > 4)
  )
);

comment on table public.business_storage_settings is
  'Non-secret per-business file provider selection. Google OAuth credentials belong in a server-side vault and are never exposed to browser roles.';

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

create or replace function private.touch_business_storage_setting()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if new.business_id <> old.business_id then
    raise exception 'Business storage identity is immutable';
  end if;
  new.updated_at := now();
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
      )
  )
$$;

revoke all on function private.touch_business_record() from public;
revoke all on function private.touch_business_record() from anon;
revoke all on function private.touch_business_record() from authenticated;
revoke all on function private.touch_business_storage_setting() from public;
revoke all on function private.touch_business_storage_setting() from anon;
revoke all on function private.touch_business_storage_setting() from authenticated;
revoke all on function private.business_record_access(uuid, text, boolean) from public;
revoke all on function private.business_record_access(uuid, text, boolean) from anon;
grant execute on function private.business_record_access(uuid, text, boolean) to authenticated;

drop trigger if exists business_records_touch on public.business_records;
create trigger business_records_touch
before update on public.business_records
for each row execute function private.touch_business_record();

drop trigger if exists business_storage_settings_touch on public.business_storage_settings;
create trigger business_storage_settings_touch
before update on public.business_storage_settings
for each row execute function private.touch_business_storage_setting();

alter table public.business_records enable row level security;
alter table public.business_storage_settings enable row level security;

drop policy if exists "members read business records" on public.business_records;
create policy "members read business records"
on public.business_records for select
to authenticated
using ((select private.business_record_access(business_id, collection, false)));

drop policy if exists "staff create business records" on public.business_records;
create policy "staff create business records"
on public.business_records for insert
to authenticated
with check (
  (select private.business_record_access(business_id, collection, true))
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and record_status = 'active'
);

drop policy if exists "staff update business records" on public.business_records;
create policy "staff update business records"
on public.business_records for update
to authenticated
using ((select private.business_record_access(business_id, collection, true)))
with check (
  (select private.business_record_access(business_id, collection, true))
  and updated_by = (select auth.uid())
);

drop policy if exists "members read business storage settings" on public.business_storage_settings;
create policy "members read business storage settings"
on public.business_storage_settings for select
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator', 'staff'])));

drop policy if exists "administrators manage business storage settings" on public.business_storage_settings;
create policy "administrators manage business storage settings"
on public.business_storage_settings for all
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])))
with check ((select private.business_access(business_id, array['owner', 'administrator'])));

revoke all on table public.business_records from anon;
revoke all on table public.business_storage_settings from anon;
grant select, insert, update on table public.business_records to authenticated;
grant select, insert, update on table public.business_storage_settings to authenticated;

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

insert into public.business_storage_settings (
  business_id,
  provider,
  connection_status,
  config,
  connected_at
)
select
  b.id,
  'supabase',
  'connected',
  jsonb_build_object(
    'bucket', 'business-office-files',
    'client_google_drive_supported', true,
    'oauth_secrets_in_browser', false
  ),
  now()
from public.businesses b
where b.business_key = 'highway38'
on conflict (business_id) do nothing;

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
    'default_storage_provider', 'supabase',
    'optional_client_storage_provider', 'google_drive',
    'oauth_secrets_stored_in_browser', false,
    'google_data_imported', false,
    'external_actions_enabled', false,
    'northern_lakes_enabled', false
  ),
  false
from public.businesses b
where b.business_key = 'highway38';
