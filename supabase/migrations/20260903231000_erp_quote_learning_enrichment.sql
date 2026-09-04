-- Enrich business-specific quote learning without automatic pricing, approval, or sending.
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
  if v_role is null then raise exception 'Active business membership required'; end if;

  select jsonb_build_object(
    'businessId',p_business_id,
    'quoteSamples',count(*),
    'acceptedQuotes',count(*) filter(where lower(coalesce(payload->>'Status','')) in ('accepted','approved','won')),
    'averageQuoteTotal',round(coalesce(avg(case when (payload->>'Total')~'^-?[0-9]+(\.[0-9]+)?$' then (payload->>'Total')::numeric end),0),2),
    'medianQuoteTotal',round(coalesce(percentile_cont(0.5) within group(order by case when (payload->>'Total')~'^-?[0-9]+(\.[0-9]+)?$' then (payload->>'Total')::numeric end) filter(where (payload->>'Total')~'^-?[0-9]+(\.[0-9]+)?$'),0)::numeric,2),
    'completedJobs',(select count(*) from public.business_records j where j.business_id=p_business_id and j.collection='jobs' and j.record_status='active' and lower(coalesce(j.payload->>'Status','')) in ('completed','complete','closed')),
    'timeSamples',(select count(*) from public.business_records t where t.business_id=p_business_id and t.collection='timeEntries' and t.record_status='active' and (t.payload->>'Hours')~'^-?[0-9]+(\.[0-9]+)?$'),
    'recordedLaborHours',(select round(coalesce(sum((t.payload->>'Hours')::numeric),0),2) from public.business_records t where t.business_id=p_business_id and t.collection='timeEntries' and t.record_status='active' and (t.payload->>'Hours')~'^-?[0-9]+(\.[0-9]+)?$')
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
      'averageRecordedHours',coalesce((
        select round(avg((t.payload->>'Hours')::numeric),2)
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
    'advisoryOnly',true,
    'historicalContextForQuoting',true,
    'automaticPriceChanges',false,
    'automaticApproval',false,
    'automaticCustomerSending',false
  );
end
$$;

revoke all on function public.business_office_quote_learning_profile(uuid) from public,anon;
grant execute on function public.business_office_quote_learning_profile(uuid) to authenticated;
