-- Scout native push (FCM) device tokens — 2026-10-13.
-- The H38 Deals Android app's WebView cannot do Web Push (no PushManager /
-- Notification API in that environment — the in-app Deal alerts card detects
-- this and disables its switches). Native Android notifications go through
-- Firebase Cloud Messaging instead: the app registers its FCM device token
-- here (bound to the signed-in user + household via the h38-scout-push edge
-- function), and the same watermark-driven dispatcher sends the plain-count
-- deal alerts over FCM alongside the existing Web Push channel.
--
-- Service-role only, same pattern as the other scout_push_* tables: RLS on,
-- grants revoked from anon/authenticated; every read/write goes through the
-- edge function, which validates the caller's session and household in code.

create table if not exists public.scout_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  household_id uuid not null,
  fcm_token text not null unique,
  platform text not null default 'android',
  app_version text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scout_device_tokens_household_idx
  on public.scout_device_tokens (household_id, active);
create index if not exists scout_device_tokens_user_idx
  on public.scout_device_tokens (user_id, active);

alter table public.scout_device_tokens enable row level security;

revoke all on table public.scout_device_tokens from anon, authenticated;
grant select, insert, update, delete on table public.scout_device_tokens to service_role;

-- Dispatch log: record which channel carried each notification. Existing
-- rows are Web Push by definition. device_token_id parallels
-- subscription_id (exactly one of the two is set per row).
alter table public.scout_push_dispatch_log
  add column if not exists channel text not null default 'webpush';
alter table public.scout_push_dispatch_log
  add column if not exists device_token_id uuid;

notify pgrst, 'reload schema';
