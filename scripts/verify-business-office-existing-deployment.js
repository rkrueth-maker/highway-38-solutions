#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const verificationWorkflow=fs.readFileSync(path.join(root,'.github/workflows/business-office.yml'),'utf8');
const productionWorkflow=fs.readFileSync(path.join(root,'.github/workflows/deploy-owner-portal-hard-rule-production.yml'),'utf8');
const executableProductionWorkflow=productionWorkflow.split('\n').filter(line=>!line.trim().startsWith('#')).join('\n');
const deploy=fs.readFileSync(path.join(root,'scripts/deploy-unified-owner-portal-web.sh'),'utf8');
const legacyDeploy=fs.readFileSync(path.join(root,'scripts/deploy-business-office-existing-production.sh'),'utf8');
const pack=JSON.parse(fs.readFileSync(path.join(root,'business-packs/highway38/deployment.json'),'utf8'));
const failures=[];
function check(name,ok){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failures.push(name)}
check('accepted Business Office deployment ID is recorded',Boolean(pack.appsScript&&pack.appsScript.businessOfficeDeploymentId));
check('one production project ID is pinned',pack.appsScript.productionProjectId===pack.appsScript.ownerPortalProjectId&&pack.appsScript.productionProjectId===pack.appsScript.businessOfficeProjectId);
check('single production authority is recorded',pack.controls&&pack.controls.singleProductionAuthority==='Deploy Unified Owner Portal');
check('Business Office workflow verifies only',!verificationWorkflow.includes('deploy-existing-production:')&&!/clasp\s+(push|update-deployment|create-version)/.test(verificationWorkflow));
check('retired unified workflow cannot invoke the historical deployment script',executableProductionWorkflow.includes('if: ${{ false }}')&&!executableProductionWorkflow.includes('scripts/deploy-unified-owner-portal-web.sh'));
check('historical unified deployment updated accepted Business Office ID in place',deploy.includes('clasp update-deployment "$BUSINESS_OFFICE_DEPLOYMENT_ID"'));
check('historical unified deployment used pinned project ID',deploy.includes('appsScript.productionProjectId'));
check('workflow never creates Apps Script projects',!productionWorkflow.includes('clasp create-script')&&!deploy.includes('clasp create-script')&&!legacyDeploy.includes('clasp create-script'));
check('workflow never creates production deployments',!productionWorkflow.includes('clasp create-deployment')&&!deploy.includes('clasp create-deployment')&&!legacyDeploy.includes('clasp create-deployment'));
check('historical deployment backed up bound project',deploy.includes('project-before.tar.gz'));
check('historical controlled source was compared after push',deploy.includes('controlled-source-local.json')&&deploy.includes('controlled-source-remote.json'));
check('historical owner, Business Office, and Quote Builder endpoints were verified',deploy.includes('owner-response.html')&&deploy.includes('business-response.html')&&deploy.includes('quote-builder-response.html'));
check('closed-environment evidence records no deployment-time external action',deploy.includes('"closedEnvironment":true')&&deploy.includes('"ownerAuthorizedAllImplementedActions":true')&&deploy.includes('"permanentCategoryBlocks":[]')&&deploy.includes('"externalActionsEnabled":true')&&deploy.includes('"externalActionsOccurred":false'));
check('historical evidence records no new project or deployment',deploy.includes('"createdNewProject":false')&&deploy.includes('"createdNewDeployment":false'));
if(failures.length){console.error(JSON.stringify({status:'FAIL',failures},null,2));process.exit(1)}
console.log(JSON.stringify({status:'PASS',checks:14},null,2));
