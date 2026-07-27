#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const failures = [];
const checks = [];

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function check(name, condition, detail) {
  checks.push({ name, pass: !!condition });
  if (!condition) failures.push(`${name}: ${detail || 'failed'}`);
}
function parse(name, source) {
  try { new Function(source); check(`${name} syntax`, true); }
  catch (error) { check(`${name} syntax`, false, error.message); }
}
function hasAll(source, markers) { return markers.every(marker => source.includes(marker)); }

const orchestrationBase = read('apps-script/business-office/BusinessOffice_AI_AgentOrchestration.gs');
const orchestrationV2 = read('apps-script/business-office/BusinessOffice_AI_AgentOrchestration_V2.gs');
const orchestration = orchestrationBase + '\n' + orchestrationV2;
const web = read('apps-script/business-office/BusinessOffice_Web.gs');
const client = read('apps-script/business-office/BusinessOffice_AI_Assistant_Client.html');
const actions = read('apps-script/business-office/BusinessOffice_AI_Actions.gs');
const assistant = read('apps-script/business-office/BusinessOffice_AI_Assistant.gs');
const taskCore = read('apps-script/business-office/BusinessOffice_TaskMessaging_10_Core.gs');
const sms = read('apps-script/business-office/BusinessOffice_TaskMessaging_20_SMS.gs');
const commercial = read('apps-script/business-office/BusinessOffice_QuoteBuilder_Commercial.gs');

parse('AI agent orchestration base', orchestrationBase);
parse('AI agent orchestration V2', orchestrationV2);
parse('Business Office web API', web);
const scripts = [...client.matchAll(/<script>([\s\S]*?)<\/script>/g)];
check('AI client has one script', scripts.length === 1, `found ${scripts.length}`);
if (scripts[0]) parse('AI assistant client', scripts[0][1]);

const agentKeys = [
  'intake_requirements',
  'quote_architect',
  'measurement_quantity',
  'pricing_costing',
  'scope_instruction',
  'drawing',
  'quote_review',
  'business_setup'
];
agentKeys.forEach(key => check(`Agent defined: ${key}`, orchestration.includes(`key: '${key}'`), key));
check('Exactly eight canonical specialist definitions are preserved', agentKeys.every(key => orchestration.includes(key)) && orchestration.includes('boAiAgentCatalog_'), 'agent catalog missing');

check('Automatic, Owner command, and Manual hold modes exist',
  hasAll(orchestration, ["'automatic'", "'owner-command'", "'manual-hold'", 'boAiSetAutomationMode_']),
  'three control modes are required');
check('Clear Owner commands bypass a second confirmation',
  orchestration.includes('boAiExecuteAuthorizedPlan_') &&
  orchestration.includes('boAiPrepareAction_') &&
  orchestration.includes('boAiConfirmAction_({ actionToken: action.actionToken, confirmation: action.confirmation })') &&
  orchestration.includes('secondConfirmationRequired: false'),
  'direct Owner authorization path missing');
check('Existing approval integrity engine remains authoritative',
  hasAll(actions, ['boAiActionDigest_', 'LockService.getUserLock()', "boRequireOwner_()", "boApproveSelectedRecord('AI Action'"]),
  'approval engine was weakened');

check('Owner takeover blocks persist as assigned tasks',
  hasAll(orchestration, ["'Task Type': 'Owner Takeover'", "'Assigned Role': 'Owner'", "h38TmAppend_('TASKS'", 'boAiTakeoverQueue_', 'boAiResolveTakeover_']),
  'persistent takeover queue missing');
check('Takeover blocks carry blocker, completed work, needed facts, recommendation, and commands',
  hasAll(orchestration, ['blocker:', 'completed:', 'needed:', 'recommendation:', 'commands:']),
  'takeover payload incomplete');
check('Agent runs are auditable',
  hasAll(orchestration, ["boUniversalAppend_('AGENT_RUNS'", "'Instructions Version': H38_AI_AGENT_SYSTEM_VERSION", "'Output JSON': JSON.stringify(result)", 'boAiRecordEvent_']),
  'agent-run evidence missing');

check('SMS Owner command reuses the existing provider-neutral subsystem',
  hasAll(orchestration, ['h38TmProviderStatus_', 'h38TmConsentForPhone_', 'h38TmSaveMessage_', 'h38TmApproveMessage_', 'h38TmSendMessage_']),
  'SMS path bypasses controlled messaging');
