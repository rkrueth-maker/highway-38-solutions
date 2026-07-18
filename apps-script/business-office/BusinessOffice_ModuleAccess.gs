/** Business Office package-module enforcement. Disabled modules are rejected server-side. */

function boAssertModuleEnabled_(moduleKey) {
  moduleKey = boNormalizeText_(moduleKey);
  if (!moduleKey || moduleKey === 'dashboard') return true;
  boAssert_(boModuleEnabled_(moduleKey), 'MODULE NOT INCLUDED — ' + moduleKey + ' is not enabled by the installed business package.');
  return true;
}

function boRequireModules_(moduleKeys) {
  (moduleKeys || []).forEach(function (moduleKey) { boAssertModuleEnabled_(moduleKey); });
  return true;
}

function boModuleFromRecordType_(recordType) {
  var key = boNormalizeText_(recordType).toLowerCase().replace(/[^a-z0-9]/g, '');
  var map = {
    request:'requests', requests:'requests', customer:'customers', customers:'customers', vendor:'vendors', vendors:'vendors',
    quote:'quotes', quotes:'quotes', workorder:'workOrders', workorders:'workOrders', job:'jobs', jobs:'jobs',
    purchaseorder:'purchaseOrders', purchaseorders:'purchaseOrders', po:'purchaseOrders', receipt:'receipts', receipts:'receipts',
    vendorbill:'vendorBills', vendorbills:'vendorBills', expense:'expenses', expenses:'expenses', invoice:'invoices', invoices:'invoices',
    payment:'payments', payments:'payments', time:'time', timeentry:'time', employee:'employees', employees:'employees',
    payroll:'payroll', contractor:'contractors', contractors:'contractors', tax:'tax', taxperiod:'tax', document:'documents', documents:'documents',
    journalentry:'accounting', accounting:'accounting', approval:'approvals', approvals:'approvals', report:'reports', reports:'reports', setup:'setup'
  };
  return map[key] || '';
}

function boGuardApiRequest_(action, args) {
  action = boNormalizeText_(action);
  args = args || {};
  var modules = [];
  if (/^(list|savedViews|save|voidRecord)$/.test(action)) modules.push(args.module);
  if (action === 'uxWorkspace') modules.push(args.module);
  if (action === 'uxPipeline') modules.push(args.type === 'sales' ? 'quotes' : 'jobs');
  if (action === 'createCustomerFromRequest') modules.push('requests','customers');
  if (/^(createQuote|createQuoteFast|reviseQuote|duplicateQuote|quoteBuilderDirectBootstrap|quoteBuilderCustomers|quoteBuilderDocuments|quoteBuilderQuoteDetails|quoteBuilderQuoteDocuments|quoteBuilderLastCreatedQuote|saveQuotePhoto|quoteBuilderPerformance|quoteBuilderDashboard|quoteBuilderPriceBook|quoteBuilderTemplates|prepareAiQuoteDraft|quoteBuilderPackage)$/.test(action)) modules.push('quotes');
  if (/^(quoteBuilderCustomers)$/.test(action)) modules.push('customers');
  if (/^(quoteBuilderPriceBook)$/.test(action)) modules.push('setup');
  if (/^(quoteBuilderTemplates|quoteBuilderDocuments|quoteBuilderQuoteDocuments|saveQuotePhoto)$/.test(action)) modules.push('documents');
  if (action === 'approve') modules.push('approvals', boModuleFromRecordType_(args.recordType));
  if (action === 'quoteToJob') modules.push('quotes','workOrders','jobs');
  if (action === 'jobToInvoice') modules.push('jobs','invoices');
  if (action === 'matchBill') modules.push('vendorBills','purchaseOrders');
  if (action === 'receiptToExpense') modules.push('receipts','expenses');
  if (action === 'recordPayment') modules.push('payments');
  if (action === 'prepareCustomerAction') modules.push(boModuleFromRecordType_(args.recordType));
  if (/^(prepareJournal|postJournal|reverseJournal|lockPeriod|accountingReports|validateLedger)$/.test(action)) modules.push('accounting');
  if (/^(preparePayroll|exportPayroll)$/.test(action)) modules.push('payroll');
  if (/^(prepareSalesTax|finalizeTax|taxSummary)$/.test(action)) modules.push('tax');
  if (/^(uploadDocument|previewDocument|extractDocument|reviewOcrField|approveDocument|voidDocument|generatePdf)$/.test(action)) modules.push('documents');
  if (/^(backup|prepareRestore)$/.test(action)) modules.push('backups');
  modules = modules.filter(Boolean).filter(function (value, index, list) { return list.indexOf(value) === index; });
  boRequireModules_(modules);
  return true;
}
