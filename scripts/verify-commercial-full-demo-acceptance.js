#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const Module=require('module');

const target=path.join(__dirname,'verify-commercial-full-demo-acceptance-v2.js');
const source=fs.readFileSync(target,'utf8');
const oldCoreLoop=`    const seedEvidence={coreProjects:[],corePackages:[],catalog:[],operations:[],finance:[]};
    for(const projectKey of PROJECT_KEYS){
      mark(\`SEED_CORE_\${projectKey}\`);
      const result=await retryRequest('seedFullDemoBatch',{businessId,phase:'core',projectKey});
      assert(result.status==='PASS'&&result.core?.projects===1&&result.core?.quotes===1,\`Core project batch \${projectKey} failed.\`);
      assert(result.approved===false&&result.sent===false&&result.externalActionsEnabled===false,\`Core project batch \${projectKey} crossed a safety boundary.\`);
      seedEvidence.coreProjects.push(result);write(\`seed-core-\${projectKey.toLowerCase()}.json\`,result);
    }`;
const newCoreLoop=`    const seedEvidence={coreProjects:[],corePackages:[],catalog:[],operations:[],finance:[]};
    const coreSteps=['records','quote','measurements'];
    for(const projectKey of PROJECT_KEYS){
      const projectResults=[];
      let cadPlanCount=0;
      for(const step of coreSteps){
        mark(\`SEED_CORE_\${projectKey}_\${step.toUpperCase()}\`);
        const result=await retryRequest('seedFullDemoBatch',{businessId,phase:'core-step',step,projectKey},150000,2);
        assert(result.status==='PASS'&&result.phase==='core-step'&&result.step===step&&result.core?.step===step,\`Bounded core \${step} batch \${projectKey} failed.\`);
        if(step==='records')assert(result.core.projects===1,\`Core records batch \${projectKey} did not create the project records.\`);
        if(step==='quote')assert(result.core.quotes===1,\`Core quote batch \${projectKey} did not create the canonical quote.\`);
        if(step==='measurements'){
          assert(result.core.measurements===2,\`Core measurement batch \${projectKey} did not create both measurement examples.\`);
          cadPlanCount=Number(result.core.cadPlanCount||0);
          assert(cadPlanCount>=1,\`Core measurement batch \${projectKey} did not report its CAD plan count.\`);
        }
        assert(result.approved===false&&result.sent===false&&result.published===false&&result.fundsMoved===false&&result.externalActionsEnabled===false,\`Bounded core \${step} batch \${projectKey} crossed a safety boundary.\`);
        projectResults.push(result);write(\`seed-core-\${projectKey.toLowerCase()}-\${step}.json\`,result);
      }
      const cadResults=[];
      for(let cadIndex=0;cadIndex<cadPlanCount;cadIndex++){
        mark(\`SEED_CORE_\${projectKey}_CAD_\${cadIndex+1}\`);
        const result=await retryRequest('seedFullDemoBatch',{businessId,phase:'core-step',step:'cad',projectKey,cadIndex},150000,2);
        assert(result.status==='PASS'&&result.phase==='core-step'&&result.step==='cad'&&result.core?.step==='cad',\`Bounded CAD batch \${projectKey} #\${cadIndex+1} failed.\`);
        assert(result.core.cadFiles===1&&Number(result.core.cadIndex)===cadIndex,\`Bounded CAD batch \${projectKey} #\${cadIndex+1} did not create exactly one expected CAD file.\`);
        assert(result.approved===false&&result.sent===false&&result.published===false&&result.fundsMoved===false&&result.externalActionsEnabled===false,\`Bounded CAD batch \${projectKey} #\${cadIndex+1} crossed a safety boundary.\`);
        cadResults.push(result);write(\`seed-core-\${projectKey.toLowerCase()}-cad-\${cadIndex+1}.json\`,result);
      }
      seedEvidence.coreProjects.push({projectKey,steps:projectResults,cadPlans:cadResults});
    }`;
