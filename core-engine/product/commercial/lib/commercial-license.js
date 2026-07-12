'use strict';

const crypto = require('crypto');

const SCHEMA_VERSION = 1;
const ALGORITHM = 'Ed25519';
const OWNER_REVIEW = 'OWNER_REVIEW_REQUIRED';
const EXTERNAL_ACTIONS_ENABLED = false;
const ALLOWED_STATUSES = new Set(['ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED', 'DRAFT']);
const ALLOWED_TIERS = new Set(['Core', 'Operations', 'Growth', 'Control']);
const ALLOWED_CHANNELS = new Set(['stable', 'candidate', 'development']);
const SENSITIVE_KEY_PATTERN = /(card|pan|cvv|cvc|password|passphrase|secret|private.?key|api.?key|access.?token|refresh.?token)/i;
const CARD_CANDIDATE_PATTERN = /(?:^|\D)(\d{13,19})(?:\D|$)/g;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : stableStringify(value));
  return crypto.createHash('sha256').update(body).digest('hex');
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, 'base64');
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean))).sort();
}

function assertNoSensitiveData(value, path = 'record') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveData(item, `${path}[${index}]`));
    return true;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) throw new Error(`Sensitive field is prohibited at ${path}.${key}.`);
      assertNoSensitiveData(child, `${path}.${key}`);
    }
    return true;
  }
  if (typeof value === 'string') {
    CARD_CANDIDATE_PATTERN.lastIndex = 0;
    if (CARD_CANDIDATE_PATTERN.test(value.replace(/[ -]/g, ''))) throw new Error(`Raw payment-card candidate is prohibited at ${path}.`);
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value)) throw new Error(`Private key material is prohibited at ${path}.`);
  }
  return true;
}

function validateLicensePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ['License payload must be an object.'];
  if (payload.schemaVersion !== SCHEMA_VERSION) errors.push(`License schemaVersion must be ${SCHEMA_VERSION}.`);
  for (const field of ['licenseId', 'customerId', 'issuedAt', 'validFrom', 'tier', 'status']) {
    if (!payload[field]) errors.push(`License ${field} is required.`);
  }
  if (!ALLOWED_STATUSES.has(payload.status)) errors.push(`License status ${payload.status} is not supported.`);
  if (!ALLOWED_TIERS.has(payload.tier)) errors.push(`License tier ${payload.tier} is not supported.`);
  if (!Array.isArray(payload.tenantKeys) || !payload.tenantKeys.length) errors.push('At least one tenant key is required.');
  if (!Array.isArray(payload.releaseChannels) || !payload.releaseChannels.length) errors.push('At least one release channel is required.');
  if ((payload.releaseChannels || []).some(channel => !ALLOWED_CHANNELS.has(channel))) errors.push('License contains an unsupported release channel.');
  if (!Number.isInteger(payload.tenantLimit) || payload.tenantLimit < 1) errors.push('tenantLimit must be a positive integer.');
  if (!Number.isInteger(payload.seatLimit) || payload.seatLimit < 1) errors.push('seatLimit must be a positive integer.');
  if ((payload.tenantKeys || []).length > Number(payload.tenantLimit || 0)) errors.push('Assigned tenants exceed tenantLimit.');
  if (!Array.isArray(payload.modules)) errors.push('modules must be an array.');
  if (!Array.isArray(payload.features)) errors.push('features must be an array.');
  if (!payload.supportPlan) errors.push('supportPlan is required.');
  try { assertNoSensitiveData(payload, 'licensePayload'); } catch (error) { errors.push(error.message); }
  return errors;
}

