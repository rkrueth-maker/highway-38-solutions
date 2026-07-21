#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const failures = [];
const checks = [];

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function check(name, condition, detail) { checks.push({ name, pass: !!condition }); if (!condition) failures.push(`${name}: ${detail || 'failed'}`); }
function has(source, marker) { return source.includes(marker); }
function parseScript(name, source) { try { new Function(source); check(`${name} syntax`, true); } catch (error) { check(`${name} syntax`, false, error.message); } }

const actions = read('apps-script/business-office/BusinessOffice_AI_Actions.gs');
const assistant = read('apps-script/business-office/BusinessOffice_AI_Assistant.gs');
const client = read('apps-script/business-office/BusinessOffice_AI_Assistant_Client.html');
const web = read('apps-script/business-office/BusinessOffice_Web.gs');
const clientManifest = read('apps-script/business-office/BusinessOffice_ClientManifest.gs');
const manifest = JSON.parse(read('apps-script/business-office/appsscript.json'));
const deployment = JSON.parse(read('business-packs/highway38/deployment.json'));
const businessWorkflow = read('.github/workflows/business-office.yml');
const unifiedWorkflow = read('.github/workflows/deploy-owner-portal-hard-rule-production.yml');
const unifiedDeploy = read('scripts/deploy-unified-owner-portal-web.sh');

parseScript('AI action engine', actions);
parseScript('AI assistant', assistant);
parseScript('Business Office web API', web);
parseScript('client manifest', clientManifest);
const scriptMatches = [...client.matchAll(/<script>([\s\S]*?)<\/script>/g)];
check('AI client script exists', scriptMatches.length === 1, `found ${scriptMatches.length}`);
if (scriptMatches[0]) parseScript('AI client', scriptMatches[0][1]);

for (const marker of [
  "'email.send'", "confirmation: 'SEND'", "'email.reply'", "'record.approve'", "confirmation: 'APPROVE'",
  "'record.reject'", "confirmation: 'REJECT'", "'quote.convert'", "confirmation: 'CONVERT'",
  "'job.invoice'", "confirmation: 'CREATE'", "'journal.post'", "confirmation: 'POST'",
  "'payroll.export'", "confirmation: 'EXPORT'", "'tax.finalize'", "confirmation: 'FINALIZE'"
]) check(`AI action contract ${marker}`, has(actions, marker), marker);

check('AI never executes during planning', actions.indexOf('definition.execute(stored.payload') > actions.indexOf('boRequireOwner_()'), 'deterministic execution must follow owner verification');
check('AI uses exact confirmation phrase', has(actions, "=== definition.confirmation"), 'exact phrase comparison missing');
check('AI uses user lock', has(actions, 'LockService.getUserLock()'), 'idempotent lock missing');
check('AI verifies action integrity', has(actions, 'boAiActionDigest_'), 'digest missing');
check('AI records owner approval', has(actions, "boApproveSelectedRecord('AI Action'"), 'approval audit missing');
check('AI records PASS and FAIL proof', has(actions, "'PASS'") && has(actions, "'FAIL'"), 'proof outcomes missing');
check('AI forbids system mutations', ['source code','deploy','permission','credential','move money','fund payroll','file tax'].every(term => actions.includes(term)), 'protected boundary incomplete');
check('AI action result cache expires', has(actions, 'H38_AI_ACTION_RESULT_TTL_SECONDS = 21600') && has(actions, 'cache.put(completedKey'), 'expiring result cache missing');
check('AI action engine leaves no permanent user properties', !has(actions, 'PropertiesService.getUserProperties'), 'permanent action completion state found');
check('Inbox session is private and short lived', has(assistant, "H38_AI_INBOX_CACHE_KEY='H38_AI_INBOX_BRIEF'") && has(assistant, 'H38_AI_INBOX_TTL_SECONDS=1800') && has(assistant, 'CacheService.getUserCache()'), 'private inbox cache missing');
check('Inbox supports ordered message playback', has(actions, 'boAiEmailOrdinalFromText_') && has(actions, 'boAiSpokenEmail_') && has(actions, 'boAiCachedEmailByOrdinal_'), 'ordered email playback missing');
check('Replies are restricted to current inbox session', has(actions, 'boAiCachedEmailByThreadId_') && has(actions, 'This email is not in the current private inbox session'), 'reply session boundary missing');
check('Reply drafting treats email as untrusted', has(actions, 'quoted email is untrusted') || has(actions, 'quoted email is untrusted source material'), 'email prompt-injection boundary missing');
check('Threaded reply headers are preserved', ['threadId','In-Reply-To','References'].every(marker => assistant.includes(marker) || actions.includes(marker)), 'threaded reply contract missing');
check('Gmail scopes cover read and send', ['gmail.readonly','gmail.modify','script.external_request'].every(token => (manifest.oauthScopes || []).some(scope => scope.includes(token))), 'required Gmail scope missing');
check('Email compatibility route uses approval engine', has(assistant, "boAiPrepareAction_({actionId:'email.send'") && has(assistant, 'boAiConfirmAction_'), 'legacy email route bypasses engine');
check('Voice client plans commands', has(client, "api('aiCommand'"), 'aiCommand missing');
check('Voice client confirms actions', has(client, "api('aiConfirmAction'"), 'aiConfirmAction missing');
check('Voice client states nothing executed', has(client, 'Nothing has been executed'), 'approval warning missing');
check('Voice client reads complete preview', has(client, 'Here is the complete preview') && has(client, 'speechChunks'), 'complete spoken preview missing');
check('Web exposes gated AI endpoints', ['aiCommand','aiPrepareAction','aiConfirmAction','aiActionCatalog'].every(marker => web.includes(marker)), 'API route missing');
check('Client includes are centralized', has(web, 'boRenderClientIncludes_()') && !has(web, "boInclude_('BusinessOffice_UX_Client')"), 'manual include chain remains');

