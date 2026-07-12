'use strict';

const crypto=require('crypto');
const revenue=require('./revenue-operations-core.js');

const PROVIDER_OUTCOMES=Object.freeze(['SUCCESS','FAILURE','DUPLICATE','TIMEOUT','UNCERTAIN']);
const LIVE_ACTIONS=Object.freeze([
  'sendEmail','sendQuote','sendInvoice','createPaymentRequest','processPayment','sendReceipt','issueCredit','issueRefund',
  'activateRecurringBilling','finalDelivery','sendFollowUp','scheduleSocial','publishSocial','deployWebsite'
]);
const SOCIAL_PLATFORMS=Object.freeze(['facebook','instagram','linkedin','google-business-profile','youtube']);

const clone=value=>JSON.parse(JSON.stringify(value));
const iso=value=>new Date(value==null?Date.now():value).toISOString();
const digest=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const id=prefix=>`${prefix}-${crypto.randomUUID()}`;
const text=(value,max=4000)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
const normalizeId=(value,label='ID')=>{
  const result=text(value,80);
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(result)||result.includes('..'))throw new Error(`${label} is invalid.`);
  return result;
};
const cents=value=>{
  const number=Number(value);
  if(!Number.isFinite(number)||number<0)throw new Error('Amount must be a non-negative number.');
  return Math.round(number*100);
};

function validateActivationConfig(config){
  const errors=[];
  if(!config||typeof config!=='object')return ['Activation configuration must be an object.'];
  const controls=config.controls||{};
  if(controls.selectedRecordOnly!==true)errors.push('Selected-record execution is required.');
  if(controls.bulkExecution!==false)errors.push('Bulk execution must remain disabled.');
  if(controls.automaticRetry!==false)errors.push('Automatic retry must remain disabled.');
  if(controls.duplicateProtectionRequired!==true)errors.push('Duplicate protection is required.');
  if(controls.ownerApprovalRequired!==true)errors.push('Owner approval is required.');
  if(controls.proofLogRequired!==true||controls.errorLogRequired!==true)errors.push('Proof Log and Error Log are required.');
  if(controls.rollbackRequired!==true)errors.push('Rollback protection is required.');
  if(controls.externalActionsEnabled!==false)errors.push('External actions must default to disabled.');
  if(!Array.isArray(config.providers)||config.providers.length<6)errors.push('All provider slots are required.');
  if(config.paymentSecurity?.providerHostedCardEntryRequired!==true||config.paymentSecurity?.rawCardDataAllowed!==false)errors.push('Provider-hosted card entry and no raw card data are required.');
  if(config.paymentSecurity?.browserCardFieldsAllowed!==false||config.paymentSecurity?.sheetCardFieldsAllowed!==false||config.paymentSecurity?.logCardFieldsAllowed!==false||config.paymentSecurity?.repositoryCardFieldsAllowed!==false)errors.push('Raw card fields must be disabled everywhere.');
  if(JSON.stringify(config.requiredExternalTestOutcomes)!==JSON.stringify(PROVIDER_OUTCOMES))errors.push('All five external test outcomes are required.');
  return errors;
}

function providerBySlot(config,slot){
  const provider=(config.providers||[]).find(item=>item.slot===slot);
  if(!provider)throw new Error(`Provider slot ${slot} is missing.`);
  return provider;
}

function createOwnerApproval({record,ownerEmail,approvedAt=Date.now()}){
  if(!record||Array.isArray(record))throw new Error('Exactly one record is required.');
  if(!ownerEmail||!String(ownerEmail).includes('@'))throw new Error('Owner email is required.');
  return {approvedBy:String(ownerEmail),approvedAt:iso(approvedAt),recordDigest:digest(record)};
}

