-- Run only against a local database or isolated Supabase branch.
begin;
create or replace function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$ begin if not coalesce(condition,false) then raise exception 'security acceptance failed: %',message; end if; end $$;
select pg_temp.assert_true(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity),'every public table must have RLS enabled');
select pg_temp.assert_true(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and not ('security_invoker=true'=any(coalesce(c.reloptions,array[]::text[])))),'every public view must use security_invoker=true');
select pg_temp.assert_true(not exists(select 1 from storage.buckets where public),'every storage bucket must remain private');
select pg_temp.assert_true(
  (select count(*)=3 from storage.buckets where id in ('business-office','business-office-files','customer-portal') and not public),
  'all required private storage buckets must exist'
);
select pg_temp.assert_true(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,array[]::text[])) setting where setting like 'search_path=%')),'every public SECURITY DEFINER function must pin search_path');
select pg_temp.assert_true(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')),'anonymous users must not execute public SECURITY DEFINER functions');
select pg_temp.assert_true(
  (select array_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' order by p.proname,pg_get_function_identity_arguments(p.oid))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated',p.oid,'EXECUTE'))
  = array[
    'activate_client_business(p_business_id uuid)',
    'business_office_apply_import(p_run_id uuid)',
    'business_office_clock_in(p_business_id uuid, p_job_id text, p_task_id text, p_notes text)',
    'business_office_clock_out(p_business_id uuid, p_notes text)',
    'business_office_edit_time_entry(p_business_id uuid, p_time_entry_id text, p_reason text, p_start_time timestamp with time zone, p_end_time timestamp with time zone, p_break_minutes numeric, p_job_id text, p_task_id text, p_notes text)',
    'business_office_employee_update_task(p_business_id uuid, p_task_id text, p_status text, p_note text)',
    'business_office_employee_workspace(p_business_id uuid)',
    'business_office_invite_employee(p_business_id uuid, p_email text, p_display_name text, p_job_title text)',
    'business_office_quote_learning_profile(p_business_id uuid)',
    'business_office_stage_import(p_business_id uuid, p_source_name text, p_entity_type text, p_rows jsonb)',
    'business_office_team_directory(p_business_id uuid)',
    'business_office_time_admin(p_business_id uuid, p_limit integer)',
    'business_office_time_state(p_business_id uuid)',
    'client_tenant_installer_state()',
    'customer_portal_approve_quote(p_quote_id uuid, p_expected_version integer)',
    'customer_portal_customer_id()',
    'customer_portal_decide_quote(p_quote_id uuid, p_expected_version integer, p_decision text, p_notes text)',
    'provision_client_business(p_business_key text, p_legal_name text, p_display_name text, p_owner_email text, p_timezone text, p_brand_config jsonb, p_module_keys text[], p_package_id text, p_support_email text)',
    'suspend_client_business(p_business_id uuid, p_reason text)'
  ]::text[],
  'authenticated SECURITY DEFINER functions must match the reviewed RPC allowlist'
);
select pg_temp.assert_true(
  not exists (
    select 1 from unnest(array[
      'reseller_hunt_cache','reseller_hunt_cache_meta',
      'reseller_store_discovery_snapshots','reseller_store_discovery_tiles'
    ]) table_name
    where not exists (
      select 1 from pg_policies p
      where p.schemaname='public' and p.tablename=table_name
        and p.policyname='deny direct client access'
        and p.cmd='ALL'
        and p.qual='false' and p.with_check='false'
    )
  ),
  'service-only tables must explicitly deny direct client access'
);
select pg_temp.assert_true(
  not exists (
    select 1 from unnest(array[
      'business_employee_profiles_created_by_idx','coupon_list_items_list_id_idx',
      'coupon_list_items_user_id_idx','coupon_receipts_user_id_idx',
      'coupon_shopping_lists_user_id_idx','coupon_watch_rules_user_id_idx',
      'reseller_deals_updated_by_idx'
    ]) index_name
    where not exists (
      select 1 from pg_class i join pg_namespace n on n.oid=i.relnamespace
      join pg_index x on x.indexrelid=i.oid
      where n.nspname='public' and i.relname=index_name and x.indisvalid
    )
  ),
  'reported foreign keys must have valid covering indexes'
);
select pg_temp.assert_true(
  not exists (
    select 1 from pg_policies
    where schemaname='public' and policyname in (
      'employees read own profile','administrators manage employee profiles',
      'staff read business customers','staff read business files',
      'staff read business invoices','staff read business jobs',
      'staff read business messages','staff read business quotes',
      'staff stage business messages','members record business portal events'
    )
  ),
  'redundant permissive policies must remain retired'
);
rollback;
