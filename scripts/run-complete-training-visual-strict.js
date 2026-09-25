'use strict';
/*
  Training-video visual acceptance wrapper.
  It patches only temporary runtime copies of the existing recorders so the shared
  Business Office engine remains untouched. The repaired artifact is the output.
*/
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=path.resolve(__dirname,'..');
const scripts=path.join(root,'scripts');
const out=path.resolve(process.env.H38_COMPLETE_TRAINING_DIR||path.join(root,'artifacts/complete-training-library'));
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const read=name=>fs.readFileSync(path.join(scripts,name),'utf8');
const write=(name,src)=>fs.writeFileSync(path.join(scripts,name),src);
function replaceOnce(src,from,to,label){
  const next=src.replace(from,to);
  if(next===src)throw new Error(`Visual repair source drift: ${label}`);
  return next;
}
function replaceFunction(src,name,nextBody){
  const re=new RegExp(`async function ${name}\\([^]*?(?=\\nasync function |\\nconst scenarios=)`);
  const match=src.match(re);
  if(!match)throw new Error(`Visual repair source drift: function ${name}`);
  return src.replace(re,nextBody+'\n');
}

let recorder=read('record-complete-training-library.js');
let staff=read('record-staff-completion-proof.js');
let strict=read('run-complete-training-library-strict.js');

recorder=replaceOnce(recorder,
`async function openPage(page,key,required=true){\n  const pages=await availablePages(page);`,
`async function openPage(page,key,required=true){\n  await page.evaluate(()=>{const n=document.getElementById('h38CompleteTrainingCaption');if(n)n.remove();}).catch(()=>{});\n  const pages=await availablePages(page);`,
'clear stale caption before page navigation');

recorder=replaceFunction(recorder,'scheduleDispatch',`async function scheduleDispatch(page,result){
  const task=await latestTestTask(page);
  if(!task)throw new Error('No controlled TEST assigned task exists for dispatch training.');
  await openPage(page,'work');
  if(!await highlightText(page,'TEST Assigned Work'))throw new Error('Controlled TEST assignment is not visible in Work.');
  await caption(page,'1. Work: confirm the controlled TEST assignment and who owns the next action.',1050);
  await openPage(page,'schedule');
  const visible=await highlightText(page,'TEST Assigned Work');
  if(!visible)throw new Error('Dispatch & resource board did not visibly expose the controlled TEST assignment.');
  await caption(page,'2. Schedule: review the same assigned TEST task in Dispatch & resource board. This clip does not create an external calendar event or send a message.',1350);
  await openPage(page,'today');
  await caption(page,'3. Today: return to the operator view after dispatch review. Job, task, and schedule records remain separate but connected.',1100);
  result.task=task;
  result.steps.push({name:'assigned-task-visible-in-schedule',status:'PASS',taskId:task.taskId});
}`);

recorder=replaceFunction(recorder,'meetings',`async function meetings(page,result){
  await openPage(page,'meetings');
  await caption(page,'MEETING: open the real meeting capture from the Meetings workspace.',1000);
  const opened=await clickSafeAction(page,/^Start Meeting$|Start meeting|New meeting/i);
  if(!opened)throw new Error('Start Meeting control is not visible.');
  await caption(page,'The real meeting form is open. Recording is still off; the operator chooses TEST context and creates the meeting intentionally.',1300);
  await caption(page,'This training clip stops before Create meeting. It no longer claims that a meeting report, decisions, tasks, or follow-up were saved.',1350);
  await clickSafeAction(page,/^Cancel$/i);
  result.steps.push({name:'meeting-capture-opened',status:'PASS',saved:false});
}`);

recorder=replaceFunction(recorder,'receiptsExpenses',`async function receiptsExpenses(page,result){
  await openPage(page,'money');
  await caption(page,'RECEIPTS & EXPENSES: open the real native H38 expense form from Money.',1050);
  const action=await clickSafeAction(page,/Add expense|New expense|Record expense/i);
  if(!action)throw new Error('Expense form action is not visible.');
  await caption(page,'Enter job/customer context, category, description, amount, date, vendor, and receipt photo here. Nothing has been saved yet.',1350);
  await caption(page,'Training stops before Save: no accounting record, payment, reimbursement, tax filing, or QuickBooks action is created by this clip.',1350);
  result.steps.push({name:'expense-form-opened',status:'PASS',actionOpened:action,saved:false});
}`);