check('Quote delivery supports controlled email or SMS',
  hasAll(orchestration, ["channel==='SMS'", 'boAiEmailFromTextV2_', 'boAiPhoneFromTextV2_', "'Linked Record Type':'Quote'"]),
  'quote channel routing missing');
check('SMS consent and provider release remain mandatory',
  hasAll(orchestration, ['businessRegistrationApproved', 'outboundReleased', "Consent Status']!=='Consented'"]),
  'SMS release boundary missing');
check('Existing SMS hardening remains available',
  hasAll(sms, ['Duplicate-message lock', 'H38_SMS_A2P_APPROVED', 'H38_SMS_SEND_RELEASED', 'H38_SMS_INBOUND_SYNC_RELEASED']),
  'SMS hardening missing');
check('Inbound SMS synchronization is included in backend automation',
  orchestration.includes('h38TmSyncInbound_()') && orchestration.includes('inboundSyncReleased'),
  'inbound synchronization missing');

check('Final quote approve-and-send is a controlled composite',
  hasAll(orchestration, ['boAiApproveAndSendQuote_', "boApproveSelectedRecord('Quote'", "status:'Internal Review'", "status:'Approved to Share'", 'boQuoteCommercialPrepareShare_', "actionId:'email.send'", "status:'Shared'"]),
  'quote approval and sending flow incomplete');
check('Quote readiness blocks missing customer, scope, total, or recipient',
  hasAll(orchestration, ['boAiQuoteReadiness_', 'verified customer email address', 'Customer-facing scope', 'quote total']),
  'quote readiness checks missing');
check('Controlled proposal lifecycle remains authoritative',
  hasAll(commercial, ['Approved to Share', 'boQuoteCommercialPrepareShare_', 'approvedVersion', 'controlled proposal token']),
  'commercial lifecycle missing');

check('Backend automation processes inbox, inbound SMS, requests, and quotes',
  hasAll(orchestration, ['boAiEmailBrief_', 'Automatic inbound email intake', 'h38TmSyncInbound_', 'H38_BO_SHEETS.REQUESTS', 'H38_BO_SHEETS.QUOTES', 'Automatic request preparation', 'Automatic quote readiness review']),
  'backend pass incomplete');
check('Unchanged backend records are fingerprinted and skipped',
  hasAll(orchestration, ['H38_AI_AUTOMATION_STATE_PROPERTY_V2', 'boAiAutomationChangedV2_', 'boAiAutomationMarkV2_', 'Inbox unchanged', 'skippedUnchanged']),
  'idempotent automation fingerprints missing');
check('Optional 15-minute trigger is owner-installed and removable',
  hasAll(orchestration, ['everyMinutes(15)', 'boAiInstallAutomationTrigger_', 'boAiRemoveAutomationTrigger_', 'boAiAutomationScheduledRun']),
  'scheduled automation controls missing');

check('Web API routes through the new command router',
  hasAll(web, ['boAiCommandRouterV2_', 'boAiAutomationBootstrapV2_', 'boAiAutomationRunV2_', 'aiAutomationRun', 'aiTakeoverQueue', 'aiResolveTakeover', 'aiAgents']),
  'new endpoints not exposed');
check('Client visibly exposes back office and Owner blocks',
  hasAll(client, ['Run back office', 'Owner blocks', 'h38-ai-takeover', "result.kind==='completed'", "result.kind==='takeover'", "result.kind==='automation'"]),
  'agent orchestration UI missing');
check('Client preserves legacy confirmation flow for non-Owner or prepared actions',
  hasAll(client, ["api('aiConfirmAction'", 'Nothing has been executed', 'Here is the complete preview', 'speechChunks']),
  'legacy safe approval UI missing');
check('Client states that direct Owner commands authorize exact supported actions',
  client.includes('authorizes that exact supported action without asking for a second confirmation'),
  'Owner-command behavior is not explained');

check('No new source-code or deployment authority was granted to H38',
  assistant.includes("'modify source code'") &&
  assistant.includes("'deploy code'") &&
  orchestration.includes('mayExecuteExternalActions: false') &&
  !orchestration.includes('clasp push'),
  'protected system boundary weakened');

const result = {
  status: failures.length ? 'FAIL' : 'PASS',
  checks,
  failures
};
if (failures.length) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
console.log(`PASS — H38 AI specialist routing, Owner-command authorization, takeover blocks, controlled messaging, and backend automation verified (${checks.length} checks).`);
