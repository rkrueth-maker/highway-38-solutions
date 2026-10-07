-- Site pageview counts: first-party, cookie-free traffic counting for the
-- public Highway 38 website. The public shell (assets/js/h38-site-v2.js)
-- sends one beacon per page load to the h38-site-analytics edge function,
-- which validates and stores the count here.
--
-- Privacy by design: no raw IP addresses are stored. The edge function
-- stores only a daily-rotating salted hash of IP + user agent, so a
-- visitor can be counted within one day but never followed across days.
-- No cookies are set and no per-visitor profile is built. Counts answer
-- "how much traffic did each page get", nothing more.
--
-- Service-role access only: row level security is enabled with no public
-- policies, so the rows are never readable from the public website or with
-- the anon key. The edge function writes with the service role; counts are
-- read back with the service-role CLI (sb.py).
--
-- Apply with the other Supabase migrations, then run:
--   notify pgrst, 'reload schema';

create table if not exists public.site_pageviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  page_path text not null,
  referrer_host text,
  visitor_day_hash text,
  device_class text not null default 'desktop'
    check (device_class in ('phone', 'tablet', 'desktop'))
);

create index if not exists site_pageviews_created_idx
  on public.site_pageviews (created_at desc);

create index if not exists site_pageviews_page_created_idx
  on public.site_pageviews (page_path, created_at desc);

create index if not exists site_pageviews_visitor_created_idx
  on public.site_pageviews (visitor_day_hash, created_at desc);

alter table public.site_pageviews enable row level security;
