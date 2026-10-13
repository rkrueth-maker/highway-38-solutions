-- Scout push notifications (2026-10-13, Rick's request): the Scout app itself
-- notifies its signed-in users (Web Push) when NEW penny deals or NEW resale
-- deals land for their household. Detection is at the data layer
-- (deal_engine_observations / reseller_deals) because the penny ingest source
-- is deployed-only. Dispatch is batched (one push per user per check run) and
-- watermark-driven so a row can never notify twice.
--
-- Tables are service-role only (RLS on, all grants revoked from anon /
-- authenticated). Every read/write goes through the h38-scout-push edge
-- function, which validates the caller's Supabase session in code and scopes
-- subscriptions to households the caller belongs to
-- (coupon_household_members) — the same pattern as the QuickBooks bridge.

create table if not exists public.scout_notification_prefs (
  user_id uuid not null,
  household_id uuid not null,
  penny_alerts boolean not null default false,
  resale_alerts boolean not null default false,
  -- When true (owner pre-enabled the account at the user's own request), the
  -- Scout pages present the one-tap phone-permission step in context on open.
  prompt_on_open boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, household_id)
);

create table if not exists public.scout_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  household_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scout_push_subscriptions_household_idx
  on public.scout_push_subscriptions (household_id, active);

-- Per-account detection watermark (household + user + scope). A user's
-- watermark advances only after a batch has actually been dispatched to one
-- of their devices. If an account has alerts ON but no device subscribed yet,
-- its watermark HOLDS so the pending batch (the catch-up) fires the moment
-- the first device subscribes — without ever re-notifying accounts that
-- already received the batch.
create table if not exists public.scout_push_state (
  household_id uuid not null,
  user_id uuid not null,
  scope text not null check (scope in ('penny', 'resale')),
  watermark_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id, scope)
);

create table if not exists public.scout_push_dispatch_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id uuid,
  subscription_id uuid,
  scopes text not null default '',
  title text not null default '',
  body text not null default '',
  window_from timestamptz,
  window_to timestamptz,
  push_status integer,
  result text not null default '',
  created_at timestamptz not null default now()
);

-- Best-effort delivery receipts posted back by the service worker when a push
-- is actually received and displayed on a device. Stores only a hash of the
-- subscription endpoint, never the endpoint itself.
create table if not exists public.scout_push_receipts (
  id uuid primary key default gen_random_uuid(),
  endpoint_hash text not null,
  title text not null default '',
  received_at timestamptz not null default now()
);

alter table public.scout_notification_prefs enable row level security;
alter table public.scout_push_subscriptions enable row level security;
alter table public.scout_push_state enable row level security;
alter table public.scout_push_dispatch_log enable row level security;
alter table public.scout_push_receipts enable row level security;

revoke all on table public.scout_notification_prefs from anon, authenticated;
revoke all on table public.scout_push_subscriptions from anon, authenticated;
revoke all on table public.scout_push_state from anon, authenticated;
revoke all on table public.scout_push_dispatch_log from anon, authenticated;
revoke all on table public.scout_push_receipts from anon, authenticated;

grant select, insert, update, delete on table public.scout_notification_prefs to service_role;
grant select, insert, update, delete on table public.scout_push_subscriptions to service_role;
grant select, insert, update, delete on table public.scout_push_state to service_role;
grant select, insert, update, delete on table public.scout_push_dispatch_log to service_role;
grant select, insert, update, delete on table public.scout_push_receipts to service_role;

-- Pre-enabled accounts (Rick's explicit instruction 2026-10-13: "you turn mine
-- on the notifications" + "and Amanda's"). Both toggles ON server-side; the
-- only step left to each person is the phone's own permission grant, which
-- the app presents as a single tap on their next Scout open. The browser/OS
-- permission itself cannot be created server-side.
insert into public.scout_notification_prefs (user_id, household_id, penny_alerts, resale_alerts, prompt_on_open)
values
  ('ccf25333-47cd-42ca-a20b-cdbc63a8a695', 'e045bf81-1684-45ba-8468-1e33c70a28eb', true, true, true),  -- Rick (household owner)
  ('6dd51b31-5974-4691-b8b8-83e5877528c0', 'e045bf81-1684-45ba-8468-1e33c70a28eb', true, true, true)   -- Amanda (household member)
on conflict (user_id, household_id) do nothing;

-- Catch-up watermark: start of the current scan batch — midnight CDT on
-- 2026-10-13 (05:00 UTC). The overnight batch (new penny finds + today's
-- resale leads) is therefore still "new" and will be delivered, batched into
-- one notification per person, the moment their first device subscribes.
insert into public.scout_push_state (household_id, user_id, scope, watermark_at)
values
  ('e045bf81-1684-45ba-8468-1e33c70a28eb', 'ccf25333-47cd-42ca-a20b-cdbc63a8a695', 'penny', '2026-10-13T05:00:00Z'),
  ('e045bf81-1684-45ba-8468-1e33c70a28eb', 'ccf25333-47cd-42ca-a20b-cdbc63a8a695', 'resale', '2026-10-13T05:00:00Z'),
  ('e045bf81-1684-45ba-8468-1e33c70a28eb', '6dd51b31-5974-4691-b8b8-83e5877528c0', 'penny', '2026-10-13T05:00:00Z'),
  ('e045bf81-1684-45ba-8468-1e33c70a28eb', '6dd51b31-5974-4691-b8b8-83e5877528c0', 'resale', '2026-10-13T05:00:00Z')
on conflict (household_id, user_id, scope) do nothing;

-- Internal dispatch key, following the h38_internal_job_secrets pattern used
-- by kit-proactive-engine / h38-review-scheduler. The cron job below reads
-- this row and presents it as the x-h38-nightly-key header; the edge function
-- compares the header against the same row. Value generated at apply time,
-- never committed anywhere.
insert into public.h38_internal_job_secrets (name, secret_value)
select 'scout-push', md5(random()::text || clock_timestamp()::text || random()::text)
where not exists (select 1 from public.h38_internal_job_secrets where name = 'scout-push');

-- Scheduled checker: every 30 minutes. Idempotent re-schedule.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('h38-scout-push-notify')
      from (select 1) s where exists (select 1 from cron.job where jobname = 'h38-scout-push-notify');
    perform cron.schedule(
      'h38-scout-push-notify',
      '*/30 * * * *',
      $cmd$
      select net.http_post(
        url := 'https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-scout-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-h38-nightly-key', (select secret_value from public.h38_internal_job_secrets where name = 'scout-push' limit 1)
        ),
        body := '{"action":"check"}'::jsonb,
        timeout_milliseconds := 120000
      );
      $cmd$
    );
  end if;
end $$;

notify pgrst, 'reload schema';
