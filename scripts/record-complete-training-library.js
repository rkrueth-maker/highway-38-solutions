'use strict';
/*
  Real deployed H38 Business Office training-library recorder.
  It records the authenticated production runtime with controlled TEST data only.
  It never constructs a mock Office screen and never sends customer messages, purchases,
  payments, schedules, or other external actions.
*/
const fs=require('fs');
const path=require('path');
const os=require('os');
const {spawnSync}=require('child_process');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const out=path.resolve(process.env.H38_COMPLETE_TRAINING_DIR||path.join(root,'artifacts/complete-training-library'));
const officeUrl=process.env.H38_OFFICE_URL||'https://highway38solutions.com/commercial-app/';
const suppliedState=process.env.H38_WORKFLOW_STORAGE_STATE;
const email=String(process.env.H38_WORKFLOW_TEST_EMAIL||'').trim().toLowerCase();
const password=String(process.env.H38_WORKFLOW_TEST_PASSWORD||'');
const staffEmail=String(process.env.H38_WORKFLOW_STAFF_EMAIL||'').trim().toLowerCase();
const staffPassword=String(process.env.H38_WORKFLOW_STAFF_PASSWORD||'');
const generatedState=process.env.H38_WORKFLOW_AUTH_STATE_OUT||path.join(os.tmpdir(),'h38-complete-training-auth.json');
const sourceSha=process.env.GITHUB_SHA||'local';
const runStamp=String(process.env.GITHUB_RUN_ID||Date.now()).slice(-8);
const now=()=>new Date().toISOString();
const clean=value=>String(value==null?'':value).replace(/\s+/g,' ').trim();
const writeJson=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');

