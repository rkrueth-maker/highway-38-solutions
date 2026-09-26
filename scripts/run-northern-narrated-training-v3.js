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

const leakOld="if(scenario.fixture&&step.pattern&&!focused)throw new Error('Controlled TEST '+scenario.fixture+' service fixture is not visible on '+step.page+'.');const leaks=await privateLeakCount(page);";
const leakNew="if(scenario.fixture&&step.pattern&&!focused)throw new Error('Controlled TEST '+scenario.fixture+' service fixture is not visible on '+step.page+'.');await scrubEmails(page);await scrubTrainingPrivacy(page);const leaks=await privateLeakCount(page);";
if(!source.includes(leakOld))throw new Error('Privacy re-scrub patch source drifted.');
source=source.replace(leakOld,leakNew);
source=source.replace("version:'20260925-v6'","version:'20260925-v7'");

fs.writeFileSync(runtimePath,source);
try{
  const run=spawnSync(process.execPath,[runtimePath],{stdio:'inherit',env:process.env});
  process.exitCode=run.status===null?1:run.status;
}finally{
  try{fs.unlinkSync(runtimePath);}catch(_){}
}
