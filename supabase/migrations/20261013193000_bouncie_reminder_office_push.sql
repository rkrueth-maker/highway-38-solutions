-- Office push subscriptions + Bouncie connection reminder (2026-10-13).
--
-- Rick's requirement: while Bouncie is NOT connected for the Northern Lakes
-- tenant, the Office sends its owner (Josh) an app push notification every
-- hour telling him to connect Bouncie, tap-through to Fleet -> Settings. It
-- stops automatically and permanently the moment Bouncie connection/fleet
-- data appears for the tenant.
--
-- This rides the SHARED push machinery from the Scout build (migration
-- 20261013190000): same dispatcher function (h38-scout-push), same VAPID
-- identity, same sendPush, same dispatch log. What is added here is only
-- the business-scoped storage the household tables cannot hold:
--   * office_push_subscriptions — device subscriptions scoped by
--     business_memberships (owner/administrator), written/read only by the
--     h38-scout-push function's office actions (service role).
--   * scout_push_dispatch_log gains a business_id column and household_id
--     becomes nullable, so office dispatches land in the SAME log.
--   * bouncie_reminder_state — the hourly throttle + the permanent
--     connected latch for the reminder loop.
--
-- "Connected" evidence is exactly what the existing bouncie-watch.py check
-- uses: a fleet_provider_connections row (provider 'bouncie') with status
-- 'connected', or at least one active fleet_vehicles row (provider
-- 'bouncie'), for the tenant.

create table if not exists public.office_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists office_push_subscriptions_business_idx
  on public.office_push_subscriptions (business_id, active);

alter table public.office_push_subscriptions enable row level security;
revoke all on table public.office_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.office_push_subscriptions to service_role;

-- Office dispatch rows share the Scout dispatch log (household_id null,
-- business_id set). Existing Scout rows are untouched.
alter table public.scout_push_dispatch_log alter column household_id drop not null;
alter table public.scout_push_dispatch_log add column if not exists business_id uuid;
create index if not exists scout_push_dispatch_log_business_idx
  on public.scout_push_dispatch_log (business_id, created_at desc);

create table if not exists public.bouncie_reminder_state (
  business_id uuid primary key,
  connected_latched_at timestamptz,
  last_sent_at timestamptz,
  send_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.bouncie_reminder_state enable row level security;
revoke all on table public.bouncie_reminder_state from anon, authenticated;
grant select, insert, update, delete on table public.bouncie_reminder_state to service_role;

-- Hourly reminder run. The producer (h38-owner-notify, action
-- 'bouncie-reminder') checks the connected evidence first and exits
-- silently when connected/latched or when the last send is <55 minutes
-- old, so this job can never double-fire inside the hour.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('h38-bouncie-reminder-1h')
      from (select 1) s where exists (select 1 from cron.job where jobname = 'h38-bouncie-reminder-1h');
    perform cron.schedule(
      'h38-bouncie-reminder-1h',
      '7 * * * *',
      $cmd$
      select net.http_post(
        url := 'https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-owner-notify',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-h38-nightly-key', (select secret_value from public.h38_internal_job_secrets where name = 'h38-owner-notify' limit 1)
        ),
        body := '{"action":"bouncie-reminder"}'::jsonb,
        timeout_milliseconds := 60000
      );
      $cmd$
    );
  end if;
end $$;

notify pgrst, 'reload schema';
