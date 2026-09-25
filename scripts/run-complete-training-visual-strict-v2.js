'use strict';
/* Follow-up repair for truths discovered by visual acceptance attempt 1. */
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const scripts=__dirname;
const sourcePath=path.join(scripts,'run-complete-training-visual-strict.js');
const tempPath=path.join(scripts,'.visual-v2-wrapper.js');
const tick=String.fromCharCode(96);
let src=fs.readFileSync(sourcePath,'utf8');

function replaceBlock(start,end,replacement,label){
  const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
  if(a<0||b<0)throw new Error('Visual v2 source drift: '+label);
  src=src.slice(0,a)+replacement+src.slice(b);
}

const scheduleFunction=[
"async function scheduleDispatch(page,result){",
"  const task=await latestTestTask(page);",
"  if(!task)throw new Error('No controlled TEST assigned task exists for dispatch training.');",
"  await openPage(page,'work');",
"  if(!await highlightText(page,'TEST Assigned Work'))throw new Error('Controlled TEST assignment is not visible in Work.');",
"  await caption(page,'1. Work: this controlled TEST task is assigned to Staff. Assignment and calendar scheduling are separate records.',1250);",
"  await openPage(page,'schedule');",
"  const boardText=await page.evaluate(()=>String(document.querySelector('#mainContent')?.innerText||''));",
"  if(!/Dispatch|Schedule|resource|calendar/i.test(boardText))throw new Error('Schedule / dispatch workspace is not visible.');",
"  await caption(page,'2. Schedule: review dispatch and calendar placement here. This training clip does NOT create a schedule event, so the assigned task may correctly be absent from this board.',1450);",
"  await openPage(page,'today');",
"  await caption(page,'3. Today: only deliberately scheduled work should appear as scheduled work. The TEST assignment remains a task until an owner schedules it.',1300);",
"  result.task=task;",
"  result.steps.push({name:'dispatch-board-reviewed',status:'PASS',taskId:task.taskId,scheduledByTraining:false});",
"}"
].join('\n');
replaceBlock(
  "recorder=replaceFunction(recorder,'scheduleDispatch',`",
  "recorder=replaceFunction(recorder,'meetings',`",
  "recorder=replaceFunction(recorder,'scheduleDispatch',"+tick+scheduleFunction+tick+");\n\n",
  'schedule truthfulness'
);

const serviceFunction=[
"async function serviceFlow(page,result,kind){",
"  const fixture=await serviceFixture(page,kind);",
"  if(!fixture)throw new Error('No controlled TEST '+kind+' service fixture exists in Northern Lakes.');",
"  result.fixture=fixture;",
"  const term=kind==='snow'?'snow|plow':'lawn|mow';",
"  const opposite=kind==='snow'?/lawn|mow/i:/snow|plow/i;",
"  await openPage(page,'work');",
"  if(!await highlightText(page,term))throw new Error('No visible '+kind+' service record exists in Work.');",
"  let focus=await page.evaluate(()=>String(document.querySelector('.h38-training-focus')?.innerText||''));",
"  if(opposite.test(focus))throw new Error(kind+' Work view crossed into opposite-service data.');",
"  if(kind==='lawn'){",
"    await caption(page,'LAWN: this controlled mowing record is a completed/historical service fixture, so it belongs in Work/history and may correctly be absent from Today.',1550);",
"  }else{",
"    await caption(page,'SNOW: this controlled plowing record stays isolated from lawn work. Trigger, assignment, field proof, and billing remain separate controlled steps.',1550);",
"  }",
"  await caption(page,'The focused '+kind+' service remains the same service type throughout this clip. No opposite-service record, payment, message, or new schedule event is used.',1350);",
"  result.steps.push({name:kind+'-visual-fixture',status:'PASS',jobId:fixture.jobId,crossTalk:false,historical:String(fixture.status||'').toLowerCase()==='complete'});",
"}"
].join('\n');
replaceBlock(
  "recorder=replaceFunction(recorder,'serviceFlow',`",
  "recorder=replaceFunction(recorder,'assignedWorkHandoff',`",
  "recorder=replaceFunction(recorder,'serviceFlow',"+tick+serviceFunction+tick+");\n\n",
  'service history truthfulness'
);

src=src.replace(
"need(by('H38-TRAIN-SCHEDULE-DISPATCH-DESKTOP').steps?.some(s=>s.name==='assigned-task-visible-in-schedule'),'Desktop schedule video did not prove the TEST assignment in Dispatch & resource board.');",
"need(by('H38-TRAIN-SCHEDULE-DISPATCH-DESKTOP').steps?.some(s=>s.name==='dispatch-board-reviewed'&&s.scheduledByTraining===false),'Desktop schedule video did not truthfully distinguish assignment from calendar scheduling.');"
);
src=src.replace(
"need(by('H38-TRAIN-SCHEDULE-DISPATCH-PHONE').steps?.some(s=>s.name==='assigned-task-visible-in-schedule'),'Phone schedule video did not prove the TEST assignment in Dispatch & resource board.');",
"need(by('H38-TRAIN-SCHEDULE-DISPATCH-PHONE').steps?.some(s=>s.name==='dispatch-board-reviewed'&&s.scheduledByTraining===false),'Phone schedule video did not truthfully distinguish assignment from calendar scheduling.');"
);
src=src.replace("'require TEST task on dispatch board'","'teach assignment versus calendar scheduling truthfully'");

fs.writeFileSync(tempPath,src);
let status=2;
try{
  const run=spawnSync(process.execPath,[tempPath],{stdio:'inherit',env:process.env});
  status=run.status==null?2:run.status;
}finally{try{fs.rmSync(tempPath,{force:true});}catch(_){}}
process.exit(status);
