-- Missing-trade price book structure for Highway 38 (2026-10-30, Fix Round 1).
--
-- H38's price book had NO rows at all for several trades it sells (roofing,
-- snow plowing, lawn mowing, plumbing, electrical, well drilling, septic),
-- so there was nothing for the owner to price. This inserts UNPRICED
-- structure rows only: unit_cost = 0, sell_price = NULL, every row flagged
-- owner_review_required. No price or cost is entered or invented anywhere —
-- the owner prices these himself.
--
-- H38 ONLY (business_key = 'highway38', the established per-tenant seed
-- pattern). Idempotent: on conflict (business_id, item_code) do nothing, so
-- a re-run — or a row the owner has since priced — is never overwritten.
--
-- Machine shop: ONE reference-section row and no numbers. Shop rates live
-- in the owner approval queue as pricing rules; this row must never be
-- quoted from, and no pricing rule is created, changed, or activated here.

with h38 as (
  select id as business_id
    from public.businesses
   where business_key = 'highway38'
),
structure (item_code, category, description, unit) as (
  values
    -- Roofing
    ('ROOF-TEAR-OFF-DISPOSAL',          'Roofing',       'Tear-off and disposal',              'SQ'),
    ('ROOF-ASPHALT-SHINGLE-INSTALL',    'Roofing',       'Asphalt shingle install',            'SQ'),
    ('ROOF-ARCH-SHINGLE-INSTALL',       'Roofing',       'Architectural shingle install',      'SQ'),
    ('ROOF-METAL-INSTALL',              'Roofing',       'Metal roofing install',              'SQ'),
    ('ROOF-REPAIR-LEAK-DIAGNOSIS',      'Roofing',       'Roof repair — leak diagnosis',       'each'),
    ('ROOF-FLASHING-REPAIR',            'Roofing',       'Flashing repair',                    'LF'),
    ('ROOF-RIDGE-VENT-INSTALL',         'Roofing',       'Ridge vent install',                 'LF'),
    ('ROOF-GUTTER-INSTALL',             'Roofing',       'Gutter install',                     'LF'),
    ('ROOF-GUTTER-CLEANING',            'Roofing',       'Gutter cleaning',                    'LF'),
    -- Snow Plowing
    ('SNOW-RESIDENTIAL-DRIVEWAY-VISIT', 'Snow Plowing',  'Residential driveway per visit',     'visit'),
    ('SNOW-RESIDENTIAL-SEASONAL',       'Snow Plowing',  'Residential seasonal contract',      'season'),
    ('SNOW-COMMERCIAL-LOT-VISIT',       'Snow Plowing',  'Commercial lot per visit',           'visit'),
    ('SNOW-COMMERCIAL-SEASONAL',        'Snow Plowing',  'Commercial seasonal contract',       'season'),
    ('SNOW-SIDEWALK-CLEARING-VISIT',    'Snow Plowing',  'Sidewalk clearing per visit',        'visit'),
    ('SNOW-SALTING-DEICING',            'Snow Plowing',  'Salting/de-icing application',       'visit'),
    ('SNOW-ROOF-REMOVAL',               'Snow Plowing',  'Roof snow removal',                  'hour'),
    -- Lawn Mowing
    ('LAWN-RESIDENTIAL-MOWING-VISIT',   'Lawn Mowing',   'Residential mowing per visit',       'visit'),
    ('LAWN-ACREAGE-MOWING-VISIT',       'Lawn Mowing',   'Acreage mowing per visit',           'visit'),
    ('LAWN-SPRING-CLEANUP',             'Lawn Mowing',   'Spring cleanup',                     'LS'),
    ('LAWN-FALL-CLEANUP',               'Lawn Mowing',   'Fall cleanup',                       'LS'),
    ('LAWN-LEAF-REMOVAL',               'Lawn Mowing',   'Leaf removal',                       'LS'),
    ('LAWN-DETHATCHING',                'Lawn Mowing',   'Dethatching',                        'LS'),
    ('LAWN-AERATION',                   'Lawn Mowing',   'Aeration',                           'LS'),
    ('LAWN-BRUSH-CLEARING',             'Lawn Mowing',   'Brush clearing',                     'hour'),
    ('LAWN-STUMP-GRINDING',             'Lawn Mowing',   'Stump grinding',                     'each'),
    -- Plumbing
    ('PLUMB-SERVICE-CALL',              'Plumbing',      'Service call / diagnostic',          'each'),
    ('PLUMB-WATER-HEATER-REPLACEMENT',  'Plumbing',      'Water heater replacement',           'each'),
    ('PLUMB-DRAIN-CLEARING',            'Plumbing',      'Drain clearing',                     'each'),
    ('PLUMB-FAUCET-REPAIR-REPLACE',     'Plumbing',      'Faucet repair/replacement',          'each'),
    ('PLUMB-TOILET-REPAIR-REPLACE',     'Plumbing',      'Toilet repair/replacement',          'each'),
    ('PLUMB-SUMP-PUMP-REPLACEMENT',     'Plumbing',      'Sump pump replacement',              'each'),
    ('PLUMB-PIPE-REPAIR',               'Plumbing',      'Pipe repair',                        'hour'),
    ('PLUMB-WATER-LINE-INSTALL',        'Plumbing',      'Water line install',                 'LF'),
    ('PLUMB-ROUGH-IN-PER-FIXTURE',      'Plumbing',      'Rough-in per fixture',               'each'),
    -- Electrical
    ('ELEC-SERVICE-CALL',               'Electrical',    'Service call / diagnostic',          'each'),
    ('ELEC-PANEL-UPGRADE',              'Electrical',    'Panel upgrade',                      'each'),
    ('ELEC-OUTLET-SWITCH-INSTALL',      'Electrical',    'Outlet/switch install',              'each'),
    ('ELEC-CEILING-FAN-INSTALL',        'Electrical',    'Ceiling fan install',                'each'),
    ('ELEC-LIGHT-FIXTURE-INSTALL',      'Electrical',    'Light fixture install',              'each'),
    ('ELEC-GENERATOR-HOOKUP',           'Electrical',    'Generator hookup',                   'each'),
    ('ELEC-TROUBLESHOOTING',            'Electrical',    'Troubleshooting',                    'hour'),
    ('ELEC-CIRCUIT-ADDITION',           'Electrical',    'Circuit addition',                   'each'),
    -- Well Drilling
    ('WELL-DRILLING-PER-FOOT',          'Well Drilling', 'Well drilling per foot',             'ft'),
    ('WELL-PUMP-INSTALL',               'Well Drilling', 'Pump install',                       'each'),
    ('WELL-PRESSURE-TANK-REPLACEMENT',  'Well Drilling', 'Pressure tank replacement',          'each'),
    ('WELL-INSPECTION',                 'Well Drilling', 'Well inspection',                    'each'),
    ('WELL-WATER-TESTING',              'Well Drilling', 'Water testing',                      'each'),
    ('WELL-CHLORINATION',               'Well Drilling', 'Well chlorination',                  'each'),
    -- Septic
    ('SEPTIC-TANK-PUMPING',             'Septic',        'Septic tank pumping',                'each'),
    ('SEPTIC-SYSTEM-INSTALL',           'Septic',        'Septic system install',              'LS'),
    ('SEPTIC-DRAIN-FIELD-REPAIR',       'Septic',        'Drain field repair',                 'LS'),
    ('SEPTIC-INSPECTION',               'Septic',        'Septic inspection',                  'each'),
    ('SEPTIC-RISER-INSTALL',            'Septic',        'Riser install',                      'each'),
    ('SEPTIC-BAFFLE-FILTER-SERVICE',    'Septic',        'Baffle/filter service',              'each'),
    -- Machine Shop — reference section only, NO numbers, never quote from it.
    ('MACH-REFERENCE-SECTION',          'Machine Shop',  'Machine Shop — brokerage reference section. Shop rates live in the owner approval queue as pricing rules; do not quote from this row.', 'each')
)
insert into public.price_book_items (
  business_id, item_code, category, description, unit,
  unit_cost, sell_price, source_type, source_note, approval_status, active
)
select
  h38.business_id,
  s.item_code,
  s.category,
  s.description,
  s.unit,
  0,
  null,
  'business',
  'Structure row added 2026-10-30 — owner to price; no price or cost entered yet.',
  'owner_review_required',
  true
from h38
cross join structure s
on conflict (business_id, item_code) do nothing;
