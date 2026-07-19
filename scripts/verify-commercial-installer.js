#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  PHASES,
  CANONICAL_ROLES,
  readJson,
  writeJson,
  validateBusinessPackV1,
  validateProductPackage,
  validateInstallationManifest,
  createBusinessPackV1FromLegacy,
  createInstallationManifest,
  runSanitizedInstallation,
  createSanitizedResourceAdapter,
  canAutoRemoveResource,
  quarantineResource,
  validateUpgrade
} = require('../core-engine/product/commercial-installer');

const ROOT = path.resolve(__dirname, '..');
const outputDir = path.join(ROOT, 'artifacts', 'commercial-install-acceptance');
const passes = [];
const failures = [];

function check(name, fn) {
  try {
    const detail = fn();
    passes.push({ name, detail: detail == null ? '' : String(detail) });
  } catch (error) {
    failures.push({ name, detail: error.stack || error.message });
  }
}

const files = {
  businessPackSchema: path.join(ROOT, 'core-engine/product/contracts/business-pack-manifest.v1.schema.json'),
  productPackageSchema: path.join(ROOT, 'core-engine/product/contracts/product-package-manifest.v1.schema.json'),
  installationSchema: path.join(ROOT, 'core-engine/product/contracts/installation-manifest.v1.schema.json'),
  quoteBuilder: path.join(ROOT, 'core-engine/product/packages/quote-builder.v1.json'),
  businessSystem: path.join(ROOT, 'core-engine/product/packages/business-system.v1.json'),
  fixture: path.join(ROOT, 'core-engine/product/fixtures/sanitized-property-services-business.v1.json'),
  workflow: path.join(ROOT, '.github/workflows/commercial-install-acceptance.yml')
};

for (const [label, file] of Object.entries(files)) {
  check(`required file exists: ${label}`, () => assert.ok(fs.existsSync(file), file));
}

for (const file of [files.businessPackSchema, files.productPackageSchema, files.installationSchema, files.quoteBuilder, files.businessSystem, files.fixture]) {
  check(`JSON parses: ${path.relative(ROOT, file)}`, () => JSON.parse(fs.readFileSync(file, 'utf8')) && 'PASS');
}

const quoteBuilder = readJson(files.quoteBuilder);
const businessSystem = readJson(files.businessSystem);
const fixture = readJson(files.fixture);

check('Quote Builder Product Package validates', () => assert.deepStrictEqual(validateProductPackage(quoteBuilder), []));
check('Business System Product Package validates', () => assert.deepStrictEqual(validateProductPackage(businessSystem), []));
check('sanitized Business Pack validates', () => assert.deepStrictEqual(validateBusinessPackV1(fixture), []));
check('sanitized fixture has no Google resource IDs', () => {
  const source = JSON.stringify(fixture);
  assert.ok(!/(?:AKfyc[A-Za-z0-9_-]+|1[A-Za-z0-9_-]{24,})/.test(source));
});
check('sanitized fixture contains no Highway 38 or Northern Lakes identity', () => {
  const source = JSON.stringify(fixture);
  assert.ok(!/Highway\s*38|Northern\s*Lakes|NLPS|H38_/i.test(source));
});
check('Quote Builder excludes operational capabilities', () => {
  for (const capability of ['work-orders', 'jobs', 'purchasing', 'expenses', 'invoices-and-payments']) {
    assert.ok(quoteBuilder.excludedCapabilities.includes(capability), capability);
  }
});
check('Business System extends Quote Builder', () => assert.strictEqual(businessSystem.extends, 'quote-builder@1.0.0'));
check('both packages keep external actions locked', () => {
  assert.strictEqual(quoteBuilder.controls.externalActionsEnabled, false);
  assert.strictEqual(businessSystem.controls.externalActionsEnabled, false);
});

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'commercial-installer-'));
const adapter = createSanitizedResourceAdapter('verification-seed');
const firstManifest = createInstallationManifest({
  operation: 'NEW_INSTALL',
  environment: 'sanitized-test',
  installationId: 'INSTALL-SANITIZED-001',
  businessPack: fixture,
  productPackage: quoteBuilder,
  ownerAccount: 'owner@example.invalid',
  deployingAccount: 'owner@example.invalid'
});
runSanitizedInstallation({ manifest: firstManifest, businessPack: fixture, productPackage: quoteBuilder, adapter });

check('sanitized install manifest validates', () => assert.deepStrictEqual(validateInstallationManifest(firstManifest), []));
check('sanitized install commits all phases', () => {
  assert.strictEqual(firstManifest.state, 'COMMITTED');
  assert.strictEqual(firstManifest.phases.length, PHASES.length);
  assert.ok(firstManifest.phases.every(phase => ['PASS', 'SKIPPED'].includes(phase.status)));
});
check('sanitized install creates six isolated resources', () => assert.strictEqual(firstManifest.resources.length, 6));
check('sanitized install keeps provider and external actions locked', () => {
  assert.strictEqual(firstManifest.controls.externalActionsEnabled, false);
  assert.strictEqual(firstManifest.controls.customerPortalReleased, false);
  assert.ok(Object.values(firstManifest.providerStates).every(state => state === 'LOCKED'));
});
check('committed resources are not auto-delete eligible', () => {
  assert.ok(firstManifest.resources.every(resource => !canAutoRemoveResource(resource, firstManifest.attemptId)));
});

