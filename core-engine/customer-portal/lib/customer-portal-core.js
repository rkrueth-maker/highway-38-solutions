'use strict';

const crypto = require('crypto');
const path = require('path');

const DEFAULT_PRIVATE_FIELDS = [
  'internalNotes',
  'internalCosts',
  'errors',
  'ownerApprovals',
  'providerCredentials',
  'paymentCredentials',
  'privateFiles',
  'otherCustomers',
  'profitMargin',
  'staffOnly'
];

function base64urlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return buffer.toString('base64url');
}

function base64urlDecode(value) {
  return Buffer.from(String(value), 'base64url');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
}

function hmac(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest();
}

function assertSecret(secret, minimumBytes = 32) {
  const bytes = Buffer.isBuffer(secret) ? secret : Buffer.from(String(secret || ''), 'utf8');
  if (bytes.length < minimumBytes) throw new Error(`Session secret must contain at least ${minimumBytes} bytes.`);
  return bytes;
}

function safeEqual(left, right) {
  const a = Buffer.isBuffer(left) ? left : Buffer.from(left);
  const b = Buffer.isBuffer(right) ? right : Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeId(value, label) {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(text) || text.includes('..')) throw new Error(`${label} is invalid.`);
  return text;
}

function normalizeTenantKey(value) {
  return normalizeId(value, 'Tenant key').toLowerCase();
}

function normalizeCustomerId(value) {
  return normalizeId(value, 'Customer ID');
}

function sanitizeFileName(value) {
  const raw = String(value || '').trim();
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch (_) { decoded = raw; }
  if (!raw || raw.includes('..') || decoded.includes('..') || /[\\/]/.test(raw) || /[\\/]/.test(decoded)) throw new Error('Filename is invalid.');
  const base = path.basename(raw).replace(/[\u0000-\u001f\u007f]/g, '');
  if (!base || base === '.' || base === '..' || base.includes('/') || base.includes('\\')) throw new Error('Filename is invalid.');
  const cleaned = base.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length > 160) throw new Error('Filename is invalid.');
  return cleaned;
}

function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') return ['Configuration must be an object.'];
  if (config.schemaVersion !== 1) errors.push('Configuration schemaVersion must be 1.');
  if (config.portal?.status !== 'NOT_ACTIVATED') errors.push('Default portal status must be NOT_ACTIVATED.');
  if (config.security?.tenantIsolationRequired !== true) errors.push('Tenant isolation is required.');
  if (config.security?.customerOwnRecordsOnly !== true) errors.push('Customer-own record isolation is required.');
  if (config.security?.automaticRetry !== false) errors.push('Automatic retry must remain disabled.');
  if (config.security?.bulkExecution !== false) errors.push('Bulk execution must remain disabled.');
  if (config.uploads?.publicAccess !== false) errors.push('Uploads must remain private.');
  if (config.uploads?.quarantineRequired !== true || config.uploads?.virusScanRequired !== true) errors.push('Upload quarantine and virus scanning are required.');
  if (config.payments?.hostedProviderOnly !== true || config.payments?.rawCardDataAllowed !== false) errors.push('Payments must use provider-hosted entry and raw card data must be forbidden.');
  if (Object.values(config.externalActions || {}).some(value => value !== false)) errors.push('All external actions must default to disabled.');
  return errors;
}

function issueSession({ secret, config, tenantKey, customerId, permissions, now = Date.now(), sessionId = crypto.randomUUID() }) {
  const errors = validateConfig(config);
  if (errors.length) throw new Error(errors.join(' '));
  const key = assertSecret(secret, Number(config.security.minimumSecretBytes || 32));
  const tenant = normalizeTenantKey(tenantKey);
  const customer = normalizeCustomerId(customerId);
  const allowed = new Set(config.permissions?.customer || []);
  const requested = Array.isArray(permissions) ? permissions : [...allowed];
  if (requested.some(permission => !allowed.has(permission))) throw new Error('Session requested an unapproved permission.');
  const issuedAt = Math.floor(now / 1000);
  const claims = {
    ver: 1,
    typ: 'customer-session',
    sid: normalizeId(sessionId, 'Session ID'),
    tenantKey: tenant,
    customerId: customer,
    permissions: [...new Set(requested)].sort(),
    iat: issuedAt,
    exp: issuedAt + Number(config.security.sessionTtlSeconds || 1800),
    nonce: crypto.randomBytes(16).toString('hex')
  };
  const header = { alg: 'HS256', typ: 'H38-CUSTOMER-SESSION', ver: 1 };
  const unsigned = `${base64urlEncode(stableJson(header))}.${base64urlEncode(stableJson(claims))}`;
  return `${unsigned}.${base64urlEncode(hmac(key, unsigned))}`;
}

