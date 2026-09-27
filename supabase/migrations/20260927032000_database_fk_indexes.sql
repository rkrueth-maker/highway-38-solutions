-- Cover foreign-key indexes reported by the production database advisor.
create index if not exists business_employee_profiles_created_by_idx on public.business_employee_profiles(created_by);
create index if not exists coupon_households_created_by_idx on public.coupon_households(created_by);
create index if not exists fleet_events_vehicle_id_idx on public.fleet_events(vehicle_id);
create index if not exists fleet_trips_vehicle_id_idx on public.fleet_trips(vehicle_id);
create index if not exists fleet_vehicle_assignments_auth_user_id_idx on public.fleet_vehicle_assignments(auth_user_id);
create index if not exists fleet_vehicle_assignments_business_id_idx on public.fleet_vehicle_assignments(business_id);
create index if not exists h38_quickbooks_connections_connected_by_idx on public.h38_quickbooks_connections(connected_by);