const secondManifest = createInstallationManifest({
  operation: 'NEW_INSTALL',
  environment: 'sanitized-test',
  installationId: 'INSTALL-SANITIZED-001',
  businessPack: fixture,
  productPackage: quoteBuilder,
  ownerAccount: 'owner@example.invalid',
  deployingAccount: 'owner@example.invalid'
});
runSanitizedInstallation({ manifest: secondManifest, businessPack: fixture, productPackage: quoteBuilder, adapter });
check('repeated sanitized install discovers the same resources', () => {
  assert.deepStrictEqual(secondManifest.resources.map(item => item.resourceId), firstManifest.resources.map(item => item.resourceId));
});

const quarantineManifest = createInstallationManifest({
  operation: 'NEW_INSTALL',
  environment: 'sanitized-test',
  installationId: 'INSTALL-QUARANTINE-001',
  businessPack: fixture,
  productPackage: quoteBuilder,
  ownerAccount: 'owner@example.invalid',
  deployingAccount: 'owner@example.invalid'
});
quarantineManifest.resources.push({
  resourceType: 'DRIVE_FOLDER',
  resourceId: 'test-quarantine-resource',
  resourceName: 'quarantine-test',
  ownerAccount: quarantineManifest.ownerAccount,
  deployingAccount: quarantineManifest.deployingAccount,
  createdByAttempt: quarantineManifest.attemptId,
  createdAt: new Date().toISOString(),
  preExisting: false,
  committed: false,
  sharedWith: ['reviewer@example.invalid'],
  referencedBy: [],
  containsData: false,
  idempotencyKey: 'quarantine-key',
  state: 'CREATED_UNCOMMITTED',
  safeDeleteEligible: false,
  quarantineUntil: null,
  proofReference: null
});
const quarantineEntry = quarantineResource(quarantineManifest, 'test-quarantine-resource', 'Synthetic failure');
check('shared failed resource is quarantined for owner review', () => {
  assert.strictEqual(quarantineManifest.state, 'QUARANTINED');
  assert.strictEqual(quarantineEntry.ownerDeletionRequired, true);
  const days = (new Date(quarantineEntry.quarantineUntil) - new Date(quarantineEntry.quarantinedAt)) / 86400000;
  assert.strictEqual(days, 30);
});

const legacyPack = {
  packId: 'legacy-test',
  business: { id: 'LEGACY', name: 'Legacy Test LLC', legalName: 'Legacy Test LLC' },
  branding: { brandName: 'Legacy Test' },
  package: { id: 'quote-builder', version: '0.1.0' },
  modules: ['customers', 'quotes'],
  roles: ['Owner', 'Administrator', 'Operator', 'Reviewer', 'Customer'],
  catalog: { mode: 'EMPTY' },
  storage: { propertyKeys: {} },
  numbering: { sequences: [] },
  templates: {}
};
const migration = createBusinessPackV1FromLegacy(legacyPack, { packageId: 'quote-builder', packageVersion: '1.0.0' });
check('legacy Business Pack produces an approval-gated migration preview', () => {
  assert.strictEqual(migration.classification, 'MIGRATABLE');
  assert.strictEqual(migration.approvalRequired, true);
  assert.ok(migration.preview.length >= 4);
  assert.deepStrictEqual(validateBusinessPackV1(migration.manifest), []);
});
check('legacy roles map to canonical roles and customer access profile', () => {
  assert.deepStrictEqual(migration.manifest.roles.definitions.map(item => item.name).sort(), [...CANONICAL_ROLES].sort());
  assert.ok(migration.manifest.roles.customerAccessProfiles.some(item => item.name === 'CustomerPortalUser'));
});

const upgradeResult = validateUpgrade(firstManifest, businessSystem);
check('Quote Builder-to-Business-System upgrade preserves installation', () => {
  assert.strictEqual(upgradeResult.status, 'PASS');
  assert.strictEqual(upgradeResult.existingProjectPreserved, true);
  assert.strictEqual(upgradeResult.recordReentryRequired, false);
  assert.ok(upgradeResult.preserved.includes('installationId'));
  assert.ok(upgradeResult.preserved.includes('resources'));
});

check('authoritative workflow is manual-only and read-only', () => {
  const workflow = fs.readFileSync(files.workflow, 'utf8');
  assert.ok(/workflow_dispatch:/.test(workflow));
  assert.ok(!/^\s*push:/m.test(workflow));
  assert.ok(/contents:\s*read/.test(workflow));
  assert.ok(!/contents:\s*write/.test(workflow));
  assert.ok(!/deploy-unified-owner-portal-web\.sh/.test(workflow));
  assert.ok(!/deploy-northern-lakes-business-office/.test(workflow));
  assert.ok(!/clasp\s+(?:create|push|deploy|update-deployment)/.test(workflow));
});

const evidence = {
  status: failures.length ? 'HOLD' : 'PASS',
  generatedAt: new Date().toISOString(),
  passed: passes.length,
  failed: failures.length,
  branchScope: 'Commercial installer contracts, sanitized acceptance, migration, idempotency, quarantine and upgrade verification.',
  implementationLimits: [
    'No production deployment performed.',
    'No Northern Lakes deployment performed.',
    'Customer-owned Google OAuth provisioning adapter remains gated until customer authorization is supplied.'
  ],
  controls: {
    externalActionsEnabled: false,
    customerPortalReleased: false,
    productionWorkflowInvoked: false,
    northernLakesWorkflowInvoked: false
  },
  passes,
  failures
};
writeJson(path.join(outputDir, 'verification.json'), evidence);
writeJson(path.join(outputDir, 'sanitized-installation-manifest.json'), firstManifest);
console.log(JSON.stringify(evidence, null, 2));
fs.rmSync(tempRoot, { recursive: true, force: true });
process.exit(failures.length ? 1 : 0);
