#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  readJson,
  writeJson,
  validateEngineConfig,
  validateBusinessPack,
  validateLicense,
  compileInstallation,
  installBusinessOs,
  createBackup,
  restoreBackup,
  migrateEffectiveConfig,
  sha256
} = require('../core-engine/product/lib/business-os-product');

const ROOT = path.resolve(__dirname, '..');
const evidenceDir = path.join(ROOT, 'launch-control', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });
const passes = [];
const failures = [];

function check(name, condition, detail = '') {
  (condition ? passes : failures).push({ name, detail });
}

function expectThrow(name, fn, expected) {
  try {
    fn();
    failures.push({ name, detail: 'Expected an error but none was thrown.' });
  } catch (error) {
    check(name, !expected || String(error.message).includes(expected), error.message);
  }
}

const enginePath = path.join(ROOT, 'core-engine', 'product', 'config', 'core-engine.default.json');
const packPath = path.join(ROOT, 'business-packs', 'highway-38', 'business-pack.json');
const adapterPath = path.join(ROOT, 'core-engine', 'product', 'adapters', 'registry.json');
const tiersPath = path.join(ROOT, 'core-engine', 'product', 'tiers', 'tier-matrix.json');
const licensePath = path.join(ROOT, 'core-engine', 'product', 'licenses', 'example-evaluation-license.json');

for (const file of [enginePath, packPath, adapterPath, tiersPath, licensePath]) check(`required file ${path.relative(ROOT, file)}`, fs.existsSync(file));

const engine = readJson(enginePath);
const pack = readJson(packPath);
const adapters = readJson(adapterPath);
const tiers = readJson(tiersPath);
const exampleLicense = readJson(licensePath);

check('engine config validates', validateEngineConfig(engine).length === 0, validateEngineConfig(engine).join(' '));
check('Business Pack validates', validateBusinessPack(pack).length === 0, validateBusinessPack(pack).join(' '));
check('Core Engine is business-neutral', !JSON.stringify(engine).toLowerCase().includes('highway 38'));
check('tenant isolation configured', engine.tenant.mode === 'isolated' && engine.tenant.crossTenantReads === false && engine.tenant.crossTenantWrites === false);
check('selected-record controls configured', engine.controls.selectedRecordOnly === true && engine.controls.bulkExecution === false && engine.controls.automaticRetry === false);
check('proof and error logs required', engine.controls.proofLogRequired === true && engine.controls.errorLogRequired === true);
check('external actions default locked', engine.controls.externalActionsEnabled === false);
check('five roles configured', Object.keys(engine.roles).length === 5, Object.keys(engine.roles).join(', '));
check('customer permission is own-record scoped', engine.roles.customer.every(permission => permission.startsWith('customer.own.')));
check('eight provider-neutral adapter slots', adapters.adapters.length === 8, String(adapters.adapters.length));
check('adapter activation contract complete', ['credentialsRequired', 'ownerApprovalRequired', 'selectedRecordRequired', 'duplicateLockRequired', 'proofLogRequired', 'errorLogRequired', 'regressionTestRequired'].every(key => adapters.activationContract[key] === true));
check('four product tiers configured', tiers.tiers.length === 4, String(tiers.tiers.length));
check('tier IDs exact', JSON.stringify(tiers.tiers.map(tier => tier.id)) === JSON.stringify(['Core', 'Operations', 'Growth', 'Control']));
check('Business Pack catalog retained', pack.catalog.products === 15 && pack.catalog.bundles === 9);
check('Business Pack cannot self-enable external actions', pack.externalActionsEnabled === false);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'business-os-product-'));
const installOne = path.join(tempRoot, 'tenant-one');
const installTwo = path.join(tempRoot, 'tenant-two');
const restored = path.join(tempRoot, 'restored-one');
const backupFile = path.join(tempRoot, 'tenant-one-backup.json');

const license = {
  ...exampleLicense,
  licenseId: 'TEST-LICENSE-001',
  tenantLimit: 2,
  assignedTenants: ['tenant-one'],
  notes: 'Synthetic verifier license.'
};

const first = installBusinessOs({
  engineConfig: engine,
  businessPack: pack,
  license,
  outputDir: installOne,
  tenantKey: 'tenant-one',
  tenantName: 'Tenant One',
  tier: 'Control',
  releaseChannel: 'candidate',
  environment: 'test'
});
const second = installBusinessOs({
  engineConfig: engine,
  businessPack: pack,
  license,
  outputDir: installTwo,
  tenantKey: 'tenant-two',
  tenantName: 'Tenant Two',
  tier: 'Core',
  releaseChannel: 'stable',
  environment: 'test'
});

check('first tenant installed', fs.existsSync(path.join(installOne, 'manifest.json')));
check('second tenant installed', fs.existsSync(path.join(installTwo, 'manifest.json')));
check('tenant namespaces differ', first.effective.tenant.namespace !== second.effective.tenant.namespace, `${first.effective.tenant.namespace} / ${second.effective.tenant.namespace}`);
check('tenant installation roots differ', first.root !== second.root);
check('test and production environments are explicit', first.effective.environment === 'test' && second.effective.environment === 'test');
check('release channels retained', first.effective.releaseChannel === 'candidate' && second.effective.releaseChannel === 'stable');
check('external actions remain disabled after installation', first.effective.externalActionsEnabled === false && second.effective.externalActionsEnabled === false);
check('all external feature flags forced off', ['customerPortal', 'customerUploads', 'hostedPayments', 'outboundEmail', 'socialPublishing', 'advertisingLaunch', 'websiteDeployment', 'accountingApiSync', 'calendarSync'].every(flag => first.effective.featureFlags[flag] === false));
check('all provider execution states locked', Object.values(first.effective.providers).every(provider => provider.executionState === 'LOCKED' && provider.credentialState === 'NOT_CONFIGURED'));
check('all record stores initialized', first.effective.data.recordTypes.every(type => fs.existsSync(path.join(installOne, first.effective.tenant.namespace, 'data', `${type}.json`))));
check('proof log initialized', fs.existsSync(path.join(installOne, first.effective.tenant.namespace, 'logs', 'proof-log.jsonl')));
check('error log initialized', fs.existsSync(path.join(installOne, first.effective.tenant.namespace, 'logs', 'error-log.jsonl')));
check('private files isolated by tenant', fs.existsSync(path.join(installOne, first.effective.tenant.namespace, 'private-files')) && fs.existsSync(path.join(installTwo, second.effective.tenant.namespace, 'private-files')));

