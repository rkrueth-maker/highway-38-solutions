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
const harness = read('scripts/run-full-business-office-demo-authorized.sh');
const workflow = read('.github/workflows/run-full-business-office-demo-authorized.yml');
const orchestration = read('apps-script/business-office/BusinessOffice_AI_AgentOrchestration.gs');
const actions = read('apps-script/business-office/BusinessOffice_AI_Actions.gs');

parse('BusinessOffice_FullApprovedDemo.gs', demo);

check('exact controlled addresses', hasAll(demo, [
  "H38_FULL_DEMO_OWNER_EMAIL = 'rkrueth@gmail.com'",
  "H38_FULL_DEMO_BUSINESS_EMAIL = 'highway38solutions@gmail.com'"
]));
check('seven existing hypotheticals', hasAll(demo, [
  'boSeedUnifiedSevenDemoSystem()',
  "boFullDemoProjectContext_('DECK')",
  "boFullDemoProjectContext_('IRR')",
  "boFullDemoProjectContext_('KIT')",
  "boFullDemoProjectContext_('FLOWER')"
]));
check('all eight agents', [
  'intake_requirements','quote_architect','measurement_quantity','pricing_costing',
  'scope_instruction','drawing','quote_review','business_setup'
].every(key => demo.includes(`boFullDemoRunAgent_('${key}'`)));
check('owner-only runner', hasAll(demo, ['boRequireOwner_()', 'authorized only for Rick Krueth']));
check('actual intake email linkage', hasAll(demo, ['GmailApp.search', 'Email Thread ID', 'Email Message ID', 'H38_FULL_DEMO_INTAKE_SUBJECT']));
check('approved action engine email path', hasAll(demo, [
  "actionId: 'email.send'",
  'boAiPrepareAction_',
  'boAiConfirmAction_',
  'prepared.confirmation'
]));
check('duplicate locks', hasAll(demo, [
  "H38_FULL_DEMO_MARKER + '-COMPLETE'",
  "H38_FULL_DEMO_MARKER + '-EMAIL-'",
  'duplicatePrevented: true'
]));
check('eight approved emails', hasAll(demo, [
  'seed.projects.forEach',
  "emails.push(boFullDemoSendApprovedEmail_('OWNER-SUMMARY'",
  'approvedEmailCount: emails.length'
]));
check('protected boundaries', hasAll(demo, [
  'financialExternalActions: false',
  'moneyMoved: false',
  'payrollFunded: false',
  'taxesFiled: false',
  'supplierOrdersTransmitted: false',
  'publicPublishingPerformed: false'
]));
check('orchestration support exists', hasAll(orchestration, ['function boAiRunSpecialist_', 'function boAiAgentCatalog_']));
check('approval action support exists', hasAll(actions, ["'email.send'", 'function boAiPrepareAction_', 'function boAiConfirmAction_']));
check('production execution harness', hasAll(harness, [
  'boRunFullApprovedBusinessOfficeDemo',
  'projectCount!==7',
  'agentCount!==8',
  'approvedEmailCount!==8',
  'rkrueth@gmail.com',
  'highway38solutions@gmail.com'
]));
check('post-deployment workflow', hasAll(workflow, [
  'workflow_run:',
  'Deploy Unified Owner Portal',
  'scripts/run-full-business-office-demo-authorized.sh',
  'scripts/verify-full-business-office-demo.js',
  'full-business-office-demo-${{ github.run_id }}'
]));
check('workflow preserves no-public-publish boundary', workflow.includes('nothing was publicly published'));

if (failures.length) {
  console.error('Full Business Office demo verification failed:');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log('PASS — Full approved Business Office demo contract is complete and bounded.');
