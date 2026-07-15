#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { assertIsolated } = require('./business-office/lib/business-pack');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bo-clean-install-'));
const input = {
  businessName: 'North Star Test Company',
  businessId: 'NORTH_STAR_TEST',
  publicName: 'North Star Test Company',
  legalName: 'North Star Test Company LLC',
  timeZone: 'America/Chicago',
  mode: 'standalone',
  branding: { primaryColor:'#123456', secondaryColor:'#546270', accentColor:'#d8a22e' },
  protectedInstallations: [{ installationId:'HIGHWAY38-LIVE', resources:{ spreadsheetId:'H38_SHEET', rootFolderId:'H38_ROOT', documentFolderId:'H38_DOCS', pdfFolderId:'H38_PDFS', exportFolderId:'H38_EXPORT', backupFolderId:'H38_BACKUP', appsScriptProjectId:'H38_SCRIPT', deploymentId:'H38_DEPLOYMENT' } }]
};
const inputFile = path.join(temp,'input.json');
fs.writeFileSync(inputFile,JSON.stringify(input,null,2));
execFileSync(process.execPath,[path.join(root,'scripts/business-office/create-installation-plan.js'),inputFile,temp],{stdio:'inherit'});
const packText = fs.readFileSync(path.join(temp,'business-pack.json'),'utf8');
const plan = JSON.parse(fs.readFileSync(path.join(temp,'installation-plan.json'),'utf8'));
const failures=[];
const check=(name,condition)=>{if(!condition)failures.push(name);};
check('clean identity', plan.businessId==='NORTH_STAR_TEST' && /North Star Test Company/.test(packText));
check('no Highway 38 leakage', !/Highway 38|rkrueth|AKfyc|1kDDKW|H38_BUSINESS_OFFICE/i.test(packText));
check('separate resource creation required', Object.values(plan.resources).every(value=>value===''));
check('separate users and logs', plan.controls.separateUsers===true && plan.controls.separateLogs===true && plan.controls.separateBackup===true);
check('standalone mode', plan.mode==='standalone' && plan.connectWebsiteAfterDeployment===false);
let collisionBlocked=false;
try { assertIsolated({resources:{spreadsheetId:'H38_SHEET'}},input.protectedInstallations); } catch(error) { collisionBlocked=/Data isolation failure/.test(error.message); }
check('protected resource collision blocked',collisionBlocked);
const result={status:failures.length?'HOLD':'PASS',temp,failures};
const out=path.join(root,'artifacts','business-office-clean-install');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
process.exit(failures.length?1:0);
