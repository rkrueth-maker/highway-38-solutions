#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const core = require('../core-engine/product/commercial/lib/commercial-license.js');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_DIR = path.join(ROOT, 'launch-control', 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
const passes = [];
const failures = [];
const check = (name, condition, detail = '') => (condition ? passes : failures).push({ name, detail });
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const readJson = relative => JSON.parse(read(relative));
const exists = relative => fs.existsSync(path.join(ROOT, relative));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8'); };

function expectThrow(name, fn, includes) {
  try {
    fn();
    failures.push({ name, detail: 'Expected an error but none was thrown.' });
  } catch (error) {
    check(name, !includes || String(error.message).includes(includes), error.message);
  }
}

function runCli(args) {
  return childProcess.spawnSync(process.execPath, [path.join(ROOT, 'scripts/business-os-commercial-license.js'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
}

function main() {
  const required = [
    'core-engine/product/commercial/README.md',
    'core-engine/product/commercial/lib/commercial-license.js',
    'core-engine/product/commercial/config/commercial-plans.json',
    'core-engine/product/commercial/config/example-public-keyring.json',
    'core-engine/product/commercial/config/revocations.example.json',
    'core-engine/product/commercial/examples/synthetic-license-payload.json',
    'core-engine/product/commercial/schema/signed-license.schema.json',
    'core-engine/product/commercial/schema/commercial-state.schema.json',
    'scripts/business-os-commercial-license.js',
    'launch-control/commercial-license-status.json'
  ];
  required.forEach(file => check(`required artifact: ${file}`, exists(file)));

  const plans = readJson('core-engine/product/commercial/config/commercial-plans.json');
  const exampleKeyRing = readJson('core-engine/product/commercial/config/example-public-keyring.json');
  const exampleRevocations = readJson('core-engine/product/commercial/config/revocations.example.json');
  const samplePayload = readJson('core-engine/product/commercial/examples/synthetic-license-payload.json');
  const status = readJson('launch-control/commercial-license-status.json');
  const signedSchema = readJson('core-engine/product/commercial/schema/signed-license.schema.json');
  const stateSchema = readJson('core-engine/product/commercial/schema/commercial-state.schema.json');

  check('commercial plans contain four exact tiers', JSON.stringify(plans.tiers.map(item => item.id)) === JSON.stringify(['Core', 'Operations', 'Growth', 'Control']));
  check('commercial plans contain eight add-ons', plans.addOns.length === 8, String(plans.addOns.length));
  check('commercial plans contain three support plans', plans.supportPlans.length === 3, String(plans.supportPlans.length));
  check('commercial controls are fail closed', plans.controls.selectedRecordOnly === true && plans.controls.bulkExecution === false && plans.controls.automaticRetry === false && plans.controls.ownerApprovalRequired === true && plans.controls.externalActionsEnabled === false);
  check('planning prices are not represented as approved', plans.pricingStatus === 'PLANNING_ONLY_NOT_PUBLIC_APPROVAL' && plans.tiers.every(item => item.monthlyPlanningAmount === 0));
  check('example keyring is public only', exampleKeyRing.privateKeysIncluded === false && exampleKeyRing.productionReady === false && exampleKeyRing.keys.every(item => item.publicKeyPem.includes('PUBLIC KEY') && !item.publicKeyPem.includes('PRIVATE KEY')));
  check('example revocation list is empty', Array.isArray(exampleRevocations.items) && exampleRevocations.items.length === 0);
  check('schemas enforce Ed25519 and external lock', signedSchema.properties.algorithm.const === 'Ed25519' && signedSchema.properties.externalActionsEnabled.const === false && stateSchema.properties.controls.properties.externalActionsEnabled.const === false);

  const pairOne = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const pairTwo = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const keyRing = {
    schemaVersion: 1,
    keys: [
      { keyId: 'key-one', status: 'ACTIVE', publicKeyPem: pairOne.publicKey },
      { keyId: 'key-two', status: 'ACTIVE', publicKeyPem: pairTwo.publicKey }
    ]
  };
  const fixedNow = '2026-07-12T21:00:00.000Z';
  const payload = core.createLicensePayload(samplePayload);
  const signedOne = core.signLicense(payload, pairOne.privateKey, 'key-one');
  const verifiedOne = core.verifySignedLicense(signedOne, keyRing, [], { now: fixedNow });
  check('Ed25519 signed license verifies', verifiedOne.valid === true && verifiedOne.status === 'PASS' && verifiedOne.payload.licenseId === payload.licenseId);
  check('signed license contains canonical hash and no external action', signedOne.payloadSha256 === core.sha256(core.stableStringify(payload)) && signedOne.externalActionsEnabled === false);

  const signedTwo = core.signLicense(payload, pairTwo.privateKey, 'key-two');
  check('key rotation key ID verifies', core.verifySignedLicense(signedTwo, keyRing, [], { now: fixedNow }).valid === true);
  const retiredRing = { schemaVersion: 1, keys: [{ keyId: 'key-one', status: 'RETIRED', publicKeyPem: pairOne.publicKey }, { keyId: 'key-two', status: 'ACTIVE', publicKeyPem: pairTwo.publicKey }] };
  check('retired key is rejected while active rotation key works', core.verifySignedLicense(signedOne, retiredRing, [], { now: fixedNow }).valid === false && core.verifySignedLicense(signedTwo, retiredRing, [], { now: fixedNow }).valid === true);

  const tampered = JSON.parse(JSON.stringify(signedOne));
  tampered.payload.seatLimit = 999;
  const tamperedResult = core.verifySignedLicense(tampered, keyRing, [], { now: fixedNow });
  check('payload tampering is rejected', tamperedResult.valid === false && tamperedResult.errors.some(error => error.includes('hash')));
  const wrongKeyRing = { schemaVersion: 1, keys: [{ keyId: 'key-one', status: 'ACTIVE', publicKeyPem: pairTwo.publicKey }] };
  check('wrong public key is rejected', core.verifySignedLicense(signedOne, wrongKeyRing, [], { now: fixedNow }).valid === false);

  const futurePayload = core.createLicensePayload({ ...samplePayload, licenseId: 'LIC-FUTURE', validFrom: '2027-01-01T00:00:00.000Z', validUntil: '2028-01-01T00:00:00.000Z' });
  const expiredPayload = core.createLicensePayload({ ...samplePayload, licenseId: 'LIC-EXPIRED', validFrom: '2024-01-01T00:00:00.000Z', validUntil: '2025-01-01T00:00:00.000Z' });
  const suspendedPayload = core.createLicensePayload({ ...samplePayload, licenseId: 'LIC-SUSPENDED', status: 'SUSPENDED' });
  check('not-yet-active license is rejected', core.verifySignedLicense(core.signLicense(futurePayload, pairOne.privateKey, 'key-one'), keyRing, [], { now: fixedNow }).valid === false);
  check('expired license is rejected', core.verifySignedLicense(core.signLicense(expiredPayload, pairOne.privateKey, 'key-one'), keyRing, [], { now: fixedNow }).valid === false);
  check('suspended license is rejected', core.verifySignedLicense(core.signLicense(suspendedPayload, pairOne.privateKey, 'key-one'), keyRing, [], { now: fixedNow }).valid === false);

  const revocationDraft = core.createRevocationDraft({ licenseId: payload.licenseId, reason: 'Synthetic contract ended', requestedBy: 'owner-test' });
  check('revocation starts as owner-review draft', revocationDraft.status === core.OWNER_REVIEW && revocationDraft.ownerApproved === false && revocationDraft.externalActionsEnabled === false);
  expectThrow('revocation cannot activate without owner approval', () => core.activateRevocation(revocationDraft, { ownerApproved: false }), 'owner approval');
  const activeRevocation = core.activateRevocation(revocationDraft, { ownerApproved: true, ownerId: 'owner-test', approvedAt: fixedNow, effectiveAt: fixedNow });
  check('approved revocation invalidates signed license', activeRevocation.status === 'ACTIVE' && core.verifySignedLicense(signedOne, keyRing, [activeRevocation], { now: fixedNow }).valid === false);

  const authorized = core.authorizeEntitlement(payload, { tenantKey: 'synthetic-one', module: 'jobs', feature: 'backup-restore', addOn: 'backup-recovery-service', releaseChannel: 'stable', seatsUsed: 5 });
  const tenantDenied = core.authorizeEntitlement(payload, { tenantKey: 'other-tenant' });
  const moduleDenied = core.authorizeEntitlement(payload, { module: 'advertising' });
  const featureDenied = core.authorizeEntitlement(payload, { feature: 'unlicensed-feature' });
  const channelDenied = core.authorizeEntitlement(payload, { releaseChannel: 'development' });
  const seatsDenied = core.authorizeEntitlement(payload, { seatsUsed: 11 });
  check('licensed tenant module feature add-on channel and seats are authorized', authorized.authorized === true && authorized.status === 'AUTHORIZED');
  check('tenant entitlement denial works', tenantDenied.authorized === false && tenantDenied.denials.includes('Tenant is not licensed.'));
  check('module entitlement denial works', moduleDenied.authorized === false);
  check('feature entitlement denial works', featureDenied.authorized === false);
  check('release-channel entitlement denial works', channelDenied.authorized === false);
  check('seat-limit entitlement denial works', seatsDenied.authorized === false);

  const sensitiveField = ['pass', 'word'].join('');
  expectThrow('sensitive billing field is rejected', () => core.assertNoSensitiveData({ [sensitiveField]: 'synthetic' }), 'Sensitive field');
  const paymentCandidate = ['4111', '1111', '1111', '1112'].join('');
  expectThrow('raw payment-card candidate is rejected', () => core.assertNoSensitiveData({ note: paymentCandidate }), 'payment-card');
  const privateHeader = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
  expectThrow('private key material is rejected from records', () => core.assertNoSensitiveData({ note: privateHeader }), 'Private key');

  const billing = core.createBillingState({ billingAccountId: 'BILL-SYNTHETIC-001', customerId: payload.customerId });
  const subscription = core.prepareSubscription(billing, { subscriptionId: 'SUB-SYNTHETIC-001', licenseId: payload.licenseId, planId: 'Control', amount: 0, cadence: 'monthly' });
  check('subscription remains owner-review and provider locked', subscription.status === core.OWNER_REVIEW && subscription.ownerApproved === false && billing.executionState === 'LOCKED' && billing.credentialState === 'NOT_CONFIGURED');
  expectThrow('duplicate subscription is rejected', () => core.prepareSubscription(billing, { subscriptionId: 'SUB-SYNTHETIC-001', licenseId: payload.licenseId, planId: 'Control' }), 'Duplicate');
  const successEvent = core.applyProviderBillingEvent(billing, { providerEventId: 'EVT-001', type: 'invoice.paid', recordId: 'INV-001', outcome: 'SUCCESS', amount: 0, providerReference: 'provider-synthetic-001' });
  const duplicateEvent = core.applyProviderBillingEvent(billing, { providerEventId: 'EVT-001', type: 'invoice.paid', recordId: 'INV-001', outcome: 'SUCCESS', amount: 0 });
  const failedEvent = core.applyProviderBillingEvent(billing, { providerEventId: 'EVT-002', type: 'invoice.payment_failed', recordId: 'INV-002', outcome: 'FAILURE' });
  const timeoutEvent = core.applyProviderBillingEvent(billing, { providerEventId: 'EVT-003', type: 'invoice.pending', recordId: 'INV-003', outcome: 'TIMEOUT' });
  const uncertainEvent = core.applyProviderBillingEvent(billing, { providerEventId: 'EVT-004', type: 'refund.pending', recordId: 'REF-004', outcome: 'UNCERTAIN' });
  check('successful provider event records internal result', successEvent.status === 'PASS' && successEvent.mutated === true && billing.invoices.length === 1);
  check('duplicate provider event does not mutate', duplicateEvent.status === 'DUPLICATE' && duplicateEvent.mutated === false && billing.invoices.length === 1);
  check('failed provider event records Error Log without retry', failedEvent.status === 'FAILED' && failedEvent.retryScheduled === false && billing.errorLog.some(item => item.code === 'PROVIDER_EVENT_FAILED'));
  check('timeout is held without automatic retry', timeoutEvent.status === 'HOLD' && timeoutEvent.retryScheduled === false && billing.uncertainEvents.some(item => item.providerEventId === 'EVT-003'));
  check('uncertain result is held without automatic retry', uncertainEvent.status === 'HOLD' && uncertainEvent.retryScheduled === false && billing.automaticRetry === false);
  check('Proof Log records prepared, success, and duplicate outcomes', billing.proofLog.some(item => item.action === 'SUBSCRIPTION_PREPARED') && billing.proofLog.some(item => item.action === 'PROVIDER_EVENT_RECORDED') && billing.proofLog.some(item => item.action === 'PROVIDER_EVENT_DUPLICATE'));

  const support = core.createSupportContract({ contractId: 'SUP-SYNTHETIC-001', licenseId: payload.licenseId, planId: 'Managed', responseTargetHours: 24, includedRequests: 2, overageUnitPrice: 75 });
  const includedUsage = core.recordSupportUsage(support, { units: 2 });
  const overageUsage = core.recordSupportUsage(support, { units: 2 });
  check('support contract remains owner-review', support.status === core.OWNER_REVIEW && support.ownerApproved === false && support.externalActionsEnabled === false);
  check('included support usage does not draft overage', includedUsage.overageUnits === 0 && includedUsage.billingStatus === 'INCLUDED');
  check('support overage creates draft only', overageUsage.overageUnits === 2 && overageUsage.overageDraftAmount === 150 && overageUsage.billingStatus === core.OWNER_REVIEW);

  const audit = [];
  core.appendAuditEntry(audit, { timestamp: fixedNow, eventType: 'LICENSE_SIGNED', recordId: payload.licenseId, detail: { keyId: 'key-one' } });
  core.appendAuditEntry(audit, { timestamp: fixedNow, eventType: 'SUBSCRIPTION_PREPARED', recordId: subscription.subscriptionId, detail: { planId: subscription.planId } });
  check('audit hash chain verifies', core.verifyAuditChain(audit).valid === true && audit.length === 2);
  const alteredAudit = JSON.parse(JSON.stringify(audit));
  alteredAudit[0].detail.keyId = 'changed';
  check('audit tampering is rejected', core.verifyAuditChain(alteredAudit).valid === false);

  const gateHold = core.commercialActivationGate({ privateKeyCustody: false, entitlementRuntime: false, billingProvider: false, supportOperations: false, ownerRelease: false });
  const gatePass = core.commercialActivationGate({ privateKeyCustody: true, entitlementRuntime: true, billingProvider: true, supportOperations: true, ownerRelease: true });
  check('production activation gate lists five blockers', gateHold.status === 'HOLD' && gateHold.blockers.length === 5 && gateHold.productionReady === false);
  check('activation gate can pass only when every explicit gate is true', gatePass.status === 'PASS' && gatePass.productionReady === true && gatePass.externalActionsEnabled === false);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'business-os-commercial-'));
  const privateDir = path.join(tempRoot, 'private-secrets');
  const privateKeyFile = path.join(privateDir, 'signing-key.pem');
  const publicKeyFile = path.join(tempRoot, 'signing-public.pem');
  const keyRingFile = path.join(tempRoot, 'keyring.json');
  const signedFile = path.join(tempRoot, 'signed-license.json');
  const revocationFile = path.join(tempRoot, 'revocation-draft.json');
  const generateResult = runCli(['generate-keypair', '--key-id', 'cli-key-one', '--private-out', privateKeyFile, '--public-out', publicKeyFile, '--keyring-out', keyRingFile]);
  check('CLI generates private and public keys outside repository', generateResult.status === 0 && fs.existsSync(privateKeyFile) && fs.existsSync(publicKeyFile) && fs.existsSync(keyRingFile), generateResult.stderr);
  check('CLI private key uses mode 0600', (fs.statSync(privateKeyFile).mode & 0o777) === 0o600, (fs.statSync(privateKeyFile).mode & 0o777).toString(8));
  check('CLI public keyring contains no private key', JSON.parse(fs.readFileSync(keyRingFile, 'utf8')).privateKeysIncluded === false && !fs.readFileSync(keyRingFile, 'utf8').includes('PRIVATE KEY'));
  const signResult = runCli(['sign', '--payload', path.join(ROOT, 'core-engine/product/commercial/examples/synthetic-license-payload.json'), '--private-key', privateKeyFile, '--key-id', 'cli-key-one', '--output', signedFile]);
  check('CLI signs synthetic license', signResult.status === 0 && fs.existsSync(signedFile), signResult.stderr);
  const verifyResult = runCli(['verify', '--license', signedFile, '--keyring', keyRingFile, '--revocations', path.join(ROOT, 'core-engine/product/commercial/config/revocations.example.json'), '--now', fixedNow]);
  check('CLI verifies signed license', verifyResult.status === 0 && JSON.parse(verifyResult.stdout).valid === true, verifyResult.stderr || verifyResult.stdout);
  const inspectResult = runCli(['inspect', '--license', signedFile, '--keyring', keyRingFile, '--revocations', path.join(ROOT, 'core-engine/product/commercial/config/revocations.example.json'), '--now', fixedNow, '--tenant', 'synthetic-one', '--module', 'jobs', '--feature', 'backup-restore', '--add-on', 'backup-recovery-service', '--channel', 'stable', '--seats', '5']);
  check('CLI entitlement inspection passes selected request', inspectResult.status === 0 && JSON.parse(inspectResult.stdout).authorization.authorized === true, inspectResult.stderr || inspectResult.stdout);
  const revokeResult = runCli(['revoke-draft', '--license-id', payload.licenseId, '--reason', 'Synthetic contract ended', '--output', revocationFile]);
  check('CLI creates owner-review revocation draft', revokeResult.status === 0 && JSON.parse(fs.readFileSync(revocationFile, 'utf8')).status === core.OWNER_REVIEW);
  const invalidPrivatePath = path.join(ROOT, 'forbidden-private-key.pem');
  const invalidGenerate = runCli(['generate-keypair', '--key-id', 'bad-key', '--private-out', invalidPrivatePath, '--public-out', path.join(tempRoot, 'bad-public.pem')]);
  check('CLI refuses private key output inside repository', invalidGenerate.status !== 0 && !fs.existsSync(invalidPrivatePath));

  const commercialFiles = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) commercialFiles.push(full);
    }
  }
  walk(path.join(ROOT, 'core-engine/product/commercial'));
  commercialFiles.push(path.join(ROOT, 'scripts/business-os-commercial-license.js'));
  commercialFiles.push(path.join(ROOT, 'scripts/verify-business-os-commercial-license.js'));
  const privatePemHeader = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
  const rawText = commercialFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  check('repository contains no committed private-key material', !rawText.includes(privatePemHeader));
  check('repository commercial package contains no live provider credential marker', !/sk_live_|ghp_|AIza[0-9A-Za-z_-]{20,}/.test(rawText));

  check('status narrows commercial blocker without claiming production activation', status.status === 'INFRASTRUCTURE_READY_PRODUCTION_ACTIVATION_BLOCKED' && status.productionBlockers.length === 5 && status.externalActionsOccurred === false);
  check('status preserves selected-record and retry controls', status.selectedRecordOnly === true && status.bulkExecution === false && status.automaticRetry === false && status.privateKeyCommitted === false && status.rawCardDataAccepted === false);

  const syntheticPackage = {
    status: 'PASS_SYNTHETIC_CONTROL_PLANE',
    generatedAt: fixedNow,
    license: {
      licenseId: payload.licenseId,
      keyId: signedOne.keyId,
      payloadSha256: signedOne.payloadSha256,
      signatureVerified: verifiedOne.valid,
      entitlements: verifiedOne.entitlements
    },
    revocation: { draftStatus: revocationDraft.status, activeStatus: activeRevocation.status, revokedLicenseRejected: true },
    billing: {
      subscriptionStatus: subscription.status,
      success: successEvent.status,
      duplicate: duplicateEvent.status,
      failure: failedEvent.status,
      timeout: timeoutEvent.status,
      uncertain: uncertainEvent.status,
      proofEntries: billing.proofLog.length,
      errorEntries: billing.errorLog.length,
      automaticRetry: billing.automaticRetry
    },
    support: { contractId: support.contractId, overageDraftAmount: overageUsage.overageDraftAmount, externalActionsEnabled: false },
    audit: { entries: audit.length, valid: core.verifyAuditChain(audit).valid },
    activationGate: gateHold,
    productionPrivateKeyUsed: false,
    liveProviderCalled: false,
    externalActionsOccurred: false
  };
  writeJson(path.join(EVIDENCE_DIR, 'business-os-commercial-license-synthetic.json'), syntheticPackage);

  const evidence = {
    status: failures.length ? 'HOLD' : 'PASS',
    generatedAt: new Date().toISOString(),
    release: 'commercial-license-control-plane-2026-07-12',
    issue: 59,
    blockerId: 'COMMERCIAL-LICENSE-001',
    passed: passes.length,
    failed: failures.length,
    controls: {
      algorithm: core.ALGORITHM,
      selectedRecordOnly: true,
      bulkExecution: false,
      automaticRetry: false,
      proofLogRequired: true,
      errorLogRequired: true,
      privateKeyCommitted: false,
      rawCardDataAccepted: false,
      externalActionsEnabled: false
    },
    productionBlockers: status.productionBlockers,
    passes,
    failures,
    externalActionsOccurred: false
  };
  writeJson(path.join(EVIDENCE_DIR, 'business-os-commercial-license-verification.json'), evidence);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log(JSON.stringify(evidence, null, 2));
  process.exit(failures.length ? 1 : 0);
}

try {
  main();
} catch (error) {
  const failure = {
    status: 'HOLD',
    generatedAt: new Date().toISOString(),
    release: 'commercial-license-control-plane-2026-07-12',
    error: error.message,
    stack: error.stack,
    externalActionsOccurred: false
  };
  writeJson(path.join(EVIDENCE_DIR, 'business-os-commercial-license-verification.json'), failure);
  writeJson(path.join(EVIDENCE_DIR, 'business-os-commercial-license-synthetic.json'), { status: 'HOLD', error: error.message, externalActionsOccurred: false });
  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
}
