#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const file=path.resolve(__dirname,'..','assets','quote-builder','whole-house-cad','A-401.svg');
let svg=fs.readFileSync(file,'utf8');
if(!svg.includes('ISLAND 9′-0″ × 3′-9″')){
  svg=svg.replace('<text x="387" y="449" class="tiny" text-anchor="middle">PREP SINK</text>','<text x="387" y="449" class="tiny" text-anchor="middle">PREP SINK</text><text x="465" y="482" class="tbhead" text-anchor="middle">ISLAND 9′-0″ × 3′-9″</text>');
}
fs.writeFileSync(file,svg,'utf8');
console.log('Added explicit kitchen island label.');
