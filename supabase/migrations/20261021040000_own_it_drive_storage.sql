-- Own-it file storage (Rick, 2026-10-21): a business may connect its own
-- Google Drive and have its FILES (photos, walkthrough videos, attachments)
-- stored there instead of Supabase storage. Records, jobs and ALL accounting
-- data always stay in this database; file storage only moves.
--
-- This migration adds the two server-side tables the feature needs:
--
-- 1) public.business_drive_secrets — the per-business Google OAuth tokens,
--    AES-GCM encrypted at rest by the edge functions (same pattern as
--    public.fleet_provider_secrets for Bouncie). RLS is enabled with a
--    deny-all policy and grants are service_role ONLY: no browser role can
--    read or write a token, ever. Tokens are never returned by any API.
--
-- 2) public.business_external_files — the registry of files that live
--    OUTSIDE Supabase storage. One row per Drive-stored file, written by the
--    business-drive-upload edge function (service role). It carries the
--    location markers the per-business data meter expects
--    (location = 'external', provider = 'google_drive', file_size) so the
--    data-limit build's files_external_bytes can be fed from
--      select coalesce(sum(file_size),0) from public.business_external_files
--       where business_id = <business> and status = 'available'
--    External bytes NEVER count toward the 5 GB server-data limit: the bytes
--    are not on our server. Members of the business may READ the registry
--    (their own files); only the service role writes it.
--
-- Rollback: drop table public.business_external_files;
--           drop table public.business_drive_secrets;
-- (business_storage_settings already exists and is untouched.)

create table if not exists public.business_drive_secrets (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_nonce text,
  token_expires_at timestamptz,
  granted_scopes text,
  updated_at timestamptz not null default now()
);
comment on table public.business_drive_secrets is
  'Per-business Google Drive OAuth tokens, AES-GCM encrypted at rest. Service role only; never exposed to browser roles, never logged, never returned by any function.';
alter table public.business_drive_secrets enable row level security;
revoke all on public.business_drive_secrets from public, anon, authenticated;
grant select, insert, update, delete on public.business_drive_secrets to service_role;
drop policy if exists "drive secrets deny authenticated" on public.business_drive_secrets;
create policy "drive secrets deny authenticated" on public.business_drive_secrets
  for all to authenticated using (false) with check (false);
drop policy if exists "drive secrets deny anon" on public.business_drive_secrets;
create policy "drive secrets deny anon" on public.business_drive_secrets
  for all to anon using (false) with check (false);

create table if not exists public.business_external_files (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null default 'google_drive'
    check (provider in ('google_drive')),
  location text not null default 'external'
    check (location in ('external')),
  -- Canonical in-app handle for the file: 'drive/<google file id>'.
  storage_path text not null,
  -- Original Supabase-style object path when the upload was routed from a
  -- direct storage upload call (<business>/<Segment>/<Source>/<file>).
  virtual_path text,
  drive_file_id text not null,
  file_name text,
  mime_type text,
  file_size bigint not null default 0,
  source_type text,
  source_id text,
  document_record_key text,
  status text not null default 'available'
    check (status in ('available', 'unavailable')),
  status_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, storage_path)
);
comment on table public.business_external_files is
  'Registry of business files stored outside Supabase storage (own-it Google Drive). Feeds the data meter files_external_bytes (available rows only); external bytes never count toward the server-data limit.';
create index if not exists business_external_files_drive_id_idx
  on public.business_external_files (drive_file_id);
create index if not exists business_external_files_virtual_path_idx
  on public.business_external_files (business_id, virtual_path)
  where virtual_path is not null;
alter table public.business_external_files enable row level security;
revoke all on public.business_external_files from public, anon;
grant select on public.business_external_files to authenticated;
grant select, insert, update, delete on public.business_external_files to service_role;
drop policy if exists "external files members read" on public.business_external_files;
create policy "external files members read" on public.business_external_files
  for select to authenticated
  using (private.business_access(business_id, array['owner','administrator','staff','viewer']));
