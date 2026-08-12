with target as (
  select b.id as business_id,
         coalesce(
           (select bm.auth_user_id from public.business_memberships bm where bm.business_id=b.id and bm.status='active' and bm.role='owner' and bm.auth_user_id is not null order by bm.created_at limit 1),
           (select bm.auth_user_id from public.business_memberships bm where bm.business_id=b.id and bm.status='active' and bm.auth_user_id is not null order by bm.created_at limit 1)
         ) as actor_id
  from public.businesses b
  where b.business_key='highway38'
), records(collection,record_key,payload) as (
  values
  ('contractorCostChecklists','MASTER-2026-08-12', $$
  {
    "version":"2026-08-12",
    "ownerOnly":true,
    "automaticAdd":false,
    "automaticApproval":false,
    "automaticCustomerVisibility":false,
    "purpose":"Owner-only deterministic cost-gap reference. Check only costs supported by actual scope/site conditions; never invent customer scope.",
    "globalRules":[
      "Material purchase quantities use at least 10 percent waste/scrap; customer installed quantity remains the measured net quantity.",
      "Do not duplicate a cost already represented by an installed assembly or existing quote line.",
      "Use Price Book first; current researched pricing second; unresolved pricing remains owner review required.",
      "Any permit, engineering, subcontract, access, winter, delivery, disposal or equipment cost is conditional on actual project need."
    ],
    "trades":{
      "GENERAL":["mobilization","material delivery/unloading","fasteners and small consumables","site/floor/property protection","cleanup","debris handling","dump or disposal fees","equipment or rental","access/travel costs","permit or inspection when applicable","subcontractor costs when applicable","restoration","jobsite support/overhead when not otherwise represented"],
      "DRYWALL":["drywall board","screws","paper/mesh tape","joint compound","corner bead/trim","sanding consumables","ceiling lift/scaffold when needed","floor/property protection","primer/paint only when in scope","cutoff/debris disposal"],
      "INSULATION":["insulation material","air sealing","vapor retarder when assembly requires it","tape/caulk/sealants","supports/staples","PPE","access/lift for ceiling work","removal/disposal of old insulation when in scope"],
      "FRAMING":["studs and plates","headers/jack/king/cripple framing when required","blocking","anchors/connectors/hardware","fasteners/adhesive","door/window opening framing","demolition/removal when in scope","disposal","access/lift when required"],
      "SHEATHING":["OSB/plywood panels","fasteners","construction adhesive when required","blocking/backing","cuts and minimum waste","removal of existing sheathing when in scope","debris/disposal","access/lift"],
      "CONCRETE":["excavation","subbase","compaction","forms","reinforcement when required","concrete material","short-load/delivery/pump charges when applicable","placement/finishing","curing","control joints/saw cuts","demo/haul-off when in scope","final grading/restoration"],
      "RETAINING_WALL":["excavation","compacted base","wall block","caps","drainage stone","perforated drain pipe","filter fabric","geogrid when required","backfill","compaction","steps/openings when in scope","equipment","trucking/haul-off/disposal","finish grading","topsoil","seed/sod/restoration","engineering/permit only when required"],
      "EARTHWORK_LANDSCAPE":["mobilization","equipment/operator","trucking","dump fees","aggregate/topsoil","compaction","filter fabric where required","finish grading","erosion control where required","seed/sod/restoration","delivery"],
      "PAINT_FINISH":["surface prep","masking/protection","patching/caulk","primer","paint/coating","sanding consumables","lift/access where required","cleanup"]
    }
  }
  $$::jsonb),
  ('trialBenchmarks','GARAGE-TRIAL-2026-08-13', $$
  {
    "version":"2026-08-12",
    "comparisonOnly":true,
    "runtimeInput":false,
    "automaticCarryover":false,
    "purpose":"Post-run comparison benchmark only. Do not inject these facts into a fresh Site Visit or Quote AI request.",
    "knownVerifiedReferenceDimensions":[
      {"label":"pedestrian door","value":"36 x 80 in","authority":"FIELD_VERIFIED"},
      {"label":"garage door","value":"9 x 7 ft","authority":"FIELD_VERIFIED"}
    ],
    "expectedScopeThemes":[
      "insulate and drywall applicable garage walls",
      "R-19 wall insulation where specified",
      "higher-R ceiling insulation where specified",
      "frame and drywall closet to ceiling where requested",
      "remove existing OSB/drywall where explicitly requested",
      "preserve/open around existing pull-down attic ladder where applicable",
      "fasteners, tape, mud/finishing consumables",
      "protection, cleanup and disposal when applicable",
      "minimum 10 percent material scrap/waste applied internally"
    ],
    "excludedOldEvidence":[
      "Do not automatically reuse the old rushed SCAN-FBCFAF37-F226-412D-B0B5-53FD8964AC51 session.",
      "Do not treat old camera estimates as verified geometry.",
      "Do not reuse the prior 212 in manual measurement because its label/context was poor unless freshly remeasured and identified."
    ],
    "scorecard":[
      {"id":"S1","criterion":"Fresh Site Visit/session is created and old rushed session is not resurrected."},
      {"id":"S2","criterion":"Native walkthrough camera+microphone completes and returns to the same Site Visit."},
      {"id":"S3","criterion":"Transcript/professional notes capture the described scope without materially inventing work."},
      {"id":"S4","criterion":"Requested measurements are relevant and critical unknown geometry is requested rather than guessed."},
      {"id":"S5","criterion":"Measurement authority is respected: field verified > device captured > camera estimate."},
      {"id":"S6","criterion":"Calculated quantities are physically plausible and use net installed geometry with material waste separate."},
      {"id":"S7","criterion":"Price Book/installed assemblies are matched with correct description and unit; no successful zero-dollar lines."},
      {"id":"S8","criterion":"Owner-only missing-cost audit catches plausible omissions without duplicating existing scope or auto-adding."},
      {"id":"S9","criterion":"Manual quantity/rate edits remain editable and are not overwritten by AI rebuild."},
      {"id":"S10","criterion":"Customer proposal contains professional customer-facing scope only; internal measurement/AI/pricing-review language is hidden."}
    ],
    "ratingScale":{"PASS":"works as intended with no material correction","MINOR":"usable but needs a small correction/polish","FAIL":"wrong, blocked, lost data, guessed critical input, or requires workflow fight"}
  }
  $$::jsonb)
)
insert into public.business_records (business_id,collection,record_key,payload,record_status,created_by,updated_by)
select t.business_id,r.collection,r.record_key,r.payload,'active',t.actor_id,t.actor_id
from target t cross join records r
where t.actor_id is not null
on conflict (business_id,collection,record_key) do update set
  payload=excluded.payload,
  record_status='active',
  updated_by=excluded.updated_by,
  updated_at=now(),
  archived_at=null;
