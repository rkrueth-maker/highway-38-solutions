-- Server-authoritative lifecycle economics and truth-first H38 Buy Score.
-- Unknown costs/economics stay NULL; no missing value is silently treated as zero.

create or replace function public.h38_deal_engine_recalculate_queue()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  acquisition numeric;
  selling_costs numeric;
  target_multiplier numeric;
  actual_selling_costs numeric;
begin
  if new.status = 'purchased' and new.purchased_at is null then new.purchased_at := now(); end if;
  if new.status = 'listed' and new.listed_at is null then new.listed_at := now(); end if;
  if new.status = 'sold' and new.sold_at is null then new.sold_at := now(); end if;

  new.projected_profit := null;
  new.projected_roi_percent := null;
  new.projected_margin_percent := null;
  new.break_even_price := null;
  new.max_buy_price := null;

  if new.unit_buy_price is not null
     and new.expected_sale_price is not null
     and new.coupon_amount is not null
     and new.rebate_amount is not null
     and new.sales_tax is not null
     and new.travel_cost is not null
     and new.marketplace_fee is not null
     and new.payment_fee is not null
     and new.outbound_shipping is not null
     and new.packing_cost is not null then
    acquisition := (new.quantity * new.unit_buy_price) - new.coupon_amount - new.rebate_amount
                   + new.sales_tax + new.travel_cost;
    selling_costs := new.marketplace_fee + new.payment_fee + new.outbound_shipping + new.packing_cost;
    new.break_even_price := round((acquisition + selling_costs)::numeric, 2);
    new.projected_profit := round((new.expected_sale_price - selling_costs - acquisition)::numeric, 2);
    if acquisition > 0 then
      new.projected_roi_percent := round(((new.projected_profit / acquisition) * 100)::numeric, 2);
    end if;
    if new.expected_sale_price > 0 then
      new.projected_margin_percent := round(((new.projected_profit / new.expected_sale_price) * 100)::numeric, 2);
    end if;
    if new.target_roi_percent is not null and new.quantity > 0 and new.target_roi_percent > -100 then
      target_multiplier := 1 + (new.target_roi_percent / 100);
      if target_multiplier > 0 then
        new.max_buy_price := round((((new.expected_sale_price - selling_costs) / target_multiplier
          + new.coupon_amount + new.rebate_amount - new.sales_tax - new.travel_cost) / new.quantity)::numeric, 2);
      end if;
    end if;
  end if;

  new.realized_profit := null;
  new.realized_roi_percent := null;
  if new.actual_cost is not null
     and new.actual_sale_price is not null
     and new.travel_cost is not null
     and new.actual_marketplace_fee is not null
     and new.actual_payment_fee is not null
     and new.actual_shipping is not null
     and new.actual_packing_cost is not null then
    actual_selling_costs := new.actual_marketplace_fee + new.actual_payment_fee + new.actual_shipping + new.actual_packing_cost;
    new.realized_profit := round((new.actual_sale_price - actual_selling_costs - new.actual_cost - new.travel_cost)::numeric, 2);
    if (new.actual_cost + new.travel_cost) > 0 then
      new.realized_roi_percent := round(((new.realized_profit / (new.actual_cost + new.travel_cost)) * 100)::numeric, 2);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists h38_deal_engine_queue_recalculate on public.deal_engine_sourcing_queue;
create trigger h38_deal_engine_queue_recalculate
before insert or update on public.deal_engine_sourcing_queue
for each row execute function public.h38_deal_engine_recalculate_queue();

-- Re-run the calculation against existing rows without changing user-entered values.
update public.deal_engine_sourcing_queue
set updated_at = updated_at;