function createLicensePayload(input = {}) {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    licenseId: String(input.licenseId || '').trim(),
    customerId: String(input.customerId || '').trim(),
    issuedAt: String(input.issuedAt || new Date().toISOString()),
    validFrom: String(input.validFrom || input.issuedAt || new Date().toISOString()),
    validUntil: input.validUntil ? String(input.validUntil) : null,
    status: String(input.status || 'ACTIVE'),
    tier: String(input.tier || 'Core'),
    tenantLimit: Number(input.tenantLimit || 1),
    seatLimit: Number(input.seatLimit || 1),
    tenantKeys: normalizeStringArray(input.tenantKeys),
    releaseChannels: normalizeStringArray(input.releaseChannels || ['stable']),
    modules: normalizeStringArray(input.modules),
    features: normalizeStringArray(input.features),
    addOns: normalizeStringArray(input.addOns),
    supportPlan: String(input.supportPlan || 'Standard'),
    commercialTermsVersion: String(input.commercialTermsVersion || 'draft-1'),
    metadata: clone(input.metadata || {})
  };
  const errors = validateLicensePayload(payload);
  if (errors.length) throw new Error(errors.join(' '));
  return payload;
}

function signLicense(payload, privateKeyPem, keyId) {
  const errors = validateLicensePayload(payload);
  if (errors.length) throw new Error(errors.join(' '));
  if (!keyId || !String(keyId).trim()) throw new Error('keyId is required.');
  if (!privateKeyPem || !String(privateKeyPem).includes('PRIVATE KEY')) throw new Error('A private signing key is required.');
  const canonical = stableStringify(payload);
  const signature = crypto.sign(null, Buffer.from(canonical), privateKeyPem);
  return {
    schemaVersion: SCHEMA_VERSION,
    algorithm: ALGORITHM,
    keyId: String(keyId),
    payload: clone(payload),
    payloadSha256: sha256(canonical),
    signature: base64url(signature),
    signedAt: new Date().toISOString(),
    externalActionsEnabled: false
  };
}

function normalizeRevocations(revocations) {
  if (!revocations) return [];
  if (Array.isArray(revocations)) return revocations;
  if (Array.isArray(revocations.items)) return revocations.items;
  return [];
}

function verifySignedLicense(envelope, keyRing, revocations = [], options = {}) {
  const now = new Date(options.now || new Date().toISOString());
  const errors = [];
  if (!envelope || envelope.algorithm !== ALGORITHM) errors.push(`Signed license algorithm must be ${ALGORITHM}.`);
  if (!envelope?.keyId) errors.push('Signed license keyId is required.');
  const publicKeyPem = keyRing?.keys?.find(key => key.keyId === envelope?.keyId && key.status !== 'RETIRED')?.publicKeyPem;
  if (!publicKeyPem) errors.push(`No active public key found for keyId ${envelope?.keyId || 'missing'}.`);
  const payloadErrors = validateLicensePayload(envelope?.payload);
  errors.push(...payloadErrors);
  const canonical = stableStringify(envelope?.payload || null);
  if (envelope?.payloadSha256 !== sha256(canonical)) errors.push('Signed license payload hash does not match.');
  if (publicKeyPem && envelope?.signature) {
    const signatureOk = crypto.verify(null, Buffer.from(canonical), publicKeyPem, fromBase64url(envelope.signature));
    if (!signatureOk) errors.push('Signed license signature is invalid.');
  }
  const payload = envelope?.payload || {};
  if (payload.status !== 'ACTIVE') errors.push(`License status is ${payload.status || 'missing'}, not ACTIVE.`);
  if (payload.validFrom && now.getTime() < new Date(payload.validFrom).getTime()) errors.push('License is not active yet.');
  if (payload.validUntil && now.getTime() > new Date(payload.validUntil).getTime()) errors.push('License has expired.');
  const revocation = normalizeRevocations(revocations).find(item => item.licenseId === payload.licenseId && item.status === 'ACTIVE');
  if (revocation) errors.push(`License was revoked: ${revocation.reason || 'no reason recorded'}.`);
  if (errors.length) return { status: 'HOLD', valid: false, errors, payload: clone(payload), externalActionsEnabled: false };
  return {
    status: 'PASS',
    valid: true,
    errors: [],
    payload: clone(payload),
    entitlements: createEntitlementSnapshot(payload),
    externalActionsEnabled: false
  };
}

function createEntitlementSnapshot(payload) {
  return {
    licenseId: payload.licenseId,
    customerId: payload.customerId,
    tier: payload.tier,
    tenantLimit: payload.tenantLimit,
    seatLimit: payload.seatLimit,
    tenantKeys: normalizeStringArray(payload.tenantKeys),
    releaseChannels: normalizeStringArray(payload.releaseChannels),
    modules: normalizeStringArray(payload.modules),
    features: normalizeStringArray(payload.features),
    addOns: normalizeStringArray(payload.addOns),
    supportPlan: payload.supportPlan,
    status: payload.status,
    validUntil: payload.validUntil || null
  };
}