const tenantOneTaskPath = path.join(installOne, first.effective.tenant.namespace, 'data', 'tasks.json');
writeJson(tenantOneTaskPath, [{ id: 'TEST-TASK-001', tenantKey: 'tenant-one', status: 'Needs owner review' }]);
const tenantTwoTasks = readJson(path.join(installTwo, second.effective.tenant.namespace, 'data', 'tasks.json'));
check('tenant write does not leak', tenantTwoTasks.length === 0);

const backup = createBackup(installOne, backupFile);
check('backup created', fs.existsSync(backupFile));
check('backup digest valid', backup.sha256 === sha256(backup.payload));
const restore = restoreBackup(backupFile, restored);
check('restore created', fs.existsSync(path.join(restored, 'manifest.json')));
check('restored tenant identity matches', restore.effective.tenant.key === 'tenant-one');
check('restored task data matches', JSON.stringify(readJson(path.join(restored, restore.effective.tenant.namespace, 'data', 'tasks.json'))) === JSON.stringify(readJson(tenantOneTaskPath)));

const tampered = readJson(backupFile);
tampered.payload.manifest.engineVersion = 'tampered';
const tamperedFile = path.join(tempRoot, 'tampered-backup.json');
writeJson(tamperedFile, tampered);
expectThrow('tampered backup is rejected', () => restoreBackup(tamperedFile, path.join(tempRoot, 'tampered-restore')), 'integrity');

const schemaZero = { ...first.effective, schemaVersion: 0, controls: {} };
const migrated = migrateEffectiveConfig(schemaZero, 1);
check('schema migration reaches current version', migrated.schemaVersion === 1);
check('migration restores selected-record safety', migrated.controls.selectedRecordOnly === true && migrated.controls.bulkExecution === false && migrated.controls.externalActionsEnabled === false);
expectThrow('downgrade migration rejected', () => migrateEffectiveConfig(first.effective, 0), 'Downgrade');

const fullLicense = { ...license, tenantLimit: 1, assignedTenants: ['tenant-one'] };
check('license validates assigned tenant', validateLicense(fullLicense, 'tenant-one', 'Control').length === 0);
expectThrow('license tenant limit enforced', () => compileInstallation(engine, pack, { license: fullLicense, tenantKey: 'tenant-three', tier: 'Control' }), 'tenant limit');
expectThrow('unlicensed tier rejected', () => compileInstallation(engine, pack, { license: { ...license, allowedTiers: ['Core'] }, tenantKey: 'tenant-two', tier: 'Control' }), 'not licensed');
expectThrow('unsafe tenant key rejected', () => compileInstallation(engine, pack, { license, tenantKey: '../unsafe', tier: 'Core' }), 'Tenant key');

const samplePackage = {
  status: 'OWNER_REVIEW_REQUIRED',
  generatedAt: new Date().toISOString(),
  engine: first.effective.engine,
  businessPack: first.effective.businessPack,
  tenant: first.effective.tenant,
  tier: first.effective.tier,
  releaseChannel: first.effective.releaseChannel,
  enabledModules: first.effective.modules.filter(module => module.enabled).map(module => module.id),
  providers: first.effective.providers,
  controls: first.effective.controls,
  externalActionsEnabled: false,
  createdTasks: [
    { id: 'BOS-T001', title: 'Approve Business Pack and tenant configuration', status: 'Needs owner review' },
    { id: 'BOS-T002', title: 'Select providers and supply credentials', status: 'Blocked by credentials' },
    { id: 'BOS-T003', title: 'Run cross-tenant permission tests before portal activation', status: 'Required' },
    { id: 'BOS-T004', title: 'Approve production release channel', status: 'Needs owner review' }
  ]
};
writeJson(path.join(evidenceDir, 'business-os-sample-package.json'), samplePackage);

const evidence = {
  status: failures.length ? 'HOLD' : 'PASS',
  generatedAt: new Date().toISOString(),
  passed: passes.length,
  failed: failures.length,
  engineVersion: engine.engine.version,
  schemaVersion: engine.schemaVersion,
  filesTested: [
    path.relative(ROOT, enginePath),
    path.relative(ROOT, packPath),
    path.relative(ROOT, adapterPath),
    path.relative(ROOT, tiersPath),
    path.relative(ROOT, licensePath)
  ],
  controls: {
    externalActionsEnabled: false,
    selectedRecordOnly: true,
    tenantIsolation: true,
    backupIntegrity: true,
    licenseControl: true
  },
  passes,
  failures
};
writeJson(path.join(evidenceDir, 'business-os-productization.json'), evidence);
console.log(JSON.stringify(evidence, null, 2));
fs.rmSync(tempRoot, { recursive: true, force: true });
process.exit(failures.length ? 1 : 0);