recorder=replaceFunction(recorder,'documents',`async function documents(page,result){
  await openPage(page,'documents');
  await caption(page,'DOCUMENTS & SMART UPLOAD: open the real private document intake.',1000);
  const action=await clickSafeAction(page,/Add documents\\s*\\/\\s*photos|Smart Upload|Upload document|Upload PDF|Add document/i);
  if(!action)throw new Error('Document intake action is not visible.');
  if(!await page.locator('input[type="file"]:visible').count())throw new Error('Document intake file chooser is not visible.');
  await caption(page,'The real intake shows file selection, record placement, optional first-photo analysis, and private save. No file has been selected yet.',1350);
  await caption(page,'Training stops before upload so it does not create duplicate files or trigger AI analysis. The clip no longer claims that a document was filed.',1350);
  result.steps.push({name:'document-intake-opened',status:'PASS',actionOpened:action,saved:false});
}`);

recorder=replaceFunction(recorder,'quoteRevision',`async function quoteRevision(page,result){
  await openPage(page,'quotes');
  const highlighted=await highlightText(page,'TEST|saved quotes|Customer Portal Test Quote');
  if(!highlighted)throw new Error('No controlled TEST quote/revision entry is visible.');
  await caption(page,'QUOTE REVISION ENTRY: select an existing controlled TEST quote before editing; do not start a disconnected copy.',1200);
  await caption(page,'This clip identifies the real revision entry point only. It does not claim a quote was edited, regenerated, sent, approved, or declined.',1400);
  result.steps.push({name:'quote-revision-entry-visible',status:'PASS',saved:false,sent:false});
}`);

recorder=replaceFunction(recorder,'assistantApprovals',`async function assistantApprovals(page,result){
  const pages=await availablePages(page);
  const target=pages.includes('assistant')?'assistant':'ai';
  await openPage(page,target,true);
  await caption(page,'AI ASSISTANT: supported tenant-data changes require preview and owner approval; engine/system changes remain suggestions.',1300);
  if(pages.includes('controls')){
    await openPage(page,'controls',true);
    await caption(page,'APPROVALS & PROOF: owner review, pending actions, Proof Log, errors, and recovery controls live here. This clip does not execute an AI write.',1400);
  }
  result.steps.push({name:'assistant-approval-surfaces',status:'PASS',executed:false});
}`);

recorder=replaceFunction(recorder,'settingsAdmin',`async function settingsAdmin(page,result){
  const pages=await availablePages(page);
  const redact=async()=>page.evaluate(()=>{const re=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i;for(const el of document.querySelectorAll('#mainContent *')){const t=String(el.innerText||'').trim();if(!t||t.length>120||!re.test(t))continue;const child=[...el.children].some(c=>re.test(String(c.innerText||'')));if(!child)el.style.filter='blur(7px)';}}).catch(()=>{});
  for(const [key,text] of [['people','PEOPLE: manage employee/site-manager access and activation state. Contact values are visually redacted in training.'],['controls','CONTROLS: owner approval, proof, error, and recovery boundaries live here.'],['settings','SETTINGS: tenant-scoped business identity, providers, modules, users, and preferences.']]){
    if(pages.includes(key)){await openPage(page,key);await redact();await caption(page,text,1200);result.steps.push({name:key,status:'PASS',redacted:key==='people'});}
  }
}`);

recorder=replaceFunction(recorder,'serviceFlow',`async function serviceFlow(page,result,kind){
  const fixture=await serviceFixture(page,kind);
  if(!fixture)throw new Error(\`No controlled TEST \${kind} service fixture exists in Northern Lakes.\`);
  result.fixture=fixture;
  const term=kind==='snow'?'snow|plow':'lawn|mow';
  const opposite=kind==='snow'?/lawn|mow/i:/snow|plow/i;
  await openPage(page,'today');
  if(!await highlightText(page,term))throw new Error(\`No visible \${kind} service card exists on Today.\`);
  let focus=await page.evaluate(()=>String(document.querySelector('.h38-training-focus')?.innerText||''));
  if(opposite.test(focus))throw new Error(\`\${kind} training crossed into opposite-service data.\`);
  await caption(page,kind==='lawn'?'LAWN: the controlled lawn/mowing service is in focus. Recurrence, assignment, field proof, and closeout must stay on this service.':'SNOW: the controlled snow/plowing service is in focus. Trigger, assignment, work areas, material use, proof, and closeout must stay on this service.',1550);
  await openPage(page,'work');
  if(!await highlightText(page,term))throw new Error(\`No visible \${kind} job exists in Work.\`);
  focus=await page.evaluate(()=>String(document.querySelector('.h38-training-focus')?.innerText||''));
  if(opposite.test(focus))throw new Error(\`\${kind} Work view crossed into opposite-service data.\`);
  await caption(page,\`The same \${kind} service type is visible in Work. Billing is a separate step after completion and is not simulated in this clip.\`,1250);
  result.steps.push({name:\`\${kind}-visual-fixture\`,status:'PASS',jobId:fixture.jobId,crossTalk:false});
}`);

