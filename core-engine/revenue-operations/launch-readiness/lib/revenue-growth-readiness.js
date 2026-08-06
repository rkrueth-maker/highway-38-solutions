'use strict';

const crypto=require('crypto');
const revenue=require('../../lib/revenue-operations-core.js');

const NETWORKS=['facebook','instagram','linkedin','google-business-profile','youtube'];
const SCENARIOS=['success','failure','duplicate','timeout','uncertain'];
const EXTERNAL_SLOTS=['email','payments','social','website','customer-auth-and-storage'];
const clone=value=>JSON.parse(JSON.stringify(value));
const iso=value=>new Date(value).toISOString();
const digest=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const bullets=items=>(items||[]).map(item=>clean(item)).filter(Boolean);

function validateProviderRegistry(registry){
  const errors=[];
  if(!registry||typeof registry!=='object')return ['Provider registry must be an object.'];
  if(registry.schemaVersion!==1)errors.push('schemaVersion must be 1.');
  if(registry.externalActionsEnabled!==false)errors.push('External actions must remain disabled.');
  const controls=registry.controls||{};
  if(controls.selectedRecordOnly!==true)errors.push('Selected-record execution is required.');
  if(controls.bulkExecution!==false)errors.push('Bulk execution must remain disabled.');
  if(controls.automaticRetry!==false)errors.push('Automatic retry must remain disabled.');
  if(controls.duplicateProtectionRequired!==true)errors.push('Duplicate protection is required.');
  if(controls.ownerApprovalRequired!==true)errors.push('Owner approval is required.');
  if(controls.proofLogRequired!==true||controls.errorLogRequired!==true)errors.push('Proof and Error Logs are required.');
  if(controls.providerHostedPaymentEntryOnly!==true||controls.rawCardDataAllowed!==false)errors.push('Provider-hosted payment entry and raw-card prohibition are required.');
  if(controls.advertisingSpendEnabled!==false||controls.finalDeliveryEnabled!==false)errors.push('Advertising spend and final delivery must remain disabled.');
  const providers=Array.isArray(registry.providers)?registry.providers:[];
  const required=['email','payments','accounting','social','website','customer-auth-and-storage'];
  for(const slot of required){
    const provider=providers.find(item=>item.slot===slot);
    if(!provider)errors.push(`Provider slot ${slot} is required.`);
    else{
      if(provider.liveExecution!==false)errors.push(`${slot} live execution must remain false.`);
      if(!provider.status||!provider.currentMode||!provider.exactConnectionStep)errors.push(`${slot} requires current mode, status, and exact connection step.`);
    }
  }
  if(new Set(providers.map(item=>item.slot)).size!==providers.length)errors.push('Provider slots must be unique.');
  return errors;
}

function integrationHealth(registry){
  const errors=validateProviderRegistry(registry);
  if(errors.length)throw new Error(errors.join(' '));
  return registry.providers.map(provider=>({
    slot:provider.slot,
    currentMode:provider.currentMode,
    status:provider.status,
    credentialState:provider.credentialState,
    liveExecution:false,
    safeInternalMode:['SAFE_INTERNAL_MODE','READY_FOR_OWNER_APPROVED_DEPLOYMENT'].includes(provider.status),
    exactConnectionStep:provider.exactConnectionStep,
    blocker:provider.liveExecution===false&&EXTERNAL_SLOTS.includes(provider.slot)?provider.status:null,
    observedConnection:provider.observedConnection||null
  }));
}

function platformProfile(network){
  const profiles={
    facebook:{label:'Facebook',contentType:'POST',assetRatio:'1:1 or 4:5',assetRequired:false,maxChars:5000,window:'09:00–11:00'},
    instagram:{label:'Instagram',contentType:'POST',assetRatio:'4:5 preferred',assetRequired:true,maxChars:2200,window:'11:00–13:00'},
    linkedin:{label:'LinkedIn',contentType:'POST',assetRatio:'1.91:1 or 1:1',assetRequired:false,maxChars:3000,window:'08:00–10:00'},
    'google-business-profile':{label:'Google Business Profile',contentType:'UPDATE',assetRatio:'4:3 or 1:1',assetRequired:false,maxChars:1500,window:'10:00–12:00'},
    youtube:{label:'YouTube',contentType:'VIDEO_DRAFT',assetRatio:'16:9 video',assetRequired:true,maxChars:5000,window:'17:00–19:00'}
  };
  if(!profiles[network])throw new Error(`Unsupported network ${network}.`);
  return profiles[network];
}

