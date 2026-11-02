-- Wave 3 tail #7: per-job time clock -> payroll export.
--
-- Diagnosis: the punch clock (business_office_clock_in / clock_out) wrote
-- timeEntries with Job ID + timestamps, but no GPS snapshot, no Employee ID
-- link, and no labor pricing -- so clocked time reached the Payroll page
-- only when the employee record happened to carry the user's ID, job
-- costing could never price clocked labor ("no labor cost is stored"),
-- and no entry proved where the clock-in happened.
--
-- This migration extends the SAME audited RPCs (no second time-write
-- authority):
--   clock_in  gains optional GPS params (lat/lng/accuracy) and stamps the
--             entry with the GPS snapshot (or "manual -- no location"),
--             the caller's linked Employee ID + Hourly Rate snapshot
--             (employees record matched on User ID), and the Date.
--   clock_out gains optional GPS params, preserves the 20260919
--             pause/break handling exactly, and on completion stamps the
--             clock-out GPS, Regular Hours, and Labor Cost = Hours x the
--             linked employee's Hourly Rate when a rate is on file. When
--             no employee record / rate links, Labor Cost stays absent --
--             the Office still never invents a labor rate.
--
-- Old signatures are dropped so PostgREST named-argument calls from the
-- existing callers (erp-foundation Today card, employee-workspace) keep
-- resolving to exactly one function; every new parameter defaults null.

drop function if exists public.business_office_clock_in(uuid, text, text, text);
drop function if exists public.business_office_clock_out(uuid, text);

