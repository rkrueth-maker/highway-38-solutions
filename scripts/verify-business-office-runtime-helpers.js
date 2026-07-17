#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const businessOfficeDir = path.join(root, 'apps-script', 'business-office');
const configPath = path.join(businessOfficeDir, 'BusinessOffice_Config.gs');
const config = fs.readFileSync(configPath, 'utf8');
const source = fs.readdirSync(businessOfficeDir)
  .filter(name => name.endsWith('.gs'))
  .map(name => fs.readFileSync(path.join(businessOfficeDir, name), 'utf8'))
  .join('\n');

const checks = [];
function check(name, condition, evidence = '') {
  const item = { name, condition: Boolean(condition), evidence };
  checks.push(item);
  console[item.condition ? 'log' : 'error'](`${item.condition ? 'PASS' : 'FAIL'}: ${name}${evidence ? ` — ${evidence}` : ''}`);
}

check('canonical timezone helper exists', /function\s+boTimeZone_\s*\(\)/.test(config));
check('compatibility timezone helper exists', /function\s+boTimezone_\s*\(\)/.test(config));
check('timezone helper does not recurse through its fallback', !/boPackValue_\(\s*['"]business\.timeZone['"]\s*,\s*boTimeZone_\s*\(\s*\)\s*\)/.test(config));
check('compatibility helper delegates to canonical helper', /function\s+boTimezone_\s*\(\)\s*\{\s*return\s+boTimeZone_\s*\(\s*\)\s*;?\s*\}/.test(config));
check('all legacy timezone calls have a defined compatibility helper', !/boTimezone_\s*\(/.test(source) || /function\s+boTimezone_\s*\(/.test(config));

function executeTimezone(packValue) {
  const sandbox = {
    boPackValue_: packValue,
    boPackPropertyKey_: value => value,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    SpreadsheetApp: { openById: id => ({ id }) },
    Utilities: {
      formatDate: () => 'formatted',
      getUuid: () => '12345678-0000-0000-0000-000000000000'
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(`${config}\nthis.__canonical = boTimeZone_(); this.__compatibility = boTimezone_();`, sandbox, { filename: 'BusinessOffice_Config.gs' });
  return { canonical: sandbox.__canonical, compatibility: sandbox.__compatibility };
}

try {
  const configured = executeTimezone((key, fallback) => key === 'business.timeZone' ? 'America/Chicago' : fallback);
  check('configured timezone resolves without recursion', configured.canonical === 'America/Chicago', JSON.stringify(configured));
  check('compatibility timezone resolves to configured value', configured.compatibility === 'America/Chicago', JSON.stringify(configured));
} catch (error) {
  check('configured timezone resolves without recursion', false, error.stack || error.message);
  check('compatibility timezone resolves to configured value', false, error.stack || error.message);
}

try {
  const fallback = executeTimezone((key, defaultValue) => defaultValue);
  check('default timezone resolves to UTC', fallback.canonical === 'UTC' && fallback.compatibility === 'UTC', JSON.stringify(fallback));
} catch (error) {
  check('default timezone resolves to UTC', false, error.stack || error.message);
}

const failures = checks.filter(item => !item.condition);
const result = { status: failures.length ? 'HOLD' : 'PASS', passed: checks.length - failures.length, failed: failures.length, checks, failures };
const outputDir = path.join(root, 'artifacts', 'business-office-runtime-helpers');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`RESULT: ${result.status} (${result.passed} pass, ${result.failed} fail)`);
process.exit(failures.length ? 1 : 0);
