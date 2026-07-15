/**
 * Business Office Platform — configuration, installation isolation, and immutable safety boundaries.
 * Business identity and resource references are supplied by an installation business pack.
 */

const BO_PLATFORM = Object.freeze({
  VERSION: '2.0.0',
  CONFIG_PROPERTY: 'BO_INSTALLATION_CONFIG_JSON',
  SPREADSHEET_PROPERTY: 'BO_SPREADSHEET_ID',
  BUSINESS_PROPERTY: 'BO_DEFAULT_BUSINESS_ID',
  ROOT_FOLDER_PROPERTY: 'BO_ROOT_FOLDER_ID',
  DOCUMENT_FOLDER_PROPERTY: 'BO_DOCUMENT_FOLDER_ID',
  PDF_FOLDER_PROPERTY: 'BO_PDF_FOLDER_ID',
  EXPORT_FOLDER_PROPERTY: 'BO_EXPORT_FOLDER_ID',
  BACKUP_FOLDER_PROPERTY: 'BO_BACKUP_FOLDER_ID',
  INTAKE_SOURCE_PROPERTY: 'BO_INTAKE_SOURCE_SPREADSHEET_ID',
  DEFAULT_BUSINESS_ID: 'BUSINESS',
  DEFAULT_TIME_ZONE: 'Etc/UTC',
  MAX_UPLOAD_BYTES: 20 * 1024 * 1024,
  ALLOWED_MIME_TYPES: Object.freeze([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif'
  ]),
  CONDITIONAL_MIME_TYPES: Object.freeze(['image/heic', 'image/heif']),
  ROLES: Object.freeze(['Owner', 'Administrator', 'Staff', 'Bookkeeper', 'Payroll', 'Viewer']),
  EXTERNAL_ACTIONS_ENABLED: false,
  DIRECT_PAYMENT_PROCESSING: false,
  DIRECT_PAYROLL_FUNDING: false,
  DIRECT_TAX_FILING: false,
  PUBLIC_INTAKE_ENABLED: false,
  TAX_BOUNDARY: 'Tax-preparation support only. Not tax advice, tax representation, or direct tax filing.',
  ACCOUNTING_BOUNDARY: 'Accounting-preparation system. Not represented as certified accounting software until formally validated.'
});

const BO_SHEETS = Object.freeze({
  LISTS: 'BO Lists',
  DASHBOARD: 'BO Dashboard',
  REQUESTS: 'BO Requests',
  BUSINESSES: 'BO Businesses',
  USERS: 'BO Users',
  ROLES: 'BO Roles',
  PERMISSIONS: 'BO Permissions',
  CONTACTS: 'BO Contacts',
  CUSTOMERS: 'BO Customers',
  VENDORS: 'BO Vendors',
  ADDRESSES: 'BO Addresses',
  QUOTES: 'BO Quotes',
  QUOTE_LINES: 'BO Quote Lines',
  WORK_ORDERS: 'BO Work Orders',
  JOBS: 'BO Jobs',
  JOB_LABOR: 'BO Job Labor',
  JOB_MATERIALS: 'BO Job Materials',
  JOB_EQUIPMENT: 'BO Job Equipment',
  CHANGE_ORDERS: 'BO Change Orders',
  PURCHASE_ORDERS: 'BO Purchase Orders',
  PO_LINES: 'BO PO Lines',
  RECEIPTS: 'BO Receipts',
  VENDOR_BILLS: 'BO Vendor Bills',
  BILL_LINES: 'BO Bill Lines',
  EXPENSES: 'BO Expenses',
  EXPENSE_LINES: 'BO Expense Lines',
  INVOICES: 'BO Invoices',
  INVOICE_LINES: 'BO Invoice Lines',
  PAYMENTS: 'BO Payments',
  TIME_ENTRIES: 'BO Time Entries',
  EMPLOYEES: 'BO Employees',
  PAYROLL_PERIODS: 'BO Payroll Periods',
  PAYROLL_LINES: 'BO Payroll Lines',
  PAYROLL_DEDUCTIONS: 'BO Payroll Deductions',
  CONTRACTORS: 'BO Contractors',
  W9_RECORDS: 'BO W9 Records',
  TAX_PERIODS: 'BO Tax Periods',
  ASSETS: 'BO Assets',
  MILEAGE: 'BO Mileage',
  HOME_OFFICE: 'BO Home Office',
  DOCUMENTS: 'BO Documents',
  OCR_FIELDS: 'BO OCR Fields',
  OCR_CORRECTIONS: 'BO OCR Corrections',
  CHART_OF_ACCOUNTS: 'BO Chart of Accounts',
  JOURNAL_ENTRIES: 'BO Journal Entries',
  JOURNAL_LINES: 'BO Journal Lines',
  RECONCILIATIONS: 'BO Reconciliations',
  ACCOUNTING_PERIODS: 'BO Accounting Periods',
  APPROVALS: 'BO Approvals',
  PROOF_LOG: 'BO Proof Log',
  ERROR_LOG: 'BO Error Log',
  AUDIT_LOG: 'BO Audit Log',
  ACTIVITY: 'BO Activity',
  SETTINGS: 'BO Settings',
  FEATURES: 'BO Features',
  SUBSCRIPTIONS: 'BO Subscriptions',
  IMPORT_JOBS: 'BO Import Jobs',
  EXPORT_JOBS: 'BO Export Jobs',
  BACKUP_LOG: 'BO Backup Log',
  MISSING_DOCUMENTS: 'BO Missing Documents',
  PNL: 'BO P&L',
  BALANCE_SHEET: 'BO Balance Sheet',
  CASH_FLOW: 'BO Cash Flow',
  AR_AGING: 'BO AR Aging',
  AP_AGING: 'BO AP Aging',
  JOB_PROFITABILITY: 'BO Job Profitability',
  SALES_TAX_REPORT: 'BO Sales Tax Report',
  EXPENSE_REPORT: 'BO Expense Report',
  VENDOR_SPEND: 'BO Vendor Spend',
  CUSTOMER_REVENUE: 'BO Customer Revenue',
  PAYROLL_SUMMARY: 'BO Payroll Summary',
  TAX_PREP: 'BO Tax Prep',
  PRODUCTS: 'BO Products & Services',
  TAX_RATES: 'BO Tax Rates',
  SAVED_VIEWS: 'BO Saved Views',
  NUMBER_SEQUENCES: 'BO Number Sequences',
  PDF_TEMPLATES: 'BO PDF Templates',
  RELEASE_NOTES: 'BO Release Notes',
  LICENSES: 'BO Licenses',
  MIGRATIONS: 'BO Migrations',
  SETUP_CHECKLIST: 'BO Setup Checklist'
});

