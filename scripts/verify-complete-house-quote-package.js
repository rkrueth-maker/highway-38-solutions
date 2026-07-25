#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'whole-house-quote-package.html');
if(!fs.existsSync(file))throw new Error('Missing whole-house-quote-package.html');
const html=fs.readFileSync(file,'utf8');
const required=[
 'A-100 — House Exterior Views','FRONT ELEVATION — SOUTH','RIGHT-SIDE ELEVATION — EAST','REAR ELEVATION — NORTH',
 'A-101 — Existing / Proposed Main-Floor Plan','48′-0″','32′-0″','A-201 — Proposed Kitchen Plan & Cabinet Elevations',
 'MEP-101 — Plumbing, Electrical & HVAC Coordination','C/S/L-101 — Site, Concrete, Deck & Drainage Plan',
 'Complete included scope','Itemized price','Deliverables and completion','Schedule','Payment','Assumptions','Exclusions','Change conditions',
 'Customer acceptance / date','Authorized contractor / date','Print / Save Complete Package','DEMONSTRATION — NOT A CONTRACT'
];
required.forEach(x=>{if(!html.includes(x))throw new Error('Missing required package content: '+x)});
const quoteDefs=(html.match(/\{n:'\d{2}',key:/g)||[]).length;
if(quoteDefs!==14)throw new Error('Expected 14 complete quote definitions; found '+quoteDefs);
const drawingSheets=(html.match(/<section class="sheet">/g)||[]).length;
if(drawingSheets<5)throw new Error('Expected at least 5 real drawing sheets; found '+drawingSheets);
const svgCount=(html.match(/<svg /g)||[]).length;
if(svgCount<7)throw new Error('Expected multiple actual SVG drawing views; found '+svgCount);
['Internal Cost','Margin','Vendor pricing','RUN-20260725','script.google.com'].forEach(x=>{if(html.includes(x))throw new Error('Protected/private marker exposed: '+x)});
const redirect=fs.readFileSync(path.join(root,'quote-builder-sample-proposal.html'),'utf8');
if(!redirect.includes('whole-house-quote-package.html'))throw new Error('Old sample entry point does not route to complete package');
const routes=JSON.parse(fs.readFileSync(path.join(root,'scripts/config/public-website-routes.json'),'utf8'));
if(!routes.demonstrations.some(x=>x.path==='whole-house-quote-package.html'&&x.visibility==='public'))throw new Error('Complete package is not registered as a public demonstration');
console.log(JSON.stringify({status:'PASS',drawingSheets,svgCount,completeQuotes:quoteDefs,externalActions:0},null,2));