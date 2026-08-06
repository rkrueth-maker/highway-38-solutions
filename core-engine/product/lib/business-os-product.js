'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CURRENT_SCHEMA_VERSION = 1;
const EXTERNAL_FLAGS = ['customerPortal','customerUploads','hostedPayments','outboundEmail','socialPublishing','advertisingLaunch','websiteDeployment','accountingApiSync','calendarSync'];
const clone = value => JSON.parse(JSON.stringify(value));
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8'); }
function sha256(value) { return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }

function normalizeTenantKey(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.includes('..') || /[\\/]/.test(raw) || raw.startsWith('.')) throw new Error('Tenant key contains an unsafe path sequence.');
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!key || key.length < 2 || key.length > 48) throw new Error('Tenant key must contain 2–48 letters, numbers, or hyphens.');
  return key;
}

function assertSafeRelative(value, label) {
  const text = String(value || '');
  if (!text || path.isAbsolute(text) || text.includes('..') || /[\\]/.test(text)) throw new Error(`${label} must be a safe relative path.`);
  return text;
}

function validateEngineConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') return ['Engine config must be an object.'];
  if (config.schemaVersion !== CURRENT_SCHEMA_VERSION) errors.push(`Unsupported schema version ${config.schemaVersion}.`);
  if (!config.engine?.id || !config.engine?.version) errors.push('Engine identity and version are required.');
  if (config.tenant?.mode !== 'isolated') errors.push('Tenant mode must be isolated.');
  if (config.tenant?.crossTenantReads !== false || config.tenant?.crossTenantWrites !== false) errors.push('Cross-tenant access must remain disabled.');
  if (config.controls?.selectedRecordOnly !== true) errors.push('Selected-record execution is required.');
  if (config.controls?.bulkExecution !== false) errors.push('Bulk execution must remain disabled.');
  if (config.controls?.automaticRetry !== false) errors.push('Automatic retry must remain disabled.');
  if (config.controls?.duplicateProtection !== true) errors.push('Duplicate protection is required.');
  if (config.controls?.proofLogRequired !== true || config.controls?.errorLogRequired !== true) errors.push('Proof and Error Logs are required.');
  if (config.controls?.externalActionsEnabled !== false) errors.push('External actions must default to disabled.');
  if (!Array.isArray(config.modules) || !config.modules.length) errors.push('At least one module is required.');
  if (!config.roles?.owner || !Array.isArray(config.roles.owner)) errors.push('Owner role is required.');
  return errors;
}

function validateBusinessPack(pack) {
  const errors = [];
  if (!pack || typeof pack !== 'object') return ['Business Pack must be an object.'];
  if (!pack.id || !pack.name || !pack.version) errors.push('Business Pack id, name, and version are required.');
  if (!pack.theme?.brandName) errors.push('Business Pack brand name is required.');
  if (!Array.isArray(pack.enabledModules)) errors.push('Business Pack enabledModules must be an array.');
  if (!pack.catalog?.source) errors.push('Business Pack catalog source is required.');
  if (pack.externalActionsEnabled === true) errors.push('A Business Pack may not self-enable external actions.');
  return errors;
}

function validateLicense(license, tenantKey, tier) {
  const errors = [];
  if (!license || typeof license !== 'object') return ['License is required.'];
  if (license.status !== 'ACTIVE') errors.push(`License status must be ACTIVE, not ${license.status || 'missing'}.`);
  if (license.validUntil && new Date(license.validUntil).getTime() < Date.now()) errors.push('License has expired.');
  const assigned = Array.isArray(license.assignedTenants) ? license.assignedTenants : [];
  const limit = Number(license.tenantLimit || 0);
  if (!assigned.includes(tenantKey) && assigned.length >= limit) errors.push(`License tenant limit ${limit} has been reached.`);
  if (Array.isArray(license.allowedTiers) && !license.allowedTiers.includes(tier)) errors.push(`Tier ${tier} is not licensed.`);
  return errors;
}

