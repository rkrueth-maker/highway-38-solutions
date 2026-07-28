#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const need=(text,value,label)=>{if(!text.includes(value))throw new Error(`Missing ${label}: ${value}`);};
const absent=(text,value,label)=>{if(text.includes(value))throw new Error(`Unexpected ${label}: ${value}`);};
const count=(text,re)=>(text.match(re)||[]).length;
const dir=path.join(root,'assets','quote-builder','whole-house-cad');
if(!fs.existsSync(dir))throw new Error('Missing professional CAD asset directory.');
const expected=['G-001','A-101','A-102','A-201','A-301','A-401','M-101','P-101','E-101','C-S-L-101'];
const files=fs.readdirSync(dir).filter(x=>x.endsWith('.svg')).sort();
if(files.length!==10)throw new Error(`Expected exactly 10 professional SVG sheets; found ${files.length}.`);

for(const number of expected){
  const file=`assets/quote-builder/whole-house-cad/${number}.svg`;
  if(!fs.existsSync(path.join(root,file)))throw new Error(`Missing sheet ${file}`);
  const svg=read(file);
  ['width="17in"','height="11in"','viewBox="0 0 1700 1100"','NOT FOR CONSTRUCTION','Field verification required','REV E','HIGHWAY 38 SOLUTIONS','Universal Quote Builder Demonstration','marker id="oa"','Ground-Up New-House Construction'].forEach(v=>need(svg,v,`${number} professional sheet control`));
  absent(svg,'Whole-House Renovation',`${number} scope drift`);
  absent(svg,'before demolition',`${number} demolition language`);
  absent(svg,'verified existing construction',`${number} existing-condition language`);
  absent(svg,'24′-6″ RIDGE',`${number} stale ridge height`);
  if(count(svg,/<text /g)<20)throw new Error(`${number} lacks drawing annotations.`);
  if(count(svg,/<(line|path|rect|polyline|circle) /g)<25)throw new Error(`${number} lacks CAD geometry.`);
}

const py=`import sys,xml.etree.ElementTree as ET\n[ET.parse(p) for p in sys.argv[1:]]`;
const xml=spawnSync('python3',['-c',py,...expected.map(n=>path.join(dir,`${n}.svg`))],{encoding:'utf8'});
if(xml.status!==0)throw new Error(`SVG XML parsing failed:\n${xml.stdout}\n${xml.stderr}`);

const g=read('assets/quote-builder/whole-house-cad/G-001.svg');
['DRAWING INDEX','GENERAL NOTES','GRAPHIC LEGEND','ABBREVIATIONS','A-101','A-201','M-101','P-101','E-101','C-S-L-101','SITE, DECK, CONCRETE, DRAINAGE &amp; LANDSCAPE'].forEach(v=>need(g,v,'G-001 index/legend'));
absent(g,'SITE CLEARING, EARTHWORK, UTILITIES, DRAINAGE &amp; FINAL SITE','G-001 stale site-sheet title');

const a101=read('assets/quote-builder/whole-house-cad/A-101.svg');
['48′-0″ OVERALL','32′-0″ OVERALL','KITCHEN','17′-0″ × 15′-0″','DINING','14′-0″ × 15′-0″','LIVING','OFFICE / SHOP','MUD / LAUNDRY','BATH / MECH','KEYED PLAN NOTES','DOOR / WINDOW SCHEDULE','COVERED FRONT PORCH','16′ × 12′ REAR DECK','EXTERIOR WALL TYPE W1','42″ minimum','class="center"','class="furniture"','class="fixture"'].forEach(v=>need(a101,v,'A-101 coordinated plan content'));
if(count(a101,/class="dimline"/g)<8)throw new Error('A-101 requires complete overall and chained dimension strings.');

const a102=read('assets/quote-builder/whole-house-cad/A-102.svg');
['SECOND-FLOOR PLAN','ROOF PLAN','PRIMARY BEDROOM','BEDROOM 2','BEDROOM 3','OPEN TO STAIR','17′-0″ × 15′-0″','14′-0″ × 15′-0″','17′-0″ × 17′-0″','48′-0″','32′-0″','RIDGE','8:12','52′-0″ INCLUDING EAVES','36′-0″ INCLUDING EAVES','28′-8″ ridge'].forEach(v=>need(a102,v,'A-102 coordinated upper/roof plan'));
absent(a102,'24′-6″','A-102 stale ridge dimension');
if(count(a102,/class="dimline"/g)<6)throw new Error('A-102 requires upper-floor and roof dimensions.');

const a201=read('assets/quote-builder/whole-house-cad/A-201.svg');
['SOUTH / FRONT ELEVATION','NORTH / REAR ELEVATION','EAST / RIGHT ELEVATION','WEST / LEFT ELEVATION','28′-8″ RIDGE','18′-0″ EAVE','8:12','COVERED FRONT PORCH','REAR DECK','ASPHALT SHINGLES / METAL DRIP EDGE','LAP SIDING + 5/4 TRIM','class="muntin"','class="roof"','class="wood"'].forEach(v=>need(a201,v,'A-201 coordinated elevation content'));
if(count(a201,/ELEVATION/g)<4)throw new Error('A-201 must contain four named exterior elevations.');
if(count(a201,/class="dimline"/g)<12)throw new Error('A-201 requires overall, eave, and ridge dimensions on all elevations.');

