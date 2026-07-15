#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const file = process.argv[2] || path.join(root, 'business-packs', 'highway38', 'deployment.json');
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
const values = {
  H38_BO_SPREADSHEET_ID: config.resources?.businessOfficeSpreadsheetId,
  H38_BO_ROOT_FOLDER_ID: config.resources?.rootFolderId,
  H38_BO_DOCUMENT_FOLDER_ID: config.resources?.documentFolderId,
  H38_BO_PDF_FOLDER_ID: config.resources?.pdfFolderId,
  H38_BO_EXPORT_FOLDER_ID: config.resources?.exportFolderId,
  H38_BO_BACKUP_FOLDER_ID: config.resources?.backupFolderId,
  H38_BACKEND_SPREADSHEET_ID: config.resources?.backendSpreadsheetId,
  H38_BO_OWNER_EMAIL: config.ownerEmail,
  H38_BO_BUSINESS_ID: config.businessId,
  H38_OWNER_SCRIPT_ID: config.appsScript?.ownerPortalProjectId,
  H38_OWNER_DEPLOYMENT_ID: config.appsScript?.ownerPortalDeploymentId,
  H38_BUSINESS_OFFICE_DEPLOYMENT_ID: config.appsScript?.businessOfficeDeploymentId,
  H38_WEBSITE_URL: config.website?.publicUrl,
  H38_OWNER_PORTAL_URL: config.website?.ownerPortalUrl
};
const missing = Object.entries(values).filter(([, value]) => !value).map(([key]) => key);
if (missing.length) throw new Error(`Missing Highway 38 deployment configuration: ${missing.join(', ')}`);
if (config.controls?.updateExistingProjectOnly !== true || config.controls?.createNewProject !== false || config.controls?.externalActionsEnabled !== false) {
  throw new Error('Highway 38 deployment controls are not locked to the existing project with external actions disabled.');
}
if (process.env.GITHUB_ENV) {
  fs.appendFileSync(process.env.GITHUB_ENV, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
}
if (process.argv.includes('--shell')) {
  process.stdout.write(Object.entries(values).map(([key, value]) => `export ${key}=${JSON.stringify(String(value))}`).join('\n') + '\n');
} else {
  process.stdout.write(JSON.stringify({ status: 'PASS', source: path.relative(root, file), values: Object.keys(values) }, null, 2) + '\n');
}
