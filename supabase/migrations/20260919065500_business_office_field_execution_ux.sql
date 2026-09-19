-- H38 Business Office field-execution UX finish.
-- Extends the existing Staff task/time authorities; does not create a second job or time model.

create or replace function public.business_office_employee_update_task(
  p_business_id uuid,
  p_task_id text,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_uid uuid:=auth.uid();
  v_membership public.business_memberships%rowtype;
  v_task public.business_records%rowtype;
  v_status text:=initcap(lower(btrim(coalesce(p_status,''))));
  v_note text:=left(btrim(coalesce(p_note,'')),2000);
  v_payload jsonb;
  v_now timestamptz:=now();
begin
  select * into v_membership
  from public.business_memberships membership
  where membership.business_id=p_business_id
    and membership.auth_user_id=v_uid
    and membership.status='active'
  limit 1;
  if v_membership.id is null or v_membership.role<>'staff' then
    raise exception 'Employee task access requires an active Staff membership';
  end if;
  if v_status not in ('Accepted','On My Way','Arrived','Started','Paused','Waiting','Blocked','Completed') then
    raise exception 'Unsupported employee task status';
  end if;

  select * into v_task
  from public.business_records task
  where task.business_id=p_business_id
    and task.collection='tasks'
    and task.record_status='active'
    and task.record_key=p_task_id
    and private.employee_task_assigned(p_business_id,task.payload)
  limit 1
  for update;
  if v_task.id is null then raise exception 'Assigned task not found'; end if;

  v_payload:=v_task.payload || jsonb_build_object(
    'Status',v_status,
    'Employee Updated Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Employee Updated By',v_uid::text,
    'Record Version',coalesce((v_task.payload->>'Record Version')::int,1)+1
  );
  if v_note<>'' then v_payload:=v_payload || jsonb_build_object('Employee Note',v_note); end if;
  if v_status='Completed' then
    v_payload:=v_payload || jsonb_build_object('Completed Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;

  update public.business_records
  set payload=v_payload,updated_by=v_uid,updated_at=v_now
  where id=v_task.id;

  insert into public.business_proof_log(
    business_id,actor_user_id,action_type,entity_type,result,details,external_action_occurred
  ) values(
    p_business_id,v_uid,'employee_task_status_updated','task','PASS',
    jsonb_build_object('taskId',p_task_id,'status',v_status,'employeeSelfService',true),false
  );
  return v_payload;
end
$$;
revoke all on function public.business_office_employee_update_task(uuid,text,text,text) from public,anon;
grant execute on function public.business_office_employee_update_task(uuid,text,text,text) to authenticated;

create or replace function public.business_office_employee_time_transition(
  p_business_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_row public.business_records%rowtype;
  v_action text:=upper(btrim(coalesce(p_action,'')));
  v_now timestamptz:=now();
  v_pause_started timestamptz;
  v_break numeric:=0;
  v_payload jsonb;
begin
  select membership.role into v_role
  from public.business_memberships membership
  where membership.business_id=p_business_id
    and membership.auth_user_id=v_uid
    and membership.status='active'
  limit 1;
  if v_role not in ('owner','administrator','staff') then
    raise exception 'Time clock access requires an active staff membership';
  end if;
  if v_action not in ('PAUSE','BREAK','RESUME') then
    raise exception 'Unsupported time transition';
  end if;

  select * into v_row
  from public.business_records record
  where record.business_id=p_business_id
    and record.collection='timeEntries'
    and record.created_by=v_uid
    and record.record_status='active'
    and coalesce(record.payload->>'End Time','')=''
  order by record.created_at desc
  limit 1
  for update;
  if v_row.id is null then raise exception 'No active time entry found'; end if;

  if v_action in ('PAUSE','BREAK') then
    if upper(coalesce(v_row.payload->>'Status','')) in ('PAUSED','BREAK') then
      raise exception 'This time entry is already paused';
    end if;
    v_payload:=v_row.payload || jsonb_build_object(
      'Status',case when v_action='BREAK' then 'Break' else 'Paused' end,
      'Paused Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'Pause Type',case when v_action='BREAK' then 'Break' else 'Job Pause' end,
      'Pause Note',coalesce(p_note,''),
      'Updated Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'Record Version',coalesce((v_row.payload->>'Record Version')::int,1)+1
    );
  else
    if upper(coalesce(v_row.payload->>'Status','')) not in ('PAUSED','BREAK') then
      raise exception 'Only a paused time entry can be resumed';
    end if;
    v_pause_started:=nullif(v_row.payload->>'Paused Time','')::timestamptz;
    v_break:=coalesce(nullif(v_row.payload->>'Break Minutes','')::numeric,0);
    if v_pause_started is not null then
      v_break:=v_break+greatest(0,round((extract(epoch from (v_now-v_pause_started))/60.0)::numeric,2));
    end if;
    v_payload:=v_row.payload || jsonb_build_object(
      'Status','Clocked In',
      'Break Minutes',v_break,
      'Paused Time','',
      'Pause Type','',
      'Last Resume Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'Updated Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'Record Version',coalesce((v_row.payload->>'Record Version')::int,1)+1
    );
  end if;

  update public.business_records
  set payload=v_payload,updated_by=v_uid,updated_at=v_now
  where id=v_row.id;

  insert into public.business_proof_log(
    business_id,actor_user_id,action_type,entity_type,result,details,external_action_occurred
  ) values(
    p_business_id,v_uid,'employee_time_transition','timeEntry','PASS',
    jsonb_build_object(
      'timeEntryId',coalesce(v_payload->>'Time Entry ID',v_row.record_key),
      'action',v_action,
      'jobId',coalesce(v_payload->>'Job ID',''),
      'taskId',coalesce(v_payload->>'Task ID',''),
      'employeeSelfService',true
    ),false
  );
  return v_payload;
end
$$;
revoke all on function public.business_office_employee_time_transition(uuid,text,text) from public,anon;
grant execute on function public.business_office_employee_time_transition(uuid,text,text) to authenticated;

create or replace function public.business_office_clock_out(p_business_id uuid,p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_row public.business_records%rowtype;
  v_now timestamptz:=now();
  v_start timestamptz;
  v_pause_started timestamptz;
  v_break numeric;
  v_hours numeric;
  v_payload jsonb;
begin
  select membership.role into v_role
  from public.business_memberships membership
  where membership.business_id=p_business_id
    and membership.auth_user_id=v_uid
    and membership.status='active'
  limit 1;
  if v_role not in ('owner','administrator','staff') then
    raise exception 'Time clock access requires an active staff membership';
  end if;

  select * into v_row
  from public.business_records record
  where record.business_id=p_business_id
    and record.collection='timeEntries'
    and record.created_by=v_uid
    and record.record_status='active'
    and coalesce(record.payload->>'End Time','')=''
  order by record.created_at desc
  limit 1
  for update;
  if v_row.id is null then raise exception 'No active time entry found'; end if;

  v_start:=(v_row.payload->>'Start Time')::timestamptz;
  v_break:=coalesce(nullif(v_row.payload->>'Break Minutes','')::numeric,0);
  if upper(coalesce(v_row.payload->>'Status','')) in ('PAUSED','BREAK') then
    v_pause_started:=nullif(v_row.payload->>'Paused Time','')::timestamptz;
    if v_pause_started is not null then
      v_break:=v_break+greatest(0,round((extract(epoch from (v_now-v_pause_started))/60.0)::numeric,2));
    end if;
  end if;
  v_hours:=greatest(0,round((extract(epoch from (v_now-v_start))/3600.0-v_break/60.0)::numeric,2));

  v_payload:=v_row.payload || jsonb_build_object(
    'End Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Break Minutes',v_break,
    'Hours',v_hours,
    'Status','Recorded',
    'Paused Time','',
    'Pause Type','',
    'Notes',case when coalesce(btrim(p_notes),'')='' then coalesce(v_row.payload->>'Notes','') else p_notes end,
    'Updated Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Record Version',coalesce((v_row.payload->>'Record Version')::int,1)+1
  );
  update public.business_records set payload=v_payload,updated_by=v_uid,updated_at=v_now where id=v_row.id;
  return v_payload;
end
$$;
revoke all on function public.business_office_clock_out(uuid,text) from public,anon;
grant execute on function public.business_office_clock_out(uuid,text) to authenticated;

create or replace function public.business_office_employee_report_issue(
  p_business_id uuid,
  p_job_id text,
  p_task_id text default null,
  p_category text default 'Other',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_uid uuid:=auth.uid();
  v_membership public.business_memberships%rowtype;
  v_job public.business_records%rowtype;
  v_task public.business_records%rowtype;
  v_category text:=btrim(coalesce(p_category,'Other'));
  v_note text:=left(btrim(coalesce(p_note,'')),4000);
  v_key text:='JOB-NOTE-'||replace(gen_random_uuid()::text,'-','');
  v_now timestamptz:=now();
  v_customer_id text:='';
  v_payload jsonb;
begin
  select * into v_membership
  from public.business_memberships membership
  where membership.business_id=p_business_id
    and membership.auth_user_id=v_uid
    and membership.status='active'
  limit 1;
  if v_membership.id is null or v_membership.role<>'staff' then
    raise exception 'Field issue reporting requires an active Staff membership';
  end if;
  if v_category not in (
    'Need material','Equipment problem','Customer scope change','Access problem',
    'Safety issue','Weather','Property condition','Unable to complete','Other'
  ) then raise exception 'Unsupported issue category'; end if;
  if coalesce(btrim(p_job_id),'')='' then raise exception 'A job is required'; end if;

  select * into v_job
  from public.business_records job
  where job.business_id=p_business_id
    and job.collection='jobs'
    and job.record_status='active'
    and job.record_key=p_job_id
    and private.employee_job_assigned(p_business_id,p_job_id)
  limit 1;
  if v_job.id is null then raise exception 'Assigned job not found'; end if;

  if coalesce(btrim(p_task_id),'')<>'' then
    select * into v_task
    from public.business_records task
    where task.business_id=p_business_id
      and task.collection='tasks'
      and task.record_status='active'
      and task.record_key=p_task_id
      and private.employee_task_assigned(p_business_id,task.payload)
    limit 1;
    if v_task.id is null then raise exception 'Assigned task not found'; end if;
  end if;

  v_customer_id:=coalesce(v_job.payload->>'Customer ID','');
  v_payload:=jsonb_build_object(
    'Job Note ID',v_key,
    'Business ID',p_business_id::text,
    'Job ID',p_job_id,
    'Task ID',coalesce(p_task_id,''),
    'Customer ID',v_customer_id,
    'Note Type','Field Issue',
    'Issue Category',v_category,
    'Body',v_note,
    'Visibility','Internal',
    'Status','Open — Needs Attention',
    'Needs Attention',true,
    'Reported By',v_uid::text,
    'Created By',v_uid::text,
    'Created Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Updated Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Record Version',1
  );

  insert into public.business_records(
    business_id,collection,record_key,payload,record_status,created_by,updated_by
  ) values(
    p_business_id,'jobNotes',v_key,v_payload,'active',v_uid,v_uid
  );

  insert into public.business_proof_log(
    business_id,actor_user_id,action_type,entity_type,result,details,external_action_occurred
  ) values(
    p_business_id,v_uid,'employee_field_issue_reported','jobNote','PASS',
    jsonb_build_object('jobNoteId',v_key,'jobId',p_job_id,'taskId',coalesce(p_task_id,''),'category',v_category,'customerMessageSent',false),false
  );
  return v_payload;
end
$$;
revoke all on function public.business_office_employee_report_issue(uuid,text,text,text,text) from public,anon;
grant execute on function public.business_office_employee_report_issue(uuid,text,text,text,text) to authenticated;