function platformCopy(item,network){
  const points=bullets(item.points);
  if(network==='facebook')return `${clean(item.hook)}\n\n${points.map(point=>`• ${point}`).join('\n')}\n\n${clean(item.cta)}`;
  if(network==='instagram')return `${clean(item.hook)}\n\n${points.map(point=>`— ${point}`).join('\n')}\n\n${clean(item.cta)}\n\n#Highway38Solutions #ClearPlans #SmallBusinessSystems`;
  if(network==='linkedin')return `${clean(item.title)}\n\n${clean(item.hook)}\n\n${points.map(point=>`• ${point}`).join('\n')}\n\nThe control principle: define the record, approval, boundary, and next action before execution.\n\n${clean(item.cta)}`;
  if(network==='google-business-profile')return `${clean(item.hook)} ${points.join(' ')} ${clean(item.cta)}`;
  if(network==='youtube')return `${clean(item.title)}\n\nDescription: ${clean(item.hook)}\n\nOutline:\n${points.map((point,index)=>`${index+1}. ${point}`).join('\n')}\n4. Boundary and next action\n\n${clean(item.cta)}`;
  throw new Error(`Unsupported network ${network}.`);
}

function addDays(dateString,days){
  const date=new Date(`${dateString}T12:00:00Z`);
  if(Number.isNaN(date.getTime()))throw new Error('Start date is invalid.');
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}

function compileSocialCalendar({bank,startDate,tenantKey='highway-38'}){
  if(!bank||bank.schemaVersion!==1||!Array.isArray(bank.items)||bank.items.length!==30)throw new Error('Content bank must contain exactly 30 items.');
  if(bank.publicationEnabled!==false||bank.advertisingEnabled!==false)throw new Error('Publication and advertising must remain disabled.');
  const records=[];
  for(const item of bank.items){
    if(!Number.isInteger(item.day)||item.day<1||item.day>30)throw new Error('Content-bank day must be 1 through 30.');
    for(const network of NETWORKS){
      const profile=platformProfile(network);
      const content=platformCopy(item,network);
      if(content.length>profile.maxChars)throw new Error(`${network} content exceeds the configured length limit on day ${item.day}.`);
      records.push({
        id:`SOCIAL-D${String(item.day).padStart(2,'0')}-${network.toUpperCase().replace(/-/g,'_')}`,
        tenantKey,
        day:item.day,
        plannedDate:addDays(startDate,item.day-1),
        planningWindow:profile.window,
        timezone:bank.timezone,
        platform:network,
        platformLabel:profile.label,
        contentType:profile.contentType,
        theme:item.theme,
        title:item.title,
        copy:content,
        productIds:clone(item.productIds||[]),
        campaignId:`CAMPAIGN-${String(item.day).padStart(2,'0')}`,
        asset:{...clone(item.asset||{}),required:profile.assetRequired,ratio:profile.assetRatio,status:'SPEC_READY_ASSET_NOT_UPLOADED'},
        status:'DRAFT_OWNER_REVIEW',
        ownerApproval:null,
        providerReference:null,
        publicationReference:null,
        publicationProof:null,
        inquiryRouting:'CREATE_SELECTED_INQUIRY_TASK_AFTER_AUTHENTICATED_READ',
        automaticRetry:false,
        externalActionOccurred:false
      });
    }
  }
  return {
    schemaVersion:1,
    release:bank.release,
    generatedAt:new Date().toISOString(),
    startDate,
    endDate:addDays(startDate,29),
    timezone:bank.timezone,
    networks:clone(NETWORKS),
    baseItems:bank.items.length,
    platformDrafts:records.length,
    publicationEnabled:false,
    advertisingEnabled:false,
    records
  };
}

