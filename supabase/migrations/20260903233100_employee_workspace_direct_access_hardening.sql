-- H38 employee workspace direct-table/storage hardening.
-- Staff is an assigned-work employee role. Owner/administrator remains the direct administrative data role.
-- Customer portal users continue to use their separate customer-owned policies and RPCs.

-- Customer communications and portal administration are not part of the employee task workspace.
drop policy if exists "staff read business messages" on public.customer_messages;
create policy "staff read business messages"
on public.customer_messages for select
to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "staff stage business messages" on public.customer_messages;
create policy "staff stage business messages"
on public.customer_messages for insert
to authenticated
with check (
  (select private.business_access(business_id,array['owner','administrator']::text[]))
  and created_by=(select auth.uid())
  and direction='business_to_customer'
  and status='pending_owner_review'
);

drop policy if exists "staff read business files" on public.customer_files;
create policy "staff read business files"
on public.customer_files for select
to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "staff stage business files" on public.customer_files;
create policy "staff stage business files"
on public.customer_files for insert
to authenticated
with check (
  (select private.business_access(business_id,array['owner','administrator']::text[]))
  and available_to_customer=false
);

drop policy if exists "members read business portal events" on public.customer_portal_events;
create policy "members read business portal events"
on public.customer_portal_events for select
to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "members record business portal events" on public.customer_portal_events;
create policy "members record business portal events"
on public.customer_portal_events for insert
to authenticated
with check (
  (select private.business_access(business_id,array['owner','administrator']::text[]))
  and auth_user_id=(select auth.uid())
  and external_action_occurred=false
);

-- The generic business storage buckets can contain financial/customer/management documents.
-- Do not grant business-wide object visibility to Staff until an assigned-job object-path contract exists.
drop policy if exists "members read business office objects" on storage.objects;
create policy "members read business office objects"
on storage.objects for select
to authenticated
using (
  bucket_id='business-office'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (select private.business_access(((storage.foldername(name))[1])::uuid,array['owner','administrator']::text[]))
);

drop policy if exists "staff upload business office objects" on storage.objects;
create policy "staff upload business office objects"
on storage.objects for insert
to authenticated
with check (
  bucket_id='business-office'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and owner_id=(select auth.uid()::text)
  and (select private.business_access(((storage.foldername(name))[1])::uuid,array['owner','administrator']::text[]))
);

drop policy if exists "staff update business office objects" on storage.objects;
create policy "staff update business office objects"
on storage.objects for update
to authenticated
using (
  bucket_id='business-office'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (select private.business_access(((storage.foldername(name))[1])::uuid,array['owner','administrator']::text[]))
)
with check (
  bucket_id='business-office'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (select private.business_access(((storage.foldername(name))[1])::uuid,array['owner','administrator']::text[]))
);

drop policy if exists "members read business office files" on storage.objects;
create policy "members read business office files"
on storage.objects for select
to authenticated
using (
  bucket_id='business-office-files'
  and (select private.business_storage_access(name,array['owner','administrator']::text[]))
);

drop policy if exists "staff upload business office files" on storage.objects;
create policy "staff upload business office files"
on storage.objects for insert
to authenticated
with check (
  bucket_id='business-office-files'
  and (select private.business_storage_access(name,array['owner','administrator']::text[]))
);

drop policy if exists "staff replace business office files" on storage.objects;
create policy "staff replace business office files"
on storage.objects for update
to authenticated
using (
  bucket_id='business-office-files'
  and (select private.business_storage_access(name,array['owner','administrator']::text[]))
)
with check (
  bucket_id='business-office-files'
  and (select private.business_storage_access(name,array['owner','administrator']::text[]))
);

drop policy if exists "members read business storage settings" on public.business_storage_settings;
create policy "members read business storage settings"
on public.business_storage_settings for select
to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])));
