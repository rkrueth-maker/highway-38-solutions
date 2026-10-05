/* H38 Trade Packages — starter templates for contractor onboarding.
 * "Business in a box": pick your trade, get a ready-to-go price book,
 * service checklists, job types, and quote language. All static data,
 * no AI dependency. User can edit/delete everything after loading.
 *
 * Pricing: realistic US Midwest ranges (2026). Ranges shown as priceLow/priceHigh;
 * when loading, the midpoint is used as the default selling price.
 */
(function(){
'use strict';

const TRADE_PACKAGES = {

/* ============================== HVAC ============================== */
hvac: {
  id: 'hvac',
  name: 'HVAC',
  tagline: 'Heating, ventilation & air conditioning',
  priceBook: [
    { sku: 'HVAC-AC-TUNE', description: 'AC Tune-Up (21-point inspection)', unit: 'each', priceLow: 89, priceHigh: 149, category: 'Maintenance' },
    { sku: 'HVAC-FURN-TUNE', description: 'Furnace Tune-Up (21-point inspection)', unit: 'each', priceLow: 89, priceHigh: 149, category: 'Maintenance' },
    { sku: 'HVAC-HP-TUNE', description: 'Heat Pump Tune-Up', unit: 'each', priceLow: 99, priceHigh: 169, category: 'Maintenance' },
    { sku: 'HVAC-FILTER', description: 'Filter Replacement (standard 1")', unit: 'each', priceLow: 15, priceHigh: 35, category: 'Maintenance' },
    { sku: 'HVAC-FILTER-MEDIA', description: 'Media Filter Replacement (4-5")', unit: 'each', priceLow: 45, priceHigh: 95, category: 'Maintenance' },
    { sku: 'HVAC-COIL-CLEAN', description: 'Evaporator/Condenser Coil Cleaning', unit: 'each', priceLow: 150, priceHigh: 350, category: 'Repair' },
    { sku: 'HVAC-REFRIG', description: 'Refrigerant Recharge (R-410A, per lb)', unit: 'lb', priceLow: 75, priceHigh: 150, category: 'Repair' },
    { sku: 'HVAC-CAPACITOR', description: 'Capacitor Replacement', unit: 'each', priceLow: 150, priceHigh: 300, category: 'Repair' },
    { sku: 'HVAC-CONTACTOR', description: 'Contactor Replacement', unit: 'each', priceLow: 175, priceHigh: 350, category: 'Repair' },
    { sku: 'HVAC-BLOWER', description: 'Blower Motor Replacement', unit: 'each', priceLow: 450, priceHigh: 900, category: 'Repair' },
    { sku: 'HVAC-THERMOSTAT', description: 'Smart Thermostat Install (device + labor)', unit: 'each', priceLow: 250, priceHigh: 500, category: 'Install' },
    { sku: 'HVAC-THERMOSTAT-BASIC', description: 'Basic Thermostat Replacement', unit: 'each', priceLow: 150, priceHigh: 275, category: 'Install' },
    { sku: 'HVAC-AC-INSTALL', description: 'Central AC Install (2-3 ton, complete)', unit: 'each', priceLow: 3500, priceHigh: 7000, category: 'Install' },
    { sku: 'HVAC-FURN-INSTALL', description: 'Furnace Install (80-96% AFUE, complete)', unit: 'each', priceLow: 2500, priceHigh: 5500, category: 'Install' },
    { sku: 'HVAC-HP-INSTALL', description: 'Heat Pump Install (complete system)', unit: 'each', priceLow: 4500, priceHigh: 9000, category: 'Install' },
    { sku: 'HVAC-MINISPLIT-1', description: 'Mini-Split Install (single zone)', unit: 'each', priceLow: 2500, priceHigh: 4500, category: 'Install' },
    { sku: 'HVAC-DUCT-CLEAN', description: 'Duct Cleaning (whole house)', unit: 'each', priceLow: 300, priceHigh: 600, category: 'Maintenance' },
    { sku: 'HVAC-DUCT-SEAL', description: 'Duct Sealing / Aeroseal (per system)', unit: 'each', priceLow: 800, priceHigh: 2000, category: 'Install' },
    { sku: 'HVAC-DIAG', description: 'Diagnostic / Service Call Fee', unit: 'each', priceLow: 79, priceHigh: 129, category: 'Service' },
    { sku: 'HVAC-IAQ', description: 'Indoor Air Quality Assessment', unit: 'each', priceLow: 99, priceHigh: 199, category: 'Service' },
  ],
  checklists: [
    { name: 'AC Tune-Up Checklist', items: [
      'Check refrigerant pressures and temperatures',
      'Clean condenser coil and clear debris from unit',
      'Clean/inspect evaporator coil (accessible)',
      'Replace or clean air filter',
      'Test thermostat operation and calibration',
      'Inspect electrical connections and tighten',
      'Test capacitors and contactors',
      'Check condensate drain and clear if needed',
      'Measure temperature split (supply vs return)',
      'Inspect ductwork for visible leaks/damage',
      'Lubricate motors (if applicable)',
      'Verify system cycles on/off properly',
    ]},
    { name: 'Furnace Tune-Up Checklist', items: [
      'Inspect heat exchanger for cracks/damage',
      'Clean burners and flame sensor',
      'Check gas pressure and connections',
      'Test ignition system',
      'Inspect flue pipe for blockages/corrosion',
      'Replace or clean air filter',
      'Test thermostat operation',
      'Check blower motor and belt',
      'Inspect electrical connections',
      'Test safety controls (limit switch, rollout)',
      'Measure temperature rise',
      'Check carbon monoxide levels',
    ]},
  ],
  jobTypes: ['AC Tune-Up', 'Furnace Tune-Up', 'Heat Pump Service', 'System Install', 'Repair Call', 'Duct Cleaning', 'Thermostat Install', 'Emergency Repair', 'Maintenance Plan Visit'],
  quoteNotes: [
    'All pricing includes parts and labor unless noted. Permit fees (if required) billed at cost.',
    'Manufacturer warranty honored; labor warranty 1 year on installs, 90 days on repairs.',
    'Diagnostic fee waived with approved repair.',
    'System sizing based on Manual J load calculation available on request.',
  ],
},

/* ============================== PLUMBING ============================== */
plumbing: {
  id: 'plumbing',
  name: 'Plumbing',
  tagline: 'Residential & light commercial plumbing',
  priceBook: [
    { sku: 'PLB-DIAG', description: 'Diagnostic / Service Call Fee', unit: 'each', priceLow: 79, priceHigh: 129, category: 'Service' },
    { sku: 'PLB-DRAIN-SNAKE', description: 'Drain Cleaning (auger/snake)', unit: 'each', priceLow: 150, priceHigh: 300, category: 'Repair' },
    { sku: 'PLB-DRAIN-HYDRO', description: 'Hydro Jetting (main line)', unit: 'each', priceLow: 350, priceHigh: 700, category: 'Repair' },
    { sku: 'PLB-TOILET-INSTALL', description: 'Toilet Install (customer-supplied)', unit: 'each', priceLow: 200, priceHigh: 400, category: 'Install' },
    { sku: 'PLB-TOILET-REBUILD', description: 'Toilet Rebuild Kit (fill valve + flapper)', unit: 'each', priceLow: 150, priceHigh: 275, category: 'Repair' },
    { sku: 'PLB-FAUCET-INSTALL', description: 'Faucet Install (kitchen or bath)', unit: 'each', priceLow: 175, priceHigh: 350, category: 'Install' },
    { sku: 'PLB-WH-TANK', description: 'Water Heater Install (40-50 gal tank)', unit: 'each', priceLow: 1200, priceHigh: 2200, category: 'Install' },
    { sku: 'PLB-WH-TANKLESS', description: 'Tankless Water Heater Install', unit: 'each', priceLow: 2500, priceHigh: 4500, category: 'Install' },
    { sku: 'PLB-WH-ELEMENT', description: 'Water Heater Element/Thermostat Replace', unit: 'each', priceLow: 200, priceHigh: 400, category: 'Repair' },
    { sku: 'PLB-LEAK-REPAIR', description: 'Leak Repair (accessible pipe)', unit: 'each', priceLow: 150, priceHigh: 400, category: 'Repair' },
    { sku: 'PLB-SHUTOFF', description: 'Shut-Off Valve Replacement', unit: 'each', priceLow: 125, priceHigh: 250, category: 'Repair' },
    { sku: 'PLB-GD-INSTALL', description: 'Garbage Disposal Install', unit: 'each', priceLow: 200, priceHigh: 400, category: 'Install' },
    { sku: 'PLB-SUMP', description: 'Sump Pump Replacement', unit: 'each', priceLow: 400, priceHigh: 800, category: 'Install' },
    { sku: 'PLB-SUMP-BATT', description: 'Sump Pump Battery Backup Install', unit: 'each', priceLow: 500, priceHigh: 900, category: 'Install' },
    { sku: 'PLB-SEWER-CAM', description: 'Sewer Camera Inspection', unit: 'each', priceLow: 200, priceHigh: 400, category: 'Service' },
    { sku: 'PLB-WINTERIZE', description: 'Plumbing Winterization', unit: 'each', priceLow: 150, priceHigh: 300, category: 'Maintenance' },
    { sku: 'PLB-SOFTENER', description: 'Water Softener Install', unit: 'each', priceLow: 1200, priceHigh: 2500, category: 'Install' },
    { sku: 'PLB-HOSE-BIBB', description: 'Hose Bibb / Frost-Free Faucet Install', unit: 'each', priceLow: 200, priceHigh: 400, category: 'Install' },
    { sku: 'PLB-HOURLY', description: 'Hourly Labor Rate (plumber)', unit: 'hour', priceLow: 100, priceHigh: 175, category: 'Labor' },
  ],
  checklists: [
    { name: 'Water Heater Install Checklist', items: [
      'Shut off water and gas/power to old unit',
      'Drain old tank completely',
      'Disconnect and remove old unit',
      'Inspect and replace supply lines if needed',
      'Set new unit, connect water lines',
      'Connect gas line / electrical (per code)',
      'Install/verify T&P relief valve and discharge pipe',
      'Fill tank, purge air, check for leaks',
      'Light pilot / power on, verify operation',
      'Set thermostat to 120°F',
      'Haul away old unit',
      'Review maintenance with homeowner',
    ]},
    { name: 'Drain Service Checklist', items: [
      'Identify affected fixtures and drain path',
      'Attempt plunger/auger from accessible cleanout',
      'Run camera if blockage persists',
      'Clear blockage, verify flow at all fixtures',
      'Flush line with hot water',
      'Inspect for root intrusion or pipe damage',
      'Recommend hydro jetting if heavy buildup',
      'Clean up work area',
    ]},
  ],
  jobTypes: ['Drain Cleaning', 'Water Heater Install', 'Leak Repair', 'Fixture Install', 'Sewer Inspection', 'Remodel Rough-In', 'Emergency Call', 'Winterization'],
  quoteNotes: [
    'Pricing includes standard parts and labor. Specialty fixtures or tile work quoted separately.',
    'All work performed to current plumbing code. Permits pulled where required (billed at cost).',
    '1-year warranty on labor; manufacturer warranty on parts.',
    'Diagnostic fee applied toward repair if approved same visit.',
  ],
},

/* ============================== ELECTRICAL ============================== */
electrical: {
  id: 'electrical',
  name: 'Electrical',
  tagline: 'Residential & light commercial electrical',
  priceBook: [
    { sku: 'ELEC-DIAG', description: 'Diagnostic / Service Call Fee', unit: 'each', priceLow: 89, priceHigh: 139, category: 'Service' },
    { sku: 'ELEC-OUTLET', description: 'Standard Outlet Replacement', unit: 'each', priceLow: 125, priceHigh: 225, category: 'Repair' },
    { sku: 'ELEC-OUTLET-NEW', description: 'New Outlet Install (dedicated circuit)', unit: 'each', priceLow: 200, priceHigh: 400, category: 'Install' },
    { sku: 'ELEC-GFCI', description: 'GFCI Outlet Install/Replacement', unit: 'each', priceLow: 150, priceHigh: 275, category: 'Install' },
    { sku: 'ELEC-SWITCH', description: 'Light Switch Replacement', unit: 'each', priceLow: 100, priceHigh: 200, category: 'Repair' },
    { sku: 'ELEC-DIMMER', description: 'Dimmer Switch Install', unit: 'each', priceLow: 150, priceHigh: 275, category: 'Install' },
    { sku: 'ELEC-FAN', description: 'Ceiling Fan Install (existing box)', unit: 'each', priceLow: 200, priceHigh: 350, category: 'Install' },
    { sku: 'ELEC-FAN-NEW', description: 'Ceiling Fan Install (new box + wiring)', unit: 'each', priceLow: 350, priceHigh: 600, category: 'Install' },
    { sku: 'ELEC-LIGHT-FIX', description: 'Light Fixture Install (customer-supplied)', unit: 'each', priceLow: 150, priceHigh: 300, category: 'Install' },
    { sku: 'ELEC-RECESSED', description: 'Recessed Light Install (per can)', unit: 'each', priceLow: 175, priceHigh: 350, category: 'Install' },
    { sku: 'ELEC-PANEL-100-200', description: 'Panel Upgrade (100A to 200A)', unit: 'each', priceLow: 1800, priceHigh: 3500, category: 'Install' },
    { sku: 'ELEC-PANEL-NEW', description: 'New 200A Panel Install', unit: 'each', priceLow: 1500, priceHigh: 3000, category: 'Install' },
    { sku: 'ELEC-BREAKER', description: 'Breaker Replacement', unit: 'each', priceLow: 150, priceHigh: 300, category: 'Repair' },
    { sku: 'ELEC-EV-CHARGER', description: 'EV Charger Install (240V circuit)', unit: 'each', priceLow: 600, priceHigh: 1500, category: 'Install' },
    { sku: 'ELEC-GENERATOR-PORT', description: 'Generator Interlock / Inlet Install', unit: 'each', priceLow: 500, priceHigh: 1000, category: 'Install' },
    { sku: 'ELEC-SMOKE', description: 'Smoke/CO Detector Install (hardwired)', unit: 'each', priceLow: 150, priceHigh: 275, category: 'Install' },
    { sku: 'ELEC-TROUBLESHOOT', description: 'Circuit Troubleshooting (per hour)', unit: 'hour', priceLow: 120, priceHigh: 185, category: 'Labor' },
    { sku: 'ELEC-SAFETY', description: 'Whole-Home Electrical Safety Inspection', unit: 'each', priceLow: 149, priceHigh: 299, category: 'Service' },
    { sku: 'ELEC-SURGE', description: 'Whole-Home Surge Protector Install', unit: 'each', priceLow: 350, priceHigh: 650, category: 'Install' },
  ],
  checklists: [
    { name: 'Panel Upgrade Checklist', items: [
      'Verify utility disconnect / pull meter',
      'Remove old panel and breakers',
      'Mount new panel, verify level and secure',
      'Land all circuits, label every breaker',
      'Torque lugs to manufacturer spec',
      'Install main breaker, verify amperage',
      'Bond ground and neutral per code',
      'Reinstall meter / restore utility power',
      'Test every circuit under load',
      'Install panel schedule directory',
      'Schedule inspection with AHJ',
      'Walk homeowner through new panel',
    ]},
    { name: 'Safety Inspection Checklist', items: [
      'Test all GFCI and AFCI devices',
      'Check panel for double-taps, corrosion, overheating',
      'Verify proper breaker sizing vs wire gauge',
      'Test smoke/CO detectors',
      'Check exterior outlets and covers',
      'Inspect visible wiring in attic/basement',
      'Verify grounding electrode system',
      'Check for aluminum wiring concerns',
      'Document findings with photos',
    ]},
  ],
  jobTypes: ['Panel Upgrade', 'Troubleshooting', 'Fixture Install', 'Outlet/Switch Work', 'EV Charger', 'Safety Inspection', 'Remodel Wiring', 'Emergency Call'],
  quoteNotes: [
    'All work to NEC and local code. Licensed and insured.',
    'Permits and inspection fees billed at cost where required.',
    'Panel upgrades include utility coordination and inspection scheduling.',
    '1-year labor warranty; manufacturer warranty on all devices.',
  ],
},

/* ============================== ROOFING ============================== */
roofing: {
  id: 'roofing',
  name: 'Roofing',
  tagline: 'Residential roofing, repair & gutters',
  priceBook: [
    { sku: 'ROOF-INSPECT', description: 'Roof Inspection (with photo report)', unit: 'each', priceLow: 0, priceHigh: 150, category: 'Service' },
    { sku: 'ROOF-REPAIR-MINOR', description: 'Minor Repair (few shingles, sealant)', unit: 'each', priceLow: 300, priceHigh: 750, category: 'Repair' },
    { sku: 'ROOF-REPAIR-MAJOR', description: 'Major Repair (valley, flashing, deck)', unit: 'each', priceLow: 750, priceHigh: 2000, category: 'Repair' },
    { sku: 'ROOF-FLASHING', description: 'Chimney/Skylight Flashing Repair', unit: 'each', priceLow: 400, priceHigh: 1000, category: 'Repair' },
    { sku: 'ROOF-VENT', description: 'Roof Vent Install/Replacement', unit: 'each', priceLow: 200, priceHigh: 450, category: 'Repair' },
    { sku: 'ROOF-REPLACE-ASPH', description: 'Full Replacement — Architectural Shingle (per sq)', unit: 'sq', priceLow: 400, priceHigh: 650, category: 'Install' },
    { sku: 'ROOF-REPLACE-3TAB', description: 'Full Replacement — 3-Tab Shingle (per sq)', unit: 'sq', priceLow: 325, priceHigh: 500, category: 'Install' },
    { sku: 'ROOF-REPLACE-METAL', description: 'Full Replacement — Standing Seam Metal (per sq)', unit: 'sq', priceLow: 900, priceHigh: 1600, category: 'Install' },
    { sku: 'ROOF-TEAROFF', description: 'Tear-Off (per layer, per sq)', unit: 'sq', priceLow: 75, priceHigh: 150, category: 'Labor' },
    { sku: 'ROOF-DECK', description: 'Deck/Plywood Replacement (per sheet)', unit: 'each', priceLow: 75, priceHigh: 150, category: 'Repair' },
    { sku: 'ROOF-ICE-DAM', description: 'Ice Dam Removal (steaming, per hour)', unit: 'hour', priceLow: 250, priceHigh: 450, category: 'Service' },
    { sku: 'ROOF-ICE-SHIELD', description: 'Ice & Water Shield Upgrade (per sq)', unit: 'sq', priceLow: 75, priceHigh: 150, category: 'Install' },
    { sku: 'ROOF-GUTTER-5', description: 'Seamless Gutter Install — 5" (per ft)', unit: 'ft', priceLow: 8, priceHigh: 15, category: 'Install' },
    { sku: 'ROOF-GUTTER-6', description: 'Seamless Gutter Install — 6" (per ft)', unit: 'ft', priceLow: 10, priceHigh: 18, category: 'Install' },
    { sku: 'ROOF-GUTTER-GUARD', description: 'Gutter Guard Install (per ft)', unit: 'ft', priceLow: 7, priceHigh: 15, category: 'Install' },
    { sku: 'ROOF-SKYLIGHT', description: 'Skylight Replacement', unit: 'each', priceLow: 800, priceHigh: 1800, category: 'Install' },
    { sku: 'ROOF-STORM-TARP', description: 'Emergency Tarp (storm damage)', unit: 'each', priceLow: 300, priceHigh: 750, category: 'Service' },
  ],
  checklists: [
    { name: 'Roof Replacement Checklist', items: [
      'Protect landscaping, siding, and AC unit',
      'Tear off to deck, inspect all sheathing',
      'Replace damaged decking (document sheets)',
      'Install ice & water shield (eaves, valleys)',
      'Install synthetic underlayment',
      'Install drip edge (eaves and rakes)',
      'Install starter shingles',
      'Install field shingles per manufacturer spec',
      'Install ridge vent / cap shingles',
      'Flash all penetrations, chimney, skylights',
      'Clean up: magnet sweep for nails (2x)',
      'Final walkthrough with homeowner + photos',
    ]},
    { name: 'Roof Inspection Checklist', items: [
      'Photograph all elevations from ground',
      'Walk roof (if safe) — note shingle condition',
      'Check for missing, cracked, or curling shingles',
      'Inspect flashing at chimney, vents, skylights',
      'Check valleys for wear and debris',
      'Inspect gutters and downspouts',
      'Check attic for leaks, daylight, ventilation',
      'Note moss/algae growth',
      'Estimate remaining roof life',
      'Provide written report with photos',
    ]},
  ],
  jobTypes: ['Full Replacement', 'Roof Repair', 'Inspection', 'Gutter Install', 'Ice Dam Removal', 'Storm Damage', 'Skylight Work', 'Maintenance'],
  quoteNotes: [
    'Free inspections and estimates. Storm damage assistance with insurance claims available.',
    'All replacements include tear-off, ice & water shield, underlayment, and manufacturer warranty registration.',
    'Workmanship warranty: 10 years on full replacements, 2 years on repairs.',
    'We handle permit and dumpster. Price includes disposal fees.',
  ],
},

/* ============================== PAINTING ============================== */
painting: {
  id: 'painting',
  name: 'Painting',
  tagline: 'Interior & exterior painting',
  priceBook: [
    { sku: 'PAINT-ROOM-STD', description: 'Interior Room — Standard (walls only, ~12x12)', unit: 'each', priceLow: 300, priceHigh: 600, category: 'Interior' },
    { sku: 'PAINT-ROOM-FULL', description: 'Interior Room — Walls + Ceiling + Trim', unit: 'each', priceLow: 500, priceHigh: 1000, category: 'Interior' },
    { sku: 'PAINT-WALL-ACCENT', description: 'Accent Wall', unit: 'each', priceLow: 150, priceHigh: 350, category: 'Interior' },
    { sku: 'PAINT-CEILING', description: 'Ceiling Repaint (per room)', unit: 'each', priceLow: 200, priceHigh: 450, category: 'Interior' },
    { sku: 'PAINT-TRIM', description: 'Trim/Door Repaint (per door or per room trim)', unit: 'each', priceLow: 75, priceHigh: 200, category: 'Interior' },
    { sku: 'PAINT-CABINET', description: 'Cabinet Refinishing (per linear ft)', unit: 'ft', priceLow: 75, priceHigh: 150, category: 'Interior' },
    { sku: 'PAINT-DRYWALL-PATCH', description: 'Drywall Patch & Repair (per patch)', unit: 'each', priceLow: 75, priceHigh: 200, category: 'Interior' },
    { sku: 'PAINT-EXT-HOUSE', description: 'Exterior Full House (siding, ~1500-2000 sq ft)', unit: 'each', priceLow: 3000, priceHigh: 7000, category: 'Exterior' },
    { sku: 'PAINT-EXT-TRIM', description: 'Exterior Trim Only (fascia, soffit, windows)', unit: 'each', priceLow: 1200, priceHigh: 3000, category: 'Exterior' },
    { sku: 'PAINT-DECK-STAIN', description: 'Deck Stain/Seal (per sq ft)', unit: 'sqft', priceLow: 2, priceHigh: 5, category: 'Exterior' },
    { sku: 'PAINT-FENCE', description: 'Fence Stain/Paint (per linear ft)', unit: 'ft', priceLow: 4, priceHigh: 10, category: 'Exterior' },
    { sku: 'PAINT-PRESSURE', description: 'Pressure Washing (per sq ft)', unit: 'sqft', priceLow: 0.25, priceHigh: 0.5, category: 'Exterior' },
    { sku: 'PAINT-POPCORN', description: 'Popcorn Ceiling Removal (per sq ft)', unit: 'sqft', priceLow: 1.5, priceHigh: 3, category: 'Interior' },
    { sku: 'PAINT-WALLPAPER', description: 'Wallpaper Removal (per room)', unit: 'each', priceLow: 300, priceHigh: 700, category: 'Interior' },
    { sku: 'PAINT-COLOR-CONSULT', description: 'Color Consultation', unit: 'each', priceLow: 0, priceHigh: 150, category: 'Service' },
  ],
  checklists: [
    { name: 'Interior Room Paint Checklist', items: [
      'Move/cover furniture, lay drop cloths',
      'Remove outlet covers, switch plates, fixtures',
      'Fill nail holes, caulk gaps, sand smooth',
      'Spot-prime patches and bare areas',
      'Cut in ceiling line and corners',
      'Roll walls (2 coats, back-roll for coverage)',
      'Paint trim and doors (if included)',
      'Touch up, check in natural and artificial light',
      'Reinstall covers and fixtures',
      'Clean up, walkthrough with homeowner',
    ]},
    { name: 'Exterior Paint Checklist', items: [
      'Pressure wash all surfaces, allow to dry',
      'Scrape loose/peeling paint to solid edge',
      'Sand feather edges, spot-prime bare wood',
      'Caulk gaps at trim, windows, penetrations',
      'Mask windows, doors, fixtures, landscaping',
      'Apply primer coat where needed',
      'Apply 2 finish coats (spray + back-roll/brush)',
      'Paint/stain trim, shutters, doors per scope',
      'Unmask, touch up, final inspection',
      'Full cleanup and walkthrough',
    ]},
  ],
  jobTypes: ['Interior Room', 'Whole Interior', 'Exterior House', 'Cabinet Refinishing', 'Deck/Fence Stain', 'Drywall Repair + Paint', 'Color Consult', 'Commercial'],
  quoteNotes: [
    'Free color consultation with every project. Two finish coats standard.',
    'We use premium paints (Sherwin-Williams / Benjamin Moore) unless specified.',
    'Furniture moved and floors/furnishings fully protected.',
    '2-year workmanship warranty on all paint work.',
  ],
},

/* ============================== LANDSCAPING ============================== */
landscaping: {
  id: 'landscaping',
  name: 'Landscaping / Lawn Care',
  tagline: 'Mowing, beds, mulch, and landscape installs',
  priceBook: [
    { sku: 'LAND-MOW-STD', description: 'Weekly Mowing (standard lot, per visit)', unit: 'visit', priceLow: 40, priceHigh: 65, category: 'Maintenance' },
    { sku: 'LAND-MOW-LARGE', description: 'Weekly Mowing (large/acreage, per visit)', unit: 'visit', priceLow: 65, priceHigh: 120, category: 'Maintenance' },
    { sku: 'LAND-MOW-ONE', description: 'One-Time Mow / Cleanup Cut', unit: 'each', priceLow: 60, priceHigh: 120, category: 'Maintenance' },
    { sku: 'LAND-TRIM-EDGE', description: 'Trimming + Edging (add-on per visit)', unit: 'visit', priceLow: 15, priceHigh: 30, category: 'Maintenance' },
    { sku: 'LAND-FERT', description: 'Fertilizer Application (per visit, 4-5x/yr program)', unit: 'visit', priceLow: 50, priceHigh: 100, category: 'Maintenance' },
    { sku: 'LAND-WEED', description: 'Weed Control Application', unit: 'each', priceLow: 50, priceHigh: 100, category: 'Maintenance' },
    { sku: 'LAND-AERATE', description: 'Core Aeration', unit: 'each', priceLow: 100, priceHigh: 200, category: 'Maintenance' },
    { sku: 'LAND-OVERSEED', description: 'Overseeding', unit: 'each', priceLow: 150, priceHigh: 350, category: 'Maintenance' },
    { sku: 'LAND-MULCH', description: 'Mulch Install (per cubic yard, installed)', unit: 'yd', priceLow: 65, priceHigh: 110, category: 'Install' },
    { sku: 'LAND-ROCK', description: 'Decorative Rock Install (per ton, installed)', unit: 'ton', priceLow: 150, priceHigh: 300, category: 'Install' },
    { sku: 'LAND-BED-CLEAN', description: 'Spring/Fall Bed Cleanup', unit: 'each', priceLow: 150, priceHigh: 400, category: 'Maintenance' },
    { sku: 'LAND-HEDGE', description: 'Hedge/Shrub Trimming (per shrub)', unit: 'each', priceLow: 25, priceHigh: 60, category: 'Maintenance' },
    { sku: 'LAND-TREE-SMALL', description: 'Small Tree/Shrub Planting (installed)', unit: 'each', priceLow: 150, priceHigh: 400, category: 'Install' },
    { sku: 'LAND-SOD', description: 'Sod Install (per sq ft, installed)', unit: 'sqft', priceLow: 1.5, priceHigh: 3, category: 'Install' },
    { sku: 'LAND-RETAIN', description: 'Retaining Wall (per sq ft face)', unit: 'sqft', priceLow: 25, priceHigh: 50, category: 'Install' },
    { sku: 'LAND-PAVER', description: 'Paver Patio/Walkway (per sq ft)', unit: 'sqft', priceLow: 15, priceHigh: 30, category: 'Install' },
    { sku: 'LAND-DRAIN', description: 'Drainage Solution (french drain, per ft)', unit: 'ft', priceLow: 25, priceHigh: 50, category: 'Install' },
    { sku: 'LAND-SPRING-CLEAN', description: 'Spring Cleanup (full yard)', unit: 'each', priceLow: 200, priceHigh: 500, category: 'Maintenance' },
    { sku: 'LAND-FALL-CLEAN', description: 'Fall Cleanup + Leaf Removal', unit: 'each', priceLow: 200, priceHigh: 500, category: 'Maintenance' },
  ],
  checklists: [
    { name: 'Weekly Mow Visit Checklist', items: [
      'Mow at proper height for grass type/season',
      'Trim around trees, fences, beds, structures',
      'Edge sidewalks and driveway',
      'Blow clippings off hard surfaces',
      'Check for weeds, bare spots, issues — note them',
      'Empty trash/debris from lawn',
      'Lock gates on departure',
    ]},
    { name: 'Spring Cleanup Checklist', items: [
      'Remove winter debris, sticks, leaves',
      'Cut back perennials and ornamental grasses',
      'Edge all beds',
      'Apply pre-emergent to beds',
      'Fresh mulch where needed (measure first)',
      'Inspect irrigation, test zones',
      'Fertilizer application (if scheduled)',
      'Note drainage or turf issues for quote',
    ]},
  ],
  jobTypes: ['Weekly Mowing', 'Fertilizer Program', 'Spring Cleanup', 'Fall Cleanup', 'Mulch Install', 'Landscape Install', 'Hedge Trimming', 'Sod Install', 'Drainage'],
  quoteNotes: [
    'Mowing programs billed monthly. Service skips for drought/rain credited or rescheduled.',
    'Plant material warrantied 1 year with proper watering (watering guide provided).',
    'Underground utilities marked before any digging (Gopher One / 811).',
    'Estimates include materials, delivery, labor, and cleanup.',
  ],
},

/* ============================== GENERAL CONTRACTOR ============================== */
general: {
  id: 'general',
  name: 'General Contractor / Handyman',
  tagline: 'Remodels, repairs, and honey-do lists',
  priceBook: [
    { sku: 'GC-HOURLY', description: 'Handyman Hourly Rate', unit: 'hour', priceLow: 65, priceHigh: 110, category: 'Labor' },
    { sku: 'GC-HALFDAY', description: 'Half-Day Rate (4 hrs)', unit: 'each', priceLow: 250, priceHigh: 400, category: 'Labor' },
    { sku: 'GC-FULLDAY', description: 'Full-Day Rate (8 hrs)', unit: 'each', priceLow: 450, priceHigh: 750, category: 'Labor' },
    { sku: 'GC-DRYWALL-PATCH', description: 'Drywall Patch (small)', unit: 'each', priceLow: 100, priceHigh: 250, category: 'Repair' },
    { sku: 'GC-DRYWALL-ROOM', description: 'Drywall Hang + Finish (per room)', unit: 'each', priceLow: 800, priceHigh: 2000, category: 'Remodel' },
    { sku: 'GC-DOOR-INT', description: 'Interior Door Install (pre-hung)', unit: 'each', priceLow: 250, priceHigh: 500, category: 'Install' },
    { sku: 'GC-DOOR-EXT', description: 'Exterior Door Install', unit: 'each', priceLow: 500, priceHigh: 1200, category: 'Install' },
    { sku: 'GC-TRIM', description: 'Trim/Baseboard Install (per linear ft)', unit: 'ft', priceLow: 4, priceHigh: 10, category: 'Install' },
    { sku: 'GC-FLOOR-LVP', description: 'LVP/Laminate Install (per sq ft)', unit: 'sqft', priceLow: 3, priceHigh: 7, category: 'Install' },
    { sku: 'GC-FLOOR-TILE', description: 'Tile Install (per sq ft)', unit: 'sqft', priceLow: 8, priceHigh: 18, category: 'Install' },
    { sku: 'GC-BATH-REMODEL', description: 'Bathroom Remodel (full gut, standard)', unit: 'each', priceLow: 8000, priceHigh: 18000, category: 'Remodel' },
    { sku: 'GC-BATH-REFRESH', description: 'Bathroom Refresh (fixtures, paint, no gut)', unit: 'each', priceLow: 2500, priceHigh: 6000, category: 'Remodel' },
    { sku: 'GC-KITCHEN-REFRESH', description: 'Kitchen Refresh (no layout change)', unit: 'each', priceLow: 5000, priceHigh: 15000, category: 'Remodel' },
    { sku: 'GC-DECK', description: 'Deck Build (per sq ft, composite)', unit: 'sqft', priceLow: 25, priceHigh: 50, category: 'Install' },
    { sku: 'GC-FENCE', description: 'Fence Install (per linear ft, wood)', unit: 'ft', priceLow: 25, priceHigh: 50, category: 'Install' },
    { sku: 'GC-SIDING', description: 'Siding Repair (per sq)', unit: 'sq', priceLow: 400, priceHigh: 800, category: 'Repair' },
    { sku: 'GC-WINDOW', description: 'Window Replacement (per window)', unit: 'each', priceLow: 400, priceHigh: 900, category: 'Install' },
    { sku: 'GC-GUTTER-CLEAN', description: 'Gutter Cleaning', unit: 'each', priceLow: 150, priceHigh: 300, category: 'Maintenance' },
  ],
  checklists: [
    { name: 'Handyman Visit Checklist', items: [
      'Walk through full task list with homeowner',
      'Confirm materials on hand / pick up as needed',
      'Protect floors and furnishings in work area',
      'Complete tasks in agreed priority order',
      'Test all repairs (doors, fixtures, etc.)',
      'Clean up work area completely',
      'Walkthrough with homeowner, note any follow-ups',
      'Photo completed work',
    ]},
    { name: 'Remodel Punch List', items: [
      'All fixtures installed and operational',
      'Paint touch-ups complete',
      'Caulk lines clean at all transitions',
      'Hardware aligned and tightened',
      'Electrical covers and plates installed',
      'Floors cleaned, protection removed',
      'Debris hauled, dumpster scheduled for pickup',
      'Final walkthrough + signed acceptance',
    ]},
  ],
  jobTypes: ['Honey-Do List', 'Drywall Repair', 'Bathroom Remodel', 'Kitchen Refresh', 'Flooring Install', 'Deck/Fence', 'Door/Window', 'Storm Repair', 'Punch List'],
  quoteNotes: [
    'Time-and-materials or fixed bid — your choice. Fixed bids include detailed scope.',
    'Change orders priced and approved in writing before work begins.',
    'Licensed and insured. Permits pulled where required (billed at cost).',
    '1-year workmanship warranty on all completed work.',
  ],
},

/* ============================== SNOW REMOVAL ============================== */
snow: {
  id: 'snow',
  name: 'Snow Removal',
  tagline: 'Driveways, lots, and sidewalks',
  priceBook: [
    { sku: 'SNOW-DRIVE-PUSH', description: 'Driveway Plow (per push, standard)', unit: 'push', priceLow: 35, priceHigh: 65, category: 'Plowing' },
    { sku: 'SNOW-DRIVE-LARGE', description: 'Driveway Plow (per push, large/circle)', unit: 'push', priceLow: 55, priceHigh: 100, category: 'Plowing' },
    { sku: 'SNOW-SEASON-RES', description: 'Seasonal Contract — Residential', unit: 'season', priceLow: 400, priceHigh: 800, category: 'Contract' },
    { sku: 'SNOW-SEASON-COMM', description: 'Seasonal Contract — Commercial (per lot)', unit: 'season', priceLow: 1500, priceHigh: 5000, category: 'Contract' },
    { sku: 'SNOW-LOT-PUSH', description: 'Parking Lot Plow (per push)', unit: 'push', priceLow: 150, priceHigh: 400, category: 'Plowing' },
    { sku: 'SNOW-SIDEWALK', description: 'Sidewalk Clearing (per visit)', unit: 'visit', priceLow: 25, priceHigh: 60, category: 'Shoveling' },
    { sku: 'SNOW-SHOVEL-HR', description: 'Hand Shoveling (per hour)', unit: 'hour', priceLow: 50, priceHigh: 85, category: 'Shoveling' },
    { sku: 'SNOW-SALT-DRIVE', description: 'Salt/Ice Melt — Driveway (per application)', unit: 'each', priceLow: 20, priceHigh: 45, category: 'De-icing' },
    { sku: 'SNOW-SALT-LOT', description: 'Salt — Parking Lot (per application)', unit: 'each', priceLow: 75, priceHigh: 200, category: 'De-icing' },
    { sku: 'SNOW-HAUL', description: 'Snow Hauling (per load)', unit: 'load', priceLow: 150, priceHigh: 350, category: 'Hauling' },
    { sku: 'SNOW-ROOF-RAKE', description: 'Roof Raking (per hour)', unit: 'hour', priceLow: 75, priceHigh: 125, category: 'Roof' },
    { sku: 'SNOW-STAKE', description: 'Driveway Marker Install (per season)', unit: 'each', priceLow: 25, priceHigh: 50, category: 'Service' },
    { sku: 'SNOW-TRIGGER', description: 'Trigger Depth (standard contract terms)', unit: 'each', priceLow: 2, priceHigh: 2, category: 'Terms' },
  ],
  checklists: [
    { name: 'Plow Route Checklist', items: [
      'Check route list and trigger depth before dispatch',
      'Verify truck: plow, salt, fuel, lights, beacon',
      'Plow with the storm (don\'t let it pile up)',
      'Clear to pavement on drives, stack snow off to sides',
      'Don\'t block mailboxes, hydrants, or sidewalks',
      'Salt/ice melt high-traffic and slope areas',
      'Photo any damage or obstacles encountered',
      'Log start/end time per stop for billing',
      'Report missed or inaccessible drives immediately',
    ]},
    { name: 'Pre-Season Setup Checklist', items: [
      'Inspect plow: cutting edge, hydraulics, lights',
      'Service truck: fluids, tires, battery, 4WD',
      'Stock salt/sand supply',
      'Install driveway markers for all contract customers',
      'Confirm customer list, addresses, trigger depths',
      'Test GPS tracking and route app',
      'Review damage policy with crew',
      'Send season kickoff message to customers',
    ]},
  ],
  jobTypes: ['Seasonal Contract', 'Per-Push Plowing', 'Sidewalk Clearing', 'Salting/De-icing', 'Snow Hauling', 'Roof Raking', 'Emergency Call'],
  quoteNotes: [
    'Standard trigger: 2 inches. Service typically completed within 12 hours of storm end.',
    'Seasonal contracts cover Nov 15 – Apr 15. Per-push billed within 48 hours.',
    'We are not liable for damage to unmarked obstacles, gravel displacement, or turf damage from normal plowing.',
    'Salt/ice melt available as add-on per application.',
  ],
},

/* ============================== APPLIANCE REPAIR ============================== */
appliance: {
  id: 'appliance',
  name: 'Appliance Repair',
  tagline: 'Washers, dryers, fridges, ovens & dishwashers',
  priceBook: [
    { sku: 'APP-DIAG', description: 'Diagnostic Fee (waived with repair)', unit: 'each', priceLow: 75, priceHigh: 125, category: 'Service' },
    { sku: 'APP-WASH-PUMP', description: 'Washer Drain Pump Replacement', unit: 'each', priceLow: 200, priceHigh: 375, category: 'Repair' },
    { sku: 'APP-WASH-BELT', description: 'Washer Belt Replacement', unit: 'each', priceLow: 150, priceHigh: 275, category: 'Repair' },
    { sku: 'APP-WASH-VALVE', description: 'Washer Water Inlet Valve', unit: 'each', priceLow: 175, priceHigh: 325, category: 'Repair' },
    { sku: 'APP-DRY-ELEMENT', description: 'Dryer Heating Element', unit: 'each', priceLow: 175, priceHigh: 350, category: 'Repair' },
    { sku: 'APP-DRY-BELT', description: 'Dryer Belt + Idler Pulley', unit: 'each', priceLow: 150, priceHigh: 275, category: 'Repair' },
    { sku: 'APP-DRY-VENT', description: 'Dryer Vent Cleaning', unit: 'each', priceLow: 100, priceHigh: 200, category: 'Maintenance' },
    { sku: 'APP-FRIDGE-DEFROST', description: 'Refrigerator Defrost System Repair', unit: 'each', priceLow: 250, priceHigh: 450, category: 'Repair' },
    { sku: 'APP-FRIDGE-ICEMAKER', description: 'Ice Maker Replacement', unit: 'each', priceLow: 250, priceHigh: 450, category: 'Repair' },
    { sku: 'APP-FRIDGE-SEAL', description: 'Door Gasket/Seal Replacement', unit: 'each', priceLow: 175, priceHigh: 350, category: 'Repair' },
    { sku: 'APP-FRIDGE-COMP', description: 'Compressor Replacement (sealed system)', unit: 'each', priceLow: 600, priceHigh: 1100, category: 'Repair' },
    { sku: 'APP-OVEN-IGNITER', description: 'Oven Igniter Replacement', unit: 'each', priceLow: 175, priceHigh: 325, category: 'Repair' },
    { sku: 'APP-OVEN-ELEMENT', description: 'Oven Bake/Broil Element', unit: 'each', priceLow: 150, priceHigh: 300, category: 'Repair' },
    { sku: 'APP-DISH-PUMP', description: 'Dishwasher Pump/Motor Assembly', unit: 'each', priceLow: 250, priceHigh: 450, category: 'Repair' },
    { sku: 'APP-DISH-RACK', description: 'Dishwasher Rack Replacement', unit: 'each', priceLow: 150, priceHigh: 300, category: 'Repair' },
    { sku: 'APP-INSTALL', description: 'Appliance Install (delivery hookup)', unit: 'each', priceLow: 150, priceHigh: 300, category: 'Install' },
    { sku: 'APP-HAUL', description: 'Old Appliance Haul-Away', unit: 'each', priceLow: 50, priceHigh: 100, category: 'Service' },
  ],
  checklists: [
    { name: 'Appliance Diagnostic Checklist', items: [
      'Confirm symptom with customer, note error codes',
      'Check power: outlet, breaker, cord condition',
      'Check water/gas connections as applicable',
      'Run diagnostic mode if available',
      'Test components with multimeter',
      'Quote repair with part numbers and labor',
      'Get approval before ordering parts',
      'After repair: run full cycle, verify fix',
      'Clean up, review maintenance tips with customer',
    ]},
  ],
  jobTypes: ['Washer Repair', 'Dryer Repair', 'Refrigerator Repair', 'Oven/Range Repair', 'Dishwasher Repair', 'Install', 'Maintenance'],
  quoteNotes: [
    'Diagnostic fee waived when you approve the repair.',
    'We service all major brands. OEM parts preferred; quality aftermarket available.',
    '90-day warranty on parts and labor.',
    'If unit is not economical to repair, diagnostic fee applies and we\'ll advise honestly.',
  ],
},

/* ============================== AUTO / EQUIPMENT REPAIR ============================== */
autorepair: {
  id: 'autorepair',
  name: 'Auto / Equipment Repair',
  tagline: 'Vehicles, small engine & equipment service',
  priceBook: [
    { sku: 'AUTO-DIAG', description: 'Diagnostic / Scan Fee', unit: 'each', priceLow: 75, priceHigh: 150, category: 'Service' },
    { sku: 'AUTO-OIL', description: 'Oil Change (conventional, up to 5 qt)', unit: 'each', priceLow: 40, priceHigh: 70, category: 'Maintenance' },
    { sku: 'AUTO-OIL-SYN', description: 'Oil Change (full synthetic)', unit: 'each', priceLow: 65, priceHigh: 110, category: 'Maintenance' },
    { sku: 'AUTO-BRAKE-PADS', description: 'Brake Pads (per axle)', unit: 'each', priceLow: 150, priceHigh: 300, category: 'Repair' },
    { sku: 'AUTO-BRAKE-FULL', description: 'Brakes — Pads + Rotors (per axle)', unit: 'each', priceLow: 300, priceHigh: 600, category: 'Repair' },
    { sku: 'AUTO-BATTERY', description: 'Battery Replacement (installed)', unit: 'each', priceLow: 150, priceHigh: 300, category: 'Repair' },
    { sku: 'AUTO-ALT', description: 'Alternator Replacement', unit: 'each', priceLow: 350, priceHigh: 700, category: 'Repair' },
    { sku: 'AUTO-STARTER', description: 'Starter Replacement', unit: 'each', priceLow: 300, priceHigh: 600, category: 'Repair' },
    { sku: 'AUTO-TIRE-ROT', description: 'Tire Rotation', unit: 'each', priceLow: 30, priceHigh: 60, category: 'Maintenance' },
    { sku: 'AUTO-ALIGN', description: 'Wheel Alignment', unit: 'each', priceLow: 90, priceHigh: 150, category: 'Maintenance' },
    { sku: 'AUTO-AC-RECHARGE', description: 'AC Recharge', unit: 'each', priceLow: 150, priceHigh: 300, category: 'Repair' },
    { sku: 'AUTO-BELT', description: 'Serpentine Belt Replacement', unit: 'each', priceLow: 125, priceHigh: 275, category: 'Repair' },
    { sku: 'AUTO-SPARK', description: 'Spark Plugs (set)', unit: 'each', priceLow: 150, priceHigh: 400, category: 'Maintenance' },
    { sku: 'AUTO-INSPECT', description: 'Pre-Purchase / Safety Inspection', unit: 'each', priceLow: 100, priceHigh: 200, category: 'Service' },
    { sku: 'AUTO-SMALL-TUNE', description: 'Small Engine Tune-Up (mower, blower)', unit: 'each', priceLow: 75, priceHigh: 150, category: 'Maintenance' },
    { sku: 'AUTO-SMALL-BLADE', description: 'Mower Blade Sharpen/Replacement', unit: 'each', priceLow: 30, priceHigh: 75, category: 'Maintenance' },
    { sku: 'AUTO-HOURLY', description: 'Shop Labor Rate (per hour)', unit: 'hour', priceLow: 90, priceHigh: 150, category: 'Labor' },
  ],
  checklists: [
    { name: 'Vehicle Intake Checklist', items: [
      'Record mileage, VIN, customer concern verbatim',
      'Photo existing damage (all sides)',
      'Check fluids: oil, coolant, brake, transmission, washer',
      'Check tire condition and pressures',
      'Scan for codes, record all DTCs',
      'Test drive if safe and relevant',
      'Provide written estimate before any work',
      'Get signed approval for repairs over $100',
    ]},
    { name: 'Oil Change Checklist', items: [
      'Verify correct oil type and capacity',
      'Drain oil, replace drain plug washer',
      'Replace oil filter',
      'Fill to spec, check dipstick',
      'Reset maintenance reminder',
      'Top off washer fluid, check other fluids',
      'Check tire pressures',
      'Inspect belts and hoses visually',
      'Sticker with next service mileage/date',
    ]},
  ],
  jobTypes: ['Diagnostic', 'Oil Change', 'Brake Service', 'Battery/Electrical', 'AC Service', 'Tire Service', 'Inspection', 'Small Engine'],
  quoteNotes: [
    'Written estimate provided before work begins. No surprises.',
    'We use OEM or OEM-equivalent parts. Customer-supplied parts installed at labor rate (no parts warranty).',
    '12-month / 12,000-mile warranty on parts and labor.',
    'Diagnostic fee applied toward approved repair.',
  ],
},

};

/* Map onboarding business-type labels to trade package ids */
const BUSINESS_TYPE_TO_TRADE = {
  'HVAC': 'hvac',
  'Plumbing': 'plumbing',
  'Electrical': 'electrical',
  'Roofing': 'roofing',
  'Painting': 'painting',
  'Lawn Care & Landscaping': 'landscaping',
  'Snow Removal': 'snow',
  'General Contractor': 'general',
  'Home Services': 'general',
  'Cleaning Services': null,
  'Machine Shop': null,
  'Other': null,
};

/**
 * Load a trade package into the current business.
 * - Adds price book items (skips SKUs already present)
 * - Saves checklist templates to localStorage (per business)
 * - Saves job types + quote notes to business settings
 * Returns { added: n, skipped: n }
 */
async function loadTradePackage(tradeId, options){
  options = options || {};
  const pkg = TRADE_PACKAGES[tradeId];
  if(!pkg) throw new Error('Unknown trade package: ' + tradeId);
  if(typeof records !== 'function') throw new Error('Office data layer not ready.');
  if(!state || !state.businessId) throw new Error('Open a business first.');

  const existingSkus = new Set(
    records('priceBook').map(function(r){
      return String(v(r,'SKU','sku') || '').toUpperCase();
    })
  );

  let added = 0, skipped = 0;
  for(const item of pkg.priceBook){
    const sku = String(item.sku || '').toUpperCase();
    if(existingSkus.has(sku)){ skipped++; continue; }
    const mid = Math.round(((item.priceLow + item.priceHigh) / 2) * 100) / 100;
    const id = newId('PRICE');
    const record = {
      'Item ID': id,
      'Business ID': state.businessId,
      'SKU': item.sku,
      'Description': item.description,
      'Category': item.category || '',
      'Unit of Measure': item.unit || 'each',
      'Selling Price': mid,
      'Price Low': item.priceLow,
      'Price High': item.priceHigh,
      'Source': 'trade-package:' + tradeId,
      'Owner Review Required': true,
      'Created Time': now(),
      'Updated Time': now(),
      'Record Version': 1,
    };
    await queueOperation('SAVE_ENTITY','Price Book Item',id,
      { entity:'priceBook', record: record },
      { collection:'priceBook', record:record, idKeys:['Item ID'] },
      false /* no auto-sync; caller batches */
    );
    existingSkus.add(sku);
    added++;
  }

  /* Save checklists, job types, quote notes per-business in localStorage */
  const storeKey = 'h38-trade-package-' + state.businessId;
  let stored = {};
  try{ stored = JSON.parse(localStorage.getItem(storeKey) || '{}'); }catch(e){ stored = {}; }
  stored.tradeId = tradeId;
  stored.tradeName = pkg.name;
  stored.loadedAt = new Date().toISOString();
  stored.checklists = pkg.checklists;
  stored.jobTypes = pkg.jobTypes;
  stored.quoteNotes = pkg.quoteNotes;
  try{ localStorage.setItem(storeKey, JSON.stringify(stored)); }catch(e){ /* storage full etc. */ }

  return { added: added, skipped: skipped, tradeName: pkg.name };
}

/** Get the loaded trade package info for the current business (or null). */
function getLoadedTradePackage(){
  try{
    if(!state || !state.businessId) return null;
    const raw = localStorage.getItem('h38-trade-package-' + state.businessId);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

/** Suggest a trade package id for an onboarding business-type label. */
function suggestTradeForBusinessType(businessType){
  return BUSINESS_TYPE_TO_TRADE[businessType] || null;
}

/* Expose globally */
window.TRADE_PACKAGES = TRADE_PACKAGES;
window.H38TradePackages = {
  packages: TRADE_PACKAGES,
  load: loadTradePackage,
  getLoaded: getLoadedTradePackage,
  suggestFor: suggestTradeForBusinessType,
  list: function(){
    return Object.keys(TRADE_PACKAGES).map(function(id){
      return { id:id, name:TRADE_PACKAGES[id].name, tagline:TRADE_PACKAGES[id].tagline,
               items:TRADE_PACKAGES[id].priceBook.length };
    });
  },
};

})();
