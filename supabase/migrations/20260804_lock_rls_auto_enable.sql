-- Lock the automatic RLS event trigger helper against browser RPC execution.
-- The event trigger itself remains installed for database DDL protection.

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
