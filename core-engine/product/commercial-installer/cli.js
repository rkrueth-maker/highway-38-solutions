#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  readJson,
  writeJson,
  createBusinessPackV1FromLegacy,
  createInstallationManifest,
  validateBusinessPackV1,
  validateProductPackage,
  validateInstallationManifest,
  runSanitizedInstallation,
  getResumePhase,
  validateUpgrade
} = require('./index');

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) result[key] = true;
    else {
      result[key] = next;
      i += 1;
    }
  }
  return result;
}

function fail(message, code = 1) {
  console.error(`HOLD — ${message}`);
  process.exit(code);
}

function resolveFile(value, label) {
  if (!value) fail(`${label} path is required.`, 2);
  const file = path.resolve(value);
  if (!fs.existsSync(file)) fail(`${label} not found: ${file}`, 2);
  return file;
}

function loadBusinessPack(file, packageId, packageVersion) {
  const source = readJson(file);
  const migration = createBusinessPackV1FromLegacy(source, { packageId, packageVersion });
  if (migration.approvalRequired) {
    migration.manifest.migrationHistory.items.push({
      sourceType: migration.sourceType,
      sourceHash: migration.sourceHash,
      status: 'PREVIEW_GENERATED',
      approvalReference: null,
      preview: migration.preview
    });
  }
  return migration;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const operation = String(args.operation || 'VALIDATE_ONLY').toUpperCase().replace(/-/g, '_');
  const productFile = resolveFile(args['product-package'], 'Product Package');
  const packFile = resolveFile(args['business-pack'], 'Business Pack');
  const output = path.resolve(args.output || 'artifacts/commercial-install-acceptance/installation-manifest.json');
  const productPackage = readJson(productFile);
  const packageErrors = validateProductPackage(productPackage);
  if (packageErrors.length) fail(packageErrors.join(' '), 3);

  const migration = loadBusinessPack(packFile, productPackage.id, productPackage.version);
  const businessPack = migration.manifest;
  const packErrors = validateBusinessPackV1(businessPack);
  if (packErrors.length) fail(packErrors.join(' '), 3);

  if (operation === 'RESUME') {
    const manifestFile = resolveFile(args.manifest, 'Installation Manifest');
    const manifest = readJson(manifestFile);
    const errors = validateInstallationManifest(manifest);
    if (errors.length) fail(errors.join(' '), 3);
    writeJson(output, {
      status: 'READY_TO_RESUME',
      nextPhase: getResumePhase(manifest),
      manifest
    });
    console.log(JSON.stringify({ status: 'READY_TO_RESUME', output, nextPhase: getResumePhase(manifest) }, null, 2));
    return;
  }

  if (operation === 'UPGRADE') {
    const manifestFile = resolveFile(args.manifest, 'Installation Manifest');
    const sourceManifest = readJson(manifestFile);
    const result = validateUpgrade(sourceManifest, productPackage);
    writeJson(output, { operation, result, sourceManifestHash: sourceManifest.inputHash || null });
    console.log(JSON.stringify({ operation, output, ...result }, null, 2));
    if (result.status !== 'PASS') process.exitCode = 4;
    return;
  }

  const manifest = createInstallationManifest({
    operation,
    environment: args.environment || 'sanitized-test',
    installationId: args['installation-id'] || null,
    businessPack,
    productPackage,
    ownerAccount: args.owner || 'sanitized-owner@example.invalid',
    deployingAccount: args['deploying-account'] || args.owner || 'sanitized-owner@example.invalid',
    ownerApprovalReference: args['owner-approval-reference'] || null,
    supportAccess: {
      enabled: false,
      expiresAt: null,
      removalProcedure: null
    }
  });
  manifest.migrationHistory.push({
    sourceType: migration.sourceType,
    classification: migration.classification,
    sourceHash: migration.sourceHash,
    approvalRequired: migration.approvalRequired,
    preview: migration.preview
  });

  if (operation === 'VALIDATE_ONLY' || operation === 'ROLLBACK_VERIFY' || operation === 'REPAIR' || operation === 'CONTROLLED_ACCEPTANCE') {
    writeJson(output, manifest);
    console.log(JSON.stringify({
      status: 'PASS',
      operation,
      environment: manifest.environment,
      output,
      externalActionsEnabled: false,
      customerPortalReleased: false,
      nextPhase: getResumePhase(manifest)
    }, null, 2));
    return;
  }

  if (operation !== 'NEW_INSTALL') fail(`Operation ${operation} is not executable by this CLI mode.`, 4);
  if (manifest.environment !== 'sanitized-test') {
    fail('NEW_INSTALL execution is limited to sanitized-test until the customer-owned Google authorization adapter is supplied.', 78);
  }
  runSanitizedInstallation({
    manifest,
    businessPack,
    productPackage,
    ownerApprovalReference: args['owner-approval-reference'] || manifest.ownerAccount
  });
  writeJson(output, manifest);
  console.log(JSON.stringify({
    status: manifest.state === 'COMMITTED' ? 'PASS' : manifest.state,
    operation,
    environment: manifest.environment,
    output,
    installationId: manifest.installationId,
    resourceCount: manifest.resources.length,
    externalActionsEnabled: manifest.controls.externalActionsEnabled,
    customerPortalReleased: manifest.controls.customerPortalReleased
  }, null, 2));
}

try {
  main();
} catch (error) {
  fail(`${error.code ? `${error.code}: ` : ''}${error.message}`, 1);
}
