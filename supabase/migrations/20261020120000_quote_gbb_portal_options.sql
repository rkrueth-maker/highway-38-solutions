-- WS1 Good-Better-Best: Portal A option capture (additive).
-- Adds option storage to customer_quotes and an optional p_option_index
-- parameter to customer_portal_decide_quote. Rollback: drop the two
-- columns and restore the 4-argument function from
-- 202608050945_northern_lakes_customer_portal_release.sql.
-- Backward compatible: quotes without options behave exactly as before,
-- and existing 4-argument RPC calls keep working (the 5-argument form
-- defaults p_option_index to null).

alter table public.customer_quotes
  add column if not exists options jsonb,
  add column if not exists selected_option text;

create or replace function public.customer_portal_decide_quote(
  p_quote_id uuid,
  p_expected_version integer,
  p_decision text,
  p_notes text default null,
  p_option_index integer default null
)
returns public.customer_quotes
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_quote public.customer_quotes;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_notes text := trim(coalesce(p_notes, ''));
  v_event_type text;
  v_selected_option text := null;
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

  select quote.* into v_quote
  from public.customer_quotes quote
  join public.customer_accounts account on account.id = quote.customer_id
  where quote.id = p_quote_id
    and quote.business_id = account.business_id
    and account.auth_user_id = (select auth.uid())
    and account.status = 'active'
    and account.portal_enabled = true
  for update of quote;

  if not found then raise exception 'Quote not found for this customer'; end if;
  if v_quote.status <> 'presented' then raise exception 'Quote is not available for a customer decision'; end if;
  if v_quote.version <> p_expected_version then raise exception 'Quote version changed; refresh before deciding'; end if;
  if v_quote.customer_decision is not null then raise exception 'A customer decision is already recorded'; end if;

  if v_decision = 'approved' and (
    coalesce(v_quote.amount, 0) <= 0
    or nullif(trim(coalesce(v_quote.deliverables, '')), '') is null
    or nullif(trim(coalesce(v_quote.timing, '')), '') is null
    or nullif(trim(coalesce(v_quote.revision_allowance, '')), '') is null
    or nullif(trim(coalesce(v_quote.exclusions, '')), '') is null
    or nullif(trim(coalesce(v_quote.approval_consequence, '')), '') is null
  ) then raise exception 'Every required quote term must be posted before approval'; end if;

  -- Option capture: when the quote carries Good/Better/Best options, an
  -- approval must name a valid option; its id is stored as the selection.
  if v_decision = 'approved' and v_quote.options is not null and jsonb_typeof(v_quote.options) = 'array' and jsonb_array_length(v_quote.options) > 0 then
    if p_option_index is null or p_option_index < 0 or p_option_index >= jsonb_array_length(v_quote.options) then
      raise exception 'Choose which option you are approving';
    end if;
    v_selected_option := nullif(trim(coalesce(v_quote.options -> p_option_index ->> 'id', '')), '');
    if v_selected_option is null then
      v_selected_option := case p_option_index when 0 then 'good' when 1 then 'better' when 2 then 'best' else 'option-' || p_option_index end;
    end if;
  end if;

  update public.customer_quotes
  set customer_decision = v_decision,
      decision_at = now(),
      selected_option = case when v_decision = 'approved' then v_selected_option else selected_option end,
      status = case when v_decision = 'approved' then 'accepted' when v_decision = 'declined' then 'rejected' else status end,
      updated_at = now()
  where id = p_quote_id
  returning * into v_quote;

  v_event_type := case v_decision when 'approved' then 'QUOTE_APPROVAL_RECORDED' when 'declined' then 'QUOTE_DECLINE_RECORDED' else 'QUOTE_REVISION_REQUESTED' end;

  insert into public.customer_portal_events (business_id, customer_id, auth_user_id, event_type, record_type, record_id, result, external_action_occurred)
  values (v_quote.business_id, v_quote.customer_id, auth.uid(), v_event_type, 'quote', p_quote_id, 'PASS', false);

  if v_notes <> '' then
    insert into public.customer_messages (business_id, customer_id, job_id, body, direction, status, created_by)
    values (
      v_quote.business_id,
      v_quote.customer_id,
      v_quote.job_id,
      case v_decision when 'revision_requested' then 'Quote revision requested: ' || v_notes when 'declined' then 'Quote declined: ' || v_notes else 'Quote approval note: ' || v_notes end,
      'customer_to_business',
      'pending_owner_review',
      auth.uid()
    );
  end if;

  return v_quote;
end;
$$;

revoke all on function public.customer_portal_decide_quote(uuid, integer, text, text, integer) from public;
revoke execute on function public.customer_portal_decide_quote(uuid, integer, text, text, integer) from anon;
grant execute on function public.customer_portal_decide_quote(uuid, integer, text, text, integer) to authenticated;
