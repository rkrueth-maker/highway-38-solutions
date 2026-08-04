-- Business Office foundation performance hardening.
-- Consolidate overlapping permissive policies and cover operational foreign keys.

create index if not exists business_approvals_requested_by_idx
  on public.business_approvals (requested_by);
create index if not exists business_approvals_reviewed_by_idx
  on public.business_approvals (reviewed_by);
create index if not exists business_error_log_actor_user_idx
  on public.business_error_log (actor_user_id);
create index if not exists business_error_log_resolved_by_idx
  on public.business_error_log (resolved_by);
create index if not exists business_memberships_invited_by_idx
  on public.business_memberships (invited_by);
create index if not exists business_proof_log_actor_user_idx
  on public.business_proof_log (actor_user_id);
create index if not exists customer_portal_events_customer_idx
  on public.customer_portal_events (customer_id);
create index if not exists price_book_items_approved_by_idx
  on public.price_book_items (approved_by);
create index if not exists price_book_items_created_by_idx
  on public.price_book_items (created_by);
create index if not exists quote_items_approved_by_idx
  on public.quote_items (approved_by);
create index if not exists quote_items_created_by_idx
  on public.quote_items (created_by);
create index if not exists quote_items_price_book_item_idx
  on public.quote_items (price_book_item_id);

-- Administrators already read settings through the member-read policy.
-- Split the prior ALL policy so SELECT has one authoritative policy.
drop policy if exists "administrators manage module settings" on public.business_module_settings;

drop policy if exists "administrators insert module settings" on public.business_module_settings;
create policy "administrators insert module settings"
on public.business_module_settings for insert
to authenticated
with check ((select private.business_access(business_id, array['owner', 'administrator'])));

drop policy if exists "administrators update module settings" on public.business_module_settings;
create policy "administrators update module settings"
on public.business_module_settings for update
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])))
with check ((select private.business_access(business_id, array['owner', 'administrator'])));

drop policy if exists "administrators delete module settings" on public.business_module_settings;
create policy "administrators delete module settings"
on public.business_module_settings for delete
to authenticated
using ((select private.business_access(business_id, array['owner', 'administrator'])));

-- Customer-facing and business-member reads share one policy per table.
drop policy if exists "customer reads own account" on public.customer_accounts;
drop policy if exists "staff read business customers" on public.customer_accounts;
drop policy if exists "customer or member reads accounts" on public.customer_accounts;
create policy "customer or member reads accounts"
on public.customer_accounts for select
to authenticated
using (
  (
    auth_user_id = (select auth.uid())
    and status = 'active'
    and portal_enabled = true
  )
  or (select private.business_access(business_id, null))
);

drop policy if exists "customer reads own jobs" on public.customer_jobs;
drop policy if exists "staff read business jobs" on public.customer_jobs;
drop policy if exists "customer or member reads jobs" on public.customer_jobs;
create policy "customer or member reads jobs"
on public.customer_jobs for select
to authenticated
using (
  customer_id = (select public.customer_portal_customer_id())
  or (select private.business_access(business_id, null))
);

drop policy if exists "customer reads own quotes" on public.customer_quotes;
drop policy if exists "staff read business quotes" on public.customer_quotes;
drop policy if exists "customer or member reads quotes" on public.customer_quotes;
create policy "customer or member reads quotes"
on public.customer_quotes for select
to authenticated
using (
  customer_id = (select public.customer_portal_customer_id())
  or (select private.business_access(business_id, null))
);

drop policy if exists "customer reads own invoices" on public.customer_invoices;
drop policy if exists "staff read business invoices" on public.customer_invoices;
drop policy if exists "customer or member reads invoices" on public.customer_invoices;
create policy "customer or member reads invoices"
on public.customer_invoices for select
to authenticated
using (
  customer_id = (select public.customer_portal_customer_id())
  or (select private.business_access(business_id, null))
);

drop policy if exists "customer reads own messages" on public.customer_messages;
drop policy if exists "staff read business messages" on public.customer_messages;
drop policy if exists "customer or member reads messages" on public.customer_messages;
create policy "customer or member reads messages"
on public.customer_messages for select
to authenticated
using (
  customer_id = (select public.customer_portal_customer_id())
  or (select private.business_access(business_id, null))
);

drop policy if exists "customer reads own files" on public.customer_files;
drop policy if exists "staff read business files" on public.customer_files;
drop policy if exists "customer or member reads files" on public.customer_files;
create policy "customer or member reads files"
on public.customer_files for select
to authenticated
using (
  (
    customer_id = (select public.customer_portal_customer_id())
    and available_to_customer = true
  )
  or (select private.business_access(business_id, null))
);

-- Preserve both customer message submission and member staging in one insert policy.
drop policy if exists "customer inserts own messages" on public.customer_messages;
drop policy if exists "staff stage business messages" on public.customer_messages;
drop policy if exists "customer or member inserts messages" on public.customer_messages;
create policy "customer or member inserts messages"
on public.customer_messages for insert
to authenticated
with check (
  (
    customer_id = (select public.customer_portal_customer_id())
    and created_by = (select auth.uid())
    and direction = 'customer_to_business'
    and status = 'pending_owner_review'
  )
  or (
    (select private.business_access(business_id, array['owner', 'administrator', 'staff']))
    and created_by = (select auth.uid())
    and direction = 'business_to_customer'
    and status = 'pending_owner_review'
  )
);

-- Preserve customer and member proof/event recording in one insert policy.
drop policy if exists "customer records own portal events" on public.customer_portal_events;
drop policy if exists "members record business portal events" on public.customer_portal_events;
drop policy if exists "customer or member records portal events" on public.customer_portal_events;
create policy "customer or member records portal events"
on public.customer_portal_events for insert
to authenticated
with check (
  auth_user_id = (select auth.uid())
  and external_action_occurred = false
  and (
    customer_id = (select public.customer_portal_customer_id())
    or (select private.business_access(business_id, null))
  )
);
