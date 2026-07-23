#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const registry = read('apps-script/business-office/BusinessOffice_ModuleRegistry.gs');
const moduleRegistry = read('apps-script/core-engine/owner-portal-next/Portal_Module_Registry.js');
const architecture = read('apps-script/core-engine/owner-portal-next/Portal_ProductArchitecture.js');
const unified = read('apps-script/core-engine/owner-portal-next/Portal_Unified.js');
const applicationUx = read('apps-script/core-engine/owner-portal-next/Portal_Application_UX.js');
const aiAssistant = read('apps-script/business-office/BusinessOffice_AI_Assistant.gs');
const aiActions = read('apps-script/business-office/BusinessOffice_AI_Actions.gs');
const config = read('apps-script/business-office/BusinessOffice_Config.gs');

const failures = [];
const passes = [];
function check(name, condition, evidence = '') {
  if (condition) {
    passes.push({ name, evidence });
    console.log(`PASS: ${name}${evidence ? ` — ${evidence}` : ''}`);
  } else {
    failures.push({ name, evidence });
    console.error(`FAIL: ${name}${evidence ? ` — ${evidence}` : ''}`);
  }
}

for (const [name, source] of [['legacy product registry', registry], ['unified module registry', moduleRegistry], ['product architecture server', architecture]]) {
  try {
    new vm.Script(source, { filename: name });
    check(`${name} parses`, true);
  } catch (error) {
    check(`${name} parses`, false, error.message);
  }
}

const legacyKeys = [
  'quote-builder','customer-manager','work-manager','field-operations','equipment-asset-manager','document-center',
  'invoice-payment-tracker','expense-receipt-manager','field-proof','social-control','customer-portal','request-intake-manager',
  'price-book-template-manager','approval-center','vendor-purchase-manager','maintenance-manager','shop-flow-manager','business-system'
];
const packKeys = ['h38-core','sales-customer','operations','finance-office','growth'];
const addOnKeys = ['equipment-maintenance','shop-flow-manufacturing','customer-portal-advanced','advanced-purchasing','advanced-financial-controls'];
const protectedRoles = ['Owner','Administrator','Foreman','Employee','Bookkeeper','Payroll','Viewer','Staff','Estimator','Field Staff','Customer'];
const legacyRoutes = [
  'today','bo:assignedTasks','approvalsCenter','calendarCenter','bo:requests','bo:customers','bo:messaging','bo:smsConsent',
  'bo:quotes','bo:workOrders','bo:jobs','bo:time','bo:equipment','bo:vendors','bo:purchaseOrders','bo:vendorBills','bo:receipts',
  'bo:expenses','bo:invoices','bo:payments','bo:accounting','bo:payroll','bo:tax','bo:documents','bo:messageTemplates','bo:reports',
  'growth','websiteCenter','social','advertising','moduleManager','setupWizard','userAccess','backupCenter','bo:setup','bo:employees',
  'bo:contractors','proof','errors','systemHealth','settings','help'
];

