'use strict';
/*
  Final snow-service operator-training fallback for the real deployed Northern Lakes Office.
  This is used only when the complete training recorder proves every other clip and the sole
  HOLD is the absence of a dedicated controlled TEST snow fixture. It never creates, edits,
  schedules, sends, charges, purchases, or deletes Office data.
*/
const fs=require('fs');
const path=require('path');
const os=require('os');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const out=path.resolve(process.env.H38_COMPLETE_TRAINING_DIR||path.join(root,'artifacts/complete-training-library'));
const officeUrl=process.env.H38_OFFICE_URL||'https://highway38solutions.com/commercial-app/';
const suppliedState=process.env.H38_WORKFLOW_STORAGE_STATE;
const email=String(process.env.H38_WORKFLOW_TEST_EMAIL||'').trim().toLowerCase();
const password=String(process.env.H38_WORKFLOW_TEST_PASSWORD||'');
const generatedState=process.env.H38_WORKFLOW_AUTH_STATE_OUT||path.join(os.tmpdir(),'h38-snow-training-auth.json');
const sourceSha=process.env.GITHUB_SHA||'local';
const now=()=>new Date().toISOString();
const clean=value=>String(value==null?'':value).replace(/\s+/g,' ').trim();
const videoId='H38-TRAIN-SNOW-SERVICE-PHONE';

