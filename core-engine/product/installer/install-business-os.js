#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  readJson,
  installBusinessOs,
  createBackup,
  restoreBackup
} = require('../lib/business-os-product');

function parseArgs(argv) {
  const result = { command: 'install' };
  const args = [...argv];
  if (args[0] && !args[0].startsWith('--')) result.command = args.shift();
  while (args.length) {
    const token = args.shift();
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === 'force') {
      result.force = true;
      continue;
    }
    if (!args.length) throw new Error(`Missing value for --${key}`);
    result[key] = args.shift();
  }
  return result;
}

function required(options, key) {
  if (!options[key]) throw new Error(`--${key} is required.`);
  return options[key];
}

function install(options) {
  const enginePath = path.resolve(options.engine || path.join(__dirname, '..', 'config', 'core-engine.default.json'));
  const packPath = path.resolve(required(options, 'pack'));
  const licensePath = options.license ? path.resolve(options.license) : null;
  const output = path.resolve(required(options, 'output'));
  const result = installBusinessOs({
    engineConfig: readJson(enginePath),
    businessPack: readJson(packPath),
    license: licensePath ? readJson(licensePath) : undefined,
    outputDir: output,
    tenantKey: required(options, 'tenant'),
    tenantName: options.name,
    tier: options.tier,
    releaseChannel: options.channel,
    environment: options.environment || 'production',
    force: Boolean(options.force)
  });
  process.stdout.write(JSON.stringify({
    status: 'PASS',
    command: 'install',
    output: result.root,
    tenant: result.effective.tenant,
    tier: result.effective.tier,
    releaseChannel: result.effective.releaseChannel,
    externalActionsEnabled: result.effective.externalActionsEnabled
  }, null, 2) + '\n');
}

function backup(options) {
  const source = path.resolve(required(options, 'source'));
  const output = path.resolve(required(options, 'output'));
  const envelope = createBackup(source, output);
  process.stdout.write(JSON.stringify({ status: 'PASS', command: 'backup', output, sha256: envelope.sha256 }, null, 2) + '\n');
}

function restore(options) {
  const source = path.resolve(required(options, 'source'));
  const output = path.resolve(required(options, 'output'));
  const result = restoreBackup(source, output, { force: Boolean(options.force) });
  process.stdout.write(JSON.stringify({ status: 'PASS', command: 'restore', output: result.root, tenant: result.effective.tenant }, null, 2) + '\n');
}

function help() {
  process.stdout.write(`Business OS installer\n\n` +
    `Install:\n  node install-business-os.js install --pack <business-pack.json> --output <directory> --tenant <key> [--name <name>] [--tier Core] [--channel stable] [--license <license.json>] [--environment production] [--force]\n\n` +
    `Backup:\n  node install-business-os.js backup --source <installation-directory> --output <backup.json>\n\n` +
    `Restore:\n  node install-business-os.js restore --source <backup.json> --output <directory> [--force]\n`);
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'install') install(options);
  else if (options.command === 'backup') backup(options);
  else if (options.command === 'restore') restore(options);
  else if (options.command === 'help' || options.command === '--help') help();
  else throw new Error(`Unknown command: ${options.command}`);
} catch (error) {
  process.stderr.write(JSON.stringify({ status: 'HOLD', error: error.message }, null, 2) + '\n');
  process.exit(1);
}
