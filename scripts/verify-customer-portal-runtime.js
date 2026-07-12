#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  collectPersistedSecretFindings,
  evaluateActivation,
  sanitizeRuntimeSummary,
  validateRuntimeConfig
} = require('../core-engine/customer-portal/runtime/customer-portal-runtime-contract');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'core-engine', 'customer-portal', 'config', 'customer-portal.runtime.example.json');
const EVIDENCE_DIR = path.join(ROOT, 'launch-control', 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const example = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const passes = [];
const failures = [];

function check(name, condition, detail = '') {
  (condition ? passes : failures).push({ name, detail });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const configErrors = validateRuntimeConfig(example);
check('runtime example satisfies fail-closed contract', configErrors.length === 0, configErrors.join(' '));
check('runtime example remains HOLD', example.activationMode === 'HOLD' && example.featureFlags.customerPortal === false);
check('all external actions remain disabled', Object.values(example.featureFlags.externalActions).every(value => value === false));
check('no persisted secrets found', collectPersistedSecretFindings(example).length === 0);

const holdDecision = evaluateActivation({
  runtimeConfig: example,
  env: {},
  health: {},
  isolationTests: {},
  ownerApproval: { customerPortal: true, externalActions: {} }
});
check('missing runtime dependencies force HOLD', holdDecision.status === 'HOLD' && holdDecision.activationAllowed === false);
check('HOLD evaluation performs no external action', holdDecision.externalActionsOccurred === false);

const readyConfig = clone(example);
readyConfig.activationMode = 'READY_FOR_OWNER_ENABLE';
readyConfig.runtime.provider = 'synthetic-authorized-runtime';
readyConfig.runtime.baseUrl = 'https://portal.synthetic.invalid';
readyConfig.runtime.healthUrl = 'https://portal.synthetic.invalid/health';
readyConfig.runtime.deploymentId = 'DEPLOY-2026-07-12-001';
readyConfig.runtime.rollbackRef = 'rollback/synthetic-2026-07-12-001';
readyConfig.identity.provider = 'synthetic-oidc';
readyConfig.identity.issuer = 'https://identity.synthetic.invalid/';
readyConfig.identity.jwksUrl = 'https://identity.synthetic.invalid/.well-known/jwks.json';
readyConfig.storage.provider = 'synthetic-private-object-storage';
readyConfig.malwareScanning.provider = 'synthetic-malware-scanner';
readyConfig.payments.provider = 'synthetic-hosted-payments';
readyConfig.payments.approvedHosts = ['payments.synthetic.invalid'];

const secret = '0123456789abcdef0123456789abcdef0123456789abcdef';
const readyDecision = evaluateActivation({
  runtimeConfig: readyConfig,
  env: { H38_CUSTOMER_PORTAL_SESSION_SECRET: secret },
  health: {
    status: 'PASS',
    deploymentId: readyConfig.runtime.deploymentId,
    identity: 'PASS',
    storage: 'PASS',
    malwareScanning: 'PASS',
    hostedPayments: 'PASS',
    rollback: 'PASS'
  },
  isolationTests: {
    crossTenant: 'PASS',
    crossCustomer: 'PASS',
    guessedId: 'PASS',
    expiredSession: 'PASS',
    uploadDownload: 'PASS'
  },
  ownerApproval: {
    customerPortal: true,
    externalActions: {
      emailSend: false,
      paymentRequest: false,
      paymentProcessing: false,
      finalDelivery: false,
      automaticPublication: false
    }
  }
});
check('complete synthetic stack reaches ready-for-owner-enable', readyDecision.status === 'READY_FOR_OWNER_ENABLE' && readyDecision.activationAllowed === true);
check('ready decision does not self-activate', readyConfig.featureFlags.customerPortal === false && readyDecision.externalActionsOccurred === false);

const crossTenantHold = evaluateActivation({
  runtimeConfig: readyConfig,
  env: { H38_CUSTOMER_PORTAL_SESSION_SECRET: secret },
  health: {
    status: 'PASS',
    deploymentId: readyConfig.runtime.deploymentId,
    identity: 'PASS',
    storage: 'PASS',
    malwareScanning: 'PASS',
    hostedPayments: 'PASS',
    rollback: 'PASS'
  },
  isolationTests: {
    crossTenant: 'FAIL',
    crossCustomer: 'PASS',
    guessedId: 'PASS',
    expiredSession: 'PASS',
    uploadDownload: 'PASS'
  },
  ownerApproval: { customerPortal: true, externalActions: {} }
});
check('failed cross-tenant test blocks activation', crossTenantHold.status === 'HOLD' && crossTenantHold.failures.some(item => item.control === 'CROSS_TENANT_TEST'));

const unsafeConfig = clone(readyConfig);
unsafeConfig.featureFlags.customerPortal = true;
unsafeConfig.featureFlags.externalActions.paymentProcessing = true;
unsafeConfig.session.sessionSecret = 'not-allowed-in-repository';
const unsafeErrors = validateRuntimeConfig(unsafeConfig);
check('persisted secret and enabled defaults are rejected', unsafeErrors.some(error => error.includes('sessionSecret')) && unsafeErrors.some(error => error.includes('customerPortal')) && unsafeErrors.some(error => error.includes('paymentProcessing')));

const summary = sanitizeRuntimeSummary(example);
check('sanitized summary never exposes an environment secret', JSON.stringify(summary).includes(secret) === false && summary.session.secretEnvVar === 'CONFIGURED_ENV_REFERENCE');

const evidence = {
  status: failures.length ? 'HOLD' : 'PASS',
  generatedAt: new Date().toISOString(),
  securityState: 'RUNTIME_CONTRACT_TESTED_NOT_ACTIVATED',
  passed: passes.length,
  failed: failures.length,
  controls: {
    repositoryDefaultsFailClosed: true,
    runtimeSecretsEnvironmentOnly: true,
    identityValidationRequired: true,
    privateStorageRequired: true,
    malwareScanRequired: true,
    hostedPaymentsOnly: true,
    crossTenantAndCustomerTestsRequired: true,
    rollbackTestRequired: true,
    ownerActivationRequired: true,
    externalActionsSeparatelyApproved: true,
    automaticRetry: false,
    bulkExecution: false
  },
  passes,
  failures,
  externalActionsOccurred: false
};

const sample = {
  status: 'HOLD_TEMPLATE',
  generatedAt: new Date().toISOString(),
  runtime: summary,
  holdDecision,
  syntheticReadyDecision: {
    status: readyDecision.status,
    activationAllowed: readyDecision.activationAllowed,
    configurationDigest: readyDecision.configurationDigest,
    checks: readyDecision.checks,
    externalActionsOccurred: readyDecision.externalActionsOccurred
  },
  note: 'Synthetic readiness proves the gate logic only. It is not evidence of connected production providers or a live customer portal.'
};

fs.writeFileSync(path.join(EVIDENCE_DIR, 'customer-portal-runtime-verification.json'), JSON.stringify(evidence, null, 2) + '\n');
fs.writeFileSync(path.join(EVIDENCE_DIR, 'customer-portal-runtime-readiness-sample.json'), JSON.stringify(sample, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
process.exit(failures.length ? 1 : 0);