function createProviderAction({config,slot,action,record,ownerApproval,duplicateLocks=new Set(),now=Date.now()}){
  const errors=validateActivationConfig(config);
  if(errors.length)throw new Error(errors.join(' '));
  if(!LIVE_ACTIONS.includes(action))throw new Error('External action is unknown.');
  if(!record||Array.isArray(record))throw new Error('Exactly one selected record is required.');
  const tenantKey=normalizeId(record.tenantKey,'Tenant key');
  const recordId=normalizeId(record.id,'Record ID');
  if(!ownerApproval||ownerApproval.recordDigest!==digest(record))throw new Error('Owner approval does not match the selected record.');
  const provider=providerBySlot(config,slot);
  const lock=digest(`${tenantKey}|${recordId}|${action}|${Number(record.version||1)}`);
  if(duplicateLocks.has(lock))throw new Error('Duplicate external action blocked.');
  duplicateLocks.add(lock);
  return {
    id:id('EXT'),tenantKey,recordId,recordType:record.type||null,action,slot,
    provider:provider.provider,providerMode:provider.mode,credentialState:provider.credentialState,
    accountApprovalState:provider.accountApprovalState,liveExecution:provider.liveExecution===true,
    ownerApproval:clone(ownerApproval),duplicateLock:lock,attempt:1,automaticRetry:false,
    status:'PREPARED_NOT_EXECUTED',preparedAt:iso(now),externalActionOccurred:false,
    blocker:provider.liveExecution===true?'GLOBAL_EXTERNAL_ACTION_LOCK':'PROVIDER_NOT_RELEASED'
  };
}

function simulateProviderAction(actionEnvelope,outcome,{providerReference=null,now=Date.now()}={}){
  if(!PROVIDER_OUTCOMES.includes(outcome))throw new Error('Sandbox outcome is invalid.');
  if(!actionEnvelope||actionEnvelope.status!=='PREPARED_NOT_EXECUTED')throw new Error('A prepared action envelope is required.');
  const common={actionId:actionEnvelope.id,tenantKey:actionEnvelope.tenantKey,recordId:actionEnvelope.recordId,action:actionEnvelope.action,slot:actionEnvelope.slot,outcome,attempt:1,automaticRetry:false,simulated:true,completedAt:iso(now),externalActionOccurred:false};
  if(outcome==='SUCCESS')return {...common,status:'SANDBOX_SUCCESS',providerReference:providerReference||`SIM-${digest(actionEnvelope.id).slice(0,16)}`,retryAllowed:false};
  if(outcome==='DUPLICATE')return {...common,status:'DUPLICATE_BLOCKED',providerReference:null,retryAllowed:false};
  if(outcome==='FAILURE')return {...common,status:'SANDBOX_FAILURE',providerReference:null,retryAllowed:false,errorCode:'SIMULATED_PROVIDER_FAILURE'};
  if(outcome==='TIMEOUT')return {...common,status:'TIMEOUT_RECONCILIATION_REQUIRED',providerReference:null,retryAllowed:false,errorCode:'SIMULATED_TIMEOUT'};
  return {...common,status:'UNCERTAIN_MANUAL_RECONCILIATION_REQUIRED',providerReference:providerReference||null,retryAllowed:false,errorCode:'SIMULATED_UNCERTAIN_RESULT'};
}

function resultLogs(actionEnvelope,result,now=Date.now()){
  const context={tenantKey:actionEnvelope.tenantKey,recordId:actionEnvelope.recordId,providerReference:result.providerReference||null,duplicateLock:actionEnvelope.duplicateLock,externalActionOccurred:false};
  const proof=revenue.proofEntry(actionEnvelope.action,result.status,context,now);
  const error=['SANDBOX_FAILURE','TIMEOUT_RECONCILIATION_REQUIRED','UNCERTAIN_MANUAL_RECONCILIATION_REQUIRED'].includes(result.status)
    ? revenue.errorEntry(actionEnvelope.action,new Error(result.errorCode),context,now):null;
  return {proof,error,automaticRetry:false};
}

function createHostedPaymentRequestDraft({tenantKey,customerId,invoiceId,amount,purpose,expiresAt,now=Date.now()}){
  const amountCents=cents(amount);
  if(amountCents<=0)throw new Error('Payment request amount must be greater than zero.');
  return {
    id:id('PAYREQ'),type:'paymentRequest',tenantKey:normalizeId(tenantKey,'Tenant key'),customerId:normalizeId(customerId,'Customer ID'),invoiceId:normalizeId(invoiceId,'Invoice ID'),
    amountCents,currency:'USD',purpose:text(purpose,500),hostedProviderOnly:true,hostedUrl:null,rawCardDataStored:false,
    status:'DRAFT',version:1,expiresAt:iso(expiresAt),createdAt:iso(now),updatedAt:iso(now),externalActionOccurred:false
  };
}

