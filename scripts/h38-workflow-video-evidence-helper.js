'use strict';

const fs=require('fs');
const path=require('path');

function evidenceDir(){
  return path.resolve(process.env.EVIDENCE_DIR||'artifacts/workflow-video-evidence');
}

function append(lines){
  const text=`${lines.join('\n')}\n`;
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,text);
  else console.log(text.trimEnd());
}

function writeJson(file,value){
  fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`);
}

function writeHoldEvidence(out,code,detail){
  const capturedAt=new Date().toISOString();
  const evidence={status:'HOLD',code,detail,capturedAt,sourceSha:process.env.GITHUB_SHA||'local'};
  fs.mkdirSync(out,{recursive:true});
  writeJson(path.join(out,'manifest.json'),evidence);
  writeJson(path.join(out,'results.json'),{status:'HOLD',workflows:[],failure:evidence});
}

function runPreflight(){
  const out=evidenceDir();
  fs.mkdirSync(out,{recursive:true});
  let holdCode='';
  let holdDetail='';
  if(process.env.RECORDING_AUTHORIZED!=='true'){
    holdCode='AUTHORIZATION_REQUIRED';
    holdDetail='Recording intentionally held. Re-run workflow_dispatch and set recording_authorized=true only for controlled TEST records.';
  }else if(!process.env.STORAGE_STATE){
    holdCode='AUTH_STORAGE_STATE_REQUIRED';
    holdDetail='Missing repository secret H38_WORKFLOW_STORAGE_STATE. Add an authorized TEST storage state and rerun this workflow.';
  }

  if(holdCode){
    writeHoldEvidence(out,holdCode,holdDetail);
    append([
      '### H38 Workflow Video Evidence — HOLD',
      '',
      '- Status: HOLD',
      `- Code: ${holdCode}`,
      `- Detail: ${holdDetail}`
    ]);
    console.log(`::error title=${holdCode}::${holdDetail}`);
    process.exit(2);
  }

  console.log('::notice::Authorization and storage-state prerequisite checks passed.');
}

function readJson(file){
  if(!fs.existsSync(file))return null;
  try{
    return JSON.parse(fs.readFileSync(file,'utf8'));
  }catch(error){
    append([
      '### H38 Workflow Video Evidence — Summary unavailable',
      '',
      `- File: \`${file}\``,
      `- Detail: Unable to parse JSON (${error.message})`
    ]);
    return null;
  }
}

function runSummary(){
  const dir=evidenceDir();
  const results=readJson(path.join(dir,'results.json'));
  const manifest=readJson(path.join(dir,'manifest.json'));
  const source=results||manifest;
  if(!source){
    append([
      '### H38 Workflow Video Evidence — No evidence files found',
      '',
      '- Status: UNKNOWN',
      '- Detail: `manifest.json` and `results.json` were not generated.'
    ]);
    console.log('No manifest/results evidence files were found to summarize.');
    return;
  }

  const failure=(source&&typeof source.failure==='object'&&source.failure)||null;
  const status=String(source.status||failure?.status||'UNKNOWN');
  const code=failure?.code||source.code||'N/A';
  const detail=failure?.detail||source.detail||'No additional detail provided.';
  append([
    '### H38 Workflow Video Evidence — Result',
    '',
    `- Status: ${status}`,
    `- Code: ${code}`,
    `- Detail: ${detail}`
  ]);
  console.log(JSON.stringify({status,code,detail}));
}

const mode=process.argv[2];
if(mode==='preflight')runPreflight();
else if(mode==='summarize')runSummary();
else{
  console.error('Usage: node scripts/h38-workflow-video-evidence-helper.js <preflight|summarize>');
  process.exit(1);
}
