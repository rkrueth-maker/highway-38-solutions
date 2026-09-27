-- Cover foreign-key indexes reported by the production database advisor.
-- Clean-room Business Office replay intentionally omits some unrelated product tables,
-- so each production index is guarded by table existence.
do $$
begin
  if to_regclass('public.business_employee_profiles') is not null then execute 'create index if not exists business_employee_profiles_created_by_idx on public.business_employee_profiles(created_by)'; end if;
  if to_regclass('public.coupon_households') is not null then execute 'create index if not exists coupon_households_created_by_idx on public.coupon_households(created_by)'; end if;
  if to_regclass('public.fleet_events') is not null then execute 'create index if not exists fleet_events_vehicle_id_idx on public.fleet_events(vehicle_id)'; end if;
  if to_regclass('public.fleet_trips') is not null then execute 'create index if not exists fleet_trips_vehicle_id_idx on public.fleet_trips(vehicle_id)'; end if;
  if to_regclass('public.fleet_vehicle_assignments') is not null then
    execute 'create index if not exists fleet_vehicle_assignments_auth_user_id_idx on public.fleet_vehicle_assignments(auth_user_id)';
    execute 'create index if not exists fleet_vehicle_assignments_business_id_idx on public.fleet_vehicle_assignments(business_id)';
  end if;
  if to_regclass('public.h38_quickbooks_connections') is not null then execute 'create index if not exists h38_quickbooks_connections_connected_by_idx on public.h38_quickbooks_connections(connected_by)'; end if;
end
$$;
