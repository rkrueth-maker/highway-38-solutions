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
const request = read('start-request.html');
const requestClient = read('request-flow.js');
const intake = read('apps-script/unified-shell/Unified_PublicIntake.gs');
const portal = read('portal.html');
const portalIndex = read('apps-script/core-engine/owner-portal-next/Portal_Index.html');
const portalUnified = read('apps-script/core-engine/owner-portal-next/Portal_Unified.js');
const portalShell = read('apps-script/core-engine/owner-portal-next/Portal_UX_Client_Shell.html');
const portalBusinessServer = read('apps-script/core-engine/owner-portal-next/Portal_Business.js');
const portalBusinessClient = read('apps-script/core-engine/owner-portal-next/Portal_Business_Client.html');
const samples = read('sample-library-now.html');
const products = read('products.html');
const brand = read('brand-global.js');
const businessUi = read('apps-script/business-office/BusinessOffice_Index.html');
const sharedUi = read('packages/shared-ui/BusinessOffice_Index.html');
const businessWeb = read('apps-script/business-office/BusinessOffice_Web.gs');
const businessGate = read('apps-script/business-office/BusinessOffice_ModuleAccess.gs');
const dashboard = read('apps-script/business-office/BusinessOffice_Dashboard.gs');
const businessOfficeConfig = JSON.parse(read('business-packs/highway38/business-office.config.json'));
const approvedAssets = JSON.parse(read('scripts/config/approved-public-assets.json'));
const approvedLogoUrl = approvedAssets.production_url.replace(/\/$/, '') + '/' + approvedAssets.approved_logo.public_reference;
const urlPlan = read('docs/verification/HIGHWAY38_FINAL_URLS.md');
const legacyPlan = read('docs/verification/HIGHWAY38_LEGACY_PORTAL_INVENTORY.md');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(read('catalog-data.js'), context, { filename: 'catalog-data.js' });
const catalog = context.window.H38_CATALOG;

check('homepage headline is approved', /<h1>\s*<span>Big problems\.<\/span>\s*<strong>Clear plans\.<\/strong>\s*<\/h1>/i.test(index));
check('homepage has dominant outcome-first request CTA', /href="start-request\.html"[^>]*>\s*Start a Request/i.test(index) && index.includes('outcome-card'));
check('homepage has finished examples secondary CTA', /href="sample-library-now\.html"[^>]*>\s*See Examples/i.test(index));
check('homepage explains no charge on request', /Submitting a request creates no charge\./i.test(index));
check('homepage uses real responsive navigation and sections', index.includes('class="site-header"') && index.includes('class="menu-button"') && index.includes('class="hero"'));
check('homepage removes raster hotspot shell and swipe notice', !/class="[^"]*hotspot|approved-home__stage|Swipe horizontally/i.test(index));
check('homepage uses clean approved hero photography without embedded mockup', index.includes('class="hero-copy"') && index.includes('class="hero-media"') && index.includes('assets/approved-website-images/10-project-planning-documents.jpg') && !index.includes('assets/approved-homepage-mockup.png'));
check('homepage includes the four approved outcome paths', (index.match(/class="outcome-card"/g) || []).length === 4);
check('homepage promotes the two software products', index.includes('Highway 38 Quote Builder') && index.includes('Highway 38 Business System') && index.includes('Software for small business'));
check('prohibited quantitative CNC claim removed', !/(?:25,000\+|25,000\s+(?:CNC\s+)?programs?)/i.test(index));
check('homepage contains no personal owner attribution', !/Rick\s+Krueth/i.test(index));

check('request flow uses secure direct submission as primary action', /id="request-submit"[^>]*>Submit Request<\/button>/.test(request) && /data-intake-endpoint=/.test(request));
check('request flow keeps email as fallback only', /id="email-summary" hidden>Email fallback/.test(request) && requestClient.includes('emailFallback'));
check('request flow saves progress and returns confirmation number', requestClient.includes('H38Platform.saveDraft') && requestClient.includes('Request received') && requestClient.includes('requestId'));
check('secure intake creates internal owner-review record only', /function doPost\(event\)/.test(intake) && /Owner Approval Required/.test(intake) && /External actions remain locked/.test(intake) && !/sendEmail|GmailApp|MailApp/.test(intake));
check('secure intake has schema-independent duplicate protection', /H38_PUBLIC_INTAKE_/.test(intake) && /PropertiesService\.getScriptProperties/.test(intake) && /DUPLICATE_ACCEPTED/.test(intake));

