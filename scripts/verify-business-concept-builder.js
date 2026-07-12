#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const childProcess=require('child_process');

const root=path.resolve(__dirname,'..');
const evidenceDir=path.join(root,'launch-control','evidence');
fs.mkdirSync(evidenceDir,{recursive:true});

const result=childProcess.spawnSync(process.execPath,[path.join(__dirname,'verify-business-concept-builder-v2.js')],{
  cwd:root,
  encoding:'utf8',
  env:process.env
});

if(result.stdout)process.stdout.write(result.stdout);
if(result.stderr)process.stderr.write(result.stderr);

if(result.status!==0){
  const crash={
    status:'CRASH',
    generatedAt:new Date().toISOString(),
    exitStatus:result.status,
    signal:result.signal||null,
    stdout:result.stdout||'',
    stderr:result.stderr||'',
    externalActionsOccurred:false
  };
  fs.writeFileSync(path.join(evidenceDir,'business-concept-builder-verification.json'),JSON.stringify(crash,null,2)+'\n');
  if(!fs.existsSync(path.join(evidenceDir,'business-concept-builder-sample-package.json'))){
    fs.writeFileSync(path.join(evidenceDir,'business-concept-builder-sample-package.json'),JSON.stringify({status:'NOT_GENERATED',reason:'Verifier crashed before sample evidence generation.',externalActionsOccurred:false},null,2)+'\n');
  }
  if(!fs.existsSync(path.join(evidenceDir,'business-concept-builder-created-tasks.csv'))){
    fs.writeFileSync(path.join(evidenceDir,'business-concept-builder-created-tasks.csv'),'status,reason\nNOT_GENERATED,Verifier crashed before task evidence generation\n');
  }
}

process.exit(result.status===0?0:1);