function validateSocialCalendar(calendar){
  const errors=[];
  if(!calendar||calendar.schemaVersion!==1)errors.push('Calendar schemaVersion must be 1.');
  if(calendar.baseItems!==30||calendar.platformDrafts!==150||!Array.isArray(calendar.records)||calendar.records.length!==150)errors.push('Calendar must contain 30 base items and 150 platform drafts.');
  if(calendar.publicationEnabled!==false||calendar.advertisingEnabled!==false)errors.push('Calendar publication and advertising must remain disabled.');
  const ids=new Set();
  for(const record of calendar.records||[]){
    if(ids.has(record.id))errors.push(`Duplicate social record ${record.id}.`);ids.add(record.id);
    if(!NETWORKS.includes(record.platform))errors.push(`Unsupported platform ${record.platform}.`);
    if(record.status!=='DRAFT_OWNER_REVIEW'||record.ownerApproval!==null)errors.push(`${record.id} is not in owner-review draft state.`);
    if(record.providerReference!==null||record.publicationReference!==null||record.publicationProof!==null)errors.push(`${record.id} contains unverified publication data.`);
    if(record.automaticRetry!==false||record.externalActionOccurred!==false)errors.push(`${record.id} violates execution controls.`);
    if(!record.asset?.ratio||!record.asset?.status)errors.push(`${record.id} is missing its asset specification.`);
  }
  for(let day=1;day<=30;day++)for(const network of NETWORKS)if(!(calendar.records||[]).some(record=>record.day===day&&record.platform===network))errors.push(`Missing day ${day} ${network} record.`);
  return errors;
}

function simulateProviderOutcome({slot,scenario,recordId,tenantKey='highway-38',duplicateLocks=new Set(),now=Date.now()}){
  if(!SCENARIOS.includes(scenario))throw new Error('Provider test scenario is unsupported.');
  if(!slot||!recordId)throw new Error('Provider slot and one selected record ID are required.');
  const lock=digest(`${slot}|${tenantKey}|${recordId}|1`);
  const base={
    id:`TEST-${digest(`${slot}|${scenario}|${recordId}`).slice(0,16)}`,
    slot,scenario,tenantKey,recordId,duplicateLock:lock,testedAt:iso(now),automaticRetry:false,externalActionOccurred:false,liveProviderCalled:false
  };
  if(scenario==='duplicate'){
    duplicateLocks.add(lock);
    return {...base,status:'DUPLICATE_BLOCKED',providerReference:null,proof:revenue.proofEntry(`${slot}:sandbox`, 'DUPLICATE_BLOCKED',{tenantKey,recordId,duplicateLock:lock,externalActionOccurred:false},now),error:null};
  }
  if(duplicateLocks.has(lock))throw new Error('Duplicate sandbox action blocked.');
  duplicateLocks.add(lock);
  if(scenario==='success')return {...base,status:'TEST_SUCCESS_NOT_LIVE',providerReference:`SANDBOX-${digest(recordId).slice(0,12)}`,proof:revenue.proofEntry(`${slot}:sandbox`,'TEST_SUCCESS_NOT_LIVE',{tenantKey,recordId,duplicateLock:lock,providerReference:`SANDBOX-${digest(recordId).slice(0,12)}`,externalActionOccurred:false},now),error:null};
  if(scenario==='failure'){
    const error=new Error('Synthetic provider failure.');
    return {...base,status:'TEST_FAILURE_RECORDED',providerReference:null,proof:null,error:revenue.errorEntry(`${slot}:sandbox`,error,{tenantKey,recordId,duplicateLock:lock,externalActionOccurred:false},now)};
  }
  if(scenario==='timeout'){
    const error=new Error('Synthetic provider timeout; result not retried.');
    return {...base,status:'TIMEOUT_HOLD_NO_RETRY',providerReference:null,proof:null,error:revenue.errorEntry(`${slot}:sandbox`,error,{tenantKey,recordId,duplicateLock:lock,externalActionOccurred:false},now)};
  }
  const error=new Error('Synthetic provider result is uncertain; manual reconciliation required.');
  return {...base,status:'UNCERTAIN_HOLD_NO_RETRY',providerReference:null,proof:null,error:revenue.errorEntry(`${slot}:sandbox`,error,{tenantKey,recordId,duplicateLock:lock,externalActionOccurred:false},now)};
}

