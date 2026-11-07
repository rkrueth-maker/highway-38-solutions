-- Scout push lane scopes (Top-5 build): DG penny lane + flipper-steals lane.
-- Companion to the h38-scout-push lane-scope change in push/index.ts.
-- Apply BEFORE deploying the updated function (the function selects the new
-- prefs columns and writes scout_push_state rows for the new scope names).

-- 1) Lane pref toggles. Default TRUE per the lane spec: existing accounts get
--    the new lanes on unless they turn them off; the explicit backfill makes
--    pre-existing rows read true instead of relying on the column default.
alter table public.scout_notification_prefs
  add column if not exists dg_penny_alerts boolean not null default true;
alter table public.scout_notification_prefs
  add column if not exists steals_alerts boolean not null default true;

update public.scout_notification_prefs
set dg_penny_alerts = true
where dg_penny_alerts is null;
update public.scout_notification_prefs
set steals_alerts = true
where steals_alerts is null;

-- 2) scout_push_state: the table itself needs NO new columns — it is keyed
--    (household_id, user_id, scope) and scope is plain text, so 'penny_dg'
--    and 'steals' rows slot into the existing key (confirmed against
--    20261013190000_scout_push_notifications.sql).
--    BUT the original migration's CHECK constraint limits scope to
--    ('penny','resale') — verified live 2026-11-06:
--      scout_push_state_scope_check = CHECK (scope = ANY (ARRAY['penny','resale']))
--    Without widening it, the first lane watermark upsert fails. Widen it:
alter table public.scout_push_state
  drop constraint if exists scout_push_state_scope_check;
alter table public.scout_push_state
  add constraint scout_push_state_scope_check
  check (scope in ('penny', 'resale', 'penny_dg', 'steals'));

notify pgrst, 'reload schema';
