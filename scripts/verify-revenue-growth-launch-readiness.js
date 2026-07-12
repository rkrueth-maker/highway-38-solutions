#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const readiness=require('../core-engine/revenue-operations/launch-readiness/lib/revenue-growth-readiness.js');
const revenue=require('../core-engine/revenue-operations/lib/revenue-operations-core.js');

const ROOT=path.resolve(__dirname,'..');
const OUT=path.join(ROOT,'launch-control','evidence');
fs.mkdirSync(OUT,{recursive:true});
const passes=[];
const failures=[];
const check=(name,condition,detail='')=>(condition?passes:failures).push({name,detail});
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const json=rel=>JSON.parse(read(rel));
const exists=rel=>fs.existsSync(path.join(ROOT,rel));
const writeJson=(rel,value)=>fs.writeFileSync(path.join(OUT,rel),JSON.stringify(value,null,2)+'\n','utf8');
function expectThrow(name,fn,contains){try{fn();failures.push({name,detail:'Expected an error but none was thrown.'});}catch(error){check(name,!contains||String(error.message).includes(contains),error.message);}}

function run(){
  const required=[
    'core-engine/revenue-operations/launch-readiness/README.md',
    'core-engine/revenue-operations/launch-readiness/provider-readiness.json',
    'core-engine/revenue-operations/launch-readiness/social-content-bank.json',
    'core-engine/revenue-operations/launch-readiness/lib/revenue-growth-readiness.js'
  ];
  required.forEach(file=>check(`required artifact: ${file}`,exists(file)));

  const registry=json('core-engine/revenue-operations/launch-readiness/provider-readiness.json');
  const bank=json('core-engine/revenue-operations/launch-readiness/social-content-bank.json');
  const registryErrors=readiness.validateProviderRegistry(registry);
  check('provider registry validates',registryErrors.length===0,registryErrors.join(' '));
  check('all six provider slots exist',['email','payments','accounting','social','website','customer-auth-and-storage'].every(slot=>registry.providers.some(provider=>provider.slot===slot)));
  check('all provider live execution remains false',registry.providers.every(provider=>provider.liveExecution===false)&&registry.externalActionsEnabled===false);
  check('global selected-record and no-retry controls remain locked',registry.controls.selectedRecordOnly===true&&registry.controls.bulkExecution===false&&registry.controls.automaticRetry===false&&registry.controls.duplicateProtectionRequired===true&&registry.controls.ownerApprovalRequired===true);
  check('payment data boundary is locked',registry.controls.providerHostedPaymentEntryOnly===true&&registry.controls.rawCardDataAllowed===false);
  check('advertising and final delivery remain disabled',registry.controls.advertisingSpendEnabled===false&&registry.controls.finalDeliveryEnabled===false);
  const metricool=registry.providers.find(provider=>provider.slot==='social');
  check('Metricool connection error is recorded truthfully',metricool.status==='METRICOOL_CONNECTION_ERROR'&&metricool.credentialState==='CONNECTION_FAILED'&&metricool.observedConnection?.result==='ERROR'&&metricool.observedConnection?.brandId===null&&metricool.observedConnection?.blogId===null&&metricool.observedConnection?.timezoneConfirmed===false);
  check('every blocked provider has one exact connection step',registry.providers.every(provider=>typeof provider.exactConnectionStep==='string'&&provider.exactConnectionStep.length>40));
  const health=readiness.integrationHealth(registry);
  check('integration health returns six truthful records',health.length===6&&health.every(item=>item.liveExecution===false));
  check('accounting is a safe internal mode',health.find(item=>item.slot==='accounting')?.safeInternalMode===true);
  check('social remains blocked, not connected',health.find(item=>item.slot==='social')?.blocker==='METRICOOL_CONNECTION_ERROR');

  check('content bank contains 30 unique days',bank.items.length===30&&new Set(bank.items.map(item=>item.day)).size===30&&bank.items.every(item=>item.day>=1&&item.day<=30));
  check('content bank covers five approved primary networks',JSON.stringify(bank.networks)===JSON.stringify(readiness.NETWORKS));
  check('content bank publication and advertising are disabled',bank.publicationEnabled===false&&bank.advertisingEnabled===false);
  check('each base item has title, hook, points, CTA, asset, and product path',bank.items.every(item=>item.title&&item.hook&&item.points?.length>=3&&item.cta&&item.asset?.type&&item.productIds?.length));
  const calendar=readiness.compileSocialCalendar({bank,startDate:'2026-07-13',tenantKey:'highway-38'});
  const calendarErrors=readiness.validateSocialCalendar(calendar);
  check('30-day platform calendar validates',calendarErrors.length===0,calendarErrors.join(' '));
  check('calendar contains 150 platform-specific drafts',calendar.baseItems===30&&calendar.platformDrafts===150&&calendar.records.length===150);
  check('every day has every approved platform',Array.from({length:30},(_,i)=>i+1).every(day=>readiness.NETWORKS.every(network=>calendar.records.some(record=>record.day===day&&record.platform===network))));
  check('platform copy is distinct for the same topic',new Set(calendar.records.filter(record=>record.day===1).map(record=>record.copy)).size===5);
  check('Instagram and YouTube asset requirements are explicit',calendar.records.filter(record=>['instagram','youtube'].includes(record.platform)).every(record=>record.asset.required===true&&record.asset.status==='SPEC_READY_ASSET_NOT_UPLOADED'));
  check('no post is scheduled or published',calendar.records.every(record=>record.status==='DRAFT_OWNER_REVIEW'&&record.ownerApproval===null&&record.providerReference===null&&record.publicationReference===null&&record.publicationProof===null&&record.externalActionOccurred===false));
  check('calendar has campaign IDs and inquiry routing',calendar.records.every(record=>record.campaignId&&record.inquiryRouting==='CREATE_SELECTED_INQUIRY_TASK_AFTER_AUTHENTICATED_READ'));

  const scenarioResults=[];
  const expected={success:'TEST_SUCCESS_NOT_LIVE',failure:'TEST_FAILURE_RECORDED',duplicate:'DUPLICATE_BLOCKED',timeout:'TIMEOUT_HOLD_NO_RETRY',uncertain:'UNCERTAIN_HOLD_NO_RETRY'};
  for(const slot of ['email','payments','social','website']){
    for(const scenario of readiness.SCENARIOS){
      const result=readiness.simulateProviderOutcome({slot,scenario,recordId:`REC-${slot}-${scenario}`,tenantKey:'highway-38',now:Date.parse('2026-07-12T15:00:00Z')});
      scenarioResults.push(result);
      check(`${slot} ${scenario} scenario`,result.status===expected[scenario]&&result.externalActionOccurred===false&&result.liveProviderCalled===false&&result.automaticRetry===false,result.status);
      if(['failure','timeout','uncertain'].includes(scenario))check(`${slot} ${scenario} writes Error Log shape`,result.error?.automaticRetry===false&&result.error?.externalActionOccurred===false);
      if(['success','duplicate'].includes(scenario))check(`${slot} ${scenario} writes Proof Log shape`,result.proof?.externalActionOccurred===false&&result.proof?.duplicateLock);
    }
  }
  check('20 provider scenario results generated',scenarioResults.length===20);
  expectThrow('unknown provider scenario is rejected',()=>readiness.simulateProviderOutcome({slot:'email',scenario:'retry',recordId:'REC-1'}),'unsupported');
  const sharedLocks=new Set();
  readiness.simulateProviderOutcome({slot:'email',scenario:'success',recordId:'REC-DUPLICATE',duplicateLocks:sharedLocks});
  expectThrow('repeat sandbox action is duplicate-blocked',()=>readiness.simulateProviderOutcome({slot:'email',scenario:'success',recordId:'REC-DUPLICATE',duplicateLocks:sharedLocks}),'Duplicate');

  const inquiryLocks=new Set();
  const routed=readiness.routeInquiryToTask({inquiry:{id:'INQUIRY-001',tenantKey:'highway-38',platform:'facebook',summary:'Needs a clearer garage layout before buying storage.',campaignId:'CAMPAIGN-15',contactReference:'PLATFORM-USER-REFERENCE'},existingLocks:inquiryLocks,now:Date.parse('2026-07-12T15:30:00Z')});
  check('one inquiry creates one selected internal Task',routed.task.sourceId==='INQUIRY-001'&&routed.task.status==='NEEDS_OWNER_REVIEW'&&routed.task.selectedRecordOnly===true&&routed.task.bulkExecution===false&&routed.task.ownerApprovalRequired===true&&routed.task.externalActionOccurred===false);
  check('inquiry routing creates internal proof without reply',routed.proof.result==='TASK_CREATED_INTERNAL_ONLY'&&routed.proof.externalActionOccurred===false);
  expectThrow('duplicate inquiry Task is blocked',()=>readiness.routeInquiryToTask({inquiry:{id:'INQUIRY-001',platform:'facebook',summary:'Duplicate'},existingLocks:inquiryLocks}),'Duplicate');
  expectThrow('multi-record inquiry input is rejected',()=>readiness.routeInquiryToTask({inquiry:[{id:'A'},{id:'B'}]}),'Exactly one');

  const invoiceDraft=revenue.createInvoice({tenantKey:'highway-38',customerId:'CUSTOMER-001',sourceId:'QUOTE-001',lineItems:[{description:'Owner-reviewed planning package',quantity:1,unitPrice:1000,productId:'H38-P003'}],dueAt:'2026-08-01T17:00:00-05:00',now:Date.parse('2026-07-12T16:00:00Z')});
  const invoiceApproved=revenue.transition('invoice',invoiceDraft,'OWNER_APPROVED',{actor:'owner',ownerEmail:'owner',now:Date.parse('2026-07-12T16:01:00Z')});
  const invoiceReady=revenue.transition('invoice',invoiceApproved,'READY_TO_SEND',{actor:'owner',now:Date.parse('2026-07-12T16:02:00Z')});
  const invoiceSent=revenue.transition('invoice',invoiceReady,'SENT',{actor:'provider-test',now:Date.parse('2026-07-12T16:03:00Z')});
  const paymentResult=revenue.recordPayment({invoice:invoiceSent,amount:400,providerReference:'SANDBOX-PAY-001',receivedAt:Date.parse('2026-07-12T16:04:00Z')});
  const refundResult=revenue.recordRefund({invoice:paymentResult.invoice,paymentId:paymentResult.payment.id,amount:100,providerReference:'SANDBOX-REFUND-001',now:Date.parse('2026-07-12T16:05:00Z')});
  const invoice={...refundResult.invoice,leadId:'LEAD-001'};
  const payment={...paymentResult.payment,leadId:'LEAD-001'};
  const refund=refundResult.refund;
  const accounting=readiness.accountingAcceptance({
    invoices:[invoice],payments:[payment],refunds:[refund],
    expenses:[{id:'EXP-001',date:'2026-07-12',amount:100,account:'Software',customerId:null}],
    profitabilityRecords:[
      {id:'H38-P003',kind:'product',revenue:1000,directCosts:120,laborHours:4,loadedLaborRate:50,adSpend:0},
      {id:'H38-B001',kind:'bundle',revenue:1500,directCosts:200,laborHours:6,loadedLaborRate:50,adSpend:0},
      {id:'ADD-001',kind:'add-on',revenue:200,directCosts:10,laborHours:1,loadedLaborRate:50,adSpend:0},
      {id:'CONTRACT-001',kind:'contract',revenue:500,directCosts:25,laborHours:2,loadedLaborRate:50,adSpend:0}
    ],
    leads:[{id:'LEAD-001',source:'facebook',campaignId:'CAMPAIGN-15'}],
    quotes:[{id:'QUOTE-001',leadId:'LEAD-001'}]
  });
  check('accounting report calculates balances and net cash',accounting.outstandingBalanceCents===60000&&accounting.cashReceivedCents===40000&&accounting.refundsCents===10000&&accounting.expenseCents===10000&&accounting.netCashCents===20000);
  check('accounting rows and CSV include invoice, payment, refund, and expense',accounting.accountingRows.length===4&&['invoice','payment','refund','expense'].every(type=>accounting.accountingRows.some(row=>row.type===type))&&accounting.accountingCsv.includes('Accounts Receivable'));
  check('product, bundle, add-on, and contract profitability produced',accounting.profitability.length===4&&['product','bundle','add-on','contract'].every(kind=>accounting.profitability.some(item=>item.kind===kind)));
  check('lead and campaign attribution produced',accounting.attribution.length===1&&accounting.attribution[0].source==='facebook'&&accounting.attribution[0].campaignId==='CAMPAIGN-15'&&accounting.attribution[0].cashReceivedCents===40000);
  check('accounting provider sync did not occur',accounting.providerSyncOccurred===false&&accounting.externalActionOccurred===false&&accounting.mappingStatus==='OWNER_REVIEW_REQUIRED');

  const communication=revenue.createCommunicationDraft({tenantKey:'highway-38',customerId:'CUSTOMER-001',recordId:invoice.id,channel:'email',subject:'Invoice draft',body:'Owner-reviewed invoice message draft.',now:Date.parse('2026-07-12T17:00:00Z')});
  const communicationApproved=revenue.transition('communication',communication,'OWNER_APPROVED',{actor:'owner',ownerEmail:'owner',now:Date.parse('2026-07-12T17:01:00Z')});
  const communicationReady=revenue.transition('communication',communicationApproved,'READY_TO_SEND',{actor:'owner',now:Date.parse('2026-07-12T17:02:00Z')});
  const baseConfig=json('core-engine/revenue-operations/config/revenue-operations.default.json');
  const prepared=revenue.prepareExternalAction({config:baseConfig,action:'sendInvoice',record:communicationReady,providerSlot:'email',duplicateLocks:new Set(),now:Date.parse('2026-07-12T17:03:00Z')});
  check('approved communication prepares but does not send',prepared.status==='PREPARED_NOT_EXECUTED'&&prepared.blocker==='PROVIDER_NOT_LIVE'&&prepared.externalActionOccurred===false&&prepared.automaticRetry===false);
  const websiteChange=revenue.createWebsiteChange({tenantKey:'highway-38',title:'Selected approved page change',files:['index.html'],rollbackRef:'67a9f03551f14b37a314d97bef9b6ea20741f585',description:'One selected rollback-protected change.',now:Date.parse('2026-07-12T17:10:00Z')});
  check('website change contains rollback protection and remains draft',websiteChange.status==='DRAFT'&&websiteChange.rollbackRef.length>=7&&websiteChange.externalActionOccurred===false);

  const gate=readiness.activationGate({registry,calendar,scenarioResults,accounting,ownerRelease:false});
  check('activation gate remains on HOLD',gate.status==='HOLD'&&gate.externalActionsEnabled===false&&gate.externalActionsOccurred===false&&gate.automaticRetry===false);
  check('activation gate records provider and owner blockers',gate.blockers.some(item=>item.includes('social: METRICOOL_CONNECTION_ERROR'))&&gate.blockers.some(item=>item.includes('payments: BLOCKED_BY_PROVIDER_CONNECTION'))&&gate.blockers.some(item=>item.includes('Separate owner release')));
  check('activation gate does not waive missing credentials',gate.blockers.length>=5);

  const providerEvidence={release:registry.release,generatedAt:new Date().toISOString(),integrationHealth:health,scenarioResults,activationGate:gate,externalActionsOccurred:false};
  const publicationEvidence={release:bank.release,generatedAt:new Date().toISOString(),calendarSummary:{startDate:calendar.startDate,endDate:calendar.endDate,baseItems:calendar.baseItems,platformDrafts:calendar.platformDrafts,networks:calendar.networks},publicationRecords:calendar.records.map(record=>({id:record.id,day:record.day,plannedDate:record.plannedDate,planningWindow:record.planningWindow,platform:record.platform,status:record.status,asset:record.asset,providerReference:record.providerReference,publicationReference:record.publicationReference,publicationProof:record.publicationProof,externalActionOccurred:record.externalActionOccurred})),externalActionsOccurred:false};
  writeJson('revenue-growth-provider-readiness.json',providerEvidence);
  writeJson('revenue-growth-social-calendar.json',calendar);
  writeJson('revenue-growth-publication-records.json',publicationEvidence);
  writeJson('revenue-growth-accounting-acceptance.json',accounting);
  fs.writeFileSync(path.join(OUT,'revenue-growth-accounting-export.csv'),accounting.accountingCsv,'utf8');

  const evidence={
    status:failures.length?'HOLD':'PASS',
    release:registry.release,
    generatedAt:new Date().toISOString(),
    passed:passes.length,
    failed:failures.length,
    outputs:{providers:health.length,baseContentItems:calendar.baseItems,platformDrafts:calendar.platformDrafts,providerScenarioResults:scenarioResults.length,inquiryTasks:1,accountingRows:accounting.accountingRows.length,profitabilityRecords:accounting.profitability.length,attributionRecords:accounting.attribution.length},
    controls:{selectedRecordOnly:true,bulkExecution:false,automaticRetry:false,duplicateProtection:true,ownerApprovalRequired:true,providerHostedPaymentOnly:true,rawCardDataAllowed:false,advertisingSpendEnabled:false,finalDeliveryEnabled:false,externalActionsEnabled:false},
    exactBlockers:gate.blockers,
    externalActionsOccurred:false,
    passes,
    failures
  };
  writeJson('revenue-growth-launch-readiness-verification.json',evidence);
  console.log(JSON.stringify(evidence,null,2));
  process.exit(failures.length?1:0);
}

try{run();}catch(error){
  const crash={status:'CRASH',generatedAt:new Date().toISOString(),error:error.message,stack:error.stack,externalActionsOccurred:false};
  writeJson('revenue-growth-launch-readiness-verification.json',crash);
  console.error(JSON.stringify(crash,null,2));
  process.exit(1);
}
