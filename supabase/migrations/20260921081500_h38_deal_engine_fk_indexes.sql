create index if not exists deal_engine_actions_created_by_idx
  on public.deal_engine_actions(created_by);
create index if not exists deal_engine_queue_selected_by_idx
  on public.deal_engine_sourcing_queue(selected_by);
create index if not exists deal_engine_state_last_refresh_by_idx
  on public.deal_engine_state(last_refresh_by)
  where last_refresh_by is not null;
create index if not exists deal_engine_watch_created_by_idx
  on public.deal_engine_watch_rules(created_by);
