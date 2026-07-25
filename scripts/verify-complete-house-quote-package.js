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
 'G-001 — General Notes, Index & Symbols','A-101 — Proposed Main-Floor Plan','A-102 — Second-Floor & Roof Plan',
 'A-201 — Exterior Elevations — Four Views','A-301 — Building Sections & Envelope Details','A-401 — Kitchen Plan & Interior Elevations',
 'M-101 — HVAC Distribution & Equipment Plan','P-101 — Plumbing Plan, Riser & Fixture Schedule','E-101 — Lighting, Power & Panel Schedule',
 'C-S-L-101 — Site, Deck, Concrete, Drainage & Landscape','Open full-size SVG','Revision D',
 'Complete included scope','Itemized price','Deliverables and completion','Schedule','Payment','Assumptions','Exclusions','Change conditions',
 'Customer acceptance / date','Authorized contractor / date','Print / Save Complete Package','DEMONSTRATION — NOT A CONTRACT'
];
required.forEach(x=>{if(!html.includes(x))throw new Error('Missing required package content: '+x)});
const quoteDefs=(html.match(/\{n:'\d{2}',key:/g)||[]).length;
if(quoteDefs!==14)throw new Error('Expected 14 complete quote definitions; found '+quoteDefs);
const drawingSheets=(html.match(/<section class="sheet cad-sheet"/g)||[]).length;
if(drawingSheets!==10)throw new Error('Expected exactly 10 professional drawing sheets; found '+drawingSheets);
['Internal Cost','Margin','Vendor pricing','RUN-20260725','script.google.com'].forEach(x=>{if(html.includes(x))throw new Error('Protected/private marker exposed: '+x)});
const redirect=fs.readFileSync(path.join(root,'quote-builder-sample-proposal.html'),'utf8');
if(!redirect.includes('whole-house-quote-package.html'))throw new Error('Old sample entry point does not route to complete package');
const routes=JSON.parse(fs.readFileSync(path.join(root,'scripts/config/public-website-routes.json'),'utf8'));
if(!routes.demonstrations.some(x=>x.path==='whole-house-quote-package.html'&&x.visibility==='public'))throw new Error('Complete package is not registered as a public demonstration');
const cad=spawnSync(process.execPath,[path.join(root,'scripts','verify-professional-house-cad.js')],{cwd:root,encoding:'utf8'});
if(cad.status!==0)throw new Error('Professional CAD verification failed:\n'+cad.stdout+'\n'+cad.stderr);
console.log(JSON.stringify({status:'PASS',drawingSheets,completeQuotes:quoteDefs,professionalCad:true,externalActions:0},null,2));
