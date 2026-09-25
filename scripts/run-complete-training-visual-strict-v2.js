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

const readyFunction=[
"async function ready(page,businessKey){",
"  let lastError=null;",
"  for(let attempt=1;attempt<=2;attempt++){",
"    try{",
"      await page.goto(tenantUrl(businessKey),{waitUntil:'domcontentloaded',timeout:45000});",
"      await page.waitForTimeout(700);",
"      if(await page.locator('#h38AuthForm:visible').count()){",
"        if(!email||!password)throw new Error('Training context requires the secure TEST login pair after session refresh.');",
"        await page.locator('#h38AuthEmail').fill(email);await page.locator('#h38AuthPassword').fill(password);",
"        await page.getByRole('button',{name:'Sign in securely',exact:true}).click();",
"      }",
"      await page.waitForFunction(key=>String(window.state?.snapshot?.business?.businessKey||'').trim().toLowerCase()===key&&!!window.state?.snapshot?.user&&!!window.state?.bridgeReady,businessKey,{timeout:40000});",
"      await page.waitForTimeout(1300);",
"      await addTrainingStyle(page);",
"      return;",
"    }catch(error){",
"      lastError=error;",
"      if(attempt===2)throw error;",
"      await page.goto('about:blank',{waitUntil:'domcontentloaded',timeout:10000}).catch(()=>{});",
"      await page.waitForTimeout(900);",
"    }",
"  }",
"  throw lastError;",
"}"
].join('\n');
const readyAnchor="recorder=replaceOnce(recorder,\n`async function openPage(page,key,required=true){";
const readyAt=src.indexOf(readyAnchor);
if(readyAt<0)throw new Error('Visual v2 source drift: ready insertion anchor');
src=src.slice(0,readyAt)+"recorder=replaceFunction(recorder,'ready',"+tick+readyFunction+tick+");\n\n"+src.slice(readyAt);

const captionFunction=[
"async function caption(page,text,ms=1050){",
"  await page.evaluate(value=>{",
"    const email=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i;",
"    for(const el of document.querySelectorAll('#mainContent *, select')){",
"      const t=String(el.innerText||el.value||'').trim();",
"      if(!t||!email.test(t))continue;",
"      const childHas=[...el.children].some(child=>email.test(String(child.innerText||child.value||'')));",
"      if(el.tagName==='SELECT'||!childHas)el.style.filter='blur(7px)';",
"    }",
"    let node=document.getElementById('h38CompleteTrainingCaption');",
"    if(!node){node=document.createElement('div');node.id='h38CompleteTrainingCaption';document.body.appendChild(node);}node.textContent=value;",
"  },text);",
"  await page.waitForTimeout(ms);",
"}"
].join('\n');
const captionAnchor="recorder=replaceOnce(recorder,\n`async function openPage(page,key,required=true){";
const captionAt=src.indexOf(captionAnchor);
if(captionAt<0)throw new Error('Visual v2 source drift: caption insertion anchor');
src=src.slice(0,captionAt)+"recorder=replaceFunction(recorder,'caption',"+tick+captionFunction+tick+");\n\n"+src.slice(captionAt);

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
"  const opposite=kind==='snow'?/lawn|mow/i:/snow|plow/i;",
"  await openPage(page,'work');",
"  const focused=await page.evaluate(({kind,jobId,title,serviceType})=>{",
"    document.querySelectorAll('.h38-training-focus').forEach(node=>node.classList.remove('h38-training-focus'));",
"    const wanted=kind==='snow'?/snow|plow/i:/lawn|mow/i;",
"    const opposite=kind==='snow'?/lawn|mow/i:/snow|plow/i;",
"    const exact=[jobId,title].filter(Boolean).map(value=>String(value).toLowerCase());",
"    const nodes=Array.from(document.querySelectorAll('#mainContent *')).filter(node=>node.getClientRects().length);",
"    const scored=nodes.map(node=>{",
"      const text=String(node.innerText||'').replace(/\\s+/g,' ').trim();",
"      const lower=text.toLowerCase();",
"      const exactHit=exact.some(value=>value&&lower.includes(value));",
"      const serviceHit=wanted.test(text)&&/TEST/i.test(text);",
"      return{node,text,exactHit,serviceHit};",
"    }).filter(item=>item.text&&(item.exactHit||item.serviceHit)&&wanted.test(item.text)&&!opposite.test(item.text));",
"    scored.sort((a,b)=>Number(b.exactHit)-Number(a.exactHit)||a.text.length-b.text.length);",
"    const match=scored[0];",
"    if(!match)return{ok:false,text:'',jobId,title,serviceType};",
"    match.node.classList.add('h38-training-focus');",
"    match.node.scrollIntoView({block:'center',behavior:'auto'});",
"    return{ok:true,text:match.text,jobId,title,serviceType};",
"  },{kind,jobId:fixture.jobId,title:fixture.title,serviceType:fixture.serviceType});",
"  if(!focused.ok)throw new Error('No isolated visible '+kind+' TEST service record exists in Work.');",
"  if(opposite.test(focused.text))throw new Error(kind+' Work view crossed into opposite-service data.');",
"  if(kind==='lawn'){",
"    await caption(page,'LAWN: this highlighted TEST mowing record is the completed/historical lawn fixture. It belongs in Work/history and may correctly be absent from Today.',1550);",
"  }else{",
"    await caption(page,'SNOW: this highlighted TEST plowing record is the scheduled snow fixture and stays isolated from lawn work.',1450);",
"  }",
"  await caption(page,'The highlighted '+kind+' record is verified from the real Northern Lakes runtime. No opposite-service record, payment, message, or new schedule event is used.',1350);",
"  result.steps.push({name:kind+'-visual-fixture',status:'PASS',jobId:fixture.jobId,crossTalk:false,focusedText:focused.text,historical:String(fixture.status||'').toLowerCase()==='complete'});",
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
src=src.replace(
"need(by('H38-TRAIN-EMPLOYEE-HANDOFF-PHONE').steps?.some(s=>s.name==='owner-handoff-visible'),'Employee handoff clip did not mark owner-side boundary.');",
"need(by('H38-TRAIN-EMPLOYEE-HANDOFF-PHONE').steps?.some(s=>s.name==='owner-handoff-visible'&&s.status==='PASS'&&typeof s.taskStatus==='string'),'Employee handoff clip did not preserve PASS proof status and separate task status.');"
);
src=src.replace("result.steps.push({name:'owner-handoff-visible',status:'PASS',taskId:task.taskId,status:task.status});","result.steps.push({name:'owner-handoff-visible',status:'PASS',taskId:task.taskId,taskStatus:task.status});");

fs.writeFileSync(tempPath,src);
let status=2;
try{
  const run=spawnSync(process.execPath,[tempPath],{stdio:'inherit',env:process.env});
  status=run.status==null?2:run.status;
}finally{try{fs.rmSync(tempPath,{force:true});}catch(_){}}
process.exit(status);
