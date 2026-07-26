#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>fs.writeFileSync(path.join(root,p),s,'utf8');
let html=read('whole-house-quote-package.html').replace('$342,815','$602,050');
write('whole-house-quote-package.html',html);
const dir=path.join(root,'assets/quote-builder/whole-house-cad');
for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.svg'))){
 const p=path.join(dir,file);
 let svg=fs.readFileSync(p,'utf8')
  .replace(/Whole-House Renovation &amp; Property Improvement/g,'Ground-Up New-House Construction')
  .replace(/Whole-House Renovation & Property Improvement/g,'Ground-Up New-House Construction')
  .replace(/SITE CLEARING, EARTHWORK, UTILITIES, DRAINAGE & FINAL SITE/g,'SITE CLEARING, EARTHWORK, UTILITIES, DRAINAGE &amp; FINAL SITE');
 fs.writeFileSync(p,svg,'utf8');
}
console.log('Finalized new-house scope labels, XML-safe titles, and coordinated package total.');