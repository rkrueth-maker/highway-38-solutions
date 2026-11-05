-- Trial AI allowance (Rick, 2026-11-05): "we will give everyone a free trial
-- that is self set up with the minimum ai usage."
--
-- Per-tenant allowance, one source of truth:
--   * trial tenants (business_trials row, not converted): 250 AI actions for
--     the WHOLE trial period, counted on ai_usage_log since trial_start.
--   * every other tenant: the standard 5,000 AI actions per month, counted
--     since the 1st — unchanged.
-- The shared aiCapCheck gate in the AI edge functions enforces the trial
-- branch; this state function exposes the same numbers to the app and to
-- verification. Converted trials fall back to the standard monthly meter
-- (their allowance "resets in full" on keeping the Office).

create or replace function public.ai_allowance_state(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  v_trial record;
  v_used integer;
  v_month_start timestamptz := date_trunc('month', now());
begin
  select trial_start, trial_end, status into v_trial
  from public.business_trials
  where business_id = p_business_id;

  if found and v_trial.status <> 'converted' then
    select count(*)::integer into v_used
    from public.ai_usage_log
    where business_id = p_business_id
      and created_at >= v_trial.trial_start;
    return jsonb_build_object(
      'isTrial', true,
      'scope', 'trial-total',
      'limit', 250,
      'used', v_used,
      'remaining', greatest(0, 250 - v_used),
      'exhausted', v_used >= 250
    );
  end if;

  select count(*)::integer into v_used
  from public.ai_usage_log
  where business_id = p_business_id
    and created_at >= v_month_start;
  return jsonb_build_object(
    'isTrial', false,
    'scope', 'monthly',
    'limit', 5000,
    'used', v_used,
    'remaining', greatest(0, 5000 - v_used),
    'exhausted', v_used >= 5000
  );
end
$$;

revoke all on function public.ai_allowance_state(uuid) from public;
revoke all on function public.ai_allowance_state(uuid) from anon;
grant execute on function public.ai_allowance_state(uuid) to authenticated;
grant execute on function public.ai_allowance_state(uuid) to service_role;

-- my_trial_state: add the AI allowance fields the Office banner shows.
create or replace function public.my_trial_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_row record;
  v_ai jsonb;
begin
  if v_user is null then
    return jsonb_build_object('isTrial', false);
  end if;

  select trial.business_id, business.business_key, business.display_name,
         trial.trial_start, trial.trial_end, trial.status,
         trial.keep_office_requested_at
    into v_row
  from public.business_trials trial
  join public.businesses business on business.id = trial.business_id
  join public.business_memberships membership
    on membership.business_id = trial.business_id
   and membership.auth_user_id = v_user
   and membership.status = 'active'
   and membership.role in ('owner', 'administrator')
  order by trial.trial_start desc
  limit 1;

  if not found then
    return jsonb_build_object('isTrial', false);
  end if;

  v_ai := public.ai_allowance_state(v_row.business_id);

  return jsonb_build_object(
    'isTrial', true,
    'businessId', v_row.business_id,
    'businessKey', v_row.business_key,
    'displayName', v_row.display_name,
    'trialStart', v_row.trial_start,
    'trialEnd', v_row.trial_end,
    'daysLeft', greatest(0, ceil(extract(epoch from (v_row.trial_end - now())) / 86400.0))::integer,
    'expired', v_row.status <> 'converted' and v_row.trial_end <= now(),
    'converted', v_row.status = 'converted',
    'keepOfficeRequestedAt', v_row.keep_office_requested_at,
    'aiUsed', (v_ai ->> 'used')::integer,
    'aiAllowance', (v_ai ->> 'limit')::integer,
    'aiExhausted', (v_ai ->> 'exhausted')::boolean
  );
end
$$;

revoke all on function public.my_trial_state() from public;
revoke all on function public.my_trial_state() from anon;
grant execute on function public.my_trial_state() to authenticated;

-- request_keep_office: the owner task now names the crew-size bands so the
-- follow-up conversation starts from the right band.
create or replace function public.request_keep_office()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_trial record;
  v_h38_id uuid;
  v_task_key text;
  v_now timestamptz := now();
begin
  if v_user is null then
    raise exception 'Authentication is required.';
  end if;

  select trial.business_id, trial.email, trial.trial_end,
         business.business_key, business.display_name
    into v_trial
  from public.business_trials trial
  join public.businesses business on business.id = trial.business_id
  join public.business_memberships membership
    on membership.business_id = trial.business_id
   and membership.auth_user_id = v_user
   and membership.status = 'active'
   and membership.role in ('owner', 'administrator')
  order by trial.trial_start desc
  limit 1;

  if not found then
    raise exception 'No trial Office is attached to this account.';
  end if;

  update public.business_trials
     set keep_office_requested_at = coalesce(keep_office_requested_at, v_now),
         updated_at = v_now
   where business_id = v_trial.business_id;

  select id into v_h38_id from public.businesses where business_key = 'highway38';
  v_task_key := 'TRIAL-KEEP-' || upper(v_trial.business_key);

  if v_h38_id is not null then
    insert into public.business_records (
      business_id, collection, record_key, payload, created_by, updated_by
    ) values (
      v_h38_id,
      'tasks',
      v_task_key,
      jsonb_build_object(
        'Task ID', v_task_key,
        'Task Title', 'Keep the Office — trial wants to stay: ' || v_trial.display_name,
        'Task Type', 'Trial Upgrade',
        'Task Domain', 'trial.upgrade',
        'Status', 'Open',
        'Priority', 'High',
        'Assigned Role', 'Owner',
        'Assigned User ID', '',
        'Business ID', v_h38_id::text,
        'Customer ID', '',
        'Linked Record ID', v_trial.business_id::text,
        'Linked Record Type', 'Trial Business',
        'Source Record ID', v_trial.business_id::text,
        'Source Actor User ID', v_user::text,
        'Instructions', 'Trial business "' || v_trial.display_name || '" (' || v_trial.business_key || ') asked to Keep the Office. Contact: ' || v_trial.email || '. Trial ends ' || to_char(v_trial.trial_end, 'YYYY-MM-DD') || '. Set up their subscription with them: up to 10 users $149/mo (founding $99/mo locked for life while spots last), 11–25 users $249/mo, 26–50 users $399/mo, 50+ custom. Their first paid month includes their website (built from their trade''s sample, with their logo); they buy their own domain and we connect it.',
        'Source Event', 'trial.keep_office',
        'Auto Managed', true,
        'External Action Occurred', false,
        'Created Time', v_now,
        'Updated Time', v_now,
        'Record Version', 1
      ),
      v_user,
      v_user
    )
    on conflict (business_id, collection, record_key) do nothing;
  end if;

  return jsonb_build_object(
    'status', 'PASS',
    'businessId', v_trial.business_id,
    'keepOfficeRequestedAt', coalesce(
      (select keep_office_requested_at from public.business_trials where business_id = v_trial.business_id),
      v_now
    )
  );
end
$$;

revoke all on function public.request_keep_office() from public;
revoke all on function public.request_keep_office() from anon;
grant execute on function public.request_keep_office() to authenticated;
