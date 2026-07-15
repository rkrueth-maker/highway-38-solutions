#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { loadPack, createPack, assertIsolated } = require('./lib/business-pack');

const root = path.resolve(__dirname, '../..');
const inputPath = process.argv[2];
const outDir = path.resolve(process.argv[3] || path.join(root, 'artifacts', 'business-office-installation'));
if (!inputPath) throw new Error('Usage: node scripts/business-office/create-installation-plan.js <input.json> [output-dir]');
const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
const template = loadPack(root, 'template-business');
const pack = createPack(template, input);

const plan = {
  schemaVersion: 1,
  installationId: `${pack.business.id}-${Date.now()}`,
  businessId: pack.business.id,
  packId: pack.packId,
  mode: input.mode === 'combined' ? 'combined' : 'standalone',
  create: {
    appsScriptProject: true,
    spreadsheet: true,
    rootFolder: true,
    documentFolder: true,
    pdfFolder: true,
    exportFolder: true,
    backupFolder: true,
    ownerUser: true
  },
  resources: {
    spreadsheetId: '', rootFolderId: '', documentFolderId: '', pdfFolderId: '', exportFolderId: '', backupFolderId: '', appsScriptProjectId: '', deploymentId: ''
  },
  scriptProperties: Object.fromEntries(Object.entries(pack.storage.propertyKeys).map(([key, property]) => [property, key === 'businessId' ? pack.business.id : 'CREATE_NEW_RESOURCE'])),
  controls: {
    externalActionsEnabled: false,
    directPaymentProcessing: false,
    directPayrollFunding: false,
    directTaxFiling: false,
    selectedRecordOnly: true,
    separateUsers: true,
    separateLogs: true,
    separateBackup: true
  },
  optionalWebsiteConnection: plan => plan.mode === 'combined',
  pack
};
delete plan.optionalWebsiteConnection;
plan.connectWebsiteAfterDeployment = plan.mode === 'combined';
assertIsolated(plan, input.protectedInstallations || []);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'business-pack.json'), JSON.stringify(pack, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'installation-plan.json'), JSON.stringify(plan, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'README.md'), `# ${pack.business.publicName} Business Office installation\n\nMode: ${plan.mode}\n\nAll resources marked CREATE_NEW_RESOURCE must be created uniquely. Do not substitute a Highway 38 ID or another installation's ID.\n`);
console.log(JSON.stringify({ status:'PASS', output:outDir, installationId:plan.installationId, businessId:pack.business.id, mode:plan.mode }, null, 2));
