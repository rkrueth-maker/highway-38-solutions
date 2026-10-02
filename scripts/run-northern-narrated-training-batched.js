'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const scripts=__dirname;
const basePath=path.join(scripts,'northern-training-scenarios.json');
const extraPath=path.join(scripts,'northern-training-scenarios-extra.json');
const v2Path=path.join(scripts,'run-northern-narrated-training-v2.js');
const runnerPath=path.join(scripts,'run-northern-narrated-training-v3.js');
const out=path.resolve(process.env.NORTHERN_TRAINING_DIR||path.join(scripts,'..','artifacts','northern-narrated-training'));
const originalBase=fs.readFileSync(basePath,'utf8');
const originalExtra=fs.readFileSync(extraPath,'utf8');
const originalV2=fs.readFileSync(v2Path,'utf8');
const all=[...JSON.parse(originalBase),...JSON.parse(originalExtra)];
const requested=String(process.env.NORTHERN_TRAINING_ONLY||'').split(',').map(v=>v.trim()).filter(Boolean);
if(new Set(requested).size!==requested.length||requested.some(id=>!all.some(x=>x.id===id)))throw new Error('Unknown or duplicate targeted Northern lesson.');
const selected=requested.length?all.filter(x=>requested.includes(x.id)):all;
const snowScenario=all.find(x=>x.id==='NL-TRAIN-SNOW-FULL-SERVICE-PHONE');
if(!snowScenario)throw new Error('Northern snow training scenario is missing.');
for(const step of snowScenario.steps){
  if(step.page==='today'){
    step.page='work';
    step.text='Open the controlled snow service in Jobs and Work. Confirm the property, priority, access notes, equipment, and storm instructions before travel. Real snow occurrences that are due today also appear on Today; historical controlled training fixtures remain in Work.';
  }
}
const attempts=[];
const batchSize=Math.max(1,Number(process.env.NORTHERN_TRAINING_BATCH_SIZE||6));
const maxAttempts=Math.max(1,Number(process.env.NORTHERN_TRAINING_MAX_ATTEMPTS||3));
const snowPatchOld="if(scenario.id==='NL-TRAIN-SNOW-FULL-SERVICE-PHONE')for(const step of scenario.steps){if(step.pattern)step.pattern=step.pattern.replace(/\\|TEST/g,'');if(step.page==='work'){step.page='today';step.text='From the same triggered snow occurrence, follow travel, arrival, start, plowing work, material used if any, proof, and closeout. For properties requiring both a plow truck and skid steer, keep both equipment steps on that same service occurrence.';}}";
const snowPatchNew="if(scenario.id==='NL-TRAIN-SNOW-FULL-SERVICE-PHONE')for(const step of scenario.steps){if(step.pattern)step.pattern=step.pattern.replace(/\\|TEST/g,'');}";
if(!originalV2.includes(snowPatchOld))throw new Error('Northern v2 snow transform drifted; refusing an unreviewed batch repair.');

function writeSubset(list){
  fs.writeFileSync(basePath,JSON.stringify(list,null,2)+'\n');
  fs.writeFileSync(extraPath,'[]\n');
}
function cleanup(id){
  for(const file of [path.join(out,id+'.json')]){try{fs.unlinkSync(file);}catch(_){}}
  for(const dir of [path.join(out,'audio'),path.join(out,'videos')]){
    if(!fs.existsSync(dir))continue;
    for(const name of fs.readdirSync(dir))if(name.startsWith(id+'-'))try{fs.unlinkSync(path.join(dir,name));}catch(_){}
  }
}
function runSubset(list,round,batch){
  for(const scenario of list)cleanup(scenario.id);
  writeSubset(list);
  const env={...process.env};
  const generated=String(process.env.H38_WORKFLOW_AUTH_STATE_OUT||'');
  if(generated&&fs.existsSync(generated))env.H38_WORKFLOW_STORAGE_STATE=generated;
  const run=spawnSync(process.execPath,[runnerPath],{stdio:'inherit',env});
  let result={status:'HOLD',passed:[],failed:list.map(x=>({id:x.id,error:'runner did not produce results'})),externalActionsOccurred:false};
  try{result=JSON.parse(fs.readFileSync(path.join(out,'results.json'),'utf8'));}catch(_){}
  const passed=new Set(Array.isArray(result.passed)?result.passed:[]);
  attempts.push({batch,round,scenarioIds:list.map(x=>x.id),passed:[...passed],failed:(result.failed||[]).map(x=>x.id),exitStatus:run.status});
  return list.filter(x=>!passed.has(x.id));
}
function proofFor(id){
  const file=path.join(out,id+'.json');
  if(!fs.existsSync(file))return null;
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){return null;}
}

let unresolved=[];
try{
  fs.writeFileSync(v2Path,originalV2.replace(snowPatchOld,snowPatchNew));
  fs.mkdirSync(path.join(out,'audio'),{recursive:true});
  fs.mkdirSync(path.join(out,'videos'),{recursive:true});
  for(let start=0,batch=1;start<selected.length;start+=batchSize,batch++){
    let pending=selected.slice(start,start+batchSize);
    for(let round=1;round<=maxAttempts&&pending.length;round++)pending=runSubset(pending,round,batch);
    unresolved.push(...pending.map(x=>x.id));
  }
}finally{
  fs.writeFileSync(basePath,originalBase);
  fs.writeFileSync(extraPath,originalExtra);
  fs.writeFileSync(v2Path,originalV2);
}

const proofs=all.map(x=>proofFor(x.id));
const failed=all.filter((x,i)=>!proofs[i]||proofs[i].status!=='PASS'||proofs[i].externalActionsOccurred!==false).map(x=>({id:x.id,error:proofFor(x.id)?.error||proofFor(x.id)?.muxError||'Missing PASS proof'}));
unresolved=Array.from(new Set([...unresolved,...failed.map(x=>x.id)]));
const status=unresolved.length?'HOLD':'PASS';
const passed=all.map(x=>x.id).filter(id=>!unresolved.includes(id));
const finalResult={status,passed,failed,externalActionsOccurred:false,recordingMode:'batched-retry',selectedLessonIds:selected.map(x=>x.id),batchSize,maxAttempts,attempts};
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(finalResult,null,2)+'\n');
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({kind:'northern-lakes-narrated-training',version:'20261001-batched-snow-work-3',status,externalActionsOccurred:false,recordingMode:'batched-retry',videos:proofs.filter(Boolean),attempts},null,2)+'\n');
fs.writeFileSync(path.join(out,'BATCHED_RECORDING_ATTEMPTS.json'),JSON.stringify(attempts,null,2)+'\n');
fs.writeFileSync(path.join(out,'README.md'),['# Northern Lakes Narrated Training Library','',`Status: ${status}`,'','Recording mode: controlled TEST batches with bounded retry of only failed lessons. Historical controlled snow fixtures are proven from Jobs / Work; real due-today occurrences remain available on Today.','',...all.map(x=>`- ${proofFor(x.id)?.status||'HOLD'}: ${x.title}`),'','Safety: privacy masking remains fail-closed; no customer send, payment, purchase, refund, or external scheduling action is executed.',''].join('\n'));
if(status!=='PASS'){
  console.error(JSON.stringify({status,failed,attempts},null,2));
  process.exitCode=1;
}else{
  console.log(JSON.stringify({status:'PASS',videos:all.length,batches:Math.ceil(all.length/batchSize),externalActionsOccurred:false,recordingMode:'batched-retry'},null,2));
}
