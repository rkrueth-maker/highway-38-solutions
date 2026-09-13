create or replace function public.h38_preserve_penny_cache_enrichment()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  old_exact boolean := false;
  new_exact boolean := false;
  merged_signals jsonb := '[]'::jsonb;
  allow_clear boolean := false;
begin
  allow_clear := coalesce(new.payload->>'h38_allow_image_clear','') in ('bad_crazy4_v1');

  if coalesce(old.image_storage_path,'') <> ''
     and coalesce(new.image_storage_path,'') = ''
     and not allow_clear then
    new.image_storage_path := old.image_storage_path;
    new.image_url := old.image_url;
    new.image_cached_at := old.image_cached_at;
    new.image_source_url := old.image_source_url;
    new.image_mime := old.image_mime;
  end if;

  old_exact := coalesce(old.payload->>'source_identity_title','') <> ''
    and lower(coalesce(old.payload->>'source_identity_scope','')) in ('exact_upc','exact_product','exact_product_url');
  new_exact := coalesce(new.payload->>'source_identity_title','') <> ''
    and lower(coalesce(new.payload->>'source_identity_scope','')) in ('exact_upc','exact_product','exact_product_url');

  if old_exact and not new_exact then
    new.title := old.title;
    new.payload := coalesce(old.payload,'{}'::jsonb) || coalesce(new.payload,'{}'::jsonb);
    new.payload := jsonb_set(new.payload,'{source_identity_title}',to_jsonb(coalesce(old.payload->>'source_identity_title',old.title)),true);
    if coalesce(old.payload->>'source_identity_scope','') <> '' then
      new.payload := jsonb_set(new.payload,'{source_identity_scope}',to_jsonb(old.payload->>'source_identity_scope'),true);
    end if;
    if coalesce(old.payload->>'source_identity_provider','') <> '' then
      new.payload := jsonb_set(new.payload,'{source_identity_provider}',to_jsonb(old.payload->>'source_identity_provider'),true);
    end if;
  elsif length(trim(coalesce(new.title,''))) < 4 and length(trim(coalesce(old.title,''))) >= 4 then
    new.title := old.title;
  else
    new.payload := coalesce(old.payload,'{}'::jsonb) || coalesce(new.payload,'{}'::jsonb);
  end if;

  select coalesce(jsonb_agg(x.elem order by x.ord),'[]'::jsonb)
  into merged_signals
  from (
    select distinct on (k) elem, ord
    from (
      select elem,
             lower(coalesce(nullif(elem->>'domain',''),nullif(elem->>'name',''),nullif(elem->>'url',''),elem::text)) as k,
             0 as ord
      from jsonb_array_elements(coalesce(old.payload->'signal_sources','[]'::jsonb)) elem
      union all
      select elem,
             lower(coalesce(nullif(elem->>'domain',''),nullif(elem->>'name',''),nullif(elem->>'url',''),elem::text)) as k,
             1 as ord
      from jsonb_array_elements(coalesce(new.payload->'signal_sources','[]'::jsonb)) elem
    ) s
    order by k, ord desc
  ) x;

  if jsonb_array_length(merged_signals) > 0 then
    new.payload := jsonb_set(coalesce(new.payload,'{}'::jsonb),'{signal_sources}',merged_signals,true);
  end if;

  if new.source_bucket = 'deep-shared-v1' then
    new.payload := jsonb_strip_nulls(coalesce(new.payload,'{}'::jsonb));
  end if;

  if old.first_seen_at is not null then new.first_seen_at := old.first_seen_at; end if;
  return new;
end;
$function$;

update public.reseller_hunt_cache
set payload = jsonb_strip_nulls(coalesce(payload, '{}'::jsonb))
where source_bucket = 'deep-shared-v1'
  and payload is distinct from jsonb_strip_nulls(coalesce(payload, '{}'::jsonb));