create or replace view public.deal_engine_opportunity_intelligence
with (security_invoker = true)
as
with evidence as (
  select
    household_id,
    canonical_key,
    count(*)::integer as evidence_count,
    count(*) filter (where evidence_type = 'sold')::integer as sold_count,
    count(*) filter (where evidence_type = 'active')::integer as active_count,
    percentile_cont(0.5) within group (order by observed_price)
      filter (where evidence_type = 'sold' and observed_price is not null) as sold_median_price,
    min(observed_price) filter (where evidence_type = 'sold') as sold_low_price,
    max(observed_price) filter (where evidence_type = 'sold') as sold_high_price,
    max(observed_at) as market_evidence_at,
    avg(confidence_score) filter (where evidence_type = 'sold') as sold_evidence_confidence
  from public.deal_engine_market_evidence
  group by household_id, canonical_key
), base as (
  select
    o.*,
    coalesce(e.evidence_count, 0) as market_evidence_count,
    coalesce(e.sold_count, 0) as sold_count,
    coalesce(e.active_count, 0) as active_comp_count,
    e.sold_median_price::numeric as sold_median_price,
    e.sold_low_price,
    e.sold_high_price,
    e.market_evidence_at,
    e.sold_evidence_confidence,
    greatest(0, extract(epoch from (now() - o.observed_at)) / 3600.0) as age_hours,
    least(20::numeric, greatest(0::numeric, o.confidence_score * 0.20)) as confidence_points,
    case
      when now() - o.observed_at <= interval '12 hours' then 15::numeric
      when now() - o.observed_at <= interval '24 hours' then 13::numeric
      when now() - o.observed_at <= interval '48 hours' then 10::numeric
      when now() - o.observed_at <= interval '96 hours' then 6::numeric
      when now() - o.observed_at <= interval '168 hours' then 3::numeric
      else 0::numeric
    end as freshness_points,
    case
      when coalesce(e.sold_count,0) >= 10 then 15::numeric
      when coalesce(e.sold_count,0) >= 5 then 12::numeric
      when coalesce(e.sold_count,0) >= 3 then 9::numeric
      when coalesce(e.sold_count,0) >= 1 then 5::numeric
      else 0::numeric
    end as demand_points,
    case
      when o.distance_miles is null then 0::numeric
      when o.distance_miles <= 5 then 10::numeric
      when o.distance_miles <= 15 then 8::numeric
      when o.distance_miles <= 30 then 6::numeric
      when o.distance_miles <= 50 then 3::numeric
      else 0::numeric
    end as distance_points,
    case
      when o.estimated_profit is null or o.estimated_profit <= 0 then 0::numeric
      when o.estimated_profit >= 100 then 25::numeric
      else least(25::numeric, o.estimated_profit / 4)
    end as profit_points,
    case
      when o.roi_percent is null or o.roi_percent <= 0 then 0::numeric
      when o.roi_percent >= 100 then 15::numeric
      else least(15::numeric, o.roi_percent * 0.15)
    end as roi_points
  from public.deal_engine_observations o
  left join evidence e
    on e.household_id = o.household_id and e.canonical_key = o.canonical_key
  where o.active = true
), scored as (
  select
    b.*,
    round((b.confidence_points + b.freshness_points + b.demand_points + b.distance_points + b.profit_points + b.roi_points)::numeric, 1) as h38_buy_score,
    (35
      + case when b.market_evidence_count > 0 then 15 else 0 end
      + case when b.distance_miles is not null then 10 else 0 end
      + case when b.estimated_profit is not null then 25 else 0 end
      + case when b.roi_percent is not null then 15 else 0 end
    )::integer as proof_coverage_percent
  from base b
)
select
  s.*,
  case
    when s.observed_price is null then 'NEEDS_MORE_PROOF'
    when s.estimated_profit is not null and s.estimated_profit <= 0 then 'PASS'
    when s.roi_percent is not null and s.roi_percent <= 0 then 'PASS'
    when s.estimated_profit > 0 and s.roi_percent > 0
         and s.proof_coverage_percent >= 75 and s.confidence_score >= 70 and s.age_hours <= 48 then 'BUY_READY'
    when s.age_hours > 48 then 'WATCH'
    when s.sold_count > 0 and (s.estimated_profit is null or s.roi_percent is null) then 'CHECK_ECONOMICS'
    when s.product_area = 'penny' or upper(s.evidence_status) like '%VERIFY%' then 'CHECK_IN_STORE'
    else 'NEEDS_MORE_PROOF'
  end as h38_action,
  jsonb_build_object(
    'confidence', jsonb_build_object('points', round(s.confidence_points,1), 'max',20,'known',true),
    'freshness', jsonb_build_object('points', round(s.freshness_points,1), 'max',15,'known',true,'age_hours',round(s.age_hours::numeric,1)),
    'demand', jsonb_build_object('points', round(s.demand_points,1), 'max',15,'known',s.market_evidence_count > 0,'sold_count',s.sold_count,'active_count',s.active_comp_count,'sold_median_price',s.sold_median_price),
    'distance', jsonb_build_object('points', round(s.distance_points,1), 'max',10,'known',s.distance_miles is not null,'miles',s.distance_miles),
    'profit', jsonb_build_object('points', round(s.profit_points,1), 'max',25,'known',s.estimated_profit is not null,'profit',s.estimated_profit),
    'roi', jsonb_build_object('points', round(s.roi_points,1), 'max',15,'known',s.roi_percent is not null,'roi_percent',s.roi_percent)
  ) as h38_score_explanation
from scored s;

grant select on public.deal_engine_opportunity_intelligence to authenticated;
