-- Preserve effective access while avoiding duplicate SELECT evaluation from owner-manage ALL policies.

-- Employee profiles: own-profile SELECT already includes owner/admin access.
drop policy if exists "administrators manage employee profiles" on public.business_employee_profiles;
create policy "administrators insert employee profiles" on public.business_employee_profiles for insert to authenticated with check ((select private.business_access(business_employee_profiles.business_id,array['owner','administrator'])));
create policy "administrators update employee profiles" on public.business_employee_profiles for update to authenticated using ((select private.business_access(business_employee_profiles.business_id,array['owner','administrator']))) with check ((select private.business_access(business_employee_profiles.business_id,array['owner','administrator'])));
create policy "administrators delete employee profiles" on public.business_employee_profiles for delete to authenticated using ((select private.business_access(business_employee_profiles.business_id,array['owner','administrator'])));

-- Fleet member read policies already include owner/admin access; keep writes owner/admin-only.
drop policy if exists "fleet owners manage events" on public.fleet_events;
create policy "fleet owners insert events" on public.fleet_events for insert to authenticated with check ((select private.business_access(fleet_events.business_id,array['owner','administrator'])));
create policy "fleet owners update events" on public.fleet_events for update to authenticated using ((select private.business_access(fleet_events.business_id,array['owner','administrator']))) with check ((select private.business_access(fleet_events.business_id,array['owner','administrator'])));
create policy "fleet owners delete events" on public.fleet_events for delete to authenticated using ((select private.business_access(fleet_events.business_id,array['owner','administrator'])));

drop policy if exists "fleet owners manage trips" on public.fleet_trips;
create policy "fleet owners insert trips" on public.fleet_trips for insert to authenticated with check ((select private.business_access(fleet_trips.business_id,array['owner','administrator'])));
create policy "fleet owners update trips" on public.fleet_trips for update to authenticated using ((select private.business_access(fleet_trips.business_id,array['owner','administrator']))) with check ((select private.business_access(fleet_trips.business_id,array['owner','administrator'])));
create policy "fleet owners delete trips" on public.fleet_trips for delete to authenticated using ((select private.business_access(fleet_trips.business_id,array['owner','administrator'])));

drop policy if exists "fleet owners manage assignments" on public.fleet_vehicle_assignments;
create policy "fleet owners insert assignments" on public.fleet_vehicle_assignments for insert to authenticated with check ((select private.business_access(fleet_vehicle_assignments.business_id,array['owner','administrator'])));
create policy "fleet owners update assignments" on public.fleet_vehicle_assignments for update to authenticated using ((select private.business_access(fleet_vehicle_assignments.business_id,array['owner','administrator']))) with check ((select private.business_access(fleet_vehicle_assignments.business_id,array['owner','administrator'])));
create policy "fleet owners delete assignments" on public.fleet_vehicle_assignments for delete to authenticated using ((select private.business_access(fleet_vehicle_assignments.business_id,array['owner','administrator'])));

drop policy if exists "fleet owners manage vehicles" on public.fleet_vehicles;
create policy "fleet owners insert vehicles" on public.fleet_vehicles for insert to authenticated with check ((select private.business_access(fleet_vehicles.business_id,array['owner','administrator'])));
create policy "fleet owners update vehicles" on public.fleet_vehicles for update to authenticated using ((select private.business_access(fleet_vehicles.business_id,array['owner','administrator']))) with check ((select private.business_access(fleet_vehicles.business_id,array['owner','administrator'])));
create policy "fleet owners delete vehicles" on public.fleet_vehicles for delete to authenticated using ((select private.business_access(fleet_vehicles.business_id,array['owner','administrator'])));
