#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>fs.writeFileSync(path.join(root,p),s,'utf8');
const labels=(x1,x2,x3)=>`<text x="${x1}" y="300" class="room" text-anchor="middle" fill="#777">LIVING / OFFICE</text><text x="${x2}" y="300" class="room" text-anchor="middle" fill="#777">KITCHEN / DINING</text><text x="${x3}" y="300" class="room" text-anchor="middle" fill="#777">GARAGE / MUDROOM</text><text x="${x1}" y="610" class="room" text-anchor="middle" fill="#777">BEDROOM / BATH</text><text x="${x2}" y="610" class="room" text-anchor="middle" fill="#777">STAIR / HALL / MECH</text><text x="${x3}" y="610" class="room" text-anchor="middle" fill="#777">BEDROOM / SERVICE</text>`;
const configs={
 'M-101.svg':{start:'<rect x="595" y="600"',under:`<g id="architectural-underlay"><rect x="110" y="145" width="1120" height="620" fill="#fafafa" stroke="#666" stroke-width="1.4"/><line x1="510" y1="145" x2="510" y2="765" stroke="#999"/><line x1="810" y1="145" x2="810" y2="765" stroke="#999"/><line x1="110" y1="445" x2="1230" y2="445" stroke="#999"/>${labels(300,660,1020)}</g>`},
 'P-101.svg':{start:'<circle cx="240" cy="255"',under:`<g id="architectural-underlay"><rect x="90" y="145" width="1040" height="620" fill="#fafafa" stroke="#666" stroke-width="1.4"/><line x1="450" y1="145" x2="450" y2="765" stroke="#999"/><line x1="790" y1="145" x2="790" y2="765" stroke="#999"/><line x1="90" y1="445" x2="1130" y2="445" stroke="#999"/>${labels(270,620,960)}</g>`},
 'E-101.svg':{start:'<circle cx="190" cy="235"',under:`<g id="architectural-underlay"><rect x="90" y="145" width="1060" height="620" fill="#fafafa" stroke="#666" stroke-width="1.4"/><line x1="450" y1="145" x2="450" y2="765" stroke="#999"/><line x1="790" y1="145" x2="790" y2="765" stroke="#999"/><line x1="90" y1="445" x2="1150" y2="445" stroke="#999"/>${labels(270,620,970)}</g>`}
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
console.log('Normalized trade underlays and site controls to exactly one group each.');