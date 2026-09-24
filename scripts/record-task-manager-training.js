'use strict';
/* Real deployed Office Task Manager training recorder. Controlled TEST records only; no synthetic employee UI. */
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const out=path.resolve(process.env.H38_TASK_TRAINING_DIR||path.join(root,'artifacts/task-manager-training'));
const officeUrl=process.env.H38_OFFICE_URL||'https://highway38solutions.com/commercial-app/';
const suppliedState=process.env.H38_WORKFLOW_STORAGE_STATE;
const email=String(process.env.H38_WORKFLOW_TEST_EMAIL||'').trim().toLowerCase();
const password=String(process.env.H38_WORKFLOW_TEST_PASSWORD||'');
const generatedState=process.env.H38_WORKFLOW_AUTH_STATE_OUT||path.join(require('os').tmpdir(),'h38-task-training-auth.json');
const stamp=String(process.env.GITHUB_RUN_ID||Date.now()).slice(-8);
const now=()=>new Date().toISOString();
const clean=value=>String(value==null?'':value).replace(/\s+/g,' ').trim();
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
const fail=(code,detail)=>{fs.mkdirSync(out,{recursive:true});write('manifest.json',{status:'HOLD',code,detail,capturedAt:now()});throw Error(`${code}: ${detail}`)};

if(process.env.H38_WORKFLOW_RECORDING_AUTHORIZED!=='true')fail('AUTHORIZATION_REQUIRED','Authorize controlled TEST-record Task Manager training before recording.');
if(!suppliedState&&!email&&!password)fail('AUTH_MATERIAL_REQUIRED','Supply recorder storage state or the TEST login credential pair.');

