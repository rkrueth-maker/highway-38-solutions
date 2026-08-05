#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),site=path.join(root,'businesses','northern-lakes');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const fail=[];const ok=(c,m)=>{if(!c)fail.push(m)};
const shell=read('businesses/northern-lakes/site-shell.js');
const catalog=read('businesses/northern-lakes/service-catalog.js');
const active=fs.readdirSync(site).filter(f=>/\.(html|js)$/i.test(f)).map(f=>read('businesses/northern-lakes/'+f)).join('\n');
ok(shell.includes('owner-access.html?v=owner-access-20260805-v2'),'site shell must use current owner access');
ok(!/script\.google\.com\/macros|Open Owner Portal/i.test(active),'old Apps Script owner links must be absent');
const images=[...catalog.matchAll(/id:'([^']+)'[^\n]*image:A\+'([^']+)'/g)].map(m=>m[2]);
ok(images.length===19&&new Set(images).size===19,'all 19 catalog services must have distinct image paths');
for(const rel of images.filter(v=>v.startsWith('service-source/'))){const f=path.join(site,'assets',rel);ok(fs.existsSync(f)&&fs.statSync(f).size>50000,'missing or small '+rel)}
for(const rel of ['materials-source/sand.jpg','materials-source/topsoil.jpg']){const f=path.join(site,'assets',rel);ok(fs.existsSync(f)&&fs.statSync(f).size>100000,'missing or small '+rel)}
const hash=rel=>crypto.createHash('sha256').update(fs.readFileSync(path.join(site,'assets',rel))).digest('hex');
ok(hash('materials-source/sand.jpg')!==hash('materials-source/topsoil.jpg'),'sand and topsoil must be different files');
ok(fs.existsSync(path.join(site,'owner-access.html')),'owner-access page must exist');
if(fail.length){console.error(fail.join('\n'));process.exit(1)}console.log('Northern Lakes photo and owner-link verification PASS');
