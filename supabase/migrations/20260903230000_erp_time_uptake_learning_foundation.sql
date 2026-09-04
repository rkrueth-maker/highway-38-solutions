-- H38 Business Office ERP foundation: audited time, staged data uptake, tenant learning.
-- Phone-first workflows remain primary; ERP/report/add-on surfaces consume these shared contracts lazily.

create table if not exists public.business_record_revisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  business_record_id uuid not null,
  collection text not null,
  record_key text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  before_payload jsonb,
  after_payload jsonb,
  change_reason text not null default '',
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists business_record_revisions_business_record_idx on public.business_record_revisions(business_id,business_record_id,changed_at desc);
create index if not exists business_record_revisions_collection_idx on public.business_record_revisions(business_id,collection,changed_at desc);
alter table public.business_record_revisions enable row level security;

drop policy if exists "owners read business record revisions" on public.business_record_revisions;
create policy "owners read business record revisions" on public.business_record_revisions
for select to authenticated
using (private.business_access(business_id,array['owner','administrator']::text[]));

create or replace function private.capture_business_record_revision()
returns trigger
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_business_id uuid;
  v_record_id uuid;
  v_collection text;
  v_record_key text;
  v_before jsonb;
  v_after jsonb;
  v_reason text;
  v_actor uuid;
begin
  if tg_op='DELETE' then
    v_business_id := old.business_id;
    v_record_id := old.id;
    v_collection := old.collection;
    v_record_key := old.record_key;
  else
    v_business_id := new.business_id;
    v_record_id := new.id;
    v_collection := new.collection;
    v_record_key := new.record_key;
  end if;

  -- Start the append-only ledger with time/attendance. Other ERP collections can opt in later
  -- without copying every ordinary Business Office record change today.
  if v_collection <> 'timeEntries' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  v_before := case when tg_op='INSERT' then null else old.payload end;
  v_after := case when tg_op='DELETE' then null else new.payload end;
  v_actor := coalesce(case when tg_op='DELETE' then old.updated_by else new.updated_by end,auth.uid());
  v_reason := coalesce(
    case when tg_op='DELETE' then old.payload->>'Edit Reason' else new.payload->>'Edit Reason' end,
    case when tg_op='INSERT' then 'Employee clock in' end,
    case when tg_op='UPDATE' and coalesce(old.payload->>'End Time','')='' and coalesce(new.payload->>'End Time','')<>'' then 'Employee clock out' end,
    ''
  );
  insert into public.business_record_revisions(
    business_id,business_record_id,collection,record_key,operation,before_payload,after_payload,change_reason,changed_by
  ) values(v_business_id,v_record_id,v_collection,v_record_key,tg_op,v_before,v_after,v_reason,v_actor);

  if tg_op='DELETE' then return old; else return new; end if;
end
$$;
revoke all on function private.capture_business_record_revision() from public,anon,authenticated;

drop trigger if exists business_records_revision_ledger on public.business_records;
create trigger business_records_revision_ledger
after insert or update or delete on public.business_records
for each row execute function private.capture_business_record_revision();

-- All time-entry writes go through audited RPCs. Staff use self-scoped punch RPCs;
-- owner/administrator corrections require a reason. Generic reads remain available to owners.
create or replace function private.business_record_access(p_business_id uuid,p_collection text,p_write boolean default false)
returns boolean
language sql
stable
security definer
set search_path='pg_catalog','public','private'
as $$
  select exists (
    select 1
    from public.business_memberships membership
    where membership.business_id=p_business_id
      and membership.auth_user_id=(select auth.uid())
      and membership.status='active'
      and (
        (
          membership.role in ('owner','administrator')
          and not (p_write=true and p_collection='timeEntries')
        )
        or (
          membership.role='staff'
          and p_collection not in (
            'payments','expenses','invoices','settings','providers','approvals','proofLog','errorLog','socialAccounts','timeEntries'
          )
        )
        or (
          membership.role='viewer'
          and p_write=false
          and p_collection in (
            'customers','contacts','properties','requests','jobs','workOrders','tasks','scheduleEvents','jobNotes',
            'quotes','measurements','documents','attachments','invoices','portalThreads','portalMessages'
          )
        )
      )
  )
$$;