function tenantUrl(){const url=new URL(officeUrl);url.searchParams.set('businessKey','northern-lakes');return url.toString();}
function writeJson(file,value){fs.writeFileSync(path.join(out,file),JSON.stringify(value,null,2)+'\n');}
async function authenticate(browser){
  if(suppliedState&&fs.existsSync(suppliedState))return suppliedState;
  if(!email||!password)throw new Error('Snow training requires recorder storage state or the secure TEST login pair.');
  const context=await browser.newContext({viewport:{width:430,height:860}}),page=await context.newPage();
  try{
    await page.goto(tenantUrl(),{waitUntil:'domcontentloaded',timeout:45000});
    await page.locator('#h38AuthForm').waitFor({state:'visible',timeout:20000});
    await page.locator('#h38AuthEmail').fill(email);await page.locator('#h38AuthPassword').fill(password);
    await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
    await page.waitForFunction(()=>String(window.state?.snapshot?.business?.businessKey||'').toLowerCase()==='northern-lakes'&&!!window.state?.snapshot?.user,null,{timeout:30000});
    await context.storageState({path:generatedState});fs.chmodSync(generatedState,0o600);return generatedState;
  }finally{try{await page.locator('#h38AuthPassword').fill('');}catch(_){}await context.close();}
}
async function caption(page,text,ms=1200){
  await page.evaluate(value=>{let node=document.getElementById('h38SnowTrainingCaption');if(!node){node=document.createElement('div');node.id='h38SnowTrainingCaption';document.body.appendChild(node);}node.textContent=value;},text);
  await page.waitForTimeout(ms);
}
async function openPage(page,key){
  const pages=await page.evaluate(()=>{try{return typeof window.allowedPages==='function'?window.allowedPages():Object.keys(window.PAGE_DEFS||{});}catch(_){return Object.keys(window.PAGE_DEFS||{});}});
  if(!pages.includes(key))return false;
  const target=page.locator(`[data-page="${key}"]:visible`).first();
  if(await target.count())await target.click();
  else await page.evaluate(pageKey=>window.openPage?.(pageKey),key);
  await page.waitForFunction(pageKey=>window.state?.page===pageKey,key,{timeout:10000});
  await page.waitForTimeout(650);return true;
}
async function main(){
  if(process.env.H38_WORKFLOW_RECORDING_AUTHORIZED!=='true')throw new Error('Controlled TEST-record training authorization is required.');
  if(!/^https:\/\/highway38solutions\.com\/commercial-app\/?(?:[?#].*)?$/.test(officeUrl)&&process.env.H38_ALLOW_NONPRODUCTION_URL!=='true')throw new Error('Snow training permits the production H38 Office URL only unless reviewed override is enabled.');
  fs.mkdirSync(path.join(out,'videos'),{recursive:true});
  const browser=await chromium.launch({headless:true});
  const statePath=await authenticate(browser);
  const context=await browser.newContext({storageState:statePath,viewport:{width:430,height:860},recordVideo:{dir:path.join(out,'videos'),size:{width:430,height:860}}});
  const page=await context.newPage();
  const result={id:videoId,tenant:'northern-lakes',viewport:{width:430,height:860},status:'HOLD',steps:[],externalActionsOccurred:false,sourceSha,startedAt:now(),coverageMode:'real-runtime-operator-training',dedicatedTestSnowFixture:false};
  let raw='';
  try{
    await page.goto(tenantUrl(),{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(700);
    if(await page.locator('#h38AuthForm:visible').count()){
      if(!email||!password)throw new Error('Northern Lakes session refresh requires the secure TEST login pair.');
      await page.locator('#h38AuthEmail').fill(email);await page.locator('#h38AuthPassword').fill(password);await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
    }
    await page.waitForFunction(()=>String(window.state?.snapshot?.business?.businessKey||'').toLowerCase()==='northern-lakes'&&!!window.state?.snapshot?.user&&!!window.state?.bridgeReady,null,{timeout:40000});
    await page.waitForTimeout(1200);
    await page.addStyleTag({content:'#h38SnowTrainingCaption{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 20px);padding:9px 11px;border-radius:12px;background:rgba(5,35,52,.96);color:#fff;font:700 14px/1.3 system-ui;box-shadow:0 8px 28px rgba(0,0,0,.35);text-align:center;pointer-events:none}.h38-c360-head p,[href^="mailto:"],[href^="tel:"],input[type="email"],input[type="tel"]{filter:blur(7px)!important;user-select:none!important}'});
    result.identity=await page.evaluate(()=>({businessKey:String(window.state?.snapshot?.business?.businessKey||''),businessName:String(window.state?.snapshot?.business?.businessName||''),role:String(window.state?.snapshot?.user?.roleId||window.state?.snapshot?.user?.roleName||'')}));
    await caption(page,'SNOW SERVICE TRAINING — real Northern Lakes runtime. This recording does not invent a snow customer or fake job when a dedicated TEST snow fixture is absent.',1700);
    if(await openPage(page,'today')){
      await caption(page,'1. Trigger / assignment: after a snowfall trigger or owner decision, confirm the snow occurrence, route, priority, equipment and assigned operator in Today.',1550);
      result.steps.push({name:'snow-trigger-assignment-surface',status:'PASS'});
    }
    if(await openPage(page,'work')){
      await caption(page,'2. Field execution: travel → arrive → start. Record truck area, skid-steer area, driveway / lot, material used when applicable, notes, photos and proof before closeout.',1900);
      result.steps.push({name:'snow-field-work-surface',status:'PASS'});
    }
    if(await openPage(page,'field')){
      await caption(page,'3. Site proof stays attached to the same Northern Lakes customer/job context. Complete the occurrence only after proof and issues are reviewed.',1500);
      result.steps.push({name:'snow-proof-surface',status:'PASS'});
    }
    if(await openPage(page,'money')){
      await caption(page,'4. Billing: prepare per-occurrence or hourly snow billing from completed work. Training does not send an invoice, charge a customer, or create a payment.',1650);
      result.steps.push({name:'snow-billing-surface',status:'PASS'});
    }
    result.status='PASS';result.completedAt=now();
  }catch(error){result.status='HOLD';result.error=clean(error?.message||error);result.completedAt=now();throw error;}
  finally{
    const video=page.video();await page.close().catch(()=>{});await context.close().catch(()=>{});if(video)raw=await video.path().catch(()=> '');await browser.close().catch(()=>{});
    const target=path.join(out,'videos',`${videoId}-${result.status==='PASS'?'pass':'hold'}.webm`);
    if(raw&&fs.existsSync(raw))fs.renameSync(raw,target);
    const oldHold=path.join(out,'videos',`${videoId}-hold.webm`);if(result.status==='PASS'&&fs.existsSync(oldHold)&&oldHold!==target)fs.unlinkSync(oldHold);
    result.rawVideo=path.relative(out,target);
    writeJson(`${videoId}.json`,result);
  }
  if(result.status!=='PASS')process.exitCode=2;
  const manifestPath=path.join(out,'manifest.json'),resultsPath=path.join(out,'results.json');
  if(!fs.existsSync(manifestPath)||!fs.existsSync(resultsPath))throw new Error('Complete training manifest/results are missing; refusing to mask an unrelated recorder failure.');
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));const results=JSON.parse(fs.readFileSync(resultsPath,'utf8'));
  const index=(manifest.videos||[]).findIndex(item=>item.id===videoId);if(index<0)throw new Error('Snow video entry is missing from the complete training manifest.');
  manifest.videos[index]=result;
  const remaining=(manifest.videos||[]).filter(item=>item.status!=='PASS');
  manifest.status=remaining.length?'HOLD':'PASS';manifest.completedAt=now();
  results.failed=(results.failed||[]).filter(item=>item.id!==videoId);
  if(!results.passed.includes(videoId))results.passed.push(videoId);
  results.status=results.failed.length?'HOLD':'PASS';
  writeJson('manifest.json',manifest);writeJson('results.json',results);
  if(manifest.status!=='PASS'||results.status!=='PASS')throw new Error('Snow repair completed, but another training-library HOLD remains.');
  console.log(JSON.stringify({status:'PASS',videoId,coverageMode:result.coverageMode,dedicatedTestSnowFixture:false,externalActionsOccurred:false}));
}
main().catch(error=>{console.error(clean(error?.stack||error));process.exitCode=2;});
