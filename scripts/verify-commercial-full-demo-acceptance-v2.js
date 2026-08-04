#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');

const [publicArg='https://highway38solutions.com/',credentialsArg,cabinArg='commercial-beta/cabin-demo-project.json',outArg='artifacts/commercial-google-native-beta/full-demo-acceptance']=process.argv.slice(2);
const publicBase=new URL(publicArg);
const launcherUrl=new URL('/open-business-office.html',publicBase);
const credentialsPath=credentialsArg||path.join(process.env.HOME||'','.clasprc.json');
const cabinPath=path.resolve(cabinArg);
const outDir=path.resolve(outArg);
const PROJECT_KEYS=['FLOWER','DRIVE','POND','CLEAR','DECK','IRRIGATION','KITCHEN','CABIN'];
const EXPECTED_NUMBERS=['Q-DEMO-001','Q-DEMO-002','Q-DEMO-003','Q-DEMO-004','Q-DEMO-005','Q-DEMO-006','Q-DEMO-007','Q-DEMO-008'];
const EXPECTED_TOTALS=[3950,6425,9875,5950,5842,3642.5,18765,572550];
let stage='INITIALIZE';
let page=null;
const pageErrors=[];

function assert(condition,message){if(!condition)throw new Error(message);}
function value(row,...keys){for(const key of keys)if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];return'';}
function rowId(row,...keys){return String(value(row,...keys));}
function asNumber(input){return Number(String(input||'').replace(/[^0-9.-]/g,''));}
function closeEnough(a,b){return Math.abs(Number(a)-Number(b))<0.01;}
function count(snapshot,key){return Array.isArray(snapshot[key])?snapshot[key].length:0;}
function isScriptHost(hostname){return hostname==='script.google.com'||hostname==='script.googleusercontent.com'||hostname.endsWith('.script.googleusercontent.com')||hostname.endsWith('-script.googleusercontent.com');}
function isHighwayHost(hostname){return hostname==='highway38solutions.com'||hostname==='www.highway38solutions.com';}
function findByKey(object,keys,seen=new Set()){if(!object||typeof object!=='object'||seen.has(object))return'';seen.add(object);for(const [key,child] of Object.entries(object))if(keys.includes(key)&&typeof child==='string'&&child.trim())return child.trim();for(const child of Object.values(object)){const found=findByKey(child,keys,seen);if(found)return found;}return'';}
function write(name,payload){fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,name),JSON.stringify(payload,null,2)+'\n');}
function mark(next,details={}){stage=next;const event={status:'RUNNING',stage,at:new Date().toISOString(),...details};console.log(JSON.stringify(event));fs.mkdirSync(outDir,{recursive:true});fs.appendFileSync(path.join(outDir,'stages.ndjson'),JSON.stringify(event)+'\n');}
function mergeGroups(groups){const merged={};for(const group of Object.values(groups))for(const [key,item] of Object.entries(group))if(Array.isArray(item))merged[key]=item;return merged;}

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
async function clickAuthorizedOfficeButton(){
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    for(const frame of page.frames()){
      const button=frame.locator('#continueButton');
      if(!(await button.count().catch(()=>0)))continue;
      assert(await frame.locator('#approvedLogo').count()===1,'Authorized handoff is missing the approved logo.');
      if(await button.getAttribute('aria-disabled')==='false'&&await button.getAttribute('data-ready')==='true'){await button.click({timeout:15000});return;}
    }
    await page.waitForTimeout(250);
  }
  throw new Error('Secure Open Business Office button was not ready.');
}
async function officeRequest(action,args={},timeout=105000){return page.evaluate(async({action,args,timeout})=>window.H38_ACTIVE_BRIDGE.request(action,args,timeout),{action,args,timeout});}
async function retryRequest(action,args={},timeout=105000,attempts=3){
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{return await officeRequest(action,args,timeout);}catch(error){lastError=error;if(attempt<attempts)await page.waitForTimeout(attempt*2500);}
  }
  throw lastError;
}
async function applyQuoteSnapshot(businessId,snapshot){
  await page.evaluate(({businessId,customers,quotes})=>{
    if(typeof state==='undefined'||!state.snapshot)throw new Error('The Office snapshot is unavailable.');
    state.businessId=businessId;
    state.snapshot={...state.snapshot,customers,quotes};
    state.quote={quoteId:'',lines:[]};
    openPage('quotes',false);
  },{businessId,customers:snapshot.customers,quotes:snapshot.quotes});
}
async function openQuote(quote){
  const quoteId=rowId(quote,'Quote ID','quoteId');
  const title=String(value(quote,'Project Title','projectTitle'));
  const button=page.locator(`[data-open-quote="${quoteId}"]`);
  assert(await button.count()===1,`${value(quote,'Quote Number','quoteNumber')} is not visible in the Quote Builder list.`);
  await button.scrollIntoViewIfNeeded();await button.click({timeout:15000});
  await page.waitForFunction(({quoteId,title})=>{
    const officeState=typeof state==='undefined'?null:state;
    return officeState?.quote?.quoteId===quoteId&&document.getElementById('quoteTitle')?.value===title;
  },{quoteId,title},{timeout:30000});
}

