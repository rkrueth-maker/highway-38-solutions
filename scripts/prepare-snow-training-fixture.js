'use strict';
/*
  Prepare one controlled TEST snow-plowing job in Northern Lakes for the real-runtime
  training recorder. This script uses the canonical deployed Work form and never
  sends messages, schedules an external event, charges a payment, or performs a purchase.
*/
const fs=require('fs');
const path=require('path');
const os=require('os');
const {chromium}=require('playwright');

const officeUrl=process.env.H38_OFFICE_URL||'https://highway38solutions.com/commercial-app/';
const suppliedState=process.env.H38_WORKFLOW_STORAGE_STATE;
const email=String(process.env.H38_WORKFLOW_TEST_EMAIL||'').trim().toLowerCase();
const password=String(process.env.H38_WORKFLOW_TEST_PASSWORD||'');
const generatedState=process.env.H38_WORKFLOW_AUTH_STATE_OUT||path.join(os.tmpdir(),'h38-snow-training-auth.json');
const stamp=String(process.env.GITHUB_RUN_ID||Date.now()).slice(-8);
const clean=value=>String(value==null?'':value).replace(/\s+/g,' ').trim();

if(process.env.H38_WORKFLOW_RECORDING_AUTHORIZED!=='true')throw new Error('Controlled TEST-record training authorization is required.');
if(!suppliedState&&!email&&!password)throw new Error('Recorder storage state or the secure TEST login credential pair is required.');
if(!/^https:\/\/highway38solutions\.com\/commercial-app\/?(?:[?#].*)?$/.test(officeUrl)&&process.env.H38_ALLOW_NONPRODUCTION_URL!=='true'){
  throw new Error('Snow training fixture preparation permits the production H38 Office URL only unless reviewed override is enabled.');
}

function tenantUrl(){const url=new URL(officeUrl);url.searchParams.set('businessKey','northern-lakes');return url.toString();}
async function authenticate(browser){
  if(suppliedState&&fs.existsSync(suppliedState))return suppliedState;
  const context=await browser.newContext({viewport:{width:1420,height:900}}),page=await context.newPage();
  try{
    await page.goto(tenantUrl(),{waitUntil:'domcontentloaded',timeout:45000});
    await page.locator('#h38AuthForm').waitFor({state:'visible',timeout:20000});
    await page.locator('#h38AuthEmail').fill(email);await page.locator('#h38AuthPassword').fill(password);
    await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
    await page.waitForFunction(()=>String(window.state?.snapshot?.business?.businessKey||'').toLowerCase()==='northern-lakes'&&!!window.state?.snapshot?.user,null,{timeout:30000});
    await context.storageState({path:generatedState});fs.chmodSync(generatedState,0o600);return generatedState;
  }finally{try{await page.locator('#h38AuthPassword').fill('');}catch(_){}await context.close();}
}
async function ready(page){
  await page.goto(tenantUrl(),{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(700);
  if(await page.locator('#h38AuthForm:visible').count()){
    if(!email||!password)throw new Error('The refreshed snow-fixture context requires the secure TEST login credential pair.');
    await page.locator('#h38AuthEmail').fill(email);await page.locator('#h38AuthPassword').fill(password);
    await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
  }
  await page.waitForFunction(()=>String(window.state?.snapshot?.business?.businessKey||'').trim().toLowerCase()==='northern-lakes'&&!!window.state?.snapshot?.user&&!!window.state?.bridgeReady,null,{timeout:40000});
  await page.waitForTimeout(1200);
}
async function existingFixture(page){
  return await page.evaluate(()=>{
    const rows=Array.isArray(window.state?.snapshot?.jobs)?window.state.snapshot.jobs:[];
    const val=(row,...keys)=>keys.map(key=>row?.[key]).find(value=>value!==undefined&&value!==null&&value!=='')||'';
    const row=[...rows].reverse().find(item=>/TEST/i.test(JSON.stringify(item))&&/snow|plow/i.test(String(val(item,'Service Type','serviceType','Project Title','projectTitle','Description','description'))));
    if(!row)return null;
    return{jobId:String(val(row,'Job ID','jobId')),title:String(val(row,'Project Title','projectTitle')),status:String(val(row,'Status','status'))};
  });
}
async function openWork(page){
  const target=page.locator('[data-page="work"]:visible').first();
  if(await target.count())await target.click();
  else await page.evaluate(()=>{if(typeof window.openPage!=='function')throw new Error('Work navigation is unavailable.');window.openPage('work');});
  await page.waitForFunction(()=>window.state?.page==='work',null,{timeout:10000});
  await page.waitForTimeout(600);
}
async function openJobForm(page){
  const visible=()=>page.locator('#jobForm:visible').last();
  for(let attempt=0;attempt<4;attempt++){
    let form=visible();if(await form.count())return form;
    await page.evaluate(()=>{if(window.state?.page==='work'&&typeof window.renderWork==='function')window.renderWork();});
    await page.waitForTimeout(200);
    form=visible();if(await form.count())return form;
    const clicked=await page.evaluate(()=>{
      const chooser=document.querySelector('[data-h38-create="jobForm"]');
      if(chooser){chooser.click();return true;}
      const button=Array.from(document.querySelectorAll('button')).find(node=>String(node.textContent||'').trim()==='New job');
      if(button){button.click();return true;}
      return false;
    });
    if(clicked){form=visible();try{await form.waitFor({state:'visible',timeout:3000});return form;}catch(_){}}
    await page.waitForTimeout(250*(attempt+1));
  }
  throw new Error('Canonical New job creation card did not open in Northern Lakes.');
}
async function setOptionalSnowFields(form){
  for(const name of ['serviceType','service','jobType']){
    const control=form.locator(`[name="${name}"]`);
    if(!await control.count())continue;
    const tag=await control.evaluate(node=>node.tagName);
    if(tag==='SELECT'){
      const options=await control.locator('option').evaluateAll(nodes=>nodes.map(node=>({value:String(node.value||''),label:String(node.textContent||'')})));
      const snow=options.find(option=>/snow|plow/i.test(`${option.value} ${option.label}`));
      if(snow){await control.selectOption(snow.value);break;}
    }else{await control.fill('Snow Plowing');break;}
  }
  for(const name of ['description','notes','jobNotes']){
    const control=form.locator(`[name="${name}"]`);
    if(await control.count()){await control.fill('[H38 TEST] Snow Plowing training fixture — no customer message, payment, purchase, or external schedule action.');break;}
  }
}
async function createFixture(page){
  await openWork(page);
  const form=await openJobForm(page);
  const title=`TEST Snow Plowing Training ${stamp}`;
  const projectTitle=form.locator('[name="projectTitle"]');
  if(!await projectTitle.count())throw new Error('Canonical job form is missing projectTitle.');
  await projectTitle.fill(title);
  const status=form.locator('[name="status"]');
  if(await status.count()){
    try{await status.selectOption({label:'Scheduled'});}catch(_){try{await status.selectOption('Scheduled');}catch(__){}}
  }
  await setOptionalSnowFields(form);
  const save=form.getByRole('button',{name:'Save job',exact:true});
  await save.waitFor({state:'visible',timeout:10000});await save.click();
  await page.waitForFunction(title=>(window.state?.snapshot?.jobs||[]).some(row=>String(row?.['Project Title']||row?.projectTitle||'')===title),title,{timeout:15000});
  const fixture=await existingFixture(page);
  if(!fixture?.jobId||fixture.title!==title)throw new Error('The canonical Northern Lakes job save did not create the controlled TEST snow fixture.');
  return fixture;
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const statePath=await authenticate(browser);
    const context=await browser.newContext({storageState:statePath,viewport:{width:1420,height:900}});
    const page=await context.newPage();
    try{
      await ready(page);
      let fixture=await existingFixture(page);
      if(fixture){console.log(JSON.stringify({status:'PASS',action:'reuse-existing-test-snow-fixture',fixture,externalActionsOccurred:false},null,2));return;}
      fixture=await createFixture(page);
      console.log(JSON.stringify({status:'PASS',action:'created-native-test-snow-fixture',fixture,externalActionsOccurred:false},null,2));
    }finally{await page.close().catch(()=>{});await context.close().catch(()=>{});}
  }finally{await browser.close().catch(()=>{});}
})().catch(error=>{console.error(JSON.stringify({status:'HOLD',error:clean(error?.message||error),externalActionsOccurred:false},null,2));process.exitCode=1;});
