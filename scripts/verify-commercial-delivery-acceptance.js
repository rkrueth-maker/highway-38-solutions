#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');

const APPROVED_LOGO='highway38-logo.png?v=20260720-exact-0cbc4514';
const GATEWAY_HOST='jqukmwtsgcsaruucnqja.supabase.co';
const [publicArg='https://highway38solutions.com/',deploymentArg,credentialsArg,configArg='commercial-beta/website-demo-quotes.json',outArg='artifacts/commercial-google-native-beta/delivery-acceptance']=process.argv.slice(2);
const publicBase=new URL(publicArg);
const launcherUrl=new URL('/open-business-office.html',publicBase);
const credentialsPath=credentialsArg||path.join(process.env.HOME||'','.clasprc.json');
const configPath=path.resolve(configArg);
const outDir=path.resolve(outArg);

function assert(condition,message){if(!condition)throw new Error(message);}
function value(row,...keys){for(const key of keys)if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];return'';}
function rowId(row,...keys){return String(value(row,...keys));}
function numberFromMoney(text){return Number(String(text||'').replace(/[^0-9.-]/g,''));}
function closeEnough(a,b){return Math.abs(Number(a)-Number(b))<0.01;}
function isScriptHost(hostname){return hostname==='script.google.com'||hostname==='script.googleusercontent.com'||hostname.endsWith('.script.googleusercontent.com')||hostname.endsWith('-script.googleusercontent.com');}
function isHighwayHost(hostname){return hostname==='highway38solutions.com'||hostname==='www.highway38solutions.com';}
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
  assert(Array.isArray(config.quotes)&&config.quotes.length===7,'Exactly seven approved website quote examples are required.');
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
async function verifyPublicWebsite(context,config){
  const page=await context.newPage();
  const results=[];
  try{
    for(const quote of config.quotes){
      const url=new URL('/contractor-quote-complete.html',publicBase);url.searchParams.set('example',quote.key);
      await page.goto(url.toString(),{waitUntil:'domcontentloaded',timeout:45000});
      await page.waitForFunction(expected=>document.getElementById('title')?.textContent.trim()===expected,quote.publicTitle,{timeout:30000});
      const publicResult=await page.evaluate(({title,total,lineCount,logo})=>{
        const money=text=>Number(String(text||'').replace(/[^0-9.-]/g,''));
        const brand=document.querySelector('header .brand img');
        return{
          title:(document.getElementById('title')?.textContent||'').trim(),
          base:money(document.getElementById('base')?.textContent),
          tableTotal:money(document.getElementById('tableTotal')?.textContent),
          lineCount:document.querySelectorAll('#items tr').length,
          logoSrc:brand?.getAttribute('src')||'',
          logoAlt:brand?.getAttribute('alt')||'',
          expected:{title,total,lineCount,logo}
        };
      },{title:quote.publicTitle,total:quote.total,lineCount:quote.lines.length,logo:APPROVED_LOGO});
      assert(publicResult.title===quote.publicTitle,`Public quote ${quote.key} title changed.`);
      assert(closeEnough(publicResult.base,quote.total)&&closeEnough(publicResult.tableTotal,quote.total),`Public quote ${quote.key} no longer calculates the advertised total.`);
      assert(publicResult.lineCount===quote.lines.length,`Public quote ${quote.key} line count changed.`);
      assert(publicResult.logoSrc.includes('assets/highway38-logo.png')&&publicResult.logoAlt==='Highway 38 Solutions',`Public quote ${quote.key} is not using the approved logo.`);
      results.push({key:quote.key,status:'PASS',total:publicResult.tableTotal,lineCount:publicResult.lineCount});
    }
    const demoUrl=new URL('/quote-builder-demo.html',publicBase);
    await page.goto(demoUrl.toString(),{waitUntil:'domcontentloaded',timeout:45000});
    const presetButtons=page.locator('[data-preset]');
    assert(await presetButtons.count()===3,'The public interactive Quote Builder must retain all three advertised presets.');
    for(const preset of ['landscape','drainage','seasonal']){
      const button=page.locator(`[data-preset="${preset}"]`);await button.click();
      await page.waitForFunction(key=>document.querySelector(`[data-preset="${key}"]`)?.getAttribute('aria-pressed')==='true',preset);
      const rows=await page.locator('#lineRows tr, .line-table tbody tr').count();
      const totalText=await page.locator('.total-row.grand').last().textContent().catch(()=>'');
      assert(rows>0&&numberFromMoney(totalText)>0,`Public interactive preset ${preset} did not produce a quote.`);
      const previewText=await page.locator('.quote-paper').textContent();
      assert(!/Internal markup percentage/i.test(previewText),`Public interactive preset ${preset} exposed internal markup.`);
    }
    return{status:'PASS',quotes:results,interactivePresets:3};
  }finally{await page.close();}
}
async function clickAuthorizedOfficeButton(page){
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    for(const frame of page.frames()){
      const button=frame.locator('#continueButton');
      if(!(await button.count().catch(()=>0)))continue;
      const logo=frame.locator('#approvedLogo');
      assert(await logo.count()===1,'Authorized Google handoff page is missing the approved Highway 38 logo.');
      const logoSrc=await logo.getAttribute('src');const logoAlt=await logo.getAttribute('alt');
      assert(String(logoSrc).includes(APPROVED_LOGO)&&logoAlt==='Highway 38 Solutions','Authorized Google handoff page is using the wrong logo.');
      const disabled=await button.getAttribute('aria-disabled').catch(()=>'true');
      const ready=await button.getAttribute('data-ready').catch(()=>'');
      if(disabled==='false'&&ready==='true'){await button.click({timeout:15000});return;}
    }
    await page.waitForTimeout(250);
  }
  throw new Error('The authorized Google page did not present the secure Open Business Office button.');
}
async function officeRequest(page,action,args={},timeout=120000){return page.evaluate(async({action,args,timeout})=>window.H38_ACTIVE_BRIDGE.request(action,args,timeout),{action,args,timeout});}
async function verifyOfficeDelivery(context,accessToken,config){
  const page=await context.newPage();
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  const target=new URL(launcherUrl);target.searchParams.set('deliveryAcceptance','1');
  await page.goto(target.toString(),{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForURL(url=>{try{return isScriptHost(new URL(url).hostname);}catch(error){return false;}},{timeout:60000});
  await clickAuthorizedOfficeButton(page);
  await page.waitForURL(url=>{try{const parsed=new URL(url);return isHighwayHost(parsed.hostname)&&parsed.pathname.includes('/commercial-app/');}catch(error){return false;}},{timeout:90000});
  await page.waitForFunction(()=>/Office open|latest records loaded/i.test(document.getElementById('businessStatus')?.textContent||'')&&!!window.H38_ACTIVE_BRIDGE?.ready,{timeout:120000,polling:250});
  const officeLogo=page.locator('#approvedOfficeLogo');
  assert(await officeLogo.count()===1,'The new Office header is missing the approved Highway 38 logo.');
  assert(String(await officeLogo.getAttribute('src')).includes(APPROVED_LOGO)&&await officeLogo.getAttribute('alt')==='Highway 38 Solutions','The new Office header is using the wrong logo.');
  const acceptance=await officeRequest(page,'acceptanceStatus',{},90000);
  assert(acceptance.status==='PASS'&&acceptance.readOnly===true&&acceptance.externalActionsEnabled===false,'Office safety acceptance failed before quote delivery testing.');
  const businessId=await page.locator('#businessSelect').inputValue();
  assert(businessId,'The new Office did not select a business.');
  let snapshot=await officeRequest(page,'completionBootstrap',{businessId});
  const generic=(snapshot.customers||[]).find(row=>String(value(row,'Customer Name','name')).trim()==='Generic Quote Customer');
  assert(generic,'Generic Quote Customer was not found.');
  const genericId=rowId(generic,'Customer ID','customerId');
  const created=[];const preserved=[];
  for(const quote of config.quotes){
    const existing=(snapshot.quotes||[]).find(row=>rowId(row,'Quote ID','quoteId')===quote.quoteId);
    if(existing){preserved.push(quote.quoteId);continue;}
    const result=await officeRequest(page,'saveQuote',{
      businessId,
      quoteId:quote.quoteId,
      quoteNumber:quote.quoteNumber,
      customerId:genericId,
      projectTitle:quote.title,
      scope:`DEMO RECORD — NO FUNDS MOVED. Fictional website example preserved for delivery acceptance.\n\n${quote.scope}`,
      measurementNotes:`Approved public website example. Verify all real dimensions, site conditions, costs, taxes, utilities, permits, specifications and customer terms.\n${quote.measurements.join('\n')}`,
      status:config.recordPolicy.status,
      tax:0,
      lines:quote.lines.map((line,index)=>({...line,quoteLineId:`${quote.quoteId}-LINE-${String(index+1).padStart(3,'0')}`,lineType:'Demo Website Example',priceSource:'Approved public website example',priceStatus:'Owner review required'}))
    },120000);
    assert(result&&result.status==='PASS'&&result.quoteId===quote.quoteId&&closeEnough(result.total,quote.total),`New Office failed to save website quote ${quote.key}.`);
    created.push(quote.quoteId);
  }
  snapshot=await officeRequest(page,'completionBootstrap',{businessId},120000);
  const verified=[];
  for(const quote of config.quotes){
    const row=(snapshot.quotes||[]).find(item=>rowId(item,'Quote ID','quoteId')===quote.quoteId);
    assert(row,`Preserved demo quote ${quote.quoteId} is missing after refresh.`);
    assert(rowId(row,'Customer ID','customerId')===genericId,`Demo quote ${quote.key} is not tied to Generic Quote Customer.`);
    assert(value(row,'Status','status')===config.recordPolicy.status,`Demo quote ${quote.key} is not owner-review status.`);
    assert(closeEnough(value(row,'Total','total'),quote.total),`Demo quote ${quote.key} total does not reproduce the website result.`);
    const lines=Array.isArray(row.lines)?row.lines:[];
    assert(lines.length===quote.lines.length,`Demo quote ${quote.key} does not reproduce the website itemization.`);
    const lineTotal=lines.reduce((sum,line)=>sum+Number(value(line,'Quantity','quantity')||0)*Number(value(line,'Unit Price','unitPrice')||0),0);
    assert(closeEnough(lineTotal,quote.total),`Demo quote ${quote.key} line calculation failed in the new Office.`);
    verified.push({key:quote.key,quoteId:quote.quoteId,total:quote.total,lineCount:lines.length});
  }
  await page.evaluate(async id=>{await loadBusiness(id,true);openPage('quotes',false);},businessId);
  await page.waitForSelector('#quoteCustomer',{timeout:60000});
  const selectedCustomer=await page.locator('#quoteCustomer option:checked').textContent();
  assert(String(selectedCustomer).trim()==='Generic Quote Customer','New quote did not automatically select Generic Quote Customer.');
  const pdfs=[];
  for(const quote of config.quotes){
    await page.locator(`[data-open-quote="${quote.quoteId}"]`).click();
    await page.waitForFunction(expected=>document.getElementById('quoteTitle')?.value===expected,quote.title,{timeout:30000});
    assert(await page.locator('#quoteLines .row').count()===quote.lines.length,`New Office could not reopen ${quote.key} with its itemization.`);
    assert(closeEnough(numberFromMoney(await page.locator('#quoteTotal').textContent()),quote.total),`New Office editor total failed for ${quote.key}.`);
    await page.locator('#previewQuoteButton').click();
    await page.waitForSelector('#quotePreviewDocument',{timeout:30000});
    const preview=await page.evaluate(({quoteId,title,total,lineCount,logo})=>{
      const root=document.getElementById('quotePreviewDocument'),image=root?.querySelector('.quote-logo');
      return{quoteId:root?.dataset.quoteId,demo:root?.dataset.demoRecord,title:root?.querySelector('h1')?.textContent.trim(),total:Number(String(document.getElementById('quotePreviewTotal')?.textContent||'').replace(/[^0-9.-]/g,'')),lineCount:root?.querySelectorAll('.quote-table tbody tr').length||0,logoSrc:image?.getAttribute('src')||'',logoAlt:image?.getAttribute('alt')||'',text:root?.textContent||'',expected:{quoteId,title,total,lineCount,logo}};
    },{quoteId:quote.quoteId,title:quote.title,total:quote.total,lineCount:quote.lines.length,logo:APPROVED_LOGO});
    assert(preview.quoteId===quote.quoteId&&preview.demo==='true','Printable preview lost its preserved DEMO identity.');
    assert(preview.title===quote.title&&closeEnough(preview.total,quote.total)&&preview.lineCount===quote.lines.length,`Printable preview failed for ${quote.key}.`);
    assert(preview.logoSrc.includes(APPROVED_LOGO)&&preview.logoAlt==='Highway 38 Solutions','Printable quote is using the wrong logo.');
    assert(/DEMO RECORD — NO FUNDS MOVED/i.test(preview.text)&&/Nothing is automatically approved or sent/i.test(preview.text),'Printable quote lost its demo or owner-review boundary.');
    const pdfPath=path.join(outDir,`${quote.quoteNumber}-${quote.key}.pdf`);
    await page.emulateMedia({media:'print'});await page.pdf({path:pdfPath,format:'Letter',printBackground:true,margin:{top:'0.25in',right:'0.25in',bottom:'0.25in',left:'0.25in'}});await page.emulateMedia({media:'screen'});
    const bytes=fs.statSync(pdfPath).size;assert(bytes>10000,`Printable PDF for ${quote.key} was not produced.`);pdfs.push({key:quote.key,path:pdfPath,bytes});
    await page.locator('#backToQuoteFromPreview').click();await page.waitForSelector('#quoteTitle');
  }
  assert(pageErrors.length===0,`Office runtime reported errors: ${pageErrors.join(' | ')}`);
  const finalAcceptance=await officeRequest(page,'acceptanceStatus',{},90000);
  assert(finalAcceptance.externalActionsEnabled===false,'External actions became enabled during delivery acceptance.');
  await page.close();
  return{status:'PASS',businessId,genericCustomerId:genericId,created,preserved,verified,pdfs,approved:false,sent:false,fundsMoved:false,externalActionsEnabled:false};
}

(async()=>{
  fs.mkdirSync(outDir,{recursive:true});
  assert(deploymentArg,'Deployment URL is required.');
  assert(fs.existsSync(credentialsPath),'Authorized Google credential file was not found.');
  assert(fs.existsSync(configPath),'Website demo quote config was not found.');
  const config=JSON.parse(fs.readFileSync(configPath,'utf8'));validateConfig(config);
  const credentials=JSON.parse(fs.readFileSync(credentialsPath,'utf8'));const accessToken=await refreshAccessToken(credentials);
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext();
  await context.route('**/*',async route=>{const request=route.request();let parsed;try{parsed=new URL(request.url());}catch(error){await route.continue();return;}if(!isScriptHost(parsed.hostname)){await route.continue();return;}await route.continue({headers:{...request.headers(),authorization:`Bearer ${accessToken}`}});});
  try{
    const publicWebsite=await verifyPublicWebsite(context,config);
    const office=await verifyOfficeDelivery(context,accessToken,config);
    const result={status:'PASS',acceptance:'WEBSITE_TO_NEW_OFFICE_DELIVERY',sourcePage:config.sourcePage,publicWebsite,office,approvedLogo:APPROVED_LOGO,demoRecordsPreserved:true,automaticApproval:false,automaticSend:false,fundsMoved:false,finishedAt:new Date().toISOString()};
    fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result,null,2));
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(JSON.stringify({status:'FAIL',acceptance:'WEBSITE_TO_NEW_OFFICE_DELIVERY',error:error.message},null,2));process.exitCode=1;});
