/** Business Office — private role-aware web application API. */

function doGet() { return boSafeExecute_('Business Office web app',function(){boGetCurrentUser_();return boRenderWebApp_();},'System',boGetBusinessId_()); }

function boRenderWebApp_(){
  const title=boBusinessOfficeTitle_(),branding=boBranding_();
  let html=HtmlService.createTemplateFromFile('BusinessOffice_Index').evaluate().getContent();
  html=html.replace('Business Office',title)
    .replace('--navy:#243447','--navy:'+branding.primaryColor)
    .replace('--blue:#52677d','--blue:'+branding.secondaryColor)
    .replace('<div class="notice"><strong>Controlled business system:</strong> customer sending, delivery, financial posting, payroll export, and tax report finalization require explicit approval. This system does not move money, fund payroll, file returns, or provide tax advice.</div>','<div class="notice"><strong>Controlled business system:</strong> '+boApprovalNotice_()+' This system does not move money, fund payroll, file returns, or provide tax advice.</div>')
    .replace('</body>',boInclude_('BusinessOffice_UX_Client')+boInclude_('BusinessOffice_QuoteBuilder_Client')+boInclude_('BusinessOffice_Unified_Client')+'</body>');
  return HtmlService.createHtmlOutput(html).setTitle(title).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport','width=device-width, initial-scale=1');
}

function boGetRenderedWebAppHtml(){boGetCurrentUser_();return boRenderWebApp_().getContent();}
function boInclude_(fileName){return HtmlService.createHtmlOutputFromFile(fileName).getContent();}
function boBootstrap_(){const definitions=boGetModuleDefinitions_();return{context:boGetClientContext(),dashboard:boGetOwnerDashboard_(),modules:boGetModuleNavigation_(definitions),definitions:definitions,savedViews:{quotes:boGetSavedViews('Quotes'),invoices:boGetSavedViews('Invoices')},quoteBuilder:boModuleEnabled_('quotes')?boQuoteBuilderPackage_():null};}
function boGetModuleNavigation_(definitions){const navigation=[{key:'dashboard',label:'Dashboard'}];Object.keys(definitions||{}).forEach(function(key){if(boModuleEnabled_(key))navigation.push({key:key,label:definitions[key].title||key});});return navigation;}

