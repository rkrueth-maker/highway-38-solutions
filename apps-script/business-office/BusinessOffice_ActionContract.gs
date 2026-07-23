/**
 * Canonical Business Office API action contract.
 * Add or change API/module permission requirements here only.
 */
var H38_BO_ACTION_CONTRACT_VERSION = '2026-07-23-v1';

function boModuleFromRecordTypeContract_(recordType){
  var key=String(recordType||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  var aliases={
    request:'requests',requests:'requests',customer:'customers',customers:'customers',vendor:'vendors',vendors:'vendors',
    quote:'quotes',quotes:'quotes',workorder:'workOrders',workorders:'workOrders',job:'jobs',jobs:'jobs',
    purchaseorder:'purchaseOrders',purchaseorders:'purchaseOrders',po:'purchaseOrders',receipt:'receipts',receipts:'receipts',
    vendorbill:'vendorBills',vendorbills:'vendorBills',expense:'expenses',expenses:'expenses',invoice:'invoices',invoices:'invoices',
    payment:'payments',payments:'payments',time:'time',timeentry:'time',employee:'employees',employees:'employees',
    payroll:'payroll',contractor:'contractors',contractors:'contractors',tax:'tax',taxperiod:'tax',document:'documents',documents:'documents',
    journalentry:'accounting',accounting:'accounting',approval:'approvals',approvals:'approvals',report:'reports',reports:'reports',setup:'setup'
  };
  if(aliases[key])return aliases[key];
  if(typeof boGetUnifiedModule_==='function'){
    var module=boGetUnifiedModule_(key);
    if(module)return module.module;
  }
  return '';
}

function boGetUnifiedApiActionContract_(){
  return [
    {actions:/^(list|savedViews|save|voidRecord)$/,resolve:function(args){return[args.module];}},
    {actions:/^uxWorkspace$/,resolve:function(args){return[args.module];}},
    {actions:/^uxPipeline$/,resolve:function(args){return[args.type==='sales'?'quotes':'jobs'];}},
    {actions:/^createCustomerFromRequest$/,modules:['requests','customers']},
    {actions:/^(createQuote|createQuoteFast|reviseQuote|duplicateQuote|quoteBuilderDirectBootstrap|quoteBuilderCustomers|quoteBuilderDocuments|quoteBuilderQuoteDetails|quoteBuilderQuoteDocuments|quoteBuilderLastCreatedQuote|saveQuotePhoto|quoteBuilderPerformance|quoteBuilderDashboard|quoteBuilderPriceBook|quoteBuilderTemplates|prepareAiQuoteDraft|buildAiQuoteDraft|createAiCompletionVisual|quoteBuilderPackage|quoteCommercialState|quoteCommercialSave|quoteCommercialTransition|quoteCommercialPrepareShare|quoteCommercialPreview|quoteCommercialFollowUp)$/,modules:['quotes']},
    {actions:/^quoteBuilderCustomers$/,modules:['customers']},
    {actions:/^quoteBuilderPriceBook$/,modules:['setup']},
    {actions:/^(quoteBuilderTemplates|quoteBuilderDocuments|quoteBuilderQuoteDocuments|saveQuotePhoto|quoteCommercialPreview|createAiCompletionVisual)$/,modules:['documents']},
    {actions:/^approve$/,resolve:function(args){return['approvals',boModuleFromRecordTypeContract_(args.recordType)];}},
    {actions:/^quoteToJob$/,modules:['quotes','workOrders','jobs']},
    {actions:/^jobToInvoice$/,modules:['jobs','invoices']},
    {actions:/^matchBill$/,modules:['vendorBills','purchaseOrders']},
    {actions:/^receiptToExpense$/,modules:['receipts','expenses']},
    {actions:/^recordPayment$/,modules:['payments']},
    {actions:/^prepareCustomerAction$/,resolve:function(args){return[boModuleFromRecordTypeContract_(args.recordType)];}},
    {actions:/^(prepareJournal|postJournal|reverseJournal|lockPeriod|accountingReports|validateLedger)$/,modules:['accounting']},
    {actions:/^(preparePayroll|exportPayroll)$/,modules:['payroll']},
    {actions:/^(prepareSalesTax|finalizeTax|taxSummary)$/,modules:['tax']},
    {actions:/^(uploadDocument|previewDocument|extractDocument|reviewOcrField|approveDocument|voidDocument|generatePdf)$/,modules:['documents']},
    {actions:/^(backup|prepareRestore)$/,modules:['backups']},
    {actions:/^(aiBootstrap|aiChat|aiCommand|aiActionCatalog|aiPrepareAction|aiConfirmAction|aiCoach|aiEmailBrief|aiPrepareEmail|aiSendEmail|aiSaveLayout|aiTelemetry|aiRecommendations)$/,modules:['h38Ai']},
    {actions:/^(bootstrap|dashboard|uxDashboard|uxSearch|appCatalog|app|pack|validateInstallation|selfTest|isolation)$/,modules:['commandCenter']}
  ];
}

function boModulesForApiAction_(action,args){
  action=String(action||'').trim();args=args||{};
  var modules=[];
  boGetUnifiedApiActionContract_().forEach(function(rule){
    if(!rule.actions.test(action))return;
    var resolved=typeof rule.resolve==='function'?rule.resolve(args):(rule.modules||[]);
    modules=modules.concat(resolved||[]);
  });
  return modules.filter(Boolean).map(function(value){return String(value).trim();}).filter(function(value,index,list){return list.indexOf(value)===index;});
}
