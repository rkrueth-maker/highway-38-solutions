#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function json(file) { return JSON.parse(read(file)); }
function check(condition, message) { if (!condition) throw new Error(`Live external execution verification failed: ${message}`); }

const pack = json('business-packs/highway38/business-pack.json');
const config = json('business-packs/highway38/business-office.config.json');
const server = read('apps-script/business-office/ZZZZ_BusinessOffice_LiveExternalActions.gs');
const client = read('apps-script/core-engine/owner-portal-next/Portal_LiveExternal_Client.html');
const index = read('apps-script/core-engine/owner-portal-next/Portal_Index.html');
const includes = read('apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js');

for (const workflow of [pack.workflow, config.workflow]) {
  check(workflow.externalActionsEnabled === true, 'Highway 38 production workflow is not live.');
  check(workflow.ownerApprovalRequired === true, 'Owner approval must remain required.');
  check(workflow.selectedRecordOnly === true, 'Execution must remain selected-record only.');
  check(workflow.bulkExternalActionsEnabled === false, 'Bulk external execution must remain disabled.');
  check(workflow.automaticExternalTriggersEnabled === false, 'Automatic external triggers must remain disabled.');
  check(Array.isArray(workflow.liveActionTypes) && workflow.liveActionTypes.includes('email') && workflow.liveActionTypes.includes('emailReply'), 'Email live actions are incomplete.');
}
check(pack.messaging.externalActionsEnabled === true, 'Approved SMS release flag is not enabled.');
check(pack.messaging.ownerApprovalRequired === true, 'SMS Owner approval must remain required.');
check(pack.messaging.documentedConsentRequired === true && pack.messaging.stopSuppressionRequired === true, 'SMS consent or STOP controls were weakened.');
check(pack.messaging.bulkMessagingEnabled === false && pack.messaging.automaticTriggersEnabled === false, 'SMS bulk or automatic sending was enabled.');
check(pack.boundaries.directPaymentProcessing === false && pack.boundaries.directPayrollFunding === false && pack.boundaries.directTaxFiling === false, 'Financial, payroll, or tax boundaries were weakened.');
check(pack.social.externalActionsEnabled === false && pack.social.automaticPublishingEnabled === false, 'Social publishing was incorrectly released.');

[
  'h38PortalLiveExternalStatus',
  'h38RequireLiveExternalAction_',
  "PropertiesService.getScriptProperties().setProperty('H38_SMS_SEND_RELEASED','TRUE')",
  "boAiActionExecuteEmail_=function(payload){h38RequireLiveExternalAction_('email')",
  "boAiActionExecuteEmailReply_=function(payload){h38RequireLiveExternalAction_('emailReply')",
  'bulkExternalActionsEnabled:false',
  'automaticExternalTriggersEnabled:false'
].forEach(marker => check(server.includes(marker), `server marker missing: ${marker}`));
[
  'LIVE · Owner approval',
  'One selected record at a time',
  'payments, refunds, purchasing, payroll, tax filing',
  'h38PortalLiveExternalStatus'
].forEach(marker => check(client.includes(marker), `client marker missing: ${marker}`));
check(index.includes("h38PortalRawInclude_('Portal_LiveExternal_Client')"), 'Portal live client is not loaded.');
check(includes.includes("'Portal_LiveExternal_Client'"), 'Portal live client is not allowlisted.');

console.log(JSON.stringify({
  status: 'PASS',
  productionExternalExecution: 'LIVE_OWNER_APPROVED_SELECTED_RECORD_ONLY',
  released: pack.workflow.liveActionTypes,
  protected: ['payments','refunds','purchasing','payroll','tax filing','accounting movement','public publishing','advertising spend','bulk sends','automatic triggers']
}, null, 2));
