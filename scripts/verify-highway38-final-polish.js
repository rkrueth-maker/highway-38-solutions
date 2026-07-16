#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const failures = [];
const passes = [];
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));
const check = (name, condition, evidence = '') => (condition ? passes : failures).push({ name, evidence });

const index = read('index.html');
const portal = read('portal.html');
const samples = read('sample-library-now.html');
const products = read('products.html');
const brand = read('brand-global.js');
const businessUi = read('apps-script/business-office/BusinessOffice_Index.html');
const sharedUi = read('packages/shared-ui/BusinessOffice_Index.html');
const dashboard = read('apps-script/business-office/BusinessOffice_Dashboard.gs');
const businessOfficeConfig = JSON.parse(read('business-packs/highway38/business-office.config.json'));
const urlPlan = read('docs/verification/HIGHWAY38_FINAL_URLS.md');
const legacyPlan = read('docs/verification/HIGHWAY38_LEGACY_PORTAL_INVENTORY.md');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(read('catalog-data.js'), context, { filename: 'catalog-data.js' });
const catalog = context.window.H38_CATALOG;

check('homepage headline is approved', index.includes('<h1>Big problems. Clear plans.</h1>'));
check('homepage has dominant $99 entry CTA', index.includes('href="start-request.html?product=H38-P001">Start with a $99 Problem Snapshot'));
check('homepage has finished examples secondary CTA', index.includes('href="sample-library-now.html">See Finished Examples'));
check('homepage explains no charge on request', index.includes('Submitting a request does not create a charge.'));
check('homepage explains remote service', /completed remotely/i.test(index));
check('prohibited quantitative CNC claim removed', !/(?:25,000\+|25,000\s+(?:CNC\s+)?programs?)/i.test(index));
check('homepage contains no personal owner attribution', !/Rick\s+Krueth/i.test(index));

check('catalog contains 15 products', catalog && catalog.products.length === 15, catalog ? String(catalog.products.length) : 'missing catalog');
check('catalog contains 9 bundles', catalog && catalog.bundles.length === 9, catalog ? String(catalog.bundles.length) : 'missing catalog');
check('products page renders catalog products and bundles', products.includes('data-product-details') && products.includes('data-bundles'));
check('Sample Library contains all product samples', samples.includes('data-samples="all"'));
check('Sample Library contains bundle proof', samples.includes('data-bundles'));
check('Sample Library Owner Portal link is clean', samples.includes('href="portal.html">Owner Portal'));

check('Owner Portal has stable workspace hashes', portal.includes("panelToHash={operations:'operations',office:'business-office',upload:'upload'}"));
check('Owner Portal reads requested workspace hash', portal.includes('function requestedPanel()'));
check('Owner Portal has Operations and Social workspace', portal.includes('Operations &amp; Social'));
check('Owner Portal has Business Office workspace', portal.includes('>Business Office</button>'));
check('Owner Portal has upload route', portal.includes('Upload PDF / Take Picture'));
check('Owner Portal avoids blocked private Google iframes', !/<iframe\b/i.test(portal));
check('Owner Portal launches only accepted Apps Script workspaces', [...portal.matchAll(/<a\b[^>]*href="(https:\/\/script\.google\.com\/macros\/s\/[^"]+)"/g)].length >= 6);
check('Owner Portal contains no spreadsheet destination', !/docs\.google\.com\/spreadsheets/i.test(portal));
check('legacy Owner links are rewritten to portal.html', brand.includes("link.href='portal.html'") && brand.includes("link.removeAttribute('target')"));
check('Owner Portal preserves approval boundary', portal.includes('remain owner-approval gated'));

for (const [name, ui] of [['Highway 38 Business Office', businessUi], ['shared Business Office', sharedUi]]) {
  check(`${name} has viewport`, /name="viewport"/.test(ui));
  check(`${name} has browser title`, /<title>Business Office<\/title>/.test(ui));
  check(`${name} supports dynamic business branding`, ui.includes("branding.businessOfficeName || 'Business Office'") && ui.includes('branding.logoUrl'));
  check(`${name} has mobile rules`, /@media \(max-width:800px\)/.test(ui));
  check(`${name} keeps administrative spreadsheet confirmation`, ui.includes('Administrative spreadsheet') && ui.includes('Open the administrative spreadsheet outside the Owner Portal?'));
  check(`${name} keeps financial and tax boundary`, ui.includes('does not move money, fund payroll, file returns, or provide tax advice'));
}
check('Highway 38 Business Office is aligned with shared UI', businessUi === sharedUi);
check('Highway 38 Business Office uses approved logo URL', businessOfficeConfig.branding.logoUrl === 'https://rkrueth-maker.github.io/highway-38-solutions/assets/highway38-logo.png?v=20260713-logo2', businessOfficeConfig.branding.logoUrl || 'blank');
check('Highway 38 Business Office colors remain approved', businessOfficeConfig.branding.primaryColor === '#173a5e' && businessOfficeConfig.branding.secondaryColor === '#326a9e');

check('dashboard excludes controlled test records', dashboard.includes('boDashboardIsControlledTest_') && dashboard.includes("text.indexOf('CONTROLLED TEST')"));
check('dashboard includes revenue, cost, and profit metrics', dashboard.includes("'Active-job revenue'") && dashboard.includes("'Active-job cost'") && dashboard.includes("'Active-job profit'"));
check('dashboard includes payroll and tax preparation metrics', dashboard.includes("'Payroll preparation'") && dashboard.includes("'Tax preparation'"));
check('dashboard includes documents and approvals metrics', dashboard.includes("'Documents needing review'") && dashboard.includes("'Pending owner approvals'"));

check('current URL plan is documented', urlPlan.includes('/portal.html#operations') && urlPlan.includes('/portal.html#business-office'));
check('custom-domain actions remain approval gated', /Do not change DNS[\s\S]*without owner approval/i.test(urlPlan));
check('legacy portal is explicitly preserved', /No component is approved for deletion/i.test(legacyPlan));
check('legacy technical source remains present', exists('apps-script/core-engine/owner-portal-next/RUNTIME_TEST_RUNBOOK.md'));

const result = {
  status: failures.length ? 'HOLD' : 'PASS',
  sourceCommit: process.env.GITHUB_SHA || '',
  passed: passes.length,
  failed: failures.length,
  passes,
  failures
};

const outputDir = path.join(root, 'artifacts', 'final-polish');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
process.exit(failures.length ? 1 : 0);
