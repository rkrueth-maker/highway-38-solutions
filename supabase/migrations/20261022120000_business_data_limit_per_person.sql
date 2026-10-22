-- Per-person memory storage meters (Rick, 2026-10-22 — final ruling):
-- the 15 GB included allowance is PER PERSON, not per business. Each person's
-- own files count against their own 15 GB. This supersedes the flat
-- per-business meter shipped 2026-10-21/22 (migrations 20261021030000,
-- 20261021031000, 20261022070000). There is NO pooled/pot model.
--
-- Counted set (Rick, final): ALL FILES — every storage object in the
-- business's buckets (photos, videos, documents/PDFs, other files, including
-- customer-portal PDFs) — matching what Supabase bills H38 for file storage.
-- Database RECORDS stay OUT of the meter (negligible text, inside the plan's
-- included database allowance); the records split is still tracked per person
-- for visibility only. Threshold math = total file bytes per person.
--
-- Attribution rule (per business): a file counts toward the person who
-- uploaded it (storage.objects.owner) when that person is an active member of
-- the business; otherwise toward the author (business_records.created_by) of
-- the parent record named by the object's third path segment, when that
-- author is an active member; otherwise — data with NO attributable person
-- (system/AI-generated files, legacy objects without an uploader, portal
-- PDFs, files of people no longer on the account) — toward the business
-- OWNER's meter. A person's records (visibility split) attribute by
-- created_by with the same owner fallback.
--
-- Thresholds per (business, person) meter: 80% -> warning notification to the
-- person AND to the business owner; >=100% -> the meter is flagged, the owner
-- is notified, Rick (platform) is notified, and exactly ONE Draft quote is
-- prepared in the H38 tenant naming the person and the locked overage rate
-- ($5 per 50 GB/month). NEVER auto-send, NEVER auto-charge, NEVER a cutoff or
-- lockout for anyone. Year dump/purge + marked-photos behavior unchanged.

create table if not exists public.business_data_usage_people (
  business_id uuid not null references public.businesses(id) on delete cascade,
  person_id uuid not null,
  person_email text,
  limit_bytes bigint not null default 16106127360, -- 15 GiB included per person
  files_bytes bigint not null default 0,           -- ALL files (counted)
  files_count bigint not null default 0,
  files_photos_bytes bigint not null default 0,
  files_videos_bytes bigint not null default 0,
  files_other_bytes bigint not null default 0,
  records_bytes bigint not null default 0,         -- visibility only, NOT counted
  records_count bigint not null default 0,
  total_bytes bigint not null default 0,           -- = files_bytes (the meter)
  pct_of_limit numeric(6,2) not null default 0,
  threshold_state text not null default 'ok',      -- ok | warning | over
  warning_notified_at timestamptz,
  limit_notified_at timestamptz,
  quote_draft_record_key text,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, person_id)
);

create table if not exists public.business_data_usage_people_history (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  person_id uuid not null,
  person_email text,
  limit_bytes bigint not null,
  files_bytes bigint not null,
  files_count bigint not null,
  files_photos_bytes bigint not null,
  files_videos_bytes bigint not null,
  files_other_bytes bigint not null,
  records_bytes bigint not null,
  records_count bigint not null,
  total_bytes bigint not null,
  pct_of_limit numeric(6,2) not null,
  threshold_state text not null,
  computed_at timestamptz not null default now()
);
create index if not exists business_data_usage_people_history_biz_person_time
  on public.business_data_usage_people_history (business_id, person_id, computed_at desc);

alter table public.business_data_usage_people enable row level security;
alter table public.business_data_usage_people_history enable row level security;

-- Reads: a person reads their OWN meter row in a business they actively
-- belong to (any role); owners/administrators read every meter in their
-- business; the platform owner reads all; service role full access.
do $$
declare t text;
begin
  foreach t in array array['business_data_usage_people','business_data_usage_people_history']
  loop
    execute format('drop policy if exists "own meter read %1$s" on public.%1$s', t);
    execute format($p$create policy "own meter read %1$s" on public.%1$s for select to authenticated
      using (%1$s.person_id = auth.uid()
        and exists (select 1 from public.business_memberships m
          where m.business_id = %1$s.business_id and m.auth_user_id = auth.uid()
            and m.status = 'active'))$p$, t);
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

