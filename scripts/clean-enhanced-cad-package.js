#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const file=path.resolve(__dirname,'..','whole-house-quote-package.html');
let html=fs.readFileSync(file,'utf8');
html=html.replace(/ — Detailed — Detailed/g,' — Detailed');
html=html.replace(/A-101 — Proposed Main-Floor Plan — Detailed — Detailed/g,'A-101 — Proposed Main-Floor Plan — Detailed');
html=html.replace(/A-301 — Building Sections & Envelope Details — Detailed — Detailed/g,'A-301 — Building Sections & Envelope Details — Detailed');
html=html.replace(/A-401 — Kitchen Plan & Interior Elevations — Detailed — Detailed/g,'A-401 — Kitchen Plan & Interior Elevations — Detailed');
fs.writeFileSync(file,html,'utf8');
console.log('Cleaned enhanced CAD package headings.');
