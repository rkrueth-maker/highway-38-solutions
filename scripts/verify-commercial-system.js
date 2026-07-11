#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const failures = [];
const notes = [];

function fail(message) { failures.push(message); }
function pass(message) { notes.push(`PASS: ${message}`); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }

const context = { window: {} };
vm.createContext(context);
vm.runInContext(read('catalog-data.js'), context, { filename: 'catalog-data.js' });
const catalog = context.window.H38_CATALOG;

if (!catalog) fail('catalog-data.js did not define window.H38_CATALOG');
else {
  if (catalog.products.length !== 15) fail(`Expected 15 products; found ${catalog.products.length}`);
  else pass('catalog contains 15 products');
  if (catalog.bundles.length !== 9) fail(`Expected 9 bundles; found ${catalog.bundles.length}`);
  else pass('catalog contains 9 bundles');

  const productIds = catalog.products.map(p => p.id);
  const bundleIds = catalog.bundles.map(b => b.id);
  if (new Set(productIds).size !== productIds.length) fail('Duplicate product IDs found');
  else pass('product IDs are unique');
  if (new Set(bundleIds).size !== bundleIds.length) fail('Duplicate bundle IDs found');
  else pass('bundle IDs are unique');

  const expectedPrices = {
    'H38-P001': 99, 'H38-P002': 249, 'H38-P003': 449, 'H38-P004': 349,
    'H38-P005': 549, 'H38-P006': 349, 'H38-P007': 349, 'H38-P008': 1495,
    'H38-P009': 1195, 'H38-P010': 395, 'H38-P011': 895, 'H38-P012': 1195,
    'H38-P013': 695, 'H38-P014': 895, 'H38-P015': 1495,
    'H38-B001': 699, 'H38-B002': 695, 'H38-B003': 795, 'H38-B004': 1795,
    'H38-B005': 1495, 'H38-B006': 1195, 'H38-B007': 2095, 'H38-B008': 2295,
    'H38-B009': 2895
  };
  for (const item of [...catalog.products, ...catalog.bundles]) {
    if (expectedPrices[item.id] !== item.price) fail(`${item.id} price mismatch: ${item.price}`);
  }
  if (!failures.some(f => f.includes('price mismatch'))) pass('all 24 approved prices match');

  for (const bundle of catalog.bundles) {
    for (const productId of bundle.products) {
      if (!productIds.includes(productId)) fail(`${bundle.id} references unknown product ${productId}`);
    }
  }
  if (!failures.some(f => f.includes('references unknown product'))) pass('all bundle components reference approved products');

  for (const product of catalog.products) {
    const required = ['id','slug','family','name','price','summary','outcome','problem','ideal','inputs','deliverables','formats','turnaround','revisions','scope','exclusions','boundary','payment','upgrade','sample'];
    for (const field of required) if (!product[field] || (Array.isArray(product[field]) && !product[field].length)) fail(`${product.id} missing ${field}`);
    if (!product.sample.rows?.length || !product.sample.qa?.length) fail(`${product.id} sample is incomplete`);
  }
  if (!failures.some(f => /H38-P\d+ missing|sample is incomplete/.test(f))) pass('every product has complete scope and sample data');
}

const requiredFiles = [
  'index.html','solutions.html','products.html','pricing.html','sample-library-now.html',
  'how-it-works.html','faq.html','start-request.html','ai-workflow.html','shop-automation.html',
  'catalog-data.js','commercial.js','commercial.css',
  'apps-script/commercial-intake/FormBuilder.gs','apps-script/commercial-intake/appsscript.json',
  'docs/commercial-system/README.md'
];
for (const file of requiredFiles) if (!exists(file)) fail(`Missing required file ${file}`);
if (!failures.some(f => f.startsWith('Missing required file'))) pass('all required commercial files exist');

const htmlFiles = fs.readdirSync(root).filter(name => name.endsWith('.html'));
const controlledHtml = htmlFiles.filter(name => {
  const html = read(name);
  return html.includes('commercial.css') || html.includes('http-equiv="refresh"');
});

for (const file of controlledHtml) {
  const html = read(file);
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
  for (const ref of refs) {
    if (/^(?:https?:|mailto:|tel:|#)/.test(ref)) continue;
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) continue;
    if (!exists(clean)) fail(`${file} references missing local file ${clean}`);
  }
}
if (!failures.some(f => f.includes('references missing local file'))) pass('controlled public pages have no missing local links');

const activePublicFiles = [
  'index.html','solutions.html','products.html','pricing.html','sample-library-now.html',
  'how-it-works.html','faq.html','start-request.html','ai-workflow.html','shop-automation.html',
  'catalog-data.js','commercial.js'
];
const activeText = activePublicFiles.map(read).join('\n');
const forbiddenMarketing = [
  '$79 intro / $99 normal','under-$250','locked catalog','auto-prepared','Custom Work Build',
  'Project Packet Lite','Business Cleanup Starter','Business System Builder','Digital Setup Builder'
];
for (const phrase of forbiddenMarketing) if (activeText.toLowerCase().includes(phrase.toLowerCase())) fail(`Forbidden legacy public phrase remains: ${phrase}`);
if (!failures.some(f => f.startsWith('Forbidden legacy public phrase'))) pass('legacy catalog and internal-machinery marketing is removed from active pages');

const prohibitedPublicData = [
  /rkrueth@gmail\.com/ig,
  /Mandakw55@gmail\.com/ig,
  /2183164547/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /Bearer\s+[A-Za-z0-9._-]{20,}/g
];
for (const pattern of prohibitedPublicData) if (pattern.test(activeText)) fail(`Public data or secret pattern found: ${pattern}`);
if (!failures.some(f => f.startsWith('Public data or secret pattern'))) pass('active public files pass targeted private-data and secret scan');

const sampleHtml = read('sample-library-now.html');
if (!sampleHtml.includes('data-owner-link="true"')) fail('Owner Portal approved public location flag is missing');
else pass('Owner Portal location flag is preserved on Samples hub');
if (!catalog.ownerPortalUrl?.startsWith('https://script.google.com/macros/s/')) fail('Controlled Owner Portal URL is missing or invalid');
else pass('controlled Owner Portal URL is present');

const requestHtml = read('start-request.html');
if (!requestHtml.includes('What would you like to have when this is finished?')) fail('Outcome-first intake question is missing');
else pass('outcome-first intake question is present');
if (/internal desk/i.test(requestHtml)) fail('Customer intake still asks for an internal desk');
else pass('customer intake does not require internal desk selection');

const formBuilder = read('apps-script/commercial-intake/FormBuilder.gs');
if (/createTrigger|newTrigger|sendEmail|GmailApp|MailApp|fetch\(/.test(formBuilder)) fail('FormBuilder contains trigger send or external execution code');
else pass('FormBuilder does not create triggers or send external communication');
if (!formBuilder.includes('OWNER REVIEW REQUIRED BEFORE LINK REPLACEMENT')) fail('FormBuilder lacks explicit owner-review status');
else pass('FormBuilder preserves owner-review boundary');

console.log(notes.join('\n'));
if (failures.length) {
  console.error('\nFAILURES:');
  failures.forEach(f => console.error(`- ${f}`));
  process.exit(1);
}
console.log(`\nCommercial system verification passed with ${notes.length} checks.`);
