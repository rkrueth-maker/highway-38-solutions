-- H38 ERP data-quality hardening.
-- Correctly distinguishes imported historical time from live employee punches and keeps
-- business-wide learning owner/admin scoped. Labor history is aggregated by job before
-- averages are calculated so multiple punches on one job do not distort quoting context.

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
  v_event_payload jsonb;
  v_reason text;
  v_actor uuid;
begin
  if tg_op='DELETE' then
    v_business_id := old.business_id;
    v_record_id := old.id;
    v_collection := old.collection;
    v_record_key := old.record_key;
    v_event_payload := old.payload;
  else
    v_business_id := new.business_id;
    v_record_id := new.id;
    v_collection := new.collection;
    v_record_key := new.record_key;
    v_event_payload := new.payload;
  end if;

  if v_collection <> 'timeEntries' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  v_before := case when tg_op='INSERT' then null else old.payload end;
  v_after := case when tg_op='DELETE' then null else new.payload end;
  v_actor := coalesce(case when tg_op='DELETE' then old.updated_by else new.updated_by end,auth.uid());

  v_reason := coalesce(
    case
      when tg_op='UPDATE'
        and coalesce(new.payload->>'Edit Reason','')<>''
        and (
          coalesce(new.payload->>'Edit Reason','')<>coalesce(old.payload->>'Edit Reason','')
          or coalesce(new.payload->>'Last Edited Time','')<>coalesce(old.payload->>'Last Edited Time','')
        )
      then new.payload->>'Edit Reason'
    end,
    case when coalesce(v_event_payload->>'Import Run ID','')<>'' then 'Historical time import' end,
    case when tg_op='INSERT' then 'Employee clock in' end,
    case
      when tg_op='UPDATE'
        and coalesce(old.payload->>'End Time','')=''
        and coalesce(new.payload->>'End Time','')<>''
      then 'Employee clock out'
    end,
    case when tg_op='DELETE' then 'Time entry deleted' end,
    'Time entry changed'
  );

  insert into public.business_record_revisions(
    business_id,business_record_id,collection,record_key,operation,before_payload,after_payload,change_reason,changed_by
  ) values(v_business_id,v_record_id,v_collection,v_record_key,tg_op,v_before,v_after,v_reason,v_actor);

  if tg_op='DELETE' then return old; else return new; end if;
end
$$;
revoke all on function private.capture_business_record_revision() from public,anon,authenticated;

