'use strict';

const crypto = require('crypto');

const ACTIVATION_STATUS = Object.freeze({
  HOLD: 'HOLD',
  READY_FOR_OWNER_ENABLE: 'READY_FOR_OWNER_ENABLE',
  ACTIVE: 'ACTIVE'
});

const EXTERNAL_ACTION_KEYS = Object.freeze([
  'emailSend',
  'paymentRequest',
  'paymentProcessing',
  'finalDelivery',
  'automaticPublication'
]);

const SECRET_KEY_PATTERN = /(secret|password|private.?key|credential|api.?key)/i;
const SAFE_SECRET_METADATA_KEYS = new Set(['secretEnvVar', 'minimumSecretBytes']);
const SECRET_VALUE_PATTERNS = Object.freeze([
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk_live_[A-Za-z0-9]+\b/,
  /\bpk_live_[A-Za-z0-9]+\b/,
  /\bgh[opusr]_[A-Za-z0-9]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\b(?:\d[ -]*?){13,19}\b/
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function isHostname(value) {
  const text = asNonEmptyString(value).toLowerCase();
  return Boolean(text) && /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(text) && !text.includes('..');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
}

function collectPersistedSecretFindings(value, path = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectPersistedSecretFindings(item, `${path}[${index}]`, findings));
    return findings;
  }
  if (!isPlainObject(value)) return findings;

  for (const [key, item] of Object.entries(value)) {
    const itemPath = `${path}.${key}`;
    if (SECRET_KEY_PATTERN.test(key) && !SAFE_SECRET_METADATA_KEYS.has(key) && item !== null && item !== '' && item !== false) {
      findings.push({ path: itemPath, reason: 'Secret-like key must not contain a persisted value.' });
    }
    if (typeof item === 'string' && SECRET_VALUE_PATTERNS.some(pattern => pattern.test(item))) {
      findings.push({ path: itemPath, reason: 'Secret-like value pattern detected.' });
    }
    collectPersistedSecretFindings(item, itemPath, findings);
  }
  return findings;
}

