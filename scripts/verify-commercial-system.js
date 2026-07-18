#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const failures = [];
const notes = [];
const fail = message => failures.push(message);
const pass = message => notes.push(`PASS: ${message}`);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));

const context = { window: {} };
vm.createContext(context);
vm.runInContext(read('catalog-data.js'), context, { filename: 'catalog-data.js' });
const catalog = context.window.H38_CATALOG;

if (!catalog) fail('catalog-data.js did not define window.H38_CATALOG');
else {
  if (catalog.products.length !== 15) fail(`Expected 15 products; found ${catalog.products.length}`); else pass('catalog contains 15 products');
  if (catalog.bundles.length !== 9) fail(`Expected 9 bundles; found ${catalog.bundles.length}`); else pass('catalog contains 9 bundles');
  if (!Array.isArray(catalog.outcomes) || catalog.outcomes.length < 4) fail('Expected at least four customer outcome routes'); else pass('catalog contains four or more customer outcome routes');

  const productIds = catalog.products.map(p => p.id);
  const bundleIds = catalog.bundles.map(b => b.id);
  if (new Set(productIds).size !== productIds.length) fail('Duplicate product IDs found'); else pass('product IDs are unique');
  if (new Set(bundleIds).size !== bundleIds.length) fail('Duplicate bundle IDs found'); else pass('bundle IDs are unique');

  const expectedPrices = {
    'H38-P001':99,'H38-P002':249,'H38-P003':449,'H38-P004':349,'H38-P005':549,'H38-P006':349,'H38-P007':349,'H38-P008':1495,'H38-P009':1195,'H38-P010':395,'H38-P011':895,'H38-P012':1195,'H38-P013':695,'H38-P014':895,'H38-P015':1495,
    'H38-B001':699,'H38-B002':695,'H38-B003':795,'H38-B004':1795,'H38-B005':1495,'H38-B006':1195,'H38-B007':2095,'H38-B008':2295,'H38-B009':2895
  };
  for (const item of [...catalog.products, ...catalog.bundles]) if (expectedPrices[item.id] !== item.price) fail(`${item.id} price mismatch: ${item.price}`);
  if (!failures.some(f => f.includes('price mismatch'))) pass('all 24 approved prices match');

  for (const bundle of catalog.bundles) {
    if (!bundle.name || !bundle.outcome || !bundle.payment || !bundle.slug || !Array.isArray(bundle.products) || !bundle.products.length) fail(`${bundle.id} is commercially incomplete`);
    for (const productId of bundle.products) if (!productIds.includes(productId)) fail(`${bundle.id} references unknown product ${productId}`);
  }
  if (!failures.some(f => f.includes('references unknown product'))) pass('all bundle components reference approved products');
  if (!failures.some(f => f.includes('commercially incomplete'))) pass('all bundles contain commercial identity, outcome, components, and payment terms');

  const required = ['id','slug','family','familyLabel','name','price','summary','outcome','problem','ideal','bestFit','notFit','inputs','deliverables','formats','turnaround','revisions','scope','exclusions','boundary','payment','upgrade','sample'];
  for (const p of catalog.products) {
    for (const field of required) if (!p[field] || (Array.isArray(p[field]) && !p[field].length)) fail(`${p.id} missing ${field}`);
    if (!p.sample.rows?.length || !p.sample.qa?.length || !p.sample.scenario || !p.sample.input || !p.sample.finished) fail(`${p.id} sample is incomplete`);
    if (!/business day/i.test(p.turnaround)) fail(`${p.id} turnaround is not customer-readable`);
    if (!/revision|correction|clarification/i.test(p.revisions)) fail(`${p.id} revision rule is unclear`);
  }
  if (!failures.some(f => /H38-P\d+ missing|sample is incomplete/.test(f))) pass('every product has complete scope, buying terms, upgrade, and sample data');
}

