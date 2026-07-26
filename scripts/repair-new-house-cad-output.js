#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>fs.writeFileSync(path.join(root,p),s,'utf8');

let html=read('whole-house-quote-package.html');
html=html.replace('$342,815','$602,050');
write('whole-house-quote-package.html',html);

const tradeTitle='Ground-Up New-House Construction';
for(const file of fs.readdirSync(path.join(root,'assets/quote-builder/whole-house-cad')).filter(f=>f.endsWith('.svg'))){
  const p=`assets/quote-builder/whole-house-cad/${file}`;
  let svg=read(p)
    .replace(/Whole-House Renovation &amp; Property Improvement/g,tradeTitle)
    .replace(/Whole-House Renovation & Property Improvement/g,tradeTitle);
  write(p,svg);
}

const roomLabels=(x1,x2,x3,y1,y2)=>`<text x="${x1}" y="${y1}" class="room" text-anchor="middle" fill="#777">LIVING / OFFICE</text><text x="${x2}" y="${y1}" class="room" text-anchor="middle" fill="#777">KITCHEN / DINING</text><text x="${x3}" y="${y1}" class="room" text-anchor="middle" fill="#777">GARAGE / MUDROOM</text><text x="${x1}" y="${y2}" class="room" text-anchor="middle" fill="#777">BEDROOM / BATH</text><text x="${x2}" y="${y2}" class="room" text-anchor="middle" fill="#777">STAIR / HALL / MECH</text><text x="${x3}" y="${y2}" class="room" text-anchor="middle" fill="#777">BEDROOM / SERVICE</text>`;

let m=read('assets/quote-builder/whole-house-cad/M-101.svg');
const mUnder=`<g id="architectural-underlay"><rect x="110" y="145" width="1120" height="620" fill="#fafafa" stroke="#666" stroke-width="1.4"/><line x1="510" y1="145" x2="510" y2="765" stroke="#999"/><line x1="810" y1="145" x2="810" y2="765" stroke="#999"/><line x1="110" y1="445" x2="1230" y2="445" stroke="#999"/>${roomLabels(300,660,1020,300,610)}</g>`;
m=m.replace(/<g id="architectural-underlay">[\s\S]*?(?=<rect x="595" y="600")/,mUnder);
write('assets/quote-builder/whole-house-cad/M-101.svg',m);

let p=read('assets/quote-builder/whole-house-cad/P-101.svg');
const pUnder=`<g id="architectural-underlay"><rect x="90" y="145" width="1040" height="620" fill="#fafafa" stroke="#666" stroke-width="1.4"/><line x1="450" y1="145" x2="450" y2="765" stroke="#999"/><line x1="790" y1="145" x2="790" y2="765" stroke="#999"/><line x1="90" y1="445" x2="1130" y2="445" stroke="#999"/>${roomLabels(270,620,960,300,610)}</g>`;
p=p.replace(/<rect x="90" y="145" width="1040" height="620"[\s\S]*?(?=<circle cx="240" cy="255")/,pUnder);
write('assets/quote-builder/whole-house-cad/P-101.svg',p);

let e=read('assets/quote-builder/whole-house-cad/E-101.svg');
const eUnder=`<g id="architectural-underlay"><rect x="90" y="145" width="1060" height="620" fill="#fafafa" stroke="#666" stroke-width="1.4"/><line x1="450" y1="145" x2="450" y2="765" stroke="#999"/><line x1="790" y1="145" x2="790" y2="765" stroke="#999"/><line x1="90" y1="445" x2="1150" y2="445" stroke="#999"/>${roomLabels(270,620,970,300,610)}</g>`;
e=e.replace(/<rect x="90" y="145" width="1060" height="620"[\s\S]*?(?=<circle cx="190" cy="235")/,eUnder);
write('assets/quote-builder/whole-house-cad/E-101.svg',e);

for(const file of ['M-101.svg','P-101.svg','E-101.svg']){
  const svg=read(`assets/quote-builder/whole-house-cad/${file}`);
  const count=(svg.match(/id="architectural-underlay"/g)||[]).length;
  if(count!==1) throw new Error(`${file} must contain exactly one architectural underlay; found ${count}`);
}
console.log('Repaired new-house CAD underlays, removed floating trade context, updated scope labels, and corrected project total.');