-- Write one notification row addressed to a single person. Same canonical
-- h38-owner-notify record shape, but Audience 'user' + 'User ID' so the
-- topbar bell shows it only to that person (owner-notifications.js isMine:
-- audience 'owners-admins' reaches the business's owners/admins; a 'User ID'
-- match reaches exactly that user). Push Status is always 'off' here — the
-- person-facing copy lives in the bell + the Settings card; the owners'
-- notification carries the business's push setting as before.
create or replace function public.business_data_notify_person(
  p_business uuid, p_person uuid, p_event text, p_title text, p_body text,
  p_source_collection text, p_link_page text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text := 'OWNERNOTIF-' || substr(md5(p_business::text || '|' || p_event || '|' || p_person::text || '|' || extract(epoch from clock_timestamp())::text), 1, 20);
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
    'Audience', 'user',
    'User ID', p_person::text,
    'Category', 'system',
    'Link Page', p_link_page,
    'Source ID', p_business::text,
    'Event Type', p_event,
    'Business ID', p_business::text,
    'Customer ID', '',
    'Customer Name', '',
    'Push Status', 'off',
    'Created Time', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Read By JSON', '[]',
    'Notification ID', v_key,
    'Source Collection', p_source_collection,
    'Link Record ID', '',
    'Record Version', 1
  ), coalesce(v_owner, p_person), coalesce(v_owner, p_person))
  on conflict (business_id, collection, record_key) do nothing;
end $function$;