const requiredFiles = [
  'index.html','solutions.html','products.html','pricing.html','sample-library-now.html','how-it-works.html','faq.html','start-request.html','ai-workflow.html','shop-automation.html',
  'catalog-data.js','commercial.js','commercial.css','commercial-public.js','commercial-public.css','visual-cleanup.css','visual-cleanup-secondary.css',
  'apps-script/commercial-intake/FormBuilder.gs','apps-script/commercial-intake/appsscript.json','docs/commercial-system/README.md'
];
for (const file of requiredFiles) if (!exists(file)) fail(`Missing required file ${file}`);
if (!failures.some(f => f.startsWith('Missing required file'))) pass('all required commercial files exist');

const htmlFiles = fs.readdirSync(root).filter(name => name.endsWith('.html'));
const controlledHtml = htmlFiles.filter(name => { const html = read(name); return html.includes('commercial.css') || html.includes('http-equiv="refresh"') || name === 'index.html'; });
for (const file of controlledHtml) {
  const html = read(file);
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
  for (const ref of refs) {
    if (/^(?:https?:|mailto:|tel:|#)/.test(ref)) continue;
    const clean = ref.split('#')[0].split('?')[0];
    if (clean && !exists(clean)) fail(`${file} references missing local file ${clean}`);
  }
}
if (!failures.some(f => f.includes('references missing local file'))) pass('controlled public pages have no missing local links');

const catalogPages = ['solutions.html','products.html','sample-library-now.html','how-it-works.html','faq.html','start-request.html','ai-workflow.html','shop-automation.html'];
for (const file of catalogPages) {
  const html = read(file);
  if (!html.includes('catalog-data.js')) fail(`${file} is not connected to the approved catalog`);
  if (!html.includes('commercial-public.css') || !html.includes('commercial-public.js')) fail(`${file} is missing the public commercial contract layer`);
}
const homeHtml = read('index.html');
if (!homeHtml.includes('visual-cleanup.css') || !homeHtml.includes('products.html') || !homeHtml.includes('start-request.html') || !homeHtml.includes('sample-library-now.html')) fail('index.html is missing the approved responsive visual and commercial route contract');
if (!failures.some(f => f.includes('approved catalog') || f.includes('public commercial contract layer') || f.includes('responsive visual and commercial route contract'))) pass('all canonical public pages use the approved catalog or responsive homepage route contract');

const publicJs = read('commercial-public.js');
for (const phrase of ['You send','You receive','You pay','You wait','Revisions','Upgrade']) if (!publicJs.includes(phrase)) fail(`Commercial contract layer missing ${phrase}`);
if (!failures.some(f => f.startsWith('Commercial contract layer missing'))) pass('public product contract exposes send, receive, pay, wait, revisions, and upgrade');

const productsHtml = read('products.html');
if (!productsHtml.includes('data-pricing-table') || !productsHtml.includes('data-product-details') || !productsHtml.includes('data-bundles')) fail('Products page does not render pricing, details, and bundles from catalog');
else pass('Products & Pricing renders matrix, detailed scope, and bundles from catalog');

const solutionsHtml = read('solutions.html');
for (const anchor of ['space-project','shop-business','digital','manufacturing']) if (!solutionsHtml.includes(`id="${anchor}"`)) fail(`Solutions page missing outcome path ${anchor}`);
if (!solutionsHtml.includes('data-decision-aid')) fail('Solutions page lacks catalog-driven decision aid');
if (!failures.some(f => f.startsWith('Solutions page'))) pass('Solutions contains four complete outcome paths and a catalog-driven decision aid');

const sampleHtml = read('sample-library-now.html');
if (!sampleHtml.includes('data-owner-link="true"')) fail('Owner Portal approved public location flag is missing'); else pass('Owner Portal location flag is preserved on Samples hub');
if (!sampleHtml.includes('data-samples="all"') || !sampleHtml.includes('data-bundles')) fail('Samples hub does not contain all products and bundle proof'); else pass('Samples hub consolidates all product and bundle proof');
if (!catalog.ownerPortalUrl?.startsWith('https://script.google.com/macros/s/')) fail('Controlled Owner Portal URL is missing or invalid'); else pass('controlled Owner Portal URL is present');

const legacyRoutes = {
  'pricing.html':'products.html#catalog','catalog.html':'products.html#catalog','packages.html':'products.html#bundles','services.html':'solutions.html',
  'examples.html':'sample-library-now.html','sample-workbooks.html':'sample-library-now.html','backend-system.html':'how-it-works.html'
};
for (const [file,target] of Object.entries(legacyRoutes)) {
  const html = read(file);
  if (!html.includes(target.split('#')[0])) fail(`${file} does not route to canonical ${target}`);
}
if (!failures.some(f => f.includes('does not route to canonical'))) pass('legacy catalog, service, sample, and backend routes point to canonical customer pages');

const activePublicFiles = ['index.html',...catalogPages,'catalog-data.js','commercial.js','commercial-public.js'];
const activeText = activePublicFiles.map(read).join('\n');
const forbiddenMarketing = ['$79 intro / $99 normal','under-$250','locked catalog','auto-prepared','Custom Work Build','Project Packet Lite','Business Cleanup Starter','Business System Builder','Digital Setup Builder','internal desk'];
for (const phrase of forbiddenMarketing) if (activeText.toLowerCase().includes(phrase.toLowerCase())) fail(`Forbidden legacy or internal public phrase remains: ${phrase}`);
if (!failures.some(f => f.startsWith('Forbidden legacy or internal'))) pass('legacy catalog and internal-system marketing is absent from canonical public pages');

const prohibitedPublicData = [/rkrueth@gmail\.com/ig,/Mandakw55@gmail\.com/ig,/2183164547/g,/AIza[0-9A-Za-z_-]{20,}/g,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,/Bearer\s+[A-Za-z0-9._-]{20,}/g];
for (const pattern of prohibitedPublicData) if (pattern.test(activeText)) fail(`Public data or secret pattern found: ${pattern}`);
if (!failures.some(f => f.startsWith('Public data or secret pattern'))) pass('canonical public files pass targeted private-data and secret scan');

const requestHtml = read('start-request.html');
if (!requestHtml.includes('What would you like to have when this is finished?')) fail('Outcome-first intake question is missing'); else pass('outcome-first intake question is present');
for (const phrase of ['price','payment','turnaround','revisions','exclusions']) if (!requestHtml.toLowerCase().includes(phrase)) fail(`Intake assurance is missing ${phrase}`);
if (!failures.some(f => f.startsWith('Intake assurance'))) pass('intake explains the buying terms confirmed before fulfillment');

const howHtml = read('how-it-works.html');
for (const phrase of ['Choose the outcome','Approve the buying terms','Receive the result','Use the included revision']) if (!howHtml.includes(phrase)) fail(`How It Works missing customer step: ${phrase}`);
if (!failures.some(f => f.startsWith('How It Works'))) pass('How It Works presents the complete customer-facing journey');

const formBuilder = read('apps-script/commercial-intake/FormBuilder.gs');
if (/createTrigger|newTrigger|sendEmail|GmailApp|MailApp|fetch\(/.test(formBuilder)) fail('FormBuilder contains trigger send or external execution code'); else pass('FormBuilder does not create triggers or send external communication');
if (!formBuilder.includes('OWNER REVIEW REQUIRED BEFORE LINK REPLACEMENT')) fail('FormBuilder lacks explicit owner-review status'); else pass('FormBuilder preserves owner-review boundary');

console.log(notes.join('\n'));
if (failures.length) {
  console.error('\nFAILURES:');
  failures.forEach(f => console.error(`- ${f}`));
  process.exit(1);
}
console.log(`\nCommercial system verification passed with ${notes.length} checks.`);
