-- Highway 38 Business Office Supabase advisor hardening.
-- Scope: database performance and RLS policy shape only.
-- No record semantics, external actions, customer isolation, or app startup behavior change.

-- Cover foreign-key columns currently reported by the Supabase performance advisor.
create index if not exists business_onboarding_runs_requested_by_idx
  on public.business_onboarding_runs (requested_by);
create index if not exists business_records_created_by_idx
  on public.business_records (created_by);
create index if not exists business_records_updated_by_idx
  on public.business_records (updated_by);
create index if not exists business_storage_settings_connected_by_idx
  on public.business_storage_settings (connected_by);
create index if not exists contractor_pricing_rules_approved_by_idx
  on public.contractor_pricing_rules (approved_by);
create index if not exists contractor_pricing_rules_created_by_idx
  on public.contractor_pricing_rules (created_by);
create index if not exists price_book_assemblies_approved_by_idx
  on public.price_book_assemblies (approved_by);
create index if not exists price_book_assemblies_created_by_idx
  on public.price_book_assemblies (created_by);

-- Consolidate onboarding SELECT into one policy while preserving BOTH existing read paths:
-- 1) Highway 38 platform owners can inspect any client onboarding row.
-- 2) Owners/administrators of a specific business can inspect that business's onboarding row.
-- Keeping platform-owner SELECT is also required for any direct UPDATE path under Postgres RLS.
drop policy if exists "platform owners manage onboarding runs" on public.business_onboarding_runs;
drop policy if exists "business administrators read onboarding state" on public.business_onboarding_runs;
drop policy if exists "business administrators and platform owners read onboarding state" on public.business_onboarding_runs;
create policy "business administrators and platform owners read onboarding state"
on public.business_onboarding_runs for select
to authenticated
using (
  (select private.platform_owner_access((select auth.uid())))
  or
  (select private.business_access(business_id, array['owner', 'administrator']))
);

drop policy if exists "platform owners insert onboarding runs" on public.business_onboarding_runs;
create policy "platform owners insert onboarding runs"
on public.business_onboarding_runs for insert
to authenticated
with check ((select private.platform_owner_access((select auth.uid()))));

drop policy if exists "platform owners update onboarding runs" on public.business_onboarding_runs;
create policy "platform owners update onboarding runs"
on public.business_onboarding_runs for update
to authenticated
using ((select private.platform_owner_access((select auth.uid()))))
with check ((select private.platform_owner_access((select auth.uid()))));

drop policy if exists "platform owners delete onboarding runs" on public.business_onboarding_runs;
create policy "platform owners delete onboarding runs"
on public.business_onboarding_runs for delete
to authenticated
using ((select private.platform_owner_access((select auth.uid()))));

-- Administrators are already included in the member-read policy. Split the prior ALL
-- policy so SELECT has one authoritative policy and write access remains unchanged.
drop policy if exists "administrators manage business storage settings" on public.business_storage_settings;
drop policy if exists "administrators insert business storage settings" on public.business_storage_settings;
create policy "administrators insert business storage settings"
on public.business_storage_settings for insert
to authenticated
with check ((select private.business_access(business_id, array['owner', 'administrator'])));

drop policy if exists "administrators update business storage settings" on public.business_storage_settings;
create policy "administrators update business storage settings"
on public.business_storage_settings for update
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])))
with check ((select private.business_access(business_id, array['owner', 'administrator'])));

drop policy if exists "administrators delete business storage settings" on public.business_storage_settings;
create policy "administrators delete business storage settings"
on public.business_storage_settings for delete
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])));
