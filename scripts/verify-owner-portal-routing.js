#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const failures = [];
const passes = [];
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (name, condition, evidence = '') => {
  (condition ? passes : failures).push({ name, evidence });
  console[condition ? 'log' : 'error'](`${condition ? 'PASS' : 'FAIL'}: ${name}${evidence ? ` — ${evidence}` : ''}`);
};

const portal = read('portal.html');
const brand = read('brand-global.js');
const portalIndex = read('apps-script/core-engine/owner-portal-next/Portal_Index.html');
const portalRawIncludes = read('apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js');
const unifiedServer = read('apps-script/core-engine/owner-portal-next/Portal_Unified.js');
const unifiedShell = read('apps-script/core-engine/owner-portal-next/Portal_UX_Client_Shell.html');
const unifiedAppShell = read('apps-script/unified-shell/Unified_AppShell.gs');
const nativeBusinessServer = read('apps-script/core-engine/owner-portal-next/Portal_Business.js');
const portalAuthBridge = read('apps-script/core-engine/owner-portal-next/Portal_00_BusinessAuth.js');
const nativeBusinessClient = read('apps-script/core-engine/owner-portal-next/Portal_Business_Client.html');
const businessUi = read('apps-script/business-office/BusinessOffice_Index.html');
const businessCore = read('apps-script/business-office/BusinessOffice_Core.gs');
const businessAuth = read('apps-script/business-office/BusinessOffice_Auth.gs');
const businessWeb = read('apps-script/business-office/BusinessOffice_Web.gs');
const businessGate = read('apps-script/business-office/BusinessOffice_ModuleAccess.gs');
const businessUnified = read('apps-script/business-office/BusinessOffice_Unified_Client.html');
const pack = read('business-packs/highway38/apps-script/BusinessOffice_Pack.gs');
const deploySource = read('scripts/deploy-unified-owner-portal-web.sh');
const shellBuilder = read('scripts/build-unified-apps-script-shell.js');

