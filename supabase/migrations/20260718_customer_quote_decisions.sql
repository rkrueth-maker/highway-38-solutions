-- Complete customer quote decisions: approve, request revision, or decline.
-- Every decision is customer-owned, version-checked, one-time, and records no external action.

create or replace function public.customer_portal_decide_quote(
  p_quote_id uuid,
  p_expected_version integer,
  p_decision text,
  p_notes text default null
)
returns public.customer_quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_quote public.customer_quotes;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_notes text := trim(coalesce(p_notes, ''));
  v_event_type text;
begin
  if v_decision not in ('approved', 'declined', 'revision_requested') then
    raise exception 'Decision must be approved, declined, or revision_requested';
  end if;
  if v_decision = 'revision_requested' and char_length(v_notes) < 3 then
    raise exception 'Describe the requested change';
  end if;
  if char_length(v_notes) > 2000 then
    raise exception 'Decision notes are limited to 2,000 characters';
  end if;

  v_customer_id := public.customer_portal_customer_id();
  if v_customer_id is null then
    raise exception 'Active customer account required';
  end if;

  select * into v_quote
  from public.customer_quotes
  where id = p_quote_id
    and customer_id = v_customer_id
  for update;

  if not found then
    raise exception 'Quote not found for this customer';
  end if;
  if v_quote.status <> 'presented' then
    raise exception 'Quote is not available for a customer decision';
  end if;
  if v_quote.version <> p_expected_version then
    raise exception 'Quote version changed; refresh before deciding';
  end if;
  if v_quote.customer_decision is not null then
    raise exception 'A customer decision is already recorded';
  end if;

  if v_decision = 'approved' and (
    coalesce(v_quote.amount, 0) <= 0 or
    nullif(trim(coalesce(v_quote.deliverables, '')), '') is null or
    nullif(trim(coalesce(v_quote.timing, '')), '') is null or
    nullif(trim(coalesce(v_quote.revision_allowance, '')), '') is null or
    nullif(trim(coalesce(v_quote.exclusions, '')), '') is null or
    nullif(trim(coalesce(v_quote.approval_consequence, '')), '') is null
  ) then
    raise exception 'Every required quote term must be posted before approval';
  end if;

  update public.customer_quotes
  set customer_decision = v_decision,
      decision_at = now(),
      status = case
        when v_decision = 'approved' then 'accepted'
        when v_decision = 'declined' then 'rejected'
        else status
      end,
      updated_at = now()
  where id = p_quote_id
  returning * into v_quote;

  v_event_type := case v_decision
    when 'approved' then 'QUOTE_APPROVAL_RECORDED'
    when 'declined' then 'QUOTE_DECLINE_RECORDED'
    else 'QUOTE_REVISION_REQUESTED'
  end;

  insert into public.customer_portal_events (
    customer_id, auth_user_id, event_type, record_type, record_id, result, external_action_occurred
  ) values (
    v_customer_id, auth.uid(), v_event_type, 'quote', p_quote_id, 'PASS', false
  );

  if v_notes <> '' then
    insert into public.customer_messages (
      customer_id, job_id, body, direction, status, created_by
    ) values (
      v_customer_id,
      v_quote.job_id,
      case v_decision
        when 'revision_requested' then 'Quote revision requested: ' || v_notes
        when 'declined' then 'Quote declined: ' || v_notes
        else 'Quote approval note: ' || v_notes
      end,
      'customer_to_business',
      'pending_owner_review',
      auth.uid()
    );
  end if;

  return v_quote;
end;
$$;

create or replace function public.customer_portal_approve_quote(
  p_quote_id uuid,
  p_expected_version integer
)
returns public.customer_quotes
language sql
security definer
set search_path = public
as $$
  select public.customer_portal_decide_quote(p_quote_id, p_expected_version, 'approved', null)
$$;

revoke all on function public.customer_portal_decide_quote(uuid, integer, text, text) from public;
revoke execute on function public.customer_portal_decide_quote(uuid, integer, text, text) from anon;
grant execute on function public.customer_portal_decide_quote(uuid, integer, text, text) to authenticated;

revoke all on function public.customer_portal_approve_quote(uuid, integer) from public;
revoke execute on function public.customer_portal_approve_quote(uuid, integer) from anon;
grant execute on function public.customer_portal_approve_quote(uuid, integer) to authenticated;
