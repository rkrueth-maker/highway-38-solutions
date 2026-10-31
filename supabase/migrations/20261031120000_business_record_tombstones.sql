-- Business-record tombstones: stop stale clients resurrecting removed records
-- (2026-10-31, Wave 2 companion to the Wave 1E demo depollution).
--
-- THE INCIDENT: the coordinator moved 250 crew-fixture records off the demo
-- tenant to Build Sandbox (copy -> verify -> delete demo rows). ~2 minutes
-- after the verified delete, a demo app session holding a stale local cache
-- bulk-pushed its snapshot and RESURRECTED 173 of the deleted records back
-- into business_records. There was no server-side tombstone: the sync layer
-- accepted client-pushed rows for record_keys the server had deleted, so any
-- stale client could undo a cleanup (or a legitimate deletion) forever.
--
-- WRITE-PATH TRACE (why the guard is a table trigger, not app code):
-- Every client write to business_records is a DIRECT PostgREST call under
-- RLS — there is no edge function or RPC in between. The canonical sync path
-- is commercial-app/supabase-data.js saveRecord() (read-then-insert/update),
-- and dozens of feature modules also call
-- .from('business_records').upsert(..., {onConflict:'business_id,collection,record_key'})
-- or .insert(...) directly (bundle-features.js, example-data-manager.js,
-- document-scanner.js, supabase-storage-provider.js, ...). RLS on
-- business_records has exactly three policies: SELECT (members),
-- INSERT (staff create), UPDATE (staff update) — no DELETE policy, so hard
-- deletes happen only via service-role / admin SQL. A BEFORE INSERT trigger
-- on the table is the single choke point that covers ALL of those paths.
--
-- DESIGN:
--   1. public.business_record_tombstones holds one row per hard-deleted
--      (business_id, collection, record_key), written by an AFTER DELETE
--      trigger on business_records — so a delete by the app (if a DELETE
--      policy is ever added) OR by admin SQL both leave a tombstone.
--      business_record_revisions was checked and NOT reused: its capture
--      trigger (private.capture_business_record_revision) returns early for
--      every collection except 'timeEntries', so it is not a general
--      delete ledger.
--   2. A BEFORE INSERT trigger silently IGNORES (RETURN NULL) an insert
--      whose key is tombstoned AND no longer exists — no exception, so a
--      bulk snapshot push is not aborted and its legitimate rows still land
--      (proven: a mixed batch inserted the new key, skipped the tombstoned
--      one, HTTP 201). If a row with the key still EXISTS, the insert is
--      allowed through, so the upsert ON CONFLICT DO UPDATE path and every
--      normal update keep working. Soft deletes are unaffected: the app
--      soft-deletes by UPDATE-ing record_status to 'deleted' (no hard
--      DELETE, no tombstone), and its own restore (UPDATE back to 'active')
--      is never blocked.
--   3. RLS is enabled on the tombstone table with NO client policies:
--      authenticated/anon clients can neither read nor forge tombstones.
--      The trigger functions are SECURITY DEFINER so they maintain the
--      table regardless of the caller's role.
--
-- ADMIN ESCAPE HATCH (deliberate revive): a tombstone is the only thing
-- blocking a record_key from being created again. To deliberately revive a
-- record a coordinator deleted, delete its tombstone row first, then let
-- the client (or SQL) save the record normally — e.g.
--   delete from public.business_record_tombstones
--   where business_id = '<uuid>' and collection = '<collection>'
--     and record_key = '<key>';
-- That one delete is the whole procedure; the next insert of that key
-- succeeds (proven end-to-end on Build Sandbox 2026-10-31).
--
-- APPLIED LIVE 2026-10-31 via the Supabase management SQL helper
-- (mgmt_sql.py, project jqukmwtsgcsaruucnqja) — this file is the
-- reproducible record of exactly what was applied. Idempotent:
-- create table if not exists, create or replace function, drop trigger
-- if exists + create trigger.
-- ---------------------------------------------------------------------------

create table if not exists public.business_record_tombstones (
  business_id uuid not null references public.businesses(id) on delete cascade,
  collection text not null check (collection ~ '^[A-Za-z][A-Za-z0-9_-]{0,79}$'),
  record_key text not null check (char_length(record_key) between 1 and 160),
  deleted_at timestamptz not null default now(),
  deleted_by uuid null,
  delete_source text not null default 'hard_delete',
  primary key (business_id, collection, record_key)
);

alter table public.business_record_tombstones enable row level security;

comment on table public.business_record_tombstones is 'Hard-delete tombstones for business_records. Written by AFTER DELETE trigger; read by BEFORE INSERT resurrection guard. No client policies: authenticated/anon clients cannot read or write tombstones directly. Escape hatch: delete the tombstone row (service role / SQL) to deliberately revive a record_key.';

create or replace function private.capture_business_record_tombstone()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $fn$
begin
  insert into public.business_record_tombstones(business_id, collection, record_key, deleted_at, deleted_by, delete_source)
  values (old.business_id, old.collection, old.record_key, now(), coalesce(auth.uid(), old.updated_by), 'hard_delete')
  on conflict (business_id, collection, record_key)
  do update set deleted_at = excluded.deleted_at, deleted_by = excluded.deleted_by, delete_source = excluded.delete_source;
  return old;
end
$fn$;

drop trigger if exists business_records_tombstone_capture on public.business_records;
create trigger business_records_tombstone_capture
  after delete on public.business_records
  for each row execute function private.capture_business_record_tombstone();

create or replace function private.guard_business_record_resurrection()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $fn$
begin
  -- A row with this key still exists: this is an update wearing an
  -- insert's clothes (PostgREST upsert ON CONFLICT DO UPDATE), not a
  -- resurrection. Allow it.
  if exists (select 1 from public.business_records r
             where r.business_id = new.business_id and r.collection = new.collection and r.record_key = new.record_key) then
    return new;
  end if;
  -- No live row + a tombstone: a stale client is re-creating a record the
  -- server deleted. Ignore the row silently (RETURN NULL) so one stale
  -- key cannot abort a whole bulk push or error-loop the sync engine.
  if exists (select 1 from public.business_record_tombstones t
             where t.business_id = new.business_id and t.collection = new.collection and t.record_key = new.record_key) then
    return null;
  end if;
  return new;
end
$fn$;

drop trigger if exists business_records_resurrection_guard on public.business_records;
create trigger business_records_resurrection_guard
  before insert on public.business_records
  for each row execute function private.guard_business_record_resurrection();