-- Metering + thresholds. Business totals in business_data_usage are unchanged
-- (records + files, kept for history, the platform strip, and dump/purge
-- coherence); its pct_of_limit / threshold_state now mirror the business's
-- MOST-FULL PERSON meter (never a pooled total against 15 GB — there is no
-- pool). All threshold actions (warning, flag, Rick notice, draft quote) fire
-- per person from business_data_usage_people.
create or replace function public.compute_business_data_usage()
returns void
language plpgsql
security definer
set search_path to 'public', 'storage'
as $function$
declare
  H38 constant uuid := '10b85a89-5834-436d-95b0-c6ee2eb335ad';
  LIMIT_DEFAULT constant bigint := 16106127360; -- 15 GiB per PERSON (Rick, 2026-10-22)
  RATE constant text := '$5 per 50 GB/month';
  b record;
  v_prev public.business_data_usage%rowtype;
  v_found boolean;
  v_records_bytes bigint; v_records_count bigint;
  v_files_bytes bigint; v_files_count bigint;
  v_photos bigint; v_videos bigint; v_other bigint;
  v_portal_bytes bigint; v_portal_count bigint;
  v_total bigint;
  v_enabled boolean; v_cfg jsonb; v_push text; v_notify boolean;
  v_h38_enabled boolean; v_h38_cfg jsonb; v_h38_push text;
  v_h38_owner uuid;
  v_biz_owner uuid;
  p record;
  pp public.business_data_usage_people%rowtype;
  p_found boolean;
  p_limit bigint; p_total bigint; p_pct numeric; p_state text;
  p_split text; p_name text;
  v_quote_key text; v_existing_key text;
  v_max_pct numeric; v_worst_state text;
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
    -- The business's owner: fallback attribution target for data with no
    -- attributable person, and the author of notification rows.
    select auth_user_id into v_biz_owner from public.business_memberships
      where business_id = b.id and role = 'owner' and status = 'active' and auth_user_id is not null
      order by created_at asc limit 1;
    if v_biz_owner is null then
      select auth_user_id into v_biz_owner from public.business_memberships
        where business_id = b.id and status = 'active' and auth_user_id is not null
        order by created_at asc limit 1;
    end if;

    -- Records meter, business total (payload bytes; visibility + history).
    select coalesce(sum(pg_column_size(payload)), 0), count(*)
      into v_records_bytes, v_records_count
      from public.business_records where business_id = b.id;

    -- Server files meter, business total: business-prefixed office buckets.
    select coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0), count(*),
           coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)) filter (where o.metadata->>'mimetype' like 'image/%'), 0),
           coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)) filter (where o.metadata->>'mimetype' like 'video/%'), 0)
      into v_files_bytes, v_files_count, v_photos, v_videos
      from storage.objects o
      where o.bucket_id in ('business-office-files', 'business-office')
        and split_part(o.name, '/', 1) = b.id::text;

    -- Customer-portal PDFs attributed via the quote path join (class: other).
    -- customer_quotes carries no author, so per-person they fall to the owner.
    select coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0), count(*)
      into v_portal_bytes, v_portal_count
      from storage.objects o
      join public.customer_quotes q on q.pdf_storage_path = o.name
      where o.bucket_id = 'customer-portal' and q.business_id = b.id;
    v_files_bytes := v_files_bytes + v_portal_bytes;
    v_files_count := v_files_count + v_portal_count;
    v_other := v_files_bytes - v_photos - v_videos;
    v_total := v_records_bytes + v_files_bytes; -- business total (unchanged meaning)

    -- This business's owner-notification settings (canonical owner_notifications shape).
    select enabled, config into v_enabled, v_cfg
      from public.business_module_settings
      where business_id = b.id and module_key = 'owner_notifications';
    v_notify := coalesce(v_enabled, true);
    v_push := case when v_enabled = false then 'off'
                   when coalesce((v_cfg->>'push')::boolean, false) then 'pending'
                   else 'off' end;

    -- ===== Per-person meters (the actual allowance meters) =====
    -- Drop meters of people no longer active members: their files re-attribute
    -- in this same run via the fallback chain (parent author, then owner).
    delete from public.business_data_usage_people ppd
      where ppd.business_id = b.id
        and not exists (select 1 from public.business_memberships m
          where m.business_id = b.id and m.auth_user_id = ppd.person_id and m.status = 'active');

    v_max_pct := 0; v_worst_state := 'ok';
    for p in
      with members as (
        select auth_user_id as person_id, min(invited_email) as email
        from public.business_memberships
        where business_id = b.id and status = 'active' and auth_user_id is not null
        group by auth_user_id
      ),
      recs as (
        select case when exists (select 1 from members mm where mm.person_id = r.created_by)
                    then r.created_by else v_biz_owner end as person_id,
               sum(pg_column_size(r.payload))::bigint as rb, count(*)::bigint as rc
        from public.business_records r
        where r.business_id = b.id
        group by 1
      ),
      files as (
        select case
                 when exists (select 1 from members mm where mm.person_id = o.owner) then o.owner
                 when exists (select 1 from members mm where mm.person_id = pr.created_by) then pr.created_by
                 else v_biz_owner end as person_id,
               sum(coalesce((o.metadata->>'size')::bigint, 0))::bigint as fb,
               count(*)::bigint as fc,
               coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)) filter (where o.metadata->>'mimetype' like 'image/%'), 0)::bigint as ph,
               coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)) filter (where o.metadata->>'mimetype' like 'video/%'), 0)::bigint as vd
        from storage.objects o
        left join public.business_records pr
          on pr.business_id = b.id and pr.record_key = split_part(o.name, '/', 3)
        where o.bucket_id in ('business-office-files', 'business-office')
          and split_part(o.name, '/', 1) = b.id::text
        group by 1
      )
      select m.person_id,
             coalesce(m.email, (select u.email from auth.users u where u.id = m.person_id), m.person_id::text) as email,
             coalesce(r.rb, 0) as records_bytes, coalesce(r.rc, 0) as records_count,
             coalesce(f.fb, 0) + (case when m.person_id = v_biz_owner then v_portal_bytes else 0 end) as files_bytes,
             coalesce(f.fc, 0) + (case when m.person_id = v_biz_owner then v_portal_count else 0 end) as files_count,
             coalesce(f.ph, 0) as photos_bytes,
             coalesce(f.vd, 0) as videos_bytes
      from members m
      left join recs r on r.person_id = m.person_id
      left join files f on f.person_id = m.person_id
    loop
      select * into pp from public.business_data_usage_people
        where business_id = b.id and person_id = p.person_id;
      p_found := found;
      p_limit := coalesce(pp.limit_bytes, LIMIT_DEFAULT);
      p_total := p.files_bytes; -- the meter counts ALL file bytes; records are visibility only
      p_pct := case when p_limit > 0 then round(100.0 * p_total / p_limit, 2) else 0 end;
      p_state := case when p_pct >= 100 then 'over' when p_pct >= 80 then 'warning' else 'ok' end;
      p_name := p.email;
      p_split := 'Photos ' || public.business_data_fmt_bytes(p.photos_bytes)
        || ' · Videos ' || public.business_data_fmt_bytes(p.videos_bytes)
        || ' · Other files ' || public.business_data_fmt_bytes(p.files_bytes - p.photos_bytes - p.videos_bytes) || '.';

      insert into public.business_data_usage_people (
        business_id, person_id, person_email, limit_bytes,
        files_bytes, files_count, files_photos_bytes, files_videos_bytes, files_other_bytes,
        records_bytes, records_count, total_bytes, pct_of_limit, threshold_state,
        computed_at, updated_at)
      values (b.id, p.person_id, p.email, p_limit,
        p.files_bytes, p.files_count, p.photos_bytes, p.videos_bytes,
        p.files_bytes - p.photos_bytes - p.videos_bytes,
        p.records_bytes, p.records_count, p_total, p_pct, p_state, now(), now())
      on conflict (business_id, person_id) do update set
        person_email = excluded.person_email,
        files_bytes = excluded.files_bytes, files_count = excluded.files_count,
        files_photos_bytes = excluded.files_photos_bytes,
        files_videos_bytes = excluded.files_videos_bytes,
        files_other_bytes = excluded.files_other_bytes,
        records_bytes = excluded.records_bytes, records_count = excluded.records_count,
        total_bytes = excluded.total_bytes, pct_of_limit = excluded.pct_of_limit,
        threshold_state = excluded.threshold_state,
        computed_at = now(), updated_at = now();

      insert into public.business_data_usage_people_history (
        business_id, person_id, person_email, limit_bytes,
        files_bytes, files_count, files_photos_bytes, files_videos_bytes, files_other_bytes,
        records_bytes, records_count, total_bytes, pct_of_limit, threshold_state)
      values (b.id, p.person_id, p.email, p_limit,
        p.files_bytes, p.files_count, p.photos_bytes, p.videos_bytes,
        p.files_bytes - p.photos_bytes - p.videos_bytes,
        p.records_bytes, p.records_count, p_total, p_pct, p_state);

      if p_pct > v_max_pct then v_max_pct := p_pct; end if;
      if p_state = 'over' then v_worst_state := 'over';
      elsif p_state = 'warning' and v_worst_state = 'ok' then v_worst_state := 'warning'; end if;

      -- 80% warning: once per crossing; the person AND the business owner.
      if p_pct >= 80 and (not p_found or pp.warning_notified_at is null) then
        if v_notify then
          perform public.business_data_notify_person(b.id, p.person_id, 'data_usage_warning',
            'Heads up: your memory storage is at ' || round(p_pct)::text || '% of your included 15 GB',
            'You have used ' || public.business_data_fmt_bytes(p_total)
              || ' of the 15 GB of memory storage included for each person on the account (15 GB included and $5 for 50 GB more). '
              || p_split
              || ' Videos — like site walkthroughs — are usually the biggest part. '
              || 'Free way to free up space: export a year of your data and clear its old files (Settings → Data & storage). '
              || 'If you would rather have more room, extra storage is ' || RATE || ', quoted to you first — never auto-charged, and nothing is ever cut off.',
            'business_data_usage', 'settings');
          if p.person_id <> v_biz_owner then
            perform public.business_data_notify(b.id, 'data_usage_warning',
              'Memory storage warning — ' || p_name || ' is at ' || round(p_pct)::text || '% of their included 15 GB',
              p_name || ' at ' || b.display_name || ' has used ' || public.business_data_fmt_bytes(p_total)
                || ' of their included 15 GB of memory storage (15 GB included and $5 for 50 GB more). '
                || p_split
                || ' They have been notified too. Nothing is charged automatically and nothing is cut off.',
              v_push, 'business_data_usage', 'settings');
          end if;
        end if;
        update public.business_data_usage_people set warning_notified_at = now()
          where business_id = b.id and person_id = p.person_id;
      end if;

      -- 100%: meter flagged + owner notice + Rick notice + ONE open draft quote.
      if p_pct >= 100 and (not p_found or pp.limit_notified_at is null) then
        if v_notify then
          perform public.business_data_notify_person(b.id, p.person_id, 'data_usage_limit',
            'You have passed your included 15 GB of memory storage',
            'You have used ' || public.business_data_fmt_bytes(p_total)
              || ' of the 15 GB of memory storage included for each person on the account (15 GB included and $5 for 50 GB more). '
              || p_split
              || ' Nothing changes in your Office — no cutoff, no automatic charge, your files keep working. '
              || 'Two options: (1) free — export a year of your data and clear its old files (Settings → Data & storage); videos like site walkthroughs are usually the biggest part. '
              || '(2) more room — extra storage is ' || RATE || ', quoted — nothing is charged unless it is approved.',
            'business_data_usage', 'settings');
          if p.person_id <> v_biz_owner then
            perform public.business_data_notify(b.id, 'data_usage_limit',
              'Memory storage limit reached — ' || p_name || ' (' || round(p_pct)::text || '%)',
              p_name || ' at ' || b.display_name || ' has passed their included 15 GB of memory storage ('
                || public.business_data_fmt_bytes(p_total) || ' used). '
                || p_split
                || ' Nothing changes in their Office — no cutoff, no automatic charge. '
                || 'A draft quote for extra storage is being prepared for review: ' || RATE || ', quoted — never auto-charged. '
                || 'They also see the free year-export option.',
              v_push, 'business_data_usage', 'settings');
          end if;
        end if;
        if b.id <> H38 and coalesce(v_h38_enabled, true) then
          perform public.business_data_notify(H38, 'data_usage_limit_platform',
            'Memory storage limit reached — ' || b.display_name || ' / ' || p_name || ' (' || round(p_pct)::text || '%)',
            p_name || ' at ' || b.display_name || ' is over their included 15 GB of memory storage: '
              || public.business_data_fmt_bytes(p_total) || ' used of '
              || public.business_data_fmt_bytes(p_limit) || '. ' || p_split
              || ' A draft quote for extra storage is in Quotes (Draft) for your review — extra storage is ' || RATE || ', quoted — never auto-charged. '
              || 'The business also sees the free year-export option. Nothing was charged or sent.',
            v_h38_push, 'business_data_usage', 'quotes');
        end if;

        select record_key into v_existing_key
          from public.business_records
          where business_id = H38 and collection = 'quotes'
            and payload->>'Storage Overage Business ID' = b.id::text
            and payload->>'Storage Overage Person ID' = p.person_id::text
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
            'Project Title', 'Extra memory storage — ' || b.display_name || ' (' || p_name || ')',
            'Presented To', b.display_name,
            'Customer ID', b.id::text,
            'Business ID', H38::text,
            'Storage Overage Business ID', b.id::text,
            'Storage Overage Business Name', b.display_name,
            'Storage Overage Person ID', p.person_id::text,
            'Storage Overage Person Email', p_name,
            'Data Used Bytes', p_total,
            'Data Limit Bytes', p_limit,
            'Data Overage Bytes', greatest(p_total - p_limit, 0),
            'Data Records Bytes', p.records_bytes,
            'Data Files Bytes', p.files_bytes,
            'Data Photos Bytes', p.photos_bytes,
            'Data Videos Bytes', p.videos_bytes,
            'Data Other Files Bytes', p.files_bytes - p.photos_bytes - p.videos_bytes,
            'Scope', 'Extra memory storage for ' || p_name || ' at ' || b.display_name || ': they are using '
              || public.business_data_fmt_bytes(p_total) || ' of their included 15 GB of memory storage ('
              || p_split || ') 15 GB included and $5 for 50 GB more — extra storage is ' || RATE
              || ', quoted to the business — never auto-charged, never a cutoff or lockout. '
              || 'Free alternative already offered: export a year of data and purge the bulk (accounting records retained; photos marked as examples of work stay on the server).',
            'Subtotal', 0, 'Tax', 0, 'Total', 0,
            'Tier Mode', 'Single',
            'Revision', 1, 'Record Version', 1,
            'Created Time', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'Updated Time', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'lines', jsonb_build_array(jsonb_build_object(
              'description', 'Extra memory storage beyond the included 15 GB — $5 per 50 GB/month (quoted; never auto-charged)',
              'quantity', 1, 'unit', 'flat', 'unitPrice', 0,
              'priceStatus', 'Check before sending', 'priceSource', 'Typed in',
              'quoteLineId', 'QUOTE-LINE-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))
                || '-' || upper(substr(md5(random()::text), 1, 4)) || '-' || upper(substr(md5(random()::text), 1, 4))
                || '-' || upper(substr(md5(random()::text), 1, 4)) || '-' || upper(substr(md5(random()::text), 1, 12))
            ))
          ), v_h38_owner, v_h38_owner);
        end if;
        update public.business_data_usage_people
          set limit_notified_at = now(), quote_draft_record_key = v_quote_key
          where business_id = b.id and person_id = p.person_id;
      end if;

      -- Back under the warning line: re-arm so a future crossing notifies again.
      if p_pct < 80 and p_found
         and (pp.warning_notified_at is not null or pp.limit_notified_at is not null) then
        update public.business_data_usage_people
          set warning_notified_at = null, limit_notified_at = null
          where business_id = b.id and person_id = p.person_id;
      end if;
    end loop;

    -- Business totals row: same numbers as before; pct/state mirror the
    -- most-full person meter (there is no business-level pool or firing).
    select * into v_prev from public.business_data_usage where business_id = b.id;
    v_found := found;
    insert into public.business_data_usage (
      business_id, limit_bytes, records_bytes, records_count, files_bytes, files_count,
      files_photos_bytes, files_videos_bytes, files_other_bytes,
      files_server_bytes, files_external_bytes, total_bytes, pct_of_limit, threshold_state,
      warning_notified_at, limit_notified_at, computed_at, updated_at)
    values (b.id, LIMIT_DEFAULT, v_records_bytes, v_records_count, v_files_bytes, v_files_count,
      v_photos, v_videos, v_other, v_files_bytes, 0, v_total, v_max_pct, v_worst_state,
      null, null, now(), now())
    on conflict (business_id) do update set
      limit_bytes = excluded.limit_bytes,
      records_bytes = excluded.records_bytes, records_count = excluded.records_count,
      files_bytes = excluded.files_bytes, files_count = excluded.files_count,
      files_photos_bytes = excluded.files_photos_bytes,
      files_videos_bytes = excluded.files_videos_bytes,
      files_other_bytes = excluded.files_other_bytes,
      files_server_bytes = excluded.files_server_bytes,
      files_external_bytes = excluded.files_external_bytes,
      total_bytes = excluded.total_bytes, pct_of_limit = excluded.pct_of_limit,
      threshold_state = excluded.threshold_state,
      warning_notified_at = null, limit_notified_at = null,
      computed_at = now(), updated_at = now();

    insert into public.business_data_usage_history (
      business_id, limit_bytes, records_bytes, records_count, files_bytes, files_count,
      files_photos_bytes, files_videos_bytes, files_other_bytes,
      files_server_bytes, files_external_bytes, total_bytes, pct_of_limit, threshold_state)
    values (b.id, LIMIT_DEFAULT, v_records_bytes, v_records_count, v_files_bytes, v_files_count,
      v_photos, v_videos, v_other, v_files_bytes, 0, v_total, v_max_pct, v_worst_state);
  end loop;
end $function$;