function attachHostedPaymentLink(request,url,providerReference,now=Date.now()){
  revenue.assertNoRawCardData({url,providerReference});
  const parsed=new URL(String(url));
  if(parsed.protocol!=='https:')throw new Error('Hosted payment link must use HTTPS.');
  if(request.status!=='CREATED'&&request.status!=='READY_TO_CREATE')throw new Error('Payment request is not ready for a hosted link.');
  if(!providerReference)throw new Error('Provider reference is required.');
  return {...clone(request),hostedUrl:parsed.toString(),providerReference:String(providerReference),status:'CREATED',updatedAt:iso(now),rawCardDataStored:false,externalActionOccurred:false};
}

function billingMilestones({contractValue,depositPercent=30,progressPercent=40,finalPercent=30}){
  const percentages=[Number(depositPercent),Number(progressPercent),Number(finalPercent)];
  if(percentages.some(value=>!Number.isFinite(value)||value<0)||Math.round(percentages.reduce((sum,value)=>sum+value,0)*100)!==10000)throw new Error('Billing milestone percentages must total 100.');
  const total=cents(contractValue);
  const deposit=Math.round(total*percentages[0]/100);
  const progress=Math.round(total*percentages[1]/100);
  const final=total-deposit-progress;
  return [
    {id:'MILESTONE-DEPOSIT',name:'Deposit',percent:percentages[0],amountCents:deposit,status:'DRAFT_OWNER_REVIEW'},
    {id:'MILESTONE-PROGRESS',name:'Progress',percent:percentages[1],amountCents:progress,status:'DRAFT_OWNER_REVIEW'},
    {id:'MILESTONE-FINAL',name:'Final',percent:percentages[2],amountCents:final,status:'DRAFT_OWNER_REVIEW'}
  ];
}

function recurringBillingDraft({contract,periodStart,periodEnd,overageRate=0,now=Date.now()}){
  if(!contract||!['ACTIVE','PAUSED'].includes(contract.status))throw new Error('An active or paused contract is required.');
  const overageUnits=Math.max(0,Number(contract.usedThisPeriod||0)-Number(contract.includedUsage||0));
  const overageCents=Math.round(overageUnits*cents(overageRate));
  const baseCents=Number(contract.recurringAmountCents||0);
  return {
    id:id('RECUR'),type:'recurringBilling',tenantKey:contract.tenantKey,customerId:contract.customerId,contractId:contract.id,
    periodStart:iso(periodStart),periodEnd:iso(periodEnd),baseCents,overageUnits,overageRateCents:cents(overageRate),overageCents,totalCents:baseCents+overageCents,
    status:'DRAFT_OWNER_REVIEW',version:1,createdAt:iso(now),externalActionOccurred:false
  };
}

function creditDraft({tenantKey,customerId,invoiceId,amount,reason,now=Date.now()}){
  const amountCents=cents(amount);
  if(amountCents<=0)throw new Error('Credit amount must be greater than zero.');
  return {id:id('CREDIT'),type:'credit',tenantKey:normalizeId(tenantKey,'Tenant key'),customerId:normalizeId(customerId,'Customer ID'),invoiceId:normalizeId(invoiceId,'Invoice ID'),amountCents,reason:text(reason,500),status:'DRAFT_OWNER_REVIEW',createdAt:iso(now),externalActionOccurred:false};
}

function receiptDraft({payment,invoice,now=Date.now()}){
  if(!payment||!invoice||payment.invoiceId!==invoice.id)throw new Error('Payment and invoice do not match.');
  return {id:id('RECEIPT'),type:'receipt',tenantKey:invoice.tenantKey,customerId:invoice.customerId,invoiceId:invoice.id,paymentId:payment.id,amountCents:payment.amountCents,providerReference:payment.providerReference,status:'DRAFT_OWNER_REVIEW',createdAt:iso(now),externalActionOccurred:false};
}