function compileInstallation(engineConfig, businessPack, options = {}) {
  const tenantKey = normalizeTenantKey(options.tenantKey || businessPack.defaultTenantKey || businessPack.id);
  const tier = options.tier || businessPack.defaultTier || 'Core';
  const license = clone(options.license || { licenseId:`EVAL-${tenantKey.toUpperCase()}`, status:'ACTIVE', type:'evaluation', validUntil:null, tenantLimit:1, assignedTenants:[tenantKey], allowedTiers:['Core'] });
  const errors = [...validateEngineConfig(engineConfig), ...validateBusinessPack(businessPack), ...validateLicense(license, tenantKey, tier)];
  if (errors.length) throw new Error(errors.join(' '));
  if (!engineConfig.engine.releaseChannels.includes(options.releaseChannel || engineConfig.engine.defaultReleaseChannel)) throw new Error('Release channel is not supported.');

  const enabled = new Set([...(businessPack.enabledModules || []), ...engineConfig.modules.filter(module => module.core).map(module => module.id)]);
  const featureFlags = { ...engineConfig.featureFlags, ...(businessPack.featureFlags || {}) };
  for (const flag of EXTERNAL_FLAGS) featureFlags[flag] = false;
  const providers = {};
  for (const slot of businessPack.providers || []) providers[slot.slot] = { mode:slot.mode || 'manual', provider:slot.provider || null, credentialState:'NOT_CONFIGURED', executionState:'LOCKED', ownerReleaseRequired:true };

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    engine: clone(engineConfig.engine),
    businessPack: { id:businessPack.id, name:businessPack.name, version:businessPack.version },
    tenant: { key:tenantKey, name:options.tenantName || businessPack.theme.brandName, namespace:engineConfig.tenant.namespacePattern.replace('{tenantKey}', tenantKey), mode:'isolated' },
    environment: options.environment || 'production',
    releaseChannel: options.releaseChannel || engineConfig.engine.defaultReleaseChannel,
    tier,
    license: { licenseId:license.licenseId, type:license.type, status:license.status, validUntil:license.validUntil, tenantLimit:license.tenantLimit, assignedTenants:Array.from(new Set([...(license.assignedTenants || []), tenantKey])), allowedTiers:license.allowedTiers },
    controls: clone(engineConfig.controls),
    featureFlags,
    modules: engineConfig.modules.map(module => ({ ...module, enabled:enabled.has(module.id) })),
    roles: clone(engineConfig.roles),
    theme: { ...engineConfig.theme, ...businessPack.theme },
    catalog: clone(businessPack.catalog),
    providers,
    data: clone(engineConfig.data),
    privacy: clone(businessPack.privacy || {}),
    support: clone(businessPack.support || {}),
    externalActionsEnabled: false
  };
}

function installBusinessOs({ engineConfig, businessPack, license, outputDir, tenantKey, tenantName, tier, releaseChannel, environment = 'production', force = false }) {
  const root = path.resolve(outputDir);
  if (fs.existsSync(root) && fs.readdirSync(root).length && !force) throw new Error(`Output directory is not empty: ${root}`);
  fs.mkdirSync(root, { recursive:true });
  const effective = compileInstallation(engineConfig, businessPack, { license, tenantKey, tenantName, tier, releaseChannel, environment });
  const namespace = assertSafeRelative(effective.tenant.namespace, 'Tenant namespace');
  const tenantRoot = path.join(root, namespace);
  for (const directory of ['data','logs','private-files']) fs.mkdirSync(path.join(tenantRoot, directory), { recursive:true });
  fs.mkdirSync(path.join(root, 'backups'), { recursive:true });
  for (const recordType of effective.data.recordTypes) writeJson(path.join(tenantRoot, 'data', `${recordType}.json`), []);
  fs.writeFileSync(path.join(tenantRoot, 'logs', 'proof-log.jsonl'), '', 'utf8');
  fs.writeFileSync(path.join(tenantRoot, 'logs', 'error-log.jsonl'), '', 'utf8');
  writeJson(path.join(root, 'effective-config.json'), effective);
  const manifest = { installationId:crypto.randomUUID(), installedAt:new Date().toISOString(), engineId:effective.engine.id, engineVersion:effective.engine.version, businessPack:effective.businessPack, tenant:effective.tenant, environment:effective.environment, releaseChannel:effective.releaseChannel, tier:effective.tier, externalActionsEnabled:false, effectiveConfigSha256:sha256(effective) };
  writeJson(path.join(root, 'manifest.json'), manifest);
  fs.writeFileSync(path.join(root, 'README.md'), `# ${effective.tenant.name} Business OS\n\nTenant: \`${effective.tenant.key}\`\n\nEnvironment: \`${effective.environment}\`\n\nExternal actions: **LOCKED** until credentials, regression tests, duplicate locks, Proof/Error logging, and owner release are complete.\n`, 'utf8');
  return { root, manifest, effective };
}

