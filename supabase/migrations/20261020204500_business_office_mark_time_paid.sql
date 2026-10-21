-- H38 Business Office: audited MARK_TIME_PAID server action (WS3 spec §3.4).
--
-- Finalizing a payroll run must stamp its selected time entries Paid with the
-- run's Payroll Period ID. Direct timeEntries writes stay RLS-blocked for
-- every role and the client save path canonicalizes the collection and strips
-- Paid/'Payroll Period ID', so the stamp can only land through an audited
-- SECURITY DEFINER RPC — the same authority pattern as
-- business_office_approve_time_entry (20261005043000).
--
-- The client already queues the audited action (payroll-run.js):
--   queueOperation('MARK_TIME_PAID','Time Entry',runId,
--     {payrollPeriodId, timeEntryIds, batch:true, idempotent:true}, ...)
-- and supabase-operation-coverage.js routes it to this RPC. The client then
-- re-reads the entries and only labels the run "Stamped" when the markers are
-- actually present (Paid = true or 'Payroll Period ID' = this run).
--
-- This migration adds:
--   1. public.business_office_mark_time_paid(uuid, text, text[]) — owner /
--      administrator only; run-id-scoped: the payroll run must exist on the
--      same business in Finalized or Posted state. Batch + idempotent:
--      entries already stamped by THIS run are counted, never rewritten;
--      an entry already paid under a DIFFERENT run aborts the whole batch
--      (double-pay guard — the batch is one transaction, so a failure
--      stamps nothing). Each newly stamped entry gets an append-only
--      time_entry_audit_log row (action 'mark_paid').
--   2. Widens the time_entry_audit_log action check to include 'mark_paid'.
--
-- The business_records revision-ledger trigger keeps firing on these writes,
-- so the full before/after payload history is preserved as well.

-- ---------------------------------------------------------------------------
-- 1. Audit action vocabulary: add 'mark_paid'
-- ---------------------------------------------------------------------------
do $$
declare
  v_con text;
begin
  for v_con in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.time_entry_audit_log'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%action%'
  loop
    execute format('alter table public.time_entry_audit_log drop constraint %I', v_con);
  end loop;
end
$$;

alter table public.time_entry_audit_log
  add constraint time_entry_audit_log_action_check
  check (action in ('record','approve','reject','mark_paid'));

-- ---------------------------------------------------------------------------
-- 2. MARK_TIME_PAID RPC
-- ---------------------------------------------------------------------------
create or replace function public.business_office_mark_time_paid(
  p_business_id uuid,
  p_payroll_period_id text,
  p_time_entry_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog','public','private'
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_run_id text := coalesce(btrim(p_payroll_period_id), '');
  v_ids text[];
  v_run_status text;
  v_now timestamptz := now();
  v_now_iso text := to_char(v_now at time zone 'UTC',
                            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_id text;
  v_row public.business_records%rowtype;
  v_payload jsonb;
  v_for uuid;
  v_stamped int := 0;
  v_already int := 0;
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
    raise exception 'Owner or administrator access required to mark time paid';
  end if;

  if v_run_id = '' then
    raise exception 'Payroll period id is required';
  end if;

  select array_agg(distinct btrim(x))
    into v_ids
  from unnest(coalesce(p_time_entry_ids, array[]::text[])) as x
  where btrim(x) <> '';
  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'At least one time entry id is required';
  end if;

  -- Run-id scope: the run must exist on this business and be Finalized or
  -- Posted. Stamping against a Draft/Reviewed/arbitrary id is refused.
  select r.payload->>'Status' into v_run_status
  from public.business_records r
  where r.business_id = p_business_id
    and r.collection = 'payrollPeriods'
    and r.record_key = v_run_id
    and r.record_status = 'active'
  limit 1;
  if v_run_status is null then
    raise exception 'Payroll run not found';
  end if;
  if v_run_status not in ('Finalized','Posted') then
    raise exception 'Payroll run must be Finalized before its time can be marked paid';
  end if;

  -- Deterministic order: sorted ids, rows locked FOR UPDATE. The function is
  -- one transaction: any refusal below aborts the batch and rolls back every
  -- stamp and audit row written so far (all-or-nothing).
  foreach v_id in array (select array_agg(x order by x) from unnest(v_ids) as x)
  loop
    select * into v_row
    from public.business_records r
    where r.business_id = p_business_id
      and r.collection = 'timeEntries'
      and r.record_key = v_id
      and r.record_status = 'active'
    limit 1
    for update;
    if v_row.id is null then
      raise exception 'Time entry not found: %', v_id;
    end if;

    if coalesce(v_row.payload->>'Paid', '') = 'true'
       and coalesce(v_row.payload->>'Payroll Period ID', '') = v_run_id then
      v_already := v_already + 1;  -- idempotent re-run: no rewrite, no audit row
      continue;
    end if;
    if coalesce(v_row.payload->>'Paid', '') = 'true'
       or coalesce(nullif(v_row.payload->>'Payroll Period ID', ''), '') <> '' then
      raise exception 'Time entry % is already paid under payroll run %',
        v_id, coalesce(nullif(v_row.payload->>'Payroll Period ID', ''), '(unknown)');
    end if;

    v_payload := v_row.payload || jsonb_build_object(
      'Paid', true,
      'Payroll Period ID', v_run_id,
      'Paid By', v_uid::text,
      'Paid Time', v_now_iso,
      'Updated Time', v_now_iso,
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
      (p_business_id, v_id, v_row.id, v_uid, v_for,
       'payroll', 'mark_paid',
       nullif(v_row.payload->>'Hours', '')::numeric,
       coalesce(v_row.payload->>'Job ID', ''),
       'Payroll run ' || v_run_id);

    v_stamped := v_stamped + 1;
  end loop;

  return jsonb_build_object(
    'payrollPeriodId', v_run_id,
    'stamped', v_stamped,
    'alreadyStamped', v_already,
    'timeEntryIds', to_jsonb(v_ids)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants: executable by signed-in app users only; never anon/public.
-- ---------------------------------------------------------------------------
revoke all on function public.business_office_mark_time_paid(uuid,text,text[])
  from public, anon;
grant execute on function public.business_office_mark_time_paid(uuid,text,text[])
  to authenticated;

comment on function public.business_office_mark_time_paid(uuid,text,text[])
  is 'Audited MARK_TIME_PAID action: stamps one Finalized/Posted payroll run''s time entries Paid with the run id. Batch, run-id-scoped, idempotent; refuses entries already paid under another run.';
