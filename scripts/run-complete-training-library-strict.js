'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=path.resolve(__dirname,'..');
const out=path.resolve(process.env.H38_COMPLETE_TRAINING_DIR||path.join(root,'artifacts/complete-training-library'));
const manifestPath=path.join(out,'manifest.json');
const resultsPath=path.join(out,'results.json');
const strictPath=path.join(out,'strict-results.json');
const clean=value=>String(value==null?'':value).replace(/\s+/g,' ').trim();

const env={...process.env};
// The Play-review account is an H38-owned TEST Staff identity. Prefer dedicated CI secrets,
// but when only the established TEST owner password is configured, safely try that password
// against the TEST Staff alias. Authentication still has to prove the runtime role is Staff.
env.H38_WORKFLOW_STAFF_EMAIL=clean(env.H38_WORKFLOW_STAFF_EMAIL)||'highway38solutions+playreview@gmail.com';
env.H38_WORKFLOW_STAFF_PASSWORD=String(env.H38_WORKFLOW_STAFF_PASSWORD||env.H38_WORKFLOW_TEST_PASSWORD||'');

const run=spawnSync(process.execPath,[path.join(root,'scripts','record-complete-training-library.js')],{stdio:'inherit',env});
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
