'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=path.resolve(__dirname,'..');
const out=path.resolve(process.env.H38_COMPLETE_TRAINING_DIR||path.join(root,'artifacts/complete-training-library'));
const manifestPath=path.join(out,'manifest.json');
const resultsPath=path.join(out,'results.json');
const strictPath=path.join(out,'strict-results.json');
const staffResultPath=path.join(out,'staff-authenticated','staff-completion-result.json');
const clean=value=>String(value==null?'':value).replace(/\s+/g,' ').trim();

const env={...process.env};
// The Play-review account is an H38-owned TEST Staff identity. A real Staff proof must use
// its own dedicated CI credential pair. Never reuse or assume the owner TEST password.
env.H38_WORKFLOW_STAFF_EMAIL=clean(env.H38_WORKFLOW_STAFF_EMAIL)||'highway38solutions+playreview@gmail.com';
env.H38_WORKFLOW_STAFF_PASSWORD=String(env.H38_WORKFLOW_STAFF_PASSWORD||'');

// The complete-library recorder owns the 18 canonical workflow videos. Canonical Staff startup
// intentionally does not auto-load the optional employee-workspace companion, so Staff completion
// is proven separately below through the same authenticated bounded RPCs used by that companion.
const baseEnv={...env,H38_WORKFLOW_STAFF_EMAIL:'',H38_WORKFLOW_STAFF_PASSWORD:''};
const run=spawnSync(process.execPath,[path.join(root,'scripts','record-complete-training-library.js')],{stdio:'inherit',env:baseEnv});
if(run.status!==0){
  console.error(`Complete training recorder returned ${run.status}; strict acceptance will not mask the failure.`);
  process.exit(run.status||2);
}
if(!fs.existsSync(manifestPath)||!fs.existsSync(resultsPath)){
  console.error('Strict acceptance requires manifest.json and results.json.');
  process.exit(2);
}
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const results=JSON.parse(fs.readFileSync(resultsPath,'utf8'));

if(env.H38_WORKFLOW_STAFF_EMAIL&&env.H38_WORKFLOW_STAFF_PASSWORD){
  fs.rmSync(staffResultPath,{force:true});
  const staffRun=spawnSync(process.execPath,[path.join(root,'scripts','record-staff-completion-proof.js')],{stdio:'inherit',env});
  let staffResult=null;
  if(fs.existsSync(staffResultPath)){
    try{staffResult=JSON.parse(fs.readFileSync(staffResultPath,'utf8'));}catch(_){}
  }
  if(staffRun.status===0&&staffResult?.status==='PASS'){
    manifest.staffAuthenticatedCompletion={
      status:'PASS',
      taskId:staffResult.taskId||'',
      taskTitle:staffResult.taskTitle||'',
      transitions:staffResult.transitions||[],
      detail:staffResult.detail||'Authenticated Staff completed a controlled TEST assignment through the canonical bounded employee RPCs.'
    };
    manifest.credentialGates=(manifest.credentialGates||[]).filter(item=>!/Authenticated Staff post-login completion/i.test(String(item)));
    results.credentialGates=(results.credentialGates||[]).filter(item=>!/Authenticated Staff post-login completion/i.test(String(item)));
  }else{
    manifest.staffAuthenticatedCompletion={
      status:'HOLD',
      detail:staffResult?.error||`Canonical Staff completion proof returned ${staffRun.status}.`
    };
  }
}else{
  manifest.staffAuthenticatedCompletion={status:'EXTERNAL_GATE',detail:'Add H38_WORKFLOW_STAFF_EMAIL and H38_WORKFLOW_STAFF_PASSWORD for a real Staff post-login completion recording.'};
}
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(resultsPath,JSON.stringify(results,null,2)+'\n');

const holds=[];
const required=[
  'H38-TRAIN-FULL-OFFICE-MAP-DESKTOP',
  'H38-TRAIN-OWNER-DAILY-DESKTOP','H38-TRAIN-OWNER-DAILY-PHONE',
  'H38-TRAIN-SCHEDULE-DISPATCH-DESKTOP','H38-TRAIN-SCHEDULE-DISPATCH-PHONE',
  'H38-TRAIN-MEETINGS-DESKTOP','H38-TRAIN-MEETINGS-PHONE',
  'H38-TRAIN-RECEIPTS-EXPENSES-PHONE',
  'H38-TRAIN-DOCUMENTS-SMART-UPLOAD-DESKTOP','H38-TRAIN-DOCUMENTS-SMART-UPLOAD-PHONE',
  'H38-TRAIN-QUOTE-REVISION-DESKTOP',
  'H38-TRAIN-AI-APPROVAL-DESKTOP','H38-TRAIN-AI-APPROVAL-PHONE',
  'H38-TRAIN-SETTINGS-ADMIN-DESKTOP',
  'H38-TRAIN-LAWN-SERVICE-PHONE','H38-TRAIN-SNOW-SERVICE-PHONE',
  'H38-TRAIN-EMPLOYEE-HANDOFF-PHONE','H38-TRAIN-ROLE-LOGIN-PHONE'
];
for(const id of required){
  const item=(manifest.videos||[]).find(video=>video.id===id);
  if(!item)holds.push(`${id}: missing from manifest`);
  else if(item.status!=='PASS')holds.push(`${id}: ${item.error||item.status||'HOLD'}`);
  else if(item.externalActionsOccurred!==false)holds.push(`${id}: externalActionsOccurred must be false`);
}
if(manifest.staffAuthenticatedCompletion?.status!=='PASS'){
  holds.push(`Authenticated Staff completion: ${manifest.staffAuthenticatedCompletion?.detail||manifest.staffAuthenticatedCompletion?.status||'missing'}`);
}
const snow=(manifest.videos||[]).find(video=>video.id==='H38-TRAIN-SNOW-SERVICE-PHONE');
if(!snow?.fixture?.jobId||!/TEST/i.test(String(snow.fixture.jobId))||!/snow|plow/i.test(`${snow.fixture.title||''} ${snow.fixture.serviceType||''}`)){
  holds.push('Snow service: dedicated Northern controlled TEST snow fixture was not loaded by the real runtime.');
}
const lawn=(manifest.videos||[]).find(video=>video.id==='H38-TRAIN-LAWN-SERVICE-PHONE');
if(!lawn?.fixture?.jobId||!/TEST/i.test(String(lawn.fixture.jobId))){
  holds.push('Lawn service: controlled TEST lawn fixture was not loaded by the real runtime.');
}
if(manifest.externalActionsOccurred!==false)holds.push('Library manifest reports an unintended external action.');
if(results.status!=='PASS'||(results.failed||[]).length)holds.push('Base complete-training results are not PASS.');

const strict={
  status:holds.length?'HOLD':'PASS',
  sourceSha:manifest.sourceSha||process.env.GITHUB_SHA||'unknown',
  checkedAt:new Date().toISOString(),
  videosRequired:required.length,
  videosPresent:(manifest.videos||[]).length,
  staffAuthenticatedCompletion:manifest.staffAuthenticatedCompletion||null,
  snowFixture:snow?.fixture||null,
  lawnFixture:lawn?.fixture||null,
  externalActionsOccurred:manifest.externalActionsOccurred,
  holds
};
fs.writeFileSync(strictPath,JSON.stringify(strict,null,2)+'\n');
if(holds.length){
  console.error(JSON.stringify(strict,null,2));
  process.exit(2);
}
console.log(JSON.stringify(strict,null,2));
