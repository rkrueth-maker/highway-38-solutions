#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const dir=path.resolve(__dirname,'..','assets','quote-builder','whole-house-cad');
const files=fs.readdirSync(dir).filter(name=>name.endsWith('.svg')).sort();
if(files.length!==10)throw new Error(`Expected 10 SVG sheets; found ${files.length}`);
let changed=0;
for(const name of files){
  const file=path.join(dir,name);
  const before=fs.readFileSync(file,'utf8');
  const after=before.replace(/&(?!(?:amp|lt|gt|quot|apos);|#\d+;|#x[0-9A-Fa-f]+;)/g,'&amp;');
  if(after!==before){fs.writeFileSync(file,after,'utf8');changed++;}
}
console.log(`Sanitized XML entities in ${changed} of ${files.length} CAD sheets.`);
