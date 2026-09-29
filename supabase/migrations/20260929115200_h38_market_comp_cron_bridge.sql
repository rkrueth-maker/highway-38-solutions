-- Reuse the established Scout nightly-key transport while keeping the user-facing
-- market refresh endpoint JWT-protected. The bridge validates the existing private
-- nightly key server-side and then invokes the protected worker with service auth.

do $$
declare
  source_command text;
  cloned_command text;
  existing_job bigint;
begin
  select command into source_command
  from cron.job
  where jobname = 'h38-scout-source-ingest-6h'
  limit 1;

  if source_command is null then
    raise exception 'source cron job h38-scout-source-ingest-6h not found';
  end if;

  cloned_command := replace(
    source_command,
    'h38-scout-source-ingest',
    'h38-deal-engine-market-refresh-cron'
  );

  select jobid into existing_job
  from cron.job
  where jobname = 'h38-market-comps-6h'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule('h38-market-comps-6h', '23 */6 * * *', cloned_command);
end $$;
