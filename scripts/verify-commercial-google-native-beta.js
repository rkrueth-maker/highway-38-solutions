#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  'apps-script/commercial-office-beta/appsscript.json',
  'apps-script/commercial-office-beta/CommercialBeta_Config.gs',
  'apps-script/commercial-office-beta/CommercialBeta_Data.gs',
  'apps-script/commercial-office-beta/CommercialBeta_Installer.gs',
  'apps-script/commercial-office-beta/CommercialBeta_Office.gs',
  'apps-script/commercial-office-beta/CommercialBeta_Web.gs',
  'apps-script/commercial-office-beta/CommercialBeta_Index.html',
  'apps-script/commercial-office-beta/CommercialBeta_Office.html',
  'commercial-beta/schema/installation-manifest.schema.json',
  'docs/architecture/COMMERCIAL_GOOGLE_NATIVE_BETA.md',
  'scripts/deploy-commercial-google-native-beta.sh',
  '.github/workflows/commercial-google-native-beta.yml'
];

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${relative}`);
  return fs.readFileSync(file, 'utf8');
}
function assert(condition, message) { if (!condition) throw new Error(message); }
for (const file of required) read(file);

const manifest = JSON.parse(read('apps-script/commercial-office-beta/appsscript.json'));
assert(manifest.webapp && manifest.webapp.executeAs === 'USER_ACCESSING', 'Commercial beta must execute as the signed-in user.');
assert(manifest.webapp.access === 'ANYONE', 'Commercial beta web-app access contract changed unexpectedly.');
assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/userinfo.email'), 'Signed-in email scope is required.');

const config = read('apps-script/commercial-office-beta/CommercialBeta_Config.gs');
assert(config.includes("environment:'commercial-google-native-beta'"), 'Separate beta environment marker is missing.');
assert(config.includes("version:'0.2.0'"), 'Connected business workspace version is missing.');
assert(config.includes('externalActionsEnabled:false'), 'External actions must remain disabled.');
assert(config.includes('productionMigrationEnabled:false'), 'Production migration must remain disabled.');
assert(config.includes('cbRequireOwner_'), 'Owner-only server authorization is missing.');

const data = read('apps-script/commercial-office-beta/CommercialBeta_Data.gs');
for (const token of ['Installation Manifests', 'Idempotency Key', 'Offline Transaction ID', 'Payload Hash', 'Record Version']) assert(data.includes(token), `Required migration/offline/ledger token is missing: ${token}`);
assert(data.includes('COMMERCIAL_BETA_ROOT_FOLDER_ID'), 'Separate beta root property is missing.');
assert(data.includes('COMMERCIAL_BETA_CONTROL_SPREADSHEET_ID'), 'Separate control workbook property is missing.');

const installer = read('apps-script/commercial-office-beta/CommercialBeta_Installer.gs');
for (const token of ['LockService.getScriptLock', 'cbExistingInstallation_', 'productionDataMigrated:false', 'externalActionsEnabled:false', 'cbVerifyBusiness_', 'Core Data', 'Inventory Data', 'Asset Data']) assert(installer.includes(token), `Installer safety contract is missing: ${token}`);
assert(!installer.includes('boQuoteBuilder'), 'Commercial beta installer must not duplicate or modify the production Quote Builder.');

const office = read('apps-script/commercial-office-beta/CommercialBeta_Office.gs');
for (const token of ['cbBusinessContext_', "SpreadsheetApp.openById(row['Core Spreadsheet ID'])", "SpreadsheetApp.openById(row['Inventory Spreadsheet ID'])", "SpreadsheetApp.openById(row['Asset Spreadsheet ID'])", 'cbOfficeSnapshot_', 'cbAddCustomer_', 'cbAddJob_', 'cbAddInventoryItem_', 'cbPostInventoryTransaction_', 'cbAddAsset_', 'Append-only inventory transaction recorded']) assert(office.includes(token), `Connected business service is missing: ${token}`);
assert(!office.includes('productionMigrationEnabled:true'), 'Connected workspace must not enable production migration.');

const web = read('apps-script/commercial-office-beta/CommercialBeta_Web.gs');
assert(web.includes('cbRequireOwner_();'), 'Web entry must enforce Owner access server-side.');
assert(web.includes("CommercialBeta_Office"), 'Business workspace route is missing.');
assert(web.includes("action==='openBusiness'"), 'Open-business API is missing.');
assert(web.includes("action==='createBusiness'"), 'Create-business API is missing.');

const indexUi = read('apps-script/commercial-office-beta/CommercialBeta_Index.html');
assert(indexUi.includes('Protected separation'), 'Visible beta separation warning is missing.');
assert(indexUi.includes('production migration disabled'), 'Visible production-migration boundary is missing.');
assert(indexUi.includes('Open Business'), 'Business launch control is missing.');

const officeUi = read('apps-script/commercial-office-beta/CommercialBeta_Office.html');
for (const token of ['Connected to Core Data, Inventory Data, and Asset Data', 'Customers', 'Jobs', 'Inventory', 'Assets', 'No production data migration']) assert(officeUi.includes(token), `Connected business UI is missing: ${token}`);

const schema = JSON.parse(read('commercial-beta/schema/installation-manifest.schema.json'));
assert(schema.properties.productionDataMigrated.const === false, 'Manifest schema must prohibit implicit production migration.');
assert(schema.properties.externalActionsEnabled.const === false, 'Manifest schema must keep external actions disabled.');

const architecture = read('docs/architecture/COMMERCIAL_GOOGLE_NATIVE_BETA.md');
for (const token of ['append-only transaction system', 'Offline synchronization contract', '02 — Build & Automation', '04 — Business & Growth', 'Never overwrite a production deployment ID']) assert(architecture.includes(token), `Architecture decision is missing: ${token}`);

const deployment = read('scripts/deploy-commercial-google-native-beta.sh');
assert(deployment.includes('apps-script/commercial-office-beta'), 'Deployment must use the separate beta source root.');
assert(deployment.includes('clasp create --type standalone'), 'Initial beta project creation is missing.');
assert(deployment.includes('deployment-state.json'), 'Deployment state evidence is missing.');

const combined = required.map(read).join('\n');
for (const productionId of ['AKfycbwFtIgY9QHyuIP0kktYgc7bPlgLVoLYAaZA-6RKlSInJpSy9NRO','1kDDKW','1Vq8Uj','11ak4Q','1Jn2vW5','1rjl_m8u']) assert(!combined.includes(productionId), `Production identifier leaked into commercial beta source: ${productionId}`);

console.log(JSON.stringify({status:'PASS',verifier:'commercial-google-native-beta',version:'0.2.0',connectedWorkspace:true,requiredFiles:required.length,productionSystemModified:false,externalActionsEnabled:false,productionMigrationEnabled:false}, null, 2));
