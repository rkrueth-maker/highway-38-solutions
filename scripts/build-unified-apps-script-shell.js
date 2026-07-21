#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(process.argv[2] || '');
const repoRoot = path.resolve(process.argv[3] || path.join(__dirname, '..'));
const shellSource = path.join(repoRoot, 'apps-script', 'unified-shell', 'Unified_AppShell.gs');
const intakeSource = path.join(repoRoot, 'apps-script', 'unified-shell', 'Unified_PublicIntake.gs');
const portalServices = path.join(projectDir, 'Portal_Services.js');
const businessWeb = path.join(projectDir, 'BusinessOffice_Web.gs');
const legacyPortalBridge = path.join(projectDir, 'Portal_00_BusinessAuth.js');
const shellTarget = path.join(projectDir, 'Unified_AppShell.gs');
const intakeTarget = path.join(projectDir, 'Unified_PublicIntake.gs');
const evidenceDir = path.join(repoRoot, 'artifacts', 'unified-shell');

function fail(message) { throw new Error(`Unified shell assembly failed: ${message}`); }
function readRequired(file) { if (!fs.existsSync(file)) fail(`missing required source ${file}`); return fs.readFileSync(file, 'utf8'); }
function replaceOnce(source, pattern, replacement, label) { const matches = source.match(pattern); if (!matches || matches.length !== 1) fail(`${label} marker was not found exactly once`); return source.replace(pattern, replacement); }

if (!projectDir || projectDir === path.parse(projectDir).root) fail('a project directory is required');
fs.mkdirSync(evidenceDir, { recursive: true });

let portalSource = readRequired(portalServices);
portalSource = replaceOnce(portalSource,/function\s+doGet\(e\)\s*\{\s*h38PortalRequireUnifiedUser_\(\);\s*return\s+HtmlService\.createTemplateFromFile\('Portal_Index'\)\.evaluate\(\)\.setTitle\(H38_PORTAL_NEXT\.APP_NAME\)\.setSandboxMode\(HtmlService\.SandboxMode\.IFRAME\);\s*\}/,"function h38PortalStandaloneDoGet_(e) {\n  h38PortalRequireUnifiedUser_();\n  return HtmlService.createTemplateFromFile('Portal_Index').evaluate().setTitle(H38_PORTAL_NEXT.APP_NAME).setSandboxMode(HtmlService.SandboxMode.IFRAME);\n}",'Owner Portal standalone entry');
fs.writeFileSync(portalServices, portalSource);

let businessSource = readRequired(businessWeb);
businessSource = replaceOnce(businessSource,/function\s+doGet\(event\)\s*\{/,'function boBusinessOfficeStandaloneDoGet_(event) {','Business Office standalone entry');
fs.writeFileSync(businessWeb, businessSource);

if (fs.existsSync(legacyPortalBridge)) fs.unlinkSync(legacyPortalBridge);
fs.copyFileSync(shellSource, shellTarget);
fs.copyFileSync(intakeSource, intakeTarget);
let combinedShell=readRequired(shellTarget);
combinedShell=replaceOnce(combinedShell,/function doGet\(event\)\{\n  H38_PORTAL_AUTH_BRIDGE\.getCurrentUser\(\);/,"function doGet(event){\n  var proposalToken=h38UnifiedShellParameter_(event,'proposal');\n  if(proposalToken){\n    if(typeof boRenderCustomerProposal_!=='function')throw new Error('Customer proposal renderer is unavailable.');\n    return boRenderCustomerProposal_(proposalToken);\n  }\n  H38_PORTAL_AUTH_BRIDGE.getCurrentUser();",'public proposal route');
fs.writeFileSync(shellTarget,combinedShell);

const controlledFiles = fs.readdirSync(projectDir).filter(name => /\.(?:gs|js)$/i.test(name)).sort();
const entryPoints = [];
for (const name of controlledFiles) { const source = fs.readFileSync(path.join(projectDir, name), 'utf8'); const count = (source.match(/\bfunction\s+doGet\s*\(/g) || []).length; for (let index = 0; index < count; index += 1) entryPoints.push(name); }
if (entryPoints.length !== 1 || entryPoints[0] !== 'Unified_AppShell.gs') fail(`expected exactly one combined doGet in Unified_AppShell.gs; found ${entryPoints.join(', ') || 'none'}`);

const shell = readRequired(shellTarget);
const intake = readRequired(intakeTarget);
const requiredMarkers = ['var H38_PORTAL_AUTH_BRIDGE = (function(){','function h38UnifiedShellCapabilityOwner_','function h38UnifiedShellRegistry','function h38UnifiedShellBootstrap','function h38UnifiedShellRenderQuoteBuilder_','function doGet(event)',"h38UnifiedShellParameter_(event,'proposal')",'boRenderCustomerProposal_'];
for (const marker of requiredMarkers) if (!shell.includes(marker)) fail(`shell marker missing: ${marker}`);
if (!intake.includes('function doPost(event)') || !intake.includes('Owner Approval Required') || !intake.includes('h38-public-intake')) fail('public intake contract is incomplete');
if (/globalThis|boNormalizeText_|boAssert_|boReadTable_/.test(shell)) fail('the unified shell entry/auth path contains a prohibited cross-file helper dependency');
if (fs.existsSync(legacyPortalBridge)) fail('legacy Portal authentication bridge remained in the combined project');

const result = {status:'PASS',sourceCommit:process.env.GITHUB_SHA||'',projectDir,shell:'Unified_AppShell.gs',publicIntake:'Unified_PublicIntake.gs',entryPoints,legacyPortalBridgeRemoved:true,standaloneEntriesRenamed:{ownerPortal:'h38PortalStandaloneDoGet_',businessOffice:'boBusinessOfficeStandaloneDoGet_'},capabilityOwner:{quotes:'quoteBuilder when enabled; legacyQuotes otherwise'},customerProposalRoute:'public token validated by commercial proposal engine',publicIntakeRoute:'validated request record only; no automatic external action',externalActionsEnabled:false};
fs.writeFileSync(path.join(evidenceDir, 'assembly.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
