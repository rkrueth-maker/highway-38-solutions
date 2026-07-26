#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>fs.writeFileSync(path.join(root,p),s,'utf8');
const labels=(x1,x2,x3)=>`<text x="${x1}" y="325" class="room" text-anchor="middle" fill="#777">LIVING / OFFICE</text><text x="${x2}" y="325" class="room" text-anchor="middle" fill="#777">KITCHEN / DINING</text><text x="${x3}" y="325" class="room" text-anchor="middle" fill="#777">GARAGE / MUDROOM</text><text x="${x1}" y="635" class="room" text-anchor="middle" fill="#777">BEDROOM / BATH</text><text x="${x2}" y="635" class="room" text-anchor="middle" fill="#777">STAIR / HALL / MECH</text><text x="${x3}" y="635" class="room" text-anchor="middle" fill="#777">BEDROOM / SERVICE</text>`;
const wallPlan=(x,y,w,h,v1,v2,mid)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fafafa" stroke="#555" stroke-width="3"/><line x1="${v1}" y1="${y}" x2="${v1}" y2="${y+h}" stroke="#777" stroke-width="2"/><line x1="${v2}" y1="${y}" x2="${v2}" y2="${y+h}" stroke="#777" stroke-width="2"/><line x1="${x}" y1="${mid}" x2="${x+w}" y2="${mid}" stroke="#777" stroke-width="2"/><path d="M${v1-24} ${mid}h48M${v2-24} ${mid}h48" stroke="#fafafa" stroke-width="9"/><path d="M${v1-24} ${mid}h48M${v2-24} ${mid}h48" stroke="#777" stroke-width="1"/>`;
const mUnder=`<g id="architectural-underlay">${wallPlan(110,145,1120,620,510,810,445)}${labels(300,660,1020)}<rect x="570" y="560" width="170" height="155" fill="none" stroke="#999"/><text x="655" y="705" class="tiny" text-anchor="middle">MECHANICAL EQUIPMENT PAD / SERVICE CLEARANCE</text><rect x="1130" y="205" width="70" height="45" fill="none" stroke="#999"/><text x="1165" y="198" class="tiny" text-anchor="middle">CU-1 PAD</text></g>`;
const pUnder=`<g id="architectural-underlay">${wallPlan(90,145,1040,620,450,790,445)}${labels(270,620,960)}<rect x="180" y="215" width="215" height="70" fill="#f2f2f2" stroke="#777"/><text x="287" y="207" class="tiny" text-anchor="middle">KITCHEN COUNTER / SINK / DISHWASHER RUN</text><rect x="590" y="545" width="85" height="70" fill="#f2f2f2" stroke="#777"/><text x="632" y="538" class="tiny" text-anchor="middle">LAUNDRY BOX</text><rect x="880" y="535" width="205" height="75" fill="#f2f2f2" stroke="#777"/><text x="982" y="528" class="tiny" text-anchor="middle">BATH VANITY / WC WALL</text><rect x="930" y="625" width="125" height="90" fill="none" stroke="#777"/><text x="992" y="720" class="tiny" text-anchor="middle">SHOWER / TUB</text><rect x="685" y="615" width="105" height="105" fill="none" stroke="#777"/><text x="737" y="728" class="tiny" text-anchor="middle">WH-1 PAD / DRAIN PAN</text></g>`;
const eUnder=`<g id="architectural-underlay">${wallPlan(90,145,1060,620,450,790,445)}${labels(270,620,970)}<path d="M120 280H430M470 280H770M810 280H1120M120 490H430M470 490H770M810 490H1120" stroke="#999" stroke-width="1.5"/><text x="270" y="295" class="tiny" text-anchor="middle">DEVICE WALL</text><text x="620" y="295" class="tiny" text-anchor="middle">KITCHEN / DINING DEVICE WALL</text><text x="970" y="295" class="tiny" text-anchor="middle">GARAGE DEVICE WALL</text><rect x="1005" y="610" width="105" height="120" fill="none" stroke="#777"/><text x="1057" y="740" class="tiny" text-anchor="middle">PANEL WORKING CLEARANCE</text></g>`;
const configs={
 'M-101.svg':{start:'<rect x="595" y="600"',under:mUnder},
 'P-101.svg':{start:'<circle cx="240" cy="255"',under:pUnder},
 'E-101.svg':{start:'<circle cx="190" cy="235"',under:eUnder}
};
for(const [file,cfg] of Object.entries(configs)){
 const p=`assets/quote-builder/whole-house-cad/${file}`;
 let svg=read(p);
 const startIndex=svg.indexOf('<g id="architectural-underlay">');
 const objectIndex=svg.indexOf(cfg.start);
 if(objectIndex<0) throw new Error(`Missing trade object anchor in ${file}`);
 if(startIndex>=0 && startIndex<objectIndex){
   svg=svg.slice(0,startIndex)+cfg.under+svg.slice(objectIndex);
 } else {
   const planStart=svg.search(/<rect x="(?:90|110)" y="145" width="(?:1040|1060|1120)" height="620"/);
   if(planStart<0) throw new Error(`Missing plan start in ${file}`);
   svg=svg.slice(0,planStart)+cfg.under+svg.slice(objectIndex);
 }
 const count=(svg.match(/id="architectural-underlay"/g)||[]).length;
 if(count!==1) throw new Error(`${file} underlay count ${count}`);
 write(p,svg);
}
let site=read('assets/quote-builder/whole-house-cad/C-S-L-101.svg');
site=site.replace(/<g id="new-house-site-controls">[\s\S]*?<\/g>/g,'');
const controls=`<g id="new-house-site-controls"><rect x="350" y="250" width="760" height="520" fill="none" stroke="#a33" stroke-width="2" stroke-dasharray="12 6"/><text x="730" y="242" class="tbhead" text-anchor="middle">APPROVED CLEARING / DISTURBANCE LIMIT — STAKE BEFORE WORK</text><path d="M155 730L300 620L350 620" class="outline"/><text x="160" y="718" class="tiny">STABILIZED CONSTRUCTION ENTRANCE</text><rect x="1180" y="620" width="240" height="90" fill="none" stroke="#555" stroke-dasharray="8 5"/><text x="1300" y="650" class="tiny" text-anchor="middle">TOPSOIL / MATERIAL STOCKPILE</text><text x="1300" y="675" class="tiny" text-anchor="middle">OUTSIDE DRAINAGE PATH</text><text x="70" y="820" class="tiny">PHASE 1: erosion control → clearing/grubbing → strip/topsoil → rough grade → excavation → underground services.</text></g>`;
site=site.replace('</svg>',controls+'</svg>');
if((site.match(/id="new-house-site-controls"/g)||[]).length!==1) throw new Error('Site control group must appear once.');
write('assets/quote-builder/whole-house-cad/C-S-L-101.svg',site);
console.log('Anchored HVAC, plumbing, and electrical objects to detailed walls, counters, fixture zones, and equipment clearances.');