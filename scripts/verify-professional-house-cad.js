#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const need=(text,value,label)=>{if(!text.includes(value))throw new Error(`Missing ${label}: ${value}`);};
const absent=(text,value,label)=>{if(text.includes(value))throw new Error(`Unexpected ${label}: ${value}`);};
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
  if((svg.match(/<text /g)||[]).length<20)throw new Error(`${number} lacks drawing annotations.`);
  if((svg.match(/<(line|path|rect|polyline|circle) /g)||[]).length<25)throw new Error(`${number} lacks CAD geometry.`);
}
const g=read('assets/quote-builder/whole-house-cad/G-001.svg');
['DRAWING INDEX','GENERAL NOTES','GRAPHIC LEGEND','ABBREVIATIONS','A-101','A-201','M-101','P-101','E-101','C-S-L-101'].forEach(v=>need(g,v,'G-001 index/legend'));
const a101=read('assets/quote-builder/whole-house-cad/A-101.svg');
['48′-0″ OVERALL','32′-0″ OVERALL','KITCHEN','DINING','LIVING','OFFICE / SHOP','MUD / LAUNDRY','BATH / MECH','KEYED PLAN NOTES','DOOR / WINDOW SCHEDULE','COVERED FRONT PORCH','REAR DECK','EXTERIOR WALL TYPE W1','42″ minimum','class="center"','class="furniture"','class="fixture"'].forEach(v=>need(a101,v,'A-101 detailed plan content'));
if((a101.match(/class="dimline"/g)||[]).length<8)throw new Error('A-101 requires complete overall and chained dimension strings.');
if((a101.match(/class="furniture"/g)||[]).length<10)throw new Error('A-101 requires furniture and equipment clearance content.');
const a102=read('assets/quote-builder/whole-house-cad/A-102.svg');
['SECOND-FLOOR PLAN','ROOF PLAN','PRIMARY BEDROOM','BEDROOM 2','BEDROOM 3','RIDGE','8:12','52′-0″ INCLUDING EAVES'].forEach(v=>need(a102,v,'A-102 upper/roof plan'));
if((a102.match(/class="dimline"/g)||[]).length<4)throw new Error('A-102 requires upper-floor and roof dimensions.');
const a201=read('assets/quote-builder/whole-house-cad/A-201.svg');
['SOUTH / FRONT ELEVATION','NORTH / REAR ELEVATION','EAST / RIGHT ELEVATION','WEST / LEFT ELEVATION','24′-6″ RIDGE','18′-0″ EAVE','8:12','COVERED FRONT PORCH','CHIMNEY','ASPHALT SHINGLES / METAL DRIP EDGE','LAP SIDING + 5/4 TRIM','class="muntin"','class="roof"','class="wood"'].forEach(v=>need(a201,v,'A-201 enhanced elevation content'));
if((a201.match(/ELEVATION/g)||[]).length<4)throw new Error('A-201 must contain four named exterior elevations.');
if((a201.match(/class="dimline"/g)||[]).length<12)throw new Error('A-201 requires overall, eave, and ridge dimensions on all elevations.');
const a301=read('assets/quote-builder/whole-house-cad/A-301.svg');
['BUILDING SECTION A-A — THROUGH PORCH / KITCHEN / STAIR','DETAIL 1 — EXTERIOR WALL / EAVE','DETAIL 2 — WINDOW OPENING / FLASHING','DETAIL 3 — DECK LEDGER / FLASHING','24′-6″','2×6 STUD','SECOND-FLOOR ASSEMBLY','FIRST-FLOOR ASSEMBLY','CONTINUOUS METAL FLASHING','JOIST HANGER / LEDGER','class="insul"','class="earth"'].forEach(v=>need(a301,v,'A-301 enhanced section/detail content'));
const a401=read('assets/quote-builder/whole-house-cad/A-401.svg');
['ENLARGED KITCHEN PLAN','NORTH CABINET ELEVATION — SINK / RANGE WALL','WEST / TALL CABINET ELEVATION — PANTRY / OVENS / REFRIGERATOR','ISLAND 9′-0″ × 3′-9″','42″ MIN. AISLE','DOUBLE SINK','PREP SINK','DBL OVEN','REFRIGERATOR','CABINET / APPLIANCE ORDER HOLD POINTS','class="casework"','class="fixture"'].forEach(v=>need(a401,v,'A-401 enhanced kitchen content'));
const m=read('assets/quote-builder/whole-house-cad/M-101.svg');
['EQUIPMENT SCHEDULE','AHU-1','CU-1','ERV-1','HVAC NOTES','Manual J/S/D','class="duct"','class="return"','architectural-underlay','MECHANICAL EQUIPMENT PAD / SERVICE CLEARANCE','CU-1 PAD'].forEach(v=>need(m,v,'M-101 anchored HVAC content'));
const p101=read('assets/quote-builder/whole-house-cad/P-101.svg');
['DOMESTIC / DWV RISER','FIXTURE SCHEDULE','KS-1','WC-1','WH-1','class="hot"','class="cold"','class="waste"','class="vent"','architectural-underlay','KITCHEN COUNTER / SINK / DISHWASHER RUN','BATH VANITY / WC WALL','SHOWER / TUB','WH-1 PAD / DRAIN PAN'].forEach(v=>need(p101,v,'P-101 anchored plumbing content'));
const e101=read('assets/quote-builder/whole-house-cad/E-101.svg');
['PANEL A — REPRESENTATIVE SCHEDULE','KITCHEN SMALL APPLIANCE','RANGE','LIGHTING — MAIN','ELECTRICAL NOTES','PANEL A','class="light"','class="power"','architectural-underlay','DEVICE WALL','PANEL WORKING CLEARANCE'].forEach(v=>need(e101,v,'E-101 anchored electrical content'));
for(const [name,svg] of [['M-101',m],['P-101',p101],['E-101',e101]]){
 if((svg.match(/id="architectural-underlay"/g)||[]).length!==1)throw new Error(`${name} must contain exactly one architectural underlay.`);
}
const site=read('assets/quote-builder/whole-house-cad/C-S-L-101.svg');
['120′-0″ REPRESENTATIVE LOT WIDTH','180′-0″ REPRESENTATIVE LOT DEPTH','16′ × 12′ DECK','18′ × 24′ PATIO','DECK FRAMING PLAN — INSET','SITE CLEARING / EARTHWORK NOTES','APPROVED CLEARING / DISTURBANCE LIMIT','STABILIZED CONSTRUCTION ENTRANCE','TOPSOIL / MATERIAL STOCKPILE','class="property"','class="setback"','class="contour"'].forEach(v=>need(site,v,'C-S-L-101 ground-up site content'));
if((site.match(/id="new-house-site-controls"/g)||[]).length!==1)throw new Error('C-S-L-101 must contain exactly one new-house site-control group.');
const html=read('whole-house-quote-package.html');
for(const number of expected){need(html,`assets/quote-builder/whole-house-cad/${number}.svg`,`${number} package link`);need(html,`id="sheet-${number}"`,`${number} package section`);}
['New-House Construction<br>From Lot Clearing to Closeout','$602,050',"title:'Lot Clearing, Grubbing & Erosion Control'","title:'Footings, Foundation & Slabs'","title:'Structural Framing & Weather-Tight Shell'",'Open full-size SVG','Revision:</strong> E'].forEach(v=>need(html,v,'ground-up package content'));
['Whole-House Renovation',"title:'Selective Demolition'",'Plumbing Renovation'].forEach(v=>absent(html,v,'package scope drift'));
if((html.match(/<section class="sheet cad-sheet"/g)||[]).length!==10)throw new Error('Package must expose exactly 10 CAD drawing sheets.');
console.log(JSON.stringify({status:'PASS',scope:'ground-up-new-house',firstFieldPhase:'lot-clearing',total:'$602,050',professionalCadSheets:10,anchoredTradeUnderlays:3,siteClearingControls:true,externalActions:0},null,2));