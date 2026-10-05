-- H38 Business Office: audited manual time-entry RPC.
--
-- Direct writes to the timeEntries collection stay blocked for every role
-- (see private.business_record_row_access_context: "The audited time RPCs
-- remain the only time-write authority"). The existing RPC suite covers the
-- punch clock (business_office_clock_in / clock_out), admin edits with a
-- reason (business_office_edit_time_entry), and reads. It does NOT cover
-- manual entries with explicit start/end times (Field time form), hours-only
-- entries (voice "log hours", field-ops "Add time"), or payroll approval.
--
-- This migration adds:
--   1. public.time_entry_audit_log — append-only audit of every audited
--      time write (who recorded it, when, for whom, source, action).
--   2. public.business_office_record_manual_time(...) — SECURITY DEFINER
--      insert path for manual time entries. Validates the caller's active
--      business membership (staff record their own time only; owner/admin
--      may record for others), validates hours, inserts into
--      business_records (collection='timeEntries'), and writes the audit
--      row. Idempotent on (business_id, collection, record_key) so offline
--      queue retries never double-log hours.
--   3. public.business_office_approve_time_entry(...) — SECURITY DEFINER
--      owner/admin approval (or rejection) of a time entry, with audit row.
--
-- The business_records revision-ledger trigger keeps firing on these writes,
-- so the full before/after payload history is preserved as well.

-- ---------------------------------------------------------------------------
-- 1. Audit log table (append-only; written only by the RPCs below)
-- ---------------------------------------------------------------------------
create table if not exists public.time_entry_audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  time_entry_id text not null,
  record_id uuid,
  recorded_by uuid not null,
  recorded_for uuid,
  source text not null,
  action text not null default 'record'
    check (action in ('record','approve','reject')),
  hours numeric,
  job_id text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists time_entry_audit_log_business_idx
  on public.time_entry_audit_log (business_id, created_at desc);
create index if not exists time_entry_audit_log_entry_idx
  on public.time_entry_audit_log (business_id, time_entry_id);

alter table public.time_entry_audit_log enable row level security;

drop policy if exists "owners read time audit log" on public.time_entry_audit_log;
create policy "owners read time audit log"
  on public.time_entry_audit_log for select
  to authenticated
  using (
    exists (
      select 1 from public.business_memberships m
      where m.business_id = time_entry_audit_log.business_id
        and m.auth_user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner','administrator')
    )
  );
-- No insert/update/delete policies: only the SECURITY DEFINER RPCs below
-- write to this table.

-- ---------------------------------------------------------------------------
-- 2. Manual time-entry record RPC
-- ---------------------------------------------------------------------------
create or replace function public.business_office_record_manual_time(
  p_business_id uuid,
  p_time_entry_id text default null,
  p_job_id text default null,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null,
  p_break_minutes numeric default 0,
  p_hours numeric default null,
  p_notes text default null,
  p_source text default 'field_form',
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog','public','private'
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_for uuid;
  v_key text;
  v_hours numeric;
  v_job text;
  v_src text;
  v_now timestamptz := now();
  v_payload jsonb;
  v_rec_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign-in required';
  end if;

  select m.role into v_role
  from public.business_memberships m
  where m.business_id = p_business_id
    and m.auth_user_id = v_uid
    and m.status = 'active'
  limit 1;
  if v_role is null then
    raise exception 'Active business membership required';
  end if;
  if v_role not in ('owner','administrator','staff') then
    raise exception 'Time entry access requires a staff membership or higher';
  end if;

  -- Staff record their own time only; owners/admins may record for others.
  v_for := coalesce(p_user_id, v_uid);
  if v_role = 'staff' and v_for <> v_uid then
    raise exception 'Staff members can only record their own time';
  end if;

  v_src := coalesce(nullif(btrim(p_source), ''), 'field_form');
  if v_src not in ('field_form','voice','field_ops','offline_sync') then
    raise exception 'Unknown time entry source';
  end if;

  v_job := coalesce(nullif(btrim(p_job_id), ''), '');

  if p_start_time is not null and p_end_time is not null then
    if p_end_time <= p_start_time then
      raise exception 'End time must be after start time';
    end if;
    v_hours := greatest(0, round(
      (extract(epoch from (p_end_time - p_start_time)) / 3600.0
       - coalesce(p_break_minutes, 0) / 60.0)::numeric, 2));
  else
    v_hours := p_hours;
  end if;

  if v_hours is null or v_hours <= 0 then
    raise exception 'Hours must be greater than zero';
  end if;
  if v_hours > 24 then
    raise exception 'Hours exceed the 24-hour daily limit';
  end if;

  v_key := coalesce(nullif(btrim(p_time_entry_id), ''),
                    'TIME-' || replace(gen_random_uuid()::text, '-', ''));

  v_payload := jsonb_build_object(
    'Time Entry ID', v_key,
    'Business ID', p_business_id::text,
    'User ID', v_for::text,
    'Job ID', v_job,
    'Start Time', case when p_start_time is null then ''
                      else to_char(p_start_time at time zone 'UTC',
                                   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'End Time', case when p_end_time is null then ''
                    else to_char(p_end_time at time zone 'UTC',
                                 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'Break Minutes', coalesce(p_break_minutes, 0),
    'Hours', v_hours,
    'Status', 'Recorded',
    'Approval Status', 'Owner Approval Required',
    'Notes', coalesce(p_notes, ''),
    'Source', v_src,
    'Created Time', to_char(v_now at time zone 'UTC',
                            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Updated Time', to_char(v_now at time zone 'UTC',
                            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Record Version', 1
  );

  insert into public.business_records
    (business_id, collection, record_key, payload, record_status, created_by, updated_by)
  values
    (p_business_id, 'timeEntries', v_key, v_payload, 'active', v_uid, v_uid)
  on conflict (business_id, collection, record_key) do nothing
  returning id into v_rec_id;

  if v_rec_id is null then
    -- Idempotent retry (offline queue / voice re-submit): the entry already
    -- exists, so return the canonical row without writing a duplicate or a
    -- second audit row.
    select r.id, r.payload into v_rec_id, v_payload
    from public.business_records r
    where r.business_id = p_business_id
      and r.collection = 'timeEntries'
      and r.record_key = v_key;
  else
    insert into public.time_entry_audit_log
      (business_id, time_entry_id, record_id, recorded_by, recorded_for,
       source, action, hours, job_id, note)
    values
      (p_business_id, v_key, v_rec_id, v_uid, v_for,
       v_src, 'record', v_hours, v_job, coalesce(p_notes, ''));
  end if;

  return v_payload;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Time-entry approval RPC (payroll review)
-- ---------------------------------------------------------------------------
create or replace function public.business_office_approve_time_entry(
  p_business_id uuid,
  p_time_entry_id text,
  p_approved boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog','public','private'
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_row public.business_records%rowtype;
  v_now timestamptz := now();
  v_status text;
  v_payload jsonb;
  v_for uuid;
begin
  if v_uid is null then
    raise exception 'Sign-in required';
  end if;

  select m.role into v_role
  from public.business_memberships m
  where m.business_id = p_business_id
    and m.auth_user_id = v_uid
    and m.status = 'active'
  limit 1;
  if v_role not in ('owner','administrator') then
    raise exception 'Owner or administrator access required to approve time';
  end if;
  if coalesce(btrim(p_time_entry_id), '') = '' then
    raise exception 'Time entry id is required';
  end if;

  select * into v_row
  from public.business_records r
  where r.business_id = p_business_id
    and r.collection = 'timeEntries'
    and r.record_key = p_time_entry_id
    and r.record_status = 'active'
  limit 1
  for update;
  if v_row.id is null then
    raise exception 'Time entry not found';
  end if;

  v_status := case when p_approved then 'Approved' else 'Rejected' end;

  v_payload := v_row.payload || jsonb_build_object(
    'Approval Status', v_status,
    'Approved By', v_uid::text,
    'Approved Time', to_char(v_now at time zone 'UTC',
                             'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Approval Note', coalesce(p_note, ''),
    'Updated Time', to_char(v_now at time zone 'UTC',
                            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Record Version', coalesce((v_row.payload->>'Record Version')::int, 1) + 1
  );

  update public.business_records
  set payload = v_payload, updated_by = v_uid, updated_at = v_now
  where id = v_row.id;

  v_for := case
    when v_row.payload->>'User ID' ~ '^[0-9a-fA-F-]{36}$'
      then (v_row.payload->>'User ID')::uuid
    else null
  end;

  insert into public.time_entry_audit_log
    (business_id, time_entry_id, record_id, recorded_by, recorded_for,
     source, action, hours, job_id, note)
  values
    (p_business_id, p_time_entry_id, v_row.id, v_uid, v_for,
     'approval', case when p_approved then 'approve' else 'reject' end,
     nullif(v_row.payload->>'Hours', '')::numeric,
     coalesce(v_row.payload->>'Job ID', ''), p_note);

  return v_payload;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants: executable by signed-in app users only; never anon/public.
-- ---------------------------------------------------------------------------
revoke all on function public.business_office_record_manual_time(uuid,text,text,timestamptz,timestamptz,numeric,numeric,text,text,uuid)
  from public, anon;
grant execute on function public.business_office_record_manual_time(uuid,text,text,timestamptz,timestamptz,numeric,numeric,text,text,uuid)
  to authenticated;

revoke all on function public.business_office_approve_time_entry(uuid,text,boolean,text)
  from public, anon;
grant execute on function public.business_office_approve_time_entry(uuid,text,boolean,text)
  to authenticated;

comment on function public.business_office_record_manual_time(uuid,text,text,timestamptz,timestamptz,numeric,numeric,text,text,uuid)
  is 'Audited write authority for manual time entries (field form, voice, offline sync, field ops). Direct timeEntries writes stay blocked for all roles.';
comment on function public.business_office_approve_time_entry(uuid,text,boolean,text)
  is 'Audited owner/admin approval (or rejection) of a time entry for payroll review.';
