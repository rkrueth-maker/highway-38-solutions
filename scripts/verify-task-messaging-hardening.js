#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const checks = [];
const check = (name, condition, evidence = '') => {
  checks.push({ name, condition: Boolean(condition), evidence });
  console[condition ? 'log' : 'error'](`${condition ? 'PASS' : 'FAIL'}: ${name}${evidence ? ` — ${evidence}` : ''}`);
};

const webPath = 'apps-script/business-office/BusinessOffice_TaskMessaging_30_Web.gs';
const web = read(webPath);
const client = read('apps-script/core-engine/owner-portal-next/Portal_TaskMessaging_Client.html');
const unified = read('apps-script/core-engine/owner-portal-next/Portal_Unified.js');

try {
  new vm.Script(web, { filename: webPath });
  check('task messaging web syntax', true);
} catch (error) {
  check('task messaging web syntax', false, error.message);
}

check(
  'consented records require source scope and evidence',
  /moduleKey === "smsConsent"/.test(web) &&
    /"Consent Scope", "Consent Source", "Consent Evidence"/.test(web) &&
    /required before consent can be marked Consented/.test(web),
);
check(
  'approval rechecks complete documented consent',
  /function h38TmRequireDocumentedConsent_/.test(web) &&
    /"Consent Scope", "Consent Source", "Consent Date", "Consent Evidence"/.test(web) &&
    /decision\) === "Approve"[\s\S]*h38TmRequireDocumentedConsent_/.test(web),
);
check(
  'send rechecks complete documented consent',
  /function h38PortalMessagingSend\(messageId\)[\s\S]*h38TmRequireDocumentedConsent_/.test(web),
);
check(
  'linked task references repeat task access control',
  /function h38TmRequireLinkedTaskReferenceAccess_/.test(web) &&
    /h38TmRequireTaskAccess_\(linkedTask, user, false\)/.test(web) &&
    /h38TmValidateWebSave_/.test(web),
);
check(
  'task transition repeats package and role gates',
  /function h38PortalTaskTransition[\s\S]*boAssertModuleEnabled_\("assignedTasks"\)[\s\S]*h38TmRequireModule_\("assignedTasks", "Edit"\)/.test(web),
);
[
  'h38PortalMessagingDecision',
  'h38PortalMessagingSend',
  'h38PortalMessagingSyncInbound',
  'h38PortalMessagingSyncStatus',
  'h38PortalMessagingConvertReplyToTask',
  'h38PortalMessagingProviderStatus',
  'h38PortalMessagingSubmitReview',
  'h38PortalMessagingUsage',
].forEach(name => {
  const start = web.indexOf(`function ${name}`);
  const end = start < 0 ? -1 : web.indexOf('\nfunction ', start + 10);
  const block = start < 0 ? '' : web.slice(start, end < 0 ? web.length : end);
  check(
    `${name} repeats package gate`,
    block.includes('boAssertModuleEnabled_("messaging")'),
  );
  check(
    `${name} repeats role gate`,
    block.includes('h38TmRequireModule_("messaging"'),
  );
});
check(
  'assignee endpoint repeats assigned-task gate',
  /function h38PortalTaskMessagingAssignees[\s\S]*boAssertModuleEnabled_\("assignedTasks"\)[\s\S]*h38TmRequireModule_\("assignedTasks", "View"\)/.test(web),
);
check(
  'non-owner client uses role-safe bootstrap',
  /if\(H38_UNIFIED\.ownerMode\)return h38OwnerRefreshBase\(\)/.test(client) &&
    /H38_UNIFIED\.defaultModule\|\|'bo:assignedTasks'/.test(client) &&
    /Task and message access is limited server-side/.test(client),
);
check(
  'non-owner navigation keeps Tasks and Messaging separate',
  /if \(!access\.ownerMode\)/.test(unified) &&
    /id: 'tasksWork'[\s\S]*label: 'Tasks'/.test(unified) &&
    /id: 'messaging'[\s\S]*label: 'Messaging'/.test(unified) &&
    /\['tasksWork','messaging'\]\.indexOf\(group\.id\) >= 0/.test(unified) &&
    !/label: 'Tasks & Messaging'/.test(unified) &&
    /defaultModule: access\.ownerMode \? 'today' : 'bo:assignedTasks'/.test(unified),
);
check(
  'client contains no direct provider request',
  !/(fetch\(|XMLHttpRequest|sendBeacon|api\.twilio\.com)/.test(client),
);

const failures = checks.filter(item => !item.condition);
const result = {
  status: failures.length ? 'HOLD' : 'PASS',
  generatedAt: new Date().toISOString(),
  passed: checks.length - failures.length,
  failed: failures.length,
  checks,
  failures,
};
const out = path.join(root, 'artifacts', 'task-messaging');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'hardening-verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`RESULT: ${result.status} (${result.passed} pass, ${result.failed} fail)`);
process.exit(failures.length ? 1 : 0);