function tenantUrl(){const url=new URL(officeUrl);url.searchParams.set('businessKey','highway38');return url.toString()}
function ffmpegAvailable(){return spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0}
function convert(source,target){
  const result=spawnSync('ffmpeg',['-y','-i',source,'-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-an',target],{encoding:'utf8'});
  if(result.status!==0)throw Error(clean((result.stderr||result.stdout||'MP4 conversion failed').slice(-1200)));
}
async function authState(browser){
  if(suppliedState&&fs.existsSync(suppliedState))return suppliedState;
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
  try{
    await page.goto(tenantUrl(),{waitUntil:'domcontentloaded',timeout:45000});
    await page.locator('#h38AuthForm').waitFor({timeout:20000});
    await page.locator('#h38AuthEmail').fill(email);await page.locator('#h38AuthPassword').fill(password);
    await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
    await page.waitForFunction(()=>String(window.state?.snapshot?.business?.businessKey||'').toLowerCase()==='highway38'&&!!window.state?.snapshot?.user,null,{timeout:30000});
    await context.storageState({path:generatedState});fs.chmodSync(generatedState,0o600);return generatedState;
  }finally{try{await page.locator('#h38AuthPassword').fill('')}catch(_){}await context.close()}
}
async function ready(page){
  await page.goto(tenantUrl(),{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(700);
  if(await page.locator('#h38AuthForm:visible').count()){
    if(!email||!password)throw Error('The refreshed Task Manager training context requires the secure TEST login credential pair.');
    await page.locator('#h38AuthEmail').fill(email);await page.locator('#h38AuthPassword').fill(password);
    await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
  }
  await page.waitForFunction(()=>String(window.state?.snapshot?.business?.businessKey||'').toLowerCase()==='highway38'&&!!window.state?.snapshot?.user&&!!window.state?.bridgeReady,null,{timeout:40000});
  await page.waitForTimeout(1400);
  await page.addStyleTag({content:`
    #h38TrainingCaption{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:min(820px,calc(100vw - 24px));padding:12px 18px;border-radius:12px;background:rgba(5,35,52,.96);color:#fff;font:700 18px/1.3 system-ui;box-shadow:0 8px 28px rgba(0,0,0,.35);text-align:center;pointer-events:none}
    @media(max-width:600px){#h38TrainingCaption{font-size:14px;bottom:84px;padding:9px 11px;max-width:calc(100vw - 20px)}}
    input:focus,textarea:focus,select:focus,button:focus{outline:4px solid #ffbf47!important;outline-offset:3px!important}
  `});
}
async function caption(page,text,ms=1300){
  await page.evaluate(value=>{let node=document.getElementById('h38TrainingCaption');if(!node){node=document.createElement('div');node.id='h38TrainingCaption';document.body.appendChild(node)}node.textContent=value},text);
  await page.waitForTimeout(ms);
}
async function openPage(page,key){
  const target=page.locator(`[data-page="${key}"]:visible`).first();
  if(await target.count())await target.click();else await page.evaluate(pageKey=>{if(typeof window.openPage!=='function')throw Error(`Navigation unavailable for ${pageKey}.`);window.openPage(pageKey)},key);
  await page.waitForFunction(pageKey=>window.state?.page===pageKey,key,{timeout:10000});
  await page.waitForTimeout(700);
}
async function openCreation(page,formId,label){
  const form=page.locator(`#${formId}`).first();
  for(let attempt=0;attempt<4;attempt++){
    if(await form.count()&&await form.isVisible().catch(()=>false))return form;
    // Use the real canonical page renderer to reapply flow-tightening after an authoritative
    // snapshot paint. Do not synthesize a form or mutate Office data from the recorder.
    await page.evaluate(()=>{
      if(window.state?.page==='work'&&typeof window.renderWork==='function')window.renderWork();
      else if(window.state?.page==='money'&&typeof window.renderMoney==='function')window.renderMoney();
    });
    await page.waitForTimeout(250);
    if(await form.count()&&await form.isVisible().catch(()=>false))return form;
    const clicked=await page.evaluate(({formId,label})=>{
      const chooser=document.querySelector(`[data-h38-create="${formId}"]`);
      if(chooser){chooser.click();return true;}
      const button=Array.from(document.querySelectorAll('button')).find(node=>String(node.textContent||'').trim()===label);
      if(button){button.click();return true;}
      return false;
    },{formId,label});
    if(clicked){
      try{await form.waitFor({state:'visible',timeout:3000});return form;}catch(_){}
    }
    await page.waitForTimeout(250*(attempt+1));
  }
  throw Error(`Canonical ${label} creation card did not open.`);
}
async function sync(page){
  let last={pending:-1,badge:''};
  for(let attempt=1;attempt<=4;attempt++){
    last=await page.evaluate(async()=>{
      if(typeof window.sync==='function')await window.sync(false);
      if(typeof window.refreshSnapshot==='function')await window.refreshSnapshot();
      const all=await window.H38DB?.all?.('operations')||[],businessId=String(window.state?.businessId||'');
      const waiting=all.filter(operation=>{
        const same=!operation?.businessId||String(operation.businessId)===businessId;
        const status=String(operation?.syncStatus||operation?.status||'').toUpperCase();
        return same&&!['SYNCED','COMPLETE','COMPLETED'].includes(status);
      });
      return{pending:waiting.length,badge:String(document.getElementById('syncBadge')?.textContent||''),badgeBad:document.getElementById('syncBadge')?.classList.contains('bad')===true};
    });
    if(last.pending===0&&!last.badgeBad){await page.waitForTimeout(800);return;}
    await page.waitForTimeout(1000+attempt*300);
  }
  throw Error(`Task Manager sync did not settle. Pending=${last.pending}; badge=${last.badge}`);
}
async function trainingIdentity(page){
  return await page.evaluate(()=>{
    const users=Array.isArray(window.state?.snapshot?.users)?window.state.snapshot.users:[];
    const current=window.state?.snapshot?.user||{};
    const currentId=String(current.userId||current.id||'');
    const active=users.filter(user=>String(user?.Status||user?.status||'').toLowerCase()==='active');
    const staff=active.find(user=>String(user?.['Role ID']||user?.roleId||user?.role||'').toLowerCase()==='staff'&&String(user?.['User ID']||user?.userId||'')!==currentId);
    if(!staff)return null;
    return{
      userId:String(staff['User ID']||staff.userId||''),
      name:String(staff['Display Name']||staff.displayName||staff.Email||staff.email||'Staff employee'),
      role:String(staff['Role ID']||staff.roleId||staff.role||'staff')
    };
  });
}
async function recordTaskAssignment(page,kind,result){
  const mobile=kind==='mobile';
  await caption(page,'TRAINING: Task Manager assigns internal work. No customer message, purchase, payment, or outside action occurs.',1900);
  const employee=await trainingIdentity(page);
  if(!employee?.userId)throw Error('No active Staff employee is available in the TEST tenant. The recorder will not fake an employee assignment.');
  result.employee=employee;
  await openPage(page,'work');
  await caption(page,'1. Open Jobs / Work. Task Manager uses the same H38 Office records as the rest of the job.');

  const jobTitle=`TEST Task Training Job ${stamp}-${mobile?'PHONE':'DESKTOP'}`;
  const jobForm=await openCreation(page,'jobForm','New job');
  await jobForm.locator('[name="projectTitle"]').fill(jobTitle);
  await jobForm.locator('[name="status"]').selectOption({label:'Scheduled'});
  await caption(page,'2. Create or choose the job that needs employee work.');
  await jobForm.getByRole('button',{name:'Save job',exact:true}).click();
  await page.waitForFunction(title=>(window.state?.snapshot?.jobs||[]).some(row=>String(row?.['Project Title']||'')===title),jobTitle,{timeout:15000});
  const jobId=await page.evaluate(title=>String((window.state.snapshot.jobs||[]).find(row=>String(row?.['Project Title']||'')===title)?.['Job ID']||''),jobTitle);
  if(!jobId)throw Error('TEST job did not expose a canonical Job ID.');
  result.job={jobId,jobTitle};

  const taskTitle=`TEST Assigned Work ${stamp}-${mobile?'PHONE':'DESKTOP'}`;
  const taskForm=await openCreation(page,'taskForm','Assign task');
  await taskForm.locator('[name="jobId"]').selectOption(jobId);
  await taskForm.locator('[name="taskTitle"]').fill(taskTitle);
  const assigned=taskForm.locator('[name="assignedUserId"]');
  if(!await assigned.locator(`option[value="${employee.userId.replace(/"/g,'\\"')}"]`).count())throw Error(`Active Staff employee ${employee.name} is not available in the Task Manager assignment list.`);
  await assigned.selectOption(employee.userId);
  const due=new Date(Date.now()+24*60*60*1000);due.setMinutes(0,0,0);
  const dueLocal=new Date(due.getTime()-due.getTimezoneOffset()*60000).toISOString().slice(0,16);
  await taskForm.locator('[name="dueTime"]').fill(dueLocal);
  await caption(page,`3. Choose ${employee.name}, enter the work, set the due time, then save the task.`,1700);
  await taskForm.getByRole('button',{name:'Save task',exact:true}).click();
  await page.waitForFunction(([title,userId])=>(window.state?.snapshot?.tasks||[]).some(row=>String(row?.['Task Title']||'')===title&&String(row?.['Assigned User ID']||'')===userId),[taskTitle,employee.userId],{timeout:15000});
  const task=await page.evaluate(title=>{
    const row=(window.state.snapshot.tasks||[]).find(item=>String(item?.['Task Title']||'')===title)||{};
    return{taskId:String(row['Task ID']||''),status:String(row.Status||''),assignedUserId:String(row['Assigned User ID']||''),dueTime:String(row['Due Time']||'')};
  },taskTitle);
  if(!task.taskId||task.assignedUserId!==employee.userId||task.status!=='Open')throw Error('Saved task did not retain the employee assignment and Open status.');
  result.task={...task,taskTitle};
  await sync(page);

  await openPage(page,'work');
  const row=page.locator('.row').filter({hasText:taskTitle}).first();
  await row.waitFor({state:'visible',timeout:15000});
  const rowText=clean(await row.innerText());
  if(!rowText.includes(employee.name))throw Error('Task Manager list did not visibly confirm the assigned employee.');
  await row.scrollIntoViewIfNeeded();
  await caption(page,`4. Confirm the task appears in Task Manager assigned to ${employee.name}.`,1700);
  await caption(page,'The employee signs into the same H38 Office and can update only assigned work through the bounded Staff workflow: Accepted, Started, Waiting/Blocked, or Completed.',2200);
  result.steps.push({name:'active-staff-selected',status:'PASS',employeeId:employee.userId});
  result.steps.push({name:'job-created',status:'PASS',jobId});
  result.steps.push({name:'task-assigned',status:'PASS',taskId:task.taskId,assignedUserId:employee.userId,status:task.status});
  result.steps.push({name:'owner-confirmed-assignment',status:'PASS'});
}
async function recordOne(browser,statePath,kind){
  const mobile=kind==='mobile';
  const context=await browser.newContext({storageState:statePath,viewport:mobile?{width:430,height:860}:{width:1420,height:900},recordVideo:{dir:out,size:mobile?{width:430,height:860}:{width:1420,height:900}}});
  const page=await context.newPage();
  const result={kind,status:'HOLD',steps:[],startedAt:now(),externalActionsOccurred:false};
  let videoPath='';
  try{await ready(page);await recordTaskAssignment(page,kind,result);result.status='PASS';result.completedAt=now();}
  catch(error){result.status='HOLD';result.error=clean(error?.message||error);throw error;}
  finally{
    const video=page.video();
    await page.close().catch(()=>{});await context.close().catch(()=>{});
    if(video)videoPath=await video.path().catch(()=> '');
    write(`task-manager-${kind}.json`,result);
  }
  if(!videoPath||!fs.existsSync(videoPath))throw Error(`${kind} Task Manager video was not produced.`);
  const webm=path.join(out,`task-manager-${kind}.webm`);fs.renameSync(videoPath,webm);
  if(ffmpegAvailable())convert(webm,path.join(out,`task-manager-${kind}.mp4`));
  return result;
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const manifest={status:'HOLD',kind:'task-manager-employee-assignment-training',capturedAt:now(),officeUrl,externalActionsOccurred:false,results:[]};
  try{
    const statePath=await authState(browser);
    manifest.results.push(await recordOne(browser,statePath,'desktop'));
    manifest.results.push(await recordOne(browser,statePath,'mobile'));
    manifest.status=manifest.results.every(result=>result.status==='PASS')?'PASS':'HOLD';
    if(manifest.status!=='PASS')throw Error('Task Manager training did not pass on both desktop and phone.');
  }catch(error){manifest.status='HOLD';manifest.error=clean(error?.message||error);throw error;}
  finally{write('manifest.json',manifest);await browser.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});