function validateRuntimeConfig(runtimeConfig) {
  const errors = [];
  if (!isPlainObject(runtimeConfig)) return ['Runtime configuration must be an object.'];
  if (runtimeConfig.schemaVersion !== 1) errors.push('Runtime configuration schemaVersion must be 1.');
  if (!['HOLD', 'READY_FOR_OWNER_ENABLE'].includes(runtimeConfig.activationMode)) {
    errors.push('activationMode must be HOLD or READY_FOR_OWNER_ENABLE in repository configuration.');
  }

  const runtime = runtimeConfig.runtime || {};
  if (!asNonEmptyString(runtime.provider)) errors.push('A server runtime provider must be selected.');
  if (!isHttpsUrl(runtime.baseUrl)) errors.push('Runtime baseUrl must be HTTPS.');
  if (!isHttpsUrl(runtime.healthUrl)) errors.push('Runtime healthUrl must be HTTPS.');
  if (!asNonEmptyString(runtime.deploymentId)) errors.push('Runtime deploymentId is required.');
  if (!asNonEmptyString(runtime.rollbackRef)) errors.push('Runtime rollbackRef is required.');

  const identity = runtimeConfig.identity || {};
  if (!asNonEmptyString(identity.provider)) errors.push('Identity provider is required.');
  if (!isHttpsUrl(identity.issuer)) errors.push('Identity issuer must be HTTPS.');
  if (!isHttpsUrl(identity.jwksUrl)) errors.push('Identity JWKS URL must be HTTPS.');
  if (identity.requireTenantClaim !== true || identity.requireCustomerClaim !== true) {
    errors.push('Identity validation must require both tenant and customer claims.');
  }
  if (!Number.isInteger(identity.maxTokenAgeSeconds) || identity.maxTokenAgeSeconds < 60 || identity.maxTokenAgeSeconds > 3600) {
    errors.push('Identity maxTokenAgeSeconds must be an integer from 60 through 3600.');
  }

  const storage = runtimeConfig.storage || {};
  if (!asNonEmptyString(storage.provider)) errors.push('Private storage provider is required.');
  if (storage.denyPublicAccess !== true) errors.push('Private storage must deny public access.');
  if (storage.signedDownloads !== true) errors.push('Private storage must support signed downloads.');
  if (storage.quarantineNamespace !== 'tenants/{tenantKey}/customers/{customerId}/quarantine/') {
    errors.push('Quarantine namespace must remain tenant/customer isolated.');
  }
  if (storage.deliveryNamespace !== 'tenants/{tenantKey}/customers/{customerId}/deliverables/') {
    errors.push('Delivery namespace must remain tenant/customer isolated.');
  }

  const scanning = runtimeConfig.malwareScanning || {};
  if (!asNonEmptyString(scanning.provider)) errors.push('Malware scanning provider is required.');
  if (scanning.quarantineRequired !== true) errors.push('Upload quarantine is required.');
  if (scanning.cleanVerdictRequired !== true) errors.push('A clean malware verdict is required before release.');
  if (scanning.failClosed !== true) errors.push('Malware scanning must fail closed.');

  const payments = runtimeConfig.payments || {};
  if (!asNonEmptyString(payments.provider)) errors.push('Hosted payment provider is required.');
  if (payments.providerHostedOnly !== true || payments.rawCardDataAllowed !== false) {
    errors.push('Payment entry must be provider-hosted and raw card data must remain forbidden.');
  }
  if (!Array.isArray(payments.approvedHosts) || payments.approvedHosts.length === 0 || payments.approvedHosts.some(host => !isHostname(host))) {
    errors.push('At least one valid hosted-payment hostname is required.');
  }

  const session = runtimeConfig.session || {};
  if (!asNonEmptyString(session.secretEnvVar)) errors.push('Session secretEnvVar is required.');
  if (!Number.isInteger(session.minimumSecretBytes) || session.minimumSecretBytes < 32) {
    errors.push('Session minimumSecretBytes must be at least 32.');
  }
  if (session.secureCookie !== true || session.httpOnly !== true) errors.push('Session cookies must be Secure and HttpOnly.');
  if (!['Lax', 'Strict'].includes(session.sameSite)) errors.push('Session sameSite must be Lax or Strict.');
  if (session.csrfProtection !== true) errors.push('CSRF protection is required.');

  const controls = runtimeConfig.controls || {};
  if (controls.contentSecurityPolicy !== true) errors.push('Content Security Policy is required.');
  if (controls.rateLimiting !== true) errors.push('Rate limiting is required.');
  if (controls.auditRetention !== true) errors.push('Audit retention is required.');
  if (controls.monitoring !== true) errors.push('Runtime monitoring is required.');
  if (controls.automaticRetry !== false) errors.push('Automatic retry must remain disabled.');
  if (controls.bulkExecution !== false) errors.push('Bulk execution must remain disabled.');
  if (controls.proofLogRequired !== true || controls.errorLogRequired !== true) {
    errors.push('Proof Log and Error Log are required.');
  }

  const featureFlags = runtimeConfig.featureFlags || {};
  if (featureFlags.customerPortal !== false) errors.push('Repository default customerPortal feature flag must remain false.');
  const externalActions = featureFlags.externalActions || {};
  for (const key of EXTERNAL_ACTION_KEYS) {
    if (externalActions[key] !== false) errors.push(`Repository default external action ${key} must remain false.`);
  }

  const secretFindings = collectPersistedSecretFindings(runtimeConfig);
  secretFindings.forEach(finding => errors.push(`${finding.path}: ${finding.reason}`));
  return errors;
}

