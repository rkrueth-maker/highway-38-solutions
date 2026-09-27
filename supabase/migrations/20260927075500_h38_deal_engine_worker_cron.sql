-- H38 Deals: scheduled current-deal cleanup and watch evaluation.
-- The worker uses custom x-h38-nightly-key authentication; the key is copied
-- into Vault without exposing its value in migration history or cron metadata.

do $$
declare
  v_secret text;
begin
  if not exists (select 1 from vault.secrets where name = 'h38_deal_engine_worker_key') then
    select secret_value into v_secret
    from public.h38_internal_job_secrets
    where name = 'penny-nightly';

    if coalesce(v_secret, '') = '' then
      raise exception 'Missing internal penny-nightly secret required for H38 Deal Engine worker';
    end if;

    perform vault.create_secret(
      v_secret,
      'h38_deal_engine_worker_key',
      'Internal H38 Deal Engine hourly watch/housekeeping worker key'
    );
  end if;
end
$$;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'h38-deal-engine-worker-hourly'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'h38-deal-engine-worker-hourly',
    '17 * * * *',
    $job$
      select net.http_post(
        url := 'https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-deal-engine-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-h38-nightly-key', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'h38_deal_engine_worker_key'
            limit 1
          )
        ),
        body := '{"action":"hourly"}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$
  );
end
$$;
