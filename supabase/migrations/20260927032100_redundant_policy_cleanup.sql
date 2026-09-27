-- Remove only RLS policies that are strict subsets of an existing policy on the same table.
-- Effective access is preserved; this reduces duplicate policy evaluation.

drop policy if exists "staff read business customers" on public.customer_accounts;
drop policy if exists "staff read business files" on public.customer_files;
drop policy if exists "staff read business invoices" on public.customer_invoices;
drop policy if exists "staff read business jobs" on public.customer_jobs;
drop policy if exists "staff read business messages" on public.customer_messages;
drop policy if exists "staff stage business messages" on public.customer_messages;
drop policy if exists "staff read business quotes" on public.customer_quotes;
drop policy if exists "members record business portal events" on public.customer_portal_events;
drop policy if exists "fleet owners read zones" on public.fleet_job_zones;
drop policy if exists "fleet owners read provider connections" on public.fleet_provider_connections;
