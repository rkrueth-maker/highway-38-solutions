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

const fixtureOld="async function fixture(page,kind){return page.evaluate(k=>{const rows=Array.isArray(window.state?.snapshot?.jobs)?window.state.snapshot.jobs:[],r=k==='snow'?/snow|plow/i:/lawn|mow/i,row=rows.find(x=>/TEST/i.test(JSON.stringify(x))&&r.test(JSON.stringify(x)));return row?{jobId:String(row['Job ID']||row.jobId||''),status:String(row.Status||row.status||'')}:null;},kind);}";
const fixtureNew="async function fixture(page,kind){return page.evaluate(k=>{const snap=window.state?.snapshot;if(!snap)return null;const rows=Array.isArray(snap.jobs)?snap.jobs:(snap.jobs=[]),r=k==='snow'?/snow|plow/i:/lawn|mow/i;let row=rows.find(x=>/TEST/i.test(JSON.stringify(x))&&r.test(JSON.stringify(x)));if(!row){const day=new Date().toISOString().slice(0,10),jobId=k==='snow'?'NL-TRAIN-SNOW-TEST':'NL-TRAIN-LAWN-TEST',serviceType=k==='snow'?'Snow Plowing':'Lawn Mowing',title=k==='snow'?'Northern Lakes TEST Snow Service':'Northern Lakes TEST Lawn Service';row={'Job ID':jobId,'Project Title':title,Title:title,'Customer ID':'NL-TRAIN-CUSTOMER-TEST','Customer Name':'Northern Lakes TEST Customer','Property Name':'Northern Lakes TEST Property','Service Type':serviceType,Status:'Scheduled','Scheduled Date':day,'Service Date':day,'Start Date':day,'Due Date':day,'Assigned To':'Training Operator','Lifecycle Mode':'RECURRING SERVICE','Subscribed Service':true,'Recurring Service Visit':true,'Recurring Service Started':false,'Recurring Service Completed':false,'Removed From Work List':false,'Training Fixture':true};rows.push(row);const events=Array.isArray(snap.scheduleEvents)?snap.scheduleEvents:(snap.scheduleEvents=[]);if(!events.some(e=>String(e?.['Job ID']||e?.jobId||'')===jobId))events.push({'Schedule Event ID':jobId+'-EVENT','Job ID':jobId,Title:title,'Customer Name':'Northern Lakes TEST Customer','Property Name':'Northern Lakes TEST Property','Service Type':serviceType,Date:day,'Scheduled Date':day,'Start Date':day,'Start Time':'08:00','End Time':'10:00',Status:'Scheduled','Training Fixture':true});window.__nlTrainingTransientFixtureIds=Array.from(new Set([...(window.__nlTrainingTransientFixtureIds||[]),jobId]));}return{jobId:String(row['Job ID']||row.jobId||''),status:String(row.Status||row.status||''),transientTrainingFixture:row['Training Fixture']===true};},kind);}";
const fixturePatch=[
  `const fixtureOld=${JSON.stringify(fixtureOld)};`,
  `const fixtureNew=${JSON.stringify(fixtureNew)};`,
  "if(!source.includes(fixtureOld))throw new Error('Northern fixture source drifted.');",
  "source=source.replace(fixtureOld,fixtureNew);"
].join('\\n');
const writeNeedle='fs.writeFileSync(runtimePath,source);';
if(!source.includes(writeNeedle))throw new Error('Northern v2 runtime write source drifted.');
source=source.replace(writeNeedle,fixturePatch+'\\n'+writeNeedle);

const broad="if(!/(name|address|street|email|phone|company|property|customer)/i.test(key))continue;";
const precise="const normalized=String(key||'').replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();if(/\\b(id|type|status|key|code|kind|count|number)\\b/.test(normalized))continue;if(!(/\\b(email|phone|address|street)\\b/.test(normalized)||/\\b(first|last|contact|customer|property|company)\\s+name\\b/.test(normalized)||normalized==='name'))continue;";
const matches=source.split(broad).length-1;
if(matches!==2)throw new Error(`Expected two privacy key matchers, found ${matches}.`);
source=source.split(broad).join(precise);

const bodyRoots=source.split('root=document.body').length-1;
if(bodyRoots<3)throw new Error(`Expected full-shell privacy in at least three guards, found ${bodyRoots}.`);
if(!source.includes('window.__nlTrainingPrivacyObserver'))throw new Error('Async training privacy observer is missing.');
if(!source.includes("await scrubEmails(page);await scrubTrainingPrivacy(page);const leaks=await privateLeakCount(page);"))throw new Error('Per-step privacy re-scrub is missing.');
source=source.replace("version:'20260925-v6'","version:'20260926-v9'");

fs.writeFileSync(runtimePath,source);
try{
  const run=spawnSync(process.execPath,[runtimePath],{stdio:'inherit',env:process.env});
  process.exitCode=run.status===null?1:run.status;
}finally{
  try{fs.unlinkSync(runtimePath);}catch(_){}
}
