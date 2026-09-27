-- Correct site-visit linkage detection when some link keys exist as empty strings.
create or replace function private.business_office_site_visit_linkage_correction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linked boolean;
begin
  if new.collection<>'siteCaptureSessions' then return new; end if;
  v_linked :=
    nullif(trim(coalesce(new.payload->>'Customer ID',new.payload->>'customerId','')),'') is not null or
    nullif(trim(coalesce(new.payload->>'Quote ID',new.payload->>'quoteId','')),'') is not null or
    nullif(trim(coalesce(new.payload->>'Job ID',new.payload->>'jobId','')),'') is not null or
    nullif(trim(coalesce(new.payload->>'Property ID',new.payload->>'propertyId','')),'') is not null or
    nullif(trim(coalesce(new.payload->>'Request ID',new.payload->>'requestId','')),'') is not null;

  if v_linked then
    perform private.business_office_owner_task_complete(new.business_id,'site_visit.linkage',new.record_key,'Site visit has an authoritative business link',coalesce(new.updated_by,new.created_by));
  end if;
  return new;
end
$$;

revoke all on function private.business_office_site_visit_linkage_correction() from public, anon, authenticated;

drop trigger if exists zz_business_records_site_visit_linkage_correction on public.business_records;
create trigger zz_business_records_site_visit_linkage_correction
after insert or update of payload,record_status on public.business_records
for each row when (new.collection='siteCaptureSessions')
execute function private.business_office_site_visit_linkage_correction();

-- Repair any already-created linkage tasks where the site visit is actually linked.
do $$
declare r record;
begin
  for r in
    select br.business_id,br.record_key,br.payload,br.updated_by,br.created_by
    from public.business_records br
    where br.collection='siteCaptureSessions' and br.record_status='active'
  loop
    if nullif(trim(coalesce(r.payload->>'Customer ID',r.payload->>'customerId','')),'') is not null
       or nullif(trim(coalesce(r.payload->>'Quote ID',r.payload->>'quoteId','')),'') is not null
       or nullif(trim(coalesce(r.payload->>'Job ID',r.payload->>'jobId','')),'') is not null
       or nullif(trim(coalesce(r.payload->>'Property ID',r.payload->>'propertyId','')),'') is not null
       or nullif(trim(coalesce(r.payload->>'Request ID',r.payload->>'requestId','')),'') is not null then
      perform private.business_office_owner_task_complete(r.business_id,'site_visit.linkage',r.record_key,'Site visit has an authoritative business link',coalesce(r.updated_by,r.created_by));
    end if;
  end loop;
end
$$;
