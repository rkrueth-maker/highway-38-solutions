-- Run only against a local database or isolated Supabase branch.
begin;
create or replace function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$ begin if not coalesce(condition,false) then raise exception 'security acceptance failed: %',message; end if; end $$;
select pg_temp.assert_true(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity),'every public table must have RLS enabled');
select pg_temp.assert_true(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and not ('security_invoker=true'=any(coalesce(c.reloptions,array[]::text[])))),'every public view must use security_invoker=true');
select pg_temp.assert_true(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,array[]::text[])) setting where setting like 'search_path=%')),'every public SECURITY DEFINER function must pin search_path');
rollback;
