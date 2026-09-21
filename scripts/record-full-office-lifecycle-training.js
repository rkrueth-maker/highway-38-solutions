'use strict';
/* Real deployed Office training recorder. Controlled TEST records only; no synthetic UI or external customer actions. */
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const out=path.resolve(process.env.H38_FULL_TRAINING_DIR||path.join(root,'artifacts/full-lifecycle-training'));
const officeUrl=process.env.H38_OFFICE_URL||'https://highway38solutions.com/commercial-app/';
const suppliedState=process.env.H38_WORKFLOW_STORAGE_STATE;
const email=String(process.env.H38_WORKFLOW_TEST_EMAIL||'').trim().toLowerCase();
const password=String(process.env.H38_WORKFLOW_TEST_PASSWORD||'');
const generatedState=process.env.H38_WORKFLOW_AUTH_STATE_OUT||path.join(require('os').tmpdir(),'h38-full-training-auth.json');
const stamp=String(process.env.GITHUB_RUN_ID||Date.now()).slice(-8);
const now=()=>new Date().toISOString();
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
const fail=(code,detail)=>{fs.mkdirSync(out,{recursive:true});write('manifest.json',{status:'HOLD',code,detail,capturedAt:now()});throw Error(`${code}: ${detail}`)};

if(process.env.H38_WORKFLOW_RECORDING_AUTHORIZED!=='true')fail('AUTHORIZATION_REQUIRED','Authorize controlled TEST-record training before recording.');
if(!suppliedState&&!email&&!password)fail('AUTH_MATERIAL_REQUIRED','Supply recorder storage state or the TEST login credential pair.');