function deliveryDraft({tenantKey,customerId,jobId,files,acceptanceSummary,now=Date.now()}){
  if(!Array.isArray(files)||!files.length||files.some(file=>typeof file!=='string'||file.includes('..')||file.startsWith('/')))throw new Error('Delivery files must be safe relative paths.');
  return {id:id('DELIVERY'),type:'delivery',tenantKey:normalizeId(tenantKey,'Tenant key'),customerId:normalizeId(customerId,'Customer ID'),jobId:normalizeId(jobId,'Job ID'),files:[...files],acceptanceSummary:text(acceptanceSummary,1000),status:'DRAFT_OWNER_REVIEW',version:1,createdAt:iso(now),externalActionOccurred:false};
}

function followUpDraft({tenantKey,customerId,recordId,purpose,body,dueAt,now=Date.now()}){
  return {id:id('FOLLOWUP'),type:'communication',tenantKey:normalizeId(tenantKey,'Tenant key'),customerId:normalizeId(customerId,'Customer ID'),recordId:normalizeId(recordId,'Record ID'),purpose:text(purpose,200),body:text(body,4000),dueAt:iso(dueAt),status:'DRAFT',version:1,createdAt:iso(now),externalActionOccurred:false};
}

function contractRenewalDraft(contract,{newEndAt=null,newAmount=null,now=Date.now()}={}){
  if(!contract||!['ACTIVE','PAUSED'].includes(contract.status))throw new Error('Contract is not eligible for renewal.');
  return {id:id('RENEWAL'),type:'contractRenewal',tenantKey:contract.tenantKey,customerId:contract.customerId,contractId:contract.id,newEndAt:newEndAt?iso(newEndAt):null,newRecurringAmountCents:newAmount==null?contract.recurringAmountCents:cents(newAmount),status:'DRAFT_OWNER_REVIEW',createdAt:iso(now),externalActionOccurred:false};
}

function cancellationDraft(contract,{effectiveAt,reason,now=Date.now()}){
  if(!contract||!['ACTIVE','PAUSED','CANCEL_PENDING'].includes(contract.status))throw new Error('Contract is not eligible for cancellation.');
  return {id:id('CANCEL'),type:'contractCancellation',tenantKey:contract.tenantKey,customerId:contract.customerId,contractId:contract.id,effectiveAt:iso(effectiveAt),reason:text(reason,500),status:'DRAFT_OWNER_REVIEW',createdAt:iso(now),externalActionOccurred:false};
}

function platformCopy(item,platform){
  if(!SOCIAL_PLATFORMS.includes(platform))throw new Error('Social platform is not approved.');
  const base=`${item.title}. ${item.cta}.`;
  const variants={
    facebook:`${base} Practical planning, clear boundaries, and one useful next step.`,
    instagram:`${item.title}. Save this for your next project. ${item.cta}.`,
    linkedin:`${item.title}. The operating lesson: define the inputs, finished outcome, assumptions, and approval gate before execution. ${item.cta}.`,
    'google-business-profile':`${item.title}. ${item.cta}. Owner-reviewed planning support from Highway 38 Solutions.`,
    youtube:`${item.title}. In this practical walkthrough, we show the inputs, calculation or workflow, limits, and the next approved step. ${item.cta}.`
  };
  return variants[platform];
}

function buildSocialCalendar(plan,{tenantKey='highway-38',startDate='2026-07-13T14:00:00.000Z'}={}){
  if(!plan||!Array.isArray(plan.days)||plan.days.length!==30)throw new Error('A complete 30-day plan is required.');
  const start=new Date(startDate).getTime();
  const records=[];
  for(const item of plan.days){
    for(const platform of plan.approvedPlatforms){
      const schedule=new Date(start+(Number(item.day)-1)*86400000+SOCIAL_PLATFORMS.indexOf(platform)*3600000).toISOString();
      records.push({
        id:`SOC-${String(item.day).padStart(2,'0')}-${platform.toUpperCase().replace(/[^A-Z]/g,'')}`,type:'social',tenantKey:normalizeId(tenantKey,'Tenant key'),day:item.day,platform,
        theme:item.theme,title:item.title,content:platformCopy(item,platform),format:item.format,cta:item.cta,relatedProduct:item.relatedProduct,
        assetSpec:clone(plan.assetSpecifications[platform]),scheduledFor:schedule,status:'DRAFT',version:1,ownerApproval:null,
        publicationReference:null,publicationProof:null,performance:null,externalActionOccurred:false
      });
    }
  }
  return records;
}

