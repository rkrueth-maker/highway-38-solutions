'use strict';

const fs = require('fs');
const path = require('path');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function validatePack(pack) {
  const failures = [];
  const required = ['schemaVersion','packId','business','branding','contacts','urls','modules','roles','workflow','boundaries','catalog','tax','documents','numbering','storage','deployment','isolation'];
  required.forEach(key => { if (pack[key] == null) failures.push(`Missing ${key}`); });
  if (pack.schemaVersion !== 1) failures.push('schemaVersion must be 1');
  if (!pack.business?.id || !pack.business?.publicName || !pack.business?.timeZone) failures.push('business.id, business.publicName, and business.timeZone are required');
  const keys = pack.storage?.propertyKeys || {};
  ['spreadsheetId','businessId','rootFolderId','documentFolderId','pdfFolderId','exportFolderId','backupFolderId'].forEach(key => { if (!keys[key]) failures.push(`storage.propertyKeys.${key} is required`); });
  if (pack.workflow?.externalActionsEnabled !== false) failures.push('external actions must default to false');
  if (pack.boundaries?.directPaymentProcessing !== false || pack.boundaries?.directPayrollFunding !== false || pack.boundaries?.directTaxFiling !== false) failures.push('money movement, payroll funding, and tax filing must remain false');
  if (pack.isolation?.requireDedicatedStorage !== true || pack.isolation?.requireDedicatedDeployment !== true) failures.push('dedicated storage and deployment are required');
  return failures;
}

function sanitizeId(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

function deepClone(value) { return JSON.parse(JSON.stringify(value)); }

function createPack(template, input) {
  const pack = deepClone(template);
  const businessId = sanitizeId(input.businessId || input.businessName);
  if (!businessId) throw new Error('businessId or businessName is required');
  pack.packId = String(input.packId || businessId.toLowerCase().replace(/_/g, '-'));
  pack.business.id = businessId;
  pack.business.legalName = String(input.legalName || input.businessName || '').trim();
  pack.business.publicName = String(input.publicName || input.businessName || '').trim();
  pack.business.timeZone = String(input.timeZone || pack.business.timeZone);
  pack.branding = { ...pack.branding, ...(input.branding || {}) };
  pack.contacts = { ...pack.contacts, ...(input.contacts || {}) };
  pack.urls = { ...pack.urls, ...(input.urls || {}) };
  pack.modules = { ...pack.modules, ...(input.modules || {}) };
  pack.tax = { ...pack.tax, ...(input.tax || {}) };
  pack.catalog = { ...pack.catalog, ...(input.catalog || {}) };
  pack.isolation.namespace = businessId;
  const prefix = businessId + '_BUSINESS_OFFICE_';
  pack.storage.propertyKeys = {
    spreadsheetId: prefix + 'SPREADSHEET_ID',
    businessId: prefix + 'DEFAULT_BUSINESS_ID',
    rootFolderId: prefix + 'ROOT_FOLDER_ID',
    documentFolderId: prefix + 'DOCUMENT_FOLDER_ID',
    pdfFolderId: prefix + 'PDF_FOLDER_ID',
    exportFolderId: prefix + 'EXPORT_FOLDER_ID',
    backupFolderId: prefix + 'BACKUP_FOLDER_ID',
    backendSpreadsheetId: prefix + 'BACKEND_SPREADSHEET_ID'
  };
  pack.deployment.scriptIdProperty = businessId + '_BUSINESS_OFFICE_SCRIPT_ID';
  pack.deployment.businessOfficeDeploymentIdProperty = businessId + '_BUSINESS_OFFICE_DEPLOYMENT_ID';
  const failures = validatePack(pack);
  if (failures.length) throw new Error(failures.join('; '));
  return pack;
}

function collectResourceIds(properties, pack) {
  const keys = pack.storage.propertyKeys;
  return ['spreadsheetId','rootFolderId','documentFolderId','pdfFolderId','exportFolderId','backupFolderId'].reduce((result, key) => {
    result[key] = properties[keys[key]] || '';
    return result;
  }, {});
}

function assertIsolated(candidate, protectedInstallations) {
  const used = new Map();
  for (const installation of protectedInstallations || []) {
    for (const [kind, id] of Object.entries(installation.resources || {})) if (id) used.set(id, `${installation.installationId}:${kind}`);
  }
  const collisions = [];
  for (const [kind, id] of Object.entries(candidate.resources || {})) if (id && used.has(id)) collisions.push(`${kind} reuses ${used.get(id)}`);
  if (collisions.length) throw new Error(`Data isolation failure: ${collisions.join(', ')}`);
  return true;
}

function loadPack(root, packName) {
  const file = path.join(root, 'business-packs', packName, 'business-pack.json');
  const pack = readJson(file);
  const failures = validatePack(pack);
  if (failures.length) throw new Error(`${packName}: ${failures.join('; ')}`);
  return pack;
}

module.exports = { readJson, validatePack, createPack, collectResourceIds, assertIsolated, loadPack, sanitizeId };
