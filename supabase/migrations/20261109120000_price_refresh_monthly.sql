-- Price book 30-day freshness refresh (2026-11-09, build 20261109-price-refresh-1).
-- Rick's direction: "We can update prices with a search every 30 days but we
-- should look up what we can."
--
-- The h38-quote-ai validator treats a local_research price row older than
-- 30 days (by updated_at) as stale and demotes matching quote lines to
-- manual-required allowances. This job runs the h38-price-refresh edge
-- function monthly; the function reads the price each stale row's OWN stored
-- source page publishes and writes a REVIEW row per finding
-- (business_records collection 'priceRefreshReviews'). It never applies a
-- price: the owner approves / confirms / dismisses each review in the
-- Office, and only that decision writes a price or a freshness stamp.
--
-- Mirrors the h38-sms-registration poll job: pg_cron + pg_net http_post,
-- caller key read from h38_internal_job_secrets at run time — no secret
-- value ever lives in the job definition or in this repo.
--
-- The 'h38-price-refresh' secret row itself is created out-of-band
-- (Supabase Management API) with a generated value, exactly like the
-- 'h38-sms-registration' row — never committed. This migration only
-- (re)creates the schedule, idempotently, inside the pg_cron-extension
-- guard (production has pg_cron; the disposable clean-replay stack does
-- not). Monthly on the 1st at 12:20 UTC (~06:20 CT) — off the hour, away
-- from the other internal jobs.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('h38-price-refresh-monthly')
      from (select 1) s where exists (select 1 from cron.job where jobname = 'h38-price-refresh-monthly');
    perform cron.schedule(
      'h38-price-refresh-monthly',
      '20 12 1 * *',
      $cmd$
      select net.http_post(
        url := 'https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-price-refresh',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-h38-nightly-key', (select secret_value from public.h38_internal_job_secrets where name = 'h38-price-refresh' limit 1)
        ),
        body := '{"action":"refresh_all","businessId":"fleet"}'::jsonb,
        timeout_milliseconds := 60000
      );
      $cmd$
    );
  end if;
end $$;