function publicationProof(record,{providerReference,publicUrl,publishedAt=Date.now(),contentDigest=null}={}){
  if(!record||record.status!=='PUBLISHED')throw new Error('Only a published record may receive publication proof.');
  if(!providerReference)throw new Error('Provider publication reference is required.');
  const url=publicUrl?new URL(String(publicUrl)):null;
  if(url&&url.protocol!=='https:')throw new Error('Publication URL must use HTTPS.');
  return {providerReference:String(providerReference),publicUrl:url?url.toString():null,publishedAt:iso(publishedAt),contentDigest:contentDigest||digest(record.content),recordDigest:digest(record)};
}

function performanceRecord(record,{impressions=0,reach=0,engagements=0,clicks=0,inquiries=0,measuredAt=Date.now()}={}){
  const metrics={impressions,reach,engagements,clicks,inquiries};
  for(const [name,value] of Object.entries(metrics))if(!Number.isFinite(Number(value))||Number(value)<0)throw new Error(`${name} must be non-negative.`);
  return {socialRecordId:record.id,platform:record.platform,...Object.fromEntries(Object.entries(metrics).map(([name,value])=>[name,Number(value)])),engagementRate:Number(impressions)?Math.round(Number(engagements)/Number(impressions)*10000)/100:0,clickRate:Number(impressions)?Math.round(Number(clicks)/Number(impressions)*10000)/100:0,measuredAt:iso(measuredAt)};
}

function inquiryToTask({tenantKey,platform,sourceRecordId,inquiryId,summary,campaignId=null,now=Date.now()}){
  if(!SOCIAL_PLATFORMS.includes(platform))throw new Error('Inquiry platform is not approved.');
  const safeSummary=text(summary,1000);
  if(safeSummary.length<3)throw new Error('Inquiry summary is required.');
  return {id:id('TASK'),type:'task',tenantKey:normalizeId(tenantKey,'Tenant key'),title:`Review ${platform} inquiry`,description:safeSummary,source:'social-inquiry',platform,sourceRecordId:normalizeId(sourceRecordId,'Social record ID'),inquiryDigest:digest(`${inquiryId}|${safeSummary}`),campaignId,status:'NEEDS_OWNER_REVIEW',selectedRecordOnly:true,bulkExecution:false,externalActionsEnabled:false,createdAt:iso(now)};
}

function outstandingBalances(invoices=[]){
  return invoices.filter(invoice=>Number(invoice.balanceCents||0)>0&&!['VOID','REFUNDED'].includes(invoice.status)).map(invoice=>({invoiceId:invoice.id,customerId:invoice.customerId,status:invoice.status,dueAt:invoice.dueAt,totalCents:Number(invoice.totalCents||0),paidCents:Number(invoice.paidCents||0),refundedCents:Number(invoice.refundedCents||0),balanceCents:Number(invoice.balanceCents||0),overdue:Boolean(invoice.dueAt&&new Date(invoice.dueAt).getTime()<Date.now()&&!['PAID','VOID','REFUNDED'].includes(invoice.status))}));
}

function cashView({payments=[],refunds=[],expenses=[]}){
  const cashInCents=payments.reduce((sum,item)=>sum+Number(item.amountCents||0),0);
  const refundsCents=refunds.reduce((sum,item)=>sum+Number(item.amountCents||0),0);
  const expenseCents=expenses.reduce((sum,item)=>sum+cents(item.amount||0),0);
  return {cashInCents,refundsCents,expenseCents,netCashCents:cashInCents-refundsCents-expenseCents};
}

function profitabilityByItem({items=[],payments=[],expenses=[]}){
  const map=new Map();
  for(const item of items){
    const key=`${item.itemType}:${item.itemId}`;
    map.set(key,{itemType:item.itemType,itemId:item.itemId,name:item.name||item.itemId,revenueCents:0,directCostCents:Number(item.directCostCents||0),laborCents:Number(item.laborCents||0),adSpendCents:Number(item.adSpendCents||0)});
  }
  for(const payment of payments){
    const key=`${payment.itemType}:${payment.itemId}`;
    if(map.has(key))map.get(key).revenueCents+=Number(payment.amountCents||0);
  }
  for(const expense of expenses){
    const key=`${expense.itemType}:${expense.itemId}`;
    if(map.has(key))map.get(key).directCostCents+=cents(expense.amount||0);
  }
  return [...map.values()].map(item=>{
    const totalCostCents=item.directCostCents+item.laborCents+item.adSpendCents;
    const profitCents=item.revenueCents-totalCostCents;
    return {...item,totalCostCents,profitCents,marginPercent:item.revenueCents?Math.round(profitCents/item.revenueCents*10000)/100:0};
  });
}

