'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const scripts=__dirname;
const out=path.resolve(process.env.NORTHERN_TRAINING_DIR||path.join(scripts,'..','artifacts','northern-narrated-training'));
const basePath=path.join(scripts,'northern-training-scenarios.json');
const extraPath=path.join(scripts,'northern-training-scenarios-extra.json');
const v2Path=path.join(scripts,'run-northern-narrated-training-v2.js');
const runnerPath=path.join(scripts,'run-northern-narrated-training-v3.js');
const originalBase=fs.readFileSync(basePath,'utf8');
const originalExtra=fs.readFileSync(extraPath,'utf8');
const originalV2=fs.readFileSync(v2Path,'utf8');
const all=[...JSON.parse(originalBase),...JSON.parse(originalExtra)];
const snow=all.find(x=>x.id==='NL-TRAIN-SNOW-FULL-SERVICE-PHONE');
if(!snow)throw new Error('Northern snow training scenario is missing.');

const snowPatchOld="if(scenario.id==='NL-TRAIN-SNOW-FULL-SERVICE-PHONE')for(const step of scenario.steps){if(step.pattern)step.pattern=step.pattern.replace(/\\|TEST/g,'');if(step.page==='work'){step.page='today';step.text='From the same triggered snow occurrence, follow travel, arrival, start, plowing work, material used if any, proof, and closeout. For properties requiring both a plow truck and skid steer, keep both equipment steps on that same service occurrence.';}}";
const snowPatchNew="if(scenario.id==='NL-TRAIN-SNOW-FULL-SERVICE-PHONE')for(const step of scenario.steps){if(step.pattern)step.pattern=step.pattern.replace(/\\|TEST/g,'');}";
if(!originalV2.includes(snowPatchOld))throw new Error('Northern v2 snow transform drifted; refusing an unreviewed repair.');

const repaired=JSON.parse(JSON.stringify(snow));
for(const step of repaired.steps){
  if(step.page==='today'){
    step.page='work';
    step.text='Open the controlled snow service in Jobs and Work. Confirm the property, priority, access notes, equipment, and storm instructions before travel. Real snow occurrences that are due today also appear on Today; historical controlled training fixtures remain in Work.';
  }
}

function removeSnowOutputs(){
  for(const file of [path.join(out,repaired.id+'.json')]){try{fs.unlinkSync(file);}catch(_){}}
  for(const dir of [path.join(out,'audio'),path.join(out,'videos')]){
    if(!fs.existsSync(dir))continue;
    for(const name of fs.readdirSync(dir))if(name.startsWith(repaired.id+'-'))try{fs.unlinkSync(path.join(dir,name));}catch(_){}
  }
}
function proofFor(id){
  const file=path.join(out,id+'.json');
  if(!fs.existsSync(file))return null;
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){return null;}
}

try{
  if(!fs.existsSync(out))throw new Error('Prior Northern narrated artifact was not restored before repair.');
  removeSnowOutputs();
  fs.writeFileSync(basePath,JSON.stringify([repaired],null,2)+'\n');
  fs.writeFileSync(extraPath,'[]\n');
  fs.writeFileSync(v2Path,originalV2.replace(snowPatchOld,snowPatchNew));
  const env={...process.env,NORTHERN_TRAINING_DIR:out};
  const run=spawnSync(process.execPath,[runnerPath],{stdio:'inherit',env});
  if(run.status!==0)throw new Error('Northern snow repair recorder did not pass.');
}finally{
  fs.writeFileSync(basePath,originalBase);
  fs.writeFileSync(extraPath,originalExtra);
  fs.writeFileSync(v2Path,originalV2);
}

const snowProof=proofFor(repaired.id);
if(!snowProof||snowProof.status!=='PASS'||snowProof.externalActionsOccurred!==false)throw new Error('Northern snow repair proof is not PASS/no-external-actions.');
const proofs=all.map(x=>proofFor(x.id));
const failed=all.filter((x,i)=>!proofs[i]||proofs[i].status!=='PASS'||proofs[i].externalActionsOccurred!==false).map(x=>({id:x.id,error:proofFor(x.id)?.error||proofFor(x.id)?.muxError||'Missing PASS proof'}));
if(failed.length)throw new Error('Northern repaired library still has HOLD proof: '+JSON.stringify(failed));
const passed=all.map(x=>x.id);
const finalResult={status:'PASS',passed,failed:[],externalActionsOccurred:false,recordingMode:'artifact-reuse-plus-targeted-snow-repair',sourceArtifactRun:Number(process.env.NORTHERN_SOURCE_RUN_ID||36869899043),repairedScenario:repaired.id};
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(finalResult,null,2)+'\n');
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({kind:'northern-lakes-narrated-training',version:'20261001-targeted-snow-repair-1',status:'PASS',externalActionsOccurred:false,recordingMode:finalResult.recordingMode,sourceArtifactRun:finalResult.sourceArtifactRun,repairedScenario:repaired.id,videos:proofs},null,2)+'\n');
fs.writeFileSync(path.join(out,'README.md'),['# Northern Lakes Narrated Training Library','','Status: PASS','','39 controlled narrated lessons are present. The prior 38 PASS lessons were preserved and the snow lesson was recaptured against the canonical Work record because the controlled TEST snow fixture is historical. Real due-today snow occurrences remain visible on Today.','','Safety: no customer send, payment, purchase, refund, or external scheduling action was executed.',''].join('\n'));
console.log(JSON.stringify({status:'PASS',videos:passed.length,repairedScenario:repaired.id,externalActionsOccurred:false},null,2));
