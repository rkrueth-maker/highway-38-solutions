-- Owner notifications producer schedule (2026-10-13, Rick's request:
-- "office should notify of any customer activity or when new items need
-- review"). Mirrors the h38-review-scheduler job (id 20): pg_cron + pg_net
-- http_post, with the caller key read from h38_internal_job_secrets at run
-- time so no secret value ever lives in the job definition or in this repo.
--
-- The 'h38-owner-notify' secret row itself is created out-of-band
-- (Supabase Management API) with a generated value, exactly like the
-- 'h38-review-scheduler' and 'scout-push' rows — never committed.
-- This migration only (re)creates the schedule, idempotently.
--
-- The schedule is installed inside a pg_cron-extension guard (the same
-- shape as the Scout push migration): production has pg_cron, the
-- disposable clean-replay stack does not, and an unguarded cron.* call
-- aborts the whole replay with 'schema "cron" does not exist'.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('h38-owner-notify-5m')
      from (select 1) s where exists (select 1 from cron.job where jobname = 'h38-owner-notify-5m');
    perform cron.schedule(
      'h38-owner-notify-5m',
      '*/5 * * * *',
      $cmd$
      select net.http_post(
        url := 'https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-owner-notify',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-h38-nightly-key', (select secret_value from public.h38_internal_job_secrets where name = 'h38-owner-notify' limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
      $cmd$
    );
  end if;
end $$;