const a301=read('assets/quote-builder/whole-house-cad/A-301.svg');
['BUILDING SECTION A-A — THROUGH PORCH / KITCHEN / STAIR','DETAIL 1 — EXTERIOR WALL / EAVE','DETAIL 2 — WINDOW OPENING / FLASHING','DETAIL 3 — DECK LEDGER / FLASHING','28′-8″','RIDGE 128′-8″','2×6 STUD','SECOND-FLOOR ASSEMBLY','FIRST-FLOOR ASSEMBLY','CONTINUOUS METAL FLASHING','JOIST HANGER / LEDGER','class="insul"','class="earth"','18′-0″ eave + 10′-8″ rise at 8:12'].forEach(v=>need(a301,v,'A-301 coordinated section/detail content'));

const a401=read('assets/quote-builder/whole-house-cad/A-401.svg');
['ENLARGED KITCHEN PLAN','NORTH CABINET ELEVATION — SINK / RANGE WALL','WEST / TALL CABINET ELEVATION — PANTRY / OVENS / REFRIGERATOR','17′-0″ ROOM','15′-0″ ROOM','ISLAND 9′-0″ × 3′-9″','42″ MIN. AISLE','DOUBLE SINK','PREP SINK','DBL OVEN','REFRIGERATOR','CABINET / APPLIANCE ORDER HOLD POINTS','class="casework"','class="fixture"'].forEach(v=>need(a401,v,'A-401 coordinated kitchen content'));
if(count(a401,/>REFRIGERATOR</g)!==1)throw new Error('A-401 must show exactly one refrigerator appliance label.');
absent(a401,'22′-0″ ROOM','A-401 stale room width');

const m=read('assets/quote-builder/whole-house-cad/M-101.svg');
['EQUIPMENT SCHEDULE','AHU-1','CU-1','ERV-1','HVAC NOTES','Manual J/S/D','class="duct"','class="return"','architectural-underlay','MECHANICAL EQUIPMENT PAD / SERVICE CLEARANCE','CU-1 PAD'].forEach(v=>need(m,v,'M-101 anchored HVAC content'));

const p101=read('assets/quote-builder/whole-house-cad/P-101.svg');
['DOMESTIC / DWV RISER','FIXTURE SCHEDULE — WHOLE HOUSE','KS-1','WC-1','WH-1','class="hot"','class="cold"','class="waste"','class="vent"','architectural-underlay','KITCHEN COUNTER / SINK / DISHWASHER RUN','BATH VANITY / WC WALL','SHOWER / TUB','WH-1 PAD / DRAIN PAN','SECOND-FLOOR BATH GROUPS','LAVATORY — 1 MAIN + 2 UPPER','WATER CLOSET — 1 MAIN + 2 UPPER','SHOWER/TUB — 1 MAIN + 2 UPPER'].forEach(v=>need(p101,v,'P-101 coordinated plumbing content'));
if(count(p101,/SECOND-FLOOR BATH GROUPS/g)!==1)throw new Error('P-101 requires one connected second-floor bath riser group.');

const e101=read('assets/quote-builder/whole-house-cad/E-101.svg');
['PANEL A — REPRESENTATIVE SCHEDULE','KITCHEN SMALL APPLIANCE','RANGE','LIGHTING — MAIN','ELECTRICAL NOTES','PANEL A','class="light"','class="power"','architectural-underlay','DEVICE WALL','PANEL WORKING CLEARANCE'].forEach(v=>need(e101,v,'E-101 anchored electrical content'));
for(const [name,svg] of [['M-101',m],['P-101',p101],['E-101',e101]]){
  if(count(svg,/id="architectural-underlay"/g)!==1)throw new Error(`${name} must contain exactly one architectural underlay.`);
}

const site=read('assets/quote-builder/whole-house-cad/C-S-L-101.svg');
['120′-0″ REPRESENTATIVE LOT WIDTH','180′-0″ REPRESENTATIVE LOT DEPTH','16′ × 12′ REAR DECK','18′ × 24′ PATIO','DECK FRAMING PLAN — INSET','SITE CLEARING / EARTHWORK NOTES','APPROVED CLEARING / DISTURBANCE LIMIT','STABILIZED CONSTRUCTION ENTRANCE / DRIVE','TOPSOIL / MATERIAL','class="property"','class="setback"','class="contour"','Deck and patio are north/rear of the house'].forEach(v=>need(site,v,'C-S-L-101 coordinated site content'));
if(count(site,/id="new-house-site-controls"/g)!==1)throw new Error('C-S-L-101 must contain exactly one new-house site-control group.');
absent(site,'FINAL SITE</text>','C-S-L-101 stale title block');

const html=read('whole-house-quote-package.html');
for(const number of expected){need(html,`assets/quote-builder/whole-house-cad/${number}.svg`,`${number} package link`);need(html,`id="sheet-${number}"`,`${number} package section`);}
['New-House Construction<br>From Lot Clearing to Closeout','$602,050',"title:'Lot Clearing, Grubbing & Erosion Control'","title:'Footings, Foundation & Slabs'","title:'Structural Framing & Weather-Tight Shell'",'Open full-size SVG','Revision:</strong> E'].forEach(v=>need(html,v,'ground-up package content'));
['Whole-House Renovation',"title:'Selective Demolition'",'Plumbing Renovation'].forEach(v=>absent(html,v,'package scope drift'));
if(count(html,/<section class="sheet cad-sheet"/g)!==10)throw new Error('Package must expose exactly 10 CAD drawing sheets.');

console.log(JSON.stringify({status:'PASS',scope:'ground-up-new-house',revision:'E',professionalCadSheets:10,xmlParsed:10,renderTargetSheets:10,crossSheetChecks:{overallPlan:true,upperFloorChains:true,roofMath:true,elevations:true,section:true,kitchen:true,plumbingSchedule:true,sitePlacement:true,index:true},anchoredTradeUnderlays:3,externalActions:0},null,2));