const BO_MODULES = Object.freeze({
  dashboard: BO_SHEETS.DASHBOARD,
  requests: BO_SHEETS.REQUESTS,
  customers: BO_SHEETS.CUSTOMERS,
  vendors: BO_SHEETS.VENDORS,
  contacts: BO_SHEETS.CONTACTS,
  quotes: BO_SHEETS.QUOTES,
  workOrders: BO_SHEETS.WORK_ORDERS,
  jobs: BO_SHEETS.JOBS,
  purchaseOrders: BO_SHEETS.PURCHASE_ORDERS,
  receipts: BO_SHEETS.RECEIPTS,
  vendorBills: BO_SHEETS.VENDOR_BILLS,
  expenses: BO_SHEETS.EXPENSES,
  invoices: BO_SHEETS.INVOICES,
  payments: BO_SHEETS.PAYMENTS,
  time: BO_SHEETS.TIME_ENTRIES,
  employees: BO_SHEETS.EMPLOYEES,
  payroll: BO_SHEETS.PAYROLL_PERIODS,
  contractors: BO_SHEETS.CONTRACTORS,
  tax: BO_SHEETS.TAX_PERIODS,
  documents: BO_SHEETS.DOCUMENTS,
  accounting: BO_SHEETS.JOURNAL_ENTRIES,
  approvals: BO_SHEETS.APPROVALS,
  reports: BO_SHEETS.PNL,
  setup: BO_SHEETS.SETUP_CHECKLIST
});

function boGetProperties_() {
  return PropertiesService.getScriptProperties();
}

function boPlainObject_(value) {
  return value && Object.prototype.toString.call(value) === '[object Object]' ? value : {};
}

function boMergeObjects_(base, override) {
  const result = {};
  Object.keys(boPlainObject_(base)).forEach(function (key) {
    const value = base[key];
    result[key] = boPlainObject_(value) === value ? boMergeObjects_(value, {}) : value;
  });
  Object.keys(boPlainObject_(override)).forEach(function (key) {
    const value = override[key];
    result[key] = boPlainObject_(value) === value ? boMergeObjects_(result[key], value) : value;
  });
  return result;
}

function boEmbeddedBusinessPack_() {
  return typeof BO_BUSINESS_PACK === 'undefined' ? {} : BO_BUSINESS_PACK;
}

