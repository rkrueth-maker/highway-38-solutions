#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function json(file) { return JSON.parse(read(file)); }
function check(condition, message) { if (!condition) throw new Error(`Closed-environment execution verification failed: ${message}`); }

const pack = json('business-packs/highway38/business-pack.json');
const config = json('business-packs/highway38/business-office.config.json');
const server = read('apps-script/business-office/ZZZZ_BusinessOffice_LiveExternalActions.gs');
const embeddedPack = read('business-packs/highway38/apps-script/BusinessOffice_Pack.gs');
const client = read('apps-script/core-engine/owner-portal-next/Portal_LiveExternal_Client.html');
const index = read('apps-script/core-engine/owner-portal-next/Portal_Index.html');
const includes = read('apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js');

for (const workflow of [pack.workflow, config.workflow]) {
  check(workflow.closedEnvironment === true, 'Highway 38 is not marked as a closed environment.');
  check(workflow.externalActionsEnabled === true, 'Highway 38 execution is not enabled.');
  check(workflow.ownerApprovalRequired === true, 'Authenticated Owner authorization must remain required.');
  check(workflow.selectedRecordOnly === false, 'Selected-record-only policy was not removed.');
  check(workflow.bulkExternalActionsEnabled === true, 'Bulk execution remains policy-blocked.');
  check(workflow.automaticExternalTriggersEnabled === true, 'Automatic trigger execution remains policy-blocked.');
  check(Array.isArray(workflow.liveActionTypes), 'Enabled action types are missing.');
  ['email','emailReply','sms','payment','refund','purchaseOrder','payrollFunding','taxFiling','accountingPost','socialPublish','advertisingSpend','bulkExecution','automaticTrigger','deployment'].forEach(action => check(workflow.liveActionTypes.includes(action), `action type is missing: ${action}`));
}
check(pack.messaging.externalActionsEnabled === true && pack.messaging.inboundSyncEnabled === true, 'Messaging execution or inbound sync is not enabled.');
check(pack.messaging.ownerApprovalRequired === true, 'SMS Owner authorization must remain required.');
check(pack.messaging.documentedConsentRequired === true && pack.messaging.stopSuppressionRequired === true, 'SMS consent or STOP controls were weakened.');
check(pack.messaging.bulkMessagingEnabled === true && pack.messaging.automaticTriggersEnabled === true, 'Messaging bulk or automatic policy remains blocked.');
check(pack.boundaries.directPaymentProcessing === true && pack.boundaries.directPayrollFunding === true && pack.boundaries.directTaxFiling === true, 'Financial, payroll, or tax execution remains category-blocked.');
check(pack.social.externalActionsEnabled === true && pack.social.automaticPublishingEnabled === true && pack.social.bulkPublishingEnabled === true, 'Social publishing remains category-blocked.');
check(embeddedPack.includes('closedEnvironment:true') && embeddedPack.includes('externalActionsEnabled:true') && embeddedPack.includes('directPaymentProcessing:true'), 'The embedded deployment pack is not aligned with the JSON pack.');

[
  'h38PortalLiveExternalStatus',
  'h38RequireLiveExternalAction_',
  "properties.setProperty('H38_SMS_SEND_RELEASED','TRUE')",
  "properties.setProperty('H38_SMS_INBOUND_SYNC_RELEASED','TRUE')",
  "boAiActionExecuteEmail_=function(payload){h38RequireLiveExternalAction_('email')",
  "boAiActionExecuteEmailReply_=function(payload){h38RequireLiveExternalAction_('emailReply')",
  'bulkExternalActionsEnabled:controls.bulkExternalActionsEnabled',
  'automaticExternalTriggersEnabled:controls.automaticExternalTriggersEnabled',
  'payments:false',
  'deployment:false'
].forEach(marker => check(server.includes(marker), `server marker missing: ${marker}`));
[
  'CLOSED · OWNER AUTHORIZED',
  'All implemented actions available',
  'There are no permanent category-level execution blocks',
  'h38PortalLiveExternalStatus'
].forEach(marker => check(client.includes(marker), `client marker missing: ${marker}`));
check(index.includes("h38PortalRawInclude_('Portal_LiveExternal_Client')"), 'Portal closed-environment client is not loaded.');
check(includes.includes("'Portal_LiveExternal_Client'"), 'Portal closed-environment client is not allowlisted.');

console.log(JSON.stringify({
  status: 'PASS',
  productionExternalExecution: 'CLOSED_ENVIRONMENT_OWNER_AUTHORIZED',
  released: pack.workflow.liveActionTypes,
  permanentCategoryBlocks: []
}, null, 2));
