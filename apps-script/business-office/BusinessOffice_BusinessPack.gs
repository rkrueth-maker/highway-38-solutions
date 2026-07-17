/** Business Office — business-pack loading and business-neutral configuration access. */

var BO_PACK_CACHE_ = null;

function boGetBusinessPack_() {
  if (BO_PACK_CACHE_) return BO_PACK_CACHE_;
  let pack = null;
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('BUSINESS_OFFICE_PACK_JSON');
    if (raw) pack = JSON.parse(raw);
  } catch (error) {
    throw new Error('Business Office pack JSON is invalid: ' + error.message);
  }
  if (!pack && typeof BO_EMBEDDED_BUSINESS_PACK !== 'undefined' && BO_EMBEDDED_BUSINESS_PACK) pack = BO_EMBEDDED_BUSINESS_PACK;
  boAssert_(pack, 'No Business Office business pack is installed.');
  boValidateBusinessPack_(pack);
  BO_PACK_CACHE_ = pack;
  return BO_PACK_CACHE_;
}

function boValidateBusinessPack_(pack) {
  boAssert_(pack && Number(pack.schemaVersion) === 1, 'Business pack schemaVersion 1 is required.');
  boAssert_(pack.packId, 'Business pack ID is required.');
  boAssert_(pack.business && pack.business.id && pack.business.publicName && pack.business.timeZone, 'Business pack identity is incomplete.');
  boAssert_(pack.branding && pack.branding.primaryColor && pack.branding.secondaryColor && pack.branding.accentColor, 'Business pack branding is incomplete.');
  boAssert_(pack.storage && pack.storage.propertyKeys, 'Business pack storage property keys are required.');
  ['spreadsheetId','businessId','rootFolderId','documentFolderId','pdfFolderId','exportFolderId','backupFolderId'].forEach(function (key) {
    boAssert_(pack.storage.propertyKeys[key], 'Business pack storage key is missing: ' + key);
  });
  boAssert_(pack.workflow && pack.workflow.externalActionsEnabled === false, 'External actions must default to disabled.');
  boAssert_(pack.boundaries && pack.boundaries.directPaymentProcessing === false, 'Direct payment processing must remain disabled.');
  boAssert_(pack.boundaries.directPayrollFunding === false, 'Direct payroll funding must remain disabled.');
  boAssert_(pack.boundaries.directTaxFiling === false, 'Direct tax filing must remain disabled.');
  boAssert_(pack.isolation && pack.isolation.requireDedicatedStorage === true, 'Dedicated storage is required.');
  boAssert_(pack.isolation.requireDedicatedDeployment === true, 'A dedicated deployment is required.');
  return true;
}

function boPackValue_(path, fallback) {
  const parts = String(path || '').split('.').filter(Boolean);
  let value = boGetBusinessPack_();
  for (let index = 0; index < parts.length; index += 1) {
    if (value == null || !Object.prototype.hasOwnProperty.call(value, parts[index])) return fallback;
    value = value[parts[index]];
  }
  return value == null ? fallback : value;
}

function boPackPropertyKey_(logicalName) {
  return boPackValue_('storage.propertyKeys.' + logicalName, logicalName);
}

function boBusinessName_() {
  return boNormalizeText_(boPackValue_('business.publicName', 'Business Office')) || 'Business Office';
}

function boBusinessOfficeTitle_() {
  const name = boBusinessName_();
  return /business office$/i.test(name) ? name : name + ' Business Office';
}

function boBranding_() {
  return {
    logoUrl: boPackValue_('branding.logoUrl', ''),
    primaryColor: boPackValue_('branding.primaryColor', '#243447'),
    secondaryColor: boPackValue_('branding.secondaryColor', '#52677d'),
    accentColor: boPackValue_('branding.accentColor', '#c79a3b')
  };
}

function boApprovalNotice_() {
  return boPackValue_('workflow.approvalNotice', 'Customer actions, financial posting, payroll export, tax finalization, publishing, delivery, and advertising spend require explicit approval.');
}

function boCatalogRequirements_() {
  return {
    mode: boPackValue_('catalog.mode', 'empty'),
    products: Number(boPackValue_('catalog.requiredProductCount', 0) || 0),
    bundles: Number(boPackValue_('catalog.requiredBundleCount', 0) || 0)
  };
}

function boModuleEnabled_(moduleKey) {
  const modules = boPackValue_('modules', {});
  const packEnabled = !Object.prototype.hasOwnProperty.call(modules, moduleKey) || modules[moduleKey] !== false;
  if (typeof h38PortalModuleOverrideEnabled_ === 'function') return h38PortalModuleOverrideEnabled_(moduleKey, packEnabled);
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('H38_UNIFIED_MODULE_OVERRIDES_JSON');
    const overrides = raw ? JSON.parse(raw) : {};
    if (Object.prototype.hasOwnProperty.call(overrides, moduleKey)) return overrides[moduleKey].enabled !== false;
  } catch (error) {}
  return packEnabled;
}

function boRoleNames_() {
  const roles = boPackValue_('roles.names', ['Owner','Administrator','Staff','Bookkeeper','Payroll','Viewer']);
  return Array.isArray(roles) ? roles.slice() : [];
}

function boTaxBoundary_() {
  return boPackValue_('boundaries.tax', 'Tax-preparation support only. Not tax advice, tax representation, or direct tax filing.');
}

function boAccountingBoundary_() {
  return boPackValue_('boundaries.accounting', 'Accounting-preparation system. Not represented as certified accounting software until formally validated.');
}

function boDocumentFooterLabel_() {
  return boPackValue_('documents.footerLabel', 'Business Office · Private preparation document');
}

function boGetPackSnapshot_() {
  const pack = boGetBusinessPack_();
  return {
    schemaVersion: pack.schemaVersion,
    packId: pack.packId,
    business: pack.business,
    branding: pack.branding,
    contacts: pack.contacts || {},
    urls: pack.urls || {},
    modules: pack.modules || {},
    workflow: pack.workflow || {},
    boundaries: pack.boundaries || {},
    catalog: pack.catalog || {},
    tax: pack.tax || {},
    documents: pack.documents || {},
    deployment: { mode: boPackValue_('deployment.mode', 'standalone') },
    isolation: pack.isolation || {}
  };
}
