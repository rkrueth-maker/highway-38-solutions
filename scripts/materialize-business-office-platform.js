#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const zlib=require('zlib');
const root=path.resolve(__dirname,'..');
const parts=fs.readdirSync(path.join(__dirname,'.materialize-parts')).sort().map(name=>fs.readFileSync(path.join(__dirname,'.materialize-parts',name),'utf8')).join('');
const files=JSON.parse(zlib.gunzipSync(Buffer.from(parts,'base64')).toString('utf8'));
for(const [relative,content] of Object.entries(files)){const target=path.join(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}
fs.rmSync(path.join(__dirname,'.materialize-parts'),{recursive:true,force:true});
fs.unlinkSync(__filename);
console.log(`Materialized ${Object.keys(files).length} separated Business Office files.`);
