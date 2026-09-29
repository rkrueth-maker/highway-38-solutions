do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'h38-amazon-public-discovery-6h'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'h38-amazon-public-discovery-6h',
  '9 */6 * * *',
  $job$
    select net.http_post(
      url := 'https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-amazon-public-discovery',
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
      timeout_milliseconds := 90000
    );
  $job$
);