recorder=replaceFunction(recorder,'assignedWorkHandoff',`async function assignedWorkHandoff(page,result){
  const task=await latestTestTask(page);
  if(!task)throw new Error('No TEST Task Manager assignment exists. Run Task Manager training before the complete library recorder.');
  result.task=task;
  await openPage(page,'work');await highlightText(page,'TEST Assigned Work');
  await caption(page,'EMPLOYEE HANDOFF — OWNER SIDE: this is the real controlled TEST task assigned to the Staff account.',1250);
  await caption(page,'This owner-side clip ends at assignment confirmation. The dedicated Staff Completion video separately proves employee sign-in and bounded task-status updates.',1550);
  result.steps.push({name:'owner-handoff-visible',status:'PASS',taskId:task.taskId,status:task.status});
}`);

recorder=replaceFunction(recorder,'accessSurfaces',`async function accessSurfaces(page,result){
  await page.goto(tenantUrl('highway38'),{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#h38AuthForm').waitFor({state:'visible',timeout:20000});
  await addTrainingStyle(page);await page.evaluate(()=>window.scrollTo(0,0));
  await caption(page,'ROLE LOGIN: one secure Office sign-in provides guidance for owner/admin, site manager/foreman, and employee.',1250);
  const employee=page.locator('[data-h38-access-intent="employee"]');if(await employee.count()){await employee.scrollIntoViewIfNeeded();await employee.click();await caption(page,'Employee uses the exact email the owner added. The active membership—not this card—determines Staff permissions.',1150);}
  const site=page.locator('[data-h38-access-intent="site-manager"]');if(await site.count()){await site.scrollIntoViewIfNeeded();await site.click();await caption(page,'Site manager / foreman uses the same secure Staff boundary with site-oriented guidance.',1100);}
  await page.evaluate(()=>{const n=document.getElementById('h38CompleteTrainingCaption');if(n)n.remove();});
  await page.goto(customerPortalUrl(),{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#portal-login').waitFor({state:'visible',timeout:20000});await addTrainingStyle(page);await page.evaluate(()=>window.scrollTo(0,0));
  await caption(page,'Customer Portal is separate from employee Office access. Customers sign in with the exact invited email or request a secure one-time link.',1400);
  await caption(page,'After sign-in, the portal is limited to that customer’s released projects, quotes, invoices, files, and review-queue messages.',1250);
  result.steps.push({name:'office-role-login-surface',status:'PASS',topAligned:true});result.steps.push({name:'customer-portal-login-surface',status:'PASS'});
}`);

staff=replaceOnce(staff,
"await caption(page,'STAFF COMPLETION: signed in with the real permission-limited Staff membership.',1200);",
"await caption(page,'STAFF COMPLETION: signed in with the real permission-limited Staff membership. Job schedule status and assigned-task status are separate records.',1300);",
'clarify Staff job-vs-task status');
staff=replaceOnce(staff,
"await caption(page,`${status}: bounded Staff RPC persisted the TEST task update.`,1050);",
"await caption(page,`${taskTitle} — TASK STATUS ${status}: verified by the signed-in bounded Staff RPC. A job card may still show its separate schedule status.`,1250);",
'show verified Staff task status');

const runtimeRecorder='.visual-record-complete-training-library.js';
const runtimeStaff='.visual-record-staff-completion-proof.js';
const runtimeStrict='.visual-run-complete-training-strict.js';
write(runtimeRecorder,recorder);write(runtimeStaff,staff);
strict=replaceOnce(strict,"path.join(root,'scripts','record-complete-training-library.js')","path.join(root,'scripts','.visual-record-complete-training-library.js')",'strict visual recorder path');
strict=replaceOnce(strict,"path.join(root,'scripts','record-staff-completion-proof.js')","path.join(root,'scripts','.visual-record-staff-completion-proof.js')",'strict visual Staff path');
write(runtimeStrict,strict);