function verifySession({ token, secret, config, now = Date.now(), revokedSessionIds = new Set() }) {
  const key = assertSecret(secret, Number(config.security.minimumSecretBytes || 32));
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Session token is malformed.');
  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = hmac(key, unsigned);
  const provided = base64urlDecode(parts[2]);
  if (!safeEqual(expected, provided)) throw new Error('Session signature is invalid.');
  let header;
  let claims;
  try {
    header = JSON.parse(base64urlDecode(parts[0]).toString('utf8'));
    claims = JSON.parse(base64urlDecode(parts[1]).toString('utf8'));
  } catch (_) {
    throw new Error('Session token payload is invalid.');
  }
  if (header.alg !== 'HS256' || header.typ !== 'H38-CUSTOMER-SESSION' || claims.typ !== 'customer-session') throw new Error('Session token type is invalid.');
  const nowSeconds = Math.floor(now / 1000);
  const skew = Number(config.security.clockSkewSeconds || 0);
  if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.exp <= claims.iat) throw new Error('Session timestamps are invalid.');
  if (claims.iat > nowSeconds + skew) throw new Error('Session is not active yet.');
  if (claims.exp < nowSeconds - skew) throw new Error('Session has expired.');
  if (revokedSessionIds.has(claims.sid)) throw new Error('Session has been revoked.');
  claims.tenantKey = normalizeTenantKey(claims.tenantKey);
  claims.customerId = normalizeCustomerId(claims.customerId);
  claims.permissions = Array.isArray(claims.permissions) ? [...new Set(claims.permissions)] : [];
  return claims;
}

function authorizeOwnRecord(claims, record, permission) {
  if (!claims || !record) throw new Error('Session and record are required.');
  if (!claims.permissions.includes(permission)) throw new Error(`Permission denied: ${permission}.`);
  if (normalizeTenantKey(record.tenantKey) !== claims.tenantKey) throw new Error('Cross-tenant access denied.');
  if (normalizeCustomerId(record.customerId) !== claims.customerId) throw new Error('Cross-customer access denied.');
  return true;
}

function redactPrivateFields(value, privateFields = DEFAULT_PRIVATE_FIELDS) {
  const denied = new Set(privateFields);
  function visit(input) {
    if (Array.isArray(input)) return input.map(visit);
    if (!input || typeof input !== 'object') return input;
    const output = {};
    for (const [key, item] of Object.entries(input)) {
      if (denied.has(key) || key.startsWith('_internal') || key.startsWith('_private')) continue;
      output[key] = visit(item);
    }
    return output;
  }
  return visit(value);
}

function projectCustomerRecord(claims, record, permission, privateFields) {
  authorizeOwnRecord(claims, record, permission);
  return redactPrivateFields(record, privateFields);
}

function createUploadIntent({ claims, config, fileName, mimeType, sizeBytes, jobId, now = Date.now() }) {
  if (!claims.permissions.includes('files.own.upload')) throw new Error('Upload permission denied.');
  const name = sanitizeFileName(fileName);
  const type = String(mimeType || '').toLowerCase().trim();
  const bytes = Number(sizeBytes);
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > Number(config.uploads.maxBytes)) throw new Error('Upload size is not allowed.');
  if (!config.uploads.allowedMimeTypes.includes(type)) throw new Error('Upload MIME type is not allowed.');
  const extension = path.extname(name).toLowerCase();
  if (!config.uploads.allowedExtensions.includes(extension)) throw new Error('Upload extension is not allowed.');
  const uploadId = `UPL-${crypto.randomUUID()}`;
  return {
    uploadId,
    tenantKey: claims.tenantKey,
    customerId: claims.customerId,
    jobId: normalizeId(jobId, 'Job ID'),
    fileName: name,
    mimeType: type,
    sizeBytes: bytes,
    storageKey: `tenants/${claims.tenantKey}/customers/${claims.customerId}/quarantine/${uploadId}/${base64urlEncode(name)}`,
    status: 'QUARANTINED_PENDING_SCAN',
    publicAccess: false,
    createdAt: new Date(now).toISOString(),
    externalActionOccurred: false
  };
}

function approveQuote({ claims, quote, approvalTokenId, expectedVersion, now = Date.now(), duplicateLocks = new Set() }) {
  authorizeOwnRecord(claims, quote, 'quotes.own.approve');
  if (quote.status !== 'PRESENTED') throw new Error('Quote is not available for approval.');
  if (Number(quote.version) !== Number(expectedVersion)) throw new Error('Quote version changed; refresh before approving.');
  const token = normalizeId(approvalTokenId, 'Approval token');
  const lockKey = sha256(`${claims.tenantKey}|${claims.customerId}|${quote.id}|${quote.version}|${token}`);
  if (duplicateLocks.has(lockKey)) throw new Error('Duplicate quote approval blocked.');
  duplicateLocks.add(lockKey);
  return {
    ...quote,
    status: 'CUSTOMER_APPROVED_PENDING_OWNER_PROCESSING',
    customerApprovedAt: new Date(now).toISOString(),
    customerApprovalSessionId: claims.sid,
    duplicateLock: lockKey,
    externalActionOccurred: false,
    nextAction: 'Owner reviews approval and prepares the controlled payment or scheduling step.'
  };
}

