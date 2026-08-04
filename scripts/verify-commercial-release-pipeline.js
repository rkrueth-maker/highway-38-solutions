#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const failures=[];
const checks=[];
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const check=(name,value,detail='')=>{checks.push({name,pass:!!value});if(!value)failures.push(`${name}${detail?`: ${detail}`:''}`);};

const workflow=read('.github/workflows/commercial-google-native-beta.yml');
const deploy=read('scripts/deploy-commercial-google-native-beta.sh');
const gatewayConfig=read('supabase/config.toml');
const web=read('apps-script/commercial-office-beta/CommercialBeta_Web.gs');
const browser=read('scripts/verify-commercial-browser-signin.js');
const request=JSON.parse(read('commercial-beta/deploy-request.json'));
const expectedScriptId='1nNYrjaH4kwCWQ2SGWMbXGxpkDgLWXXEa_vGSec9N1DjSVLzAl1Z1fxhf';
const expectedDeploymentId='AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow';
const expectedProjectId='jqukmwtsgcsaruucnqja';

check('release request deploys accepted main',request.sourceBranch==='main'&&request.sourcePolicy==='DEPLOY_GITHUB_SHA');
check('release request updates existing resources only',request.mode==='UPDATE_EXISTING_BETA_ONLY'&&request.createAppsScriptProjectAllowed===false&&request.createAppsScriptDeploymentAllowed===false);
check('release request pins Apps Script resources',request.scriptId===expectedScriptId&&request.deploymentId===expectedDeploymentId);
check('release request pins Supabase gateway',request.supabaseProjectId===expectedProjectId&&request.gatewayFunction==='h38-office-gateway'&&request.gatewayHealthVersion==='3.0.4');
check('release request forbids status commits and external actions',request.statusCommitsAllowed===false&&request.productionDataMayMigrate===false&&request.externalActionsEnabled===false);

check('workflow triggers from main request or manual dispatch',/branches:\s*\n\s*- main/.test(workflow)&&workflow.includes('commercial-beta/deploy-request.json')&&workflow.includes('workflow_dispatch:'));
check('workflow no longer deploys from beta branch',!workflow.includes('- agent/commercial-google-native-beta')&&!workflow.includes('ref: agent/commercial-google-native-beta'));
check('workflow has read-only repository permission',/permissions:\s*\n\s*contents: read/.test(workflow)&&!workflow.includes('contents: write'));
check('workflow writes no branch status commits',!/(git\s+(commit|push|reset)|workflow-status\.json)/.test(workflow));
check('workflow requires scoped Supabase token',workflow.includes('SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}')&&workflow.includes('Require scoped Supabase deployment credential'));
check('workflow deploys reviewed existing Edge Function',workflow.includes('supabase functions deploy "${H38_GATEWAY_FUNCTION}" --project-ref "${SUPABASE_PROJECT_ID}"'));
check('workflow deploys gateway before Apps Script',workflow.indexOf('Deploy reviewed gateway source')<workflow.indexOf('Update existing Apps Script project and deployment only'));
check('workflow records artifact and step summary',workflow.includes('release-report.json')&&workflow.includes('actions/upload-artifact@v4')&&workflow.includes('GITHUB_STEP_SUMMARY'));
check('workflow runs unified release verifier',workflow.includes('node scripts/verify-commercial-release-pipeline.js'));

check('Apps Script deploy requires exact existing project',deploy.includes(`EXPECTED_SCRIPT_ID="${expectedScriptId}"`)&&deploy.includes('[[ "$SCRIPT_ID" == "$EXPECTED_SCRIPT_ID" ]]'));
check('Apps Script deploy requires exact existing deployment',deploy.includes(`EXPECTED_DEPLOYMENT_ID="${expectedDeploymentId}"`)&&deploy.includes('[[ "$DEPLOYMENT_ID" == "$EXPECTED_DEPLOYMENT_ID" ]]'));
check('Apps Script deploy has no creation fallback',!deploy.includes('clasp create --type')&&!deploy.includes('clasp create-deployment')&&!deploy.includes('clasp create-version'));
check('Apps Script deploy verifies existing deployment after update',deploy.includes('clasp deploy -i "$DEPLOYMENT_ID"')&&deploy.includes('clasp deployments')&&deploy.includes('grep -Fq "$DEPLOYMENT_ID"'));

check('gateway config keeps custom session verification',/\[functions\.h38-office-gateway\][\s\S]*verify_jwt\s*=\s*false/.test(gatewayConfig));
check('Apps Script exposes read-only acceptance action',web.includes("if(action==='acceptanceStatus')return cbReleaseAcceptanceStatus_();")&&web.includes("acceptance:'READ_ONLY_GATEWAY_STATUS'")&&web.includes('readOnly:true')&&web.includes('externalActionsEnabled:false'));
check('browser acceptance uses read-only action',browser.includes("request('acceptanceStatus',{},90000)")&&browser.includes("apiResult.acceptance!=='READ_ONLY_GATEWAY_STATUS'")&&browser.includes('apiResult.readOnly!==true'));

const output={
  status:failures.length?'FAIL':'PASS',
  checks:checks.length,
  failures,
  sourceBranch:'main',
  statusCommitsWritten:false,
  exactAppsScriptProject:true,
  exactAppsScriptDeployment:true,
  supabaseProjectId:expectedProjectId,
  gatewayFunction:'h38-office-gateway',
  gatewayBeforeAppsScript:true,
  readOnlyAcceptance:true,
  productionDataMigration:false,
  externalActions:false
};
if(failures.length){console.error(JSON.stringify(output,null,2));process.exit(1);}
console.log(JSON.stringify(output,null,2));