fs.mkdirSync(out,{recursive:true});
if(process.env.H38_WORKFLOW_RECORDING_AUTHORIZED!=='true')throw new Error('Controlled TEST-record training authorization is required.');
if(!suppliedState&&!email&&!password)throw new Error('Recorder storage state or the secure TEST login credential pair is required.');
if(!/^https:\/\/highway38solutions\.com\/commercial-app\/?(?:[?#].*)?$/.test(officeUrl)&&process.env.H38_ALLOW_NONPRODUCTION_URL!=='true'){
  throw new Error('Complete training recorder permits the production H38 Office URL only unless reviewed override is enabled.');
}

function tenantUrl(key){const url=new URL(officeUrl);url.searchParams.set('businessKey',key);return url.toString();}
function customerPortalUrl(){return new URL('../customer-portal.html',officeUrl).toString();}
function ffmpegAvailable(){return spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0;}
function convert(source,target){
  const result=spawnSync('ffmpeg',['-y','-i',source,'-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-an',target],{encoding:'utf8'});
  if(result.status!==0)throw new Error(clean((result.stderr||result.stdout||'MP4 conversion failed').slice(-1200)));
}
async function authenticate(browser){
  if(suppliedState&&fs.existsSync(suppliedState))return suppliedState;
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
  try{
    await page.goto(tenantUrl('highway38'),{waitUntil:'domcontentloaded',timeout:45000});
    await page.locator('#h38AuthForm').waitFor({state:'visible',timeout:20000});
    await page.locator('#h38AuthEmail').fill(email);
    await page.locator('#h38AuthPassword').fill(password);
    await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
    await page.waitForFunction(()=>String(window.state?.snapshot?.business?.businessKey||'').toLowerCase()==='highway38'&&!!window.state?.snapshot?.user,null,{timeout:30000});
    await context.storageState({path:generatedState});fs.chmodSync(generatedState,0o600);return generatedState;
  }finally{try{await page.locator('#h38AuthPassword').fill('');}catch(_){}await context.close();}
}
async function addTrainingStyle(page){
  await page.addStyleTag({content:`
    #h38CompleteTrainingCaption{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:min(900px,calc(100vw - 24px));padding:12px 18px;border-radius:12px;background:rgba(5,35,52,.96);color:#fff;font:700 18px/1.3 system-ui;box-shadow:0 8px 28px rgba(0,0,0,.35);text-align:center;pointer-events:none}
    @media(max-width:600px){#h38CompleteTrainingCaption{font-size:14px;bottom:84px;padding:9px 11px;max-width:calc(100vw - 20px)}}
    .h38-training-focus{outline:5px solid #ffbf47!important;outline-offset:4px!important;scroll-margin:110px!important}
    .h38-c360-head p,[href^="mailto:"],[href^="tel:"],input[type="email"],input[type="tel"]{filter:blur(7px)!important;user-select:none!important}
  `});
}
async function caption(page,text,ms=1050){
  await page.evaluate(value=>{let node=document.getElementById('h38CompleteTrainingCaption');if(!node){node=document.createElement('div');node.id='h38CompleteTrainingCaption';document.body.appendChild(node);}node.textContent=value;},text);
  await page.waitForTimeout(ms);
}
async function ready(page,businessKey){
  await page.goto(tenantUrl(businessKey),{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(700);
  if(await page.locator('#h38AuthForm:visible').count()){
    if(!email||!password)throw new Error('Training context requires the secure TEST login pair after session refresh.');
    await page.locator('#h38AuthEmail').fill(email);await page.locator('#h38AuthPassword').fill(password);
    await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
  }
  await page.waitForFunction(key=>String(window.state?.snapshot?.business?.businessKey||'').trim().toLowerCase()===key&&!!window.state?.snapshot?.user&&!!window.state?.bridgeReady,businessKey,{timeout:40000});
  await page.waitForTimeout(1300);
  await addTrainingStyle(page);
}
async function availablePages(page){
  return await page.evaluate(()=>{
    try{if(typeof window.allowedPages==='function')return Array.from(new Set(window.allowedPages()));}catch(_){}
    return Object.keys(window.PAGE_DEFS||{});
  });
}
async function openPage(page,key,required=true){
  const pages=await availablePages(page);
  if(!pages.includes(key)){
    if(required)throw new Error(`Required Office page ${key} is unavailable for this role.`);
    return false;
  }
  const target=page.locator(`[data-page="${key}"]:visible`).first();
  if(await target.count())await target.click();
  else await page.evaluate(pageKey=>{if(typeof window.openPage!=='function')throw new Error(`Navigation unavailable for ${pageKey}.`);window.openPage(pageKey);},key);
  await page.waitForFunction(pageKey=>window.state?.page===pageKey,key,{timeout:10000});
  await page.waitForTimeout(650);
  return true;
}
async function highlightText(page,patternSource){
  return await page.evaluate(source=>{
    document.querySelectorAll('.h38-training-focus').forEach(node=>node.classList.remove('h38-training-focus'));
    const re=new RegExp(source,'i');
    const nodes=Array.from(document.querySelectorAll('#mainContent .row,#mainContent article,#mainContent section,#mainContent [data-h38-customer-card],#mainContent tr,#mainContent .card,#mainContent details'));
    const node=nodes.find(item=>item.getClientRects().length&&re.test(String(item.innerText||'')));
    if(!node)return false;
    node.classList.add('h38-training-focus');node.scrollIntoView({block:'center',behavior:'auto'});return true;
  },patternSource);
}
async function clickSafeAction(page,regex){
  for(const role of ['button','link']){
    const choices=page.getByRole(role,{name:regex});
    const count=await choices.count();
    for(let index=0;index<count;index++){
      const choice=choices.nth(index);
      if(!await choice.isVisible().catch(()=>false))continue;
      const label=clean(await choice.innerText().catch(()=>''));
      await choice.click();await page.waitForTimeout(450);return label;
    }
  }
  return '';
}
async function snapshotSummary(page){
  return await page.evaluate(()=>{
    const snap=window.state?.snapshot||{},user=snap.user||{},business=snap.business||{};
    const count=name=>Array.isArray(snap[name])?snap[name].length:0;
    return{businessKey:String(business.businessKey||''),businessName:String(business.businessName||''),role:String(user.roleId||user.roleName||''),counts:{customers:count('customers'),jobs:count('jobs'),tasks:count('tasks'),quotes:count('quotes'),scheduleEvents:count('scheduleEvents'),expenses:count('expenses'),documents:count('documents'),meetings:count('meetings')}};
  });
}
async function serviceFixture(page,kind){
  return await page.evaluate(kind=>{
    const rows=Array.isArray(window.state?.snapshot?.jobs)?window.state.snapshot.jobs:[];
    const val=(row,...keys)=>keys.map(key=>row?.[key]).find(value=>value!==undefined&&value!==null&&value!=='')||'';
    const re=kind==='snow'?/snow|plow/i:/lawn|mow/i;
    const row=rows.find(item=>/TEST/i.test(JSON.stringify(item))&&re.test(String(val(item,'Service Type','serviceType','Project Title','projectTitle','Description','description'))));
    if(!row)return null;
    return{jobId:String(val(row,'Job ID','jobId')),title:String(val(row,'Project Title','projectTitle')),serviceType:String(val(row,'Service Type','serviceType')),status:String(val(row,'Status','status'))};
  },kind);
}
async function latestTestTask(page){
  return await page.evaluate(()=>{
    const rows=Array.isArray(window.state?.snapshot?.tasks)?window.state.snapshot.tasks:[];
    const row=[...rows].reverse().find(item=>/TEST Assigned Work/i.test(String(item?.['Task Title']||item?.taskTitle||''))&&String(item?.['Assigned User ID']||item?.assignedUserId||''));
    if(!row)return null;
    return{taskId:String(row['Task ID']||row.taskId||''),title:String(row['Task Title']||row.taskTitle||''),assignedUserId:String(row['Assigned User ID']||row.assignedUserId||''),status:String(row.Status||row.status||'')};
  });
}

async function fullOfficeMap(page,result){
  const pages=await availablePages(page);
  const preferred=['today','customers','work','meetings','quotes','schedule','messages','field','money','accounting','payroll','tax','reports','people','inventory','fleet','documents','social','controls','ai','assistant','settings'];
  const ordered=preferred.filter(key=>pages.includes(key));
  await caption(page,'TRAINING LIBRARY: Every available owner Office area is shown from the real deployed runtime.',1500);
  for(const key of ordered){
    await openPage(page,key,true);
    const label=await page.evaluate(k=>String(window.PAGE_DEFS?.[k]?.[1]||k),key);
    await caption(page,`${label}: this is the canonical ${label} workspace.`,520);
    result.steps.push({name:`page-${key}`,status:'PASS'});
  }
}
async function ownerDaily(page,result){
  await caption(page,'DAILY OWNER FLOW: start with what needs attention, then move work, communication, money, and follow-up forward.',1450);
  const sequence=[['today','1. Today — urgent work, assigned tasks, schedule and alerts.'],['work','2. Work & Tasks — jobs and employee assignments.'],['schedule','3. Schedule — dispatch and reschedule work.'],['messages','4. Messages — customer and team communication waiting for review.'],['money','5. Money — invoices, payments, receipts, expenses and AR.'],['reports','6. Reports — profitability and operating review.']];
  for(const [key,text] of sequence){if(await openPage(page,key,false)){await caption(page,text,850);result.steps.push({name:key,status:'PASS'});}}
}
async function scheduleDispatch(page,result){
  const test=await page.evaluate(()=>{
    const jobs=Array.isArray(window.state?.snapshot?.jobs)?window.state.snapshot.jobs:[];
    const row=[...jobs].reverse().find(item=>/TEST/i.test(JSON.stringify(item)));
    return row?{jobId:String(row['Job ID']||row.jobId||''),title:String(row['Project Title']||row.projectTitle||'TEST job')}:null;
  });
  if(!test)throw new Error('No controlled TEST job exists for scheduling/dispatch training.');
  await openPage(page,'work');await highlightText(page,'TEST');await caption(page,'1. Work: choose the TEST job and confirm who owns the next action.',1050);
  await openPage(page,'schedule');await caption(page,'2. Schedule: place or review the job on the calendar, employee, and time window. Scheduling stays internal until the owner chooses an external communication.',1250);
  await openPage(page,'today');await caption(page,'3. Today: dispatched work returns to the operator view with the same job and task records.',1100);
  result.testJob=test;
}
async function meetings(page,result){
  await openPage(page,'meetings');
  await caption(page,'MEETING → CUSTOMER: start from the Meetings workspace and keep customer/job context attached.',1200);
  const opened=await clickSafeAction(page,/^Start Meeting$|Start meeting|New meeting/i);
  if(opened)await caption(page,'Start Meeting opens the real meeting capture. Select only TEST customer/job context, add notes or approved evidence, then finish and organize.',1350);
  else await caption(page,'Use Start Meeting or quick create to capture TEST notes, evidence, and linked customer/job context.',1200);
  await caption(page,'After organizing, reopen the Meeting Report, review decisions/tasks, print if needed, and prepare—not automatically send—follow-up.',1400);
  result.steps.push({name:'meetings-workspace',status:'PASS',startControlVisible:!!opened});
}
async function receiptsExpenses(page,result){
  await openPage(page,'money');
  await caption(page,'RECEIPTS & EXPENSES: every employee receipt should become a native H38 expense record, not a QuickBooks operating dependency.',1300);
  const action=await clickSafeAction(page,/Add expense|New expense|Record expense/i);
  if(action)await caption(page,'Enter vendor, date, amount, category, job/customer context and attach the receipt photo. Save only after the expense is correct.',1350);
  else await caption(page,'Use Add expense / Scan Receipt from Money or quick create. Attach the photo and confirm the native expense before saving.',1250);
  await caption(page,'Saved expenses feed H38 reporting and the tax package. QuickBooks remains optional tax handoff only.',1200);
  result.steps.push({name:'money-expense-workflow',status:'PASS',actionOpened:action||''});
}
async function documents(page,result){
  await openPage(page,'documents');
  await caption(page,'DOCUMENTS & SMART UPLOAD: begin with the real Documents workspace.',1100);
  const action=await clickSafeAction(page,/Smart Upload|Upload document|Upload PDF|Add document|Upload/i);
  if(action)await caption(page,'Choose a TEST photo or PDF, review detected type and proposed customer/job/quote/expense placement, then confirm before filing.',1450);
  else await caption(page,'Smart Upload proposes a document type and linked record. The operator confirms placement before the file becomes part of Customer 360, Job, Quote, Expense, or Documents.',1450);
  await caption(page,'Use the resulting document list to reopen, print/download, or delete through authorized controls—no dead-end file cards.',1200);
  result.steps.push({name:'documents-workspace',status:'PASS',actionOpened:action||''});
}
async function quoteRevision(page,result){
  await openPage(page,'quotes');
  const highlighted=await highlightText(page,'TEST');
  await caption(page,'QUOTE REVISION: open the current TEST quote instead of starting a disconnected copy.',1200);
  await caption(page,'Review customer/property context, measurements, notes, evidence and priced lines; revise the draft, regenerate the customer-ready document, and review before/after proof.',1450);
  await caption(page,'Printing or preparing a controlled email is separate from sending. Customer approval/decline remains an explicit decision path.',1300);
  result.steps.push({name:'quotes-workspace',status:'PASS',testQuoteVisible:highlighted});
}
async function assistantApprovals(page,result){
  const target=(await availablePages(page)).includes('assistant')?'assistant':'ai';
  await openPage(page,target,true);
  await caption(page,'AI ASSISTANT: ask from the open customer, job, quote, meeting, document, snow, or lawn context.',1200);
  await caption(page,'For data-changing requests, H38 shows a preview first. Revise, cancel, or approve; only approved tenant-data actions execute.',1350);
  await caption(page,'Engine/system changes are suggestions only. Proof Log records approved actions, and cross-tenant or permission attacks stay blocked.',1350);
  result.steps.push({name:'assistant-approval-model',status:'PASS',page:target});
}
async function settingsAdmin(page,result){
  const pages=await availablePages(page);
  for(const [key,text] of [['people','PEOPLE: add employees/site managers by exact email, review activation state, and keep Staff permissions bounded.'],['controls','CONTROLS: business safeguards and approval boundaries live here.'],['settings','SETTINGS: business identity, service configuration, users/roles, and operator preferences stay tenant-scoped.']]){
    if(pages.includes(key)){await openPage(page,key);await caption(page,text,1200);result.steps.push({name:key,status:'PASS'});}
  }
}
async function serviceFlow(page,result,kind){
  const fixture=await serviceFixture(page,kind);
  if(!fixture)throw new Error(`No controlled TEST ${kind} service fixture exists in Northern Lakes.`);
  result.fixture=fixture;
  await openPage(page,'today');await highlightText(page,kind==='snow'?'snow|plow|TEST':'lawn|mow|TEST');
  if(kind==='lawn'){
    await caption(page,'LAWN: recurring schedule → assignment → My Day → travel → arrival → start → mow/trim/blow-off → proof → closeout.',1500);
  }else{
    await caption(page,'SNOW: trigger/assignment → travel → arrival → start → truck area → skid-steer area → driveway/lot → material if used → proof → closeout.',1600);
  }
  await openPage(page,'work');await highlightText(page,kind==='snow'?'snow|plow|TEST':'lawn|mow|TEST');
  await caption(page,`The same ${kind} job stays connected to tasks, field proof, Customer 360 activity and service history.`,1100);
  await openPage(page,'money');await caption(page,kind==='snow'?'Prepare per-occurrence or hourly snow billing from the completed service. Do not create a payment during training.':'Prepare the lawn occurrence for invoicing after completion. Do not charge or send automatically.',1250);
  result.steps.push({name:`${kind}-fixture`,status:'PASS',jobId:fixture.jobId});
}
async function assignedWorkHandoff(page,result){
  const task=await latestTestTask(page);
  if(!task)throw new Error('No TEST Task Manager assignment exists. Run Task Manager training before the complete library recorder.');
  result.task=task;
  await openPage(page,'work');await highlightText(page,'TEST Assigned Work');
  await caption(page,'EMPLOYEE HANDOFF: the owner-assigned TEST task is the same canonical task the Staff account receives.',1250);
  await caption(page,'Staff signs into this same Office, sees assigned work only, and may move it through Accepted → On My Way → Arrived → Started → Paused/Waiting/Blocked → Completed.',1550);
  await caption(page,'Clock-in/out, proof, issue reporting, and completion stay on the assigned job. Customer messages, payments, purchasing and scheduling are not automatic.',1450);
  result.steps.push({name:'assigned-task-visible',status:'PASS',taskId:task.taskId,status:task.status});
}
async function accessSurfaces(page,result){
  await page.goto(tenantUrl('highway38'),{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#h38AuthForm').waitFor({state:'visible',timeout:20000});
  await addTrainingStyle(page);
  await caption(page,'ROLE LOGIN: H38 uses one secure Office sign-in with guidance for owner/admin, site manager/foreman, and employee.',1250);
  const employee=page.locator('[data-h38-access-intent="employee"]');if(await employee.count()){await employee.click();await caption(page,'Employee: use the exact email the owner added. Staff receives only assigned operational context.',1100);}
  const site=page.locator('[data-h38-access-intent="site-manager"]');if(await site.count()){await site.click();await caption(page,'Site manager / foreman uses the same Staff security boundary with site-oriented guidance.',1100);}
  const customer=page.locator('.h38-customer-access');
  if(!await customer.count())throw new Error('Customer Portal access link is missing from the signed-out Office gate.');
  await page.goto(customerPortalUrl(),{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#portal-login').waitFor({state:'visible',timeout:20000});await addTrainingStyle(page);
  await caption(page,'Customer Portal is isolated from employee Office access. Customers sign in with the exact invited email or request a secure one-time link.',1400);
  await caption(page,'After sign-in, the portal exposes only that customer’s projects, quotes, invoices, files and review-queue messages.',1250);
  result.steps.push({name:'office-role-login-surface',status:'PASS'});result.steps.push({name:'customer-portal-login-surface',status:'PASS'});
}
async function optionalStaffCompletion(browser,result){
  if(!staffEmail||!staffPassword){
    result.staffAuthenticatedCompletion={status:'EXTERNAL_GATE',detail:'Add H38_WORKFLOW_STAFF_EMAIL and H38_WORKFLOW_STAFF_PASSWORD for a real Staff post-login completion recording.'};
    return;
  }
  const dir=path.join(out,'staff-authenticated');fs.mkdirSync(dir,{recursive:true});
  const context=await browser.newContext({viewport:{width:430,height:860},recordVideo:{dir,size:{width:430,height:860}}});
  const page=await context.newPage();let raw='';
  try{
    await page.goto(tenantUrl('highway38'),{waitUntil:'domcontentloaded',timeout:45000});
    await page.locator('#h38AuthForm').waitFor({state:'visible',timeout:20000});
    const employee=page.locator('[data-h38-access-intent="employee"]');if(await employee.count())await employee.click();
    await page.locator('#h38AuthEmail').fill(staffEmail);await page.locator('#h38AuthPassword').fill(staffPassword);
    await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
    await page.waitForFunction(()=>String(window.state?.snapshot?.user?.roleId||window.state?.snapshot?.user?.roleName||'').toLowerCase()==='staff'&&!!window.state?.bridgeReady,null,{timeout:40000});
    await addTrainingStyle(page);
    await caption(page,'STAFF COMPLETION: signed in with a real permission-limited Staff membership.',1200);
    const workspace=await page.evaluate(async()=>window.H38_EMPLOYEE_WORKSPACE?.refresh?.());
    const task=(workspace?.tasks||[]).find(item=>/TEST Assigned Work/i.test(String(item?.['Task Title']||item?.taskTitle||'')))||workspace?.tasks?.[0];
    if(!task)throw new Error('Authenticated Staff account has no assigned TEST task.');
    const taskId=String(task['Task ID']||task.taskId||'');
    await openPage(page,'work');await highlightText(page,'TEST|Assigned');
    for(const status of ['Accepted','Started','Completed']){
      await page.evaluate(async({taskId,status})=>window.H38_EMPLOYEE_WORKSPACE.updateAssignedTask(taskId,status,`[H38 TEST] Training ${status}`),{taskId,status});
      await page.waitForTimeout(650);await caption(page,`${status}: Staff updates only the assigned task. The change is written through the bounded employee RPC and Proof Log.`,1050);
    }
    result.staffAuthenticatedCompletion={status:'PASS',taskId};
  }finally{
    const video=page.video();await page.close().catch(()=>{});await context.close().catch(()=>{});if(video)raw=await video.path().catch(()=> '');
    if(raw&&fs.existsSync(raw)){
      const target=path.join(dir,'H38-TRAIN-STAFF-COMPLETION-PHONE.webm');fs.renameSync(raw,target);
      if(ffmpegAvailable())convert(target,path.join(dir,'H38-TRAIN-STAFF-COMPLETION-PHONE.mp4'));
    }
  }
}

const scenarios=[
  {id:'H38-TRAIN-FULL-OFFICE-MAP-DESKTOP',tenant:'highway38',kind:'desktop',run:fullOfficeMap},
  {id:'H38-TRAIN-OWNER-DAILY-DESKTOP',tenant:'highway38',kind:'desktop',run:ownerDaily},
  {id:'H38-TRAIN-OWNER-DAILY-PHONE',tenant:'highway38',kind:'mobile',run:ownerDaily},
  {id:'H38-TRAIN-SCHEDULE-DISPATCH-DESKTOP',tenant:'highway38',kind:'desktop',run:scheduleDispatch},
  {id:'H38-TRAIN-SCHEDULE-DISPATCH-PHONE',tenant:'highway38',kind:'mobile',run:scheduleDispatch},
  {id:'H38-TRAIN-MEETINGS-DESKTOP',tenant:'highway38',kind:'desktop',run:meetings},
  {id:'H38-TRAIN-MEETINGS-PHONE',tenant:'highway38',kind:'mobile',run:meetings},
  {id:'H38-TRAIN-RECEIPTS-EXPENSES-PHONE',tenant:'highway38',kind:'mobile',run:receiptsExpenses},
  {id:'H38-TRAIN-DOCUMENTS-SMART-UPLOAD-DESKTOP',tenant:'highway38',kind:'desktop',run:documents},
  {id:'H38-TRAIN-DOCUMENTS-SMART-UPLOAD-PHONE',tenant:'highway38',kind:'mobile',run:documents},
  {id:'H38-TRAIN-QUOTE-REVISION-DESKTOP',tenant:'highway38',kind:'desktop',run:quoteRevision},
  {id:'H38-TRAIN-AI-APPROVAL-DESKTOP',tenant:'highway38',kind:'desktop',run:assistantApprovals},
  {id:'H38-TRAIN-AI-APPROVAL-PHONE',tenant:'highway38',kind:'mobile',run:assistantApprovals},
  {id:'H38-TRAIN-SETTINGS-ADMIN-DESKTOP',tenant:'highway38',kind:'desktop',run:settingsAdmin},
  {id:'H38-TRAIN-LAWN-SERVICE-PHONE',tenant:'northern-lakes',kind:'mobile',run:(page,result)=>serviceFlow(page,result,'lawn')},
  {id:'H38-TRAIN-SNOW-SERVICE-PHONE',tenant:'northern-lakes',kind:'mobile',run:(page,result)=>serviceFlow(page,result,'snow')},
  {id:'H38-TRAIN-EMPLOYEE-HANDOFF-PHONE',tenant:'highway38',kind:'mobile',run:assignedWorkHandoff}
];

async function recordScenario(browser,statePath,scenario){
  const mobile=scenario.kind==='mobile';
  const dir=path.join(out,'videos');fs.mkdirSync(dir,{recursive:true});
  const context=await browser.newContext({storageState:statePath,viewport:mobile?{width:430,height:860}:{width:1420,height:900},recordVideo:{dir,size:mobile?{width:430,height:860}:{width:1420,height:900}}});
  const page=await context.newPage();
  const result={id:scenario.id,tenant:scenario.tenant,viewport:mobile?{width:430,height:860}:{width:1420,height:900},status:'HOLD',steps:[],externalActionsOccurred:false,startedAt:now()};
  let raw='';
  try{
    await ready(page,scenario.tenant);result.identity=await snapshotSummary(page);await scenario.run(page,result);result.status='PASS';result.completedAt=now();
  }catch(error){result.error=clean(error?.message||error);result.completedAt=now();}
  finally{
    const video=page.video();await page.close().catch(()=>{});await context.close().catch(()=>{});if(video)raw=await video.path().catch(()=> '');
    if(raw&&fs.existsSync(raw)){
      const webm=path.join(dir,`${scenario.id}-${result.status.toLowerCase()}.webm`);fs.renameSync(raw,webm);result.rawVideo=path.relative(out,webm);
      if(ffmpegAvailable()){
        const mp4=path.join(dir,`${scenario.id}-${result.status.toLowerCase()}.mp4`);try{convert(webm,mp4);result.trainingVideo=path.relative(out,mp4);}catch(error){result.mp4Error=clean(error.message);}
      }
    }
  }
  writeJson(`${scenario.id}.json`,result);
  return result;
}
async function recordAccess(browser){
  const dir=path.join(out,'videos');fs.mkdirSync(dir,{recursive:true});
  const context=await browser.newContext({viewport:{width:430,height:860},recordVideo:{dir,size:{width:430,height:860}}});
  const page=await context.newPage();
  const result={id:'H38-TRAIN-ROLE-LOGIN-PHONE',tenant:'public-access',viewport:{width:430,height:860},status:'HOLD',steps:[],externalActionsOccurred:false,startedAt:now()};
  let raw='';
  try{await accessSurfaces(page,result);result.status='PASS';result.completedAt=now();}
  catch(error){result.error=clean(error?.message||error);result.completedAt=now();}
  finally{
    const video=page.video();await page.close().catch(()=>{});await context.close().catch(()=>{});if(video)raw=await video.path().catch(()=> '');
    if(raw&&fs.existsSync(raw)){
      const webm=path.join(dir,`${result.id}-${result.status.toLowerCase()}.webm`);fs.renameSync(raw,webm);result.rawVideo=path.relative(out,webm);
      if(ffmpegAvailable()){
        const mp4=path.join(dir,`${result.id}-${result.status.toLowerCase()}.mp4`);try{convert(webm,mp4);result.trainingVideo=path.relative(out,mp4);}catch(error){result.mp4Error=clean(error.message);}
      }
    }
  }
  writeJson(`${result.id}.json`,result);return result;
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  const manifest={kind:'h38-complete-training-library',version:'20260924-complete-training-1',sourceSha,runStamp,startedAt:now(),status:'HOLD',videos:[],externalActionsOccurred:false,existingEvidence:{fullLifecycle:true,taskManagerAssignment:true,nativeAccountingTax:true,assistantActionEvidence:true,crossTenantRuntime:true},credentialGates:[]};
  try{
    const statePath=await authenticate(browser);
    for(const scenario of scenarios){manifest.videos.push(await recordScenario(browser,statePath,scenario));}
    manifest.videos.push(await recordAccess(browser));
    await optionalStaffCompletion(browser,manifest);
    if(manifest.staffAuthenticatedCompletion?.status!=='PASS')manifest.credentialGates.push('Authenticated Staff post-login completion requires H38_WORKFLOW_STAFF_EMAIL + H38_WORKFLOW_STAFF_PASSWORD. The employee/customer login surfaces and owner assignment handoff are still recorded.');
    const failures=manifest.videos.filter(item=>item.status!=='PASS');
    manifest.status=failures.length?'HOLD':'PASS';
    manifest.completedAt=now();
    writeJson('manifest.json',manifest);
    writeJson('results.json',{status:manifest.status,passed:manifest.videos.filter(item=>item.status==='PASS').map(item=>item.id),failed:failures.map(item=>({id:item.id,error:item.error||'HOLD'})),credentialGates:manifest.credentialGates});
    if(failures.length){console.error(JSON.stringify({status:'HOLD',failures:failures.map(item=>({id:item.id,error:item.error}))},null,2));process.exitCode=1;}
    else console.log(JSON.stringify({status:'PASS',videos:manifest.videos.length,credentialGates:manifest.credentialGates},null,2));
  }finally{await browser.close().catch(()=>{});}
})().catch(error=>{writeJson('fatal.json',{status:'HOLD',error:clean(error?.message||error),capturedAt:now(),sourceSha});console.error(error);process.exitCode=1;});