function authorizeEntitlement(payload, request = {}) {
  const denials = [];
  if (!payload || payload.status !== 'ACTIVE') denials.push('License is not active.');
  if (request.tenantKey && !normalizeStringArray(payload?.tenantKeys).includes(String(request.tenantKey))) denials.push('Tenant is not licensed.');
  if (request.releaseChannel && !normalizeStringArray(payload?.releaseChannels).includes(String(request.releaseChannel))) denials.push('Release channel is not licensed.');
  if (request.module && !normalizeStringArray(payload?.modules).includes(String(request.module))) denials.push('Module is not licensed.');
  if (request.feature && !normalizeStringArray(payload?.features).includes(String(request.feature))) denials.push('Feature is not licensed.');
  if (request.addOn && !normalizeStringArray(payload?.addOns).includes(String(request.addOn))) denials.push('Add-on is not licensed.');
  if (request.seatsUsed != null && Number(request.seatsUsed) > Number(payload?.seatLimit || 0)) denials.push('Seat limit exceeded.');
  return {
    status: denials.length ? 'DENIED' : 'AUTHORIZED',
    authorized: denials.length === 0,
    denials,
    selectedRecordOnly: true,
    externalActionsEnabled: false
  };
}

function createRevocationDraft(input = {}) {
  if (!input.licenseId) throw new Error('licenseId is required for revocation.');
  if (!input.reason) throw new Error('reason is required for revocation.');
  return {
    revocationId: input.revocationId || crypto.randomUUID(),
    licenseId: String(input.licenseId),
    reason: String(input.reason),
    requestedAt: input.requestedAt || new Date().toISOString(),
    requestedBy: String(input.requestedBy || 'owner'),
    status: OWNER_REVIEW,
    effectiveAt: null,
    ownerApproved: false,
    externalActionsEnabled: false
  };
}

function activateRevocation(draft, approval = {}) {
  if (!draft || draft.status !== OWNER_REVIEW) throw new Error('Revocation draft must require owner review.');
  if (approval.ownerApproved !== true || !approval.ownerId) throw new Error('Explicit owner approval is required.');
  return {
    ...clone(draft),
    status: 'ACTIVE',
    effectiveAt: approval.effectiveAt || new Date().toISOString(),
    approvedAt: approval.approvedAt || new Date().toISOString(),
    approvedBy: String(approval.ownerId),
    ownerApproved: true,
    externalActionsEnabled: false
  };
}

function createBillingState(input = {}) {
  const state = {
    schemaVersion: SCHEMA_VERSION,
    billingAccountId: String(input.billingAccountId || crypto.randomUUID()),
    customerId: String(input.customerId || ''),
    provider: input.provider || null,
    providerCustomerRef: input.providerCustomerRef || null,
    credentialState: 'NOT_CONFIGURED',
    executionState: 'LOCKED',
    subscriptions: [],
    invoices: [],
    credits: [],
    refunds: [],
    processedProviderEvents: [],
    uncertainEvents: [],
    proofLog: [],
    errorLog: [],
    automaticRetry: false,
    selectedRecordOnly: true,
    externalActionsEnabled: false
  };
  assertNoSensitiveData(state, 'billingState');
  return state;
}

function prepareSubscription(state, input = {}) {
  if (!state || state.selectedRecordOnly !== true) throw new Error('Selected-record billing state is required.');
  if (!input.subscriptionId || !input.licenseId || !input.planId) throw new Error('subscriptionId, licenseId, and planId are required.');
  if (state.subscriptions.some(item => item.subscriptionId === input.subscriptionId)) throw new Error('Duplicate subscriptionId.');
  const record = {
    subscriptionId: String(input.subscriptionId),
    licenseId: String(input.licenseId),
    planId: String(input.planId),
    status: OWNER_REVIEW,
    cadence: String(input.cadence || 'monthly'),
    amount: Number(input.amount || 0),
    currency: String(input.currency || 'USD'),
    startsAt: input.startsAt || null,
    renewsAt: input.renewsAt || null,
    cancelAtPeriodEnd: false,
    providerSubscriptionRef: null,
    ownerApproved: false,
    externalActionsEnabled: false
  };
  assertNoSensitiveData(record, 'subscription');
  state.subscriptions.push(record);
  state.proofLog.push(createProofEntry('SUBSCRIPTION_PREPARED', record.subscriptionId, 'PASS', { planId: record.planId }));
  return clone(record);
}

