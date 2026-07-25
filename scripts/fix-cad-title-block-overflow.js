#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..','assets','quote-builder','whole-house-cad');
const replacements={
  'A-101.svg':'Detailed Main-Floor Plan',
  'A-201.svg':'Exterior Elevations — Four Views',
  'A-301.svg':'Building Sections & Details',
  'A-401.svg':'Kitchen Plan & Elevations'
};
for(const [name,title] of Object.entries(replacements)){
  const file=path.join(root,name);
  let svg=fs.readFileSync(file,'utf8');
  const pattern=/(<text x="1175" y="940" class="tbhead" text-anchor="start">)[\s\S]*?(<\/text>)/;
  if(!pattern.test(svg))throw new Error(`Title-block caption not found in ${name}`);
  svg=svg.replace(pattern,`$1${title}$2`);
  fs.writeFileSync(file,svg,'utf8');
}
console.log('Shortened architectural title-block captions to prevent revision-column overlap.');
