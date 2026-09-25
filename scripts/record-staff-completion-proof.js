'use strict';
/*
  Strict authenticated Staff completion proof for the H38 training library.
  Uses the canonical signed-in Office runtime and bounded employee RPCs directly.
  Controlled TEST task data only; no customer message, purchase, payment, or schedule action occurs.
*/
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const out=path.resolve(process.env.H38_COMPLETE_TRAINING_DIR||path.join(root,'artifacts/complete-training-library'));
const dir=path.join(out,'staff-authenticated');
const resultPath=path.join(dir,'staff-completion-result.json');
const officeUrl=process.env.H38_OFFICE_URL||'https://highway38solutions.com/commercial-app/';
const staffEmail=String(process.env.H38_WORKFLOW_STAFF_EMAIL||'').trim().toLowerCase();
const staffPassword=String(process.env.H38_WORKFLOW_STAFF_PASSWORD||'');
const runStamp=String(process.env.GITHUB_RUN_ID||Date.now()).slice(-8);
const clean=value=>String(value==null?'':value).replace(/\s+/g,' ').trim();
const now=()=>new Date().toISOString();

fs.mkdirSync(dir,{recursive:true});
if(process.env.H38_WORKFLOW_RECORDING_AUTHORIZED!=='true')throw new Error('Controlled TEST-record Staff proof authorization is required.');
if(!staffEmail||!staffPassword)throw new Error('Dedicated Staff TEST credentials are required.');
if(!/^https:\/\/highway38solutions\.com\/commercial-app\/?(?:[?#].*)?$/.test(officeUrl)&&process.env.H38_ALLOW_NONPRODUCTION_URL!=='true'){
  throw new Error('Staff proof permits the production H38 Office URL only unless reviewed override is enabled.');
}

function tenantUrl(){const url=new URL(officeUrl);url.searchParams.set('businessKey','highway38');return url.toString();}
function ffmpegAvailable(){return spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0;}
function convert(source,target){
  const result=spawnSync('ffmpeg',['-y','-i',source,'-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-an',target],{encoding:'utf8'});
  if(result.status!==0)throw new Error(clean((result.stderr||result.stdout||'MP4 conversion failed').slice(-1200)));
}
function writeResult(value){fs.writeFileSync(resultPath,JSON.stringify(value,null,2)+'\n');}
async function caption(page,text,ms=900){
  await page.evaluate(value=>{
    let node=document.getElementById('h38StrictStaffProofCaption');
    if(!node){
      node=document.createElement('div');node.id='h38StrictStaffProofCaption';document.body.appendChild(node);
      Object.assign(node.style,{position:'fixed',left:'50%',bottom:'84px',transform:'translateX(-50%)',zIndex:'2147483647',maxWidth:'calc(100vw - 20px)',padding:'10px 12px',borderRadius:'12px',background:'rgba(5,35,52,.96)',color:'#fff',font:'700 14px/1.3 system-ui',textAlign:'center',pointerEvents:'none'});
    }
    node.textContent=value;
  },text);
  await page.waitForTimeout(ms);
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:430,height:860},recordVideo:{dir,size:{width:430,height:860}}});
  const page=await context.newPage();
  let raw='';
  const result={status:'HOLD',kind:'authenticated-staff-completion',startedAt:now(),externalActionsOccurred:false,runStamp};
  try{
    await page.goto(tenantUrl(),{waitUntil:'domcontentloaded',timeout:45000});
    await page.locator('#h38AuthForm').waitFor({state:'visible',timeout:20000});
    const employee=page.locator('[data-h38-access-intent="employee"]');if(await employee.count())await employee.click();
    await page.locator('#h38AuthEmail').fill(staffEmail);
    await page.locator('#h38AuthPassword').fill(staffPassword);
    await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
    await page.waitForFunction(()=>String(window.state?.snapshot?.user?.roleId||window.state?.snapshot?.user?.roleName||'').toLowerCase()==='staff'&&!!window.state?.bridgeReady,null,{timeout:40000});
    await caption(page,'STAFF COMPLETION: signed in with the real permission-limited Staff membership.',1200);

    const staff=await page.evaluate(async(runStamp)=>{
      const state=window.state||{},snapshot=state.snapshot||{},business=snapshot.business||{};
      const businessId=String(state.businessId||business.businessId||business.id||business['Business ID']||'');
      if(!businessId)throw new Error('Authenticated Staff runtime did not expose the H38 business ID.');
      const db=window.H38_SUPABASE_SHARED_CLIENT?.ensure?.();
      if(!db?.rpc)throw new Error('Authenticated Staff Supabase client is unavailable.');
      const {data,error}=await db.rpc('business_office_employee_workspace',{p_business_id:businessId});
      if(error)throw error;
      const tasks=Array.isArray(data?.tasks)?data.tasks:[];
      const title=row=>String(row?.['Task Title']||row?.taskTitle||'');
      const status=row=>String(row?.Status||row?.status||'');
      const updated=row=>Date.parse(String(row?.['Updated Time']||row?.updatedTime||row?.['Created Time']||row?.createdTime||''))||0;
      const exact=`TEST Assigned Work ${runStamp}`;
      const candidates=tasks.filter(row=>title(row).includes(exact)&&status(row)!=='Completed').sort((a,b)=>updated(b)-updated(a));
      const fallback=tasks.filter(row=>/TEST Assigned Work/i.test(title(row))&&status(row)!=='Completed').sort((a,b)=>updated(b)-updated(a));
      const task=candidates[0]||fallback[0]||null;
      if(!task)throw new Error('Authenticated Staff employee RPC returned no open controlled TEST assignment.');
      return{businessId,task,taskCount:tasks.length};
    },runStamp);

    const taskId=String(staff.task?.['Task ID']||staff.task?.taskId||'');
    const taskTitle=String(staff.task?.['Task Title']||staff.task?.taskTitle||'');
    if(!taskId)throw new Error('Authenticated Staff assignment did not expose a Task ID.');
    result.businessId=staff.businessId;result.taskId=taskId;result.taskTitle=taskTitle;result.taskCount=staff.taskCount;

    const workButton=page.locator('[data-page="work"]:visible').first();
    if(await workButton.count())await workButton.click();
    else await page.evaluate(()=>{if(typeof window.openPage==='function')window.openPage('work');});
    await page.waitForFunction(()=>window.state?.page==='work',null,{timeout:10000}).catch(()=>{});
    await caption(page,`Assigned TEST work loaded for Staff: ${taskTitle}`,1100);

    result.transitions=[];
    for(const status of ['Accepted','Started','Completed']){
      const updated=await page.evaluate(async({businessId,taskId,status})=>{
        const db=window.H38_SUPABASE_SHARED_CLIENT?.ensure?.();
        if(!db?.rpc)throw new Error('Authenticated Staff Supabase client is unavailable.');
        const {data,error}=await db.rpc('business_office_employee_update_task',{
          p_business_id:businessId,
          p_task_id:taskId,
          p_status:status,
          p_note:`[H38 TEST] Training ${status}`
        });
        if(error)throw error;
        return data;
      },{businessId:staff.businessId,taskId,status});
      const persisted=String(updated?.Status||updated?.status||'');
      if(persisted!==status)throw new Error(`Staff task transition did not persist ${status}.`);
      result.transitions.push(status);
      await caption(page,`${status}: bounded Staff RPC persisted the TEST task update.`,1050);
    }

    const verification=await page.evaluate(async({businessId,taskId})=>{
      const db=window.H38_SUPABASE_SHARED_CLIENT?.ensure?.();
      const {data,error}=await db.rpc('business_office_employee_workspace',{p_business_id:businessId});
      if(error)throw error;
      const task=(data?.tasks||[]).find(row=>String(row?.['Task ID']||row?.taskId||'')===taskId)||null;
      return task?String(task.Status||task.status||''):'';
    },{businessId:staff.businessId,taskId});
    if(verification!=='Completed')throw new Error('Staff completion verification did not return Completed.');

    result.status='PASS';result.completedAt=now();result.detail='Authenticated Staff completed a controlled TEST assignment through the canonical bounded employee RPCs.';
    writeResult(result);
    console.log(JSON.stringify(result,null,2));
  }catch(error){
    result.status='HOLD';result.completedAt=now();result.error=clean(error?.message||error);writeResult(result);console.error(error);process.exitCode=1;
  }finally{
    try{await page.locator('#h38AuthPassword').fill('');}catch(_){}
    const video=page.video();await page.close().catch(()=>{});await context.close().catch(()=>{});if(video)raw=await video.path().catch(()=> '');
    if(raw&&fs.existsSync(raw)){
      const target=path.join(dir,'H38-TRAIN-STAFF-COMPLETION-PHONE.webm');
      if(fs.existsSync(target))fs.rmSync(target,{force:true});
      fs.renameSync(raw,target);
      if(ffmpegAvailable()){
        const mp4=path.join(dir,'H38-TRAIN-STAFF-COMPLETION-PHONE.mp4');
        try{convert(target,mp4);}catch(error){console.error(`Staff proof MP4 conversion warning: ${clean(error.message)}`);}
      }
    }
    await browser.close().catch(()=>{});
  }
})().catch(error=>{writeResult({status:'HOLD',kind:'authenticated-staff-completion',error:clean(error?.message||error),completedAt:now(),externalActionsOccurred:false,runStamp});console.error(error);process.exitCode=1;});
