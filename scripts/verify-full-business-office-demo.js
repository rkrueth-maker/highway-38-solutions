#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const failures = [];

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function check(name, condition) { if (!condition) failures.push(name); }
function hasAll(source, markers) { return markers.every(marker => source.includes(marker)); }
function parse(name, source) {
  try { new Function(source); }
  catch (error) { failures.push(`${name} syntax: ${error.message}`); }
}

const demo = read('apps-script/business-office/BusinessOffice_FullApprovedDemo.gs');
const phases = read('apps-script/business-office/BusinessOffice_FullApprovedDemo_V2.gs');
const workflow = read('.github/workflows/run-full-business-office-demo-authorized.yml');
const authorizedHarness = read('scripts/business-office-authorized-harness.sh');
const patcher = read('scripts/patch-full-business-office-demo-harness.py');
const orchestration = read('apps-script/business-office/BusinessOffice_AI_AgentOrchestration.gs');
const actions = read('apps-script/business-office/BusinessOffice_AI_Actions.gs');

parse('BusinessOffice_FullApprovedDemo.gs', demo);
parse('BusinessOffice_FullApprovedDemo_V2.gs', phases);

check('exact controlled addresses', hasAll(demo, [
  "H38_FULL_DEMO_OWNER_EMAIL = 'rkrueth@gmail.com'",
  "H38_FULL_DEMO_BUSINESS_EMAIL = 'highway38solutions@gmail.com'"
]));
check('seven existing hypotheticals', hasAll(demo + phases, [
  'boSeedUnifiedSevenDemoSystem()',
  "boFullDemoProjectContext_('DECK')",
  "boFullDemoProjectContext_('IRR')",
  "boFullDemoProjectContext_('KIT')",
  "boFullDemoProjectContext_('FLOWER')"
]));
check('all eight agents', [
  'intake_requirements','quote_architect','measurement_quantity','pricing_costing',
  'scope_instruction','drawing','quote_review','business_setup'
].every(key => phases.includes(`key: '${key}'`)));
check('resumable phases', hasAll(phases, [
  'function boPrepareFullApprovedBusinessOfficeDemo()',
  'function boRunFullApprovedBusinessOfficeDemoAgentBatch(',
  'function boRunFullApprovedBusinessOfficeDemoEmailBatch(',
  'function boFinalizeFullApprovedBusinessOfficeDemo()',
  'function boGetFullApprovedBusinessOfficeDemoStatus()'
]));
check('owner-only execution', hasAll(demo + phases, ['boRequireOwner_()', 'authorized only for Rick Krueth']));
check('actual intake email linkage', hasAll(demo, ['GmailApp.search', 'Email Thread ID', 'Email Message ID', 'H38_FULL_DEMO_INTAKE_SUBJECT']));
check('approved action engine email path', hasAll(demo, [
  "actionId: 'email.send'",
  'boAiPrepareAction_',
  'boAiConfirmAction_',
  'prepared.confirmation'
]));
check('duplicate locks', hasAll(demo + phases, [
  "H38_FULL_DEMO_MARKER + '-COMPLETE'",
  "H38_FULL_DEMO_MARKER + '-EMAIL-'",
  'duplicatePrevented: true'
]));
check('owner takeover approval remains bounded', hasAll(phases, [
  'function boFullDemoApproveTakeover_',
  'Internal demonstration only; no external commitment.',
  'H38 DEMO TAKEOVER APPROVED'
]));
check('eight approved emails', hasAll(phases, [
  'boUnifiedDemoProjects_().map(boFullDemoProjectEmailSpec_)',
  "suffix: 'OWNER-SUMMARY'",
  'boAssert_(emailCount === 8'
]));
check('protected boundaries', hasAll(demo + phases, [
  'financialExternalActions: false',
  'moneyMoved: false',
  'payrollFunded: false',
  'taxesFiled: false',
  'supplierOrdersTransmitted: false',
  'publicPublishingPerformed: false'
]));
check('orchestration support exists', hasAll(orchestration, ['function boAiRunSpecialist_', 'function boAiAgentCatalog_']));
check('approval action support exists', hasAll(actions, ["'email.send'", 'function boAiPrepareAction_', 'function boAiConfirmAction_']));
check('established authorized harness remains source', hasAll(authorizedHarness, [
  'run_harness_function()',
  'boBootstrapInstall',
  'OWNER_HARNESS',
  'OWNER_RESTORE'
]));
check('patcher removes pulled duplicate Business Office source', hasAll(patcher, [
  "-name 'BusinessOffice_*.js'",
  "-name 'BusinessOffice_*.gs'",
  "-name 'BusinessOffice_*.html'",
  'cp "$REPO_ROOT"/apps-script/business-office/*.gs',
  'cp "$REPO_ROOT"/apps-script/business-office/*.html'
]));
check('patcher renames Business Office doGet', hasAll(patcher, [
  're.subn',
  'function boHarnessDoGet_(',
  'Business Office doGet rename failed.'
]));
check('patcher runs phased demo', hasAll(patcher, [
  'boPrepareFullApprovedBusinessOfficeDemo',
  'boRunFullApprovedBusinessOfficeDemoAgentBatch',
  'boRunFullApprovedBusinessOfficeDemoEmailBatch',
  'boFinalizeFullApprovedBusinessOfficeDemo'
]));
check('patcher checks exact results', hasAll(patcher, [
  "r.projectCount!==7",
  "r.agentCount!==8",
  "r.approvedEmailCount!==8",
  'rkrueth@gmail.com',
  'highway38solutions@gmail.com'
]));
check('patcher restores authorized source', hasAll(patcher, [
  'Restore the authorized Owner Portal development source immediately after the demo.',
  'OWNER_RESTORE',
  'BusinessOffice_Sync.js',
  'test "$BEFORE_LINE" = "$AFTER_LINE"'
]));
check('post-deployment workflow', hasAll(workflow, [
  'workflow_run:',
  'Deploy Unified Owner Portal',
  'scripts/business-office-authorized-harness.sh',
  'scripts/patch-full-business-office-demo-harness.py',
  'bash -n "$HARNESS"',
  'full-business-office-demo-${{ github.run_id }}'
]));
check('shared authorized concurrency lock', workflow.includes('group: highway-38-business-office-authorized-acceptance'));
check('complete harness log captured', workflow.includes('artifacts/full-business-office-demo/harness.log'));
check('workflow preserves no-public-publish boundary', workflow.includes('nothing was publicly published'));

if (failures.length) {
  console.error('Full Business Office demo verification failed:');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log('PASS — Deterministic resumable full approved Business Office demo contract is complete and bounded.');
