create or replace function public.h38_penny_cache_feed()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_user uuid := auth.uid();
  v_leads jsonb;
  v_meta jsonb;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.h38_product_entitlements e
    where e.user_id = v_user
      and e.product_key = 'penny'
      and e.active = true
      and (e.expires_at is null or e.expires_at > now())
  ) then
    raise exception 'PRODUCT_LOCKED' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(q.item order by q.date_rank desc, q.sort_at desc, q.last_seen_at desc), '[]'::jsonb)
  into v_leads
  from (
    select
      jsonb_strip_nulls(
        coalesce(c.payload, '{}'::jsonb)
        || jsonb_build_object(
          'id', coalesce(nullif(c.payload->>'id',''), c.canonical_key),
          'canonical_id', coalesce(nullif(c.payload->>'canonical_id',''), c.canonical_key),
          'retailer', coalesce(nullif(c.retailer,''), c.payload->>'retailer'),
          'title', coalesce(nullif(c.title,''), c.payload->>'title'),
          'canonical_title', coalesce(nullif(c.title,''), nullif(c.payload->>'canonical_title',''), c.payload->>'title'),
          'upc', coalesce(nullif(c.upc,''), c.payload->>'upc', ''),
          'sku', coalesce(nullif(c.sku,''), c.payload->>'sku', ''),
          'deal_type', coalesce(nullif(c.deal_type,''), c.payload->>'deal_type', 'candidate'),
          'buy_price', coalesce(c.buy_price, nullif(c.payload->>'buy_price','')::numeric),
          'retail_price', coalesce(c.retail_price, nullif(c.payload->>'retail_price','')::numeric),
          'image_url', coalesce(nullif(c.image_url,''), c.payload->>'image_url', ''),
          'image_source_scope', case when nullif(c.image_storage_path,'') is not null then 'exact_product' else c.payload->>'image_source_scope' end,
          'image_source_proof', case when nullif(c.image_storage_path,'') is not null then 'h38_penny_cache_verified_image' else c.payload->>'image_source_proof' end,
          'source_url', coalesce(nullif(c.source_url,''), c.payload->>'source_url', ''),
          'pennied_at', case when c.penny_date_kind in ('pennied_at','pennied_at_repaired_partial_year') then c.penny_sort_at else null end,
          'reported_at', case when c.penny_date_kind = 'reported_at' then c.penny_sort_at else null end,
          'penny_sort_at', c.penny_sort_at,
          'penny_date_kind', c.penny_date_kind,
          'h38_cache_key', c.canonical_key,
          'h38_cache_bucket', c.source_bucket,
          'h38_cache_first_seen_at', c.first_seen_at,
          'h38_cache_last_seen_at', c.last_seen_at,
          'h38_cache_seen_count', c.seen_count,
          'h38_image_cached', (nullif(c.image_storage_path,'') is not null),
          'h38_image_cached_at', c.image_cached_at
        )
      ) as item,
      case c.penny_date_kind
        when 'pennied_at' then 3
        when 'pennied_at_repaired_partial_year' then 3
        when 'reported_at' then 2
        when 'first_captured' then 1
        else 0
      end as date_rank,
      c.penny_sort_at as sort_at,
      c.last_seen_at
    from public.reseller_hunt_cache c
    where c.active = true
      and length(trim(coalesce(c.title,''))) >= 3
      and lower(coalesce(c.title,'')) not like '%inventory checker%'
      and lower(coalesce(c.title,'')) not like '%add the first photo%'
    order by
      case c.penny_date_kind
        when 'pennied_at' then 3
        when 'pennied_at_repaired_partial_year' then 3
        when 'reported_at' then 2
        when 'first_captured' then 1
        else 0
      end desc,
      c.penny_sort_at desc nulls last,
      c.last_seen_at desc
    limit 500
  ) q;

  select to_jsonb(m) into v_meta
  from public.reseller_hunt_cache_meta m
  where m.cache_key = 'penny';

  return jsonb_build_object(
    'leads', v_leads,
    'count', jsonb_array_length(v_leads),
    'meta', coalesce(v_meta, '{}'::jsonb)
  );
end;
$function$;
