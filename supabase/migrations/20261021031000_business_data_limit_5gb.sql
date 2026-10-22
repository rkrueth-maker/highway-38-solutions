-- Policy revision (Rick, 2026-10-21 03:04 CDT): included per-business server
-- data is 5 GB, not 10 GB (80% warning at 4 GB, quote threshold at 5 GB).
-- Also fixes the storage quote-draft insert: business_records.created_by is
-- NOT NULL, so the draft is authored by the H38 owner (platform operator).

alter table public.business_data_usage alter column limit_bytes set default 5368709120;
update public.business_data_usage set limit_bytes = 5368709120 where limit_bytes = 10737418240;

create or replace function public.compute_business_data_usage()
returns void language plpgsql security definer set search_path = public, storage as $$
declare
  H38 constant uuid := '10b85a89-5834-436d-95b0-c6ee2eb335ad';
  LIMIT_DEFAULT constant bigint := 5368709120; -- 5 GiB (Rick, 2026-10-21)
  b record;
  v_prev public.business_data_usage%rowtype;
  v_found boolean;
  v_records_bytes bigint; v_records_count bigint;
  v_files_bytes bigint; v_files_count bigint;
  v_photos bigint; v_videos bigint; v_other bigint;
  v_portal_bytes bigint; v_portal_count bigint;
  v_limit bigint; v_total bigint; v_pct numeric; v_state text;
  v_enabled boolean; v_cfg jsonb; v_push text; v_notify boolean;
  v_h38_enabled boolean; v_h38_cfg jsonb; v_h38_push text;
  v_split text; v_quote_key text; v_existing_key text;
  v_h38_owner uuid;
