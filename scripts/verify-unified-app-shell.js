#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const failures = [];
const passes = [];
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (name, condition, evidence = '') => {
  (condition ? passes : failures).push({ name, evidence });
  console[condition ? 'log' : 'error'](`${condition ? 'PASS' : 'FAIL'}: ${name}${evidence ? ` — ${evidence}` : ''}`);
};

const shell = read('apps-script/unified-shell/Unified_AppShell.gs');
const portalManifest = read('apps-script/core-engine/owner-portal-next/Portal_Unified.js');
const builder = read('scripts/build-unified-apps-script-shell.js');
const deploy = read('scripts/deploy-unified-owner-portal-web.sh');
const pack = read('business-packs/highway38/apps-script/BusinessOffice_Pack.gs');

assert('checked-in shell owns the combined doGet', /function doGet\(event\)/.test(shell));
assert('shell owns self-contained authentication', /var H38_PORTAL_AUTH_BRIDGE = \(function\(\)\{/.test(shell));
assert('shell avoids cross-file auth helper dependencies', !/globalThis|boNormalizeText_|boAssert_|boReadTable_/.test(shell));
assert('shell publishes module and capability registry', /function h38UnifiedShellRegistry/.test(shell) && /function h38UnifiedShellCapabilityOwner_/.test(shell));
assert('Quote Builder owns quotes when installed', /modules\.quoteBuilder===true && modules\.quotes!==false \? 'quoteBuilder' : 'legacyQuotes'/.test(shell));
assert('server manifest consumes shell capability ownership', /h38UnifiedShellRegistry/.test(portalManifest) && /h38UnifiedShellCapabilityOwner_/.test(portalManifest));
assert('server manifest labels the installed quote owner before browser rendering', /owner === 'quoteBuilder' \? 'Quote Builder' : 'Quotes'/.test(portalManifest));
assert('server manifest publishes disabled legacy capability state', /disabledLegacyCapabilities/.test(portalManifest) && /capabilityOwners:\{quotes:quoteCapabilityOwner\}/.test(portalManifest));
assert('external actions remain disabled', /EXTERNAL_ACTIONS_ENABLED:false/.test(shell) && /externalActionsEnabled:false/.test(shell));
assert('builder renames both standalone entries', /h38PortalStandaloneDoGet_/.test(builder) && /boBusinessOfficeStandaloneDoGet_/.test(builder));
assert('builder removes the legacy Portal auth bridge', /fs\.unlinkSync\(legacyPortalBridge\)/.test(builder));
assert('builder requires one shell entry point', /entryPoints\.length !== 1/.test(builder) && /Unified_AppShell\.gs/.test(builder));
assert('deployment invokes deterministic shell builder', /build-unified-apps-script-shell\.js/.test(deploy));
assert('deployment no longer contains inline Python routing patch', !/python3 - .*Portal_Services/.test(deploy));
assert('deployment verifies one remote entry point', /Remote project must contain one unified doGet/.test(deploy));
assert('deployment verifies live auth failures are absent', /boNormalizeText_ is not defined/.test(deploy) && /boGetCurrentUser_ is not defined/.test(deploy));
assert('Highway 38 pack enables Quote Builder', /quoteBuilder:true/.test(pack) && /quotes:true/.test(pack));

function makeRuntime(quoteBuilderEnabled) {
  const tables = {
    'BO Users': [
      ['User ID','Business ID','Email','Display Name','Role ID','Status','Payroll Access','Tax Access','Posting Access','Customer Send Access','Export Access','User Access Admin'],
      ['USER-1','TEST','owner@example.com','Owner','ROLE-OWNER','Active','Yes','Yes','Yes','Yes','Yes','Yes']
    ],
    'BO Roles': [
      ['Role ID','Business ID','Role Name','Active'],
      ['ROLE-OWNER','TEST','Owner','Yes']
    ],
    'BO Permissions': [
      ['Permission ID','Business ID','Role ID','Module','View','Create','Edit','Void'],
      ['PERM-1','TEST','ROLE-OWNER','All Modules','Yes','Yes','Yes','Yes']
    ]
  };
  const scriptValues = {
    H38_BUSINESS_OFFICE_SPREADSHEET_ID:'SHEET-1',
    H38_BUSINESS_OFFICE_DEFAULT_BUSINESS_ID:'TEST'
  };
  const modules = {quotes:true,quoteBuilder:quoteBuilderEnabled};
  const context = {
    console,
    BO_EMBEDDED_BUSINESS_PACK:{
      schemaVersion:1,
      packId:'test-pack',
      package:{id:'complete-business-system',name:'Complete Business System'},
      business:{id:'TEST',publicName:'Test Business',legalName:'Test Business LLC',timeZone:'UTC'},
      branding:{},urls:{},
      modules,
      workflow:{externalActionsEnabled:false,approvalNotice:'Approval required.'},
      boundaries:{directPaymentProcessing:false,directPayrollFunding:false,directTaxFiling:false},
      storage:{propertyKeys:{spreadsheetId:'H38_BUSINESS_OFFICE_SPREADSHEET_ID',businessId:'H38_BUSINESS_OFFICE_DEFAULT_BUSINESS_ID'}},
      deployment:{mode:'combined'}
    },
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>scriptValues[key] || ''})},
    Session:{getActiveUser:()=>({getEmail:()=> 'owner@example.com'})},
    SpreadsheetApp:{openById:()=>({getSheetByName:name=>tables[name] ? {getDataRange:()=>({getDisplayValues:()=>tables[name]})} : null})},
    HtmlService:{
      SandboxMode:{IFRAME:'IFRAME'},
      XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},
      createTemplateFromFile:name=>({evaluate:()=>({kind:name,setTitle(){return this;},setSandboxMode(){return this;},setXFrameOptionsMode(){return this;}})})
    },
    ScriptApp:{getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/TEST/exec'})},
    H38_PORTAL_NEXT:{APP_NAME:'Test Business System'},
    H38_APP_UX_VERSION_:'test-unified',
    boRenderWebApp_:()=>({kind:'business-office'}),
    boRenderQuoteBuilderApp_:()=>({kind:'quote-builder'}),
    boModuleEnabled_:key=>!Object.prototype.hasOwnProperty.call(modules,key) || modules[key] !== false,
    boPackValue_:(path,fallback)=>{
      if (path === 'package.id') return 'complete-business-system';
      if (path === 'package.name') return 'Complete Business System';
      if (path === 'packId') return 'test-pack';
      return fallback;
    },
    h38PortalRequireUnifiedUser_:()=>({
      user:{'User ID':'USER-1',Email:'owner@example.com','Display Name':'Owner','Role ID':'ROLE-OWNER'},
      role:'Owner',
      ownerMode:true
    }),
    h38PortalBusinessDefinitions_:()=>({quotes:{title:'Quotes'}}),
    h38PortalApplicationRoleCanView_:()=>true,
    h38TmEnsureSchema_:()=>true
  };
  vm.createContext(context);
  vm.runInContext(shell, context, { filename:'Unified_AppShell.gs' });
  vm.runInContext(portalManifest, context, { filename:'Portal_Unified.js' });
  return context;
}

