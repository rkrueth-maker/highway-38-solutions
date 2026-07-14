/** Generated neutral starter business pack. Replace placeholders during new-business setup. */
const BO_EMBEDDED_BUSINESS_PACK = Object.freeze({
  schemaVersion: 1,
  packId: 'template-business',
  business: Object.freeze({ id: 'NEWBUSINESS', legalName: 'New Business', publicName: 'New Business', timeZone: 'America/Chicago' }),
  branding: Object.freeze({ logoUrl:'', primaryColor:'#243447', secondaryColor:'#52677d', accentColor:'#c79a3b' }),
  contacts: Object.freeze({ ownerEmailProperty:'BUSINESS_OFFICE_OWNER_EMAIL', publicEmail:'' }),
  urls: Object.freeze({ website:'', ownerPortal:'' }),
  modules: Object.freeze({ requests:true, customers:true, vendors:true, quotes:true, workOrders:true, jobs:true, purchaseOrders:true, vendorBills:true, invoices:true, payments:true, receipts:true, expenses:true, documents:true, accounting:true, payroll:true, tax:true, reports:true, approvals:true, backups:true }),
  roles: Object.freeze({ names:Object.freeze(['Owner','Administrator','Staff','Bookkeeper','Payroll','Viewer']) }),
  workflow: Object.freeze({ selectedRecordOnly:true, externalActionsEnabled:false, publicIntakeEnabled:false, approvalNotice:'Customer sending, delivery, financial posting, payroll export, tax report finalization, publishing, and advertising spend require explicit approval.' }),
  boundaries: Object.freeze({ directPaymentProcessing:false, directPayrollFunding:false, directTaxFiling:false, tax:'Tax-preparation support only. Not tax advice, tax representation, or direct tax filing.', accounting:'Accounting-preparation system. Not represented as certified accounting software until formally validated.' }),
  catalog: Object.freeze({ mode:'empty', requiredProductCount:0, requiredBundleCount:0, source:'BO Products & Services' }),
  tax: Object.freeze({ country:'US', defaultJurisdiction:'', settingsSource:'BO Tax Rates' }),
  documents: Object.freeze({ footerLabel:'Business Office · Private preparation document' }),
  storage: Object.freeze({ propertyKeys:Object.freeze({ spreadsheetId:'BUSINESS_OFFICE_SPREADSHEET_ID', businessId:'BUSINESS_OFFICE_DEFAULT_BUSINESS_ID', rootFolderId:'BUSINESS_OFFICE_ROOT_FOLDER_ID', documentFolderId:'BUSINESS_OFFICE_DOCUMENT_FOLDER_ID', pdfFolderId:'BUSINESS_OFFICE_PDF_FOLDER_ID', exportFolderId:'BUSINESS_OFFICE_EXPORT_FOLDER_ID', backupFolderId:'BUSINESS_OFFICE_BACKUP_FOLDER_ID', backendSpreadsheetId:'BUSINESS_OFFICE_BACKEND_SPREADSHEET_ID' }) }),
  deployment: Object.freeze({ mode:'standalone', scriptIdProperty:'BUSINESS_OFFICE_SCRIPT_ID', businessOfficeDeploymentIdProperty:'BUSINESS_OFFICE_DEPLOYMENT_ID' }),
  isolation: Object.freeze({ namespace:'NEWBUSINESS', requireDedicatedStorage:true, requireDedicatedDeployment:true, protectedInstallation:false })
});
