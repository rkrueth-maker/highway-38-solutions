#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'assets','quote-builder','whole-house-cad');
function edit(name,fn){const file=path.join(dir,name);let svg=fs.readFileSync(file,'utf8');svg=fn(svg);fs.writeFileSync(file,svg,'utf8');}
edit('A-101.svg',svg=>svg
  .replace('Coordinate HVAC, plumbing, electrical, lighting, low-voltage, and firestopping before close-in.','Coordinate all trade rough-ins and firestopping before close-in.')
  .replace('Proposed Main-Floor Plan — Detailed</text>','Detailed Main-Floor Plan</text>'));
edit('A-201.svg',svg=>{
  if(!svg.includes('COVERED FRONT PORCH'))svg=svg.replace('<circle cx="440" cy="190"','<text x="449.5" y="370" class="tiny" text-anchor="middle">COVERED FRONT PORCH</text><circle cx="440" cy="190"');
  return svg.replace('Exterior Elevations — Detailed Four Views</text>','Detailed Exterior Elevations — Four Views</text>');
});
edit('A-301.svg',svg=>svg
  .replace('<text x="1000" y="494" class="tiny" text-anchor="start">ENGINEERED FLOOR SYSTEM / SUBFLOOR</text>','<text x="785" y="494" class="tiny" text-anchor="start">SECOND-FLOOR ASSEMBLY</text>')
  .replace('<text x="1000" y="574" class="tiny" text-anchor="start">FIRST-FLOOR SYSTEM / AIR SEAL</text>','<text x="785" y="574" class="tiny" text-anchor="start">FIRST-FLOOR ASSEMBLY</text>')
  .replace('<text x="1295" y="739" class="tiny" text-anchor="start">SLOPED PAN + END DAMS</text>','<text x="1245" y="755" class="tiny" text-anchor="end">SILL PAN + END DAMS</text>')
  .replace('<text x="1355" y="739" class="tiny" text-anchor="end">AIR / WATER SEAL AT WALL</text>','<text x="1365" y="762" class="tiny" text-anchor="start">AIR / WATER SEAL</text>')
  .replace('Building Sections &amp; Envelope Details — Detailed</text>','Building Sections &amp; Details</text>'));
edit('A-401.svg',svg=>svg
  .replace('Kitchen Plan &amp; Interior Elevations — Detailed</text>','Kitchen Plan &amp; Elevations</text>')
  .replace('<text x="18" y="435" class="dim" text-anchor="middle" transform="rotate(-90 18 435)">16′-0″ ROOM</text>',''));
console.log('Polished enhanced CAD output layout and title blocks.');
