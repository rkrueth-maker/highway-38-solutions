#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'whole-house-quote-package.html');
if(!fs.existsSync(file))throw new Error('Missing whole-house-quote-package.html');
const html=fs.readFileSync(file,'utf8');
const required=[
 'Ground-Up New Home','Lot Clearing Through Final Completion','$623,450','Revision:</strong> F','STANDALONE CONSTRUCTION PHASE QUOTE',
 'G-001 — Project Definition, Index & General Notes','A-101 — Proposed Main-Floor Plan','A-102 — Second-Floor & Roof Plan',
 'A-201 — Exterior Elevations — Four Coordinated Views','A-301 — Building Section & Construction Details','A-401 — Kitchen Plan & Cabinet Elevations',
 'M-101 — HVAC Plan on Coordinated Architectural Underlay','P-101 — Plumbing Plan on Coordinated Architectural Underlay','E-101 — Electrical Plan on Coordinated Architectural Underlay',
 'C-S-L-101 — Lot Clearing, Site Utilities, Grading & Landscape Plan','Open full-size SVG',
 'Preconstruction, Survey, Design & Permits','Lot Clearing, Erosion Control & Temporary Access','Excavation, House Pad, Site Utilities & Rough Grading',
 'Footings, Foundation, Waterproofing & Slabs','Structural Framing, Sheathing, Trusses & Stairs','Roofing, Siding, Windows & Exterior Doors',
 'Plumbing, Water, Sanitary & Fixtures','Electrical Service, Power, Lighting & Low Voltage','HVAC, Ventilation, Exhaust & Controls',
 'Insulation, Air Sealing, Drywall & Interior Prime','Cabinets, Countertops, Interior Doors & Millwork','Flooring, Tile, Painting & Finish Hardware',
 'Porches, Deck, Driveway, Concrete & Exterior Flatwork','Final Grading, Landscaping, Testing & Closeout',
 'Complete included scope','Itemized price','Deliverables and completion','Schedule','Payment','Assumptions','Exclusions','Change conditions',
 'Customer acceptance / date','Authorized contractor / date','Print / Save Complete Package','DEMONSTRATION — NOT A CONTRACT'
];
required.forEach(x=>{if(!html.includes(x))throw new Error('Missing required ground-up package content: '+x)});
['Whole-House Renovation','Property Improvement','Selective Demolition','existing-house demolition'].forEach(x=>{if(html.toLowerCase().includes(x.toLowerCase()))throw new Error('Scope drift found in package: '+x)});
const quoteDefs=(html.match(/\{n:["']\d{2}["'],key:/g)||[]).length;
if(quoteDefs!==14)throw new Error('Expected 14 complete ground-up phase quotes; found '+quoteDefs);
const drawingSheets=(html.match(/<section class="sheet cad-sheet"/g)||[]).length;
if(drawingSheets!==10)throw new Error('Expected exactly 10 coordinated drawing sheets; found '+drawingSheets);
['Internal Cost','Margin','Vendor pricing','RUN-20260725','script.google.com'].forEach(x=>{if(html.includes(x))throw new Error('Protected/private marker exposed: '+x)});
const redirect=fs.readFileSync(path.join(root,'quote-builder-sample-proposal.html'),'utf8');
if(!redirect.includes('whole-house-quote-package.html'))throw new Error('Sample entry point does not route to complete package');
const routes=JSON.parse(fs.readFileSync(path.join(root,'scripts/config/public-website-routes.json'),'utf8'));
if(!routes.demonstrations.some(x=>x.path==='whole-house-quote-package.html'&&x.visibility==='public'))throw new Error('Complete package is not registered as a public demonstration');
const cad=spawnSync(process.execPath,[path.join(root,'scripts','verify-professional-house-cad.js')],{cwd:root,encoding:'utf8'});
if(cad.status!==0)throw new Error('Ground-up CAD verification failed:\n'+cad.stdout+'\n'+cad.stderr);
console.log(JSON.stringify({status:'PASS',revision:'F',scope:'ground-up-new-home',drawingSheets,completePhaseQuotes:quoteDefs,total:623450,sharedTradeUnderlays:true,externalActions:0},null,2));
