-- Production backend hardening identified by the Supabase acceptance gate.
-- This migration is intentionally idempotent and preserves all business data.

-- These service-owned Reseller tables predated migration coverage in production.
-- Reconstruct their exact live schema so clean-room replay and production share
-- one source of truth. Existing production rows and table definitions remain in
-- place because every creation statement is conditional.
create table if not exists public.reseller_hunt_cache (
  canonical_key text primary key,
  retailer text not null default '',
  title text not null default '',
  upc text not null default '',
  sku text not null default '',
  deal_type text not null default 'candidate',
  buy_price numeric,
  retail_price numeric,
  image_url text not null default '',
  source_url text not null default '',
  source_bucket text not null default '',
  payload jsonb not null default '{}'::jsonb
    constraint reseller_hunt_cache_payload_check check (jsonb_typeof(payload) = 'object'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  seen_count integer not null default 1
    constraint reseller_hunt_cache_seen_count_check check (seen_count >= 1),
  active boolean not null default true
);

create table if not exists public.reseller_hunt_cache_meta (
  cache_key text primary key,
  scan_status text not null default 'idle',
  scan_started_at timestamptz,
  scan_finished_at timestamptz,
  last_fast_scan_at timestamptz,
  last_full_scan_at timestamptz,
  last_new_count integer not null default 0,
  last_updated_count integer not null default 0,
  last_total_count integer not null default 0,
  last_error text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.reseller_store_discovery_snapshots (
  snapshot_key text primary key,
  lat double precision not null,
  lon double precision not null,
  radius_miles integer not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.reseller_store_discovery_tiles (
  area_key text not null,
  tile_index integer not null,
  lat double precision not null,
  lon double precision not null,
  radius_miles integer not null,
  stores jsonb not null default '[]'::jsonb,
  source text,
  updated_at timestamptz not null default now(),
  primary key (area_key, tile_index)
);

create index if not exists reseller_hunt_cache_active_seen_idx
  on public.reseller_hunt_cache (active, last_seen_at desc);
create index if not exists reseller_hunt_cache_retailer_idx
  on public.reseller_hunt_cache (retailer, active, last_seen_at desc);
create index if not exists reseller_store_discovery_snapshots_geo_idx
  on public.reseller_store_discovery_snapshots (radius_miles, lat, lon);
create index if not exists reseller_store_discovery_snapshots_updated_at_idx
  on public.reseller_store_discovery_snapshots (updated_at desc);
create index if not exists reseller_store_discovery_tiles_lookup_idx
  on public.reseller_store_discovery_tiles (area_key, updated_at desc);

alter table public.reseller_hunt_cache enable row level security;
alter table public.reseller_hunt_cache_meta enable row level security;
alter table public.reseller_store_discovery_snapshots enable row level security;
alter table public.reseller_store_discovery_tiles enable row level security;

revoke all on table public.reseller_hunt_cache from public, anon, authenticated;
revoke all on table public.reseller_hunt_cache_meta from public, anon, authenticated;
revoke all on table public.reseller_store_discovery_snapshots from public, anon, authenticated;
revoke all on table public.reseller_store_discovery_tiles from public, anon, authenticated;
grant all on table public.reseller_hunt_cache to service_role;
grant all on table public.reseller_hunt_cache_meta to service_role;
grant all on table public.reseller_store_discovery_snapshots to service_role;
grant all on table public.reseller_store_discovery_tiles to service_role;

-- Trigger code resolves only built-in functions and operators.
create or replace function public.sanitize_reseller_store_discovery_tiles()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.stores := coalesce((
    select jsonb_agg(item)
    from jsonb_array_elements(coalesce(new.stores, '[]'::jsonb)) item
    where lower(coalesce(item->>'store_name', '')) not like '%burlington northern%'
      and lower(coalesce(item->>'store_name', '')) not like '%bnsf%'
      and lower(coalesce(item->>'store_name', '')) <> 'kmart'
      and lower(coalesce(item->>'retailer', '')) <> 'kmart'
  ), '[]'::jsonb);
  return new;
end
$function$;

drop trigger if exists trg_sanitize_reseller_store_discovery_tiles
  on public.reseller_store_discovery_tiles;
create trigger trg_sanitize_reseller_store_discovery_tiles
before insert or update on public.reseller_store_discovery_tiles
for each row execute function public.sanitize_reseller_store_discovery_tiles();

-- Make service-only tables explicitly fail closed for direct Data API clients.
do $policy$
declare
  v_table text;
begin
  foreach v_table in array array[
    'reseller_hunt_cache',
    'reseller_hunt_cache_meta',
    'reseller_store_discovery_snapshots',
    'reseller_store_discovery_tiles'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'deny direct client access', v_table);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',
      'deny direct client access',
      v_table
    );
  end loop;
end
$policy$;

-- Preserve employee self-read and administrator management with one permissive
-- policy per command. The prior ALL + SELECT pair duplicated SELECT work.
drop policy if exists "employees read own profile" on public.business_employee_profiles;
drop policy if exists "administrators manage employee profiles" on public.business_employee_profiles;
drop policy if exists "members read permitted employee profiles" on public.business_employee_profiles;
drop policy if exists "administrators insert employee profiles" on public.business_employee_profiles;
drop policy if exists "administrators update employee profiles" on public.business_employee_profiles;
drop policy if exists "administrators delete employee profiles" on public.business_employee_profiles;

create policy "members read permitted employee profiles"
on public.business_employee_profiles
for select to authenticated
using (
  exists (
    select 1
    from public.business_memberships membership
    where membership.id = business_employee_profiles.membership_id
      and membership.auth_user_id = (select auth.uid())
      and membership.status = 'active'
  )
  or (select private.business_access(
    business_employee_profiles.business_id,
    array['owner','administrator']::text[]
  ))
);

create policy "administrators insert employee profiles"
on public.business_employee_profiles
for insert to authenticated
with check ((select private.business_access(
  business_employee_profiles.business_id,
  array['owner','administrator']::text[]
)));

create policy "administrators update employee profiles"
on public.business_employee_profiles
for update to authenticated
using ((select private.business_access(
  business_employee_profiles.business_id,
  array['owner','administrator']::text[]
)))
with check ((select private.business_access(
  business_employee_profiles.business_id,
  array['owner','administrator']::text[]
)));

create policy "administrators delete employee profiles"
on public.business_employee_profiles
for delete to authenticated
using ((select private.business_access(
  business_employee_profiles.business_id,
  array['owner','administrator']::text[]
)));

-- These policies are strict subsets of the canonical customer/member policies.
-- Removing them changes no allowed row; it avoids evaluating the same access
-- branch twice for each request.
drop policy if exists "staff read business customers" on public.customer_accounts;
drop policy if exists "staff read business files" on public.customer_files;
drop policy if exists "staff read business invoices" on public.customer_invoices;
drop policy if exists "staff read business jobs" on public.customer_jobs;
drop policy if exists "staff read business messages" on public.customer_messages;
drop policy if exists "staff read business quotes" on public.customer_quotes;
drop policy if exists "staff stage business messages" on public.customer_messages;
drop policy if exists "members record business portal events" on public.customer_portal_events;

-- Cover every foreign-key lookup reported by the production advisor.
create index if not exists business_employee_profiles_created_by_idx
  on public.business_employee_profiles (created_by);
create index if not exists coupon_list_items_list_id_idx
  on public.coupon_list_items (list_id);
create index if not exists coupon_list_items_user_id_idx
  on public.coupon_list_items (user_id);
create index if not exists coupon_receipts_user_id_idx
  on public.coupon_receipts (user_id);
create index if not exists coupon_shopping_lists_user_id_idx
  on public.coupon_shopping_lists (user_id);
create index if not exists coupon_watch_rules_user_id_idx
  on public.coupon_watch_rules (user_id);
create index if not exists reseller_deals_updated_by_idx
  on public.reseller_deals (updated_by);

-- The following RPCs intentionally use SECURITY DEFINER because their public
-- wrappers perform explicit auth.uid(), membership, role, and tenant checks.
-- Keep anonymous/PUBLIC execution revoked and lock the exact client surface.
revoke all on function public.activate_client_business(uuid) from public, anon;
grant execute on function public.activate_client_business(uuid) to authenticated, service_role;
revoke all on function public.business_office_apply_import(uuid) from public, anon;
grant execute on function public.business_office_apply_import(uuid) to authenticated, service_role;
revoke all on function public.business_office_clock_in(uuid,text,text,text) from public, anon;
grant execute on function public.business_office_clock_in(uuid,text,text,text) to authenticated, service_role;
revoke all on function public.business_office_clock_out(uuid,text) from public, anon;
grant execute on function public.business_office_clock_out(uuid,text) to authenticated, service_role;
revoke all on function public.business_office_edit_time_entry(uuid,text,text,timestamptz,timestamptz,numeric,text,text,text) from public, anon;
grant execute on function public.business_office_edit_time_entry(uuid,text,text,timestamptz,timestamptz,numeric,text,text,text) to authenticated, service_role;
revoke all on function public.business_office_employee_update_task(uuid,text,text,text) from public, anon;
grant execute on function public.business_office_employee_update_task(uuid,text,text,text) to authenticated, service_role;
revoke all on function public.business_office_employee_workspace(uuid) from public, anon;
grant execute on function public.business_office_employee_workspace(uuid) to authenticated, service_role;
revoke all on function public.business_office_invite_employee(uuid,text,text,text) from public, anon;
grant execute on function public.business_office_invite_employee(uuid,text,text,text) to authenticated, service_role;
revoke all on function public.business_office_quote_learning_profile(uuid) from public, anon;
grant execute on function public.business_office_quote_learning_profile(uuid) to authenticated, service_role;
revoke all on function public.business_office_stage_import(uuid,text,text,jsonb) from public, anon;
grant execute on function public.business_office_stage_import(uuid,text,text,jsonb) to authenticated, service_role;
revoke all on function public.business_office_team_directory(uuid) from public, anon;
grant execute on function public.business_office_team_directory(uuid) to authenticated, service_role;
revoke all on function public.business_office_time_admin(uuid,integer) from public, anon;
grant execute on function public.business_office_time_admin(uuid,integer) to authenticated, service_role;
revoke all on function public.business_office_time_state(uuid) from public, anon;
grant execute on function public.business_office_time_state(uuid) to authenticated, service_role;
revoke all on function public.client_tenant_installer_state() from public, anon;
grant execute on function public.client_tenant_installer_state() to authenticated, service_role;
revoke all on function public.customer_portal_approve_quote(uuid,integer) from public, anon;
grant execute on function public.customer_portal_approve_quote(uuid,integer) to authenticated, service_role;
revoke all on function public.customer_portal_customer_id() from public, anon;
grant execute on function public.customer_portal_customer_id() to authenticated, service_role;
revoke all on function public.customer_portal_decide_quote(uuid,integer,text,text) from public, anon;
grant execute on function public.customer_portal_decide_quote(uuid,integer,text,text) to authenticated, service_role;
revoke all on function public.provision_client_business(text,text,text,text,text,jsonb,text[],text,text) from public, anon;
grant execute on function public.provision_client_business(text,text,text,text,text,jsonb,text[],text,text) to authenticated, service_role;
revoke all on function public.suspend_client_business(uuid,text) from public, anon;
grant execute on function public.suspend_client_business(uuid,text) to authenticated, service_role;
