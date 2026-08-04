#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');

const APPROVED_LOGO='highway38-logo.png?v=20260720-exact-0cbc4514';
const [publicArg='https://highway38solutions.com/',deploymentArg,credentialsArg,configArg='commercial-beta/website-demo-quotes.json',outArg='artifacts/commercial-google-native-beta/delivery-acceptance']=process.argv.slice(2);
const publicBase=new URL(publicArg);
const launcherUrl=new URL('/open-business-office.html',publicBase);
const credentialsPath=credentialsArg||path.join(process.env.HOME||'','.clasprc.json');
const configPath=path.resolve(configArg);
const outDir=path.resolve(outArg);
let stage='INITIALIZE';
let activePage=null;

function assert(condition,message){if(!condition)throw new Error(message);}
function value(row,...keys){for(const key of keys)if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];return'';}
function rowId(row,...keys){return String(value(row,...keys));}
function numberFromMoney(text){return Number(String(text||'').replace(/[^0-9.-]/g,''));}
function closeEnough(a,b){return Math.abs(Number(a)-Number(b))<0.01;}
function isScriptHost(hostname){return hostname==='script.google.com'||hostname==='script.googleusercontent.com'||hostname.endsWith('.script.googleusercontent.com')||hostname.endsWith('-script.googleusercontent.com');}
function isHighwayHost(hostname){return hostname==='highway38solutions.com'||hostname==='www.highway38solutions.com';}
function safeName(value){return String(value||'stage').replace(/[^a-z0-9_-]+/gi,'-').toLowerCase();}
function mark(next,details={}){
  stage=next;
  const event={status:'RUNNING',stage,at:new Date().toISOString(),...details};
  console.log(JSON.stringify(event));
  fs.mkdirSync(outDir,{recursive:true});
  fs.appendFileSync(path.join(outDir,'stages.ndjson'),JSON.stringify(event)+'\n');
}
function writeJson(name,payload){fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,name),JSON.stringify(payload,null,2)+'\n');}
function findByKey(object,keys,seen=new Set()){
  if(!object||typeof object!=='object'||seen.has(object))return'';seen.add(object);
  for(const [key,child] of Object.entries(object))if(keys.includes(key)&&typeof child==='string'&&child.trim())return child.trim();
  for(const child of Object.values(object)){const found=findByKey(child,keys,seen);if(found)return found;}
  return'';
}
function validateConfig(config){
  assert(config&&config.schemaVersion===1,'Website demo quote config must use schemaVersion 1.');
  assert(config.recordPolicy&&config.recordPolicy.customerName==='Generic Quote Customer','Demo quotes must use Generic Quote Customer.');
  assert(config.recordPolicy.preserveAfterAcceptance===true,'Demo records must remain after acceptance.');
  assert(config.recordPolicy.externalActionsEnabled===false&&config.recordPolicy.approved===false&&config.recordPolicy.sent===false&&config.recordPolicy.fundsMoved===false,'Demo quote safety policy is invalid.');
  assert(Array.isArray(config.quotes)&&config.quotes.length===7,'Exactly seven standard website quote examples are required before the eighth cabin package acceptance.');
  const ids=new Set(),numbers=new Set();
  for(const quote of config.quotes){
    assert(/^H38-DEMO-WEB-/.test(quote.quoteId),`Quote ${quote.key} does not use a stable demo ID.`);
    assert(!ids.has(quote.quoteId),`Duplicate demo quote ID ${quote.quoteId}.`);ids.add(quote.quoteId);
    assert(!numbers.has(quote.quoteNumber),`Duplicate demo quote number ${quote.quoteNumber}.`);numbers.add(quote.quoteNumber);
    assert(/^\[DEMO\]/.test(quote.title),`Quote ${quote.key} title is not visibly marked DEMO.`);
    assert(Array.isArray(quote.lines)&&quote.lines.length>=5,`Quote ${quote.key} does not have a deliverable itemization.`);
    const total=quote.lines.reduce((sum,line)=>sum+Number(line.quantity||0)*Number(line.unitPrice||0),0);
    assert(closeEnough(total,quote.total),`Quote ${quote.key} line total ${total} does not equal advertised total ${quote.total}.`);
  }
}
async function refreshAccessToken(credentials){
  let accessToken=findByKey(credentials,['access_token','accessToken']);
  const refreshToken=findByKey(credentials,['refresh_token','refreshToken']);
  const clientId=findByKey(credentials,['client_id','clientId']);
  const clientSecret=findByKey(credentials,['client_secret','clientSecret']);
  if(refreshToken&&clientId&&clientSecret){
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'})});
    assert(response.ok,`Google credential refresh failed (${response.status}).`);
    const payload=await response.json();accessToken=payload.access_token||accessToken;
  }
  assert(accessToken,'The existing Google credential does not contain a usable access token.');
  return accessToken;
}
async function pageState(page){
  if(!page||page.isClosed())return{url:'',closed:true};
  return page.evaluate(()=>({
    url:location.href,
    title:document.title,
    readyState:document.readyState,
    businessStatus:(document.getElementById('businessStatus')?.textContent||'').trim(),
    currentPage:window.state?.page||'',
    currentQuoteId:window.state?.quote?.quoteId||'',
    currentQuoteTitle:window.state?.quote?.projectTitle||'',
    quoteTitleInput:document.getElementById('quoteTitle')?.value||'',
    savedQuoteButtons:Array.from(document.querySelectorAll('[data-open-quote]')).map(button=>button.getAttribute('data-open-quote')).slice(0,150),
    mainText:(document.getElementById('mainContent')?.innerText||document.body?.innerText||'').slice(0,4000)
  })).catch(error=>({url:page.url(),evaluationError:error.message}));
}
async function captureFailure(error,extra={}){
  const safe=safeName(stage);
  const state=await pageState(activePage);
  const payload={status:'FAIL',acceptance:'WEBSITE_TO_NEW_OFFICE_DELIVERY',stage,error:error.message,stack:error.stack||'',state,...extra,finishedAt:new Date().toISOString()};
  writeJson('failure.json',payload);
  writeJson(`failure-${safe}.json`,payload);
  if(activePage&&!activePage.isClosed()){
    await activePage.screenshot({path:path.join(outDir,`failure-${safe}.png`),fullPage:true}).catch(()=>{});
    fs.writeFileSync(path.join(outDir,`failure-${safe}.html`),await activePage.content().catch(()=>''));
  }
  console.error(JSON.stringify(payload,null,2));
}
async function publicPageState(page){
  return page.evaluate(()=>({
    url:location.href,
    documentTitle:document.title,
    title:(document.getElementById('title')?.textContent||'').trim(),
    quoteNumber:(document.getElementById('number')?.textContent||'').trim(),
    base:(document.getElementById('base')?.textContent||'').trim(),
    tableTotal:(document.getElementById('tableTotal')?.textContent||'').trim(),
    lineCount:document.querySelectorAll('#items tr').length,
    pickerCount:document.querySelectorAll('#picker a').length,
    logoSrc:document.querySelector('header .brand img')?.getAttribute('src')||'',
    logoAlt:document.querySelector('header .brand img')?.getAttribute('alt')||''
  }));
}
async function loadPublicQuote(page,quote){
  let lastError='';
  for(let attempt=1;attempt<=3;attempt++){
    const url=new URL('/contractor-quote-complete.html',publicBase);
    url.searchParams.set('example',quote.key);
    url.searchParams.set('deliveryAcceptanceTime',`${Date.now()}-${attempt}`);
    try{
      const response=await page.goto(url.toString(),{waitUntil:'domcontentloaded',timeout:45000});
      await page.locator('#title').waitFor({state:'visible',timeout:20000});
      const result=await publicPageState(page);
      assert(response&&response.status()>=200&&response.status()<300,`Public quote ${quote.key} returned HTTP ${response&&response.status()}.`);
      assert(result.title===quote.publicTitle,`Public quote ${quote.key} title changed: ${result.title}.`);
      return{...result,httpStatus:response.status(),attempt};
    }catch(error){lastError=error.message;if(attempt<3)await page.waitForTimeout(attempt*2500);}
  }
  throw new Error(`Public quote ${quote.key} did not render after three cache-busted attempts: ${lastError}`);
}
async function verifyPublicWebsite(context,config){
  const page=await context.newPage();activePage=page;
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  const results=[];
  try{
    for(const quote of config.quotes){
      mark(`PUBLIC_QUOTE_${quote.key.toUpperCase()}`);
      pageErrors.length=0;
      const result=await loadPublicQuote(page,quote);
      assert(closeEnough(numberFromMoney(result.base),quote.total)&&closeEnough(numberFromMoney(result.tableTotal),quote.total),`Public quote ${quote.key} no longer calculates the advertised total.`);
      assert(result.lineCount===quote.lines.length,`Public quote ${quote.key} line count changed.`);
      assert(result.pickerCount===config.quotes.length,`Public quote ${quote.key} no longer exposes all seven standard examples.`);
      assert(result.logoSrc.includes('assets/highway38-logo.png')&&result.logoAlt==='Highway 38 Solutions',`Public quote ${quote.key} is not using the approved logo.`);
      assert(pageErrors.length===0,`Public quote ${quote.key} reported browser errors: ${pageErrors.join(' | ')}`);
      results.push({key:quote.key,status:'PASS',total:numberFromMoney(result.tableTotal),lineCount:result.lineCount,httpStatus:result.httpStatus,attempt:result.attempt});
    }
    mark('PUBLIC_INTERACTIVE_DEMO');
    const demoUrl=new URL('/quote-builder-demo.html',publicBase);demoUrl.searchParams.set('deliveryAcceptanceTime',String(Date.now()));
    const response=await page.goto(demoUrl.toString(),{waitUntil:'domcontentloaded',timeout:45000});
    assert(response&&response.status()>=200&&response.status()<300,`The public interactive Quote Builder returned HTTP ${response&&response.status()}.`);
    assert(await page.locator('[data-preset]').count()===3,'The public interactive Quote Builder must retain all three advertised presets.');
    for(const preset of ['landscape','drainage','seasonal']){
      mark(`PUBLIC_PRESET_${preset.toUpperCase()}`);
      const button=page.locator(`[data-preset="${preset}"]`);await button.click();
      await page.locator(`[data-preset="${preset}"][aria-pressed="true"]`).waitFor({state:'visible',timeout:20000});
      const rows=await page.locator('#lineRows tr, .line-table tbody tr').count();
      const totalText=await page.locator('.total-row.grand').last().textContent().catch(()=>'');
      assert(rows>0&&numberFromMoney(totalText)>0,`Public interactive preset ${preset} did not produce a quote.`);
      const previewText=await page.locator('.quote-paper').textContent();
      assert(!/Internal markup percentage/i.test(previewText),`Public interactive preset ${preset} exposed internal markup.`);
    }
    const result={status:'PASS',quotes:results,interactivePresets:3,cacheBusted:true,retriesAllowed:3};
    writeJson('public-website-result.json',result);
    return result;
  }finally{await page.close();activePage=null;}
}
async function clickAuthorizedOfficeButton(page){
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    for(const frame of page.frames()){
      const button=frame.locator('#continueButton');if(!(await button.count().catch(()=>0)))continue;
      const logo=frame.locator('#approvedLogo');
      assert(await logo.count()===1,'Authorized Google handoff page is missing the approved Highway 38 logo.');
      assert(String(await logo.getAttribute('src')).includes(APPROVED_LOGO)&&await logo.getAttribute('alt')==='Highway 38 Solutions','Authorized Google handoff page is using the wrong logo.');
      if(await button.getAttribute('aria-disabled')==='false'&&await button.getAttribute('data-ready')==='true'){await button.click({timeout:15000});return;}
    }
    await page.waitForTimeout(250);
  }
  throw new Error('The authorized Google page did not present the secure Open Business Office button.');
}
async function officeRequest(page,action,args={},timeout=120000){return page.evaluate(async({action,args,timeout})=>window.H38_ACTIVE_BRIDGE.request(action,args,timeout),{action,args,timeout});}
async function deliverySnapshot(page,businessId){
  let lastError='';
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const snapshot=await officeRequest(page,'deliveryAcceptanceSnapshot',{businessId},90000);
      assert(snapshot?.status==='PASS'&&snapshot.acceptance==='DELIVERY_ACCEPTANCE_SNAPSHOT','The scoped delivery snapshot contract failed.');
      assert(snapshot.readOnly===true&&snapshot.externalActionsEnabled===false&&snapshot.productionDataMigrated===false,'The scoped delivery snapshot lost its safety boundary.');
      assert(Array.isArray(snapshot.customers)&&Array.isArray(snapshot.quotes),'The scoped delivery snapshot is incomplete.');
      return{...snapshot,attempt};
    }catch(error){lastError=error.message;if(attempt<3)await page.waitForTimeout(attempt*2000);}
  }
  throw new Error(`Scoped delivery snapshot failed after three attempts: ${lastError}`);
}
async function applyDeliverySnapshot(page,businessId,snapshot){
  await page.evaluate(({businessId,snapshot})=>{
    if(!window.state||!state.snapshot)throw new Error('The Office snapshot is unavailable.');
    state.businessId=businessId;
    state.snapshot={...state.snapshot,customers:snapshot.customers,quotes:snapshot.quotes};
    state.quote={quoteId:'',lines:[]};
    openPage('quotes',false);
  },{businessId,snapshot:{customers:snapshot.customers,quotes:snapshot.quotes}});
}
async function openQuoteThroughUi(page,quote){
  mark(`OFFICE_OPEN_QUOTE_${quote.key.toUpperCase()}`,{quoteId:quote.quoteId});
  const button=page.locator(`[data-open-quote="${quote.quoteId}"]`);
  assert(await button.count()===1,`Saved quote ${quote.key} is not visible in the new Office quote list.`);
  await button.scrollIntoViewIfNeeded();
  await button.click({timeout:15000});
  const deadline=Date.now()+30000;
  let current={};
  while(Date.now()<deadline){
    current=await page.evaluate(()=>({
      stateQuoteId:window.state?.quote?.quoteId||'',
      stateTitle:window.state?.quote?.projectTitle||'',
      statePage:window.state?.page||'',
      inputTitle:document.getElementById('quoteTitle')?.value||'',
      lineCount:document.querySelectorAll('#quoteLines .row').length,
      total:(document.getElementById('quoteTotal')?.textContent||'').trim()
    }));
    if(current.stateQuoteId===quote.quoteId&&current.inputTitle===quote.title)return current;
    await page.waitForTimeout(250);
  }
  throw new Error(`New Office did not open ${quote.key} after its visible quote button was clicked: ${JSON.stringify(current)}`);
}
async function verifyOfficeDelivery(context,config){
  const page=await context.newPage();activePage=page;
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  try{
    mark('OFFICE_SECURE_LAUNCH');
    const target=new URL(launcherUrl);target.searchParams.set('deliveryAcceptance','1');target.searchParams.set('deliveryAcceptanceTime',String(Date.now()));
    await page.goto(target.toString(),{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForURL(url=>{try{return isScriptHost(new URL(url).hostname);}catch(error){return false;}},{timeout:60000});
    mark('OFFICE_AUTHORIZED_HANDOFF');await clickAuthorizedOfficeButton(page);
    await page.waitForURL(url=>{try{const parsed=new URL(url);return isHighwayHost(parsed.hostname)&&parsed.pathname.includes('/commercial-app/');}catch(error){return false;}},{timeout:90000});
    mark('OFFICE_READY');
    await page.waitForFunction(()=>/Office open|latest records loaded/i.test(document.getElementById('businessStatus')?.textContent||'')&&!!window.H38_ACTIVE_BRIDGE?.ready,undefined,{timeout:120000,polling:250});
    const officeLogo=page.locator('#approvedOfficeLogo');
    assert(await officeLogo.count()===1&&String(await officeLogo.getAttribute('src')).includes(APPROVED_LOGO)&&await officeLogo.getAttribute('alt')==='Highway 38 Solutions','The new Office header is not using the approved Highway 38 logo.');
    const acceptance=await officeRequest(page,'acceptanceStatus',{},90000);
    assert(acceptance.status==='PASS'&&acceptance.readOnly===true&&acceptance.externalActionsEnabled===false,'Office safety acceptance failed before quote delivery testing.');
    const businessId=await page.locator('#businessSelect').inputValue();assert(businessId,'The new Office did not select a business.');
    mark('OFFICE_LOAD_SCOPED_QUOTE_RECORDS',{businessId});
    let snapshot=await deliverySnapshot(page,businessId);
    const generic=(snapshot.customers||[]).find(row=>String(value(row,'Customer Name','name')).trim()==='Generic Quote Customer');assert(generic,'Generic Quote Customer was not found.');
    const genericId=rowId(generic,'Customer ID','customerId');const created=[],preserved=[];
    for(const quote of config.quotes){
      const existing=(snapshot.quotes||[]).find(row=>rowId(row,'Quote ID','quoteId')===quote.quoteId);
      if(existing){preserved.push(quote.quoteId);continue;}
      mark(`OFFICE_SAVE_QUOTE_${quote.key.toUpperCase()}`,{quoteId:quote.quoteId});
      const result=await officeRequest(page,'saveQuote',{businessId,quoteId:quote.quoteId,quoteNumber:quote.quoteNumber,customerId:genericId,projectTitle:quote.title,scope:`DEMO RECORD — NO FUNDS MOVED. Fictional website example preserved for delivery acceptance.\n\n${quote.scope}`,measurementNotes:`Approved public website example. Verify all real dimensions, site conditions, costs, taxes, utilities, permits, specifications and customer terms.\n${quote.measurements.join('\n')}`,status:config.recordPolicy.status,tax:0,lines:quote.lines.map((line,index)=>({...line,quoteLineId:`${quote.quoteId}-LINE-${String(index+1).padStart(3,'0')}`,lineType:'Demo Website Example',priceSource:'Approved public website example',priceStatus:'Owner review required'}))},120000);
      assert(result?.status==='PASS'&&result.quoteId===quote.quoteId&&closeEnough(result.total,quote.total),`New Office failed to save website quote ${quote.key}.`);created.push(quote.quoteId);
    }
    mark('OFFICE_VERIFY_SCOPED_PERSISTED_RECORDS');
    snapshot=await deliverySnapshot(page,businessId);const verified=[];
    for(const quote of config.quotes){
      const row=(snapshot.quotes||[]).find(item=>rowId(item,'Quote ID','quoteId')===quote.quoteId);assert(row,`Preserved demo quote ${quote.quoteId} is missing after refresh.`);
      assert(rowId(row,'Customer ID','customerId')===genericId,`Demo quote ${quote.key} is not tied to Generic Quote Customer.`);
      assert(value(row,'Status','status')===config.recordPolicy.status,`Demo quote ${quote.key} is not owner-review status.`);
      assert(closeEnough(value(row,'Total','total'),quote.total),`Demo quote ${quote.key} total does not reproduce the website result.`);
      const lines=Array.isArray(row.lines)?row.lines:[];assert(lines.length===quote.lines.length,`Demo quote ${quote.key} does not reproduce the website itemization.`);
      assert(closeEnough(lines.reduce((sum,line)=>sum+Number(value(line,'Quantity','quantity')||0)*Number(value(line,'Unit Price','unitPrice')||0),0),quote.total),`Demo quote ${quote.key} line calculation failed in the new Office.`);
      verified.push({key:quote.key,quoteId:quote.quoteId,total:quote.total,lineCount:lines.length});
    }
    writeJson('persisted-records-result.json',{status:'PASS',businessId,genericId,created,preserved,verified,snapshotAttempt:snapshot.attempt});
    mark('OFFICE_RENDER_QUOTE_LIST_FROM_SCOPED_SNAPSHOT');
    await applyDeliverySnapshot(page,businessId,snapshot);
    await page.locator('#quoteCustomer').waitFor({state:'visible',timeout:30000});
    assert(String(await page.locator('#quoteCustomer option:checked').textContent()).trim()==='Generic Quote Customer','New quote did not automatically select Generic Quote Customer.');
    const visibleIds=await page.locator('[data-open-quote]').evaluateAll(buttons=>buttons.map(button=>button.getAttribute('data-open-quote')));
    for(const quote of config.quotes)assert(visibleIds.includes(quote.quoteId),`Preserved demo quote ${quote.key} is not visible in the new Office list.`);
    const pdfs=[];
    for(const quote of config.quotes){
      const opened=await openQuoteThroughUi(page,quote);
      assert(opened.lineCount===quote.lines.length,`New Office could not reopen ${quote.key} with its itemization.`);
      assert(closeEnough(numberFromMoney(opened.total),quote.total),`New Office editor total failed for ${quote.key}.`);
      mark(`OFFICE_PREVIEW_QUOTE_${quote.key.toUpperCase()}`);
      const previewButton=page.locator('#previewQuoteButton');assert(await previewButton.count()===1,`Preview / Print PDF is missing for ${quote.key}.`);await previewButton.click();
      await page.locator('#quotePreviewDocument').waitFor({state:'visible',timeout:30000});
      const preview=await page.evaluate(()=>{const root=document.getElementById('quotePreviewDocument'),image=root?.querySelector('.quote-logo');return{quoteId:root?.dataset.quoteId,demo:root?.dataset.demoRecord,title:root?.querySelector('h1')?.textContent.trim(),total:Number(String(document.getElementById('quotePreviewTotal')?.textContent||'').replace(/[^0-9.-]/g,'')),lineCount:root?.querySelectorAll('.quote-table tbody tr').length||0,logoSrc:image?.getAttribute('src')||'',logoAlt:image?.getAttribute('alt')||'',text:root?.textContent||''};});
      assert(preview.quoteId===quote.quoteId&&preview.demo==='true','Printable preview lost its preserved DEMO identity.');
      assert(preview.title===quote.title&&closeEnough(preview.total,quote.total)&&preview.lineCount===quote.lines.length,`Printable preview failed for ${quote.key}.`);
      assert(preview.logoSrc.includes(APPROVED_LOGO)&&preview.logoAlt==='Highway 38 Solutions','Printable quote is using the wrong logo.');
      assert(/DEMO RECORD — NO FUNDS MOVED/i.test(preview.text)&&/Nothing is automatically approved or sent/i.test(preview.text),'Printable quote lost its demo or owner-review boundary.');
      mark(`OFFICE_PDF_QUOTE_${quote.key.toUpperCase()}`);
      const pdfPath=path.join(outDir,`${quote.quoteNumber}-${quote.key}.pdf`);await page.emulateMedia({media:'print'});await page.pdf({path:pdfPath,format:'Letter',printBackground:true,margin:{top:'0.25in',right:'0.25in',bottom:'0.25in',left:'0.25in'}});await page.emulateMedia({media:'screen'});
      const bytes=fs.statSync(pdfPath).size;assert(bytes>10000,`Printable PDF for ${quote.key} was not produced.`);pdfs.push({key:quote.key,path:pdfPath,bytes});
      await page.locator('#backToQuoteFromPreview').click();await page.locator('#quoteTitle').waitFor({state:'visible',timeout:30000});
    }
    assert(pageErrors.length===0,`Office runtime reported errors: ${pageErrors.join(' | ')}`);
    const finalAcceptance=await officeRequest(page,'acceptanceStatus',{},90000);assert(finalAcceptance.externalActionsEnabled===false,'External actions became enabled during delivery acceptance.');
    const result={status:'PASS',businessId,genericCustomerId:genericId,created,preserved,verified,pdfs,scopedSnapshot:true,fullOfficeRefreshRepeated:false,approved:false,sent:false,fundsMoved:false,externalActionsEnabled:false};writeJson('office-delivery-result.json',result);return result;
  }finally{await page.close();activePage=null;}
}

(async()=>{
  fs.mkdirSync(outDir,{recursive:true});
  assert(deploymentArg,'Deployment URL is required.');assert(fs.existsSync(credentialsPath),'Authorized Google credential file was not found.');assert(fs.existsSync(configPath),'Website demo quote config was not found.');
  const config=JSON.parse(fs.readFileSync(configPath,'utf8'));validateConfig(config);const credentials=JSON.parse(fs.readFileSync(credentialsPath,'utf8'));const accessToken=await refreshAccessToken(credentials);
  const browser=await chromium.launch({headless:true});const context=await browser.newContext();
  await context.route('**/*',async route=>{const request=route.request();let parsed;try{parsed=new URL(request.url());}catch(error){await route.continue();return;}if(!isScriptHost(parsed.hostname)){await route.continue();return;}await route.continue({headers:{...request.headers(),authorization:`Bearer ${accessToken}`}});});
  try{
    mark('PUBLIC_WEBSITE_BEGIN');const publicWebsite=await verifyPublicWebsite(context,config);
    mark('OFFICE_DELIVERY_BEGIN');const office=await verifyOfficeDelivery(context,config);
    mark('DELIVERY_ACCEPTANCE_PASS');
    const result={status:'PASS',acceptance:'WEBSITE_TO_NEW_OFFICE_DELIVERY',sourcePage:config.sourcePage,publicWebsite,office,approvedLogo:APPROVED_LOGO,demoRecordsPreserved:true,automaticApproval:false,automaticSend:false,fundsMoved:false,finishedAt:new Date().toISOString()};writeJson('result.json',result);console.log(JSON.stringify(result,null,2));
  }catch(error){await captureFailure(error);process.exitCode=1;}
  finally{await context.close();await browser.close();}
})();