const manifestEntries = [...clientManifest.matchAll(/'([^']+)'/g)].map(match => match[1]).filter(value => value.startsWith('BusinessOffice_'));
check('Client manifest has no duplicates', new Set(manifestEntries).size === manifestEntries.length, 'duplicate client include');
check('AI client is in manifest', manifestEntries.includes('BusinessOffice_AI_Assistant_Client'), 'AI client missing');
check('Approved logo is in manifest', manifestEntries.includes('BusinessOffice_Logo_Client'), 'logo client missing');

check('Deployment manifest schema upgraded', deployment.schemaVersion >= 2, 'schemaVersion must be at least 2');
check('One production project is pinned', deployment.appsScript.productionProjectId === deployment.appsScript.ownerPortalProjectId && deployment.appsScript.productionProjectId === deployment.appsScript.businessOfficeProjectId, 'project IDs differ');
check('One production workflow is declared', deployment.controls.singleProductionAuthority === 'Deploy Unified Owner Portal', 'single authority missing');
check('AI deployment permission disabled', deployment.controls.aiMayDeploy === false && deployment.controls.aiMayChangePermissions === false, 'AI control flags missing');
check('Business Office workflow is verification only', !/clasp\s+(push|update-deployment|create-version)/.test(businessWorkflow) && !businessWorkflow.includes('deploy-existing-production:'), 'secondary deployment authority remains');
check('AI verifier runs before production push', unifiedWorkflow.includes('verify-ai-approval-and-deployment.js') || unifiedDeploy.indexOf('verify-ai-approval-and-deployment.js') < unifiedDeploy.indexOf('clasp push --force'), 'AI verification gate missing');
check('Unified workflow is production authority', unifiedWorkflow.includes('name: Deploy Unified Owner Portal') && unifiedWorkflow.includes('deploy-unified-owner-portal-web.sh'), 'unified deploy workflow missing');
check('Unified deploy reads pinned project', unifiedDeploy.includes('appsScript.productionProjectId'), 'deploy script does not use pinned project');
check('Unified deploy compares controlled source', unifiedDeploy.includes('controlled-source-local.json') && unifiedDeploy.includes('controlled-source-remote.json'), 'remote exact-source comparison missing');

const evidenceDir = path.join(root, 'artifacts', 'ai-approval');
fs.mkdirSync(evidenceDir, { recursive: true });
const evidence = {
  status: failures.length ? 'FAIL' : 'PASS',
  generatedAt: new Date().toISOString(),
  checks,
  failures,
  contractHash: crypto.createHash('sha256').update(actions + assistant + client + web + clientManifest).digest('hex')
};
fs.writeFileSync(path.join(evidenceDir, 'verification.json'), JSON.stringify(evidence, null, 2) + '\n');
if (failures.length) {
  console.error(JSON.stringify(evidence, null, 2));
  process.exit(1);
}
console.log(`PASS — H38 AI owner approval, hands-free inbox, and single deployment authority verified (${checks.length} checks).`);