create or replace function public.business_office_quote_learning_profile(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_profile jsonb;
  v_patterns jsonb;
begin
  select membership.role into v_role
  from public.business_memberships membership
  where membership.business_id=p_business_id
    and membership.auth_user_id=v_uid
    and membership.status='active'
  limit 1;

  if v_role not in ('owner','administrator') then
    raise exception 'Owner or administrator access required';
  end if;

  select jsonb_build_object(
    'businessId',p_business_id,
    'quoteSamples',count(*),
    'acceptedQuotes',count(*) filter(where lower(coalesce(payload->>'Status','')) in ('accepted','approved','won')),
    'averageQuoteTotal',round(coalesce(avg(case when (payload->>'Total')~'^-?[0-9]+(\.[0-9]+)?$' then (payload->>'Total')::numeric end),0),2),
    'medianQuoteTotal',round(coalesce(percentile_cont(0.5) within group(order by case when (payload->>'Total')~'^-?[0-9]+(\.[0-9]+)?$' then (payload->>'Total')::numeric end) filter(where (payload->>'Total')~'^-?[0-9]+(\.[0-9]+)?$'),0)::numeric,2),
    'completedJobs',(
      select count(*)
      from public.business_records j
      where j.business_id=p_business_id
        and j.collection='jobs'
        and j.record_status='active'
        and lower(coalesce(j.payload->>'Status','')) in ('completed','complete','closed')
    ),
    'timeSamples',(
      select count(*)
      from public.business_records t
      where t.business_id=p_business_id
        and t.collection='timeEntries'
        and t.record_status='active'
        and (t.payload->>'Hours')~'^-?[0-9]+(\.[0-9]+)?$'
    ),
    'timedJobSamples',(
      select count(*)
      from (
        select t.payload->>'Job ID' as job_id
        from public.business_records t
        where t.business_id=p_business_id
          and t.collection='timeEntries'
          and t.record_status='active'
          and coalesce(t.payload->>'Job ID','')<>''
          and (t.payload->>'Hours')~'^-?[0-9]+(\.[0-9]+)?$'
        group by t.payload->>'Job ID'
      ) timed_jobs
    ),
    'recordedLaborHours',(
      select round(coalesce(sum((t.payload->>'Hours')::numeric),0),2)
      from public.business_records t
      where t.business_id=p_business_id
        and t.collection='timeEntries'
        and t.record_status='active'
        and (t.payload->>'Hours')~'^-?[0-9]+(\.[0-9]+)?$'
    ),
    'totalActualLaborHours',(
      select round(coalesce(sum(job_hours.actual_hours),0),2)
      from (
        select t.payload->>'Job ID' as job_id,sum((t.payload->>'Hours')::numeric) as actual_hours
        from public.business_records t
        where t.business_id=p_business_id
          and t.collection='timeEntries'
          and t.record_status='active'
          and coalesce(t.payload->>'Job ID','')<>''
          and (t.payload->>'Hours')~'^-?[0-9]+(\.[0-9]+)?$'
        group by t.payload->>'Job ID'
      ) job_hours
    ),
    'averageHoursPerTimedJob',(
      select round(coalesce(avg(job_hours.actual_hours),0),2)
      from (
        select t.payload->>'Job ID' as job_id,sum((t.payload->>'Hours')::numeric) as actual_hours
        from public.business_records t
        where t.business_id=p_business_id
          and t.collection='timeEntries'
          and t.record_status='active'
          and coalesce(t.payload->>'Job ID','')<>''
          and (t.payload->>'Hours')~'^-?[0-9]+(\.[0-9]+)?$'
        group by t.payload->>'Job ID'
      ) job_hours
    )
  ) into v_profile
  from public.business_records
  where business_id=p_business_id and collection='quotes' and record_status='active';

  select coalesce(jsonb_agg(pattern order by (pattern->>'samples')::int desc),'[]'::jsonb)
  into v_patterns
  from (
    select jsonb_build_object(
      'projectPattern',q.project_pattern,
      'samples',count(*),
      'averageTotal',round(coalesce(avg(case when (q.payload->>'Total')~'^-?[0-9]+(\.[0-9]+)?$' then (q.payload->>'Total')::numeric end),0),2),
      'averageQuotedLabor',round(coalesce(avg(case when (q.payload->>'Labor')~'^-?[0-9]+(\.[0-9]+)?$' then (q.payload->>'Labor')::numeric end),0),2),
      'averageQuotedMaterials',round(coalesce(avg(case when (q.payload->>'Materials')~'^-?[0-9]+(\.[0-9]+)?$' then (q.payload->>'Materials')::numeric end),0),2),
      'timedJobSamples',(
        select count(*)
        from (
          select t.payload->>'Job ID' as job_id
          from public.business_records t
          where t.business_id=p_business_id
            and t.collection='timeEntries'
            and t.record_status='active'
            and (t.payload->>'Hours')~'^-?[0-9]+(\.[0-9]+)?$'
            and coalesce(t.payload->>'Job ID','')<>''
            and (t.payload->>'Job ID') in (
              select q2.payload->>'Job ID'
              from public.business_records q2
              where q2.business_id=p_business_id
                and q2.collection='quotes'
                and q2.record_status='active'
                and coalesce(nullif(btrim(q2.payload->>'Project Title'),''),'Unclassified')=q.project_pattern
                and coalesce(q2.payload->>'Job ID','')<>''
            )
          group by t.payload->>'Job ID'
        ) timed_pattern_jobs
      ),
      'averageRecordedHours',coalesce((
        select round(avg(job_hours.actual_hours),2)
        from (
          select t.payload->>'Job ID' as job_id,sum((t.payload->>'Hours')::numeric) as actual_hours
          from public.business_records t
          where t.business_id=p_business_id
            and t.collection='timeEntries'
            and t.record_status='active'
            and (t.payload->>'Hours')~'^-?[0-9]+(\.[0-9]+)?$'
            and coalesce(t.payload->>'Job ID','')<>''
            and (t.payload->>'Job ID') in (
              select q2.payload->>'Job ID'
              from public.business_records q2
              where q2.business_id=p_business_id
                and q2.collection='quotes'
                and q2.record_status='active'
                and coalesce(nullif(btrim(q2.payload->>'Project Title'),''),'Unclassified')=q.project_pattern
                and coalesce(q2.payload->>'Job ID','')<>''
            )
          group by t.payload->>'Job ID'
        ) job_hours
      ),0),
      'averageActualHoursPerJob',coalesce((
        select round(avg(job_hours.actual_hours),2)
        from (
          select t.payload->>'Job ID' as job_id,sum((t.payload->>'Hours')::numeric) as actual_hours
          from public.business_records t
          where t.business_id=p_business_id
            and t.collection='timeEntries'
            and t.record_status='active'
            and (t.payload->>'Hours')~'^-?[0-9]+(\.[0-9]+)?$'
            and coalesce(t.payload->>'Job ID','')<>''
            and (t.payload->>'Job ID') in (
              select q2.payload->>'Job ID'
              from public.business_records q2
              where q2.business_id=p_business_id
                and q2.collection='quotes'
                and q2.record_status='active'
                and coalesce(nullif(btrim(q2.payload->>'Project Title'),''),'Unclassified')=q.project_pattern
                and coalesce(q2.payload->>'Job ID','')<>''
            )
          group by t.payload->>'Job ID'
        ) job_hours
      ),0)
    ) pattern
    from (
      select payload,coalesce(nullif(btrim(payload->>'Project Title'),''),'Unclassified') as project_pattern
      from public.business_records
      where business_id=p_business_id and collection='quotes' and record_status='active'
    ) q
    group by q.project_pattern
    order by count(*) desc
    limit 12
  ) patterns;

  return v_profile || jsonb_build_object(
    'patterns',v_patterns,
    'tenantIsolated',true,
    'ownerAdminOnly',true,
    'advisoryOnly',true,
    'historicalContextForQuoting',true,
    'jobLevelLaborAggregation',true,
    'automaticPriceChanges',false,
    'automaticApproval',false,
    'automaticCustomerSending',false
  );
end
$$;

revoke all on function public.business_office_quote_learning_profile(uuid) from public,anon;
grant execute on function public.business_office_quote_learning_profile(uuid) to authenticated;