function createBackup(installDir, backupFile) {
  const root = path.resolve(installDir);
  const manifest = readJson(path.join(root, 'manifest.json'));
  const effective = readJson(path.join(root, 'effective-config.json'));
  const namespace = assertSafeRelative(effective.tenant.namespace, 'Tenant namespace');
  const tenantRoot = path.join(root, namespace);
  const files = {};
  for (const file of fs.readdirSync(path.join(tenantRoot, 'data'))) files[path.posix.join(namespace, 'data', file)] = fs.readFileSync(path.join(tenantRoot, 'data', file), 'utf8');
  for (const file of ['proof-log.jsonl','error-log.jsonl']) files[path.posix.join(namespace, 'logs', file)] = fs.readFileSync(path.join(tenantRoot, 'logs', file), 'utf8');
  const payload = { schemaVersion:CURRENT_SCHEMA_VERSION, createdAt:new Date().toISOString(), manifest, effective, files };
  const envelope = { payload, sha256:sha256(payload) };
  writeJson(backupFile, envelope);
  return envelope;
}

function restoreBackup(backupFile, targetDir, { force = false } = {}) {
  const envelope = readJson(backupFile);
  if (!envelope.payload || envelope.sha256 !== sha256(envelope.payload)) throw new Error('Backup integrity check failed.');
  const root = path.resolve(targetDir);
  if (fs.existsSync(root) && fs.readdirSync(root).length && !force) throw new Error(`Restore target is not empty: ${root}`);
  fs.mkdirSync(root, { recursive:true });
  writeJson(path.join(root, 'manifest.json'), envelope.payload.manifest);
  writeJson(path.join(root, 'effective-config.json'), envelope.payload.effective);
  for (const [relative, content] of Object.entries(envelope.payload.files || {})) {
    assertSafeRelative(relative, 'Backup file path');
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) throw new Error('Backup contains an unsafe path.');
    fs.mkdirSync(path.dirname(target), { recursive:true });
    fs.writeFileSync(target, content, 'utf8');
  }
  fs.mkdirSync(path.join(root, 'backups'), { recursive:true });
  return { root, manifest:envelope.payload.manifest, effective:envelope.payload.effective };
}

function migrateEffectiveConfig(config, targetSchemaVersion = CURRENT_SCHEMA_VERSION) {
  const migrated = clone(config);
  if (migrated.schemaVersion > targetSchemaVersion) throw new Error('Downgrade migrations are not supported.');
  while (migrated.schemaVersion < targetSchemaVersion) {
    if (migrated.schemaVersion !== 0) throw new Error(`No migration available from schema ${migrated.schemaVersion}.`);
    migrated.schemaVersion = 1;
    migrated.controls = migrated.controls || {};
    migrated.controls.selectedRecordOnly = true;
    migrated.controls.bulkExecution = false;
    migrated.controls.externalActionsEnabled = false;
    migrated.externalActionsEnabled = false;
  }
  return migrated;
}

module.exports = { CURRENT_SCHEMA_VERSION, EXTERNAL_FLAGS, readJson, writeJson, sha256, normalizeTenantKey, validateEngineConfig, validateBusinessPack, validateLicense, compileInstallation, installBusinessOs, createBackup, restoreBackup, migrateEffectiveConfig };
