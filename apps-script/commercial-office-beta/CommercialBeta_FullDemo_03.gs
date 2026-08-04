/**
 * Resumable owner-only full-demo operations used by controlled acceptance.
 * Each call runs a bounded idempotent slice of the existing real seeder.
 */
function cbDemo8WithSelection_(projects,packages,callback){
  var originalProjects=cbDemo8Projects_,originalPackages=cbDemo8CabinPackages_;
  try{
    cbDemo8Projects_=function(){return(projects||[]).slice();};
    cbDemo8CabinPackages_=function(){return(packages||[]).slice();};
    return callback();
  }finally{
    cbDemo8Projects_=originalProjects;
    cbDemo8CabinPackages_=originalPackages;
  }
}
function cbCompletionSeedFullDemoBatch_(request){
  var input=request||{},context=cbCompletionContext_(input.businessId,'manageSettings');
  cbAssert_(context.user.owner===true,'Only the owner can load full demo examples.');
  cbCompletionEnsureParitySchema_(context);
  var phase=cbText_(input.phase).toLowerCase(),projectKey=cbText_(input.projectKey).toUpperCase(),allProjects=cbDemo8Projects_(),allPackages=cbDemo8CabinPackages_(),project=projectKey?allProjects.find(function(item){return item.key===projectKey;}):null,result={status:'PASS',phase:phase,projectKey:projectKey,businessId:context.row['Business ID'],approved:false,sent:false,published:false,fundsMoved:false,externalActionsEnabled:false,productionDataMigrated:false};
  if(phase==='core'&&project){
    result.core=cbDemo8WithSelection_([project],[],function(){return cbDemo8SeedCore_(context);});
  }else if(phase==='core-packages'){
    var start=Math.max(0,Number(input.start||0)),count=Math.max(1,Math.min(Number(input.count||4),5)),packages=allPackages.slice(start,start+count);
    cbAssert_(packages.length>0,'No cabin package records remain in this batch.');
    result.start=start;result.count=packages.length;result.core=cbDemo8WithSelection_([],packages,function(){return cbDemo8SeedCore_(context);});
  }else if((phase==='catalog'||phase==='operations'||phase==='finance')&&project){
    result[phase]=cbDemo8WithSelection_([project],[],function(){
      if(phase==='catalog')return cbDemo8SeedCatalog_(context);
      if(phase==='operations')return cbDemo8SeedOperations_(context);
      return cbDemo8SeedFinance_(context);
    });
  }else throw new Error('A valid full-demo batch phase and project key are required.');
  cbAudit_(context.row['Business ID'],'SEED FULL DEMO BATCH','Business',context.row['Business ID'],'PASS','Phase '+phase+(projectKey?' project '+projectKey:'')+' completed. Controlled demo records only.');
  return result;
}
function cbFullDemoRows_(context,book,sheet,limit){return cbCompletionListRows_(context,book,sheet,limit||1000);}
function cbFullDemoAcceptanceSnapshot_(request){
  var input=request||{},context=cbCompletionContext_(input.businessId,'manageSettings'),group=cbText_(input.group).toLowerCase(),data={status:'PASS',acceptance:'FULL_DEMO_SCOPED_SNAPSHOT',group:group,businessId:context.row['Business ID'],readOnly:true,externalActionsEnabled:false,productionDataMigrated:false};
  cbCompletionEnsureParitySchema_(context);
  if(group==='projects'){
    data.customers=cbFullDemoRows_(context,'core','customers',600);data.contacts=cbFullDemoRows_(context,'core','contacts',600);data.properties=cbFullDemoRows_(context,'core','properties',600);data.requests=cbFullDemoRows_(context,'core','requests',500);data.jobs=cbFullDemoRows_(context,'core','jobs',600);data.workOrders=cbFullDemoRows_(context,'core','workOrders',600);data.tasks=cbFullDemoRows_(context,'core','tasks',800);data.scheduleEvents=cbFullDemoRows_(context,'core','scheduleEvents',600);data.timeEntries=cbFullDemoRows_(context,'core','timeEntries',600);data.jobNotes=cbFullDemoRows_(context,'core','jobNotes',600);
  }else if(group==='quotes'){
    data.customers=cbFullDemoRows_(context,'core','customers',600);data.quotes=cbCompletionQuoteView_(context);data.measurements=cbFullDemoRows_(context,'core','measurements',800);data.measurementPoints=cbFullDemoRows_(context,'core','measurementPoints',1200);data.documents=cbFullDemoRows_(context,'core','documents',800);data.attachments=cbFullDemoRows_(context,'core','attachments',800);data.documentLinks=cbFullDemoRows_(context,'core','documentLinks',800);data.approvals=cbFullDemoRows_(context,'core','approvals',500);data.proofLog=cbCompletionProofRows_(context);
  }else if(group==='communications'){
    var communications=cbCompletionCommunicationView_(context);data.conversations=communications.conversations;data.messages=communications.messages;data.emailThreads=communications.emailThreads;data.emailMessages=communications.emailMessages;data.smsThreads=communications.smsThreads;data.smsMessages=communications.smsMessages;data.portalThreads=communications.portalThreads;data.portalMessages=communications.portalMessages;data.workflows=cbFullDemoRows_(context,'core','workflows',300);data.workflowSteps=cbFullDemoRows_(context,'core','workflowSteps',600);data.checklists=cbFullDemoRows_(context,'core','checklists',300);data.checklistItems=cbFullDemoRows_(context,'core','checklistItems',600);data.aiConversations=cbFullDemoRows_(context,'core','aiConversations',300);data.aiMessages=cbFullDemoRows_(context,'core','aiMessages',600);data.voiceQueue=cbFullDemoRows_(context,'core','voiceQueue',300);data.actionQueue=cbFullDemoRows_(context,'core','actionQueue',300);data.notifications=cbFullDemoRows_(context,'core','notifications',300);
  }else if(group==='catalog'){
    data.priceBook=cbFullDemoRows_(context,'inventory','items',1000);data.inventoryTransactions=cbFullDemoRows_(context,'inventory','transactions',500);data.materialRequests=cbFullDemoRows_(context,'inventory','materialRequests',300);data.vendors=cbFullDemoRows_(context,'inventory','vendors',500);data.purchaseOrders=cbFullDemoRows_(context,'inventory','purchaseOrders',500);data.purchaseOrderLines=cbFullDemoRows_(context,'inventory','purchaseOrderLines',1000);data.receipts=cbFullDemoRows_(context,'inventory','receipts',500);data.reservations=cbFullDemoRows_(context,'inventory','reservations',500);data.priceBookSnapshots=cbFullDemoRows_(context,'core','priceBookSnapshots',100);
  }else if(group==='assets'){
    data.assets=cbFullDemoRows_(context,'assets','assets',800);data.assignments=cbFullDemoRows_(context,'assets','assignments',500);data.maintenance=cbFullDemoRows_(context,'assets','maintenance',500);data.inspections=cbFullDemoRows_(context,'assets','inspections',500);data.vehicles=cbFullDemoRows_(context,'assets','vehicles',300);data.usageLogs=cbFullDemoRows_(context,'assets','usageLogs',500);data.jobEquipment=cbFullDemoRows_(context,'assets','jobEquipment',500);data.servicePlans=cbFullDemoRows_(context,'assets','servicePlans',500);data.fuelLogs=cbFullDemoRows_(context,'assets','fuelLogs',500);
  }else if(group==='finance'){
    data.invoices=cbFullDemoRows_(context,'core','invoices',500);data.invoiceLines=cbFullDemoRows_(context,'core','invoiceLines',1000);data.payments=cbFullDemoRows_(context,'core','payments',500);data.expenses=cbFullDemoRows_(context,'core','expenses',500);data.employees=cbFullDemoRows_(context,'core','employees',500);data.accountingPeriods=cbFullDemoRows_(context,'core','accountingPeriods',200);data.payrollPeriods=cbFullDemoRows_(context,'core','payrollPeriods',200);data.payrollLines=cbFullDemoRows_(context,'core','payrollLines',1000);data.payrollDeductions=cbFullDemoRows_(context,'core','payrollDeductions',500);data.taxPeriods=cbFullDemoRows_(context,'core','taxPeriods',300);data.missingDocuments=cbFullDemoRows_(context,'core','missingDocuments',500);data.backups=cbFullDemoRows_(context,'core','backups',300);data.reports=cbFullDemoRows_(context,'core','reports',300);
  }else if(group==='social'){
    data.socialAccounts=cbFullDemoRows_(context,'core','socialAccounts',100);data.socialPosts=cbFullDemoRows_(context,'core','socialPosts',800);data.socialMetrics=cbFullDemoRows_(context,'core','socialMetrics',1000);data.campaigns=cbFullDemoRows_(context,'core','campaigns',300);data.socialApprovals=cbFullDemoRows_(context,'core','socialApprovals',500);data.featureRequests=cbFullDemoRows_(context,'core','featureRequests',300);data.integrationHealth=cbFullDemoRows_(context,'core','integrationHealth',300);
  }else throw new Error('Unsupported full-demo snapshot group.');
  return data;
}
