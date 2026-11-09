-- SMS 10DLC registration status polling (2026-11-09, "our own" build).
-- Polls the h38-sms-registration edge function every 30 minutes so
-- filed / in_review registrations resolve to approved / rejected without
-- anyone watching a carrier console. Mirrors the h38-owner-notify job:
-- pg_cron + pg_net http_post, caller key read from
-- h38_internal_job_secrets at run time — no secret value ever lives in
-- the job definition or in this repo.
--
-- The 'h38-sms-registration' secret row itself is created out-of-band
-- (Supabase Management API) with a generated value, exactly like the
-- 'h38-owner-notify' and 'h38-review-scheduler' rows — never committed.
-- This migration only (re)creates the schedule, idempotently, inside the
-- pg_cron-extension guard (production has pg_cron; the disposable
-- clean-replay stack does not).

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('h38-sms-registration-poll-30m')
      from (select 1) s where exists (select 1 from cron.job where jobname = 'h38-sms-registration-poll-30m');
    perform cron.schedule(
      'h38-sms-registration-poll-30m',
      '*/30 * * * *',
      $cmd$
      select net.http_post(
        url := 'https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-sms-registration',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-h38-nightly-key', (select secret_value from public.h38_internal_job_secrets where name = 'h38-sms-registration' limit 1)
        ),
        body := '{"action":"refresh_all","businessId":"fleet"}'::jsonb,
        timeout_milliseconds := 60000
      );
      $cmd$
    );
  end if;
end $$;
