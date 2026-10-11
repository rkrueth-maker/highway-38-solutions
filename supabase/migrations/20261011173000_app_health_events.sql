-- H38 Health Monitor: app_health_events table
-- Client-side telemetry (errors, usage, perf) + self-heal log.
-- PII is scrubbed client-side before insert; this table must never hold
-- names, emails, phones, or addresses.

create table if not exists public.app_health_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_type text not null check (event_type in ('error','usage','perf','heal')),
  page text,
  message text,
  stack text,
  viewport text,
  user_agent text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_health_events_business_time
  on public.app_health_events (business_id, created_at desc);
create index if not exists app_health_events_type_time
  on public.app_health_events (event_type, created_at desc);

alter table public.app_health_events enable row level security;

-- Members can write telemetry for their own business (client-side inserts).
drop policy if exists "members write health events" on public.app_health_events;
create policy "members write health events"
  on public.app_health_events for insert to authenticated
  with check (
    exists (
      select 1 from public.business_memberships m
      where m.business_id = app_health_events.business_id
        and m.auth_user_id = auth.uid()
        and m.status = 'active'
    )
  );

-- Owners/admins read their own business's events.
drop policy if exists "owners read health events" on public.app_health_events;
create policy "owners read health events"
  on public.app_health_events for select to authenticated
  using (
    exists (
      select 1 from public.business_memberships m
      where m.business_id = app_health_events.business_id
        and m.auth_user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner','administrator')
    )
  );

-- Platform owner (H38 owner = Ricky) reads everything for cross-tenant analytics.
drop policy if exists "platform owner reads all health events" on public.app_health_events;
create policy "platform owner reads all health events"
  on public.app_health_events for select to authenticated
  using (private.platform_owner_access(auth.uid()));

-- Service role bypasses RLS (edge functions, admin tooling).
drop policy if exists "service role all health events" on public.app_health_events;
create policy "service role all health events"
  on public.app_health_events for all to service_role
  using (true) with check (true);
