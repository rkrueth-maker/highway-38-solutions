#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'scripts/deploy-unified-owner-portal-web.sh');
const source=fs.readFileSync(file,'utf8');
const failures=[];
function check(name,condition,detail=''){if(condition)console.log(`PASS: ${name}`);else{console.error(`FAIL: ${name}${detail?` — ${detail}`:''}`);failures.push(name);}}

const syntax=cp.spawnSync('bash',['-n',file],{encoding:'utf8'});
check('deployment script has valid bash syntax',syntax.status===0,String(syntax.stderr||'').trim());
check('existing deployed version is pulled for exact comparison',source.includes('clasp pull --versionNumber "$OWNER_VERSION"'));
check('deployed version uses controlled-source inventory',source.includes('controlled-source-deployed-version.json')&&source.includes('inventories_match "$EVIDENCE/controlled-source-local.json" "$EVIDENCE/controlled-source-deployed-version.json"'));
check('one release version variable controls both deployments',source.includes('DEPLOY_VERSION=')&&source.includes('--versionNumber "$DEPLOY_VERSION"'));
check('version is created at most once in the script',(source.match(/clasp create-version/g)||[]).length===1,`count=${(source.match(/clasp create-version/g)||[]).length}`);
const updates=[...source.matchAll(/clasp update-deployment\s+"\$(?:OWNER_DEPLOYMENT_ID|BUSINESS_OFFICE_DEPLOYMENT_ID)"\s+--versionNumber\s+"\$DEPLOY_VERSION"/g)].map(match=>match[0]);
check('exactly two existing deployments are updated',updates.length===2,`count=${updates.length}`);
check('both deployment updates pin the same version',updates.length===2&&updates.every(line=>line.includes('--versionNumber "$DEPLOY_VERSION"')),updates.join(' | '));
check('both deployed lines are verified against the selected version',source.includes('OWNER_AFTER_LINE')&&source.includes('BUSINESS_AFTER_LINE')&&(source.match(/grep -F "@\$DEPLOY_VERSION"/g)||[]).length===2);
check('deployment evidence records single-version release',source.includes('"singleVersionPerRelease":true')&&source.includes('"deploymentVersion":"${DEPLOY_VERSION}"'));
check('unsafe two-version update chain is absent',!source.includes('update-deployment "$OWNER_DEPLOYMENT_ID" --description')&&!source.includes('update-deployment "$BUSINESS_OFFICE_DEPLOYMENT_ID" --description'));

console.log(`RESULT: ${failures.length?'HOLD':'PASS'} — ${failures.length} failure(s)`);
process.exit(failures.length?1:0);
