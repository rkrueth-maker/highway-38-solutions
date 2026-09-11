-- Harden Existing-data uptake so reviewed imports enrich records without blindly
-- replacing nonblank current values. Keep tenant isolation and explicit owner/admin apply.

create or replace function public.business_office_apply_import(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_uid uuid:=auth.uid();
  v_run public.business_data_import_runs%rowtype;
  v_row public.business_data_import_rows%rowtype;
  v_imported integer:=0;
  v_errors integer:=0;
  v_new integer:=0;
  v_matched integer:=0;
  v_enriched integer:=0;
  v_conflicts integer:=0;
  v_needs_review integer:=0;
  v_rates_confirmed integer:=0;
  v_rates_inferred integer:=0;
  v_existing public.business_records%rowtype;
  v_payload jsonb;
  v_safe_patch jsonb;
begin
  select * into v_run from public.business_data_import_runs where id=p_run_id for update;
  if v_run.id is null then raise exception 'Import run not found'; end if;
  if not private.business_access(v_run.business_id,array['owner','administrator']::text[]) then
    raise exception 'Owner or administrator access required';
  end if;
  if v_run.status not in ('staged','reviewed','failed') then raise exception 'Import run is not ready to apply'; end if;

  update public.business_data_import_runs set status='importing' where id=p_run_id;

  for v_row in
    select * from public.business_data_import_rows
    where run_id=p_run_id and status='ready'
    order by row_number
  loop
    begin
      v_payload:=coalesce(v_row.normalized_payload,'{}'::jsonb)
        || jsonb_build_object(
          'Business ID',v_run.business_id::text,
          'Import Run ID',p_run_id::text,
          'Imported Time',now()::text
        );

      select * into v_existing
      from public.business_records r
      where r.business_id=v_run.business_id
        and r.collection=v_row.target_collection
        and r.record_key=v_row.target_record_key
      limit 1
      for update;

      if v_existing.id is null then
        insert into public.business_records(
          business_id,collection,record_key,payload,record_status,created_by,updated_by
        ) values(
          v_run.business_id,v_row.target_collection,v_row.target_record_key,v_payload,'active',v_uid,v_uid
        );
        v_new:=v_new+1;
      else
        -- Only fill keys that are absent or blank in the current record. Current nonblank
        -- values win even if the staged spreadsheet conflicts, preventing stale staged data
        -- from overwriting a newer owner edit between review and apply.
        select coalesce(jsonb_object_agg(item.key,item.value),'{}'::jsonb)
          into v_safe_patch
        from jsonb_each(v_payload) item
        where not (v_existing.payload ? item.key)
           or coalesce(btrim(v_existing.payload->>item.key),'')='';

        update public.business_records
        set payload=coalesce(v_existing.payload,'{}'::jsonb) || coalesce(v_safe_patch,'{}'::jsonb),
            record_status='active',updated_by=v_uid,updated_at=now()
        where id=v_existing.id;
        v_matched:=v_matched+1;
        if coalesce(v_safe_patch,'{}'::jsonb) <> '{}'::jsonb then v_enriched:=v_enriched+1; end if;
      end if;

      v_conflicts:=v_conflicts + coalesce(jsonb_array_length(case when jsonb_typeof(v_payload->'Import Conflicts')='array' then v_payload->'Import Conflicts' else '[]'::jsonb end),0);
      if coalesce(v_payload->>'Import Review Status','')='Needs review' then v_needs_review:=v_needs_review+1; end if;
      v_rates_confirmed:=v_rates_confirmed + coalesce(jsonb_array_length(case when jsonb_typeof(v_payload->'Import Confirmed Rates')='array' then v_payload->'Import Confirmed Rates' else '[]'::jsonb end),0);
      v_rates_inferred:=v_rates_inferred + coalesce(jsonb_array_length(case when jsonb_typeof(v_payload->'Import Inferred Rates')='array' then v_payload->'Import Inferred Rates' else '[]'::jsonb end),0);

      update public.business_data_import_rows
      set status='imported',imported_at=now(),error_message=''
      where id=v_row.id;
      v_imported:=v_imported+1;
    exception when others then
      update public.business_data_import_rows
      set status='error',error_message=left(sqlerrm,500)
      where id=v_row.id;
      v_errors:=v_errors+1;
    end;
  end loop;

  update public.business_data_import_runs
  set status=case when v_errors=0 then 'complete' else 'failed' end,
      imported_count=v_imported,error_count=v_errors,completed_at=now()
  where id=p_run_id;

  insert into public.business_proof_log(
    business_id,actor_user_id,action_type,entity_type,result,details,external_action_occurred
  ) values(
    v_run.business_id,v_uid,'CUSTOMER_DATA_IMPORT_APPLY','ImportRun',
    case when v_errors=0 then 'PASS' else 'PARTIAL' end,
    jsonb_build_object(
      'importRunId',p_run_id,
      'sourceName',v_run.source_name,
      'entityType',v_run.entity_type,
      'stagedRows',v_run.row_count,
      'importedRows',v_imported,
      'errors',v_errors,
      'newRecords',v_new,
      'matchedExisting',v_matched,
      'enrichedExisting',v_enriched,
      'conflictsRecorded',v_conflicts,
      'needsReviewRows',v_needs_review,
      'ratesConfirmed',v_rates_confirmed,
      'ratesInferred',v_rates_inferred,
      'tenantIsolated',true,
      'ownerReviewedApply',true,
      'automaticExternalActions',false
    ),
    false
  );

  return jsonb_build_object(
    'runId',p_run_id,
    'imported',v_imported,
    'errors',v_errors,
    'newRecords',v_new,
    'matchedExisting',v_matched,
    'enrichedExisting',v_enriched,
    'conflicts',v_conflicts,
    'needsReview',v_needs_review,
    'ratesConfirmed',v_rates_confirmed,
    'ratesInferred',v_rates_inferred,
    'status',case when v_errors=0 then 'complete' else 'failed' end
  );
end
$$;

revoke all on function public.business_office_apply_import(uuid) from public,anon;
grant execute on function public.business_office_apply_import(uuid) to authenticated;