function boApi(request){
  const payload=request||{},action=boNormalizeText_(payload.action),args=payload.args||{};
  boGuardApiRequest_(action,args);
  const handlers={
    bootstrap:function(){return boBootstrap_();},
    list:function(){return boListRecords(args.module,args.options||{});},
    dashboard:function(){return boGetOwnerDashboard_();},
    uxDashboard:function(){return boUxDashboard_();},
    uxWorkspace:function(){return boUxWorkspace_(args.module,args.recordId);},
    uxSearch:function(){return boUxGlobalSearch_(args.query);},
    uxPipeline:function(){return boUxPipeline_(args.type);},
    savedViews:function(){return boGetSavedViews(args.module);},
    save:function(){return boSaveRecord(args.module,args.recordId||'',args.values||{});},
    voidRecord:function(){return boSoftVoidRecord_(H38_BO_MODULES[args.module]||args.module,args.recordId,args.reason);},
    createCustomerFromRequest:function(){return boCreateCustomerFromRequest(args.requestId);},
    createQuote:function(){return boCreateQuote(args.payload||{});},
    reviseQuote:function(){return boReviseQuote(args.quoteId,args.changes||{});},
    duplicateQuote:function(){return boDuplicateQuote_(args.quoteId);},
    quoteBuilderDashboard:function(){return boQuoteBuilderDashboard_();},
    quoteBuilderPriceBook:function(){return boQuoteBuilderPriceBook_(args.options||{});},
    quoteBuilderTemplates:function(){return boQuoteBuilderTemplates_();},
    prepareAiQuoteDraft:function(){return boPrepareAiQuoteDraft_(args.payload||{});},
    quoteBuilderPackage:function(){return boQuoteBuilderPackage_();},
    approve:function(){return boApproveSelectedRecord(args.recordType,args.recordId,args.approvalType,args.decision,args.notes||'');},
    quoteToJob:function(){return boConvertQuoteToWorkOrderAndJob(args.quoteId);},
    jobToInvoice:function(){return boCreateInvoiceFromJob(args.jobId);},
    matchBill:function(){return boMatchVendorBillToPurchaseOrder(args.billId,args.purchaseOrderId);},
    receiptToExpense:function(){return boConvertReceiptToExpense(args.receiptId);},
    recordPayment:function(){return boRecordPayment(args.payload||{});},
    prepareCustomerAction:function(){return boPrepareCustomerAction(args.recordType,args.recordId);},
    prepareJournal:function(){return boPrepareJournalEntry(args.payload||{});},
    postJournal:function(){return boPostJournalEntry(args.entryId);},
    reverseJournal:function(){return boReverseJournalEntry(args.entryId,args.reason||'');},
    lockPeriod:function(){return boLockAccountingPeriod(args.periodId,args.notes||'');},
    accountingReports:function(){return boGetAccountingReports();},
    validateLedger:function(){return boValidateLedger();},
    preparePayroll:function(){return boPreparePayrollPeriod(args.payload||{});},
    exportPayroll:function(){return boExportPayrollProviderCsv(args.periodId);},
    prepareSalesTax:function(){return boPrepareSalesTaxPeriod(args.payload||{});},
    finalizeTax:function(){return boFinalizeTaxPreparationReport(args.periodId);},
    taxSummary:function(){return boGetTaxPreparationSummary();},
    uploadDocument:function(){return boUploadDocument(args.payload||{});},
    previewDocument:function(){return boGetDocumentPreview(args.documentId);},
    extractDocument:function(){return boExtractDocument(args.documentId);},
    reviewOcrField:function(){return boReviewOcrField(args.ocrFieldId,args.approvedValue,args.notes||'');},
    approveDocument:function(){return boApproveDocument(args.documentId);},
    voidDocument:function(){return boVoidDocument(args.documentId,args.reason);},
    generatePdf:function(){return boGeneratePdf(args.documentType,args.recordId);},
    backup:function(){return boCreateBackup(args.label||'Manual');},
    prepareRestore:function(){return boPrepareRestore(args.backupFileId,args.notes||'');},
    validateInstallation:function(){return boValidateInstallation();},
    selfTest:function(){return boRunSelfTest();},
    pack:function(){return boGetPackSnapshot_();},
    isolation:function(){return boValidateResourceIsolation();}
  };
  boAssert_(handlers[action],'Unsupported Business Office action: '+action);
  return handlers[action]();
}