begin
  select auth_user_id into v_h38_owner from public.business_memberships
    where business_id = H38 and role = 'owner' and status = 'active'
    order by created_at asc limit 1;

  -- Rick's own notification settings (for platform alerts into the H38 tenant).
  select enabled, config into v_h38_enabled, v_h38_cfg
    from public.business_module_settings
    where business_id = H38 and module_key = 'owner_notifications';
  v_h38_push := case when v_h38_enabled = false then 'off'
                     when coalesce((v_h38_cfg->>'push')::boolean, false) then 'pending'
                     else 'off' end;

  for b in select id, display_name from public.businesses order by created_at loop
    -- Records meter (payload bytes; matches Hank's pg_column_size baselines).
    select coalesce(sum(pg_column_size(payload)), 0), count(*)
      into v_records_bytes, v_records_count
      from public.business_records where business_id = b.id;

    -- Server files meter: business-prefixed office buckets.
    select coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0), count(*),
           coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)) filter (where o.metadata->>'mimetype' like 'image/%'), 0),
           coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)) filter (where o.metadata->>'mimetype' like 'video/%'), 0)
      into v_files_bytes, v_files_count, v_photos, v_videos
      from storage.objects o
      where o.bucket_id in ('business-office-files', 'business-office')
        and split_part(o.name, '/', 1) = b.id::text;

    -- Customer-portal PDFs attributed via the quote path join (class: other).
    select coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0), count(*)
      into v_portal_bytes, v_portal_count
      from storage.objects o
      join public.customer_quotes q on q.pdf_storage_path = o.name
      where o.bucket_id = 'customer-portal' and q.business_id = b.id;
    v_files_bytes := v_files_bytes + v_portal_bytes;
    v_files_count := v_files_count + v_portal_count;
    v_other := v_files_bytes - v_photos - v_videos;

    select * into v_prev from public.business_data_usage where business_id = b.id;
    v_found := found;
    v_limit := coalesce(v_prev.limit_bytes, LIMIT_DEFAULT);
    v_total := v_records_bytes + v_files_bytes; -- server data only; external never counted
    v_pct := case when v_limit > 0 then round(100.0 * v_total / v_limit, 2) else 0 end;
    v_state := case when v_pct >= 100 then 'over' when v_pct >= 80 then 'warning' else 'ok' end;

    insert into public.business_data_usage (
      business_id, limit_bytes, records_bytes, records_count, files_bytes, files_count,
      files_photos_bytes, files_videos_bytes, files_other_bytes,
      files_server_bytes, files_external_bytes, total_bytes, pct_of_limit, threshold_state,
      computed_at, updated_at)
    values (b.id, v_limit, v_records_bytes, v_records_count, v_files_bytes, v_files_count,
      v_photos, v_videos, v_other, v_files_bytes, 0, v_total, v_pct, v_state, now(), now())
    on conflict (business_id) do update set
      records_bytes = excluded.records_bytes, records_count = excluded.records_count,
      files_bytes = excluded.files_bytes, files_count = excluded.files_count,
      files_photos_bytes = excluded.files_photos_bytes,
      files_videos_bytes = excluded.files_videos_bytes,
      files_other_bytes = excluded.files_other_bytes,
      files_server_bytes = excluded.files_server_bytes,
      files_external_bytes = excluded.files_external_bytes,
      total_bytes = excluded.total_bytes, pct_of_limit = excluded.pct_of_limit,
      threshold_state = excluded.threshold_state,
      computed_at = now(), updated_at = now();

    insert into public.business_data_usage_history (
      business_id, limit_bytes, records_bytes, records_count, files_bytes, files_count,
      files_photos_bytes, files_videos_bytes, files_other_bytes,
      files_server_bytes, files_external_bytes, total_bytes, pct_of_limit, threshold_state)
    values (b.id, v_limit, v_records_bytes, v_records_count, v_files_bytes, v_files_count,
      v_photos, v_videos, v_other, v_files_bytes, 0, v_total, v_pct, v_state);

    -- This business's owner-notification settings (canonical owner_notifications shape).
    select enabled, config into v_enabled, v_cfg
      from public.business_module_settings
      where business_id = b.id and module_key = 'owner_notifications';
    v_notify := coalesce(v_enabled, true);
    v_push := case when v_enabled = false then 'off'
                   when coalesce((v_cfg->>'push')::boolean, false) then 'pending'
                   else 'off' end;

    v_split := 'Records ' || public.business_data_fmt_bytes(v_records_bytes)
      || ' · Photos ' || public.business_data_fmt_bytes(v_photos)
      || ' · Videos ' || public.business_data_fmt_bytes(v_videos)
      || ' · Other files ' || public.business_data_fmt_bytes(v_other) || '.';

    -- 80% warning: fires once per crossing (flag), owners of the business.
    if v_pct >= 80 and (not v_found or v_prev.warning_notified_at is null) then
      if v_notify then
        perform public.business_data_notify(b.id, 'data_usage_warning',
          'Heads up: data storage is at ' || round(v_pct)::text || '% of your included 5 GB',
          b.display_name || ' has used ' || public.business_data_fmt_bytes(v_total)
            || ' of the 5 GB of server data included with your Office. ' || v_split
            || ' Videos — like site walkthroughs — are usually the biggest consumer. '
            || 'Free way to free up space: export a year of your data and clear its old files (Settings → Data & storage). '
            || 'If you would rather have more room, extra storage is quoted — nothing is ever charged automatically and nothing is cut off.',
          v_push, 'business_data_usage', 'settings');
      end if;
      update public.business_data_usage set warning_notified_at = now() where business_id = b.id;
    end if;

    -- 100%: flag + owner notice + Rick notice + ONE open draft quote.
    if v_pct >= 100 and (not v_found or v_prev.limit_notified_at is null) then
      if v_notify then
        perform public.business_data_notify(b.id, 'data_usage_limit',
          'Data limit reached: ' || round(v_pct)::text || '% of your included 5 GB',
          b.display_name || ' has passed the 5 GB of server data included with your Office ('
            || public.business_data_fmt_bytes(v_total) || ' used). ' || v_split
            || ' Nothing changes in your Office — no cutoff, no automatic charge, your data keeps working. '
            || 'Two options: (1) free — export a year of your data and clear its old files (Settings → Data & storage); videos like site walkthroughs are usually the biggest consumer. '
            || '(2) more room — we have prepared a draft quote for extra storage for review; nothing is charged unless you approve it.',
          v_push, 'business_data_usage', 'settings');
      end if;
      if b.id <> H38 and coalesce(v_h38_enabled, true) then
        perform public.business_data_notify(H38, 'data_usage_limit_platform',
          'Storage limit reached — ' || b.display_name || ' (' || round(v_pct)::text || '%)',
          b.display_name || ' is over its included 5 GB of server data: '
            || public.business_data_fmt_bytes(v_total) || ' used of '
            || public.business_data_fmt_bytes(v_limit) || '. ' || v_split
            || ' A draft quote for extra storage is in Quotes (Draft) for your review — price left blank, set it per case. '
            || 'The business also sees the free year-export option. Nothing was charged or sent.',
          v_h38_push, 'business_data_usage', 'quotes');
      end if;

      select record_key into v_existing_key
        from public.business_records
        where business_id = H38 and collection = 'quotes'
          and payload->>'Storage Overage Business ID' = b.id::text
          and payload->>'Status' = 'Draft'
        order by created_at asc limit 1;
      if v_existing_key is not null then
        v_quote_key := v_existing_key;
      else
        v_quote_key := 'QUOTE-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))
          || '-' || upper(substr(md5(random()::text), 1, 4)) || '-' || upper(substr(md5(random()::text), 1, 4))
          || '-' || upper(substr(md5(random()::text), 1, 4)) || '-' || upper(substr(md5(random()::text), 1, 12));
        insert into public.business_records (business_id, collection, record_key, record_status, payload, created_by, updated_by)
        values (H38, 'quotes', v_quote_key, 'active', jsonb_build_object(
          'Quote ID', v_quote_key,
          'Quote Number', 'LOCAL-' || (extract(epoch from now()) * 1000)::bigint::text,
          'Status', 'Draft',
          'Review Status', 'Draft — Needs Review',
          'Project Title', 'Extra storage — ' || b.display_name,
          'Presented To', b.display_name,
          'Customer ID', b.id::text,
          'Business ID', H38::text,
          'Storage Overage Business ID', b.id::text,
          'Storage Overage Business Name', b.display_name,
          'Data Used Bytes', v_total,
          'Data Limit Bytes', v_limit,
          'Data Overage Bytes', greatest(v_total - v_limit, 0),
          'Data Records Bytes', v_records_bytes,
          'Data Files Bytes', v_files_bytes,
          'Data Photos Bytes', v_photos,
          'Data Videos Bytes', v_videos,
          'Data Other Files Bytes', v_other,
          'Scope', 'Extra server data storage for ' || b.display_name || ': using '
            || public.business_data_fmt_bytes(v_total) || ' of '
            || public.business_data_fmt_bytes(v_limit) || ' included ('
            || v_split || ') Price for extra storage to be set per case. '
            || 'Free alternative already offered to the business: export a year of data and purge the bulk (accounting records retained).',
          'Subtotal', 0, 'Tax', 0, 'Total', 0,
          'Tier Mode', 'Single',
          'Revision', 1, 'Record Version', 1,
          'Created Time', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'Updated Time', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'lines', jsonb_build_array(jsonb_build_object(
            'description', 'Extra data storage beyond the included 5 GB (price to be set)',
            'quantity', 1, 'unit', 'flat', 'unitPrice', 0,
            'priceStatus', 'Check before sending', 'priceSource', 'Typed in',
            'quoteLineId', 'QUOTE-LINE-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))
              || '-' || upper(substr(md5(random()::text), 1, 4)) || '-' || upper(substr(md5(random()::text), 1, 4))
              || '-' || upper(substr(md5(random()::text), 1, 4)) || '-' || upper(substr(md5(random()::text), 1, 12))
          ))
        ), v_h38_owner, v_h38_owner);
      end if;
      update public.business_data_usage
        set limit_notified_at = now(), quote_draft_record_key = v_quote_key
        where business_id = b.id;
    end if;

    -- Back under the warning line: re-arm so a future crossing notifies again.
    if v_pct < 80 and v_found
       and (v_prev.warning_notified_at is not null or v_prev.limit_notified_at is not null) then
      update public.business_data_usage
        set warning_notified_at = null, limit_notified_at = null
        where business_id = b.id;
    end if;
  end loop;
end $$;

revoke all on function public.compute_business_data_usage() from public;
grant execute on function public.compute_business_data_usage() to service_role;
