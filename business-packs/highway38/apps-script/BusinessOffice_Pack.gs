/** Generated Highway 38 business pack. Business-specific values belong here, not in the reusable core. */
const BO_EMBEDDED_BUSINESS_PACK = Object.freeze({
  schemaVersion: 1,
  packId: 'highway38',
  business: Object.freeze({ id: 'H38', legalName: 'Highway 38 Solutions', publicName: 'Highway 38 Solutions', timeZone: 'America/Chicago' }),
  branding: Object.freeze({ logoUrl: 'assets/highway-38-solutions-logo.svg', primaryColor: '#173a5e', secondaryColor: '#326a9e', accentColor: '#d6a84b' }),
  contacts: Object.freeze({ ownerEmailProperty: 'H38_OWNER_EMAIL', publicEmail: '' }),
  urls: Object.freeze({ website: 'https://rkrueth-maker.github.io/highway-38-solutions/', ownerPortal: 'https://rkrueth-maker.github.io/highway-38-solutions/portal.html' }),
  modules: Object.freeze({ requests:true, customers:true, vendors:true, quotes:true, workOrders:true, jobs:true, purchaseOrders:true, vendorBills:true, invoices:true, payments:true, receipts:true, expenses:true, documents:true, accounting:true, payroll:true, tax:true, reports:true, approvals:true, backups:true }),
  roles: Object.freeze({ names: Object.freeze(['Owner','Administrator','Staff','Bookkeeper','Payroll','Viewer']) }),
  workflow: Object.freeze({ selectedRecordOnly:true, externalActionsEnabled:false, publicIntakeEnabled:false, approvalNotice:'Customer sending, delivery, financial posting, payroll export, tax report finalization, social publishing, and advertising spend require explicit approval.' }),
  boundaries: Object.freeze({ directPaymentProcessing:false, directPayrollFunding:false, directTaxFiling:false, tax:'Tax-preparation support only. Not tax advice, tax representation, or direct tax filing.', accounting:'Accounting-preparation system. Not represented as certified accounting software until formally validated.' }),
  catalog: Object.freeze({ mode:'configured', requiredProductCount:15, requiredBundleCount:9, source:'BO Products & Services' }),
  tax: Object.freeze({ country:'US', defaultJurisdiction:'Minnesota', settingsSource:'BO Tax Rates' }),
  documents: Object.freeze({ footerLabel:'Highway 38 Business Office · Private preparation document' }),
  storage: Object.freeze({ propertyKeys:Object.freeze({ spreadsheetId:'H38_BUSINESS_OFFICE_SPREADSHEET_ID', businessId:'H38_BUSINESS_OFFICE_DEFAULT_BUSINESS_ID', rootFolderId:'H38_BUSINESS_OFFICE_ROOT_FOLDER_ID', documentFolderId:'H38_BUSINESS_OFFICE_DOCUMENT_FOLDER_ID', pdfFolderId:'H38_BUSINESS_OFFICE_PDF_FOLDER_ID', exportFolderId:'H38_BUSINESS_OFFICE_EXPORT_FOLDER_ID', backupFolderId:'H38_BUSINESS_OFFICE_BACKUP_FOLDER_ID', backendSpreadsheetId:'H38_BACKEND_SPREADSHEET_ID' }) }),
  deployment: Object.freeze({ mode:'combined', scriptIdProperty:'H38_OWNER_PORTAL_SCRIPT_ID', ownerDeploymentIdProperty:'H38_OWNER_PORTAL_DEPLOYMENT_ID', businessOfficeDeploymentIdProperty:'H38_BUSINESS_OFFICE_DEPLOYMENT_ID' }),
  isolation: Object.freeze({ namespace:'H38', requireDedicatedStorage:true, requireDedicatedDeployment:true, protectedInstallation:true })
});