function boGetModuleDefinitions_(){return{
  requests:{title:'New Requests',primaryKey:'Request ID',fields:['Received Time','Source','Status','Approval Status','Name','Email','Phone','Desired Outcome','Product / Bundle ID','Next Action']},
  customers:{title:'Customers',primaryKey:'Customer ID',fields:['Customer Number','Display Name','Customer Type','Email','Phone','Payment Terms','Tax Status','Tags','Status','Attention Status','Notes']},
  vendors:{title:'Vendors',primaryKey:'Vendor ID',fields:['Vendor Number','Display Name','Vendor Type','Email','Phone','Payment Terms','Contractor Status','W-9 Status','Default Expense Account','Tags','Status']},
  quotes:{title:'Quotes & Proposals',primaryKey:'Quote ID',fields:['Quote Number','Customer ID','Project Title','Revision Number','Quote Date','Expiration Date','Status','Approval Status','Send Allowed','Customer Action','Payment Terms','Scope','Assumptions','Exclusions','Subtotal','Discount','Tax','Deposit','Total']},
  workOrders:{title:'Work Orders',primaryKey:'Work Order ID',fields:['Work Order Number','Quote ID','Job ID','Customer ID','Work Requested','Scope','Assigned User ID','Priority','Start Date','Due Date','Status','Approval Status','Customer Approval Status','Completion Checklist']},
  jobs:{title:'Jobs',primaryKey:'Job ID',fields:['Job Number','Customer ID','Work Order ID','Quote ID','Project Title','Status','Stage','Priority','Assigned User ID','Start Date','Due Date','Approval Status','Invoice Status','Revenue','Total Cost','Profit','Profit Margin']},
  purchaseOrders:{title:'Purchase Orders',primaryKey:'PO ID',fields:['PO Number','Vendor ID','Job ID','Order Date','Expected Date','Status','Approval Status','Ordered Status','Received Status','Subtotal','Tax','Shipping','Total','Vendor Bill Status']},
  receipts:{title:'Receipts',primaryKey:'Receipt ID',fields:['Document ID','Vendor ID','Receipt Number','Date','Payment Method','Subtotal','Tax','Total','Customer ID','Job ID','Expense Category','Account Code','Approval Status','Posting Status','OCR Status']},
  vendorBills:{title:'Vendor Bills',primaryKey:'Bill ID',fields:['Bill Number','Vendor ID','PO ID','Job ID','Bill Date','Due Date','Terms','Status','Approval Status','Payment Status','Subtotal','Tax','Shipping','Total','Balance Due','Document ID']},
  expenses:{title:'Expenses',primaryKey:'Expense ID',fields:['Receipt ID','Vendor ID','Date','Description','Expense Category','Account Code','Customer ID','Job ID','Payment Method','Subtotal','Tax','Total','Reimbursable','Billable to Customer','Approval Status','Posting Status']},
  invoices:{title:'Invoices',primaryKey:'Invoice ID',fields:['Invoice Number','Customer ID','Job ID','Quote ID','Invoice Date','Due Date','Payment Terms','Status','Approval Status','Send Allowed','Delivery Status','Subtotal','Discount','Tax Amount','Deposit Applied','Total','Amount Paid','Balance Due','Overdue Days']},
  payments:{title:'Payments',primaryKey:'Payment ID',fields:['Invoice ID','Customer ID','Job ID','Payment Date','Amount','Payment Method','Transaction Reference','Deposit Account','Status','Approval Status','Posting Status']},
  time:{title:'Time Tracking',primaryKey:'Time Entry ID',fields:['Employee ID','Job ID','Work Order ID','Date','Start Time','End Time','Break Minutes','Regular Hours','Overtime Hours','Pay Rate','Billable Rate','Approval Status','Payroll Period ID','Notes']},
  employees:{title:'Employees',primaryKey:'Employee ID',fields:['Employee Number','First Name','Last Name','Email','Phone','Employment Status','Pay Type','Hourly Rate','Salary Rate','Overtime Multiplier','Tax Profile Status','Hire Date','Status']},
  payroll:{title:'Payroll Preparation',primaryKey:'Payroll Period ID',fields:['Period Start','Period End','Pay Date','Status','Approval Status','Export Allowed','Gross Pay','Reimbursements','Deductions','Employer Cost Estimate','Payroll Tax Liability Estimate','Payroll Provider']},
  contractors:{title:'Contractors / W-9',primaryKey:'Contractor ID',fields:['Vendor ID','Display Name','Email','Phone','W9 Status','Payment Method','1099 Eligible','1099 Threshold','Status','Notes']},
  tax:{title:'Tax Preparation',primaryKey:'Tax Period ID',fields:['Tax Type','Jurisdiction','Period Start','Period End','Due Date','Status','Approval Status','Finalization Allowed','Taxable Sales','Exempt Sales','Tax Collected','Tax Adjustments','Estimated Liability','Payment Recorded','Missing Documents']},
  documents:{title:'Documents / OCR',primaryKey:'Document ID',fields:['File Name','MIME Type','Source Type','Source ID','Document Type','Upload State','OCR State','Review Status','Approval Status','Posted Status','Export Status','Is Voided','Access Classification','Uploaded Time']},
  accounting:{title:'Accounting Preparation',primaryKey:'Journal Entry ID',fields:['Entry Number','Entry Date','Source Type','Source ID','Description','Status','Approval Status','Posting Allowed','Accounting Period ID','Total Debit','Total Credit','Balance Difference','Balanced','Posted Time']},
  approvals:{title:'Approval Queue',primaryKey:'Approval ID',fields:['Record Type','Record ID','Approval Type','Required Role','Status','Decision','Decision By','Decision Time','Allowed Flag','Notes']},
  reports:{title:'Reports',primaryKey:'Metric',fields:['Metric','Amount']},
  setup:{title:'Setup / Product Controls',primaryKey:'Setup Item ID',fields:['Section','Setup Item','Required','Status','Owner / Role','Record Link or Reference','Completion Evidence','Notes']}
};}
