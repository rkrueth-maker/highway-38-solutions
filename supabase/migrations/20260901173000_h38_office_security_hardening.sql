-- Highway 38 Business Office security hardening
-- Purpose: reduce exposed SECURITY DEFINER surface without changing supported Office/customer workflows.
--
-- The platform-owner tenant management wrappers remain callable by authenticated users because they
-- perform explicit owner checks inside their private implementation path. Customer portal decision
-- RPCs remain callable because they enforce auth.uid()-bound customer ownership before changing data.
-- This migration tightens only helper functions that should not be broadly executable and locks the
-- reseller discovery sanitizer search_path reported by the Supabase advisor.

begin;

-- Prevent accidental anonymous/public execution of Office RPCs. Authenticated access is retained
-- where the function body contains its own authorization/ownership checks.
revoke execute on function public.activate_client_business(uuid) from anon, public;
revoke execute on function public.client_tenant_installer_state() from anon, public;
revoke execute on function public.provision_client_business(text, text, text, text, text, jsonb, text[], text, text) from anon, public;
revoke execute on function public.suspend_client_business(uuid, text) from anon, public;
revoke execute on function public.customer_portal_customer_id() from anon, public;
revoke execute on function public.customer_portal_decide_quote(uuid, integer, text, text) from anon, public;
revoke execute on function public.customer_portal_approve_quote(uuid, integer) from anon, public;

-- Preserve the intended authenticated paths explicitly.
grant execute on function public.activate_client_business(uuid) to authenticated;
grant execute on function public.client_tenant_installer_state() to authenticated;
grant execute on function public.provision_client_business(text, text, text, text, text, jsonb, text[], text, text) to authenticated;
grant execute on function public.suspend_client_business(uuid, text) to authenticated;
grant execute on function public.customer_portal_customer_id() to authenticated;
grant execute on function public.customer_portal_decide_quote(uuid, integer, text, text) to authenticated;
grant execute on function public.customer_portal_approve_quote(uuid, integer) to authenticated;

-- Advisor hardening: make function lookup deterministic and remove mutable search_path risk.
alter function public.sanitize_reseller_store_discovery_tiles() set search_path = pg_catalog, public;

commit;
