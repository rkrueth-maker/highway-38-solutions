#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const failures=[];
const checks=[];
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const check=(name,value,detail='')=>{checks.push({name,pass:!!value});if(!value)failures.push(`${name}${detail?`: ${detail}`:''}`);};
const executable=source=>source.split(/\r?\n/).filter(line=>!line.trimStart().startsWith('#')).join('\n');

const workflow=read('.github/workflows/commercial-google-native-beta.yml');
const activeWorkflow=read('.github/workflows/verify-retired-office-deployments-disabled.yml');
const retirementVerifier=read('scripts/verify-retired-office-deployments-disabled.js');
const deploy=read('scripts/deploy-commercial-google-native-beta.sh');
const gatewayConfig=read('supabase/config.toml');
const web=read('apps-script/commercial-office-beta/CommercialBeta_Web.gs');
const browser=read('scripts/verify-commercial-browser-signin.js');
const request=JSON.parse(read('commercial-beta/deploy-request.json'));
const expectedScriptId='1nNYrjaH4kwCWQ2SGWMbXGxpkDgLWXXEa_vGSec9N1DjSVLzAl1Z1fxhf';
const expectedDeploymentId='AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow';
const expectedProjectId='jqukmwtsgcsaruucnqja';
const runnable=executable(workflow);

check('historical release request remains auditable',request.sourceBranch==='main'&&request.sourcePolicy==='DEPLOY_GITHUB_SHA');
check('historical request forbids creating resources',request.mode==='UPDATE_EXISTING_BETA_ONLY'&&request.createAppsScriptProjectAllowed===false&&request.createAppsScriptDeploymentAllowed===false);
check('historical request preserves exact retired resources',request.scriptId===expectedScriptId&&request.deploymentId===expectedDeploymentId&&request.supabaseProjectId===expectedProjectId);
check('historical request records no migration or external action',request.statusCommitsAllowed===false&&request.productionDataMayMigrate===false&&request.externalActionsEnabled===false);

check('retired workflow is permanently skipped',/if:\s*\$\{\{\s*false\s*\}\}/.test(workflow));
check('retired workflow is manual-only',workflow.includes('workflow_dispatch:')&&!/^\s*(push|pull_request|workflow_run)\s*:/m.test(runnable));
check('retired workflow has read-only repository permission',/permissions:\s*\n\s*contents: read/.test(workflow)&&!workflow.includes('contents: write'));
check('retired workflow contains no executable deployment credential',!runnable.includes('SUPABASE_ACCESS_TOKEN')&&!runnable.includes('GOOGLE_APPS_SCRIPT_ACCESS_TOKEN'));
check('retired workflow contains no executable Supabase deployment',!runnable.includes('supabase functions deploy'));
check('retired workflow contains no executable Apps Script deployment',!/(clasp\s+(push|deploy|create-version|create-deployment)|script\.googleapis\.com\/v1\/scripts)/.test(runnable));
check('retired workflow contains no executable artifact release path',!runnable.includes('release-report.json')&&!runnable.includes('GITHUB_STEP_SUMMARY'));
check('retirement verifier covers commercial workflow',retirementVerifier.includes("'.github/workflows/commercial-google-native-beta.yml'")&&retirementVerifier.includes('automaticLegacyDeployments:false')&&retirementVerifier.includes('manualLegacyDeployments:false'));
check('active retirement workflow runs verifier',activeWorkflow.includes('node scripts/verify-retired-office-deployments-disabled.js'));

check('historical deploy script remains pinned for audit',deploy.includes(`EXPECTED_SCRIPT_ID="${expectedScriptId}"`)&&deploy.includes(`EXPECTED_DEPLOYMENT_ID="${expectedDeploymentId}"`));
check('historical deploy script has no resource-creation fallback',!deploy.includes('clasp create --type')&&!deploy.includes('clasp create-deployment')&&!deploy.includes('clasp create-version'));
check('historical gateway config remains identifiable',/\[functions\.h38-office-gateway\][\s\S]*verify_jwt\s*=\s*false/.test(gatewayConfig));
check('historical Apps Script acceptance remains read-only',web.includes("if(action==='acceptanceStatus')return cbReleaseAcceptanceStatus_();")&&web.includes("acceptance:'READ_ONLY_GATEWAY_STATUS'")&&web.includes('readOnly:true')&&web.includes('externalActionsEnabled:false'));
check('historical browser acceptance remains read-only',browser.includes("request('acceptanceStatus',{},90000)")&&browser.includes("apiResult.acceptance!=='READ_ONLY_GATEWAY_STATUS'")&&browser.includes('apiResult.readOnly!==true'));

const output={
  status:failures.length?'FAIL':'PASS',
  checks:checks.length,
  failures,
  supportedRuntime:'supabase',
  retiredGoogleWorkflow:true,
  automaticLegacyDeployment:false,
  manualLegacyDeployment:false,
  historicalResourcesAuditable:true,
  productionDataMigration:false,
  externalActions:false
};
if(failures.length){console.error(JSON.stringify(output,null,2));process.exit(1);}
console.log(JSON.stringify(output,null,2));
