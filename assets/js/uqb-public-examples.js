/*
 * Highway 38 Universal Quote Builder — public demonstration dataset.
 *
 * This file contains only fictional, customer-facing demonstration content and
 * public CAD asset paths. It contains no customer IDs, private H38 records,
 * internal costs, margins, vendors, users, approvals, logs, or credentials.
 */
(function (global) {
  'use strict';

  const cadBase = 'assets/quote-builder/whole-house-cad/';
  const drawings = {
    'G-001': { sheet: 'G-001', title: 'General Notes, Index & Symbols', asset: cadBase + 'G-001.svg', classification: 'Estimating' },
    'A-101': { sheet: 'A-101', title: 'Proposed Main-Floor Plan — Detailed', asset: cadBase + 'A-101.svg', classification: 'Field layout' },
    'A-102': { sheet: 'A-102', title: 'Second-Floor & Roof Plan', asset: cadBase + 'A-102.svg', classification: 'Field layout' },
    'A-201': { sheet: 'A-201', title: 'Exterior Elevations — Four Views', asset: cadBase + 'A-201.svg', classification: 'Subcontractor bidding' },
    'A-301': { sheet: 'A-301', title: 'Building Sections & Envelope Details', asset: cadBase + 'A-301.svg', classification: 'Licensed-professional review required' },
    'A-401': { sheet: 'A-401', title: 'Kitchen Plan & Interior Elevations', asset: cadBase + 'A-401.svg', classification: 'Subcontractor bidding' },
    'M-101': { sheet: 'M-101', title: 'HVAC Distribution & Equipment Plan', asset: cadBase + 'M-101.svg', classification: 'Licensed-professional review required' },
    'P-101': { sheet: 'P-101', title: 'Plumbing Plan, Riser & Fixture Schedule', asset: cadBase + 'P-101.svg', classification: 'Licensed-professional review required' },
    'E-101': { sheet: 'E-101', title: 'Lighting, Power & Panel Schedule', asset: cadBase + 'E-101.svg', classification: 'Permit submission' },
    'C-S-L-101': { sheet: 'C-S-L-101', title: 'Site, Deck, Concrete, Drainage & Landscape', asset: cadBase + 'C-S-L-101.svg', classification: 'Field layout' }
  };

  const packages = [
    {
      key: 'preconstruction',
      title: 'Preconstruction & General Notes',
      quoteTitle: 'Preconstruction, Survey & Permits',
      summary: 'Planning, survey, permit, coordination, and project-control quote matched to the general notes and drawing index.',
      total: 18500,
      duration: '4–8 weeks',
      deposit: '30% at authorization',
      sheets: ['G-001'],
      scope: [
        'Boundary/topographic verification and construction staking',
        'Permit matrix, plan coordination, selections, scheduling, and procurement controls',
        'Soils, septic/well or utility coordination allowances',
        'Owner review and issued-for-pricing construction package'
      ],
      items: [
        ['Survey, topo, and staking allowance', 1, 'allowance', 4500, 4500],
        ['Design and coordination package', 1, 'package', 7500, 7500],
        ['Permit and review allowances', 1, 'allowance', 4000, 4000],
        ['Project controls and procurement planning', 1, 'lot', 2500, 2500]
      ],
      assumptions: ['Owner controls the lot', 'Authorities and consultants respond within normal timelines'],
      exclusions: ['Final stamped engineering beyond allowance', 'Land purchase or financing costs']
    },
    {
      key: 'siteprep',
      title: 'Site Preparation & Excavation',
      quoteTitle: 'Site Preparation, Clearing & Excavation',
      summary: 'Clearing, excavation, temporary access, and rough-grading quote matched to the site plan and clearing limits.',
      total: 27900,
      duration: '2–4 weeks, seasonal',
      deposit: '30% before mobilization',
      sheets: ['C-S-L-101', 'G-001'],
      scope: [
        'Clearing limits, tree/brush clearing, grubbing, and stump removal in the build zone',
        'Excavation, cut/fill, subgrade preparation, and stockpile management',
        'Temporary access, erosion control, and drainage protection during construction',
        'Rough grading, compaction, and elevation proof before foundation work'
      ],
      items: [
        ['Clearing and grubbing', 1, 'lot', 6400, 6400],
        ['Excavation and cut/fill', 210, 'cu yd', 42, 8820],
        ['Temporary access and erosion control', 1, 'lot', 3480, 3480],
        ['Rough grading and compaction', 1, 'lot', 9200, 9200]
      ],
      assumptions: ['Owner controls the lot and clearing limits are marked', 'No wetlands or protected trees inside the clearing limits'],
      exclusions: ['Rock excavation or blasting', 'Wetland mitigation or protected-tree removal']
    },
    {
      key: 'utilities',
      title: 'Underground Utilities, Well & Septic',
      quoteTitle: 'Well, Septic & Underground Utilities',
      summary: 'Well, septic, and underground utility quote matched to the site utility routes and plumbing service plan.',
      total: 36400,
      duration: '3–6 weeks with inspections',
      deposit: '30% before drilling and installation',
      sheets: ['C-S-L-101', 'P-101'],
      scope: [
        'Drilled well, pump, pressure system, and water-quality test',
        'Septic tank and drain-field installation with inspection coordination',
        'Trenching, bedding, and sleeves for water, sewer, and power crossings',
        'As-built utility map, testing, and service labeling'
      ],
      items: [
        ['Drilled well and pump system', 1, 'lot', 9800, 9800],
        ['Septic tank and drain field', 1, 'lot', 16400, 16400],
        ['Utility trenching and sleeves', 320, 'lin ft', 22, 7040],
        ['Testing, permits, and as-built map', 1, 'lot', 3160, 3160]
      ],
      assumptions: ['Soil and percolation conditions suit a conventional system', 'Permit approvals arrive on normal timelines'],
      exclusions: ['Municipal tap fees or utility-company charges', 'Water treatment beyond basic filtration']
    },
    {
      key: 'foundation',
      title: 'Foundation & Concrete',
      quoteTitle: 'Footings, Foundation Walls & Slab',
      summary: 'Footing, foundation-wall, waterproofing, and slab quote matched to the building sections and floor plan.',
      total: 43800,
      duration: '3–5 weeks with cure windows',
      deposit: '30% before footing excavation',
      sheets: ['A-301', 'A-101'],
      scope: [
        'Footing excavation, forming, reinforcement, and placement',
        'Foundation walls, waterproofing, drain tile, and foundation insulation',
        'Slab preparation, vapor control, placement, and finish',
        'Backfill, compaction, and elevation proof before framing'
      ],
      items: [
        ['Footings and foundation walls', 1, 'lot', 21800, 21800],
        ['Waterproofing, drain tile, and insulation', 1, 'lot', 6400, 6400],
        ['Slab preparation and placement', 1450, 'sq ft', 8, 11600],
        ['Backfill and compaction proof', 1, 'lot', 4000, 4000]
      ],
      assumptions: ['Soils bear as assumed by the design', 'Frost depth follows local code requirements'],
      exclusions: ['Rock excavation or extended dewatering', 'Stamped engineering beyond the design allowance']
    },
    {
      key: 'framing',
      title: 'Structural Framing & Architectural Plans',
      quoteTitle: 'Structural Framing & Weather-Tight Shell',
      summary: 'Weather-tight structural shell quote matched to coordinated floor plans, elevations, and building sections.',
      total: 96500,
      duration: '8–12 weeks',
      deposit: '30% before lumber order',
      sheets: ['A-101', 'A-102', 'A-201', 'A-301'],
      scope: [
        'Floor, wall, stair, and roof framing with connectors and blocking',
        'Structural sheathing and temporary weather-protection layers',
        'Windows, exterior doors, and temporary weather protection',
        'Framing inspections and concealed-work documentation'
      ],
      items: [
        ['Structural lumber and framing package', 1, 'allowance', 48500, 48500],
        ['Framing labor and equipment', 1, 'lot', 31500, 31500],
        ['Windows and exterior doors allowance', 1, 'allowance', 10500, 10500],
        ['Temporary weather protection', 1, 'lot', 6000, 6000]
      ],
      assumptions: ['Approved framing plans are available', 'Standard material lead times apply'],
      exclusions: ['Specialty structural steel beyond allowance', 'Design changes after framing release']
    },
    {
      key: 'exterior',
      title: 'Roofing, Siding & Exterior Envelope',
      quoteTitle: 'Roofing, Siding & Exterior Trim',
      summary: 'Roofing, siding, and exterior-trim quote matched to the roof plan and exterior elevations.',
      total: 39600,
      duration: '3–5 weeks, weather dependent',
      deposit: '40% before material order',
      sheets: ['A-102', 'A-201'],
      scope: [
        'Architectural shingle roofing with underlayment, ice-and-water protection, and ventilation',
        'Siding, weather-resistive barrier, and flashing integration at every penetration',
        'Soffit, fascia, exterior trim, and sealant completion',
        'Manufacturer warranty registration and finished-envelope photo proof'
      ],
      items: [
        ['Architectural shingle roofing system', 24, 'square', 685, 16440],
        ['Siding and weather-resistive barrier', 2100, 'sq ft', 8.4, 17640],
        ['Soffit, fascia, and exterior trim', 1, 'lot', 3520, 3520],
        ['Sealing, cleanup, and warranty registration', 1, 'lot', 2000, 2000]
      ],
      assumptions: ['Roof deck is sound under the framing package', 'Siding and roofing selections are approved before ordering'],
      exclusions: ['Metal roofing beyond the shingle allowance', 'Gutters and downspouts']
    },
    {
      key: 'interior',
      title: 'Cabinets & Interior Finish Coordination',
      quoteTitle: 'Interior Millwork, Cabinets & Finishes',
      summary: 'Interior millwork, cabinet, countertop, flooring, tile, and finish quote matched to the enlarged kitchen plan and elevations.',
      total: 78200,
      duration: '8–14 weeks including procurement',
      deposit: '40% before finish orders',
      sheets: ['A-401'],
      scope: [
        'Interior doors, trim, stairs/railings, closet systems, and finish carpentry',
        'Kitchen and bath cabinets, countertops, hardware, and installation',
        'Flooring, tile, painting, and finish-surface protection',
        'Approved selection schedule and room-by-room punch list'
      ],
      items: [
        ['Cabinet/countertop allowance', 1, 'allowance', 32200, 32200],
        ['Doors/trim/stairs allowance', 1, 'allowance', 17100, 17100],
        ['Flooring/tile allowance', 1, 'allowance', 16900, 16900],
        ['Painting and finish labor', 1, 'lot', 12000, 12000]
      ],
      assumptions: ['Selections are approved by required dates', 'Interior is conditioned before finish installation'],
      exclusions: ['Furniture and window treatments', 'Luxury selections beyond allowances']
    },
    {
      key: 'plumbing',
      title: 'New-Construction Plumbing',
      quoteTitle: 'New-Construction Plumbing',
      summary: 'Complete plumbing quote matched to the plumbing plan, riser, fixture schedule, and routed services.',
      total: 34800,
      duration: 'Rough 2–3 weeks; finish 1 week',
      deposit: '30% before rough-in',
      sheets: ['P-101'],
      scope: [
        'Complete new domestic water, DWV, vent, gas, and fixture rough-in',
        'Kitchen, baths, laundry, hose bibs, water heater, and service coordination',
        'Pressure/leak tests, insulation, fixture set, startup, and labeling',
        'Permit and inspection coordination by licensed plumber'
      ],
      items: [
        ['Plumbing rough material', 1, 'lot', 10600, 10600],
        ['Licensed rough labor', 112, 'hr', 120, 13440],
        ['Fixture allowance', 1, 'allowance', 7200, 7200],
        ['Finish, test, permit allowance', 1, 'lot', 3560, 3560]
      ],
      assumptions: ['Approved fixture schedule is complete', 'Service sizes are confirmed before rough-in'],
      exclusions: ['Well/septic system beyond utility allowance', 'Water treatment equipment']
    },
    {
      key: 'electrical',
      title: 'Electrical & Low Voltage',
      quoteTitle: 'New-Construction Electrical & Low Voltage',
      summary: 'Electrical and low-voltage quote matched to the lighting, power, device, and panel-schedule sheet.',
      total: 37200,
      duration: 'Rough 2–3 weeks; trim 1–2 weeks',
      deposit: '30% before material order',
      sheets: ['E-101'],
      scope: [
        'New service, meter, panel, grounding, branch circuits, devices, lighting, smoke/CO, and exterior power',
        'Kitchen, bath, laundry, garage, HVAC, appliance, and future-load coordination',
        'Structured wiring, camera/data pathways, testing, labeling, and as-built panel schedule',
        'Permit and inspection by licensed electrician'
      ],
      items: [
        ['Service/panel/distribution', 1, 'lot', 9800, 9800],
        ['Rough wiring and boxes', 1, 'lot', 11200, 11200],
        ['Lighting/device allowance', 1, 'allowance', 10400, 10400],
        ['Trim, test, permit, low voltage', 1, 'lot', 5800, 5800]
      ],
      assumptions: ['Utility service point is confirmed', 'Final lighting/device plan is approved'],
      exclusions: ['Utility transformer extension', 'Generator or solar system']
    },
    {
      key: 'hvac',
      title: 'HVAC & Ventilation',
      quoteTitle: 'New-Construction HVAC & Ventilation',
      summary: 'Heating, cooling, ventilation, controls, and commissioning quote matched to the mechanical distribution plan.',
      total: 31800,
      duration: '3–5 weeks after equipment receipt',
      deposit: '40% at equipment order',
      sheets: ['M-101'],
      scope: [
        'Manual J/S/D or equivalent design and complete new distribution system',
        'Heating, cooling, ventilation, exhaust, filtration, controls, and condensate',
        'Equipment pads, penetrations, startup, balancing, and commissioning report',
        'Permit and inspection coordination by licensed HVAC contractor'
      ],
      items: [
        ['Equipment allowance', 1, 'allowance', 16600, 16600],
        ['Duct/distribution material', 1, 'lot', 7200, 7200],
        ['Installation and controls', 1, 'lot', 6200, 6200],
        ['Startup/balance/permit', 1, 'lot', 1800, 1800]
      ],
      assumptions: ['Energy design and equipment selections are approved', 'Electrical and framing coordination is complete'],
      exclusions: ['Geothermal wells', 'Utility fuel extension']
    },
    {
      key: 'drywall',
      title: 'Insulation & Drywall',
      quoteTitle: 'Insulation, Drywall & Interior Shell',
      summary: 'Insulation and drywall quote matched to the floor plan and kitchen plan after mechanical rough-in.',
      total: 26300,
      duration: '3–4 weeks',
      deposit: '30% before insulation',
      sheets: ['A-101', 'A-401'],
      scope: [
        'Wall and ceiling insulation matched to the energy design',
        'Drywall hanging, taping, and Level 4 finish',
        'Moisture readings and shell inspection proof before close-in',
        'Texture/prime preparation and dust-controlled cleanup'
      ],
      items: [
        ['Wall and ceiling insulation', 1, 'lot', 8400, 8400],
        ['Drywall hang, tape, and finish', 6800, 'sq ft', 2.1, 14280],
        ['Shell inspection and moisture proof', 1, 'lot', 1620, 1620],
        ['Prime preparation and cleanup', 1, 'lot', 2000, 2000]
      ],
      assumptions: ['Mechanical rough-in inspections have passed', 'Interior is weather-tight and conditioned before finishing'],
      exclusions: ['Specialty plaster or Level 5 finish', 'Paint and finish coatings (Interior package)']
    },
    {
      key: 'sitefinish',
      title: 'Final Grading, Drainage & Landscaping',
      quoteTitle: 'Driveway, Final Grading & Landscaping',
      summary: 'Final site-completion quote matched to the site, deck, concrete, drainage, and landscape sheet.',
      total: 36500,
      duration: '2–5 weeks seasonal',
      deposit: '30% before mobilization',
      sheets: ['C-S-L-101'],
      scope: [
        'Final grading and positive drainage away from structures',
        'Driveway base/surface, walks, topsoil, lawn, planting beds, and erosion-control removal',
        'Downspout and surface-drainage completion',
        'Site cleanup and establishment-care instructions'
      ],
      items: [
        ['Final grading/drainage', 1, 'lot', 9800, 9800],
        ['Driveway allowance', 1, 'allowance', 14200, 14200],
        ['Topsoil/lawn/landscape allowance', 1, 'allowance', 10500, 10500],
        ['Cleanup and stabilization', 1, 'lot', 2000, 2000]
      ],
      assumptions: ['Seasonal conditions permit final work', 'Final site elevations are approved'],
      exclusions: ['Irrigation system', 'Retaining walls or wetland work']
    }
  ];

  global.H38_UQB_PUBLIC_EXAMPLES = Object.freeze({
    version: '2026-10-09-static-public-v2',
    projectTitle: 'New-House Construction — Lot Clearing to Closeout',
    projectLocation: 'Fictional demonstration property — Grand Rapids, Minnesota',
    disclosure: 'Public fictional demonstration only — not a contract, permit set, stamped design, or construction authorization.',
    drawings: Object.freeze(drawings),
    packages: Object.freeze(packages)
  });
})(window);
