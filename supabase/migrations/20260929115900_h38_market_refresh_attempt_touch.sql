-- Keep multi-provider market-comp refreshes rotating through the candidate pool.
-- Providers update updated_at on every attempt; if they do not explicitly move
-- last_attempt_at, this trigger advances it to the same timestamp.

create or replace function private.touch_deal_engine_market_refresh_attempt()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.updated_at is distinct from old.updated_at
     and new.last_attempt_at is not distinct from old.last_attempt_at then
    new.last_attempt_at := new.updated_at;
  end if;
  return new;
end;
$$;

revoke all on function private.touch_deal_engine_market_refresh_attempt() from public, anon, authenticated;

drop trigger if exists trg_touch_deal_engine_market_refresh_attempt
  on public.deal_engine_market_refresh_state;
create trigger trg_touch_deal_engine_market_refresh_attempt
before update on public.deal_engine_market_refresh_state
for each row execute function private.touch_deal_engine_market_refresh_attempt();
