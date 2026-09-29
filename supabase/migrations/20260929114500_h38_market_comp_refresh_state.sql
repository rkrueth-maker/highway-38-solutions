-- Track automatic public market-comparison refresh attempts without altering deal evidence.
-- This lets the bounded worker rotate through opportunities and prevents repeated searches.

create table if not exists public.deal_engine_market_refresh_state (
  household_id uuid not null references public.coupon_households(id) on delete cascade,
  canonical_key text not null,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  result_count integer not null default 0,
  sold_count integer not null default 0,
  active_count integer not null default 0,
  completed_count integer not null default 0,
  status text not null default 'NEVER',
  last_query text not null default '',
  last_error text not null default '',
  updated_at timestamptz not null default now(),
  primary key (household_id, canonical_key)
);

create index if not exists deal_engine_market_refresh_due_idx
  on public.deal_engine_market_refresh_state(last_attempt_at asc nulls first, household_id, canonical_key);

alter table public.deal_engine_market_refresh_state enable row level security;
revoke all on table public.deal_engine_market_refresh_state from anon, authenticated;
grant select on table public.deal_engine_market_refresh_state to authenticated;

drop policy if exists deal_engine_market_refresh_state_read on public.deal_engine_market_refresh_state;
create policy deal_engine_market_refresh_state_read on public.deal_engine_market_refresh_state
for select to authenticated
using (household_id in (select private.current_coupon_household_ids()));
