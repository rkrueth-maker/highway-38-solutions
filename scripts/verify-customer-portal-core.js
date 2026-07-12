#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  validateConfig,
  issueSession,
  verifySession,
  authorizeOwnRecord,
  projectCustomerRecord,
  createUploadIntent,
  approveQuote,
  validateHostedPayment,
  createDownloadGrant,
  verifyDownloadGrant,
  createRevisionRequest,
  createMessageDraft,
  proofEntry,
  errorEntry,
  sha256
} = require('../core-engine/customer-portal/lib/customer-portal-core');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'core-engine', 'customer-portal', 'config', 'customer-portal.default.json');
const EVIDENCE_DIR = path.join(ROOT, 'launch-control', 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
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

const secret = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef', 'utf8');
const now = Date.UTC(2026, 6, 12, 12, 0, 0);
const permissions = config.permissions.customer;

check('configuration validates', validateConfig(config).length === 0, validateConfig(config).join(' '));
check('portal defaults inactive', config.portal.status === 'NOT_ACTIVATED');
check('external actions default disabled', Object.values(config.externalActions).every(value => value === false));
check('upload public access disabled', config.uploads.publicAccess === false);
check('quarantine and scan required', config.uploads.quarantineRequired === true && config.uploads.virusScanRequired === true);
check('raw card data forbidden', config.payments.rawCardDataAllowed === false && config.payments.hostedProviderOnly === true);
check('bulk and automatic retry disabled', config.security.bulkExecution === false && config.security.automaticRetry === false);

const token = issueSession({
  secret,
  config,
  tenantKey: 'tenant-one',
  customerId: 'CUST-001',
  permissions,
  now,
  sessionId: 'SESSION-001'
});
const claims = verifySession({ token, secret, config, now: now + 60_000 });
check('valid signed session verifies', claims.tenantKey === 'tenant-one' && claims.customerId === 'CUST-001');
check('session permissions are bounded', claims.permissions.length === permissions.length);

const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
expectThrow('tampered session rejected', () => verifySession({ token: tampered, secret, config, now }), 'signature');
expectThrow('expired session rejected', () => verifySession({ token, secret, config, now: now + (config.security.sessionTtlSeconds + config.security.clockSkewSeconds + 60) * 1000 }), 'expired');
expectThrow('revoked session rejected', () => verifySession({ token, secret, config, now, revokedSessionIds: new Set(['SESSION-001']) }), 'revoked');
expectThrow('short secret rejected', () => issueSession({ secret: 'too-short', config, tenantKey: 'tenant-one', customerId: 'CUST-001', permissions, now }), 'at least');
expectThrow('unapproved session permission rejected', () => issueSession({ secret, config, tenantKey: 'tenant-one', customerId: 'CUST-001', permissions: ['admin.all'], now }), 'unapproved');

const ownJob = {
  id: 'JOB-001',
  tenantKey: 'tenant-one',
  customerId: 'CUST-001',
  status: 'ACTIVE',
  title: 'Synthetic customer job',
  internalNotes: 'Never expose this note',
  internalCosts: 125,
  ownerApprovals: [{ action: 'send quote' }],
  nested: { staffOnly: true, publicValue: 'Visible' }
};
const otherCustomerJob = { ...ownJob, id: 'JOB-002', customerId: 'CUST-002' };
const otherTenantJob = { ...ownJob, id: 'JOB-003', tenantKey: 'tenant-two' };

check('own record authorization passes', authorizeOwnRecord(claims, ownJob, 'jobs.own.read') === true);
expectThrow('cross-customer access denied', () => authorizeOwnRecord(claims, otherCustomerJob, 'jobs.own.read'), 'Cross-customer');
expectThrow('cross-tenant access denied', () => authorizeOwnRecord(claims, otherTenantJob, 'jobs.own.read'), 'Cross-tenant');
expectThrow('missing permission denied', () => authorizeOwnRecord({ ...claims, permissions: [] }, ownJob, 'jobs.own.read'), 'Permission denied');

const projected = projectCustomerRecord(claims, ownJob, 'jobs.own.read', config.privateFields);
check('internal notes removed', !Object.prototype.hasOwnProperty.call(projected, 'internalNotes'));
check('internal costs removed', !Object.prototype.hasOwnProperty.call(projected, 'internalCosts'));
check('owner approvals removed', !Object.prototype.hasOwnProperty.call(projected, 'ownerApprovals'));
check('nested staff-only field removed', projected.nested.publicValue === 'Visible' && !Object.prototype.hasOwnProperty.call(projected.nested, 'staffOnly'));

const upload = createUploadIntent({
  claims,
  config,
  fileName: 'garage layout.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  jobId: 'JOB-001',
  now
});
check('upload starts quarantined', upload.status === 'QUARANTINED_PENDING_SCAN');
check('upload path is tenant and customer isolated', upload.storageKey.startsWith('tenants/tenant-one/customers/CUST-001/quarantine/'));
check('upload does not create external action', upload.externalActionOccurred === false && upload.publicAccess === false);
expectThrow('oversize upload rejected', () => createUploadIntent({ claims, config, fileName: 'large.pdf', mimeType: 'application/pdf', sizeBytes: config.uploads.maxBytes + 1, jobId: 'JOB-001', now }), 'size');
expectThrow('disallowed MIME rejected', () => createUploadIntent({ claims, config, fileName: 'script.exe', mimeType: 'application/octet-stream', sizeBytes: 100, jobId: 'JOB-001', now }), 'MIME');
expectThrow('extension mismatch rejected', () => createUploadIntent({ claims, config, fileName: 'document.exe', mimeType: 'application/pdf', sizeBytes: 100, jobId: 'JOB-001', now }), 'extension');
expectThrow('path traversal filename rejected', () => createUploadIntent({ claims, config, fileName: '../secret.pdf', mimeType: 'application/pdf', sizeBytes: 100, jobId: 'JOB-001', now }), 'Filename');

const quote = {
  id: 'QUOTE-001',
  tenantKey: 'tenant-one',
  customerId: 'CUST-001',
  status: 'PRESENTED',
  version: 3,
  amount: 499
};
const duplicateLocks = new Set();
const approvedQuote = approveQuote({ claims, quote, approvalTokenId: 'TOKEN-001', expectedVersion: 3, now, duplicateLocks });
check('quote approval becomes owner-processing state', approvedQuote.status === 'CUSTOMER_APPROVED_PENDING_OWNER_PROCESSING');
check('quote approval does not send or charge', approvedQuote.externalActionOccurred === false);
expectThrow('duplicate quote approval blocked', () => approveQuote({ claims, quote, approvalTokenId: 'TOKEN-001', expectedVersion: 3, now, duplicateLocks }), 'Duplicate');
expectThrow('stale quote version blocked', () => approveQuote({ claims, quote, approvalTokenId: 'TOKEN-002', expectedVersion: 2, now, duplicateLocks }), 'version changed');
expectThrow('other customer quote blocked', () => approveQuote({ claims, quote: { ...quote, customerId: 'CUST-002' }, approvalTokenId: 'TOKEN-003', expectedVersion: 3, now, duplicateLocks }), 'Cross-customer');

const paymentConfig = JSON.parse(JSON.stringify(config));
paymentConfig.payments.approvedProviders = ['sandbox-hosted-provider'];
const invoice = {
  id: 'INV-001',
  tenantKey: 'tenant-one',
  customerId: 'CUST-001',
  balanceDue: 250
};
const hostedPayment = validateHostedPayment({ claims, invoice, config: paymentConfig, hostedUrl: 'https://pay.example.invalid/session/abc123', provider: 'sandbox-hosted-provider' });
check('hosted payment metadata validates', hostedPayment.provider === 'sandbox-hosted-provider' && hostedPayment.rawCardDataStored === false);
check('payment validation does not process payment', hostedPayment.externalActionOccurred === false);
expectThrow('unapproved payment provider blocked', () => validateHostedPayment({ claims, invoice, config: paymentConfig, hostedUrl: 'https://pay.example.invalid/session/abc123', provider: 'unknown' }), 'not approved');
expectThrow('non-HTTPS payment URL blocked', () => validateHostedPayment({ claims, invoice, config: paymentConfig, hostedUrl: 'http://pay.example.invalid/session/abc123', provider: 'sandbox-hosted-provider' }), 'scheme');
expectThrow('payment URL credentials blocked', () => validateHostedPayment({ claims, invoice, config: paymentConfig, hostedUrl: 'https://user:pass@pay.example.invalid/session/abc123', provider: 'sandbox-hosted-provider' }), 'credentials');

const deliverable = {
  id: 'DEL-001',
  tenantKey: 'tenant-one',
  customerId: 'CUST-001',
  storageKey: 'tenants/tenant-one/customers/CUST-001/deliverables/DEL-001/final.pdf'
};
const grantToken = createDownloadGrant({ claims, record: deliverable, secret, now, expiresInSeconds: 120 });
const grant = verifyDownloadGrant({ token: grantToken, secret, now: now + 30_000 });
check('download grant is customer scoped', grant.customerId === 'CUST-001' && grant.tenantKey === 'tenant-one');
expectThrow('expired download grant rejected', () => verifyDownloadGrant({ token: grantToken, secret, now: now + 300_000 }), 'expired');
expectThrow('outside-namespace download rejected', () => createDownloadGrant({ claims, record: { ...deliverable, storageKey: 'tenants/tenant-one/customers/CUST-002/private.pdf' }, secret, now }), 'outside');

const revision = createRevisionRequest({ claims, deliverable, message: 'Please move the workbench two feet left.', now });
check('revision routes to owner review', revision.status === 'NEEDS_OWNER_REVIEW' && revision.externalActionOccurred === false);
const message = createMessageDraft({ claims, job: ownJob, message: 'I uploaded the requested measurements.', now });
check('customer message records without external send', message.status === 'RECORDED_PENDING_OWNER_REVIEW' && message.externalActionOccurred === false);

const proof = proofEntry('QUOTE_APPROVAL_RECORDED', 'PASS', { tenantKey: claims.tenantKey, customerId: claims.customerId, recordId: quote.id, sessionId: claims.sid, externalActionOccurred: false }, now);
check('proof entry records no external action', proof.externalActionOccurred === false && proof.digest.length === 64);
const error = errorEntry('PAYMENT_LINK_VALIDATE', new Error('Synthetic provider failure'), { tenantKey: claims.tenantKey, customerId: claims.customerId, recordId: invoice.id }, now);
check('error entry disables retry', error.automaticRetry === false && error.externalActionOccurred === false);

const forbiddenSourcePatterns = [
  /sk_live_[A-Za-z0-9]+/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:\d[ -]*?){13,19}\b/
];
const coreSource = fs.readFileSync(path.join(ROOT, 'core-engine', 'customer-portal', 'lib', 'customer-portal-core.js'), 'utf8');
check('core contains no live secrets or card data', forbiddenSourcePatterns.every(pattern => !pattern.test(coreSource)));

