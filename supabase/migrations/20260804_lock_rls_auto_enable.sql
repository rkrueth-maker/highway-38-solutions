-- Lock the optional automatic RLS event-trigger helper against browser RPC execution.
-- Some clean Supabase branches do not include this production-only helper, so
-- migration replay must remain safe when the function is absent.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is null then
    return;
  end if;

  execute 'revoke execute on function public.rls_auto_enable() from public';
  execute 'revoke execute on function public.rls_auto_enable() from anon';
  execute 'revoke execute on function public.rls_auto_enable() from authenticated';
end
$$;