function quoteNavigationItem(bootstrap) {
  const work = (bootstrap.groups || []).find(group => group.id === 'work');
  return work && (work.items || []).find(item => item.key === 'bo:quotes');
}

try {
  const enabled = makeRuntime(true);
  assert('runtime routes default request to Owner Portal', enabled.doGet({parameter:{}}).kind === 'Portal_Index');
  assert('runtime routes Business Office request to Business Office', enabled.doGet({parameter:{app:'business-office'}}).kind === 'business-office');
  assert('runtime routes quoteBuilder=1 to Quote Builder', enabled.doGet({parameter:{app:'business-office',quoteBuilder:'1'}}).kind === 'quote-builder');
  assert('runtime registry disables legacy quote capability', enabled.h38UnifiedShellRegistry().disabledLegacyCapabilities.quotes === true);
  assert('runtime reports Quote Builder as quote owner', enabled.h38UnifiedShellCapabilityOwner_('quotes') === 'quoteBuilder');
  assert('runtime preserves authenticated Owner role', enabled.h38UnifiedShellBootstrap().user.ownerMode === true);
  const enabledBootstrap = enabled.h38PortalUnifiedBootstrap();
  assert('server navigation labels installed quote capability Quote Builder', quoteNavigationItem(enabledBootstrap).label === 'Quote Builder');
  assert('server bootstrap reports Quote Builder capability ownership', enabledBootstrap.capabilityOwners.quotes === 'quoteBuilder');
  assert('server bootstrap disables the legacy quote capability', enabledBootstrap.disabledLegacyCapabilities.quotes === true);

  const disabled = makeRuntime(false);
  assert('runtime restores legacy quote owner when add-on is disabled', disabled.h38UnifiedShellCapabilityOwner_('quotes') === 'legacyQuotes');
  assert('disabled Quote Builder route falls back to Business Office', disabled.doGet({parameter:{quoteBuilder:'1'}}).kind === 'business-office');
  const disabledBootstrap = disabled.h38PortalUnifiedBootstrap();
  assert('server navigation restores Quotes label when add-on is disabled', quoteNavigationItem(disabledBootstrap).label === 'Quotes');
  assert('server bootstrap restores legacy quote ownership', disabledBootstrap.capabilityOwners.quotes === 'legacyQuotes');
  assert('server bootstrap clears legacy quote disable flag', disabledBootstrap.disabledLegacyCapabilities.quotes === false);
} catch (error) {
  assert('shell runtime simulation completes', false, error.stack || error.message);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'h38-unified-shell-'));
