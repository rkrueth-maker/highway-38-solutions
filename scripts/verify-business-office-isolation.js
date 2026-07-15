#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const packsRoot = path.join(root, 'business-packs');
const failures = [];
const passes = [];
function check(name, condition, detail = '') {
  (condition ? passes : failures).push({ name, detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
}
const packs = fs.readdirSync(packsRoot).filter(name => fs.existsSync(path.join(packsRoot, name, 'business-office.config.json'))).map(name => ({
  name,
  config: JSON.parse(fs.readFileSync(path.join(packsRoot, name, 'business-office.config.json'), 'utf8'))
}));
check('at least Highway 38 and template packs exist', packs.length >= 2, String(packs.length));
const installationIds = packs.map(item => item.config.installationId);
const businessIds = packs.map(item => item.config.business.id);
check('installation IDs are unique', new Set(installationIds).size === installationIds.length, installationIds.join(', '));
check('business IDs are unique', new Set(businessIds).size === businessIds.length, businessIds.join(', '));
for (const item of packs) {
  const configText = JSON.stringify(item.config);
  const keys = item.config.resources && item.config.resources.propertyKeys || {};
  check(`${item.name} uses property-key resource isolation`, Object.keys(keys).length >= 7 && Object.values(keys).every(value => /^[A-Z0-9_]+$/.test(value)));
  check(`${item.name} contains no embedded Google resource IDs`, !/(?:1[A-Za-z0-9_-]{20,}|AKfyc[A-Za-z0-9_-]+)/.test(configText));
  check(`${item.name} keeps direct payment disabled`, item.config.tax.directFiling === false);
  if (item.name !== 'highway38') check(`${item.name} contains no Highway 38 leakage`, !/Highway\s*38|rkrueth|highway-38-solutions|H38_/i.test(configText));
}
const h38 = packs.find(item => item.name === 'highway38').config;
const template = packs.find(item => item.name === 'template-business').config;
const h38Keys = new Set(Object.values(h38.resources.propertyKeys));
const templateKeys = new Set(Object.values(template.resources.propertyKeys));
check('Highway 38 and template use different primary resource property namespaces', h38.resources.propertyKeys.BO_SPREADSHEET_ID !== template.resources.propertyKeys.BO_SPREADSHEET_ID);
check('template has no Highway 38 resource property keys', [...templateKeys].every(key => !key.startsWith('H38_')));
const result = { status: failures.length ? 'HOLD' : 'PASS', packs: packs.map(item => item.name), passes, failures };
const out = path.join(root, 'artifacts', 'business-office-separation');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'isolation-verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`RESULT: ${result.status}`);
process.exit(failures.length ? 1 : 0);
