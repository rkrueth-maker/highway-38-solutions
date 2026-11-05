-- Smart Import column accountability (2026-11-05): allow the Universal Smart
-- Import to stage price-book rows. The price book lives in the business_records
-- collection 'priceBook' (canonical record shape owned by trade-packages.js),
-- but business_office_stage_import's hard-coded collection allow-list predates
-- price-book importing and rejected it with 'Unsupported import data type'.
-- This migration recreates the stage function byte-identically to
-- 20260903230000_erp_time_uptake_learning_foundation.sql except that
-- 'priceBook' is added to v_allowed_collections. The apply function
-- (20260914075000_universal_smart_import_proof_log.sql) is already
-- collection-agnostic and needs no change. Owner/administrator staging gate,
-- 5000-row batch cap, and per-row collection validation are unchanged.

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
  v_allowed_collections constant text[]:=array['customers','contacts','properties','jobs','workOrders','tasks','quotes','timeEntries','expenses','invoices','payments','priceBook','documents','historicalRecords'];
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

revoke all on function public.business_office_stage_import(uuid,text,text,jsonb) from public,anon;
grant execute on function public.business_office_stage_import(uuid,text,text,jsonb) to authenticated;