function websiteDeploymentDraft({tenantKey,title,files,sourceRef,rollbackRef,acceptanceChecks,now=Date.now()}){
  if(!sourceRef||String(sourceRef).length<7)throw new Error('Source reference is required.');
  if(!rollbackRef||String(rollbackRef).length<7)throw new Error('Rollback reference is required.');
  if(sourceRef===rollbackRef)throw new Error('Source and rollback references must differ.');
  if(!Array.isArray(acceptanceChecks)||!acceptanceChecks.length)throw new Error('Acceptance checks are required.');
  const base=revenue.createWebsiteChange({tenantKey,title,files,rollbackRef,description:'Rollback-protected selected-record website deployment.',now});
  return {...base,sourceRef:String(sourceRef),acceptanceChecks:acceptanceChecks.map(check=>({name:text(check.name,200),status:check.status||'PENDING',evidence:check.evidence||null})),liveVerificationStatus:'PENDING',deploymentAuthorization:'OWNER_RELEASE_REQUIRED'};
}

function integrationHealth(config){
  const errors=validateActivationConfig(config);
  return {
    status:errors.length?'HOLD_CONFIGURATION':'READY_INTERNAL_BLOCKED_EXTERNAL',
    errors,
    providers:(config.providers||[]).map(provider=>({
      slot:provider.slot,mode:provider.mode,provider:provider.provider,credentialState:provider.credentialState,accountApprovalState:provider.accountApprovalState,
      sandboxAvailable:provider.sandboxAvailable===true,liveExecution:provider.liveExecution===true,
      status:provider.liveExecution===true?'HOLD_UNEXPECTED_LIVE_STATE':provider.slot==='accounting'&&provider.mode==='csv'?'READY_CSV_OWNER_MAPPING_REQUIRED':'BLOCKED_EXACT_CONNECTION_STEP',
      exactConnectionStep:provider.exactConnectionStep
    })),
    externalActionsEnabled:false,
    externalActionsOccurred:false
  };
}

function acceptanceSummary({config,socialCalendar=[],sandboxResults=[],invoices=[],payments=[],refunds=[],expenses=[],profitabilityItems=[]}){
  const health=integrationHealth(config);
  const outcomeCounts=Object.fromEntries(PROVIDER_OUTCOMES.map(outcome=>[outcome,sandboxResults.filter(result=>result.outcome===outcome).length]));
  return {
    status:validateActivationConfig(config).length?'HOLD':'PASS_INTERNAL_EXTERNAL_BLOCKED',
    providers:health.providers,
    social:{records:socialCalendar.length,days:new Set(socialCalendar.map(record=>record.day)).size,platforms:new Set(socialCalendar.map(record=>record.platform)).size,published:socialCalendar.filter(record=>record.status==='PUBLISHED').length},
    sandboxOutcomes:outcomeCounts,
    accounting:{rows:revenue.accountingRows({invoices,payments,refunds,expenses}).length,outstanding:outstandingBalances(invoices),cash:cashView({payments,refunds,expenses}),profitability:profitabilityByItem({items:profitabilityItems,payments,expenses})},
    externalActionsEnabled:false,
    externalActionsOccurred:false
  };
}

module.exports={
  PROVIDER_OUTCOMES,LIVE_ACTIONS,SOCIAL_PLATFORMS,validateActivationConfig,providerBySlot,createOwnerApproval,createProviderAction,simulateProviderAction,resultLogs,
  createHostedPaymentRequestDraft,attachHostedPaymentLink,billingMilestones,recurringBillingDraft,creditDraft,receiptDraft,deliveryDraft,followUpDraft,
  contractRenewalDraft,cancellationDraft,platformCopy,buildSocialCalendar,publicationProof,performanceRecord,inquiryToTask,outstandingBalances,cashView,
  profitabilityByItem,websiteDeploymentDraft,integrationHealth,acceptanceSummary,digest,cents
};
