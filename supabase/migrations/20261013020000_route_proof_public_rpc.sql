-- H38 Route Manager: public, token-scoped proof-of-service read.
--
-- Problem: the Route Manager proof modal generates a shareable link
-- (?businessKey=<key>&routeProof=<token>) and promises "Anyone with this
-- link can view the completion summary", but the only data path was the
-- authenticated Office snapshot (business_records has no anon grant and
-- RLS requires an active membership). Anonymous customers hit the Office
-- sign-in wall and never saw the proof.
--
-- Fix: public.h38_route_proof(p_business_key, p_token) — a SECURITY
-- DEFINER read that treats the route's Proof Token as the capability
-- (same pattern as the h38-task-complete completion token: the token
-- grants exactly one thing). It resolves the business from its public
-- business_key, finds the ONE route in that business whose payload
-- 'Proof Token' matches, and returns ONLY the proof-of-service fields:
-- business display name, route name/date/status, and per-stop customer
-- name, address, status, arrived/completed times, ordered by stop
-- order. It never returns the business id, record keys, customer ids,
-- photos, notes, GPS check-in coordinates, crew assignments, or any
-- other collection. Unknown key/token returns {ok:false} — the caller
-- cannot distinguish a bad key from a bad token.
--
-- The anon EXECUTE grant is deliberate and reviewed: the function is
-- read-only, input-validated, length-capped, and scoped to a single
-- route by an unguessable per-route token the owner chose to share.

create or replace function public.h38_route_proof(
  p_business_key text,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  v_key text := lower(btrim(coalesce(p_business_key, '')));
  v_token text := btrim(coalesce(p_token, ''));
  v_business_id uuid;
  v_business_name text;
  v_route jsonb;
  v_route_id text;
  v_route_status text;
  v_stops jsonb;
  v_total integer := 0;
  v_done integer := 0;
begin
  if v_key = '' or v_key !~ '^[a-z0-9][a-z0-9-]{0,62}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_link');
  end if;
  if length(v_token) < 8 or length(v_token) > 80 or v_token !~ '^[A-Za-z0-9_-]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_link');
  end if;

  select b.id, b.display_name
    into v_business_id, v_business_name
  from public.businesses b
  where b.business_key = v_key
    and b.status = 'active'
  limit 1;
  if v_business_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select r.payload
    into v_route
  from public.business_records r
  where r.business_id = v_business_id
    and r.collection = 'routes'
    and r.record_status = 'active'
    and r.payload ->> 'Proof Token' = v_token
  limit 1;
  if v_route is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  v_route_status := coalesce(v_route ->> 'Status', '');
  if v_route_status ~* '^(deleted|void|cancelled)$' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_route_id := coalesce(v_route ->> 'Route ID', '');
  if v_route_id = '' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'order', coalesce(nullif(s.payload ->> 'Stop Order', '')::integer, 0),
        'name', coalesce(s.payload ->> 'Customer Name', ''),
        'address', coalesce(s.payload ->> 'Address', ''),
        'status', lower(coalesce(nullif(s.payload ->> 'Status', ''), 'pending')),
        'arrivedAt', coalesce(s.payload ->> 'Arrived At', ''),
        'completedAt', coalesce(s.payload ->> 'Completed At', '')
      ) order by coalesce(nullif(s.payload ->> 'Stop Order', '')::integer, 0), s.record_key
    ), '[]'::jsonb),
    count(*),
    count(*) filter (where lower(coalesce(s.payload ->> 'Status', '')) = 'done')
    into v_stops, v_total, v_done
  from public.business_records s
  where s.business_id = v_business_id
    and s.collection = 'routeStops'
    and s.record_status = 'active'
    and s.payload ->> 'Route ID' = v_route_id
    and lower(coalesce(s.payload ->> 'Status', '')) <> 'deleted';

  return jsonb_build_object(
    'ok', true,
    'proof', jsonb_build_object(
      'businessName', coalesce(v_business_name, ''),
      'routeName', coalesce(v_route ->> 'Route Name', ''),
      'routeDate', coalesce(v_route ->> 'Route Date', ''),
      'status', v_route_status,
      'totalStops', coalesce(v_total, 0),
      'doneStops', coalesce(v_done, 0),
      'stops', coalesce(v_stops, '[]'::jsonb)
    )
  );
end
$$;

revoke all on function public.h38_route_proof(text, text) from public;
grant execute on function public.h38_route_proof(text, text) to anon, authenticated;

comment on function public.h38_route_proof(text, text)
  is 'Public token-scoped proof-of-service read for Route Manager share links. Returns only the one route''s completion summary (stop names/addresses/times/status) for the route whose Proof Token is presented. Reviewed anon SECURITY DEFINER exception: read-only, token is the capability.';
