#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'assets','quote-builder','whole-house-cad');
const files=fs.readdirSync(dir).filter(name=>name.endsWith('.svg'));
if(files.length!==10)throw new Error(`Expected 10 CAD sheets; found ${files.length}`);
for(const name of files){
  const file=path.join(dir,name);
  let svg=fs.readFileSync(file,'utf8');
  svg=svg.replace(/REV D/g,'REV E');
  svg=svg.replace(/(<text x="1540" y="965" class="sheetno" text-anchor="middle">)D(<\/text>)/g,'$1E$2');
  fs.writeFileSync(file,svg,'utf8');
}
let html=fs.readFileSync(path.join(root,'whole-house-quote-package.html'),'utf8');
html=html.replace(/Revision D/g,'Revision E').replace(/REV D/g,'REV E').replace(/Revision:<\/strong> D/g,'Revision:</strong> E').replace(/H38-UQB-WH-REV-D/g,'H38-UQB-WH-REV-E');
fs.writeFileSync(path.join(root,'whole-house-quote-package.html'),html,'utf8');
console.log('Normalized 10 CAD sheets and package to revision E.');