function validateHostedPayment({ claims, invoice, config, hostedUrl, provider }) {
  authorizeOwnRecord(claims, invoice, 'payments.own.hosted');
  if (!invoice.balanceDue || Number(invoice.balanceDue) <= 0) throw new Error('Invoice has no payable balance.');
  const providerName = String(provider || '').trim();
  if (!config.payments.approvedProviders.includes(providerName)) throw new Error('Payment provider is not approved.');
  let url;
  try { url = new URL(hostedUrl); } catch (_) { throw new Error('Hosted payment URL is invalid.'); }
  if (!config.payments.allowedUrlSchemes.includes(url.protocol)) throw new Error('Hosted payment URL scheme is not allowed.');
  if (url.username || url.password) throw new Error('Hosted payment URL may not contain credentials.');
  return {
    invoiceId: invoice.id,
    tenantKey: claims.tenantKey,
    customerId: claims.customerId,
    provider: providerName,
    hostedUrl: url.toString(),
    balanceDue: Number(invoice.balanceDue),
    rawCardDataStored: false,
    externalActionOccurred: false
  };
}

function createDownloadGrant({ claims, record, permission = 'deliverables.own.download', secret, expiresInSeconds = 300, now = Date.now() }) {
  authorizeOwnRecord(claims, record, permission);
  const key = assertSecret(secret);
  const grant = {
    ver: 1,
    typ: 'download-grant',
    grantId: crypto.randomUUID(),
    tenantKey: claims.tenantKey,
    customerId: claims.customerId,
    recordId: normalizeId(record.id, 'Record ID'),
    storageKey: String(record.storageKey || ''),
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + Math.min(Math.max(Number(expiresInSeconds), 30), 900)
  };
  if (!grant.storageKey.startsWith(`tenants/${claims.tenantKey}/customers/${claims.customerId}/`)) throw new Error('Download storage path is outside the customer namespace.');
  const payload = base64urlEncode(stableJson(grant));
  return `${payload}.${base64urlEncode(hmac(key, payload))}`;
}

function verifyDownloadGrant({ token, secret, now = Date.now() }) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw new Error('Download grant is malformed.');
  const key = assertSecret(secret);
  const expected = hmac(key, parts[0]);
  const provided = base64urlDecode(parts[1]);
  if (!safeEqual(expected, provided)) throw new Error('Download grant signature is invalid.');
  const grant = JSON.parse(base64urlDecode(parts[0]).toString('utf8'));
  if (grant.typ !== 'download-grant' || grant.exp < Math.floor(now / 1000)) throw new Error('Download grant has expired or is invalid.');
  return grant;
}

function createRevisionRequest({ claims, deliverable, message, now = Date.now() }) {
  authorizeOwnRecord(claims, deliverable, 'revisions.own.request');
  const text = String(message || '').trim();
  if (text.length < 5 || text.length > 4000) throw new Error('Revision request must contain 5–4000 characters.');
  return {
    id: `REV-${crypto.randomUUID()}`,
    tenantKey: claims.tenantKey,
    customerId: claims.customerId,
    deliverableId: deliverable.id,
    message: text,
    status: 'NEEDS_OWNER_REVIEW',
    createdAt: new Date(now).toISOString(),
    externalActionOccurred: false
  };
}

function createMessageDraft({ claims, job, message, now = Date.now() }) {
  authorizeOwnRecord(claims, job, 'messages.own.create');
  const text = String(message || '').trim();
  if (text.length < 2 || text.length > 6000) throw new Error('Message must contain 2–6000 characters.');
  return {
    id: `MSG-${crypto.randomUUID()}`,
    tenantKey: claims.tenantKey,
    customerId: claims.customerId,
    jobId: job.id,
    direction: 'CUSTOMER_TO_OWNER',
    body: text,
    status: 'RECORDED_PENDING_OWNER_REVIEW',
    createdAt: new Date(now).toISOString(),
    externalActionOccurred: false
  };
}

function proofEntry(action, result, context = {}, now = Date.now()) {
  return {
    id: `PROOF-${crypto.randomUUID()}`,
    timestamp: new Date(now).toISOString(),
    action,
    result,
    tenantKey: context.tenantKey || null,
    customerId: context.customerId || null,
    recordId: context.recordId || null,
    sessionId: context.sessionId || null,
    providerReference: context.providerReference || null,
    externalActionOccurred: Boolean(context.externalActionOccurred),
    digest: sha256({ action, result, context })
  };
}

function errorEntry(action, error, context = {}, now = Date.now()) {
  return {
    id: `ERROR-${crypto.randomUUID()}`,
    timestamp: new Date(now).toISOString(),
    action,
    message: String(error?.message || error),
    tenantKey: context.tenantKey || null,
    customerId: context.customerId || null,
    recordId: context.recordId || null,
    automaticRetry: false,
    externalActionOccurred: Boolean(context.externalActionOccurred)
  };
}

module.exports = {
  DEFAULT_PRIVATE_FIELDS,
  sha256,
  validateConfig,
  issueSession,
  verifySession,
  authorizeOwnRecord,
  redactPrivateFields,
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
  normalizeTenantKey,
  normalizeCustomerId,
  sanitizeFileName
};