const ownerAppUrl = 'https://script.google.com/macros/s/AKfycbzr0hoImRF4iQ1gR90Cr17juP8PODkEWRorXxW6qralEYTGLhOU33E1wYEPU_3duQKpQg/exec';
const representativeBusinessRoutes = [
  ['bo:requests', 'New Requests'],
  ['bo:customers', 'Customers'],
  ['bo:quotes', 'Quotes'],
  ['bo:workOrders', 'Work Orders'],
  ['bo:jobs', 'Jobs'],
  ['bo:invoices', 'Invoices'],
  ['bo:payments', 'Payments'],
  ['bo:expenses', 'Expenses'],
  ['bo:documents', 'Documents / OCR / Upload'],
  ['bo:approvals', 'Approval Queue'],
  ['bo:reports', 'Financial Reports'],
  ['bo:setup', 'Product Controls']
];
const rawFragmentNames = [...portalIndex.matchAll(/h38PortalRawInclude_\('([^']+)'\)/g)].map(match => match[1]);
const missingRawAllowlistEntries = rawFragmentNames.filter(name => !portalRawIncludes.includes(`'${name}'`));

assert('website Owner Portal page exists', /<title>Owner Portal \| Highway 38 Solutions<\/title>/.test(portal));
assert('public portal is one automatic secure gateway', portal.includes(`var secure='${ownerAppUrl}'`) && /location\.replace\(target\)/.test(portal));
assert('public portal contains no obsolete workspace tabs', !/owner-tabs|owner-area-strip|Operations &amp; Social|Open Business Office/.test(portal));
assert('public portal contains no private application iframe', !/<iframe\b/i.test(portal));
assert('public portal preserves upload and business-office deep links', /upload:'documents'/.test(portal) && /'business-office':'requests'/.test(portal));
assert('portal contains no spreadsheet destination', !/docs\.google\.com\/spreadsheets/i.test(portal));

assert('secure app contains no nested Business Office iframe', !/businessWorkspace|businessFrame|<iframe\b/i.test(portalIndex));
assert('secure app includes native Business Office styles and client', /Portal_Business_Styles/.test(portalIndex) && /Portal_Business_Client/.test(portalIndex));
assert('every secure app raw fragment is allowlisted', rawFragmentNames.length > 0 && missingRawAllowlistEntries.length === 0, missingRawAllowlistEntries.length ? missingRawAllowlistEntries.join(', ') : `${rawFragmentNames.length} fragments`);
assert('native Business Office raw fragments are explicitly allowlisted', portalRawIncludes.includes("'Portal_Business_Styles'") && portalRawIncludes.includes("'Portal_Business_Client'"));
assert('secure app uses one package-controlled manifest', /function h38PortalUnifiedBootstrap\(\)/.test(unifiedServer) && /packageName/.test(unifiedServer));
assert('unified manifest declares native Business Office rendering', /nativeBusinessOffice:\s*true/.test(unifiedServer) && /businessDefinitions/.test(unifiedServer));
assert('unified manifest covers command, sales, work, money, people, documents, growth, and control', ['command','sales','work','money','people','documents','growth','control'].every(id => unifiedServer.includes(`id: '${id}'`)));
assert('representative enabled Business Office routes are present in the unified navigation', representativeBusinessRoutes.every(([key,label]) => unifiedServer.includes(`h38PortalUnifiedItem_('${key}', '${label}'`)), representativeBusinessRoutes.map(([key]) => key).join(', '));
assert('unified shell renders package groups instead of separate applications', /H38_UNIFIED/.test(unifiedShell) && /uxShowBusinessModule/.test(unifiedShell));
assert('unified shell routes Business Office links to guarded direct native rendering', /await\s+(?:uxInvokeBusinessModule|renderBusinessModule)\(module/.test(unifiedShell) && /typeof renderBusinessModule!==['"]function['"]/.test(unifiedShell) && !/frame\.src|postMessage\(\{type:'h38-open-business-module'/.test(unifiedShell));
assert('unified shell sets active route hash and visible loading state before rendering', /history\.replaceState\(null,'','#module='\+encodeURIComponent\(hashModule\)\)/.test(unifiedShell) && /data-h38-workspace-state="loading"/.test(unifiedShell));
assert('unified shell prevents blank workspaces on route failures', /uxWorkspaceHasContent/.test(unifiedShell) && /uxRenderWorkspaceFailure/.test(unifiedShell) && /selected route completed without rendering content/.test(unifiedShell));
assert('native Business Office server adapter lists saves opens and uploads records', ['h38PortalBusinessModule','h38PortalBusinessSave','h38PortalBusinessWorkspace','h38PortalBusinessUpload'].every(name => nativeBusinessServer.includes(`function ${name}`)));
assert('native Business Office client renders tables cards details forms and upload', ['boNativeRenderTable','openBusinessRecord','openBusinessRecordForm','openBusinessUpload'].every(name => nativeBusinessClient.includes(`function ${name}`)));
assert('native Business Office client supports direct back-and-forth module switching', /renderBusinessModule/.test(nativeBusinessClient) && /history\.replaceState/.test(nativeBusinessClient));
assert('native Business Office client renders explicit empty and owner-safe failure states', /No .* yet\./.test(nativeBusinessClient) && /ownerSafeFailure/.test(nativeBusinessClient));

assert('Business Office authentication defines the unified user guard', /function boGetCurrentUser_\(\)/.test(businessAuth) && /function boGetActiveEmail_\(\)/.test(businessAuth));
assert('standalone Portal auth bridge publishes guarded fallback functions', /global\.boGetCurrentUser_ = function/.test(portalAuthBridge) && /global\.boGetRole_ = function/.test(portalAuthBridge));
assert('combined shell owns self-contained authentication without Business Office helper dependencies', /var H38_PORTAL_AUTH_BRIDGE = \(function\(\)\{/.test(unifiedAppShell) && !/globalThis|boNormalizeText_|boReadTable_|boAssert_/.test(unifiedAppShell));
assert('combined shell owns route and capability selection', /function h38UnifiedShellCapabilityOwner_/.test(unifiedAppShell) && /function doGet\(event\)/.test(unifiedAppShell));
assert('native adapter resolves canonical auth functions explicitly', /function h38PortalResolveAuthFunction_/.test(nativeBusinessServer) && /function h38PortalGetCurrentUser_/.test(nativeBusinessServer));
assert('native adapter does not depend on a bare current-user call', !/var user = boGetCurrentUser_\(\)/.test(nativeBusinessServer) && /var user = h38PortalGetCurrentUser_\(\)/.test(nativeBusinessServer));
assert('Business Office package modules are enforced server-side', /boGuardApiRequest_\(action,args\)/.test(businessWeb) && /MODULE NOT INCLUDED/.test(businessGate));
assert('native adapter enforces package modules before list save workspace and upload', /boAssertModuleEnabled_\(moduleKey\)/.test(nativeBusinessServer) && /boAssertModuleEnabled_\('documents'\)/.test(nativeBusinessServer));
assert('Business Office compatibility route remains available without controlling unified navigation', /BusinessOffice_Unified_Client/.test(businessWeb) && /h38-embedded-business-office/.test(businessUnified));
assert('Documents and OCR keep upload inside the unified app', /Upload PDF \/ Take Picture/.test(nativeBusinessClient) && /capture="environment"/.test(nativeBusinessClient));
assert('complete package explicitly enables command and Business Office modules', /package:Object\.freeze\(\{id:'complete-business-system'/.test(pack) && /commandCenter:true/.test(pack) && /documents:true/.test(pack));
assert('production deployment replaces inherited clasp ignore rules', /cat > "\$PROJECT\/\.claspignore"/.test(deploySource) && /\*\*\/\*\.md/.test(deploySource));
assert('production deployment builds the checked-in unified shell before push', /build-unified-apps-script-shell\.js/.test(deploySource) && /Unified_AppShell\.gs/.test(deploySource) && /Portal_Business\.js/.test(deploySource) && /BusinessOffice_Auth\.gs/.test(deploySource));
assert('production deployment uses clasp 3 file status and force push', /clasp show-file-status/.test(deploySource) && /clasp push --force/.test(deploySource) && /clasp-status-before-push\.txt/.test(deploySource));
assert('production deployment pulls and verifies remote Apps Script source before deployment update', /REMOTE_VERIFY/.test(deploySource) && /remote-project-pull\.txt/.test(deploySource) && /remote-source-verification\.txt/.test(deploySource) && /REMOTE_SHELL/.test(deploySource));
assert('production deployment verifies one deterministic shell entry point on Google', /Remote project must contain one unified doGet/.test(deploySource) && /var H38_PORTAL_AUTH_BRIDGE = \(function\(\)\{/.test(deploySource));
assert('production deployment removes the legacy combined Portal auth bridge', /test ! -e "\$PROJECT\/Portal_00_BusinessAuth\.js"/.test(deploySource) && /fs\.unlinkSync\(legacyPortalBridge\)/.test(shellBuilder));
assert('production deployment blocks known authentication runtime errors', /ReferenceError: boGetCurrentUser_ is not defined/.test(deploySource) && /ReferenceError: boNormalizeText_ is not defined/.test(deploySource) && /Authentication service is unavailable: boGetCurrentUser_/.test(deploySource));

assert('legacy Owner Login links are routed to portal.html', /link\.href='portal\.html'/.test(brand));
assert('legacy Owner Login rewrite removes new-window behavior', /link\.removeAttribute\('target'\)/.test(brand));
assert('Business Office dashboard uses calculated owner metrics', /return boGetOwnerDashboard_\(\);/.test(businessCore));
assert('Business Office core does not generate spreadsheet card URLs', !/Open Records URL|spreadsheet\.getUrl\(\)\s*\+\s*['"]#gid=/i.test(businessCore));
assert('dashboard contains no Open source records action', !/Open source records/i.test(businessUi));
assert('retained spreadsheet links are explicitly administrative', /Administrative spreadsheet/.test(businessUi));
assert('administrative spreadsheet link requires confirmation', /Open the administrative spreadsheet outside the Owner Portal\?/.test(businessUi));
assert('Business Office web app does not redirect to spreadsheet', !/docs\.google\.com\/spreadsheets|SpreadsheetApp\.getActiveSpreadsheet\(\)\.getUrl\(\)/i.test(businessWeb));

const rootHtmlFiles = fs.readdirSync(root).filter(name => name.endsWith('.html'));
const ownerLinks = [];
const badOwnerLinks = [];
const sheetLinks = [];
for (const file of rootHtmlFiles) {
  const html = read(file);
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const match of anchors) {
    const href = match[1];
    const label = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/owner\s+(login|portal)/i.test(label) && !href.startsWith('#')) {
      ownerLinks.push({ file, href, label });
      if (!/(^|\/)portal\.html(?:[?#].*)?$/.test(href)) badOwnerLinks.push({ file, href, label });
    }
    if (/docs\.google\.com\/spreadsheets/i.test(href)) sheetLinks.push({ file, href, label });
  }
}
assert('all static Owner Login and Owner Portal links target portal.html', badOwnerLinks.length === 0, badOwnerLinks.length ? JSON.stringify(badOwnerLinks) : `${ownerLinks.length} inspected`);
assert('public static pages contain no direct spreadsheet links', sheetLinks.length === 0, sheetLinks.length ? JSON.stringify(sheetLinks) : `${rootHtmlFiles.length} HTML files inspected`);

const result = {
  status: failures.length ? 'HOLD' : 'PASS',
  sourceCommit: process.env.GITHUB_SHA || '',
  inspected: { rootHtmlFiles: rootHtmlFiles.length, ownerLinks: ownerLinks.length, rawFragments: rawFragmentNames, representativeBusinessRoutes: representativeBusinessRoutes.map(([key,label]) => ({key,label})), publicPrivateFrames: (portal.match(/<iframe\b/g) || []).length, secureNestedFrames: (portalIndex.match(/<iframe\b/g) || []).length, unifiedApp: true, nativeBusinessOffice: true, deploymentRemoteSourceVerification: true, deterministicUnifiedShell: true },
  passes,
  failures
};
const outDir = path.join(root, 'artifacts', 'owner-portal-routing');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`\nRESULT: ${result.status} (${passes.length} pass, ${failures.length} fail)`);
process.exit(failures.length ? 1 : 0);
