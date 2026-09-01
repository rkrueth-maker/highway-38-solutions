-- Read-only regression checks for the H38 Office hardening migration.
-- Run after applying 20260901173000_h38_office_security_hardening.sql in a disposable/test environment.

select
  has_function_privilege('anon', 'public.activate_client_business(uuid)', 'EXECUTE') as anon_activate_client_business,
  has_function_privilege('authenticated', 'public.activate_client_business(uuid)', 'EXECUTE') as authenticated_activate_client_business,
  has_function_privilege('anon', 'public.provision_client_business(text,text,text,text,text,jsonb,text[],text,text)', 'EXECUTE') as anon_provision_client_business,
  has_function_privilege('authenticated', 'public.provision_client_business(text,text,text,text,text,jsonb,text[],text,text)', 'EXECUTE') as authenticated_provision_client_business,
  has_function_privilege('anon', 'public.customer_portal_decide_quote(uuid,integer,text,text)', 'EXECUTE') as anon_customer_portal_decide_quote,
  has_function_privilege('authenticated', 'public.customer_portal_decide_quote(uuid,integer,text,text)', 'EXECUTE') as authenticated_customer_portal_decide_quote;

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'sanitize_reseller_store_discovery_tiles';