check('legacy focused product catalog remains present', /function\s+boGetBusinessAppCatalog_\s*\(/.test(registry));
check('new pack catalog is additive', /function\s+boGetProductPackCatalog_\s*\(/.test(registry));
check('legacy alias map is present', /function\s+boGetLegacyProductPackAliasMap_\s*\(/.test(registry));
legacyKeys.forEach(key => check(`legacy product preserved: ${key}`, registry.includes(`'${key}'`)));
packKeys.forEach(key => check(`product pack defined: ${key}`, registry.includes(`key:'${key}'`)));
addOnKeys.forEach(key => check(`specialist add-on defined: ${key}`, registry.includes(`key:'${key}'`)));
check('Foreman and Employee are Operations experiences', /key:'operations'[\s\S]*roleExperiences:\['Foreman','Employee'\]/.test(registry));
check('every legacy product explicitly preserves its route', legacyKeys.every(key => new RegExp(`'${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\s*:\\s*\\{[^}]*preserveLegacyRoute:true`).test(registry)));

check('read-only architecture endpoint exists', /function\s+h38PortalProductArchitecture\s*\(/.test(architecture));
check('legacy resolver endpoint exists', /function\s+h38PortalResolveLegacyProduct\s*\(/.test(architecture));
check('server returns pack membership', architecture.includes('packMembership:h38PortalProductArchitecturePackMembership_'));
check('server returns installed and availability state', architecture.includes('installedState:state') && architecture.includes('moduleAvailability:moduleByKey'));
check('server returns dependencies and role visibility', architecture.includes('dependencies:') && architecture.includes('roleVisibility:'));
check('server states records are preserved', architecture.includes('existingRecordsPreserved:true') && architecture.includes('recordsPreserved:true'));
check('server prevents automatic installation', architecture.includes('automaticInstallOrEnable:false') && architecture.includes('automaticChangesAllowed:false'));
check('server reports no external action', architecture.includes('externalActionsOccurred:false'));

const forbiddenArchitecturePatterns = [
  /setProperty\s*\(/,
  /h38PortalSetModuleOverride\s*\(/,
  /boSaveRecord\s*\(/,
  /delete(?:File|Property|Record|Row)?\s*\(/i,
  /GmailApp\.sendEmail/,
  /MailApp\.sendEmail/,
  /UrlFetchApp\.fetch/,
  /clasp\s+(?:push|deploy)/i,
  /createDeployment/i
];
for (const pattern of forbiddenArchitecturePatterns) check(`architecture has no protected write ${pattern}`, !pattern.test(architecture));

legacyRoutes.forEach(route => check(`legacy route remains in central navigation: ${route}`, moduleRegistry.includes(`key:'${route}'`) || moduleRegistry.includes(`key: '${route}'`)));
check('unified bootstrap consumes the central registry', /h38PortalModuleRegistry_\(/.test(unified) && /moduleIndex:moduleIndex/.test(unified));
check('module manager still preserves records when hidden', applicationUx.includes('recordsPreserved:true') && applicationUx.includes('preservedRecordCount'));
check('module changes still require owner approval', applicationUx.includes('Owner approval is required to change installed modules.'));
check('AI still cannot modify source or deploy', aiAssistant.includes("never:['modify source code','deploy code'") && aiActions.includes('Never plan source-code changes, deployments, permission changes, credential changes'));
check('financial and payroll boundaries remain disabled', config.includes('DIRECT_PAYMENT_PROCESSING:false') && config.includes('DIRECT_PAYROLL_FUNDING:false') && config.includes('DIRECT_TAX_FILING:false'));
protectedRoles.forEach(role => check(`role boundary retained: ${role}`, architecture.includes(`'${role}'`) || config.includes(`'${role}'`)));

const moduleKeys = [
  'commandCenter','customers','documents','approvals','users','proof','errors','backups','settings','setup','requests','quotes',
  'messaging','smsConsent','messageTemplates','assignedTasks','workOrders','jobs','calendar','time','equipment','receipts','invoices',
  'payments','expenses','vendors','purchaseOrders','vendorBills','accounting','payroll','tax','reports','employees','contractors',
  'growth','website','social','advertising'
];
const managerModules = moduleKeys.map(key => ({
  key,
  label: key,
  purpose: `${key} purpose`,
  enabled: true,
  essential: ['commandCenter','customers','documents','approvals','users','proof','errors','backups','settings','setup'].includes(key),
  dependencies: [],
  roles: ['Owner','Administrator'],
  canView: true,
  recordCount: 1,
  recordsPreserved: true,
  lastUsed: '2026-07-21 12:00:00',
  lastUsedBy: 'owner@example.com'
}));

const properties = {
  OPENAI_API_KEY: 'configured-for-test',
  BO_ENABLED_APPS: ''
};
const sandbox = {
  console,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Math,
  JSON,
  Date,
  RegExp,
  Error,
  PropertiesService: {
    getScriptProperties() {
      return { getProperty(key) { return properties[key] || ''; } };
    }
  },
  H38_BO: { ROLES: ['Owner','Administrator','Foreman','Estimator','Employee','Field Staff','Staff','Bookkeeper','Payroll','Viewer'] },
  boNormalizeText_(value) { return String(value == null ? '' : value).trim(); },
  boAssert_(condition, message) { if (!condition) throw new Error(message || 'Assertion failed.'); },
  boModuleEnabled_() { return true; },
  boRoleNames_() { return ['Owner','Administrator','Foreman','Estimator','Employee','Field Staff','Staff','Bookkeeper','Payroll','Viewer','Customer']; },
  boAiEvents_() { return [{ type: 'ai_chat' }, { type: 'module_open' }]; },
  h38PortalRequireUnifiedUser_() {
    return { ownerMode: true, role: 'Owner', user: { 'User ID': 'USR-1', Email: 'owner@example.com', 'Display Name': 'Owner' } };
  },
  h38PortalModuleManager() {
    return { status: 'PASS', ownerMode: true, modules: managerModules, recordsPreserved: true, externalActionsOccurred: false };
  },
  h38PortalApplicationModuleMeta_() { return {}; },
  h38PortalApplicationRolesForModule_() { return ['Owner','Administrator']; },
  h38PortalApplicationRecordCount_() { return 2; }
};

try {
  vm.createContext(sandbox);
  new vm.Script(registry, { filename: 'BusinessOffice_ModuleRegistry.gs' }).runInContext(sandbox);
  new vm.Script(architecture, { filename: 'Portal_ProductArchitecture.js' }).runInContext(sandbox);
  const snapshot = sandbox.h38PortalProductArchitecture();
  check('runtime product architecture returns PASS', snapshot.status === 'PASS');
  check('runtime returns five main product packs', snapshot.packs.filter(pack => pack.kind !== 'addon').length === 5);
  check('runtime returns five specialist add-ons', snapshot.packs.filter(pack => pack.kind === 'addon').length === 5);
  check('runtime returns every legacy product', snapshot.legacyProducts.length === legacyKeys.length, `${snapshot.legacyProducts.length} legacy products`);
  check('runtime returns every legacy alias', Object.keys(snapshot.legacyAliases).length === legacyKeys.length, `${Object.keys(snapshot.legacyAliases).length} aliases`);
  check('runtime retains all protected roles', protectedRoles.every(role => snapshot.allRoles.includes(role)));
  check('runtime Operations experience includes Foreman and Employee', snapshot.packs.find(pack => pack.key === 'operations').roleExperiences.join('|') === 'Foreman|Employee');
  check('runtime H38 AI is available through Core', snapshot.moduleAvailability.h38Ai.enabled === true && snapshot.moduleAvailability.h38Ai.packMembership.includes('h38-core'));
  check('runtime pack modules report membership', ['customers','quotes','jobs','invoices','website'].every(key => snapshot.moduleAvailability[key].packMembership.length > 0));
  check('runtime preserves routes and records', snapshot.legacyRoutesPreserved === true && snapshot.existingRecordsPreserved === true && snapshot.migrationMode === 'alias-only');
  check('runtime performs no automatic changes', snapshot.automaticInstallOrEnable === false && snapshot.externalActionsOccurred === false);
  const resolved = sandbox.h38PortalResolveLegacyProduct('shop-flow-manager');
  check('runtime resolves legacy product to add-on', resolved.status === 'PASS' && resolved.alias.primaryPack === 'shop-flow-manufacturing' && resolved.legacyRoutePreserved === true);
} catch (error) {
  check('product architecture runtime simulation', false, error.stack || error.message);
}

const result = { status: failures.length ? 'HOLD' : 'PASS', passes: passes.length, failures };
const outDir = path.join(root, 'artifacts', 'product-architecture');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`\nRESULT: ${result.status} (${passes.length} pass, ${failures.length} fail)`);
process.exit(failures.length ? 1 : 0);
