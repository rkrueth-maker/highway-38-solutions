'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const out=path.resolve(process.env.H38_COMPLETE_TRAINING_DIR||path.join(root,'artifacts/complete-training-library'));
const resultsPath=path.join(out,'results.json');
const run=(script)=>spawnSync(process.execPath,[path.join(root,'scripts',script)],{stdio:'inherit',env:process.env});
const first=run('record-complete-training-library.js');
if(first.status===0)process.exit(0);
if(!fs.existsSync(resultsPath))process.exit(first.status||2);
let results;
try{results=JSON.parse(fs.readFileSync(resultsPath,'utf8'));}catch(_){process.exit(first.status||2);}
const failed=Array.isArray(results.failed)?results.failed:[];
const exactSnowGap=failed.length===1&&failed[0]?.id==='H38-TRAIN-SNOW-SERVICE-PHONE'&&String(failed[0]?.error||'')==='No controlled TEST snow service fixture exists in Northern Lakes.';
if(!exactSnowGap){console.error('Complete training recorder failed outside the approved snow-fixture fallback boundary.');process.exit(first.status||2);}
console.log('Only the dedicated TEST snow fixture is missing; recording the real Northern Lakes snow operator path without fabricating customer/job data.');
const repair=run('record-snow-service-training.js');
if(repair.status!==0)process.exit(repair.status||2);
const after=JSON.parse(fs.readFileSync(resultsPath,'utf8'));
if(after.status!=='PASS'||(after.failed||[]).length){console.error('Complete training library still contains a HOLD after snow training fallback.');process.exit(2);}
console.log('Complete H38 training library PASS, with the snow clip explicitly marked as real-runtime operator training without a dedicated TEST snow fixture.');