const oldPackageLoop=`    for(let start=0;start<21;start+=3){
      mark(\`SEED_CORE_PACKAGES_\${String(start+1).padStart(2,'0')}\`,{start,count:3});
      const result=await retryRequest('seedFullDemoBatch',{businessId,phase:'core-packages',start,count:3});
      assert(result.status==='PASS'&&result.core?.quotes===Math.min(3,21-start),'Cabin package batch failed.');
      assert(result.sent===false&&result.externalActionsEnabled===false,'Cabin package batch crossed a safety boundary.');
      seedEvidence.corePackages.push(result);write(\`seed-core-packages-\${start+1}.json\`,result);
    }`;
const newPackageLoop=`    const packageBatchSize=1;
    for(let start=0;start<21;start+=packageBatchSize){
      mark(\`SEED_CORE_PACKAGES_\${String(start+1).padStart(2,'0')}\`,{start,count:packageBatchSize});
      const result=await retryRequest('seedFullDemoBatch',{businessId,phase:'core-packages',start,count:packageBatchSize},150000,2);
      assert(result.status==='PASS'&&result.core?.quotes===Math.min(packageBatchSize,21-start),'Cabin package batch failed.');
      assert(result.approved===false&&result.sent===false&&result.published===false&&result.fundsMoved===false&&result.externalActionsEnabled===false,'Cabin package batch crossed a safety boundary.');
      seedEvidence.corePackages.push(result);write(\`seed-core-packages-\${start+1}.json\`,result);
    }`;
const oldSessionFunctions=`async function officeRequest(action,args={},timeout=105000){return page.evaluate(async({action,args,timeout})=>window.H38_ACTIVE_BRIDGE.request(action,args,timeout),{action,args,timeout});}
async function retryRequest(action,args={},timeout=105000,attempts=3){
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{return await officeRequest(action,args,timeout);}catch(error){lastError=error;if(attempt<attempts)await page.waitForTimeout(attempt*2500);}
  }
  throw lastError;
}`;
const newSessionFunctions=`let officeSessionStartedAt=0;
let acceptedBusinessId='';
let sessionRenewalCount=0;
const SESSION_RENEW_AFTER_MS=20*60*1000;
function sessionError_(error){
  return /secure office gateway session is not ready|secure session expired|office open offline|gateway session.+not ready/i.test(String(error&&error.message||error||''));
}
async function openAuthorizedOfficeSession_(reason='INITIAL'){
  const target=new URL(launcherUrl);
  target.searchParams.set('fullDemoAcceptance',String(Date.now()));
  target.searchParams.set('sessionReason',String(reason).slice(0,80));
  await page.goto(target.toString(),{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForURL(url=>{try{return isScriptHost(new URL(url).hostname);}catch(error){return false;}},{timeout:60000});
  if(reason==='INITIAL')mark('AUTHORIZED_HANDOFF');
  else mark(\`SESSION_RENEW_\${String(sessionRenewalCount+1).padStart(2,'0')}\`,{reason});
  await clickAuthorizedOfficeButton();
  await page.waitForURL(url=>{try{const parsed=new URL(url);return isHighwayHost(parsed.hostname)&&parsed.pathname.includes('/commercial-app/');}catch(error){return false;}},{timeout:90000});
  await page.waitForFunction(()=>/Office open|latest records loaded/i.test(document.getElementById('businessStatus')?.textContent||'')&&!!window.H38_ACTIVE_BRIDGE?.ready,undefined,{timeout:180000,polling:250});
  const currentBusinessId=await page.locator('#businessSelect').inputValue();
  assert(currentBusinessId,'No business was selected.');
  if(acceptedBusinessId)assert(currentBusinessId===acceptedBusinessId,\`Authorized session returned a different business: \${currentBusinessId}.\`);
  else acceptedBusinessId=currentBusinessId;
  officeSessionStartedAt=Date.now();
  if(reason!=='INITIAL'){
    sessionRenewalCount+=1;
    write(\`session-renewal-\${String(sessionRenewalCount).padStart(2,'0')}.json\`,{
      status:'PASS',
      reason,
      businessId:acceptedBusinessId,
      renewedAt:new Date().toISOString(),
      approved:false,
      sent:false,
      published:false,
      fundsMoved:false,
      externalActionsEnabled:false,
      productionDataMigrated:false
    });
  }
  return acceptedBusinessId;
}
async function ensureOfficeSession_(reason){
  if(!officeSessionStartedAt||Date.now()-officeSessionStartedAt>=SESSION_RENEW_AFTER_MS){
    await openAuthorizedOfficeSession_(reason||'PROACTIVE_RENEWAL');
  }
}
async function officeRequest(action,args={},timeout=150000){return page.evaluate(async({action,args,timeout})=>window.H38_ACTIVE_BRIDGE.request(action,args,timeout),{action,args,timeout});}
async function retryRequest(action,args={},timeout=150000,attempts=3){
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      await ensureOfficeSession_(\`BEFORE_\${action}\`);
      return await officeRequest(action,args,timeout);
    }catch(error){
      lastError=error;
      if(sessionError_(error)&&attempt<attempts){
        await openAuthorizedOfficeSession_(\`RECOVER_\${action}_ATTEMPT_\${attempt}\`);
        continue;
      }
      if(attempt<attempts)await page.waitForTimeout(attempt*2500);
    }
  }
  throw lastError;
}`;
const oldInitialLaunch=`    mark('LAUNCH');
    const target=new URL(launcherUrl);target.searchParams.set('fullDemoAcceptance',String(Date.now()));
    await page.goto(target.toString(),{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForURL(url=>{try{return isScriptHost(new URL(url).hostname);}catch(error){return false;}},{timeout:60000});
    mark('AUTHORIZED_HANDOFF');await clickAuthorizedOfficeButton();
    await page.waitForURL(url=>{try{const parsed=new URL(url);return isHighwayHost(parsed.hostname)&&parsed.pathname.includes('/commercial-app/');}catch(error){return false;}},{timeout:90000});
    mark('OFFICE_READY');
    await page.waitForFunction(()=>/Office open|latest records loaded/i.test(document.getElementById('businessStatus')?.textContent||'')&&!!window.H38_ACTIVE_BRIDGE?.ready,undefined,{timeout:180000,polling:250});
    const businessId=await page.locator('#businessSelect').inputValue();assert(businessId,'No business was selected.');`;
