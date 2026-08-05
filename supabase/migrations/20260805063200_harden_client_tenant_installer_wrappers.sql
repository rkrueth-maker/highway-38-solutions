-- The browser-facing installer RPCs execute with controlled function authority.
-- The private implementations still verify auth.uid() is the active Highway 38 Owner.

create or replace function public.provision_client_business(
  p_business_key text,
  p_legal_name text,
  p_display_name text,
  p_owner_email text,
  p_timezone text default 'America/Chicago',
  p_brand_config jsonb default '{}'::jsonb,
  p_module_keys text[] default null,
  p_package_id text default 'standard-business-office',
  p_support_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication is required.';
  end if;
  return private.provision_client_business_internal(
    v_actor, p_business_key, p_legal_name, p_display_name, p_owner_email,
    p_timezone, p_brand_config, p_module_keys, p_package_id, p_support_email
  );
end
$$;

create or replace function public.activate_client_business(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication is required.';
  end if;
  return private.activate_client_business_internal(v_actor, p_business_id);
end
$$;

revoke all on function public.provision_client_business(text,text,text,text,text,jsonb,text[],text,text) from public;
revoke all on function public.provision_client_business(text,text,text,text,text,jsonb,text[],text,text) from anon;
grant execute on function public.provision_client_business(text,text,text,text,text,jsonb,text[],text,text) to authenticated;

revoke all on function public.activate_client_business(uuid) from public;
revoke all on function public.activate_client_business(uuid) from anon;
grant execute on function public.activate_client_business(uuid) to authenticated;