function applyProviderBillingEvent(state, event = {}) {
  if (!state || state.selectedRecordOnly !== true) throw new Error('Selected-record billing state is required.');
  assertNoSensitiveData(event, 'billingEvent');
  if (!event.providerEventId || !event.type || !event.recordId) throw new Error('providerEventId, type, and recordId are required.');
  if (state.processedProviderEvents.includes(event.providerEventId)) {
    state.proofLog.push(createProofEntry('PROVIDER_EVENT_DUPLICATE', event.recordId, 'DUPLICATE', { providerEventId: event.providerEventId }));
    return { status: 'DUPLICATE', mutated: false, retryScheduled: false, externalActionsEnabled: false };
  }
  if (event.outcome === 'TIMEOUT' || event.outcome === 'UNCERTAIN') {
    state.uncertainEvents.push({ providerEventId: event.providerEventId, recordId: event.recordId, type: event.type, outcome: event.outcome, status: 'HOLD_RECONCILIATION_REQUIRED' });
    state.errorLog.push(createErrorEntry('PROVIDER_RESULT_UNCERTAIN', event.recordId, { providerEventId: event.providerEventId, outcome: event.outcome }));
    return { status: 'HOLD', mutated: false, retryScheduled: false, externalActionsEnabled: false };
  }
  if (event.outcome === 'FAILURE') {
    state.errorLog.push(createErrorEntry('PROVIDER_EVENT_FAILED', event.recordId, { providerEventId: event.providerEventId, type: event.type }));
    return { status: 'FAILED', mutated: false, retryScheduled: false, externalActionsEnabled: false };
  }
  const record = {
    recordId: String(event.recordId),
    providerEventId: String(event.providerEventId),
    type: String(event.type),
    amount: Number(event.amount || 0),
    currency: String(event.currency || 'USD'),
    providerReference: event.providerReference ? String(event.providerReference) : null,
    recordedAt: event.recordedAt || new Date().toISOString(),
    status: 'RECORDED_INTERNAL',
    externalActionsEnabled: false
  };
  const target = event.type.startsWith('invoice.') ? state.invoices : event.type.startsWith('credit.') ? state.credits : event.type.startsWith('refund.') ? state.refunds : state.invoices;
  target.push(record);
  state.processedProviderEvents.push(event.providerEventId);
  state.proofLog.push(createProofEntry('PROVIDER_EVENT_RECORDED', event.recordId, 'PASS', { providerEventId: event.providerEventId, type: event.type }));
  return { status: 'PASS', mutated: true, retryScheduled: false, record: clone(record), externalActionsEnabled: false };
}

function createSupportContract(input = {}) {
  if (!input.contractId || !input.licenseId || !input.planId) throw new Error('contractId, licenseId, and planId are required.');
  const record = {
    contractId: String(input.contractId),
    licenseId: String(input.licenseId),
    planId: String(input.planId),
    status: OWNER_REVIEW,
    startsAt: input.startsAt || null,
    endsAt: input.endsAt || null,
    responseTargetHours: Number(input.responseTargetHours || 48),
    includedRequests: Number(input.includedRequests || 0),
    usedRequests: 0,
    overageUnitPrice: Number(input.overageUnitPrice || 0),
    overageDraftAmount: 0,
    ownerApproved: false,
    externalActionsEnabled: false
  };
  assertNoSensitiveData(record, 'supportContract');
  return record;
}