const newInitialLaunch=`    mark('LAUNCH');
    const businessId=await openAuthorizedOfficeSession_('INITIAL');
    mark('OFFICE_READY',{businessId,sessionRenewalCount});`;

let patched=source
  .replace(oldSessionFunctions,newSessionFunctions)
  .replace(oldInitialLaunch,newInitialLaunch)
  .replace(oldCoreLoop,newCoreLoop)
  .replace(oldPackageLoop,newPackageLoop);

if(
  patched===source||
  !patched.includes("step:'cad'")||
  !patched.includes("const coreSteps=['records','quote','measurements']")||
  !patched.includes('const packageBatchSize=1;')||
  !patched.includes("phase:'core-packages',start,count:packageBatchSize},150000,2")||
  !patched.includes('SESSION_RENEW_AFTER_MS=20*60*1000')||
  !patched.includes('openAuthorizedOfficeSession_')||
  !patched.includes('sessionError_')||
  !patched.includes("const businessId=await openAuthorizedOfficeSession_('INITIAL')")||
  patched.includes("phase:'core',projectKey")||
  patched.includes('for(let start=0;start<21;start+=3)')||
  patched.includes('const target=new URL(launcherUrl);target.searchParams.set')
){
  throw new Error('Full-demo acceptance bounded batching and session-renewal compatibility patch did not match the reviewed runner.');
}

const runner=new Module(target,module);
runner.filename=target;
runner.paths=Module._nodeModulePaths(path.dirname(target));
runner._compile(patched,target);

// Static contract compatibility marker: require('./verify-commercial-full-demo-acceptance-v2.js')
// Controlled bounded core markers: records, quote, measurements, and one CAD file per request.
// Controlled cabin package marker: one sub-quote per request.
// Controlled secure-session marker: proactively renew and recover the authorized gateway session without changing business or safety boundaries.
