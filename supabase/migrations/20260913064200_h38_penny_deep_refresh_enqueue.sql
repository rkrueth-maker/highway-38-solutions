create or replace function public.h38_enqueue_penny_deep_refresh(p_reason text default 'internal')
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  select secret_value into v_secret
  from public.h38_internal_job_secrets
  where name = 'penny-nightly';

  if coalesce(v_secret,'') = '' then
    raise warning 'penny-nightly secret unavailable; deep refresh not enqueued';
    return null;
  end if;

  select net.http_post(
    url := 'https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-deep-cache-worker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-h38-nightly-key',v_secret
    ),
    body := jsonb_build_object(
      'action','refresh',
      'reason',coalesce(nullif(p_reason,''),'internal')
    ),
    timeout_milliseconds := 180000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.h38_enqueue_penny_deep_refresh(text) from public;
revoke all on function public.h38_enqueue_penny_deep_refresh(text) from anon;
revoke all on function public.h38_enqueue_penny_deep_refresh(text) from authenticated;
grant execute on function public.h38_enqueue_penny_deep_refresh(text) to service_role;

create or replace function public.h38_penny_after_refresh_deep_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cache_key = 'penny' then
    if old.last_fast_scan_at is distinct from new.last_fast_scan_at then
      perform public.h38_enqueue_penny_deep_refresh('check-deals');
    elsif old.last_nightly_date is distinct from new.last_nightly_date then
      perform public.h38_enqueue_penny_deep_refresh('nightly');
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.h38_penny_after_refresh_deep_enqueue() from public;
revoke all on function public.h38_penny_after_refresh_deep_enqueue() from anon;
revoke all on function public.h38_penny_after_refresh_deep_enqueue() from authenticated;
grant execute on function public.h38_penny_after_refresh_deep_enqueue() to service_role;

drop trigger if exists h38_penny_deep_refresh_enqueue on public.reseller_hunt_cache_meta;
create trigger h38_penny_deep_refresh_enqueue
after update of last_fast_scan_at, last_nightly_date
on public.reseller_hunt_cache_meta
for each row
when (
  old.last_fast_scan_at is distinct from new.last_fast_scan_at
  or old.last_nightly_date is distinct from new.last_nightly_date
)
execute function public.h38_penny_after_refresh_deep_enqueue();
