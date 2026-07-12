#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const core = require('../core-engine/product/commercial/lib/commercial-license.js');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const result = { command: argv[0] || 'help' };
  for (let index = 1; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token || !token.startsWith('--') || value == null) throw new Error('Arguments must use --name value pairs.');
    result[token.slice(2)] = value;
  }
  return result;
}

function required(args, name) {
  if (!args[name]) throw new Error(`--${name} is required.`);
  return args[name];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function writeJson(file, value, mode) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', mode: mode || 0o644 });
  if (mode) fs.chmodSync(target, mode);
  return target;
}

function writeText(file, value, mode) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value, { encoding: 'utf8', mode: mode || 0o644 });
  if (mode) fs.chmodSync(target, mode);
  return target;
}

function assertPrivateOutput(file) {
  const target = path.resolve(file);
  if (target === ROOT || target.startsWith(ROOT + path.sep)) throw new Error('Private signing keys may not be written inside the repository.');
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  if (!normalized.includes('/private') && !normalized.includes('/secrets')) throw new Error('Private key output path must include private or secrets.');
  return target;
}

function print(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'generate-keypair') {
    const privateOut = assertPrivateOutput(required(args, 'private-out'));
    const publicOut = path.resolve(required(args, 'public-out'));
    const keyRingOut = args['keyring-out'] ? path.resolve(args['keyring-out']) : null;
    const keyId = required(args, 'key-id');
    const pair = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    writeText(privateOut, pair.privateKey, 0o600);
    writeText(publicOut, pair.publicKey, 0o644);
    if (keyRingOut) {
      writeJson(keyRingOut, {
        schemaVersion: 1,
        purpose: 'Public verification keyring. Store private keys separately.',
        keys: [{ keyId, algorithm: core.ALGORITHM, status: 'ACTIVE', notBefore: new Date().toISOString(), retireAfter: null, publicKeyPem: pair.publicKey }],
        privateKeysIncluded: false,
        productionReady: false
      });
    }
    print({ status: 'PASS', command: args.command, keyId, privateOut, publicOut, keyRingOut, privateMode: '0600', externalActionsOccurred: false });
    return;
  }

  if (args.command === 'sign') {
    const payload = core.createLicensePayload(readJson(required(args, 'payload')));
    const privateKey = fs.readFileSync(path.resolve(required(args, 'private-key')), 'utf8');
    const envelope = core.signLicense(payload, privateKey, required(args, 'key-id'));
    const output = writeJson(required(args, 'output'), envelope);
    print({ status: 'PASS', command: args.command, output, licenseId: payload.licenseId, keyId: envelope.keyId, externalActionsOccurred: false });
    return;
  }

  if (args.command === 'verify') {
    const envelope = readJson(required(args, 'license'));
    const keyRing = readJson(required(args, 'keyring'));
    const revocations = args.revocations ? readJson(args.revocations) : [];
    const result = core.verifySignedLicense(envelope, keyRing, revocations, { now: args.now });
    print({ ...result, command: args.command, externalActionsOccurred: false });
    process.exit(result.valid ? 0 : 1);
  }

  if (args.command === 'inspect') {
    const envelope = readJson(required(args, 'license'));
    const keyRing = readJson(required(args, 'keyring'));
    const revocations = args.revocations ? readJson(args.revocations) : [];
    const verified = core.verifySignedLicense(envelope, keyRing, revocations, { now: args.now });
    if (!verified.valid) {
      print({ ...verified, command: args.command, externalActionsOccurred: false });
      process.exit(1);
    }
    const authorization = core.authorizeEntitlement(verified.payload, {
      tenantKey: args.tenant,
      module: args.module,
      feature: args.feature,
      addOn: args['add-on'],
      releaseChannel: args.channel,
      seatsUsed: args.seats == null ? undefined : Number(args.seats)
    });
    print({ status: authorization.authorized ? 'PASS' : 'HOLD', command: args.command, license: verified.entitlements, authorization, externalActionsOccurred: false });
    process.exit(authorization.authorized ? 0 : 1);
  }

  if (args.command === 'revoke-draft') {
    const draft = core.createRevocationDraft({
      licenseId: required(args, 'license-id'),
      reason: required(args, 'reason'),
      requestedBy: args['requested-by'] || 'owner'
    });
    const output = writeJson(required(args, 'output'), draft);
    print({ status: 'PASS', command: args.command, output, revocationStatus: draft.status, ownerApproved: false, externalActionsOccurred: false });
    return;
  }

  process.stdout.write([
    'Business OS commercial license CLI',
    '',
    'Generate an Ed25519 keypair outside the repository:',
    '  node scripts/business-os-commercial-license.js generate-keypair --key-id KEY-ID --private-out /private/license-key.pem --public-out /tmp/license-public.pem --keyring-out /tmp/keyring.json',
    '',
    'Sign an approved payload:',
    '  node scripts/business-os-commercial-license.js sign --payload payload.json --private-key /private/license-key.pem --key-id KEY-ID --output signed-license.json',
    '',
    'Verify a signed license:',
    '  node scripts/business-os-commercial-license.js verify --license signed-license.json --keyring keyring.json --revocations revocations.json',
    '',
    'Inspect one entitlement request:',
    '  node scripts/business-os-commercial-license.js inspect --license signed-license.json --keyring keyring.json --tenant tenant-one --module jobs --feature backup-restore --channel stable --seats 3',
    '',
    'Create an owner-review revocation draft:',
    '  node scripts/business-os-commercial-license.js revoke-draft --license-id LIC-001 --reason "Contract ended" --output revocation-draft.json'
  ].join('\n') + '\n');
}

try {
  main();
} catch (error) {
  print({ status: 'HOLD', error: error.message, externalActionsOccurred: false });
  process.exit(1);
}