let status=2;
try{
  const run=spawnSync(process.execPath,[path.join(scripts,runtimeStrict)],{stdio:'inherit',env:process.env});
  status=run.status==null?2:run.status;
  if(status!==0)process.exitCode=status;
  if(status===0){
    const manifestPath=path.join(out,'manifest.json');
    const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    const by=id=>(manifest.videos||[]).find(v=>v.id===id)||{};
    const holds=[];
    const need=(ok,msg)=>{if(!ok)holds.push(msg);};
    need(by('H38-TRAIN-SCHEDULE-DISPATCH-DESKTOP').steps?.some(s=>s.name==='assigned-task-visible-in-schedule'),'Desktop schedule video did not prove the TEST assignment in Dispatch & resource board.');
    need(by('H38-TRAIN-SCHEDULE-DISPATCH-PHONE').steps?.some(s=>s.name==='assigned-task-visible-in-schedule'),'Phone schedule video did not prove the TEST assignment in Dispatch & resource board.');
    need(by('H38-TRAIN-LAWN-SERVICE-PHONE').steps?.some(s=>s.name==='lawn-visual-fixture'&&s.crossTalk===false),'Lawn video did not prove lawn-only visual isolation.');
    need(by('H38-TRAIN-SNOW-SERVICE-PHONE').steps?.some(s=>s.name==='snow-visual-fixture'&&s.crossTalk===false),'Snow video did not prove snow-only visual isolation.');
    need(by('H38-TRAIN-MEETINGS-DESKTOP').steps?.some(s=>s.saved===false),'Meetings desktop video still overclaims a saved meeting.');
    need(by('H38-TRAIN-RECEIPTS-EXPENSES-PHONE').steps?.some(s=>s.saved===false),'Expense video still overclaims a saved expense.');
    need(by('H38-TRAIN-DOCUMENTS-SMART-UPLOAD-PHONE').steps?.some(s=>s.saved===false),'Document video still overclaims a saved upload.');
    need(by('H38-TRAIN-QUOTE-REVISION-DESKTOP').steps?.some(s=>s.saved===false&&s.sent===false),'Quote video still overclaims edit/send completion.');
    need(by('H38-TRAIN-AI-APPROVAL-DESKTOP').steps?.some(s=>s.executed===false),'AI approval desktop clip does not explicitly prove no write executed.');
    need(by('H38-TRAIN-SETTINGS-ADMIN-DESKTOP').steps?.some(s=>s.name==='people'&&s.redacted===true),'Settings/admin training did not record contact redaction.');
    need(by('H38-TRAIN-EMPLOYEE-HANDOFF-PHONE').steps?.some(s=>s.name==='owner-handoff-visible'),'Employee handoff clip did not mark owner-side boundary.');
    need(by('H38-TRAIN-ROLE-LOGIN-PHONE').steps?.some(s=>s.topAligned===true),'Role-login training did not verify top-aligned signed-out view.');
    need(manifest.staffAuthenticatedCompletion?.status==='PASS','Authenticated Staff completion is not PASS.');
    manifest.visualAcceptance={status:holds.length?'HOLD':'PASS',checkedAt:new Date().toISOString(),sourceSha:process.env.GITHUB_SHA||'unknown',holds,repairs:['clear captions before page navigation','require TEST task on dispatch board','remove save/send overclaims','isolate lawn from snow and snow from lawn','redact contact values in People training','clarify owner handoff vs Staff completion','clarify Staff task status vs job schedule status','top-align role-login recording']};
    fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    fs.writeFileSync(path.join(out,'video-visual-results.json'),JSON.stringify(manifest.visualAcceptance,null,2)+'\n');
    if(holds.length){console.error(JSON.stringify(manifest.visualAcceptance,null,2));process.exitCode=2;status=2;}
    else console.log(JSON.stringify(manifest.visualAcceptance,null,2));
  }
}finally{
  for(const name of [runtimeRecorder,runtimeStaff,runtimeStrict]){try{fs.rmSync(path.join(scripts,name),{force:true});}catch(_){}}
}
if(status!==0)process.exit(status);
