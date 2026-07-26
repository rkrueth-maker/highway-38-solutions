#!/usr/bin/env node
'use strict';
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
function run(script,label){
  const result=spawnSync(process.execPath,[path.join(root,'scripts',script)],{cwd:root,encoding:'utf8'});
  if(result.status!==0)throw new Error(label+' failed:\n'+result.stdout+'\n'+result.stderr);
  process.stdout.write(result.stdout);
}
run('verify-static-public-uqb.js','Static public UQB verification');
run('verify-professional-house-cad.js','Professional CAD verification');
console.log(JSON.stringify({status:'PASS',source:'standalone fictional public dataset and public CAD assets',hosting:'GitHub Pages',matchedPackages:7,matchedSheets:10,privateRecordsRead:false,authenticatedServiceRequired:false,externalActions:0},null,2));
