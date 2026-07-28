#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'assets','quote-builder','whole-house-cad');
const read=n=>fs.readFileSync(path.join(dir,n+'.svg'),'utf8');
const write=(n,s)=>fs.writeFileSync(path.join(dir,n+'.svg'),s);
const replace=(s,from,to,label)=>{if(!s.includes(from)){if(s.includes(to))return s;throw new Error(`Missing ${label}: ${from}`);}return s.replaceAll(from,to)};
const insertBefore=(s,marker,content,label)=>{const i=s.indexOf(marker);if(i<0)throw new Error(`Missing insertion marker ${label}`);return s.slice(0,i)+content+s.slice(i)};

// G-001: keep the index synchronized with the actual site sheet.
{
 let s=read('G-001');
 s=replace(s,'SITE, DECK, CONCRETE, DRAINAGE &amp; LANDSCAPE','SITE CLEARING, EARTHWORK, UTILITIES, DRAINAGE &amp; FINAL SITE','G-001 site index title');
 write('G-001',s);
}

// A-101: remove renovation/demolition language from the ground-up new-house set.
{
 let s=read('A-101');
 s=s.replace(/<text[^>]*>[^<]*(?:existing|demolition)[^<]*<\/text>/gi,m=>m.replace(/>[^<]*</,'>Verify framing layout, dimensions, openings, and coordinated trade requirements before construction.<'));
 if(/demolition|existing wall conditions/i.test(s))throw new Error('A-101 still contains renovation language.');
 write('A-101',s);
}

// A-102: reconcile room labels with the 48 x 32 shell and show a real open-stair zone.
{
 let s=read('A-102');
 s=replace(s,'12′-0″ × 13′-0″','16′-6″ × 15′-0″','A-102 bedroom 2 size');
 s=replace(s,'10′-6″ × 13′-0″','14′-6″ × 15′-0″','A-102 center bay size');
 s=replace(s,'13′-0″ × 13′-0″','15′-6″ × 15′-0″','A-102 right bay size');
 s=replace(s,'HALL / STAIR','HALL / OPEN STAIR','A-102 stair label');
 s=replace(s,'8:12','5:12','A-102 roof pitch');
 const stair='<g id="a102-coordinated-open-stair"><rect x="405" y="480" width="150" height="185" fill="none" stroke="#111" stroke-width="2"/><line x1="420" y1="645" x2="540" y2="500" class="leader"/><line x1="425" y1="625" x2="535" y2="625" class="thin"/><line x1="438" y1="609" x2="535" y2="609" class="thin"/><line x1="451" y1="593" x2="535" y2="593" class="thin"/><line x1="464" y1="577" x2="535" y2="577" class="thin"/><line x1="477" y1="561" x2="535" y2="561" class="thin"/><text x="480" y="675" class="tiny" text-anchor="middle">OPEN TO STAIR BELOW · GUARD REQUIRED</text></g>';
 if(!s.includes('a102-coordinated-open-stair'))s=insertBefore(s,'<text x="925" y="130"',stair,'A-102 roof-plan heading');
 write('A-102',s);
}

// A-201: make roof callouts mathematically consistent and coordinate rear deck/door to the right side.
{
 let s=read('A-201');
 s=replace(s,'8:12','5:12','A-201 roof pitch');
 s=replace(s,'24′-6″ RIDGE','24′-8″ RIDGE','A-201 ridge height');
 s=replace(s,'<rect x="1078" y="379" width="345" height="28" rx="0" class="wood"/>','<rect x="1280" y="379" width="303" height="28" rx="0" class="wood"/>','A-201 rear deck');
 s=replace(s,'<line x1="1093" y1="337" x2="1093" y2="407" class="outline"/>','<line x1="1295" y1="337" x2="1295" y2="407" class="outline"/>','A-201 rear deck post 1');
 s=replace(s,'<line x1="1408" y1="337" x2="1408" y2="407" class="outline"/>','<line x1="1568" y1="337" x2="1568" y2="407" class="outline"/>','A-201 rear deck post 2');
 s=replace(s,'<line x1="1093" y1="337" x2="1408" y2="337" class="outline"/>','<line x1="1295" y1="337" x2="1568" y2="337" class="outline"/>','A-201 rear deck beam');
 s=replace(s,'<rect x="1212.5" y="292" width="76" height="93" rx="0" class="outline"/>','<rect x="1460" y="292" width="76" height="93" rx="0" class="outline"/>','A-201 rear door');
 write('A-201',s);
}

