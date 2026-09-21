'use strict';
/* Records only the deployed authenticated Office. No mock DOM, synthetic app screen, or reconstructed UI exists here. */
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const out=path.resolve(process.env.H38_WORKFLOW_EVIDENCE_DIR||path.join(root,'artifacts/workflow-video-evidence'));
const now=()=>new Date().toISOString();
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
const hold=(code,detail,extra={})=>{
  fs.mkdirSync(out,{recursive:true});
  const evidence={status:'HOLD',code,detail,capturedAt:now(),sourceSha:process.env.GITHUB_SHA||'local',...extra};
  write('manifest.json',evidence);
  write('results.json',{status:'HOLD',workflows:[],failure:evidence});
  console.error(JSON.stringify(evidence));
  process.exitCode=2;
};

if(process.env.H38_WORKFLOW_RECORDING_AUTHORIZED!=='true'){
  hold('AUTHORIZATION_REQUIRED','Set H38_WORKFLOW_RECORDING_AUTHORIZED=true only for controlled TEST records.');
  return;
}
const suppliedStorageState=process.env.H38_WORKFLOW_STORAGE_STATE;
const hasSuppliedStorageState=!!suppliedStorageState&&fs.existsSync(suppliedStorageState);
const loginEmail=String(process.env.H38_WORKFLOW_TEST_EMAIL||'').trim().toLowerCase();
const loginPassword=String(process.env.H38_WORKFLOW_TEST_PASSWORD||'');
const generatedStorageState=process.env.H38_WORKFLOW_AUTH_STATE_OUT||path.join(require('os').tmpdir(),'h38-workflow-generated-storage-state.json');
if(!hasSuppliedStorageState&&!(loginEmail&&loginPassword)){
  hold(
    loginEmail||loginPassword?'AUTH_CREDENTIAL_PAIR_REQUIRED':'AUTH_MATERIAL_REQUIRED',
    loginEmail||loginPassword
      ? 'Both H38_WORKFLOW_TEST_EMAIL and H38_WORKFLOW_TEST_PASSWORD are required when storage state is not supplied.'
      : 'Supply H38_WORKFLOW_STORAGE_STATE or both secure recorder login credentials; no recording was created.'
  );
  return;
}
const officeUrl=process.env.H38_OFFICE_URL||'https://highway38solutions.com/commercial-app/';
if(!/^https:\/\/highway38solutions\.com\/commercial-app\/?(?:[?#].*)?$/.test(officeUrl)&&process.env.H38_ALLOW_NONPRODUCTION_URL!=='true'){
  hold('UNAPPROVED_OFFICE_URL','Recorder permits production Office URL only unless reviewed override is set.',{url:officeUrl});
  return;
}

const scenarios=[
  {
    id:'XT-H38-NORTHERN-CUSTOMER',
    title:'Northern Lakes as a TEST customer of H38',
    businessKey:'highway38',
    tenantName:'Highway 38 Solutions',
    customerNeedle:/Northern Lakes/i,
    requiredLabel:'Simulated training scenario using the real H38 Business Office \u2014 TEST data only.',
    mode:'customer360'
  },
  {
    id:'XT-NORTHERN-H38-SERVICE',
    title:'H38 as a TEST customer of Northern Lakes \u2014 lawn or snow service',
    businessKey:'northern-lakes',
    tenantName:'Northern Lakes',
    customerNeedle:/Highway 38/i,
    serviceNeedle:/lawn|mow|snow|plow/i,
    requiredLabel:'Simulated training scenario using the real Northern Lakes Business Office \u2014 TEST data only.',
    mode:'recurring-service'
  }
];

function safeText(value){return String(value==null?'':value).replace(/\s+/g,' ').trim();}
function tenantUrl(key){const url=new URL(officeUrl);url.searchParams.set('businessKey',key);return url.toString();}
async function resolveStorageState(browser){
  if(hasSuppliedStorageState)return suppliedStorageState;
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await ctx.newPage();
  try{
    await page.goto(tenantUrl('highway38'),{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForSelector('#h38AuthForm',{timeout:20000});
    await page.locator('#h38AuthEmail').fill(loginEmail);
    await page.locator('#h38AuthPassword').fill(loginPassword);
    await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
    await page.waitForFunction(()=>{
      const s=window.state||{},b=s.snapshot?.business||{};
      const key=String(b.businessKey||b['Business Key']||s.businessKey||'').trim().toLowerCase();
      return key==='highway38'&&!!s.snapshot?.user;
    },null,{timeout:30000});
    const auth=await page.evaluate(()=>({
      email:String(window.state?.snapshot?.user?.email||''),
      businessKey:String(window.state?.snapshot?.business?.businessKey||'').trim().toLowerCase()
    }));
    if(!auth.email||auth.businessKey!=='highway38')throw new Error('Secure recorder login did not open the authorized H38 tenant.');
    await ctx.storageState({path:generatedStorageState});
    fs.chmodSync(generatedStorageState,0o600);
    return generatedStorageState;
  }finally{
    try{await page.locator('#h38AuthPassword').fill('');}catch(_){}
    await ctx.close();
  }
}
function ffmpegAvailable(){const probe=spawnSync('ffmpeg',['-version'],{stdio:'ignore'});return probe.status===0;}
function toMp4(source,target){
  const result=spawnSync('ffmpeg',['-y','-i',source,'-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-an',target],{encoding:'utf8'});
  return {ok:result.status===0,detail:result.status===0?'converted':safeText((result.stderr||result.stdout||'ffmpeg conversion failed').slice(-1200))};
}
async function screenshot(page,shots,id,name){
  const file=path.join(shots,`${id}-${name}.png`);
  await page.screenshot({path:file,fullPage:true});
  return path.relative(out,file);
}
async function openAuthenticatedRuntime(page,scenario){
  await page.goto(tenantUrl(scenario.businessKey),{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(1200);
  const body=safeText((await page.locator('body').innerText({timeout:10000})).slice(0,16000));
  if(/secure access|sign in|log in|password|access code/i.test(body))throw new Error('Authenticated Business Office runtime unavailable; gateway/sign-in detected.');
  await page.waitForFunction(expected=>{
    const s=window.state||{},b=s.snapshot?.business||{};
    const key=String(b.businessKey||b['Business Key']||s.businessKey||'').trim().toLowerCase();
    return key===expected&&!!s.snapshot?.user;
  },scenario.businessKey,{timeout:20000});
  const tenant=await page.evaluate(()=>{
    const s=window.state||{},b=s.snapshot?.business||{};
    return {businessKey:String(b.businessKey||b['Business Key']||s.businessKey||'').trim().toLowerCase(),owner:!!s.snapshot?.user?.owner};
  });
  if(tenant.businessKey!==scenario.businessKey)throw new Error(`Wrong tenant opened: expected ${scenario.businessKey}.`);
  return tenant;
}
async function clickPage(page,name){
  const exact=page.getByRole('button',{name,exact:true});
  if(await exact.count()){await exact.first().click();return;}
  const nav=page.locator(`[data-page="${String(name).toLowerCase()}"]`);
  if(await nav.count()){await nav.first().click();return;}
  const link=page.getByRole('link',{name,exact:true});
  if(await link.count()){await link.first().click();return;}
  throw new Error(`Visible ${name} navigation control was not found.`);
}
async function openCustomer(page,needle){
  await clickPage(page,'Customers');
  await page.waitForSelector('[data-h38-customer-card]',{timeout:15000});
  const choices=page.locator('[data-h38-customer-card]');
  const count=await choices.count();
  for(let i=0;i<count;i++){
    const choice=choices.nth(i),txt=safeText(await choice.innerText());
    if(needle.test(txt)&&/TEST/i.test(txt)){
      const customerId=String(await choice.getAttribute('data-h38-customer-card')||'').trim();
      if(!customerId)continue;
      await choice.click();
      await page.waitForSelector('.h38-c360-workspace',{timeout:10000});
      const visibleHeading=page.locator('.h38-c360-detail:visible .h38-c360-head h2:visible').filter({hasText:needle}).filter({hasText:/TEST/i}).first();
      await visibleHeading.waitFor({state:'visible',timeout:10000});
      const visibleDetail=page.locator('.h38-c360-detail:visible').filter({hasText:needle}).filter({hasText:/TEST/i}).first();
      await visibleDetail.waitFor({state:'visible',timeout:10000});
      const detail=safeText(await visibleDetail.innerText());
      const heading=safeText(await visibleHeading.innerText());
      if(!needle.test(detail)||!/TEST/i.test(detail)||!needle.test(heading)||!/TEST/i.test(heading))throw new Error('Visible Customer 360 did not open the intended TEST customer.');
      return {customerId,displayText:txt,heading};
    }
  }
  throw new Error(`No visible TEST customer card matching ${needle} was found in this tenant.`);
}
async function redactCustomerContact(page){
  await page.addStyleTag({content:`
    .h38-c360-head p,.h38-c360-customer-details .h38-c360-detail-line strong{filter:blur(7px)!important;user-select:none!important}
  `});
}
async function customer360Scenario(page,scenario,result,shots){
  await openCustomer(page,scenario.customerNeedle);
  await redactCustomerContact(page);
  result.steps.push({name:'select-visible-test-customer',status:'PASS',at:now()});
  result.screenshots.push(await screenshot(page,shots,scenario.id,'customer-360'));
  for(const tab of ['overview','work','files']){
    const button=page.locator(`[data-c360-tab="${tab}"]`);
    if(!await button.count())throw new Error(`Customer 360 ${tab} tab is unavailable.`);
    await button.click();
    await page.waitForFunction(t=>{
      const b=document.querySelector(`[data-c360-tab="${t}"]`),p=document.querySelector(`[data-c360-panel="${t}"]`);
      return b?.getAttribute('aria-selected')==='true'&&p&&!p.hidden;
    },tab,{timeout:5000});
    result.steps.push({name:`customer-360-${tab}`,status:'PASS',at:now()});
    await page.waitForTimeout(500);
  }
}
async function recurringServiceScenario(page,scenario,result,shots){
  const selectedCustomer=await openCustomer(page,scenario.customerNeedle);
  await redactCustomerContact(page);
  result.steps.push({name:'select-visible-test-customer',status:'PASS',at:now(),customerId:selectedCustomer.customerId});
  const customerContext=await page.evaluate(id=>{
    const invoices=Array.isArray(window.state?.snapshot?.invoices)?window.state.snapshot.invoices:[];
    const invoiceCount=invoices.filter(row=>String(row['Customer ID']||row.customerId||'')===id).length;
    return {id,invoiceCount};
  },selectedCustomer.customerId);
  if(!customerContext.id)throw new Error('Visible TEST customer card did not resolve to a customer ID.');
  await clickPage(page,'Today');
  await page.waitForSelector('#h38RecurringServiceQueue',{timeout:15000});
  const cards=page.locator('#h38RecurringServiceQueue article');
  const count=await cards.count();
  let card=null;
  for(let i=0;i<count;i++){
    const candidate=cards.nth(i),txt=safeText(await candidate.innerText());
    if(scenario.customerNeedle.test(txt)&&scenario.serviceNeedle.test(txt)&&/TEST/i.test(txt)){card=candidate;break;}
  }
  if(!card)throw new Error('No visible TEST lawn/snow recurring-service card for the selected H38 customer was found on Today.');
  result.screenshots.push(await screenshot(page,shots,scenario.id,'service-ready'));
  const start=card.locator('[data-h38-recurring-start]');
  if(!await start.count())throw new Error('Recurring TEST service is not in a safe Start visit state.');
  await start.click();
  await page.waitForFunction(([customerSource,serviceSource])=>{
    const rxCustomer=new RegExp(customerSource,'i'),rxService=new RegExp(serviceSource,'i');
    return Array.from(document.querySelectorAll('#h38RecurringServiceQueue article')).some(article=>rxCustomer.test(article.innerText)&&rxService.test(article.innerText)&&/TEST/i.test(article.innerText)&&!!article.querySelector('[data-h38-recurring-finish]'));
  },[scenario.customerNeedle.source,scenario.serviceNeedle.source],{timeout:15000});
  result.steps.push({name:'start-test-service',status:'PASS',at:now()});
  result.screenshots.push(await screenshot(page,shots,scenario.id,'service-in-progress'));
  const liveCard=page.locator('#h38RecurringServiceQueue article').filter({hasText:scenario.customerNeedle}).filter({hasText:scenario.serviceNeedle}).first();
  await liveCard.locator('[data-h38-recurring-finish]').click();
  await page.waitForSelector('.h38-c360-workspace',{timeout:15000});
  const billingHeading=page.locator('.h38-c360-detail:visible .h38-c360-head h2:visible').filter({hasText:scenario.customerNeedle}).filter({hasText:/TEST/i}).first();
  await billingHeading.waitFor({state:'visible',timeout:10000});
  await redactCustomerContact(page);
  const after=await page.evaluate(id=>{
    const invoices=Array.isArray(window.state?.snapshot?.invoices)?window.state.snapshot.invoices:[];
    return {invoiceCount:invoices.filter(row=>String(row['Customer ID']||row.customerId||'')===id).length,page:String(window.state?.page||'')};
  },customerContext.id);
  if(after.invoiceCount!==customerContext.invoiceCount)throw new Error('Invoice count changed automatically during recurring-service completion; recording stopped.');
  if(after.page!=='customers')throw new Error('Finish visit did not open Customer 360 billing review.');
  result.steps.push({name:'finish-test-service',status:'PASS',at:now()});
  result.steps.push({name:'billing-review-no-auto-invoice',status:'PASS',at:now(),invoiceCountUnchanged:true});
  const tenantBrand=safeText(await page.locator('body').innerText());
  if(!/Northern Lakes/i.test(tenantBrand))throw new Error('Northern tenant branding was not visible after service completion.');
  result.steps.push({name:'northern-branding-visible',status:'PASS',at:now()});
  result.screenshots.push(await screenshot(page,shots,scenario.id,'billing-review'));
}

(async()=>{
  const raw=path.join(out,'raw'),shots=path.join(out,'screenshots'),mp4=path.join(out,'mp4');
  fs.mkdirSync(raw,{recursive:true});fs.mkdirSync(shots,{recursive:true});fs.mkdirSync(mp4,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const workflows=[];
  try{
    const runtimeStorageState=await resolveStorageState(browser);
    for(const scenario of scenarios){
      const ctx=await browser.newContext({storageState:runtimeStorageState,viewport:{width:1440,height:900},recordVideo:{dir:raw,size:{width:1440,height:900}}});
      const page=await ctx.newPage(),video=page.video();
      const result={id:scenario.id,title:scenario.title,tenant:scenario.tenantName,businessKey:scenario.businessKey,requiredLabel:scenario.requiredLabel,viewport:'1440x900',testDataOnly:true,status:'HOLD',steps:[],screenshots:[]};
      try{
        const tenant=await openAuthenticatedRuntime(page,scenario);
        result.steps.push({name:'authenticated-real-runtime-open',status:'PASS',owner:tenant.owner,at:now()});
        result.screenshots.push(await screenshot(page,shots,scenario.id,'runtime-start'));
        if(scenario.mode==='customer360')await customer360Scenario(page,scenario,result,shots);
        else await recurringServiceScenario(page,scenario,result,shots);
        result.status='PASS';
      }catch(error){
        result.failureStep=result.steps.at(-1)?.name||'authenticated-runtime-open';
        result.detail=error.message;
        try{result.screenshots.push(await screenshot(page,shots,scenario.id,'hold'));}catch(_){}
      }finally{
        await page.close();await ctx.close();
        if(video){
          const source=await video.path();
          const webm=path.join(raw,`${scenario.id}-${result.status.toLowerCase()}.webm`);
          if(fs.existsSync(source))fs.renameSync(source,webm);
          result.rawEvidence=path.relative(out,webm);
          if(fs.existsSync(webm)&&ffmpegAvailable()){
            const target=path.join(mp4,`${scenario.id}-${result.status.toLowerCase()}.mp4`),conversion=toMp4(webm,target);
            result.mp4={supported:true,status:conversion.ok?'PASS':'HOLD',detail:conversion.detail};
            if(conversion.ok)result.mp4Evidence=path.relative(out,target);
          }else result.mp4={supported:false,status:'SKIPPED',detail:'ffmpeg unavailable; WebM preserved.'};
        }
      }
      workflows.push(result);
    }
  }finally{await browser.close();}
  const manifest={
    status:workflows.every(x=>x.status==='PASS')?'PASS':'HOLD',
    evidenceType:'real-runtime-only',
    productionAcceptanceEvidence:false,
    sourceSha:process.env.GITHUB_SHA||'local',
    officeUrl,
    capturedAt:now(),
    controls:{testLabelRequired:true,noSyntheticUi:true,noAutomaticInvoiceCreation:true,noAutomaticPayment:true,noAutomaticCustomerSending:true,authStateRunnerOnly:true,credentialLoginSupported:true},
    workflows
  };
  write('manifest.json',manifest);write('results.json',manifest);
  console.log(JSON.stringify(manifest,null,2));
  if(manifest.status!=='PASS')process.exitCode=2;
})().catch(error=>hold('RECORDER_ERROR',error.stack||error.message));