try {
  const project = path.join(tempRoot, 'project');
  fs.mkdirSync(project, { recursive:true });
  for (const name of fs.readdirSync(path.join(root, 'apps-script', 'core-engine', 'owner-portal-next'))) {
    if (/\.(?:js|html)$/i.test(name)) fs.copyFileSync(path.join(root, 'apps-script', 'core-engine', 'owner-portal-next', name), path.join(project, name));
  }
  execFileSync('bash', [
    path.join(root, 'scripts', 'assemble-business-office-app.sh'),
    project,
    path.join(root, 'business-packs', 'highway38', 'apps-script', 'BusinessOffice_Pack.gs'),
    root
  ], { stdio:'pipe' });
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build-unified-apps-script-shell.js'), project, root], { stdio:'pipe' });

  const sourceFiles = fs.readdirSync(project).filter(name => /\.(?:gs|js)$/i.test(name));
  const entries = [];
  for (const name of sourceFiles) {
    const source = fs.readFileSync(path.join(project, name), 'utf8');
    for (let index = 0; index < (source.match(/\bfunction\s+doGet\s*\(/g) || []).length; index += 1) entries.push(name);
  }
  assert('temporary combined assembly contains one entry point', entries.length === 1 && entries[0] === 'Unified_AppShell.gs', entries.join(', ') || 'none');
  assert('temporary combined assembly removes legacy auth bridge', !fs.existsSync(path.join(project, 'Portal_00_BusinessAuth.js')));
  assert('temporary combined assembly retains standalone logic under neutral names', /function h38PortalStandaloneDoGet_/.test(fs.readFileSync(path.join(project, 'Portal_Services.js'), 'utf8')) && /function boBusinessOfficeStandaloneDoGet_/.test(fs.readFileSync(path.join(project, 'BusinessOffice_Web.gs'), 'utf8')));
  assert('temporary combined assembly retains server capability ownership', /function h38PortalUnifiedQuoteItem_/.test(fs.readFileSync(path.join(project, 'Portal_Unified.js'), 'utf8')));
} catch (error) {
  assert('temporary combined assembly completes', false, error.stack || error.message);
} finally {
  fs.rmSync(tempRoot, { recursive:true, force:true });
}

const result = {
  status: failures.length ? 'HOLD' : 'PASS',
  sourceCommit: process.env.GITHUB_SHA || '',
  shellVersion:'3.0.0',
  passes,
  failures
};
const outDir = path.join(root, 'artifacts', 'unified-shell');
fs.mkdirSync(outDir, { recursive:true });
fs.writeFileSync(path.join(outDir, 'verification.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(`\nRESULT: ${result.status} (${passes.length} pass, ${failures.length} fail)`);
process.exit(failures.length ? 1 : 0);