create or replace function public.business_office_clock_in(
  p_business_id uuid,
  p_job_id text default null,
  p_task_id text default null,
  p_notes text default null,
  p_lat numeric default null,
  p_lng numeric default null,
  p_accuracy numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_key text := 'TIME-' || replace(gen_random_uuid()::text, '-', '');
  v_now timestamptz := now();
  v_payload jsonb;
  v_emp_id text := '';
  v_rate numeric;
begin
  select membership.role into v_role from public.business_memberships membership
  where membership.business_id = p_business_id and membership.auth_user_id = v_uid and membership.status = 'active' limit 1;
  if v_role not in ('owner', 'administrator', 'staff') then raise exception 'Time clock access requires an active staff membership'; end if;
  if exists(select 1 from public.business_records record where record.business_id = p_business_id and record.collection = 'timeEntries' and record.created_by = v_uid and record.record_status = 'active' and coalesce(record.payload ->> 'End Time', '') = '') then
    raise exception 'Clock out before starting another time entry';
  end if;

  select record.payload ->> 'Employee ID', nullif(record.payload ->> 'Hourly Rate', '')::numeric
  into v_emp_id, v_rate
  from public.business_records record
  where record.business_id = p_business_id and record.collection = 'employees' and record.record_status = 'active'
    and record.payload ->> 'User ID' = v_uid::text
  limit 1;
  v_emp_id := coalesce(v_emp_id, '');

  v_payload := jsonb_build_object(
    'Time Entry ID', v_key, 'Business ID', p_business_id::text, 'Auth User ID', v_uid::text, 'User ID', v_uid::text,
    'Employee ID', v_emp_id,
    'Job ID', coalesce(p_job_id, ''), 'Task ID', coalesce(p_task_id, ''),
    'Date', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD'),
    'Start Time', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'End Time', '', 'Break Minutes', 0, 'Hours', 0, 'Status', 'Clocked In', 'Approval Status', 'Owner Approval Required',
    'Hourly Rate', '',
    'Clock In Lat', case when p_lat is null then '' else p_lat end,
    'Clock In Lng', case when p_lng is null then '' else p_lng end,
    'Clock In Accuracy', case when p_accuracy is null then '' else p_accuracy end,
    'Location Status', case when p_lat is not null and p_lng is not null then 'gps' else 'manual — no location' end,
    'Notes', coalesce(p_notes, ''), 'Source', 'Employee Time Clock', 'Created Time', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Updated Time', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'Record Version', 1
  );
  if v_rate is not null then
    v_payload := v_payload || jsonb_build_object('Hourly Rate', v_rate);
  end if;
  insert into public.business_records(business_id, collection, record_key, payload, record_status, created_by, updated_by)
  values(p_business_id, 'timeEntries', v_key, v_payload, 'active', v_uid, v_uid);
  return v_payload;
end
$$;

create or replace function public.business_office_clock_out(
  p_business_id uuid,
  p_notes text default null,
  p_lat numeric default null,
  p_lng numeric default null,
  p_accuracy numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_row public.business_records%rowtype;
  v_now timestamptz := now();
  v_start timestamptz;
  v_pause_started timestamptz;
  v_break numeric;
  v_hours numeric;
  v_payload jsonb;
  v_emp_id text;
  v_rate numeric;
  v_labor numeric;
begin
  select membership.role into v_role from public.business_memberships membership
  where membership.business_id = p_business_id and membership.auth_user_id = v_uid and membership.status = 'active' limit 1;
  if v_role not in ('owner', 'administrator', 'staff') then raise exception 'Time clock access requires an active staff membership'; end if;

  select * into v_row from public.business_records record
  where record.business_id = p_business_id and record.collection = 'timeEntries' and record.created_by = v_uid and record.record_status = 'active' and coalesce(record.payload ->> 'End Time', '') = ''
  order by record.created_at desc limit 1 for update;
  if v_row.id is null then raise exception 'No active time entry found'; end if;

  v_start := (v_row.payload ->> 'Start Time')::timestamptz;
  v_break := coalesce(nullif(v_row.payload ->> 'Break Minutes', '')::numeric, 0);
  if upper(coalesce(v_row.payload ->> 'Status', '')) in ('PAUSED', 'BREAK') then
    v_pause_started := nullif(v_row.payload ->> 'Paused Time', '')::timestamptz;
    if v_pause_started is not null then
      v_break := v_break + greatest(0, round((extract(epoch from (v_now - v_pause_started)) / 60.0)::numeric, 2));
    end if;
  end if;
  v_hours := greatest(0, round((extract(epoch from (v_now - v_start)) / 3600.0 - v_break / 60.0)::numeric, 2));

  -- Labor pricing: the rate snapshot stamped at clock-in wins; otherwise
  -- resolve the caller's linked employee record now. No link, no rate --
  -- Labor Cost stays absent (never invented).
  v_emp_id := coalesce(nullif(v_row.payload ->> 'Employee ID', ''), '');
  v_rate := nullif(v_row.payload ->> 'Hourly Rate', '')::numeric;
  if v_emp_id = '' or v_rate is null then
    select record.payload ->> 'Employee ID', nullif(record.payload ->> 'Hourly Rate', '')::numeric
    into v_emp_id, v_rate
    from public.business_records record
    where record.business_id = p_business_id and record.collection = 'employees' and record.record_status = 'active'
      and record.payload ->> 'User ID' = v_uid::text
    limit 1;
    v_emp_id := coalesce(v_emp_id, coalesce(nullif(v_row.payload ->> 'Employee ID', ''), ''));
  end if;
  v_labor := case when v_rate is not null and v_rate > 0 then round(v_hours * v_rate, 2) else null end;

  v_payload := v_row.payload || jsonb_build_object(
    'End Time', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Break Minutes', v_break,
    'Hours', v_hours,
    'Regular Hours', greatest(0, v_hours - coalesce(nullif(v_row.payload ->> 'Overtime Hours', '')::numeric, 0)),
    'Status', 'Recorded',
    'Paused Time', '',
    'Pause Type', '',
    'Employee ID', v_emp_id,
    'Date', coalesce(nullif(v_row.payload ->> 'Date', ''), to_char(v_start at time zone 'UTC', 'YYYY-MM-DD')),
    'Clock Out Lat', case when p_lat is null then '' else p_lat end,
    'Clock Out Lng', case when p_lng is null then '' else p_lng end,
    'Clock Out Accuracy', case when p_accuracy is null then '' else p_accuracy end,
    'Clock Out Location Status', case when p_lat is not null and p_lng is not null then 'gps' else 'manual — no location' end,
    'Notes', case when coalesce(btrim(p_notes), '') = '' then coalesce(v_row.payload ->> 'Notes', '') else p_notes end,
    'Updated Time', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'Record Version', coalesce((v_row.payload ->> 'Record Version')::int, 1) + 1
  );
  if v_rate is not null then
    v_payload := v_payload || jsonb_build_object('Hourly Rate', v_rate);
  end if;
  if v_labor is not null then
    v_payload := v_payload || jsonb_build_object('Labor Cost', v_labor);
  end if;
  update public.business_records set payload = v_payload, updated_by = v_uid, updated_at = v_now where id = v_row.id;
  return v_payload;
end
$$;

revoke all on function public.business_office_clock_in(uuid, text, text, text, numeric, numeric, numeric) from public, anon;
revoke all on function public.business_office_clock_out(uuid, text, numeric, numeric, numeric) from public, anon;
grant execute on function public.business_office_clock_in(uuid, text, text, text, numeric, numeric, numeric) to authenticated;
grant execute on function public.business_office_clock_out(uuid, text, numeric, numeric, numeric) to authenticated;

comment on function public.business_office_clock_in(uuid, text, text, text, numeric, numeric, numeric)
  is 'Audited punch-clock clock-in. Wave3tail7: optional GPS snapshot, linked Employee ID + Hourly Rate snapshot, Date stamp.';
comment on function public.business_office_clock_out(uuid, text, numeric, numeric, numeric)
  is 'Audited punch-clock clock-out. Wave3tail7: optional GPS snapshot, Regular Hours, Labor Cost from the linked employee Hourly Rate when on file.';
