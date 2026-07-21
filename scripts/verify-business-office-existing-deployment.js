#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const verificationWorkflow=fs.readFileSync(path.join(root,'.github/workflows/business-office.yml'),'utf8');
const productionWorkflow=fs.readFileSync(path.join(root,'.github/workflows/deploy-owner-portal-hard-rule-production.yml'),'utf8');
const deploy=fs.readFileSync(path.join(root,'scripts/deploy-unified-owner-portal-web.sh'),'utf8');
const legacyDeploy=fs.readFileSync(path.join(root,'scripts/deploy-business-office-existing-production.sh'),'utf8');
const pack=JSON.parse(fs.readFileSync(path.join(root,'business-packs/highway38/deployment.json'),'utf8'));
const failures=[];
function check(name,ok){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failures.push(name)}
check('accepted Business Office deployment ID is recorded',Boolean(pack.appsScript&&pack.appsScript.businessOfficeDeploymentId));
check('one production project ID is pinned',pack.appsScript.productionProjectId===pack.appsScript.ownerPortalProjectId&&pack.appsScript.productionProjectId===pack.appsScript.businessOfficeProjectId);
check('single production authority is recorded',pack.controls&&pack.controls.singleProductionAuthority==='Deploy Unified Owner Portal');
check('Business Office workflow verifies only',!verificationWorkflow.includes('deploy-existing-production:')&&!/clasp\s+(push|update-deployment|create-version)/.test(verificationWorkflow));
check('unified workflow invokes the one production deployment script',productionWorkflow.includes('scripts/deploy-unified-owner-portal-web.sh'));
check('unified deployment updates accepted Business Office ID in place',deploy.includes('clasp update-deployment "$BUSINESS_OFFICE_DEPLOYMENT_ID"'));
check('unified deployment uses pinned project ID',deploy.includes('appsScript.productionProjectId'));
check('workflow never creates Apps Script projects',!productionWorkflow.includes('clasp create-script')&&!deploy.includes('clasp create-script')&&!legacyDeploy.includes('clasp create-script'));
check('workflow never creates production deployments',!productionWorkflow.includes('clasp create-deployment')&&!deploy.includes('clasp create-deployment')&&!legacyDeploy.includes('clasp create-deployment'));
check('deployment backs up bound project',deploy.includes('project-before.tar.gz'));
check('exact controlled source is compared after push',deploy.includes('controlled-source-local.json')&&deploy.includes('controlled-source-remote.json'));
check('owner, Business Office, and Quote Builder endpoints are verified',deploy.includes('owner-response.html')&&deploy.includes('business-response.html')&&deploy.includes('quote-builder-response.html'));
check('external actions remain disabled',deploy.includes('"externalActionsEnabled":false')&&deploy.includes('"externalActionsOccurred":false'));
check('no new project or deployment evidence',deploy.includes('"createdNewProject":false')&&deploy.includes('"createdNewDeployment":false'));
if(failures.length){console.error(JSON.stringify({status:'FAIL',failures},null,2));process.exit(1)}
console.log(JSON.stringify({status:'PASS',checks:14},null,2));