function recordSupportUsage(contract, input = {}) {
  if (!contract || !contract.contractId) throw new Error('Support contract is required.');
  const units = Number(input.units || 1);
  if (!Number.isFinite(units) || units <= 0) throw new Error('Support usage units must be positive.');
  contract.usedRequests += units;
  const overageUnits = Math.max(0, contract.usedRequests - contract.includedRequests);
  contract.overageDraftAmount = Number((overageUnits * contract.overageUnitPrice).toFixed(2));
  return {
    contractId: contract.contractId,
    usedRequests: contract.usedRequests,
    includedRequests: contract.includedRequests,
    overageUnits,
    overageDraftAmount: contract.overageDraftAmount,
    billingStatus: overageUnits ? OWNER_REVIEW : 'INCLUDED',
    externalActionsEnabled: false
  };
}

function createProofEntry(action, recordId, status, detail = {}) {
  return {
    entryId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action,
    recordId,
    status,
    detail: clone(detail),
    externalActionsEnabled: false
  };
}

function createErrorEntry(code, recordId, detail = {}) {
  return {
    entryId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    code,
    recordId,
    detail: clone(detail),
    automaticRetry: false,
    externalActionsEnabled: false
  };
}

function appendAuditEntry(chain, event = {}) {
  if (!Array.isArray(chain)) throw new Error('Audit chain must be an array.');
  assertNoSensitiveData(event, 'auditEvent');
  const previousHash = chain.length ? chain[chain.length - 1].entryHash : 'GENESIS';
  const entry = {
    sequence: chain.length + 1,
    timestamp: event.timestamp || new Date().toISOString(),
    eventType: String(event.eventType || 'UNKNOWN'),
    recordId: String(event.recordId || ''),
    detail: clone(event.detail || {}),
    previousHash
  };
  entry.entryHash = sha256(entry);
  chain.push(entry);
  return clone(entry);
}

function verifyAuditChain(chain) {
  if (!Array.isArray(chain)) return { status: 'HOLD', valid: false, error: 'Audit chain must be an array.' };
  let previousHash = 'GENESIS';
  for (let index = 0; index < chain.length; index += 1) {
    const entry = chain[index];
    const copy = { ...entry };
    delete copy.entryHash;
    if (entry.sequence !== index + 1) return { status: 'HOLD', valid: false, error: `Audit sequence mismatch at ${index + 1}.` };
    if (entry.previousHash !== previousHash) return { status: 'HOLD', valid: false, error: `Audit previous hash mismatch at ${index + 1}.` };
    if (entry.entryHash !== sha256(copy)) return { status: 'HOLD', valid: false, error: `Audit entry hash mismatch at ${index + 1}.` };
    previousHash = entry.entryHash;
  }
  return { status: 'PASS', valid: true, entries: chain.length };
}

function commercialActivationGate(input = {}) {
  const blockers = [];
  const required = [
    ['privateKeyCustody', 'Production signing key custody in an HSM or approved secret manager'],
    ['entitlementRuntime', 'Authorized entitlement runtime with health, audit, backup, and rollback'],
    ['billingProvider', 'Billing provider account, credentials, hosted payment, and signed webhook tests'],
    ['supportOperations', 'Approved support staffing, hours, escalation, and response commitments'],
    ['ownerRelease', 'Explicit owner release for the selected customer/license/action']
  ];
  for (const [field, label] of required) if (input[field] !== true) blockers.push({ field, label, status: 'BLOCKED' });
  return {
    status: blockers.length ? 'HOLD' : 'PASS',
    productionReady: blockers.length === 0,
    blockers,
    selectedRecordOnly: true,
    automaticRetry: false,
    externalActionsEnabled: false
  };
}

module.exports = {
  SCHEMA_VERSION,
  ALGORITHM,
  OWNER_REVIEW,
  EXTERNAL_ACTIONS_ENABLED,
  stableStringify,
  sha256,
  assertNoSensitiveData,
  validateLicensePayload,
  createLicensePayload,
  signLicense,
  verifySignedLicense,
  createEntitlementSnapshot,
  authorizeEntitlement,
  createRevocationDraft,
  activateRevocation,
  createBillingState,
  prepareSubscription,
  applyProviderBillingEvent,
  createSupportContract,
  recordSupportUsage,
  createProofEntry,
  createErrorEntry,
  appendAuditEntry,
  verifyAuditChain,
  commercialActivationGate
};
