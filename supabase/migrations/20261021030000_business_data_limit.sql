-- Business data limit (Rick, 2026-10-21): 10 GB of server data included per
-- business. One combined meter: the business's database records (business_records
-- payloads) + its files in Supabase storage. Warning at 80%; at 100% the business
-- is flagged, Rick is notified, and ONE draft quote for extra storage is created
-- in the H38 tenant for Rick's review. NEVER auto-send, NEVER auto-charge, NEVER
-- block uploads or lock the business out. No overage price exists yet; the draft
-- carries usage numbers with the price left blank for Rick.
--
-- File attribution (measured 2026-10-21):
--   * business-office-files / business-office buckets: object names are
--     <business_id>/<TypeSegment>/<RECORD-KEY>/<file> -> attributable by prefix.
--   * customer-portal bucket: prefix is a portal id; attributable exactly via
--     customer_quotes.pdf_storage_path = object name -> business_id.
--   * h38-penny-images bucket: content-hash prefixes, Scout platform imagery,
--     NOT attributable to any tenant business -> excluded (documented gap).
-- Location dimension (phase-2 preparation): every file in storage.objects is
-- ON OUR SERVER. files_external_bytes is carried in the snapshot (0 today) for
-- the future customer-Drive storage option; external bytes NEVER count toward
-- the meter. When that lands, an external-file registry feeds this column and
-- those bytes naturally fall out of total_bytes (records + server files only).
-- Media split: storage metadata mimetype image/* = photos, video/* = videos,
-- everything else = other files.

create table if not exists public.business_data_usage (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  limit_bytes bigint not null default 10737418240, -- 10 GiB included per business
  records_bytes bigint not null default 0,
  records_count bigint not null default 0,
  files_bytes bigint not null default 0,           -- server-stored files (counted)
  files_count bigint not null default 0,
  files_photos_bytes bigint not null default 0,
  files_videos_bytes bigint not null default 0,
  files_other_bytes bigint not null default 0,
  files_server_bytes bigint not null default 0,    -- = files_bytes today
  files_external_bytes bigint not null default 0,  -- phase 2 (customer Drive); never counted
  total_bytes bigint not null default 0,           -- records_bytes + files_bytes (server only)
  pct_of_limit numeric(6,2) not null default 0,
  threshold_state text not null default 'ok',      -- ok | warning | over
  warning_notified_at timestamptz,
  limit_notified_at timestamptz,
  quote_draft_record_key text,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_data_usage_history (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  limit_bytes bigint not null,
  records_bytes bigint not null,
  records_count bigint not null,
  files_bytes bigint not null,
  files_count bigint not null,
  files_photos_bytes bigint not null,
  files_videos_bytes bigint not null,
  files_other_bytes bigint not null,
  files_server_bytes bigint not null,
  files_external_bytes bigint not null,
  total_bytes bigint not null,
  pct_of_limit numeric(6,2) not null,
  threshold_state text not null,
  computed_at timestamptz not null default now()
);
create index if not exists business_data_usage_history_biz_time
  on public.business_data_usage_history (business_id, computed_at desc);

create table if not exists public.business_data_dumps (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  dump_year int not null,
  status text not null default 'building',  -- building | ready | failed | purged | archive_deleted
  archive_parts jsonb not null default '[]'::jsonb, -- [{path, bytes}]
  archive_bytes bigint not null default 0,
  records_exported int not null default 0,
  files_exported int not null default 0,
  files_bytes_exported bigint not null default 0,
  manifest jsonb not null default '{}'::jsonb,
  requested_by uuid,
  error text,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  purged_at timestamptz,
  purged_by uuid,
  purge_records_deleted int,
  purge_files_deleted int,
  purge_bytes_freed bigint,
  unique (business_id, dump_year)
);

create table if not exists public.business_data_purge_audit (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  dump_id uuid,
  dump_year int not null,
  actor_user_id uuid,
  action text not null,  -- purge | purge_noop
  records_deleted int not null default 0,
  files_deleted int not null default 0,
  bytes_freed bigint not null default 0,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.business_data_usage enable row level security;
alter table public.business_data_usage_history enable row level security;
alter table public.business_data_dumps enable row level security;
alter table public.business_data_purge_audit enable row level security;

-- Member reads (owner/administrator of the business), platform owner reads all.
do $$
declare t text;
begin
  foreach t in array array['business_data_usage','business_data_usage_history','business_data_dumps','business_data_purge_audit']
  loop
    execute format('drop policy if exists "members read %1$s" on public.%1$s', t);
    execute format($p$create policy "members read %1$s" on public.%1$s for select to authenticated
      using (exists (select 1 from public.business_memberships m
        where m.business_id = %1$s.business_id and m.auth_user_id = auth.uid()
          and m.status = 'active' and m.role in ('owner','administrator')))$p$, t);
    execute format('drop policy if exists "platform owner reads all %1$s" on public.%1$s', t);
    execute format($p$create policy "platform owner reads all %1$s" on public.%1$s for select to authenticated
      using (private.platform_owner_access(auth.uid()))$p$, t);
    execute format('drop policy if exists "service role all %1$s" on public.%1$s', t);
    execute format($p$create policy "service role all %1$s" on public.%1$s for all to service_role
      using (true) with check (true)$p$, t);
  end loop;
end $$;

create or replace function public.business_data_fmt_bytes(n bigint)
returns text language sql immutable as $$
  select case
    when n >= 1073741824 then round(n/1073741824.0, 2)::text || ' GB'
    when n >= 1048576 then round(n/1048576.0, 1)::text || ' MB'
    when n >= 1024 then round(n/1024.0, 1)::text || ' KB'
    else n::text || ' B' end;
$$;

-- Write one owner notification row in the canonical h38-owner-notify shape so
-- the existing topbar bell (owner-notifications.js) renders it. Deterministic
-- key includes the firing instant; the state flags on business_data_usage are
-- the once-per-crossing guard.
create or replace function public.business_data_notify(
  p_business uuid, p_event text, p_title text, p_body text, p_push text,
  p_source_collection text, p_link_page text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_key text := 'OWNERNOTIF-' || substr(md5(p_business::text || '|' || p_event || '|' || extract(epoch from clock_timestamp())::text), 1, 20);
  v_owner uuid;
begin
  select auth_user_id into v_owner from public.business_memberships
    where business_id = p_business and role = 'owner' and status = 'active'
    order by created_at asc limit 1;
  insert into public.business_records (business_id, collection, record_key, record_status, payload, created_by, updated_by)
  values (p_business, 'notifications', v_key, 'active', jsonb_build_object(
    'Title', p_title,
    'Body', p_body,
    'Status', 'Unread',
    'Audience', 'owners-admins',
    'Category', 'system',
    'Link Page', p_link_page,
    'Source ID', p_business::text,
    'Event Type', p_event,
    'Business ID', p_business::text,
    'Customer ID', '',
    'Customer Name', '',
    'Push Status', p_push,
    'Created Time', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Read By JSON', '[]',
    'Notification ID', v_key,
    'Source Collection', p_source_collection,
    'Link Record ID', '',
    'Record Version', 1
  ), v_owner, v_owner)
  on conflict (business_id, collection, record_key) do nothing;
end $$;

create or replace function public.compute_business_data_usage()
returns void language plpgsql security definer set search_path = public, storage as $$
declare
  H38 constant uuid := '10b85a89-5834-436d-95b0-c6ee2eb335ad';
  LIMIT_DEFAULT constant bigint := 10737418240; -- 10 GiB
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
begin
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
          'Heads up: data storage is at ' || round(v_pct)::text || '% of your included 10 GB',
          b.display_name || ' has used ' || public.business_data_fmt_bytes(v_total)
            || ' of the 10 GB of server data included with your Office. ' || v_split
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
          'Data limit reached: ' || round(v_pct)::text || '% of your included 10 GB',
          b.display_name || ' has passed the 10 GB of server data included with your Office ('
            || public.business_data_fmt_bytes(v_total) || ' used). ' || v_split
            || ' Nothing changes in your Office — no cutoff, no automatic charge, your data keeps working. '
            || 'Two options: (1) free — export a year of your data and clear its old files (Settings → Data & storage); videos like site walkthroughs are usually the biggest consumer. '
            || '(2) more room — we have prepared a draft quote for extra storage for review; nothing is charged unless you approve it.',
          v_push, 'business_data_usage', 'settings');
      end if;
      if b.id <> H38 and coalesce(v_h38_enabled, true) then
        perform public.business_data_notify(H38, 'data_usage_limit_platform',
          'Storage limit reached — ' || b.display_name || ' (' || round(v_pct)::text || '%)',
          b.display_name || ' is over its included 10 GB of server data: '
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
            'description', 'Extra data storage beyond the included 10 GB (price to be set)',
            'quantity', 1, 'unit', 'flat', 'unitPrice', 0,
            'priceStatus', 'Check before sending', 'priceSource', 'Typed in',
            'quoteLineId', 'QUOTE-LINE-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))
              || '-' || upper(substr(md5(random()::text), 1, 4)) || '-' || upper(substr(md5(random()::text), 1, 4))
              || '-' || upper(substr(md5(random()::text), 1, 4)) || '-' || upper(substr(md5(random()::text), 1, 12))
          ))
        ), null, null);
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

-- Daily snapshot + threshold pass (pure SQL job; no HTTP surface needed).
-- The schedule is installed inside a pg_cron-extension guard (same shape
-- as 20261013121000): production has pg_cron, the disposable clean-replay
-- stack does not, and an unguarded cron.* call aborts the whole replay.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'h38-data-usage-daily') then
      perform cron.unschedule('h38-data-usage-daily');
    end if;
    perform cron.schedule('h38-data-usage-daily', '15 6 * * *',
      'select public.compute_business_data_usage();');
  end if;
end $$;