function boRuntimeBusinessPack_() {
  const raw = boGetProperties_().getProperty(BO_PLATFORM.CONFIG_PROPERTY) || '';
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('Business Office installation configuration is invalid JSON.');
  }
}

function boGetBusinessPack_() {
  const pack = boMergeObjects_(boEmbeddedBusinessPack_(), boRuntimeBusinessPack_());
  return boValidateBusinessPack_(pack);
}

function boValidateBusinessPack_(pack) {
  const value = boPlainObject_(pack);
  const business = boPlainObject_(value.business);
  const branding = boPlainObject_(value.branding);
  const resources = boPlainObject_(value.resources);
  if (!value.installationId) throw new Error('Business Office installationId is required.');
  if (!business.id) throw new Error('Business Office business.id is required.');
  if (!branding.businessName) throw new Error('Business Office branding.businessName is required.');
  if (!resources.propertyKeys) throw new Error('Business Office resources.propertyKeys is required.');
  return value;
}

function boConfigValue_(pathText, fallback) {
  const parts = String(pathText || '').split('.').filter(Boolean);
  let value = boGetBusinessPack_();
  for (let i = 0; i < parts.length; i += 1) {
    if (!value || !Object.prototype.hasOwnProperty.call(value, parts[i])) return fallback;
    value = value[parts[i]];
  }
  return value == null || value === '' ? fallback : value;
}

function boPropertyKey_(logicalKey) {
  const propertyKeys = boConfigValue_('resources.propertyKeys', {});
  return propertyKeys[logicalKey] || logicalKey;
}

function boConfiguredValue_(logicalKey) {
  const key = boPropertyKey_(logicalKey);
  return boGetProperties_().getProperty(key) || '';
}

function boGetSpreadsheet_() {
  const id = boConfiguredValue_(BO_PLATFORM.SPREADSHEET_PROPERTY);
  if (!id) throw new Error('Missing Business Office spreadsheet configuration.');
  return SpreadsheetApp.openById(id);
}

function boGetBusinessId_() {
  return boConfiguredValue_(BO_PLATFORM.BUSINESS_PROPERTY) || boConfigValue_('business.id', BO_PLATFORM.DEFAULT_BUSINESS_ID);
}

function boGetInstallationId_() {
  return boConfigValue_('installationId', 'business-office');
}

function boGetFolderId_(logicalKey) {
  const id = boConfiguredValue_(logicalKey);
  if (!id) throw new Error('Missing Business Office folder configuration: ' + logicalKey);
  return id;
}

function boGetTimeZone_() {
  return boConfigValue_('regional.timeZone', BO_PLATFORM.DEFAULT_TIME_ZONE);
}

function boGetBranding_() {
  return {
    businessName: boConfigValue_('branding.businessName', 'Business'),
    businessOfficeName: boConfigValue_('branding.businessOfficeName', 'Business Office'),
    logoUrl: boConfigValue_('branding.logoUrl', ''),
    primaryColor: boConfigValue_('branding.primaryColor', '#173a5e'),
    secondaryColor: boConfigValue_('branding.secondaryColor', '#326a9e'),
    documentFooter: boConfigValue_('branding.documentFooter', 'Business Office · Private preparation document'),
    originalFileDescription: boConfigValue_('branding.originalFileDescription', 'Private Business Office original.')
  };
}

function boApprovalText_(key) {
  const defaults = {
    required: 'Owner Approval Required',
    ownerRequired: 'Owner approval is required.',
    dashboardReview: 'Owner review is needed before customer action.',
    decisionButton: 'Owner decision'
  };
  return boConfigValue_('approvalLanguage.' + key, defaults[key] || key);
}

function boCatalogExpectations_() {
  return {
    products: Number(boConfigValue_('validation.expectedProductCount', 0)),
    bundles: Number(boConfigValue_('validation.expectedBundleCount', 0)),
    enforceCounts: boConfigValue_('validation.enforceCatalogCounts', false) === true
  };
}

function boNow_() {
  return Utilities.formatDate(new Date(), boGetTimeZone_(), 'yyyy-MM-dd HH:mm:ss');
}

function boId_(prefix) {
  return String(prefix || 'BO') + '-' + Utilities.formatDate(new Date(), boGetTimeZone_(), 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
}

function boNormalizeText_(value) {
  return String(value == null ? '' : value).trim();
}

function boMoney_(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) throw new Error('Invalid monetary value.');
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function boAssert_(condition, message) {
  if (!condition) throw new Error(message || 'Business Office validation failed.');
}
