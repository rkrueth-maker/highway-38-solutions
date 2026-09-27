-- Durable shared lifecycle owner tasks across all Business Office tenants.
-- Internal queue only. No customer send, payment, purchase, scheduling, approval, or work start is automatic.

create or replace function private.business_office_safe_timestamptz(p_value text)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
begin
  if nullif(trim(coalesce(p_value,'')),'') is null then return null; end if;
  return p_value::timestamptz;
exception when others then
  return null;
end
$$;

revoke all on function private.business_office_safe_timestamptz(text) from public, anon, authenticated;

create or replace function private.business_office_owner_task_upsert(
  p_business_id uuid,
  p_domain text,
  p_source_id text,
  p_event text,
  p_title text,
  p_task_type text,
  p_priority text,
  p_due timestamptz,
  p_instructions text,
  p_links jsonb default '{}'::jsonb,
  p_source_actor uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_actor uuid;
  v_task_key text;
  v_payload jsonb;
begin
  if p_business_id is null or nullif(trim(coalesce(p_domain,'')),'') is null or nullif(trim(coalesce(p_source_id,'')),'') is null or nullif(trim(coalesce(p_event,'')),'') is null then return null; end if;

  select membership.auth_user_id into v_owner_actor
  from public.business_memberships membership
  where membership.business_id=p_business_id and membership.status='active' and membership.role='owner' and membership.auth_user_id is not null
  order by membership.accepted_at nulls last,membership.created_at
  limit 1;
  if v_owner_actor is null then
    select membership.auth_user_id into v_owner_actor
    from public.business_memberships membership
    where membership.business_id=p_business_id and membership.status='active' and membership.role='administrator' and membership.auth_user_id is not null
    order by membership.accepted_at nulls last,membership.created_at
    limit 1;
  end if;
  v_owner_actor:=coalesce(v_owner_actor,p_source_actor,(select auth.uid()));
  if v_owner_actor is null then return null; end if;

  v_task_key:='OWNER-LIFE-'||substr(md5(p_business_id::text||'|'||p_domain||'|'||p_source_id||'|'||p_event),1,32);
  v_payload:=jsonb_build_object(
    'Task ID',v_task_key,'Business ID',p_business_id::text,
    'Task Title',coalesce(nullif(trim(p_title),''),'Owner action required'),
    'Task Type',coalesce(nullif(trim(p_task_type),''),'Lifecycle'),'Task Domain',p_domain,
    'Assigned User ID','','Assigned Role','Owner','Priority',coalesce(nullif(trim(p_priority),''),'Normal'),
    'Status','Open','Due Date',coalesce(p_due,now())::date::text,'Due Time',coalesce(p_due,now())::text,
    'Instructions',coalesce(p_instructions,''),'Linked Record Type',coalesce(p_links->>'Linked Record Type',''),
    'Linked Record ID',coalesce(p_links->>'Linked Record ID',p_source_id),'Source Event',p_event,
    'Source Record ID',p_source_id,'Source Actor User ID',coalesce(p_source_actor::text,''),
    'Auto Managed',true,'External Action Occurred',false,'Created Time',now()::text,'Updated Time',now()::text,'Record Version',1
  )||coalesce(p_links,'{}'::jsonb);

  insert into public.business_records(business_id,collection,record_key,payload,record_status,created_by,updated_by)
  values(p_business_id,'tasks',v_task_key,v_payload,'active',v_owner_actor,v_owner_actor)
  on conflict (business_id,collection,record_key) do update
  set payload=(excluded.payload-'Created Time')||jsonb_build_object(
        'Created Time',coalesce(public.business_records.payload->>'Created Time',excluded.payload->>'Created Time'),
        'Record Version',greatest(1,coalesce((public.business_records.payload->>'Record Version')::int,0)+1)
      ),record_status='active',updated_by=v_owner_actor;
  return v_task_key;
end
$$;

revoke all on function private.business_office_owner_task_upsert(uuid,text,text,text,text,text,text,timestamptz,text,jsonb,uuid) from public, anon, authenticated;

create or replace function private.business_office_owner_task_complete(
  p_business_id uuid,p_domain text,p_source_id text,p_reason text,p_actor uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update public.business_records task_record
  set payload=task_record.payload||jsonb_build_object(
        'Status','Completed','Completed Time',now()::text,
        'Completion Reason',coalesce(p_reason,'Lifecycle condition resolved'),'Updated Time',now()::text,
        'Record Version',greatest(1,coalesce((task_record.payload->>'Record Version')::int,0)+1)
      ),updated_by=coalesce(p_actor,task_record.updated_by)
  where task_record.business_id=p_business_id and task_record.collection='tasks' and task_record.record_status='active'
    and coalesce(task_record.payload->>'Auto Managed','false')='true'
    and coalesce(task_record.payload->>'Task Domain','')=p_domain
    and coalesce(task_record.payload->>'Source Record ID','')=p_source_id
    and lower(coalesce(task_record.payload->>'Status','open')) not in ('complete','completed','done','cancelled','closed','void','voided');
  get diagnostics v_count=row_count;
  return v_count;
end
$$;

revoke all on function private.business_office_owner_task_complete(uuid,text,text,text,uuid) from public, anon, authenticated;

create or replace function private.business_office_reconcile_lifecycle_record(
  p_business_id uuid,p_collection text,p_record_key text,p_payload jsonb,p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text:=lower(trim(coalesce(p_payload->>'Status',p_payload->>'status','')));
  v_job_id text:=coalesce(nullif(trim(coalesce(p_payload->>'Job ID',p_payload->>'jobId','')),''),'');
  v_customer_id text:=coalesce(nullif(trim(coalesce(p_payload->>'Customer ID',p_payload->>'customerId','')),''),'');
  v_title text; v_due timestamptz; v_start timestamptz; v_balance numeric:=0; v_priority text;
begin
  if p_business_id is null or nullif(trim(coalesce(p_record_key,'')),'') is null then return; end if;

  if p_collection='requests' then
    if v_status='' or v_status~'^(new|open|pending|lead)$' then
      v_title:=coalesce(nullif(trim(coalesce(p_payload->>'Subject','')),''),p_record_key);
      perform private.business_office_owner_task_upsert(p_business_id,'request.review',p_record_key,'request.open','Review request: '||v_title,'Request Review','High',now(),'Review the request, confirm customer/property context, and decide the next internal step. Customer contact remains owner-controlled.',jsonb_build_object('Linked Record Type','Request','Linked Record ID',p_record_key,'Customer ID',v_customer_id),p_actor);
    else
      perform private.business_office_owner_task_complete(p_business_id,'request.review',p_record_key,'Request is no longer open',p_actor);
    end if;

  elsif p_collection='jobs' then
    if v_status~'^(complete|completed|done|closed)$' then
      perform private.business_office_owner_task_complete(p_business_id,'job.schedule',p_record_key,'Job moved beyond scheduling',p_actor);
      perform private.business_office_owner_task_complete(p_business_id,'job.prejob',p_record_key,'Job is complete',p_actor);
      if not exists(
        select 1 from public.business_records inv
        where inv.business_id=p_business_id and inv.collection='invoices' and inv.record_status='active'
          and coalesce(inv.payload->>'Job ID',inv.payload->>'jobId','')=p_record_key
          and lower(coalesce(inv.payload->>'Status','')) not in ('void','voided','deleted','cancelled')
      ) then
        perform private.business_office_owner_task_upsert(p_business_id,'job.invoice',p_record_key,'job.completed_needs_invoice','Prepare invoice: '||coalesce(nullif(p_payload->>'Project Title',''),p_record_key),'Billing Handoff','High',now(),'The job is marked complete but no active invoice is linked. Review completion proof and prepare billing; no invoice is sent automatically.',jsonb_build_object('Linked Record Type','Job','Linked Record ID',p_record_key,'Job ID',p_record_key,'Customer ID',v_customer_id),p_actor);
      else
        perform private.business_office_owner_task_complete(p_business_id,'job.invoice',p_record_key,'Invoice exists for completed job',p_actor);
      end if;
    elsif v_status~'(in progress|started|working|active work)' then
      perform private.business_office_owner_task_complete(p_business_id,'job.schedule',p_record_key,'Work has started',p_actor);
      perform private.business_office_owner_task_complete(p_business_id,'job.prejob',p_record_key,'Work has started',p_actor);
    elsif v_status='' or v_status~'^(open|accepted|approved|ready|scheduled)$' then
      if exists(
        select 1 from public.business_records sched
        where sched.business_id=p_business_id and sched.collection='scheduleEvents' and sched.record_status='active'
          and coalesce(sched.payload->>'Job ID',sched.payload->>'jobId','')=p_record_key
          and lower(coalesce(sched.payload->>'Status','')) not in ('cancelled','canceled','void','deleted')
          and private.business_office_safe_timestamptz(coalesce(sched.payload->>'Start Time',sched.payload->>'startTime'))>=now()-interval '12 hours'
      ) then
        perform private.business_office_owner_task_complete(p_business_id,'job.schedule',p_record_key,'Future schedule exists',p_actor);
      else
        perform private.business_office_owner_task_upsert(p_business_id,'job.schedule',p_record_key,'job.needs_schedule','Schedule approved work: '||coalesce(nullif(p_payload->>'Project Title',''),p_record_key),'Scheduling','High',now(),'Confirm the accepted scope, crew/equipment needs, site access, and schedule the job. No work starts automatically.',jsonb_build_object('Linked Record Type','Job','Linked Record ID',p_record_key,'Job ID',p_record_key,'Customer ID',v_customer_id),p_actor);
      end if;
    end if;

  elsif p_collection='scheduleEvents' then
    if v_job_id<>'' then
      if v_status~'(cancel|void|delete)' then
        if not exists(
          select 1 from public.business_records sched
          where sched.business_id=p_business_id and sched.collection='scheduleEvents' and sched.record_status='active' and sched.record_key<>p_record_key
            and coalesce(sched.payload->>'Job ID',sched.payload->>'jobId','')=v_job_id
            and lower(coalesce(sched.payload->>'Status','')) not in ('cancelled','canceled','void','deleted')
            and private.business_office_safe_timestamptz(coalesce(sched.payload->>'Start Time',sched.payload->>'startTime'))>=now()-interval '12 hours'
        ) then
          perform private.business_office_owner_task_upsert(p_business_id,'job.schedule',v_job_id,'job.needs_schedule','Reschedule work','Scheduling','High',now(),'The scheduled event was cancelled or removed. Review the job and create the next approved schedule.',jsonb_build_object('Linked Record Type','Job','Linked Record ID',v_job_id,'Job ID',v_job_id),p_actor);
        end if;
      else
        perform private.business_office_owner_task_complete(p_business_id,'job.schedule',v_job_id,'Schedule event exists',p_actor);
        update public.business_records task_record
        set payload=task_record.payload||jsonb_build_object('Status','Completed','Completed Time',now()::text,'Completion Reason','Future recurring visit scheduled','Updated Time',now()::text),updated_by=coalesce(p_actor,task_record.updated_by)
        where task_record.business_id=p_business_id and task_record.collection='tasks' and task_record.record_status='active'
          and coalesce(task_record.payload->>'Task Domain','')='recurring.next_visit'
          and coalesce(task_record.payload->>'Job ID','')=v_job_id
          and lower(coalesce(task_record.payload->>'Status','open')) not in ('complete','completed','done','cancelled','closed','void','voided');
        v_start:=private.business_office_safe_timestamptz(coalesce(p_payload->>'Start Time',p_payload->>'startTime'));
        if v_start is not null and v_start>now() then
          perform private.business_office_owner_task_upsert(p_business_id,'job.prejob',v_job_id,'job.prejob_ready','Pre-job readiness: '||coalesce(nullif(p_payload->>'Title',''),v_job_id),'Pre-job','Normal',greatest(now(),v_start-interval '1 day'),'Confirm current scope/revision, access, materials, equipment, responsibilities, permits/locates, and safety requirements before work begins.',jsonb_build_object('Linked Record Type','Job','Linked Record ID',v_job_id,'Job ID',v_job_id,'Schedule Event ID',p_record_key),p_actor);
        end if;
      end if;
    end if;

  elsif p_collection='invoices' then
    begin v_balance:=coalesce(nullif(p_payload->>'Balance','')::numeric,nullif(p_payload->>'Balance Due','')::numeric,0); exception when others then v_balance:=0; end;
    if v_status~'(paid|void|delete|cancel)' or v_balance<=0 then
      perform private.business_office_owner_task_complete(p_business_id,'invoice.payment',p_record_key,'Invoice no longer has an open balance',p_actor);
      if v_job_id<>'' then
        perform private.business_office_owner_task_upsert(p_business_id,'job.closeout',v_job_id,'job.financially_closed','Close out job','Closeout','Normal',now(),'Payment/balance is resolved. Finish closeout documents, warranty or maintenance notes, and final records before archiving the job.',jsonb_build_object('Linked Record Type','Job','Linked Record ID',v_job_id,'Job ID',v_job_id,'Invoice ID',p_record_key,'Customer ID',v_customer_id),p_actor);
      end if;
    else
      v_due:=private.business_office_safe_timestamptz(coalesce(p_payload->>'Due Date',p_payload->>'Due Time'));
      if v_due is null then v_due:=now()+interval '7 days'; end if;
      v_priority:=case when v_due<now() then 'High' else 'Normal' end;
      perform private.business_office_owner_task_upsert(p_business_id,'invoice.payment',p_record_key,'invoice.balance_due','Follow up invoice: '||coalesce(nullif(p_payload->>'Invoice Number',''),p_record_key),'Invoice Follow-up',v_priority,v_due,'Review the open balance and prepare an owner-approved follow-up if needed. No customer contact or payment action happens automatically.',jsonb_build_object('Linked Record Type','Invoice','Linked Record ID',p_record_key,'Invoice ID',p_record_key,'Job ID',v_job_id,'Customer ID',v_customer_id),p_actor);
    end if;

  elsif p_collection='recurringPlans' then
    if v_status='' or v_status='active' then
      if v_job_id<>'' and exists(
        select 1 from public.business_records sched
        where sched.business_id=p_business_id and sched.collection='scheduleEvents' and sched.record_status='active'
          and coalesce(sched.payload->>'Job ID',sched.payload->>'jobId','')=v_job_id
          and lower(coalesce(sched.payload->>'Status','')) not in ('cancelled','canceled','void','deleted')
          and private.business_office_safe_timestamptz(coalesce(sched.payload->>'Start Time',sched.payload->>'startTime'))>=now()-interval '12 hours'
      ) then
        perform private.business_office_owner_task_complete(p_business_id,'recurring.next_visit',p_record_key,'Future visit is scheduled',p_actor);
      else
        v_due:=private.business_office_safe_timestamptz(coalesce(p_payload->>'Next Visit Date',p_payload->>'nextVisitDate'));
        if v_due is null then v_due:=now(); end if;
        perform private.business_office_owner_task_upsert(p_business_id,'recurring.next_visit',p_record_key,'recurring.needs_next_visit','Create next recurring visit: '||coalesce(nullif(p_payload->>'Plan Name',''),p_record_key),'Recurring Service','Normal',v_due,'Review the recurring plan and create the next approved schedule event. No customer notification or work start occurs automatically.',jsonb_build_object('Linked Record Type','Recurring Plan','Linked Record ID',p_record_key,'Recurring Plan ID',p_record_key,'Job ID',v_job_id,'Customer ID',v_customer_id),p_actor);
      end if;
    else
      perform private.business_office_owner_task_complete(p_business_id,'recurring.next_visit',p_record_key,'Recurring plan is inactive',p_actor);
    end if;

  elsif p_collection='jobNotes' then
    if lower(coalesce(p_payload->>'Note Type',''))='field issue' and not (v_status~'(resolved|closed|complete|completed|cancel)') then
      v_priority:=case when lower(coalesce(p_payload->>'Issue Category','')) like '%safety%' then 'Urgent' else 'High' end;
      perform private.business_office_owner_task_upsert(p_business_id,'field.issue',p_record_key,'field.issue_reported','Resolve field issue: '||coalesce(nullif(p_payload->>'Issue Category',''),'Field issue'),'Field Issue',v_priority,now(),'Review the field issue, decide the internal response, and assign work as needed. No customer message is sent automatically.',jsonb_build_object('Linked Record Type','Job Note','Linked Record ID',p_record_key,'Job Note ID',p_record_key,'Job ID',v_job_id,'Customer ID',v_customer_id),p_actor);
    else
      perform private.business_office_owner_task_complete(p_business_id,'field.issue',p_record_key,'Field issue is resolved or no longer active',p_actor);
    end if;

  elsif p_collection='changeOrders' then
    if v_status='' or v_status~'(draft|owner review|required|pending)' then
      perform private.business_office_owner_task_upsert(p_business_id,'change_order.review',p_record_key,'change_order.review','Review change order: '||coalesce(nullif(p_payload->>'Title',''),'Job change'),'Change Order Review','High',now(),'Review scope, amount, job impact, and customer approval requirements. Nothing is approved or sent automatically.',jsonb_build_object('Linked Record Type','Change Order','Linked Record ID',p_record_key,'Change Order ID',p_record_key,'Job ID',v_job_id,'Quote ID',coalesce(p_payload->>'Quote ID',''),'Customer ID',v_customer_id),p_actor);
    else
      perform private.business_office_owner_task_complete(p_business_id,'change_order.review',p_record_key,'Change order moved beyond owner review',p_actor);
    end if;

  elsif p_collection='siteCaptureSessions' then
    if v_status~'(complete|completed|done)' and coalesce(p_payload->>'Customer ID',p_payload->>'customerId',p_payload->>'Quote ID',p_payload->>'quoteId',p_payload->>'Job ID',p_payload->>'jobId',p_payload->>'Property ID',p_payload->>'propertyId',p_payload->>'Request ID',p_payload->>'requestId','')='' then
      perform private.business_office_owner_task_upsert(p_business_id,'site_visit.linkage',p_record_key,'site_visit.unlinked','Link completed site visit','Site Visit Review','Normal',now(),'This completed site visit is not linked to a customer, property, request, quote, or job. Review it and connect or archive it intentionally.',jsonb_build_object('Linked Record Type','Site Visit','Linked Record ID',p_record_key,'Site Visit ID',p_record_key),p_actor);
    else
      perform private.business_office_owner_task_complete(p_business_id,'site_visit.linkage',p_record_key,'Site visit is linked or no longer complete',p_actor);
    end if;
  end if;
end
$$;

revoke all on function private.business_office_reconcile_lifecycle_record(uuid,text,text,jsonb,uuid) from public, anon, authenticated;

create or replace function private.business_office_lifecycle_record_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.record_status='active' then
    perform private.business_office_reconcile_lifecycle_record(new.business_id,new.collection,new.record_key,new.payload,coalesce(new.updated_by,new.created_by));
  end if;
  return new;
end
$$;

revoke all on function private.business_office_lifecycle_record_trigger() from public, anon, authenticated;

drop trigger if exists business_records_lifecycle_owner_tasks on public.business_records;
create trigger business_records_lifecycle_owner_tasks
after insert or update of payload,record_status on public.business_records
for each row
when (new.collection in ('requests','jobs','scheduleEvents','invoices','recurringPlans','jobNotes','changeOrders','siteCaptureSessions'))
execute function private.business_office_lifecycle_record_trigger();

-- Retire obvious legacy EX example tasks non-destructively; user-created overdue tasks remain untouched.
update public.business_records task_record
set payload=task_record.payload||jsonb_build_object('Status','Completed','Completed Time',now()::text,'Completion Reason','Legacy EX demo fixture retired by shared lifecycle hardening','Updated Time',now()::text)
where task_record.collection='tasks' and task_record.record_status='active'
  and task_record.record_key like 'EX-TASK-%' and coalesce(task_record.payload->>'Job ID','') like 'EX-JOB-%'
  and lower(coalesce(task_record.payload->>'Status','open')) not in ('complete','completed','done','cancelled','closed','void','voided');

-- Backfill current real lifecycle gaps; explicit TEST/demo/training/fixture and EX records are excluded.
do $$
declare r record;
begin
  for r in
    select br.business_id,br.collection,br.record_key,br.payload,br.updated_by,br.created_by
    from public.business_records br
    where br.record_status='active'
      and br.collection in ('requests','jobs','scheduleEvents','invoices','recurringPlans','jobNotes','changeOrders','siteCaptureSessions')
      and lower(br.record_key) !~ '^(test|demo|train|fixture|ex-)'
      and lower(coalesce(br.payload::text,'')) !~ '("test|"demo|"training|"fixture)'
  loop
    perform private.business_office_reconcile_lifecycle_record(r.business_id,r.collection,r.record_key,r.payload,coalesce(r.updated_by,r.created_by));
  end loop;
end
$$;

comment on function private.business_office_owner_task_upsert(uuid,text,text,text,text,text,text,timestamptz,text,jsonb,uuid) is 'Shared tenant-safe owner task router. Internal work only; never performs external actions.';
comment on function private.business_office_reconcile_lifecycle_record(uuid,text,text,jsonb,uuid) is 'Reconciles request/job/schedule/invoice/recurring/field/change-order/site-visit records into durable owner tasks across every tenant.';