function evaluateActivation({ runtimeConfig, env = {}, health = {}, isolationTests = {}, ownerApproval = {} }) {
  const failures = validateRuntimeConfig(runtimeConfig).map(message => ({ control: 'CONFIG', message }));
  const checks = [];
  const record = (control, condition, message) => {
    checks.push({ control, status: condition ? 'PASS' : 'HOLD', message });
    if (!condition) failures.push({ control, message });
  };

  const secretName = runtimeConfig?.session?.secretEnvVar;
  const secretValue = secretName ? env[secretName] : undefined;
  const secretBytes = Buffer.byteLength(String(secretValue || ''), 'utf8');
  record('SESSION_SECRET', secretBytes >= Number(runtimeConfig?.session?.minimumSecretBytes || 32), 'Session secret is supplied only through the runtime environment and meets the minimum byte length.');
  record('RUNTIME_HEALTH', health.status === 'PASS' && health.deploymentId === runtimeConfig?.runtime?.deploymentId, 'Runtime health endpoint passed for the expected deployment.');
  record('IDENTITY_HEALTH', health.identity === 'PASS', 'Identity issuer and JWKS validation passed.');
  record('STORAGE_HEALTH', health.storage === 'PASS', 'Private storage deny-public and signed-download checks passed.');
  record('MALWARE_HEALTH', health.malwareScanning === 'PASS', 'Quarantine and clean-verdict workflow passed.');
  record('PAYMENT_HEALTH', health.hostedPayments === 'PASS', 'Hosted-payment provider and approved-host checks passed.');
  record('ROLLBACK_TEST', health.rollback === 'PASS', 'Runtime rollback and restore procedure passed.');
  record('CROSS_TENANT_TEST', isolationTests.crossTenant === 'PASS', 'Cross-tenant access was denied.');
  record('CROSS_CUSTOMER_TEST', isolationTests.crossCustomer === 'PASS', 'Cross-customer access was denied.');
  record('GUESSED_ID_TEST', isolationTests.guessedId === 'PASS', 'Guessed-record access was denied.');
  record('EXPIRED_SESSION_TEST', isolationTests.expiredSession === 'PASS', 'Expired sessions were denied.');
  record('UPLOAD_DOWNLOAD_TEST', isolationTests.uploadDownload === 'PASS', 'Private upload, scan, and scoped-download flow passed.');
  record('OWNER_ACTIVATION_APPROVAL', ownerApproval.customerPortal === true, 'Rick explicitly approved customer-portal activation for this deployment.');

  for (const key of EXTERNAL_ACTION_KEYS) {
    const approved = ownerApproval.externalActions?.[key] === true;
    const enabled = runtimeConfig?.featureFlags?.externalActions?.[key] === true;
    record(`OWNER_ACTION_${key}`, !enabled || approved, `${key} cannot be enabled without separate owner approval.`);
  }

  const status = failures.length ? ACTIVATION_STATUS.HOLD : ACTIVATION_STATUS.READY_FOR_OWNER_ENABLE;
  const summary = {
    status,
    activationAllowed: status === ACTIVATION_STATUS.READY_FOR_OWNER_ENABLE,
    configurationDigest: sha256(runtimeConfig),
    checks,
    failures,
    externalActionsOccurred: false,
    nextAction: status === ACTIVATION_STATUS.READY_FOR_OWNER_ENABLE
      ? 'Enable the customerPortal feature flag in the authorized runtime deployment, then re-run live acceptance before serving customers.'
      : 'Resolve every HOLD item and re-run the activation gate. Do not expose customer data or enable external actions.'
  };
  return summary;
}

function sanitizeRuntimeSummary(runtimeConfig) {
  const copy = JSON.parse(JSON.stringify(runtimeConfig || {}));
  if (copy.session) copy.session.secretEnvVar = copy.session.secretEnvVar ? 'CONFIGURED_ENV_REFERENCE' : 'MISSING';
  return {
    schemaVersion: copy.schemaVersion,
    activationMode: copy.activationMode,
    runtime: copy.runtime,
    identity: copy.identity ? {
      provider: copy.identity.provider,
      issuerHost: isHttpsUrl(copy.identity.issuer) ? new URL(copy.identity.issuer).host : 'INVALID',
      jwksHost: isHttpsUrl(copy.identity.jwksUrl) ? new URL(copy.identity.jwksUrl).host : 'INVALID'
    } : {},
    storage: copy.storage ? {
      provider: copy.storage.provider,
      denyPublicAccess: copy.storage.denyPublicAccess,
      signedDownloads: copy.storage.signedDownloads
    } : {},
    malwareScanning: copy.malwareScanning ? {
      provider: copy.malwareScanning.provider,
      failClosed: copy.malwareScanning.failClosed
    } : {},
    payments: copy.payments ? {
      provider: copy.payments.provider,
      providerHostedOnly: copy.payments.providerHostedOnly,
      approvedHosts: copy.payments.approvedHosts
    } : {},
    session: copy.session,
    controls: copy.controls,
    featureFlags: copy.featureFlags,
    configurationDigest: sha256(runtimeConfig)
  };
}

module.exports = {
  ACTIVATION_STATUS,
  EXTERNAL_ACTION_KEYS,
  collectPersistedSecretFindings,
  evaluateActivation,
  sanitizeRuntimeSummary,
  sha256,
  validateRuntimeConfig
};
