with target as (
  select b.id as business_id,
         coalesce(
           (select bm.auth_user_id from public.business_memberships bm where bm.business_id=b.id and bm.status='active' and bm.role='owner' and bm.auth_user_id is not null order by bm.created_at limit 1),
           (select bm.auth_user_id from public.business_memberships bm where bm.business_id=b.id and bm.status='active' and bm.auth_user_id is not null order by bm.created_at limit 1)
         ) as actor_id
  from public.businesses b where b.business_key='highway38'
)
insert into public.business_records (business_id,collection,record_key,payload,record_status,created_by,updated_by)
select business_id,'contractorPricingPolicy','H38-PRICING-POLICY-2026-08-12',
$$
{
  "version":"2026-08-12",
  "ownerOnly":true,
  "strategy":"Installed assembly rate is the primary estimating/selling basis; labor hours and component costs remain visible underneath for audit and calibration.",
  "customerQuantityRule":"Customer quantity is net installed/measured quantity. Material scrap/waste changes internal purchase quantity only.",
  "directCostStack":["raw material cost","material scrap/waste","labor hours multiplied by loaded labor cost","equipment","consumables","delivery","disposal/haul","subcontract cost when applicable"],
  "sellPriceStack":["direct job cost","overhead recovery","profit"],
  "rules":[
    "Do not calculate selling price as a blind multiplier on raw material alone.",
    "Do not combine scrap percentage with markup or margin.",
    "Do not hide labor/equipment assumptions inside an unexplained AI rate when an installed assembly exists.",
    "Price Book/installed assembly first; current research second; unresolved values remain owner review required.",
    "Actual completed-job results may calibrate labor hours and assembly rates only after owner review."
  ],
  "unsetOwnerInputs":["loaded labor cost by labor class","overhead recovery method/target","profit or margin target by work type","small-job minimum charge policy","subcontractor markup policy"],
  "automaticApproval":false,
  "automaticFinancialCommitment":false
}
$$::jsonb,
'active',actor_id,actor_id
from target where actor_id is not null
on conflict (business_id,collection,record_key) do update set
 payload=excluded.payload,
 record_status='active',
 updated_by=excluded.updated_by,
 updated_at=now(),
 archived_at=null;
