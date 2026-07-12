#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const APPROVAL_PATH = path.join(ROOT, 'launch-control', 'activation', 'customer-portal-owner-approval-2026-07-12.json');
const BLOCKERS_PATH = path.join(ROOT, 'launch-control', 'activation', 'customer-portal-activation-blockers-2026-07-12.json');
const CONFIG_PATH = path.join(ROOT, 'core-engine', 'customer-portal', 'config', 'customer-portal.default.json');
const EVIDENCE_PATH = path.join(ROOT, 'launch-control', 'evidence', 'customer-portal-activation-gate.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validHttpsUrl(value) {
  if (!present(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch (_) {
    return false;
  }
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function masked(value) {
  if (!present(value)) return null;
  return `${String(value).slice(0, 2)}…${String(value).slice(-2)}`;
}

const approval = readJson(APPROVAL_PATH);
const blockers = readJson(BLOCKERS_PATH);
const config = readJson(CONFIG_PATH);

const checks = [];
function check(id, ok, detail) {
  checks.push({ id, status: ok ? 'PASS' : 'HOLD', detail });
}

check('OWNER_APPROVAL', approval.approvedBy === 'Rick' && approval.currentState === 'OWNER_APPROVED_PROVIDER_CONNECTIONS_PENDING', 'Rick activation approval is recorded.');
check('DEFAULT_FAIL_CLOSED', config.portal.status === 'NOT_ACTIVATED', `Portal default status is ${config.portal.status}.`);
check('EXTERNAL_ACTIONS_LOCKED', Object.values(config.externalActions || {}).every(value => value === false), 'All external actions remain disabled until provider verification passes.');

const env = process.env;
const idpIssuer = env.H38_CUSTOMER_PORTAL_IDP_ISSUER;
const idpJwks = env.H38_CUSTOMER_PORTAL_IDP_JWKS_URL;
const runtimeBase = env.H38_CUSTOMER_PORTAL_SERVER_BASE_URL;
const runtimeHealth = env.H38_CUSTOMER_PORTAL_HEALTH_URL;
const storageProvider = env.H38_CUSTOMER_PORTAL_STORAGE_PROVIDER;
const storageNamespace = env.H38_CUSTOMER_PORTAL_STORAGE_PRIVATE_NAMESPACE;
const malwareScanner = env.H38_CUSTOMER_PORTAL_MALWARE_SCANNER;
const paymentProvider = env.H38_CUSTOMER_PORTAL_PAYMENT_PROVIDER;
const paymentHost = env.H38_CUSTOMER_PORTAL_PAYMENT_HOST;
const rollbackRef = env.H38_CUSTOMER_PORTAL_ROLLBACK_REF;
const sessionSecret = env.H38_CUSTOMER_PORTAL_SESSION_SECRET;
const deploymentId = env.H38_CUSTOMER_PORTAL_RUNTIME_DEPLOYMENT_ID;

check('IDP_ISSUER', validHttpsUrl(idpIssuer), validHttpsUrl(idpIssuer) ? `Configured: ${new URL(idpIssuer).origin}` : 'Missing or invalid HTTPS identity-provider issuer.');
check('IDP_JWKS', validHttpsUrl(idpJwks), validHttpsUrl(idpJwks) ? `Configured: ${new URL(idpJwks).origin}` : 'Missing or invalid HTTPS JWKS endpoint.');
check('SERVER_RUNTIME', validHttpsUrl(runtimeBase), validHttpsUrl(runtimeBase) ? `Configured: ${new URL(runtimeBase).origin}` : 'Missing or invalid HTTPS server runtime URL.');
check('HEALTH_ENDPOINT', validHttpsUrl(runtimeHealth), validHttpsUrl(runtimeHealth) ? `Configured: ${new URL(runtimeHealth).origin}` : 'Missing or invalid HTTPS runtime health endpoint.');
check('PRIVATE_STORAGE', present(storageProvider) && present(storageNamespace), present(storageProvider) && present(storageNamespace) ? `Provider ${masked(storageProvider)} with private namespace configured.` : 'Private storage provider and namespace are required.');
check('MALWARE_SCANNER', present(malwareScanner), present(malwareScanner) ? `Scanner ${masked(malwareScanner)} configured.` : 'Malware scanner is required.');
check('HOSTED_PAYMENT_PROVIDER', present(paymentProvider) && validHttpsUrl(paymentHost), present(paymentProvider) && validHttpsUrl(paymentHost) ? `Provider ${masked(paymentProvider)} with HTTPS host configured.` : 'Hosted payment provider and HTTPS host are required.');
check('SESSION_SECRET', Buffer.byteLength(String(sessionSecret || ''), 'utf8') >= 32, present(sessionSecret) ? `Secret supplied; SHA-256 prefix ${hash(sessionSecret).slice(0, 10)}.` : 'Session secret is missing.');
check('ROLLBACK_REF', present(rollbackRef), present(rollbackRef) ? `Rollback reference ${masked(rollbackRef)} configured.` : 'Runtime-specific rollback reference is required.');
check('RUNTIME_DEPLOYMENT_ID', present(deploymentId), present(deploymentId) ? `Deployment ${masked(deploymentId)} configured.` : 'Runtime deployment identifier is required.');

const providerChecksPassed = checks.filter(item => !['OWNER_APPROVAL', 'DEFAULT_FAIL_CLOSED', 'EXTERNAL_ACTIONS_LOCKED'].includes(item.id)).every(item => item.status === 'PASS');
const coreChecksPassed = checks.filter(item => ['OWNER_APPROVAL', 'DEFAULT_FAIL_CLOSED', 'EXTERNAL_ACTIONS_LOCKED'].includes(item.id)).every(item => item.status === 'PASS');

const evidence = {
  activationId: approval.approvalId,
  generatedAt: new Date().toISOString(),
  status: coreChecksPassed && providerChecksPassed ? 'READY_FOR_RUNTIME_VERIFICATION' : 'HOLD',
  ownerApprovalRecorded: approval.approvedBy === 'Rick',
  activationClaimAllowed: false,
  externalActionsOccurred: false,
  providerCredentialsPresent: providerChecksPassed,
  liveRuntimeVerified: false,
  liveCustomerIsolationVerified: false,
  rollbackVerified: false,
  checks,
  unresolvedBlockers: checks.filter(item => item.status !== 'PASS').map(item => item.id),
  repositoryBlockerRegister: blockers.blockers,
  nextAction: providerChecksPassed
    ? 'Run provider-specific connectivity, cross-tenant, cross-customer, upload, payment, download, mobile, and rollback verification against the selected runtime.'
    : 'Supply the missing production provider/runtime values through GitHub Actions secrets or the approved deployment environment. Do not place secrets in the repository.'
};

fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(evidence, null, 2));

if (!coreChecksPassed) process.exit(1);
process.exit(0);