function routeInquiryToTask({inquiry,existingLocks=new Set(),now=Date.now()}){
  if(!inquiry||Array.isArray(inquiry))throw new Error('Exactly one selected inquiry record is required.');
  if(!inquiry.id||!inquiry.platform||!inquiry.summary)throw new Error('Inquiry ID, platform, and summary are required.');
  const tenantKey=inquiry.tenantKey||'highway-38';
  const lock=digest(`social-inquiry|${tenantKey}|${inquiry.id}`);
  if(existingLocks.has(lock))throw new Error('Duplicate inquiry task blocked.');
  existingLocks.add(lock);
  return {
    task:{
      id:`TASK-SOCIAL-${digest(inquiry.id).slice(0,12)}`,
      tenantKey,
      sourceType:'social-inquiry',
      sourceId:inquiry.id,
      platform:inquiry.platform,
      title:`Review ${inquiry.platform} inquiry`,
      summary:clean(inquiry.summary),
      contactReference:inquiry.contactReference||null,
      campaignId:inquiry.campaignId||null,
      status:'NEEDS_OWNER_REVIEW',
      nextAction:'Review fit, privacy, and response draft before any reply.',
      selectedRecordOnly:true,
      bulkExecution:false,
      ownerApprovalRequired:true,
      automaticRetry:false,
      externalActionOccurred:false,
      createdAt:iso(now)
    },
    duplicateLock:lock,
    proof:revenue.proofEntry('routeSocialInquiryToTask','TASK_CREATED_INTERNAL_ONLY',{tenantKey,recordId:inquiry.id,duplicateLock:lock,externalActionOccurred:false},now)
  };
}

function accountingAcceptance({invoices=[],payments=[],refunds=[],expenses=[],profitabilityRecords=[],leads=[],quotes=[]}){
  const rows=revenue.accountingRows({invoices,payments,refunds,expenses});
  const outstandingBalanceCents=invoices.reduce((sum,item)=>sum+Number(item.balanceCents||0),0);
  const cashReceivedCents=payments.reduce((sum,item)=>sum+Number(item.amountCents||0),0);
  const refundsCents=refunds.reduce((sum,item)=>sum+Number(item.amountCents||0),0);
  const expenseCents=expenses.reduce((sum,item)=>sum+revenue.cents(item.amount||0),0);
  const profitability=profitabilityRecords.map(item=>({id:item.id,kind:item.kind||'record',...revenue.profitability(item)}));
  return {
    generatedAt:new Date().toISOString(),
    outstandingBalanceCents,
    cashReceivedCents,
    refundsCents,
    expenseCents,
    netCashCents:cashReceivedCents-refundsCents-expenseCents,
    accountingRows:rows,
    accountingCsv:revenue.accountingCsv({invoices,payments,refunds,expenses}),
    profitability,
    attribution:revenue.attribution({leads,quotes,invoices,payments}),
    mappingStatus:'OWNER_REVIEW_REQUIRED',
    providerSyncOccurred:false,
    externalActionOccurred:false
  };
}

function activationGate({registry,calendar,scenarioResults=[],accounting=null,ownerRelease=false}){
  const blockers=[];
  const registryErrors=validateProviderRegistry(registry);
  if(registryErrors.length)blockers.push(...registryErrors);
  const calendarErrors=validateSocialCalendar(calendar);
  if(calendarErrors.length)blockers.push(...calendarErrors);
  for(const provider of registry.providers||[]){
    if(provider.status!=='SAFE_INTERNAL_MODE'&&provider.status!=='READY_FOR_OWNER_APPROVED_DEPLOYMENT')blockers.push(`${provider.slot}: ${provider.status} — ${provider.exactConnectionStep}`);
  }
  for(const slot of ['email','payments','social','website']){
    for(const scenario of SCENARIOS)if(!scenarioResults.some(result=>result.slot===slot&&result.scenario===scenario))blockers.push(`${slot}: missing ${scenario} test.`);
  }
  if(!accounting||accounting.mappingStatus!=='OWNER_REVIEW_REQUIRED')blockers.push('Accounting acceptance report is missing.');
  if(ownerRelease!==true)blockers.push('Separate owner release has not been recorded for external actions.');
  return {
    status:blockers.length?'HOLD':'READY_FOR_SELECTED_RECORD_OWNER_RELEASE',
    generatedAt:new Date().toISOString(),
    blockers,
    externalActionsEnabled:false,
    externalActionsOccurred:false,
    automaticRetry:false
  };
}

module.exports={NETWORKS,SCENARIOS,validateProviderRegistry,integrationHealth,platformProfile,platformCopy,compileSocialCalendar,validateSocialCalendar,simulateProviderOutcome,routeInquiryToTask,accountingAcceptance,activationGate,digest};
