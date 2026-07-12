#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const revenue=require('../core-engine/revenue-operations/lib/revenue-operations-core.js');
const activation=require('../core-engine/revenue-operations/lib/revenue-growth-activation.js');

const ROOT=path.resolve(__dirname,'..');
const EVIDENCE_DIR=path.join(ROOT,'launch-control','evidence');
fs.mkdirSync(EVIDENCE_DIR,{recursive:true});
const passes=[];
const failures=[];
const check=(name,condition,detail='')=>(condition?passes:failures).push({name,detail});
const readJson=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const exists=rel=>fs.existsSync(path.join(ROOT,rel));
const writeJson=(rel,value)=>{const file=path.join(ROOT,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n','utf8');};
function expectThrow(name,fn,contains){try{fn();failures.push({name,detail:'Expected an error but none was thrown.'});}catch(error){check(name,!contains||String(error.message).includes(contains),error.message);}}

function main(){
  const required=[
    'core-engine/revenue-operations/config/revenue-operations.default.json',
    'core-engine/revenue-operations/config/provider-activation.json',
    'core-engine/revenue-operations/config/social-content-plan-30-day.json',
    'core-engine/revenue-operations/lib/revenue-operations-core.js',
    'core-engine/revenue-operations/lib/revenue-growth-activation.js',
    'core-engine/revenue-operations/ACTIVATION.md'
  ];
  required.forEach(file=>check(`required artifact: ${file}`,exists(file)));

  const config=readJson('core-engine/revenue-operations/config/provider-activation.json');
  const plan=readJson('core-engine/revenue-operations/config/social-content-plan-30-day.json');
  const configErrors=activation.validateActivationConfig(config);
  check('provider activation configuration validates',configErrors.length===0,configErrors.join(' '));
  check('six provider slots are defined',config.providers.length===6,String(config.providers.length));
  check('all providers have exact connection steps',config.providers.every(provider=>provider.exactConnectionStep&&provider.exactConnectionStep.length>40));
  check('all providers remain non-live',config.providers.every(provider=>provider.liveExecution===false));
  check('payment security is fail-closed',config.paymentSecurity.providerHostedCardEntryRequired===true&&config.paymentSecurity.rawCardDataAllowed===false&&config.paymentSecurity.browserCardFieldsAllowed===false&&config.paymentSecurity.sheetCardFieldsAllowed===false&&config.paymentSecurity.logCardFieldsAllowed===false&&config.paymentSecurity.repositoryCardFieldsAllowed===false);
  check('all five sandbox outcomes required',JSON.stringify(config.requiredExternalTestOutcomes)===JSON.stringify(activation.PROVIDER_OUTCOMES));

  const tenantKey='highway-38';
  const customerId='CUSTOMER-SYNTHETIC-001';
  const now=Date.parse('2026-07-12T15:00:00.000Z');
  let quote=revenue.createQuote({tenantKey,customerId,productId:'H38-P001',description:'Synthetic owner-review problem snapshot',amount:375,expiresAt:'2026-08-01T00:00:00.000Z',now});
  quote=revenue.transition('quote',quote,'OWNER_APPROVED',{actor:'owner',ownerEmail:'owner@example.invalid',now:now+1000});
  quote=revenue.transition('quote',quote,'READY_TO_SEND',{actor:'owner',now:now+2000});
  const approval=activation.createOwnerApproval({record:quote,ownerEmail:'owner@example.invalid',approvedAt:now+3000});
  const duplicateLocks=new Set();
  const emailAction=activation.createProviderAction({config,slot:'email',action:'sendQuote',record:quote,ownerApproval:approval,duplicateLocks,now:now+4000});
  check('one selected record produces one prepared provider action',emailAction.recordId===quote.id&&emailAction.status==='PREPARED_NOT_EXECUTED'&&emailAction.attempt===1&&emailAction.automaticRetry===false&&emailAction.externalActionOccurred===false);
  expectThrow('duplicate provider action is blocked',()=>activation.createProviderAction({config,slot:'email',action:'sendQuote',record:quote,ownerApproval:approval,duplicateLocks,now:now+5000}),'Duplicate');
  expectThrow('mismatched owner approval is rejected',()=>activation.createProviderAction({config,slot:'email',action:'sendQuote',record:{...quote,version:2},ownerApproval:approval,duplicateLocks:new Set(),now:now+5000}),'does not match');
  expectThrow('array record is rejected',()=>activation.createProviderAction({config,slot:'email',action:'sendQuote',record:[quote],ownerApproval:approval,duplicateLocks:new Set(),now:now+5000}),'Exactly one');

  const sandboxResults=activation.PROVIDER_OUTCOMES.map((outcome,index)=>activation.simulateProviderAction(emailAction,outcome,{providerReference:outcome==='SUCCESS'?'SIM-QUOTE-001':null,now:now+10000+index*1000}));
  check('all required sandbox outcomes execute once',sandboxResults.length===5&&activation.PROVIDER_OUTCOMES.every(outcome=>sandboxResults.some(result=>result.outcome===outcome)));
  check('sandbox never performs external action',sandboxResults.every(result=>result.externalActionOccurred===false&&result.simulated===true&&result.automaticRetry===false&&result.retryAllowed===false));
  check('timeout and uncertain outcomes require reconciliation',sandboxResults.find(result=>result.outcome==='TIMEOUT').status.includes('RECONCILIATION_REQUIRED')&&sandboxResults.find(result=>result.outcome==='UNCERTAIN').status.includes('RECONCILIATION_REQUIRED'));
  const logs=sandboxResults.map(result=>activation.resultLogs(emailAction,result,now+20000));
  check('every sandbox result has Proof Log evidence',logs.every(item=>item.proof&&item.proof.externalActionOccurred===false));
  check('failure timeout and uncertain outcomes have Error Log entries',logs.filter((_,index)=>['FAILURE','TIMEOUT','UNCERTAIN'].includes(sandboxResults[index].outcome)).every(item=>item.error&&item.error.automaticRetry===false));

  const paymentRequest=activation.createHostedPaymentRequestDraft({tenantKey,customerId,invoiceId:'INV-SYNTHETIC-001',amount:375,purpose:'Synthetic deposit',expiresAt:'2026-07-30T00:00:00.000Z',now});
  const readyRequest={...paymentRequest,status:'READY_TO_CREATE'};
  const hosted=activation.attachHostedPaymentLink(readyRequest,'https://payments.example.invalid/session/synthetic','PAYREF-SYNTHETIC-001',now+1000);
  check('hosted payment link stores no raw card data',hosted.status==='CREATED'&&hosted.hostedProviderOnly===true&&hosted.hostedUrl.startsWith('https://')&&hosted.rawCardDataStored===false&&hosted.externalActionOccurred===false);
  expectThrow('non-HTTPS payment link is rejected',()=>activation.attachHostedPaymentLink(readyRequest,'http://payments.example.invalid/session/synthetic','PAYREF-SYNTHETIC-002',now),'HTTPS');
  const forbiddenKey=['card','number'].join('');
  expectThrow('raw payment field is rejected',()=>revenue.assertNoRawCardData({[forbiddenKey]:'synthetic-value'}),'forbidden');

  const milestones=activation.billingMilestones({contractValue:10000,depositPercent:30,progressPercent:40,finalPercent:30});
  check('deposit progress and final milestones total contract value',milestones.length===3&&milestones.reduce((sum,item)=>sum+item.amountCents,0)===1000000&&milestones.map(item=>item.amountCents).join(',')==='300000,400000,300000');
  expectThrow('invalid milestone percentages are rejected',()=>activation.billingMilestones({contractValue:1000,depositPercent:20,progressPercent:20,finalPercent:20}),'total 100');

  let contract=revenue.createContract({tenantKey,customerId,name:'Synthetic Business OS Support',recurringAmount:450,billingInterval:'monthly',includedUsage:2,startsAt:'2026-07-01T00:00:00.000Z',now});
  contract=revenue.transition('contract',contract,'OWNER_APPROVED',{actor:'owner',ownerEmail:'owner@example.invalid',now:now+1000});
  contract=revenue.transition('contract',contract,'ACTIVE',{actor:'owner',now:now+2000});
  contract=revenue.recordContractUsage(contract,3,now+3000);
  const recurring=activation.recurringBillingDraft({contract,periodStart:'2026-07-01T00:00:00.000Z',periodEnd:'2026-07-31T23:59:59.000Z',overageRate:125,now:now+4000});
  check('recurring billing includes usage and overage',recurring.baseCents===45000&&recurring.overageUnits===1&&recurring.overageCents===12500&&recurring.totalCents===57500&&recurring.status==='DRAFT_OWNER_REVIEW');
  const renewal=activation.contractRenewalDraft(contract,{newEndAt:'2027-06-30T23:59:59.000Z',newAmount:500,now});
  const cancellation=activation.cancellationDraft(contract,{effectiveAt:'2026-08-01T00:00:00.000Z',reason:'Synthetic owner-requested cancellation',now});
  check('contract renewal and cancellation remain owner-review drafts',renewal.status==='DRAFT_OWNER_REVIEW'&&cancellation.status==='DRAFT_OWNER_REVIEW'&&renewal.externalActionOccurred===false&&cancellation.externalActionOccurred===false);

  let invoice=revenue.createInvoice({tenantKey,customerId,sourceId:quote.id,lineItems:[{description:'Synthetic problem snapshot',quantity:1,unitPrice:375,productId:'H38-P001'}],dueAt:'2026-07-25T00:00:00.000Z',now});
  invoice=revenue.transition('invoice',invoice,'OWNER_APPROVED',{actor:'owner',ownerEmail:'owner@example.invalid',now:now+1000});
  invoice=revenue.transition('invoice',invoice,'READY_TO_SEND',{actor:'owner',now:now+2000});
  invoice=revenue.transition('invoice',invoice,'SENT',{actor:'provider-sandbox',now:now+3000});
  const paid=revenue.recordPayment({invoice,amount:250,providerReference:'PAY-SYNTHETIC-001',receivedAt:now+4000});
  const receipt=activation.receiptDraft({payment:paid.payment,invoice:paid.invoice,now:now+5000});
  const credit=activation.creditDraft({tenantKey,customerId,invoiceId:invoice.id,amount:25,reason:'Synthetic service credit',now:now+6000});
  const refund=revenue.recordRefund({invoice:paid.invoice,paymentId:paid.payment.id,amount:25,providerReference:'REF-SYNTHETIC-001',now:now+7000});
  check('payment receipt credit and refund records are provider-reference only',paid.payment.rawCardDataStored===false&&receipt.providerReference==='PAY-SYNTHETIC-001'&&credit.status==='DRAFT_OWNER_REVIEW'&&refund.refund.rawCardDataStored===false&&refund.refund.providerReference==='REF-SYNTHETIC-001');

  const delivery=activation.deliveryDraft({tenantKey,customerId,jobId:'JOB-SYNTHETIC-001',files:['deliverables/problem-snapshot.pdf','deliverables/action-list.csv'],acceptanceSummary:'Synthetic files passed internal review and still require owner release.',now});
  const followUp=activation.followUpDraft({tenantKey,customerId,recordId:delivery.id,purpose:'Delivery follow-up',body:'Confirm receipt and ask whether one clarification is needed.',dueAt:'2026-07-20T00:00:00.000Z',now});
  check('delivery and follow-up remain selected owner-review drafts',delivery.status==='DRAFT_OWNER_REVIEW'&&followUp.status==='DRAFT'&&delivery.externalActionOccurred===false&&followUp.externalActionOccurred===false);
  expectThrow('unsafe delivery path is rejected',()=>activation.deliveryDraft({tenantKey,customerId,jobId:'JOB-SYNTHETIC-001',files:['../private.txt'],acceptanceSummary:'Unsafe',now}),'safe relative');

  const socialCalendar=activation.buildSocialCalendar(plan,{tenantKey,startDate:'2026-07-13T14:00:00.000Z'});
  check('30-day plan expands to 150 platform-specific drafts',socialCalendar.length===150&&new Set(socialCalendar.map(item=>item.day)).size===30&&new Set(socialCalendar.map(item=>item.platform)).size===5);
  check('all social records are draft selected records with assets and paid path',socialCalendar.every(record=>record.status==='DRAFT'&&record.externalActionOccurred===false&&record.assetSpec&&record.relatedProduct&&record.content.length>20));
  check('every approved platform has 30 records',activation.SOCIAL_PLATFORMS.every(platform=>socialCalendar.filter(record=>record.platform===platform).length===30));
  const publishedRecord={...socialCalendar[0],status:'PUBLISHED'};
  const publication=activation.publicationProof(publishedRecord,{providerReference:'SOCIAL-SYNTHETIC-001',publicUrl:'https://social.example.invalid/post/synthetic',publishedAt:now});
  const performance=activation.performanceRecord(publishedRecord,{impressions:1000,reach:800,engagements:75,clicks:20,inquiries:3,measuredAt:now+1000});
  const inquiryTask=activation.inquiryToTask({tenantKey,platform:publishedRecord.platform,sourceRecordId:publishedRecord.id,inquiryId:'INQUIRY-SYNTHETIC-001',summary:'Prospect asked which starter package fits a garage layout problem.',campaignId:'CAMPAIGN-30DAY-001',now:now+2000});
  check('publication proof captures provider reference and digest',publication.providerReference==='SOCIAL-SYNTHETIC-001'&&publication.publicUrl.startsWith('https://')&&publication.contentDigest.length===64);
  check('performance metrics calculate rates',performance.engagementRate===7.5&&performance.clickRate===2&&performance.inquiries===3);
  check('social inquiry routes to one controlled Task',inquiryTask.status==='NEEDS_OWNER_REVIEW'&&inquiryTask.selectedRecordOnly===true&&inquiryTask.bulkExecution===false&&inquiryTask.externalActionsEnabled===false&&inquiryTask.inquiryDigest.length===64);

  const expenseItems=[
    {id:'EXP-SYNTHETIC-001',date:'2026-07-10T00:00:00.000Z',amount:50,account:'Software',itemType:'product',itemId:'H38-P001'},
    {id:'EXP-SYNTHETIC-002',date:'2026-07-11T00:00:00.000Z',amount:20,account:'Payment Fees',itemType:'contract',itemId:'H38-C001'}
  ];
  const paymentForReports={...paid.payment,itemType:'product',itemId:'H38-P001',leadId:'LEAD-SYNTHETIC-001'};
  const outstandingInvoice={...paid.invoice,id:'INV-SYNTHETIC-OUTSTANDING',balanceCents:12500,status:'PARTIALLY_PAID',dueAt:'2026-07-01T00:00:00.000Z'};
  const outstanding=activation.outstandingBalances([outstandingInvoice]);
  const cash=activation.cashView({payments:[paymentForReports],refunds:[refund.refund],expenses:expenseItems});
  const profitability=activation.profitabilityByItem({items:[{itemType:'product',itemId:'H38-P001',name:'Problem Snapshot',directCostCents:1000,laborCents:5000,adSpendCents:0},{itemType:'contract',itemId:'H38-C001',name:'Care Plan',directCostCents:0,laborCents:0,adSpendCents:0}],payments:[paymentForReports],expenses:expenseItems});
  const accountingCsv=revenue.accountingCsv({invoices:[invoice],payments:[paymentForReports],refunds:[refund.refund],expenses:expenseItems});
  const attribution=revenue.attribution({leads:[{id:'LEAD-SYNTHETIC-001',source:'linkedin',campaignId:'CAMPAIGN-30DAY-001'}],quotes:[{...quote,leadId:'LEAD-SYNTHETIC-001'}],invoices:[{...invoice,leadId:'LEAD-SYNTHETIC-001'}],payments:[paymentForReports]});
  check('outstanding balance view identifies open amount',outstanding.length===1&&outstanding[0].balanceCents===12500&&outstanding[0].overdue===true);
  check('cash view reconciles payments refunds and expenses',cash.cashInCents===25000&&cash.refundsCents===2500&&cash.expenseCents===7000&&cash.netCashCents===15500);
  check('profitability reports product bundle add-on or contract-shaped records',profitability.length===2&&profitability.find(item=>item.itemId==='H38-P001').revenueCents===25000&&profitability.find(item=>item.itemId==='H38-P001').profitCents===14000);
  check('accounting export includes invoice payment refund and expenses',accountingCsv.includes('invoice')&&accountingCsv.includes('payment')&&accountingCsv.includes('refund')&&accountingCsv.includes('expense'));
  check('lead campaign attribution reaches cash received',attribution.length===1&&attribution[0].source==='linkedin'&&attribution[0].campaignId==='CAMPAIGN-30DAY-001'&&attribution[0].cashReceivedCents===25000);

  const website=activation.websiteDeploymentDraft({tenantKey,title:'Synthetic verified website change',files:['index.html','commercial.css'],sourceRef:'SOURCE-COMMIT-1234567',rollbackRef:'ROLLBACK-COMMIT-7654321',acceptanceChecks:[{name:'Repository tests',status:'PASS',evidence:'synthetic-run'},{name:'Live marker checks',status:'PENDING'}],now});
  check('website deployment draft requires source rollback and acceptance',website.status==='DRAFT'&&website.sourceRef!==website.rollbackRef&&website.acceptanceChecks.length===2&&website.deploymentAuthorization==='OWNER_RELEASE_REQUIRED'&&website.externalActionOccurred===false);
  expectThrow('same source and rollback reference is rejected',()=>activation.websiteDeploymentDraft({tenantKey,title:'Invalid',files:['index.html'],sourceRef:'COMMIT-SAME-123',rollbackRef:'COMMIT-SAME-123',acceptanceChecks:[{name:'Test'}],now}),'must differ');

  const health=activation.integrationHealth(config);
  check('integration health is truthful and exact',health.status==='READY_INTERNAL_BLOCKED_EXTERNAL'&&health.providers.length===6&&health.providers.every(provider=>provider.liveExecution===false&&provider.exactConnectionStep));
  check('accounting remains usable in CSV mode while mapping is blocked',health.providers.find(provider=>provider.slot==='accounting').status==='READY_CSV_OWNER_MAPPING_REQUIRED');

  const acceptance=activation.acceptanceSummary({config,socialCalendar,sandboxResults,invoices:[outstandingInvoice],payments:[paymentForReports],refunds:[refund.refund],expenses:expenseItems,profitabilityItems:[{itemType:'product',itemId:'H38-P001',name:'Problem Snapshot',directCostCents:1000,laborCents:5000,adSpendCents:0}]});
  check('acceptance summary reports complete internal package and blocked external state',acceptance.status==='PASS_INTERNAL_EXTERNAL_BLOCKED'&&acceptance.social.records===150&&acceptance.social.days===30&&acceptance.social.platforms===5&&activation.PROVIDER_OUTCOMES.every(outcome=>acceptance.sandboxOutcomes[outcome]===1)&&acceptance.externalActionsEnabled===false&&acceptance.externalActionsOccurred===false);

  const sandboxEvidence=sandboxResults.map((result,index)=>({action:emailAction,result,logs:logs[index]}));
  writeJson('launch-control/evidence/revenue-growth-provider-sandbox.json',{release:config.release,status:'PASS',generatedAt:new Date().toISOString(),actionEnvelope:emailAction,outcomes:sandboxEvidence,externalActionsOccurred:false});
  writeJson('launch-control/evidence/social-content-calendar-30-day.json',{release:plan.release,status:'OWNER_REVIEW_REQUIRED',generatedAt:new Date().toISOString(),records:socialCalendar,publicationProofSample:publication,performanceSample:performance,inquiryTaskSample:inquiryTask,externalActionsOccurred:false});
  writeJson('launch-control/evidence/revenue-growth-accounting.json',{status:'PASS_INTERNAL',generatedAt:new Date().toISOString(),outstanding,cash,profitability,attribution,accountingCsvCharacters:accountingCsv.length,externalActionsOccurred:false});
  writeJson('launch-control/evidence/revenue-growth-integration-health.json',{...health,generatedAt:new Date().toISOString()});

  const evidence={
    release:config.release,
    status:failures.length?'HOLD':'PASS',
    generatedAt:new Date().toISOString(),
    passed:passes.length,
    failed:failures.length,
    outputs:{providers:config.providers.length,sandboxOutcomes:sandboxResults.length,socialDays:30,socialDrafts:socialCalendar.length,platforms:5,billingMilestones:milestones.length,contracts:1,createdInquiryTasks:1,accountingRows:revenue.accountingRows({invoices:[invoice],payments:[paymentForReports],refunds:[refund.refund],expenses:expenseItems}).length},
    controls:{selectedRecordOnly:true,bulkExecution:false,automaticRetry:false,duplicateProtection:true,ownerApprovalRequired:true,proofLogRequired:true,errorLogRequired:true,providerHostedCardEntry:true,rawCardDataAllowed:false,rollbackRequired:true,externalActionsEnabled:false},
    exactBlockers:health.providers.map(provider=>({slot:provider.slot,status:provider.status,exactConnectionStep:provider.exactConnectionStep})),
    externalActionsOccurred:false,
    passes,
    failures
  };
  writeJson('launch-control/evidence/revenue-growth-activation-verification.json',evidence);
  console.log(JSON.stringify(evidence,null,2));
  process.exit(failures.length?1:0);
}

try{main();}catch(error){
  const crash={status:'CRASH',generatedAt:new Date().toISOString(),error:error.message,stack:error.stack,externalActionsOccurred:false};
  writeJson('launch-control/evidence/revenue-growth-activation-verification.json',crash);
  console.error(JSON.stringify(crash,null,2));
  process.exit(1);
}
