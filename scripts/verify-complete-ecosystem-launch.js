#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'launch-control', 'launch-manifest.json');
const failures = [];
const passes = [];

function check(name, condition, detail = '') {
  (condition ? passes : failures).push({ name, detail });
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.cache'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function textFile(file) {
  return /\.(?:html?|css|js|mjs|cjs|json|md|txt|csv|xml|yml|yaml|svg)$/i.test(file);
}

function luhnValid(digits) {
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index]);
    if (doubleDigit) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function hasPaymentCardCandidate(body) {
  const candidatePattern = /(?:^|[^A-Za-z0-9])(\d{13,19}|(?:\d{4}[ -]){2,4}\d{3,4}|\d{4}[ -]\d{6}[ -]\d{5})(?![A-Za-z0-9])/g;
  let match;
  while ((match = candidatePattern.exec(body)) !== null) {
    const digits = match[1].replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return true;
  }
  return false;
}

check('launch manifest exists', fs.existsSync(MANIFEST));
let manifest = null;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  passes.push({ name: 'launch manifest parses', detail: manifest.release });
} catch (error) {
  failures.push({ name: 'launch manifest parses', detail: error.message });
}

if (manifest) {
  check('master issue is 31', manifest.masterIssue === 31, String(manifest.masterIssue));
  check('execution branch is exact', manifest.executionBranch === 'complete-ecosystem-live-launch-2026-07-11', manifest.executionBranch);
  check('six mandatory workstreams', Array.isArray(manifest.workstreams) && manifest.workstreams.length === 6, String(manifest.workstreams?.length));
  check('workstream issues exact', JSON.stringify((manifest.workstreams || []).map(x => x.id)) === JSON.stringify([32,33,34,35,36,37]));
  check('scope reduction blocked', manifest.hardRules?.scopeReductionAllowed === false);
  check('silent omissions blocked', manifest.hardRules?.silentOmissionsAllowed === false);
  check('fake completion blocked', manifest.hardRules?.fakeCompletionAllowed === false);
  check('rollback required', manifest.hardRules?.rollbackRequiredBeforeProductionWrite === true);
  check('public private data blocked', manifest.hardRules?.publicPrivateDataAllowed === false);
  check('external owner release required', manifest.hardRules?.externalActionsRequireOwnerRelease === true);
  const locked = manifest.externalFunctions || {};
  check('customer email locked', locked.customerEmail === 'LOCKED');
  check('payment requests locked', locked.paymentRequests === 'LOCKED');
  check('payment processing locked', locked.paymentProcessing === 'LOCKED');
  check('social publishing locked', locked.socialPublishing === 'LOCKED');
  check('advertising spend locked', locked.advertisingSpend === 'LOCKED');
  check('final delivery locked', locked.finalDelivery === 'LOCKED');
}

const files = walk(ROOT);
const textFiles = files.filter(textFile);
const publicCandidates = textFiles.filter(file => {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  return !rel.startsWith('launch-control/private/') && !rel.startsWith('docs/private/');
});

const forbiddenPatterns = [
  { name: 'raw US SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: 'private key material', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: 'GitHub token', regex: /\bgh[pousr]_[0-9A-Za-z]{20,}\b/g },
  { name: 'Stripe live secret', regex: /\bsk_live_[0-9A-Za-z]{16,}\b/g }
];

for (const file of publicCandidates) {
  let body;
  try { body = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
  for (const pattern of forbiddenPatterns) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(body)) failures.push({
      name: `privacy/secret scan: ${pattern.name}`,
      detail: path.relative(ROOT, file)
    });
  }
  const coordinateHeavyVector = /\.svg$/i.test(file);
  if (!coordinateHeavyVector && hasPaymentCardCandidate(body)) failures.push({
    name: 'privacy/secret scan: Luhn-valid payment card candidate',
    detail: path.relative(ROOT, file)
  });
}
check('privacy and secret scan', !failures.some(x => x.name.startsWith('privacy/secret scan')), `${publicCandidates.length} public text candidates scanned; vector coordinate files excluded from Luhn-only matching`);

const requiredPaths = [
  'launch-control/launch-manifest.json',
  'launch-control/README.md',
  'launch-control/rollback-register.json',
  'launch-control/deployment-evidence.json',
  'launch-control/blockers.json',
  'customer-portal.html',
  'business-concept-builder.html'
];
for (const rel of requiredPaths) check(`required artifact ${rel}`, fs.existsSync(path.join(ROOT, rel)));

const htmlFiles = files.filter(f => /\.html?$/i.test(f));
for (const file of htmlFiles) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const body = fs.readFileSync(file, 'utf8');
  const standaloneDocument = !rel.startsWith('apps-script/') && /<!doctype\s+html|<html\b/i.test(body);
  if (!standaloneDocument) continue;
  check(`html viewport ${rel}`, /<meta[^>]+name=["']viewport["']/i.test(body));
  check(`html title ${rel}`, /<title>[^<]+<\/title>/i.test(body));
}

const evidence = {
  release: manifest?.release || 'unknown',
  status: failures.length ? 'HOLD' : 'PASS',
  generatedAt: new Date().toISOString(),
  passed: passes.length,
  failed: failures.length,
  filesScanned: files.length,
  publicTextFilesScanned: publicCandidates.length,
  digest: crypto.createHash('sha256').update(JSON.stringify({passes,failures})).digest('hex'),
  passes,
  failures
};

const outDir = path.join(ROOT, 'launch-control', 'evidence');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'complete-ecosystem-verification.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
process.exit(failures.length ? 1 : 0);