create or replace function public.business_office_time_state(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_current jsonb;
  v_recent jsonb;
begin
  select membership.role into v_role from public.business_memberships membership
  where membership.business_id=p_business_id and membership.auth_user_id=v_uid and membership.status='active' limit 1;
  if v_role is null then raise exception 'Active business membership required'; end if;
  select record.payload into v_current from public.business_records record
  where record.business_id=p_business_id and record.collection='timeEntries' and record.created_by=v_uid
    and record.record_status='active' and coalesce(record.payload->>'End Time','')=''
  order by record.created_at desc limit 1;
  select coalesce(jsonb_agg(item.payload order by item.created_at desc),'[]'::jsonb) into v_recent
  from (select record.payload,record.created_at from public.business_records record
        where record.business_id=p_business_id and record.collection='timeEntries' and record.created_by=v_uid and record.record_status='active'
        order by record.created_at desc limit 10) item;
  return jsonb_build_object('role',v_role,'canEdit',v_role in ('owner','administrator'),'currentPunch',v_current,'recent',v_recent);
end
$$;

create or replace function public.business_office_clock_in(p_business_id uuid,p_job_id text default null,p_task_id text default null,p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_uid uuid := auth.uid(); v_role text; v_key text := 'TIME-'||replace(gen_random_uuid()::text,'-',''); v_now timestamptz:=now(); v_payload jsonb;
begin
  select membership.role into v_role from public.business_memberships membership
  where membership.business_id=p_business_id and membership.auth_user_id=v_uid and membership.status='active' limit 1;
  if v_role not in ('owner','administrator','staff') then raise exception 'Time clock access requires an active staff membership'; end if;
  if exists(select 1 from public.business_records record where record.business_id=p_business_id and record.collection='timeEntries' and record.created_by=v_uid and record.record_status='active' and coalesce(record.payload->>'End Time','')='') then
    raise exception 'Clock out before starting another time entry';
  end if;
  v_payload:=jsonb_build_object(
    'Time Entry ID',v_key,'Business ID',p_business_id::text,'Auth User ID',v_uid::text,'User ID',v_uid::text,
    'Job ID',coalesce(p_job_id,''),'Task ID',coalesce(p_task_id,''),'Start Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'End Time','','Break Minutes',0,'Hours',0,'Status','Clocked In','Approval Status','Owner Approval Required',
    'Notes',coalesce(p_notes,''),'Source','Employee Time Clock','Created Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Updated Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'Record Version',1
  );
  insert into public.business_records(business_id,collection,record_key,payload,record_status,created_by,updated_by)
  values(p_business_id,'timeEntries',v_key,v_payload,'active',v_uid,v_uid);
  return v_payload;
end
$$;

create or replace function public.business_office_clock_out(p_business_id uuid,p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_uid uuid:=auth.uid(); v_role text; v_row public.business_records%rowtype; v_now timestamptz:=now(); v_start timestamptz; v_break numeric; v_hours numeric; v_payload jsonb;
begin
  select membership.role into v_role from public.business_memberships membership
  where membership.business_id=p_business_id and membership.auth_user_id=v_uid and membership.status='active' limit 1;
  if v_role not in ('owner','administrator','staff') then raise exception 'Time clock access requires an active staff membership'; end if;
  select * into v_row from public.business_records record
  where record.business_id=p_business_id and record.collection='timeEntries' and record.created_by=v_uid and record.record_status='active' and coalesce(record.payload->>'End Time','')=''
  order by record.created_at desc limit 1 for update;
  if v_row.id is null then raise exception 'No active time entry found'; end if;
  v_start:=(v_row.payload->>'Start Time')::timestamptz;
  v_break:=coalesce(nullif(v_row.payload->>'Break Minutes','')::numeric,0);
  v_hours:=greatest(0,round((extract(epoch from (v_now-v_start))/3600.0-v_break/60.0)::numeric,2));
  v_payload:=v_row.payload || jsonb_build_object(
    'End Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'Hours',v_hours,'Status','Recorded',
    'Notes',case when coalesce(btrim(p_notes),'')='' then coalesce(v_row.payload->>'Notes','') else p_notes end,
    'Updated Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'Record Version',coalesce((v_row.payload->>'Record Version')::int,1)+1
  );
  update public.business_records set payload=v_payload,updated_by=v_uid,updated_at=v_now where id=v_row.id;
  return v_payload;
end
$$;

create or replace function public.business_office_edit_time_entry(
  p_business_id uuid,p_time_entry_id text,p_reason text,p_start_time timestamptz default null,p_end_time timestamptz default null,
  p_break_minutes numeric default null,p_job_id text default null,p_task_id text default null,p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_uid uuid:=auth.uid(); v_role text; v_row public.business_records%rowtype; v_payload jsonb; v_start timestamptz; v_end timestamptz; v_break numeric; v_hours numeric; v_now timestamptz:=now();
begin
  select membership.role into v_role from public.business_memberships membership
  where membership.business_id=p_business_id and membership.auth_user_id=v_uid and membership.status='active' limit 1;
  if v_role not in ('owner','administrator') then raise exception 'Owner or administrator access required'; end if;
  if coalesce(btrim(p_reason),'')='' then raise exception 'An edit reason is required'; end if;
  select * into v_row from public.business_records record where record.business_id=p_business_id and record.collection='timeEntries' and record.record_key=p_time_entry_id and record.record_status='active' limit 1 for update;
  if v_row.id is null then raise exception 'Time entry not found'; end if;
  v_start:=coalesce(p_start_time,nullif(v_row.payload->>'Start Time','')::timestamptz);
  v_end:=coalesce(p_end_time,nullif(v_row.payload->>'End Time','')::timestamptz);
  v_break:=coalesce(p_break_minutes,nullif(v_row.payload->>'Break Minutes','')::numeric,0);
  v_hours:=case when v_start is not null and v_end is not null then greatest(0,round((extract(epoch from (v_end-v_start))/3600.0-v_break/60.0)::numeric,2)) else 0 end;
  v_payload:=v_row.payload || jsonb_strip_nulls(jsonb_build_object(
    'Start Time',case when v_start is null then null else to_char(v_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'End Time',case when v_end is null then null else to_char(v_end at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'Break Minutes',v_break,'Hours',v_hours,'Job ID',p_job_id,'Task ID',p_task_id,'Notes',p_notes,
    'Edit Reason',p_reason,'Last Edited By',v_uid::text,'Last Edited Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Edit Count',coalesce((v_row.payload->>'Edit Count')::int,0)+1,'Updated Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Record Version',coalesce((v_row.payload->>'Record Version')::int,1)+1
  ));
  update public.business_records set payload=v_payload,updated_by=v_uid,updated_at=v_now where id=v_row.id;
  return v_payload;
end
$$;

create or replace function public.business_office_time_admin(p_business_id uuid,p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare v_uid uuid:=auth.uid(); v_role text; v_entries jsonb; v_revisions jsonb;
begin
  select membership.role into v_role from public.business_memberships membership where membership.business_id=p_business_id and membership.auth_user_id=v_uid and membership.status='active' limit 1;
  if v_role not in ('owner','administrator') then raise exception 'Owner or administrator access required'; end if;
  select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) into v_entries from (
    select record.id,record.record_key,record.payload,record.created_by,record.updated_by,record.created_at,record.updated_at
    from public.business_records record where record.business_id=p_business_id and record.collection='timeEntries' and record.record_status='active' order by record.created_at desc limit greatest(1,least(p_limit,200))
  ) x;
  select coalesce(jsonb_agg(x order by x.changed_at desc),'[]'::jsonb) into v_revisions from (
    select revision.id,revision.record_key,revision.operation,revision.before_payload,revision.after_payload,revision.change_reason,revision.changed_by,revision.changed_at
    from public.business_record_revisions revision where revision.business_id=p_business_id and revision.collection='timeEntries' order by revision.changed_at desc limit greatest(1,least(p_limit*3,500))
  ) x;
  return jsonb_build_object('entries',v_entries,'revisions',v_revisions);
end
$$;

create table if not exists public.business_data_import_runs(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  source_name text not null,
  entity_type text not null,
  status text not null default 'staged' check(status in ('staged','reviewed','importing','complete','failed')),
  row_count integer not null default 0,
  imported_count integer not null default 0,
  error_count integer not null default 0,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists business_data_import_runs_business_idx on public.business_data_import_runs(business_id,created_at desc);
alter table public.business_data_import_runs enable row level security;

drop policy if exists "administrators manage business data imports" on public.business_data_import_runs;
create policy "administrators manage business data imports" on public.business_data_import_runs for all to authenticated
using(private.business_access(business_id,array['owner','administrator']::text[]))
with check(private.business_access(business_id,array['owner','administrator']::text[]) and created_by=(select auth.uid()));

create table if not exists public.business_data_import_rows(
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.business_data_import_runs(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  row_number integer not null,
  target_collection text not null,
  target_record_key text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  status text not null default 'ready' check(status in ('ready','imported','error','skipped')),
  error_message text not null default '',
  imported_at timestamptz,
  unique(run_id,row_number)
);
create index if not exists business_data_import_rows_run_idx on public.business_data_import_rows(run_id,row_number);
alter table public.business_data_import_rows enable row level security;

drop policy if exists "administrators manage business data import rows" on public.business_data_import_rows;
create policy "administrators manage business data import rows" on public.business_data_import_rows for all to authenticated
using(private.business_access(business_id,array['owner','administrator']::text[]))
with check(private.business_access(business_id,array['owner','administrator']::text[]));

create or replace function public.business_office_stage_import(p_business_id uuid,p_source_name text,p_entity_type text,p_rows jsonb)
returns uuid
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_uid uuid:=auth.uid();
  v_run uuid;
  v_row jsonb;
  v_index integer:=0;
  v_collection text;
  v_key text;
  v_payload jsonb;
  v_allowed_collections constant text[]:=array['customers','contacts','properties','jobs','workOrders','tasks','quotes','timeEntries','expenses','invoices','payments','documents','historicalRecords'];
begin
  if not private.business_access(p_business_id,array['owner','administrator']::text[]) then raise exception 'Owner or administrator access required'; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'Import rows are required'; end if;
  if jsonb_array_length(p_rows)>5000 then raise exception 'Import batches are limited to 5000 rows'; end if;
  if coalesce(nullif(btrim(p_entity_type),''),'historicalRecords') <> all(v_allowed_collections) then raise exception 'Unsupported import data type'; end if;
  insert into public.business_data_import_runs(business_id,source_name,entity_type,row_count,created_by)
  values(p_business_id,coalesce(nullif(btrim(p_source_name),''),'Imported data'),coalesce(nullif(btrim(p_entity_type),''),'historicalRecords'),jsonb_array_length(p_rows),v_uid)
  returning id into v_run;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_index:=v_index+1;
    v_collection:=coalesce(nullif(v_row->>'targetCollection',''),nullif(p_entity_type,''),'historicalRecords');
    if v_collection <> all(v_allowed_collections) then raise exception 'Unsupported target collection at row %',v_index; end if;
    v_key:=coalesce(nullif(v_row->>'targetRecordKey',''),'IMPORT-'||replace(gen_random_uuid()::text,'-',''));
    v_payload:=coalesce(v_row->'normalizedPayload',v_row->'rawPayload',v_row,'{}'::jsonb);
    insert into public.business_data_import_rows(run_id,business_id,row_number,target_collection,target_record_key,raw_payload,normalized_payload)
    values(v_run,p_business_id,v_index,v_collection,v_key,coalesce(v_row->'rawPayload',v_payload),v_payload);
  end loop;
  return v_run;
end
$$;

create or replace function public.business_office_apply_import(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare v_uid uuid:=auth.uid(); v_run public.business_data_import_runs%rowtype; v_row public.business_data_import_rows%rowtype; v_imported integer:=0; v_errors integer:=0;
begin
  select * into v_run from public.business_data_import_runs where id=p_run_id for update;
  if v_run.id is null then raise exception 'Import run not found'; end if;
  if not private.business_access(v_run.business_id,array['owner','administrator']::text[]) then raise exception 'Owner or administrator access required'; end if;
  if v_run.status not in ('staged','reviewed','failed') then raise exception 'Import run is not ready to apply'; end if;
  update public.business_data_import_runs set status='importing' where id=p_run_id;
  for v_row in select * from public.business_data_import_rows where run_id=p_run_id and status='ready' order by row_number loop
    begin
      insert into public.business_records(business_id,collection,record_key,payload,record_status,created_by,updated_by)
      values(v_run.business_id,v_row.target_collection,v_row.target_record_key,
        v_row.normalized_payload || jsonb_build_object('Business ID',v_run.business_id::text,'Import Run ID',p_run_id::text,'Imported Time',now()::text),
        'active',v_uid,v_uid)
      on conflict (business_id,collection,record_key) do update set payload=excluded.payload,record_status='active',updated_by=v_uid,updated_at=now();
      update public.business_data_import_rows set status='imported',imported_at=now(),error_message='' where id=v_row.id;
      v_imported:=v_imported+1;
    exception when others then
      update public.business_data_import_rows set status='error',error_message=left(sqlerrm,500) where id=v_row.id;
      v_errors:=v_errors+1;
    end;
  end loop;
  update public.business_data_import_runs set status=case when v_errors=0 then 'complete' else 'failed' end,imported_count=v_imported,error_count=v_errors,completed_at=now() where id=p_run_id;
  return jsonb_build_object('runId',p_run_id,'imported',v_imported,'errors',v_errors,'status',case when v_errors=0 then 'complete' else 'failed' end);
end
$$;

create or replace function public.business_office_quote_learning_profile(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare v_uid uuid:=auth.uid(); v_role text; v_profile jsonb; v_patterns jsonb;
begin
  select membership.role into v_role from public.business_memberships membership where membership.business_id=p_business_id and membership.auth_user_id=v_uid and membership.status='active' limit 1;
  if v_role is null then raise exception 'Active business membership required'; end if;
  select jsonb_build_object(
    'businessId',p_business_id,'quoteSamples',count(*),
    'acceptedQuotes',count(*) filter(where lower(coalesce(payload->>'Status',''))='accepted'),
    'averageQuoteTotal',round(coalesce(avg(case when (payload->>'Total')~'^-?[0-9]+(\.[0-9]+)?$' then (payload->>'Total')::numeric end),0),2),
    'medianQuoteTotal',round(coalesce(percentile_cont(0.5) within group(order by case when (payload->>'Total')~'^-?[0-9]+(\.[0-9]+)?$' then (payload->>'Total')::numeric end) filter(where (payload->>'Total')~'^-?[0-9]+(\.[0-9]+)?$'),0)::numeric,2),
    'completedJobs',(select count(*) from public.business_records j where j.business_id=p_business_id and j.collection='jobs' and j.record_status='active' and lower(coalesce(j.payload->>'Status',''))='completed'),
    'timeSamples',(select count(*) from public.business_records t where t.business_id=p_business_id and t.collection='timeEntries' and t.record_status='active' and coalesce(t.payload->>'Hours','')<>'')
  ) into v_profile from public.business_records where business_id=p_business_id and collection='quotes' and record_status='active';
  select coalesce(jsonb_agg(pattern order by (pattern->>'samples')::int desc),'[]'::jsonb) into v_patterns from (
    select jsonb_build_object('projectPattern',coalesce(nullif(btrim(payload->>'Project Title'),''),'Unclassified'),'samples',count(*),
      'averageTotal',round(coalesce(avg(case when (payload->>'Total')~'^-?[0-9]+(\.[0-9]+)?$' then (payload->>'Total')::numeric end),0),2)) pattern
    from public.business_records where business_id=p_business_id and collection='quotes' and record_status='active'
    group by coalesce(nullif(btrim(payload->>'Project Title'),''),'Unclassified') order by count(*) desc limit 12
  ) patterns;
  return v_profile || jsonb_build_object('patterns',v_patterns,'tenantIsolated',true,'advisoryOnly',true,'automaticApproval',false,'automaticCustomerSending',false);
end
$$;

revoke all on function public.business_office_time_state(uuid) from public,anon;
revoke all on function public.business_office_clock_in(uuid,text,text,text) from public,anon;
revoke all on function public.business_office_clock_out(uuid,text) from public,anon;
revoke all on function public.business_office_edit_time_entry(uuid,text,text,timestamptz,timestamptz,numeric,text,text,text) from public,anon;
revoke all on function public.business_office_time_admin(uuid,integer) from public,anon;
revoke all on function public.business_office_stage_import(uuid,text,text,jsonb) from public,anon;
revoke all on function public.business_office_apply_import(uuid) from public,anon;
revoke all on function public.business_office_quote_learning_profile(uuid) from public,anon;
grant execute on function public.business_office_time_state(uuid) to authenticated;
grant execute on function public.business_office_clock_in(uuid,text,text,text) to authenticated;
grant execute on function public.business_office_clock_out(uuid,text) to authenticated;
grant execute on function public.business_office_edit_time_entry(uuid,text,text,timestamptz,timestamptz,numeric,text,text,text) to authenticated;
grant execute on function public.business_office_time_admin(uuid,integer) to authenticated;
grant execute on function public.business_office_stage_import(uuid,text,text,jsonb) to authenticated;
grant execute on function public.business_office_apply_import(uuid) to authenticated;
grant execute on function public.business_office_quote_learning_profile(uuid) to authenticated;
