do $$
begin
  if exists (select 1 from cron.job where jobname = 'h38-scout-source-ingest-6h') then
    perform cron.unschedule('h38-scout-source-ingest-6h');
  end if;

  perform cron.schedule(
    'h38-scout-source-ingest-6h',
    '11 */6 * * *',
    $cron$
      select net.http_post(
        url := 'https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-scout-source-ingest',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-h38-nightly-key', (
            select secret_value
            from public.h38_internal_job_secrets
            where name = 'penny-nightly'
            limit 1
          )
        ),
        body := '{"action":"scheduled"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cron$
  );
end
$$;