check('catalog contains 15 products', catalog && catalog.products.length === 15, catalog ? String(catalog.products.length) : 'missing catalog');
check('catalog contains 9 bundles', catalog && catalog.bundles.length === 9, catalog ? String(catalog.bundles.length) : 'missing catalog');
check('products page renders catalog products and bundles', products.includes('data-product-details') && products.includes('data-bundles'));
check('Sample Library contains all product samples', samples.includes('data-samples="all"'));
check('Sample Library contains bundle proof', samples.includes('data-bundles'));
check('Sample Library Owner Portal link is clean', samples.includes('href="portal.html">Owner Portal'));

check('Owner Portal is an automatic gateway to one secure app', /location\.replace\(target\)/.test(portal) && /Opening Highway 38 Business System/.test(portal));
check('Owner Portal contains no obsolete six-button workspace row', !/owner-area-strip|Tasks &amp; Decisions|Quotes, Money &amp; Reports/.test(portal));
check('Owner Portal contains no public private-app iframe', !/<iframe\b/i.test(portal));
check('secure app contains no nested Business Office iframe', !/<iframe\b|businessWorkspace|businessFrame/.test(portalIndex));
check('secure app includes native Business Office client and styles', /Portal_Business_Client/.test(portalIndex) && /Portal_Business_Styles/.test(portalIndex));
check('secure app navigation is package controlled', /h38PortalUnifiedBootstrap/.test(portalUnified) && /H38_UNIFIED/.test(portalShell));
check('secure app declares native Business Office rendering', /nativeBusinessOffice:\s*true/.test(portalUnified));
check('Business Office links render directly and safely in the main app', /await\s+(?:uxInvokeBusinessModule|renderBusinessModule)\(module/.test(portalShell) && /typeof renderBusinessModule!==['"]function['"]/.test(portalShell) && /uxWorkspaceHasContent/.test(portalShell) && /uxRenderWorkspaceFailure/.test(portalShell) && /function renderBusinessModule/.test(portalBusinessClient));
check('native Business Office supports list open edit save and upload', ['h38PortalBusinessModule','h38PortalBusinessWorkspace','h38PortalBusinessSave','h38PortalBusinessUpload'].every(name => portalBusinessServer.includes(`function ${name}`)) && ['openBusinessRecord','openBusinessRecordForm','openBusinessUpload'].every(name => portalBusinessClient.includes(`function ${name}`)));
check('Business Office modules are enforced server-side', /boGuardApiRequest_\(action,args\)/.test(businessWeb) && /MODULE NOT INCLUDED/.test(businessGate));
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
check('Highway 38 Business Office uses manifest-controlled approved logo URL', businessOfficeConfig.branding.logoUrl === approvedLogoUrl, businessOfficeConfig.branding.logoUrl || 'blank');
check('Highway 38 Business Office colors remain approved', businessOfficeConfig.branding.primaryColor === '#173a5e' && businessOfficeConfig.branding.secondaryColor === '#326a9e');
check('Highway 38 package is configured as one complete app', businessOfficeConfig.package && businessOfficeConfig.package.singleApp === true && businessOfficeConfig.package.id === 'complete-business-system');

check('dashboard excludes controlled test records', dashboard.includes('boDashboardIsControlledTest_') && dashboard.includes("text.indexOf('CONTROLLED TEST')"));
check('dashboard includes revenue, cost, and profit metrics', dashboard.includes("'Active-job revenue'") && dashboard.includes("'Active-job cost'") && dashboard.includes("'Active-job profit'"));
check('dashboard includes payroll and tax preparation metrics', dashboard.includes("'Payroll preparation'") && dashboard.includes("'Tax preparation'"));
check('dashboard includes documents and approvals metrics', dashboard.includes("'Documents needing review'") && dashboard.includes("'Pending owner approvals'"));

check('current URL plan documents portal gateway', urlPlan.includes('/portal.html'));
check('custom-domain actions remain approval gated', /Do not change DNS[\s\S]*without owner approval/i.test(urlPlan));
check('legacy portal is explicitly preserved', /No component is approved for deletion/i.test(legacyPlan));
check('legacy technical source remains present', exists('apps-script/core-engine/owner-portal-next/RUNTIME_TEST_RUNBOOK.md'));

const result = { status: failures.length ? 'HOLD' : 'PASS', sourceCommit: process.env.GITHUB_SHA || '', passed: passes.length, failed: failures.length, passes, failures };
const outputDir = path.join(root, 'artifacts', 'final-polish');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
process.exit(failures.length ? 1 : 0);