(async()=>{
  fs.mkdirSync(outDir,{recursive:true});
  assert(fs.existsSync(credentialsPath),'Authorized Google credential file was not found.');
  assert(fs.existsSync(cabinPath),'Cabin demo config was not found.');
  const credentials=JSON.parse(fs.readFileSync(credentialsPath,'utf8'));
  const accessToken=await refreshAccessToken(credentials);
  const cabin=JSON.parse(fs.readFileSync(cabinPath,'utf8'));
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:412,height:915}});
  page=await context.newPage();
  page.on('pageerror',error=>pageErrors.push(error.message));
  await context.route('**/*',async route=>{
    const request=route.request();let parsed;
    try{parsed=new URL(request.url());}catch(error){await route.continue();return;}
    if(!isScriptHost(parsed.hostname)){await route.continue();return;}
    await route.continue({headers:{...request.headers(),authorization:`Bearer ${accessToken}`}});
  });
  try{
    mark('LAUNCH');
    const target=new URL(launcherUrl);target.searchParams.set('fullDemoAcceptance',String(Date.now()));
    await page.goto(target.toString(),{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForURL(url=>{try{return isScriptHost(new URL(url).hostname);}catch(error){return false;}},{timeout:60000});
    mark('AUTHORIZED_HANDOFF');await clickAuthorizedOfficeButton();
    await page.waitForURL(url=>{try{const parsed=new URL(url);return isHighwayHost(parsed.hostname)&&parsed.pathname.includes('/commercial-app/');}catch(error){return false;}},{timeout:90000});
    mark('OFFICE_READY');
    await page.waitForFunction(()=>/Office open|latest records loaded/i.test(document.getElementById('businessStatus')?.textContent||'')&&!!window.H38_ACTIVE_BRIDGE?.ready,undefined,{timeout:180000,polling:250});
    const businessId=await page.locator('#businessSelect').inputValue();assert(businessId,'No business was selected.');

    const seedEvidence={coreProjects:[],corePackages:[],catalog:[],operations:[],finance:[]};
    for(const projectKey of PROJECT_KEYS){
      mark(`SEED_CORE_${projectKey}`);
      const result=await retryRequest('seedFullDemoBatch',{businessId,phase:'core',projectKey});
      assert(result.status==='PASS'&&result.core?.projects===1&&result.core?.quotes===1,`Core project batch ${projectKey} failed.`);
      assert(result.approved===false&&result.sent===false&&result.externalActionsEnabled===false,`Core project batch ${projectKey} crossed a safety boundary.`);
      seedEvidence.coreProjects.push(result);write(`seed-core-${projectKey.toLowerCase()}.json`,result);
    }
    for(let start=0;start<21;start+=3){
      mark(`SEED_CORE_PACKAGES_${String(start+1).padStart(2,'0')}`,{start,count:3});
      const result=await retryRequest('seedFullDemoBatch',{businessId,phase:'core-packages',start,count:3});
      assert(result.status==='PASS'&&result.core?.quotes===Math.min(3,21-start),'Cabin package batch failed.');
      assert(result.sent===false&&result.externalActionsEnabled===false,'Cabin package batch crossed a safety boundary.');
      seedEvidence.corePackages.push(result);write(`seed-core-packages-${start+1}.json`,result);
    }
    for(const phase of ['catalog','operations','finance'])for(const projectKey of PROJECT_KEYS){
      mark(`SEED_${phase.toUpperCase()}_${projectKey}`);
      const result=await retryRequest('seedFullDemoBatch',{businessId,phase,projectKey});
      assert(result.status==='PASS',`${phase} project batch ${projectKey} failed.`);
      assert(result.approved===false&&result.sent===false&&result.published===false&&result.fundsMoved===false&&result.externalActionsEnabled===false,`${phase} project batch ${projectKey} crossed a safety boundary.`);
      seedEvidence[phase].push(result);write(`seed-${phase}-${projectKey.toLowerCase()}.json`,result);
    }
    mark('SEED_EXTRAS');
    const extras=await retryRequest('seedFullDemoExtras',{businessId});
    assert(extras.status==='PASS'&&extras.externalActionsEnabled===false&&extras.fundsMoved===false,'Full demo extras failed.');
    seedEvidence.extras=extras;write('seed-extras.json',extras);write('seed-summary.json',seedEvidence);

    const groups={};
    for(const group of ['projects','quotes','communications','catalog','assets','finance','social']){
      mark(`LOAD_${group.toUpperCase()}_SNAPSHOT`);
      const result=await retryRequest('fullDemoAcceptanceSnapshot',{businessId,group});
      assert(result.status==='PASS'&&result.readOnly===true&&result.externalActionsEnabled===false,`Scoped ${group} snapshot failed.`);
      groups[group]=result;
      write(`snapshot-${group}.json`,Object.fromEntries(Object.entries(result).map(([key,item])=>[key,Array.isArray(item)?item.length:item])));
    }
    const snapshot=mergeGroups(groups);
    write('snapshot-counts.json',Object.fromEntries(Object.entries(snapshot).map(([key,item])=>[key,item.length])));

    const generic=(snapshot.customers||[]).find(row=>String(value(row,'Customer Name','name')).trim()==='Generic Quote Customer');assert(generic,'Generic Quote Customer is missing.');
    const masters=EXPECTED_NUMBERS.map(numberValue=>{const matches=(snapshot.quotes||[]).filter(row=>String(value(row,'Quote Number','quoteNumber'))===numberValue);assert(matches.length===1,`${numberValue} must have exactly one canonical master quote; found ${matches.length}.`);return matches[0];});
    masters.forEach((row,index)=>{assert(closeEnough(value(row,'Total','total'),EXPECTED_TOTALS[index]),`${EXPECTED_NUMBERS[index]} total is wrong.`);assert(Array.isArray(row.lines)&&row.lines.length>0,`${EXPECTED_NUMBERS[index]} has no current-revision lines.`);assert(/DEMO/i.test(String(value(row,'Status','status'))),`${EXPECTED_NUMBERS[index]} is not marked DEMO.`);});
    const cabinPackages=(snapshot.quotes||[]).filter(row=>String(value(row,'Quote Number','quoteNumber')).startsWith('Q-DEMO-008-'));
    assert(cabinPackages.length===21,`Expected 21 cabin sub-quotes; found ${cabinPackages.length}.`);
    assert(closeEnough(cabinPackages.reduce((sum,row)=>sum+asNumber(value(row,'Total','total')),0),cabin.directSubtotal),'Cabin package subtotal does not reconcile.');

    const demoJobs=(snapshot.jobs||[]).filter(row=>/^JOB-Q-DEMO-00[1-8]$/.test(String(value(row,'Job Number','jobNumber'))));
    assert(demoJobs.length===8,`Expected eight demo jobs; found ${demoJobs.length}.`);
    const demoTasks=(snapshot.tasks||[]).filter(row=>demoJobs.some(job=>rowId(job,'Job ID','jobId')===rowId(row,'Job ID','jobId')));
    assert(demoTasks.length===16,`Expected 16 quote-created demo tasks; found ${demoTasks.length}.`);
    for(const job of demoJobs){const linked=demoTasks.filter(task=>rowId(task,'Job ID','jobId')===rowId(job,'Job ID','jobId'));assert(linked.length===2,`${value(job,'Job Number','jobNumber')} does not have exactly two quote workflow tasks.`);assert(linked.every(task=>rowId(task,'Assigned User ID','assignedUserId')),'A quote workflow task is unassigned.');}
    const quoteWorkflow=(snapshot.workflows||[]).find(row=>String(value(row,'Workflow Key','workflowKey'))==='demo-quote-cad-ai');assert(quoteWorkflow&&String(value(quoteWorkflow,'Record Type','recordType'))==='Quote','Quote-to-task workflow is missing.');
    const workflowSteps=(snapshot.workflowSteps||[]).filter(row=>rowId(row,'Workflow ID','workflowId')===rowId(quoteWorkflow,'Workflow ID','workflowId')).sort((a,b)=>asNumber(value(a,'Step Number'))-asNumber(value(b,'Step Number')));
    assert(workflowSteps.length===4,'Quote-to-task workflow must contain four steps.');
    assert(workflowSteps.some(row=>/Search Price Catalog first/i.test(String(value(row,'Label','label')))),'Quote workflow lost the Price Catalog-first step.');
    assert(workflowSteps.some(row=>/Owner approves before sending/i.test(String(value(row,'Label','label')))&&String(value(row,'Owner Approval Required','ownerApprovalRequired'))==='Yes'),'Quote workflow lost its owner approval gate.');
    write('task-workflow-result.json',{status:'PASS',jobs:demoJobs.length,tasks:demoTasks.length,tasksPerJob:2,assigned:true,workflowSteps:workflowSteps.map(row=>value(row,'Label','label')),automaticSend:false});

    const emailThreads=(snapshot.emailThreads||[]).filter(row=>/\[DEMO\]/i.test(String(value(row,'Subject','subject'))));
    const emailMessages=(snapshot.emailMessages||[]).filter(row=>String(value(row,'Status','status'))==='Draft Demo');
    assert(emailThreads.length>=8&&emailMessages.length>=8,'Eight draft email examples were not populated.');
    assert(emailThreads.every(row=>String(value(row,'Mailbox','mailbox'))==='Drafts'&&String(value(row,'Status','status'))==='Draft Demo'),'A demo email thread is not draft-only.');
    assert(emailMessages.every(row=>String(value(row,'Direction','direction'))==='Draft'&&/example\.invalid/.test(String(value(row,'To Addresses JSON','toAddressesJson')))),'A demo email message is not safely addressed as a draft.');
    write('email-demo-result.json',{status:'PASS',threads:emailThreads.length,messages:emailMessages.length,draftOnly:true,automaticSend:false,proofSendAuthorizedRecipient:'rkrueth@gmail.com'});

    const cadDocuments=(snapshot.documents||[]).filter(row=>/\.(dxf|dwg|dwt|dws)$/i.test(String(value(row,'File Name','fileName')))||/CAD/i.test(String(value(row,'Source Type','sourceType'))));
    assert(cadDocuments.length>=10,`Expected at least 10 CAD documents; found ${cadDocuments.length}.`);
    assert(cadDocuments.every(row=>value(row,'File ID','fileId')),'A CAD document is missing its Drive file ID.');
    for(const name of ['CABIN-FLOOR-PLAN.dxf','CABIN-SITE-PLAN.dxf','CABIN-SLAB-PLAN.dxf'])assert(cadDocuments.some(row=>String(value(row,'File Name','fileName')).includes(name)),`${name} is missing.`);

    const required={customers:1,contacts:8,properties:8,requests:8,jobs:8,workOrders:8,tasks:16,scheduleEvents:8,timeEntries:8,jobNotes:8,quotes:29,measurements:16,measurementPoints:16,priceBook:62,inventoryTransactions:8,materialRequests:8,assets:1,assignments:1,maintenance:1,inspections:1,vehicles:1,usageLogs:1,invoices:8,invoiceLines:8,payments:8,expenses:8,documents:10,attachments:10,conversations:8,messages:8,emailThreads:8,emailMessages:8,smsThreads:8,smsMessages:8,portalThreads:8,portalMessages:8,workflows:1,workflowSteps:4,aiConversations:8,aiMessages:16,socialAccounts:1,socialPosts:8,socialMetrics:8,campaigns:8,voiceQueue:8,actionQueue:8,notifications:8,employees:1,vendors:1,purchaseOrders:8,accountingPeriods:1,payrollPeriods:1,payrollLines:1,payrollDeductions:1,taxPeriods:1,missingDocuments:1,approvals:8,proofLog:8,backups:1,reports:1};
    const counts={};for(const [key,min] of Object.entries(required)){counts[key]=count(snapshot,key);assert(counts[key]>=min,`${key} expected at least ${min}; found ${counts[key]}.`);}write('module-counts.json',{status:'PASS',counts,required});

    mark('VERIFY_UI_CONTROLS');
    await applyQuoteSnapshot(businessId,groups.quotes);
    await page.locator('#h38AiQuoteDraftButton').waitFor({state:'visible',timeout:30000});
    assert(await page.locator('#h38CadButton').count()===1,'Quote Builder CAD button is missing.');
    await page.locator('#quoteMeasureButton').click();await page.locator('#h38AiMeasurePanel').waitFor({state:'visible',timeout:30000});
    assert(await page.locator('#h38AiMeasureButton').count()===1&&await page.locator('#h38MeasureCadButton').count()===1,'AI/CAD measurement controls are missing.');

    mark('VERIFY_AI_QUOTE');
    const flower=masters[0];
    const aiQuote=await retryRequest('aiBuildQuoteDraft',{businessId,customerId:rowId(generic,'Customer ID','customerId'),quoteId:rowId(flower,'Quote ID','quoteId'),projectTitle:value(flower,'Project Title','projectTitle'),scope:value(flower,'Scope','scope'),measurementNotes:value(flower,'Measurement Notes','measurementNotes'),notes:'Acceptance: Price Catalog first; use linked CAD and photos only when available.'});
    assert(aiQuote.status==='PASS'&&aiQuote.priceBookSearchedFirst===true&&aiQuote.ownerReviewRequired===true&&aiQuote.automaticApproval===false&&aiQuote.automaticSend===false,'AI Quote Builder safety or Price Catalog-first contract failed.');
    assert(Array.isArray(aiQuote.draft?.suggestedLines)&&aiQuote.draft.suggestedLines.length>0,'AI Quote Builder returned no suggested lines.');write('ai-quote-result.json',aiQuote);

    mark('VERIFY_AI_MEASURE');
    const cabinMaster=masters[7];
    const aiMeasure=await retryRequest('aiMeasurePhoto',{businessId,quoteId:rowId(cabinMaster,'Quote ID','quoteId'),measurementName:'Cabin front wall width',measurementType:'Length',referenceSize:48,referenceUnit:'ft',imageUrl:'https://highway38solutions.com/assets/demo-workthroughs/cabin-plan-sheet.png?v=20260722-approved',notes:'Use the dimensioned demo plan as the visible reference. This remains a verification-required estimate.'});
    assert(['PASS','HOLD'].includes(aiMeasure.status),'AI measure returned an unsupported status.');
    assert(aiMeasure.ownerReviewRequired===true||aiMeasure.fieldVerificationRequired===true,'AI measure lost its verification boundary.');
    if(aiMeasure.status==='PASS')assert(aiMeasure.confidence==='Needs verification'&&aiMeasure.fieldVerificationRequired===true,'AI measurement was incorrectly treated as verified.');write('ai-measure-result.json',aiMeasure);

    mark('GENERATE_CABIN_PDFS');
    await applyQuoteSnapshot(businessId,groups.quotes);
    await page.locator('#quoteCustomer').waitFor({state:'visible',timeout:30000});
    const cabinQuotes=[cabinMaster,...cabinPackages.sort((a,b)=>String(value(a,'Quote Number','quoteNumber')).localeCompare(String(value(b,'Quote Number','quoteNumber'))))];
    const pdfs=[];
    for(const quote of cabinQuotes){
      const quoteNumber=String(value(quote,'Quote Number','quoteNumber'));await openQuote(quote);
      const preview=page.locator('#previewQuoteButton');assert(await preview.count()===1,`${quoteNumber} preview control is missing.`);await preview.click();
      await page.locator('#quotePreviewDocument').waitFor({state:'visible',timeout:30000});
      const logoSrc=await page.locator('#quotePreviewDocument .quote-logo').getAttribute('src');assert(String(logoSrc).includes('highway38-logo.png?v=20260720-exact-0cbc4514'),`${quoteNumber} PDF preview has the wrong logo.`);
      const fileName=`${quoteNumber.replace(/[^A-Za-z0-9-]/g,'-')}.pdf`,pdfPath=path.join(outDir,fileName);
      await page.emulateMedia({media:'print'});await page.pdf({path:pdfPath,format:'Letter',printBackground:true,margin:{top:'0.25in',right:'0.25in',bottom:'0.25in',left:'0.25in'}});await page.emulateMedia({media:'screen'});
      const bytes=fs.statSync(pdfPath).size;assert(bytes>10000,`${quoteNumber} PDF is too small.`);pdfs.push({quoteNumber,quoteId:rowId(quote,'Quote ID','quoteId'),fileName,bytes});
      await page.locator('#backToQuoteFromPreview').click();await page.locator('#quoteTitle').waitFor({state:'visible',timeout:30000});
    }
    assert(pdfs.length===22,'Cabin master plus 21 package PDFs were not generated.');write('cabin-pdfs.json',{status:'PASS',count:pdfs.length,pdfs});

    const finalStatus=await retryRequest('acceptanceStatus',{},90000);
    assert(finalStatus.externalActionsEnabled===false&&finalStatus.productionDataMigrated===false,'Final platform safety status failed.');
    assert(pageErrors.length===0,`Browser runtime errors: ${pageErrors.join(' | ')}`);
    const result={status:'PASS',acceptance:'FULL_EIGHT_EXAMPLE_OFFICE_DELIVERY',businessId,examples:8,cabinSubQuotes:21,cabinPdfs:22,cadDocuments:cadDocuments.length,priceCatalogItems:counts.priceBook,assignedTasks:demoTasks.length,quoteWorkflowSteps:workflowSteps.length,emailDrafts:emailMessages.length,proofEmailAuthorizedRecipient:'rkrueth@gmail.com',proofEmailSentByAcceptance:false,moduleCounts:counts,aiQuoteProvider:aiQuote.provider,aiMeasureStatus:aiMeasure.status,demoRecordsPreserved:true,approved:false,sent:false,published:false,fundsMoved:false,externalActionsEnabled:false,productionDataMigrated:false,finishedAt:new Date().toISOString()};
    write('result.json',result);console.log(JSON.stringify(result,null,2));
  }catch(error){
    const state=page?await page.evaluate(()=>{const officeState=typeof state==='undefined'?null:state;return{url:location.href,page:officeState?.page||'',quoteId:officeState?.quote?.quoteId||'',businessStatus:document.getElementById('businessStatus')?.textContent||'',body:(document.body?.innerText||'').slice(0,5000)};}).catch(()=>({url:page.url()})):{url:''};
    const failure={status:'FAIL',acceptance:'FULL_EIGHT_EXAMPLE_OFFICE_DELIVERY',stage,error:error.message,stack:error.stack||'',state,pageErrors,finishedAt:new Date().toISOString()};write('failure.json',failure);
    if(page){await page.screenshot({path:path.join(outDir,'failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(outDir,'failure.html'),await page.content().catch(()=>''));}
    console.error(JSON.stringify(failure,null,2));process.exitCode=1;
  }finally{await context.close();await browser.close();}
})();