function tenantUrl(key){const u=new URL(officeUrl);u.searchParams.set('businessKey',key);return u.toString()}
function ffmpegAvailable(){return spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0}
function convert(source,target){
  const result=spawnSync('ffmpeg',['-y','-i',source,'-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-an',target],{encoding:'utf8'});
  if(result.status!==0)throw Error(clean((result.stderr||result.stdout||'MP4 conversion failed').slice(-1200)));
}
async function storageState(browser){
  if(suppliedState&&fs.existsSync(suppliedState))return suppliedState;
  const ctx=await browser.newContext({viewport:{width:1440,height:900}}),page=await ctx.newPage();
  try{
    await page.goto(tenantUrl('highway38'),{waitUntil:'domcontentloaded',timeout:45000});
    await page.locator('#h38AuthForm').waitFor({timeout:20000});
    await page.locator('#h38AuthEmail').fill(email);await page.locator('#h38AuthPassword').fill(password);
    await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
    await page.waitForFunction(()=>String(window.state?.snapshot?.business?.businessKey||'').toLowerCase()==='highway38'&&!!window.state?.snapshot?.user,null,{timeout:30000});
    await ctx.storageState({path:generatedState});fs.chmodSync(generatedState,0o600);return generatedState;
  }finally{try{await page.locator('#h38AuthPassword').fill('')}catch(_){}await ctx.close()}
}
async function ready(page){
  await page.goto(tenantUrl('highway38'),{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(700);
  if(await page.locator('#h38AuthForm:visible').count()){
    if(!email||!password)throw Error('The refreshed training context requires the secure TEST login credential pair.');
    await page.locator('#h38AuthEmail').fill(email);await page.locator('#h38AuthPassword').fill(password);
    await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
  }
  await page.waitForFunction(()=>String(window.state?.snapshot?.business?.businessKey||'').toLowerCase()==='highway38'&&!!window.state?.snapshot?.user&&!!window.state?.bridgeReady,null,{timeout:40000});
  await page.waitForTimeout(1300);
  await page.addStyleTag({content:`
    #h38TrainingCaption{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:min(760px,calc(100vw - 24px));padding:12px 18px;border-radius:12px;background:rgba(5,35,52,.96);color:#fff;font:700 18px/1.3 system-ui;box-shadow:0 8px 28px rgba(0,0,0,.35);text-align:center;pointer-events:none}
    @media(max-width:600px){#h38TrainingCaption{font-size:15px;bottom:10px;padding:10px 12px}}
    input:focus,textarea:focus,select:focus,button:focus{outline:4px solid #ffbf47!important;outline-offset:3px!important}
  `});
}
async function caption(page,text,ms=1250){
  await page.evaluate(value=>{let n=document.getElementById('h38TrainingCaption');if(!n){n=document.createElement('div');n.id='h38TrainingCaption';document.body.appendChild(n)}n.textContent=value},text);
  await page.waitForTimeout(ms);
}
async function openPage(page,key,label){
  const target=page.locator(`[data-page="${key}"]:visible`).first();
  if(await target.count())await target.click();else await page.evaluate(pageKey=>{if(typeof window.openPage!=='function')throw Error(`Navigation unavailable for ${pageKey}.`);window.openPage(pageKey)},key);
  await page.waitForFunction(pageKey=>window.state?.page===pageKey,key,{timeout:10000});
  await page.waitForTimeout(650);
}
async function selectByLabel(select,label){await select.selectOption({label});}
async function sync(page){
  await page.evaluate(async()=>{if(typeof window.sync==='function')await window.sync(false);if(typeof window.refreshSnapshot==='function')await window.refreshSnapshot();});
  await page.waitForTimeout(800);
}
async function recordLifecycle(page,kind,result){
  const mobile=kind==='mobile',customerName=`Pine Ridge Workshop — TEST ${stamp}-${mobile?'M':'D'}`;
  const projectTitle=`Detached Garage Workflow — TEST ${stamp}-${mobile?'MOBILE':'DESKTOP'}`;
  const amount=mobile?385:625;
  result.testCustomer=customerName;result.projectTitle=projectTitle;result.invoiceTotal=amount;

  await caption(page,'TRAINING: Complete TEST workflow — no customer message or real payment is sent.',1800);
  await openPage(page,'customers','Customers');
  await caption(page,'1. Open Customers and choose Add Customer.');
  const directoryAdd=page.locator('[data-h38-new-customer]:visible');
  await directoryAdd.waitFor({state:'visible',timeout:10000});await directoryAdd.click();
  const customerForm=page.locator('#customerForm:visible');
  await customerForm.waitFor({state:'visible',timeout:10000});
  await customerForm.locator('[name="customerName"]').fill(customerName);
  await customerForm.locator('[name="email"]').fill(`training-${stamp}-${mobile?'m':'d'}@example.invalid`);
  await customerForm.locator('[name="phone"]').fill('218-555-0100');
  await caption(page,'Enter the customer’s basic contact information, then save.');
  await customerForm.getByRole('button',{name:'Add customer',exact:true}).click();
  await page.waitForFunction(name=>Array.from(document.querySelectorAll('[data-h38-customer-card]')).some(n=>n.textContent.includes(name)),customerName,{timeout:15000});
  result.steps.push({name:'customer-created',status:'PASS',at:now()});
  await caption(page,'Customer saved. Customer 360 keeps the entire job history together.');

  const card=page.locator('[data-h38-customer-card]').filter({hasText:customerName}).first();await card.click();
  await page.locator('.h38-c360-workspace').waitFor({timeout:10000});
  await caption(page,'2. Open the TEST customer and start a Site Visit.');
  await page.locator('button:visible').filter({hasText:/Start Site Visit/i}).first().click();
  await page.waitForFunction(()=>!!window.H38_FIELD_VISIT_CORE?.state?.open,null,{timeout:15000});
  await page.evaluate(async({projectTitle,scope})=>{
    const core=window.H38_FIELD_VISIT_CORE,workflow=window.H38_FIELD_VISIT_WORKFLOW;
    if(!core?.state?.visit||!workflow?.ensureSession)throw Error('Site Visit workflow unavailable.');
    core.state.visit.projectTitle=projectTitle;
    core.state.visit.scope=scope;
    await core.saveDraft?.();
    await workflow.ensureSession();
    core.state.tab='capture';
    core.state.render?.();
  },{projectTitle,scope:'Inspect the detached garage work area, document access and dimensions, prepare an owner-review quote, then demonstrate billing completion. TEST TRAINING ONLY.'});
  await page.waitForFunction(()=>window.H38_FIELD_VISIT_CORE?.state?.tab==='capture'&&!!window.H38_FIELD_VISIT_CORE?.state?.visit?.sessionId,null,{timeout:15000});
  await caption(page,'The Site Visit is linked to the TEST customer. Photos, video, and measurements are optional for this written-evidence training example.');
  const fieldNote='TEST visit complete. Access confirmed from the driveway. Verify final dimensions before work. Owner review required; nothing sent automatically.';
  await page.evaluate(async note=>{
    const core=window.H38_FIELD_VISIT_CORE;
    if(!core?.state?.visit||typeof core.notes!=='function')throw Error('Site Visit notes API unavailable.');
    core.state.tab='notes';
    core.state.render?.();
    await core.notes(note,true);
    core.state.tab='notes';
    core.state.render?.();
  },fieldNote);
  await page.waitForFunction(note=>String(window.H38_FIELD_VISIT_CORE?.state?.visit?.notes||'')===note,fieldNote,{timeout:15000});
  await page.waitForTimeout(500);
  await caption(page,'Record clear field notes, including anything that still needs verification.');
  await page.evaluate(()=>{const core=window.H38_FIELD_VISIT_CORE;if(!core?.state)throw Error('Site Visit workspace unavailable.');core.state.tab='review';core.state.render?.();});
  await page.waitForFunction(()=>window.H38_FIELD_VISIT_CORE?.state?.tab==='review',null,{timeout:10000});
  await caption(page,'Review the Site Visit, then explicitly finish it and build the draft quote.');
  const quoteId=await page.evaluate(async()=>{
    const optional=window.H38_SITE_VISIT_QUOTE_OPTIONAL;
    const handoff=window.H38_FIELD_VISIT_QUOTE_HANDOFF;
    if(typeof optional?.ensureDraftQuoteForVisit!=='function')throw Error('Site Visit quote creation API unavailable.');
    if(typeof handoff?.handoff!=='function')throw Error('Site Visit quote handoff API unavailable.');
    const qid=await optional.ensureDraftQuoteForVisit();
    await handoff.handoff();
    if(window.state?.page!=='quotes'){
      window.H38_FIELD_VISIT?.close?.();
      if(typeof window.openPage==='function')window.openPage('quotes');
      if(typeof window.openQuote==='function')window.openQuote(qid);
    }
    return qid;
  });
  await page.waitForFunction(qid=>window.state?.page==='quotes'&&String(window.state?.quote?.quoteId||'')===String(qid),quoteId,{timeout:30000});
  await page.locator('#quoteTitle:visible').waitFor({timeout:30000});
  result.steps.push({name:'site-visit-completed',status:'PASS',at:now()});

  await caption(page,'3. Build the quote from the saved Site Visit.');
  await page.locator('#lineDescription').fill('Detached garage workflow planning and field documentation');
  await page.locator('#lineQuantity').fill('1');await page.locator('#lineUnit').fill('project');await page.locator('#linePrice').fill(String(amount));
  const addQuoteLineButton=page.locator('#addQuoteLine:visible');
  await addQuoteLineButton.waitFor({state:'visible',timeout:10000});
  await addQuoteLineButton.focus();
  await addQuoteLineButton.click();
  await page.waitForFunction(([description,total])=>Array.isArray(window.state?.quote?.lines)&&window.state.quote.lines.some(line=>String(line?.description||line?.Description||'')===description&&Math.abs(Number(line?.quantity??line?.Quantity??0)*Number(line?.unitPrice??line?.['Unit Price']??0)-Number(total))<0.01),['Detached garage workflow planning and field documentation',amount],{timeout:10000});
  await caption(page,`Add the reviewed work line. This TEST quote totals ${amount.toFixed(2)}.`);
  const saveQuoteButton=page.locator('#saveQuoteButton:visible');
  await saveQuoteButton.waitFor({state:'visible',timeout:10000});
  await saveQuoteButton.focus();
  await saveQuoteButton.click();
  await page.waitForFunction(([qid,total])=>String(window.state?.quote?.quoteId||'')===String(qid)&&Math.abs(Number(window.state?.quote?.savedTotal||0)-Number(total))<0.01,[quoteId,amount],{timeout:20000});
  const ids=await page.evaluate(qid=>({customerId:String(window.state?.quote?.customerId||''),quoteId:String(qid)}),quoteId);
  if(!ids.customerId)throw Error('Saved TEST quote lost its customer link.');
  result.ids={...ids};result.steps.push({name:'quote-saved',status:'PASS',at:now()});
  await sync(page);

  await openPage(page,'money','Money');
  await caption(page,'4. Create the invoice from Money after reviewing the quote and completed work.');
  const invoice=page.locator('#invoiceForm');
  await selectByLabel(invoice.locator('[name="customerId"]'),customerName);
  await invoice.locator('[name="description"]').fill('Detached garage workflow planning — TEST');
  await invoice.locator('[name="quantity"]').fill('1');await invoice.locator('[name="unitPrice"]').fill(String(amount));
  await invoice.locator('[name="dueDate"]').fill(new Date(Date.now()+14*86400000).toISOString().slice(0,10));
  await caption(page,'Confirm the customer, description, amount, and due date before saving.');
  await invoice.getByRole('button',{name:'Save invoice draft',exact:true}).click();
  await page.waitForFunction(([cid,total])=>window.state.snapshot.invoices.some(r=>String(r['Customer ID']||r.customerId)===cid&&Number(r.Total||r.total)===total),[ids.customerId,amount],{timeout:15000});
  const invoiceId=await page.evaluate(([cid,total])=>{const rows=window.state.snapshot.invoices.filter(r=>String(r['Customer ID']||r.customerId)===cid&&Number(r.Total||r.total)===total);return String(rows[0]?.['Invoice ID']||rows[0]?.invoiceId||'')},[ids.customerId,amount]);
  if(!invoiceId)throw Error('TEST invoice was not created.');result.ids.invoiceId=invoiceId;result.steps.push({name:'invoice-created',status:'PASS',at:now()});
  await sync(page);await openPage(page,'money','Money');

  await caption(page,'5. Record the manual payment. This records bookkeeping only—no money moves.');
  const payment=page.locator('#paymentForm');await payment.locator('[name="invoiceId"]').selectOption(invoiceId);
  await payment.locator('[name="amount"]').fill(String(amount));await payment.locator('[name="method"]').fill('TEST check');await payment.locator('[name="reference"]').fill(`TRAINING-${stamp}`);
  await payment.getByRole('button',{name:'Record manual payment',exact:true}).click();
  await sync(page);await openPage(page,'money','Money');
  const finalState=await page.evaluate(id=>{const r=window.state.snapshot.invoices.find(x=>String(x['Invoice ID']||x.invoiceId)===id)||{};return{status:String(r.Status||r.status||''),balance:Number(r.Balance??r['Balance Due']??r.balance??0)}},invoiceId);
  if(finalState.balance!==0||!/paid/i.test(finalState.status))throw Error(`Invoice did not reach Paid / $0.00. Status=${finalState.status}; balance=${finalState.balance}`);
  result.finalState=finalState;result.steps.push({name:'payment-recorded-invoice-paid',status:'PASS',at:now()});
  await caption(page,'COMPLETE: Invoice is Paid and the remaining balance is $0.00.',2500);
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});const raw=path.join(out,'raw'),mp4=path.join(out,'mp4'),shots=path.join(out,'screenshots');for(const p of [raw,mp4,shots])fs.mkdirSync(p,{recursive:true});
  const browser=await chromium.launch({headless:true}),auth=await storageState(browser),runs=[];
  try{
    for(const spec of [{id:'H38-FULL-LIFECYCLE-DESKTOP',viewport:{width:1440,height:900},kind:'desktop'},{id:'H38-FULL-LIFECYCLE-PHONE',viewport:{width:390,height:844},kind:'mobile'}]){
      const ctx=await browser.newContext({storageState:auth,viewport:spec.viewport,recordVideo:{dir:raw,size:spec.viewport}}),page=await ctx.newPage(),video=page.video();
      const result={id:spec.id,title:`Customer to paid invoice — ${spec.kind}`,viewport:`${spec.viewport.width}x${spec.viewport.height}`,testDataOnly:true,status:'HOLD',steps:[]};
      try{await ready(page);await recordLifecycle(page,spec.kind,result);result.status='PASS';await page.screenshot({path:path.join(shots,`${spec.id}-paid.png`),fullPage:true})}catch(error){result.detail=error.stack||error.message;try{await page.screenshot({path:path.join(shots,`${spec.id}-hold.png`),fullPage:true})}catch(_){}}
      await page.close();await ctx.close();
      const source=await video.path(),webm=path.join(raw,`${spec.id}-${result.status.toLowerCase()}.webm`);if(fs.existsSync(source))fs.renameSync(source,webm);result.rawEvidence=path.relative(out,webm);
      if(ffmpegAvailable()){const target=path.join(mp4,`${spec.id}-${result.status.toLowerCase()}.mp4`);convert(webm,target);result.mp4Evidence=path.relative(out,target)}
      runs.push(result);
    }
  }finally{await browser.close()}
  const manifest={status:runs.every(r=>r.status==='PASS')?'PASS':'HOLD',evidenceType:'real-runtime-operator-training',productionAcceptanceEvidence:false,sourceSha:process.env.GITHUB_SHA||'local',capturedAt:now(),controls:{testDataOnly:true,noAutomaticSending:true,noRealPayment:true,manualPaymentRecordOnly:true},runs};
  write('manifest.json',manifest);write('results.json',manifest);console.log(JSON.stringify(manifest,null,2));if(manifest.status!=='PASS')process.exitCode=2;
})().catch(error=>{console.error(error.stack||error);process.exitCode=2});
