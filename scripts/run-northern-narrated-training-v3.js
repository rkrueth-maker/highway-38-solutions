'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const scripts=__dirname;
const sourcePath=path.join(scripts,'run-northern-narrated-training-v2.js');
const runtimePath=path.join(scripts,'.run-northern-narrated-training-v3-runtime.js');
let source=fs.readFileSync(sourcePath,'utf8');

const lawnOld="if(scenario.id==='NL-TRAIN-LAWN-FULL-SERVICE-PHONE')for(const step of scenario.steps){if(step.pattern)step.pattern=step.pattern.replace(/\\|TEST/g,'');}";
const lawnNew="if(scenario.id==='NL-TRAIN-LAWN-FULL-SERVICE-PHONE'){for(const step of scenario.steps){if(step.pattern)step.pattern=step.pattern.replace(/\\|TEST/g,'');}const first=scenario.steps.find(step=>step.page==='today'&&step.pattern);if(first){first.page='work';first.text='For a completed or historical lawn occurrence, begin in Jobs and Work and open the controlled TEST lawn service. Today is for work that is currently due; historical completed lawn service remains available in Work and service history.';}}";
if(!source.includes(lawnOld))throw new Error('Lawn scenario patch source drifted.');
source=source.replace(lawnOld,lawnNew);

const broad="if(!/(name|address|street|email|phone|company|property|customer)/i.test(key))continue;";
const precise="const normalized=String(key||'').replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();if(/\\b(id|type|status|key|code|kind|count|number)\\b/.test(normalized))continue;if(!(/\\b(email|phone|address|street)\\b/.test(normalized)||/\\b(first|last|contact|customer|property|company)\\s+name\\b/.test(normalized)||normalized==='name'))continue;";
const matches=source.split(broad).length-1;
if(matches!==2)throw new Error(`Expected two privacy key matchers, found ${matches}.`);
source=source.split(broad).join(precise);

const fullShellPrivacy="const root=document.body";
if((source.split(fullShellPrivacy).length-1)<3)throw new Error('Full-shell training privacy protection is missing or incomplete.');
if(!source.includes('window.__nlTrainingPrivacyObserver'))throw new Error('Async training privacy observer is missing.');
if(!source.includes("await scrubEmails(page);await scrubTrainingPrivacy(page);const leaks=await privateLeakCount(page);"))throw new Error('Per-step privacy re-scrub is missing.');
source=source.replace("version:'20260925-v6'","version:'20260926-v8'");

fs.writeFileSync(runtimePath,source);
try{
  const run=spawnSync(process.execPath,[runtimePath],{stdio:'inherit',env:process.env});
  process.exitCode=run.status===null?1:run.status;
}finally{
  try{fs.unlinkSync(runtimePath);}catch(_){}
}