const sampleEvidence = {
  status: 'SECURITY_TESTED_NOT_ACTIVATED',
  generatedAt: new Date(now).toISOString(),
  portalVersion: config.portal.version,
  tenantKey: claims.tenantKey,
  customerId: claims.customerId,
  sessionDigest: sha256(token),
  records: {
    projectedJob: projected,
    uploadIntent: upload,
    approvedQuote,
    hostedPayment: { ...hostedPayment, hostedUrl: 'REDACTED_TEST_URL' },
    downloadGrant: { ...grant, storageKey: 'REDACTED_PRIVATE_PATH' },
    revision,
    message,
    proof,
    error
  },
  activationBlockers: [
    'Approved identity provider and production credentials',
    'Private object-storage provider and credentials',
    'Malware scanning provider and quarantine workflow',
    'Approved hosted payment provider and credentials',
    'Authorized server runtime and domain/session cookie configuration',
    'Cross-customer and cross-tenant integration test in the selected production stack',
    'Owner approval to activate the customer portal feature flag'
  ],
  externalActionsOccurred: false
};
fs.writeFileSync(path.join(EVIDENCE_DIR, 'customer-portal-security-sample.json'), JSON.stringify(sampleEvidence, null, 2) + '\n');

const evidence = {
  status: failures.length ? 'HOLD' : 'PASS',
  generatedAt: new Date().toISOString(),
  portalVersion: config.portal.version,
  passed: passes.length,
  failed: failures.length,
  securityState: 'TESTED_NOT_ACTIVATED',
  externalActionsOccurred: false,
  controls: {
    signedSessions: true,
    tenantIsolation: true,
    customerIsolation: true,
    privateFieldRedaction: true,
    quarantinedUploads: true,
    duplicateQuoteApprovalLock: true,
    hostedPaymentOnly: true,
    rawCardStorage: false,
    scopedDownloads: true,
    automaticRetry: false,
    bulkExecution: false
  },
  passes,
  failures
};
fs.writeFileSync(path.join(EVIDENCE_DIR, 'customer-portal-core-verification.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
process.exit(failures.length ? 1 : 0);
