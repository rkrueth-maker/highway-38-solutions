-- H38 Deals: make reseller_hunt_cache.active mean current evidence.
-- Historical rows remain stored, but rows not seen in seven days no longer
-- flow back into Deal Engine during a user/manual refresh.

update public.reseller_hunt_cache
set active = false
where active = true
  and last_seen_at is not null
  and last_seen_at < now() - interval '7 days';

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'h38-deal-source-freshness-hourly'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'h38-deal-source-freshness-hourly',
    '16 * * * *',
    $job$
      update public.reseller_hunt_cache
      set active = false
      where active = true
        and last_seen_at is not null
        and last_seen_at < now() - interval '7 days';
    $job$
  );
end
$$;