// A-301: match the corrected roof pitch/height and remove renovation wording.
{
 let s=read('A-301');
 s=replace(s,'8:12 ROOF','5:12 ROOF','A-301 roof pitch');
 s=replace(s,'24′-6″','24′-8″','A-301 ridge height');
 s=s.replace(/<text[^>]*>[^<]*verified existing construction[^<]*<\/text>/gi,m=>m.replace(/>[^<]*</,'>Verify final engineered assemblies, dimensions, and manufacturer requirements before construction.<'));
 if(/verified existing construction|demolition/i.test(s))throw new Error('A-301 still contains renovation language.');
 write('A-301',s);
}

// A-401: coordinate the enlarged kitchen with A-101 and remove the duplicate refrigerator designation.
{
 let s=read('A-401');
 s=replace(s,'ISLAND 9′-0″ × 3′-9″','ISLAND 8′-6″ × 3′-6″','A-401 island label');
 s=replace(s,'>9′-0″<','>8′-6″<','A-401 island width dimension');
 s=replace(s,'>3′-9″<','>3′-6″<','A-401 island depth dimension');
 s=replace(s,'22′-0″ CASEWORK RUN','17′-0″ CASEWORK RUN','A-401 casework run');
 s=replace(s,'22′-0″ ROOM','17′-0″ ROOM','A-401 room dimension');
 s=replace(s,'REF36','PAN36','A-401 duplicate refrigerator cabinet');
 write('A-401',s);
}

// C-S-L-101: remove note-box/title-block collisions and synchronize the site title.
{
 let s=read('C-S-L-101');
 s=replace(s,'<rect x="1180" y="620" width="240" height="90" fill="none" stroke="#555" stroke-dasharray="8 5"/>','<rect x="120" y="520" width="220" height="90" fill="none" stroke="#555" stroke-dasharray="8 5"/>','site stockpile box');
 s=replace(s,'<text x="1300" y="650" class="tiny" text-anchor="middle">TOPSOIL / MATERIAL STOCKPILE</text>','<text x="230" y="550" class="tiny" text-anchor="middle">TOPSOIL / MATERIAL STOCKPILE</text>','site stockpile label');
 s=replace(s,'<text x="1300" y="675" class="tiny" text-anchor="middle">OUTSIDE DRAINAGE PATH</text>','<text x="230" y="575" class="tiny" text-anchor="middle">OUTSIDE DRAINAGE PATH</text>','site stockpile note');
 s=replace(s,'<text x="1175" y="940" class="tbhead" text-anchor="start">SITE CLEARING, EARTHWORK, UTILITIES, DRAINAGE &amp; FINAL SITE</text>','<text x="1175" y="940" class="tbhead" text-anchor="start">Site / Earthwork / Utilities / Drainage</text>','site title block');
 write('C-S-L-101',s);
}

// P-101: explicitly distinguish whole-house schedule counts from the main-floor plan and connect riser group 3.
{
 let s=read('P-101');
 s=replace(s,'>FIXTURE SCHEDULE<','>WHOLE-HOUSE FIXTURE SCHEDULE — MAIN FLOOR SHOWN<','P-101 schedule heading');
 const riser='<path d="M1250 308 H1450" class="hot"/><path d="M1210 330 H1450" class="cold"/><path d="M1170 352 H1450" class="waste"/><text x="1130" y="760" class="tiny" text-anchor="start">Schedule quantities include second-floor fixtures coordinated on A-102; final second-floor routing is by licensed plumbing design.</text>';
 if(!s.includes('Schedule quantities include second-floor fixtures'))s=insertBefore(s,'<rect x="1110" y="470"',riser,'P-101 fixture schedule box');
 write('P-101',s);
}

console.log(JSON.stringify({status:'PASS',repaired:['G-001','A-101','A-102','A-201','A-301','A-401','C-S-L-101','P-101']},null,2));
