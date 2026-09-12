-- Northern Lakes / reusable fleet provider foundation
create table if not exists public.fleet_provider_connections (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null, provider_user_id text, status text not null default 'not_connected', connected_at timestamptz,
  last_sync_at timestamptz, last_webhook_at timestamptz, settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (business_id, provider)
);
create table if not exists public.fleet_provider_secrets (
  connection_id uuid primary key references public.fleet_provider_connections(id) on delete cascade,
  access_token_ciphertext text, refresh_token_ciphertext text, token_nonce text, token_expires_at timestamptz, updated_at timestamptz not null default now()
);
alter table public.fleet_provider_secrets enable row level security;
revoke all on public.fleet_provider_secrets from public, anon, authenticated;
grant select,insert,update,delete on public.fleet_provider_secrets to service_role;
drop policy if exists "fleet secrets deny authenticated" on public.fleet_provider_secrets;
create policy "fleet secrets deny authenticated" on public.fleet_provider_secrets for all to authenticated using (false) with check (false);

create table if not exists public.fleet_vehicles (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null default 'bouncie', provider_device_id text not null, provider_imei text, asset_id text, nickname text, vin text,
  year integer, make text, model text, active boolean not null default true, connection_status text not null default 'unknown',
  last_known_at timestamptz, latitude double precision, longitude double precision, speed_mph numeric, heading_degrees numeric,
  odometer_miles numeric, battery_status text, mil_status text, provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (business_id, provider, provider_device_id)
);
create table if not exists public.fleet_vehicle_assignments (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade, auth_user_id uuid references auth.users(id) on delete set null,
  employee_id text, job_id text, starts_at timestamptz not null default now(), ends_at timestamptz, notes text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create table if not exists public.fleet_trips (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  vehicle_id uuid references public.fleet_vehicles(id) on delete set null, provider text not null default 'bouncie', provider_trip_id text not null,
  provider_device_id text, started_at timestamptz, ended_at timestamptz, distance_miles numeric, duration_seconds integer,
  start_latitude double precision, start_longitude double precision, end_latitude double precision, end_longitude double precision,
  route jsonb not null default '[]'::jsonb, customer_id text, job_id text, on_site_seconds integer not null default 0,
  linkage_confidence numeric, linkage_reason text, provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (business_id, provider, provider_trip_id)
);
create table if not exists public.fleet_events (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  vehicle_id uuid references public.fleet_vehicles(id) on delete set null, provider text not null default 'bouncie', provider_event_key text not null,
  event_type text not null, event_time timestamptz not null, severity text not null default 'info', latitude double precision, longitude double precision,
  details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique (business_id, provider, provider_event_key)
);
create table if not exists public.fleet_job_zones (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  job_id text not null, customer_id text, label text, address text, latitude double precision not null, longitude double precision not null,
  radius_meters integer not null default 120 check (radius_meters between 25 and 3000), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (business_id, job_id)
);
create table if not exists public.fleet_webhook_receipts (
  id uuid primary key default gen_random_uuid(), provider text not null, receipt_key text not null unique,
  received_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '30 days')
);
alter table public.fleet_webhook_receipts enable row level security;
revoke all on public.fleet_webhook_receipts from public, anon, authenticated;
grant select,insert,update,delete on public.fleet_webhook_receipts to service_role;
drop policy if exists "fleet receipts deny authenticated" on public.fleet_webhook_receipts;
create policy "fleet receipts deny authenticated" on public.fleet_webhook_receipts for all to authenticated using (false) with check (false);

create index if not exists fleet_vehicles_business_active_idx on public.fleet_vehicles(business_id,active,last_known_at desc);
create index if not exists fleet_assignments_vehicle_active_idx on public.fleet_vehicle_assignments(vehicle_id,auth_user_id,ends_at);
create index if not exists fleet_trips_business_time_idx on public.fleet_trips(business_id,started_at desc);
create index if not exists fleet_events_business_time_idx on public.fleet_events(business_id,event_time desc);
create index if not exists fleet_zones_business_active_idx on public.fleet_job_zones(business_id,active);

alter table public.fleet_provider_connections enable row level security;
alter table public.fleet_vehicles enable row level security;
alter table public.fleet_vehicle_assignments enable row level security;
alter table public.fleet_trips enable row level security;
alter table public.fleet_events enable row level security;
alter table public.fleet_job_zones enable row level security;

drop policy if exists "fleet owners read provider connections" on public.fleet_provider_connections;
create policy "fleet owners read provider connections" on public.fleet_provider_connections for select to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])));
drop policy if exists "fleet owners manage provider connections" on public.fleet_provider_connections;
create policy "fleet owners manage provider connections" on public.fleet_provider_connections for all to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])))
with check ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "fleet members read vehicles" on public.fleet_vehicles;
create policy "fleet members read vehicles" on public.fleet_vehicles for select to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])) or exists (
  select 1 from public.fleet_vehicle_assignments a where a.vehicle_id=fleet_vehicles.id and a.auth_user_id=(select auth.uid())
  and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())
));
drop policy if exists "fleet owners manage vehicles" on public.fleet_vehicles;
create policy "fleet owners manage vehicles" on public.fleet_vehicles for all to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])))
with check ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "fleet users read assignments" on public.fleet_vehicle_assignments;
create policy "fleet users read assignments" on public.fleet_vehicle_assignments for select to authenticated
using (auth_user_id=(select auth.uid()) or (select private.business_access(business_id,array['owner','administrator']::text[])));
drop policy if exists "fleet owners manage assignments" on public.fleet_vehicle_assignments;
create policy "fleet owners manage assignments" on public.fleet_vehicle_assignments for all to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])))
with check ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "fleet members read trips" on public.fleet_trips;
create policy "fleet members read trips" on public.fleet_trips for select to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])) or exists (
  select 1 from public.fleet_vehicle_assignments a where a.vehicle_id=fleet_trips.vehicle_id and a.auth_user_id=(select auth.uid())
  and a.starts_at<=coalesce(fleet_trips.ended_at,fleet_trips.started_at,now())
  and (a.ends_at is null or a.ends_at>=coalesce(fleet_trips.started_at,now()))
));
drop policy if exists "fleet owners manage trips" on public.fleet_trips;
create policy "fleet owners manage trips" on public.fleet_trips for all to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])))
with check ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "fleet members read events" on public.fleet_events;
create policy "fleet members read events" on public.fleet_events for select to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])) or exists (
  select 1 from public.fleet_vehicle_assignments a where a.vehicle_id=fleet_events.vehicle_id and a.auth_user_id=(select auth.uid())
  and a.starts_at<=fleet_events.event_time and (a.ends_at is null or a.ends_at>=fleet_events.event_time)
));
drop policy if exists "fleet owners manage events" on public.fleet_events;
create policy "fleet owners manage events" on public.fleet_events for all to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])))
with check ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "fleet owners read zones" on public.fleet_job_zones;
create policy "fleet owners read zones" on public.fleet_job_zones for select to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])));
drop policy if exists "fleet owners manage zones" on public.fleet_job_zones;
create policy "fleet owners manage zones" on public.fleet_job_zones for all to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])))
with check ((select private.business_access(business_id,array['owner','administrator']::text[])));

grant select,insert,update,delete on public.fleet_provider_connections to authenticated;
grant select,insert,update,delete on public.fleet_vehicles to authenticated;
grant select,insert,update,delete on public.fleet_vehicle_assignments to authenticated;
grant select,insert,update,delete on public.fleet_trips to authenticated;
grant select,insert,update,delete on public.fleet_events to authenticated;
grant select,insert,update,delete on public.fleet_job_zones to authenticated;
