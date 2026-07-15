#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadPack, validatePack } = require('./business-office/lib/business-pack');
const root = path.resolve(__dirname, '..');
const failures = [];
const passes = [];
const check = (name, condition, detail='') => (condition ? passes : failures).push({name, detail});
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const json = rel => JSON.parse(read(rel));

for (const packName of ['highway38','template-business']) {
  try {
    const pack = loadPack(root, packName);
    check(`${packName} pack validates`, validatePack(pack).length === 0);
  } catch (error) { check(`${packName} pack validates`, false, error.message); }
}

const templateText = read('business-packs/template-business/business-pack.json') + read('business-packs/template-business/apps-script/BusinessOffice_Pack.gs');
const coreText = fs.readdirSync(path.join(root,'apps-script','business-office'))
  .filter(name => /\.(gs|html|md|json)$/.test(name))
  .map(name => read(path.join('apps-script','business-office',name)))
  .join('\n');
const h38Deployment = json('business-packs/highway38/deployment.json');
const templateDeployment = json('business-packs/template-business/deployment.json');

check('template contains no Highway 38 identity', !/Highway 38|rkrueth|AKfyc|1kDDKW|1Vq8Uj|11ak4Q/i.test(templateText));
check('reusable core contains no live Highway 38 identity or resource ID', !/Highway 38 Solutions|1kDDKW|1Vq8Uj|11ak4Q|AKfycb/i.test(coreText));
check('template catalog starts empty', /"requiredProductCount": 0/.test(templateText) && /"requiredBundleCount": 0/.test(templateText));
check('template uses generic property keys', /BUSINESS_OFFICE_SPREADSHEET_ID/.test(templateText) && !/H38_BUSINESS_OFFICE_SPREADSHEET_ID/.test(templateText));
check('Highway 38 pack keeps approved catalog counts', /"requiredProductCount": 15/.test(read('business-packs/highway38/business-pack.json')) && /"requiredBundleCount": 9/.test(read('business-packs/highway38/business-pack.json')));
check('Highway 38 deployment map is complete', [
  h38Deployment.businessId,
  h38Deployment.ownerEmail,
  h38Deployment.resources?.businessOfficeSpreadsheetId,
  h38Deployment.resources?.rootFolderId,
  h38Deployment.resources?.documentFolderId,
  h38Deployment.resources?.pdfFolderId,
  h38Deployment.resources?.exportFolderId,
  h38Deployment.resources?.backupFolderId,
  h38Deployment.appsScript?.ownerPortalProjectId,
  h38Deployment.appsScript?.ownerPortalDeploymentId,
  h38Deployment.appsScript?.businessOfficeDeploymentId,
  h38Deployment.website?.ownerPortalUrl
].every(Boolean));
check('Highway 38 deployment map updates only existing installation', h38Deployment.controls?.updateExistingProjectOnly === true && h38Deployment.controls?.createNewProject === false && h38Deployment.controls?.createNewProductionDeployment === false && h38Deployment.controls?.externalActionsEnabled === false);
check('template deployment map requires new isolated resources', Object.values(templateDeployment.resources || {}).every(value => value === '') && Object.values(templateDeployment.appsScript || {}).every(value => value === '') && templateDeployment.controls?.createNewProject === true && templateDeployment.controls?.createNewProductionDeployment === true);
check('template deployment map contains no Highway 38 references', !/Highway 38|rkrueth|AKfyc|1kDDKW|1Vq8Uj|11ak4Q/i.test(JSON.stringify(templateDeployment)));
check('deployment configuration loader validates Highway 38 map', (() => { try { const output=execFileSync(process.execPath,[path.join(root,'scripts/load-highway38-deployment-config.js')],{encoding:'utf8'}); return JSON.parse(output).status==='PASS'; } catch(error) { return false; } })());
check('architecture application boundaries exist', ['apps/highway38-website/README.md','apps/highway38-owner-portal/README.md','apps/business-office/README.md'].every(rel => fs.existsSync(path.join(root, rel))));
check('shared package boundaries exist', ['core-engine','authentication','roles-permissions','document-intake','ocr','pdf-generation','accounting','payroll-preparation','tax-preparation','approval-engine','audit-logging','error-logging','shared-ui'].every(name => fs.existsSync(path.join(root,'packages',name,'README.md'))));
check('core business pack loader exists', fs.existsSync(path.join(root,'apps-script/business-office/BusinessOffice_BusinessPack.gs')));
check('Highway 38 deployment assembles Highway 38 pack', /business-packs\/highway38\/apps-script\/BusinessOffice_Pack\.gs/.test(read('scripts/deploy-unified-owner-portal-web.sh')));
check('Highway 38 production path loads deployment configuration', /load-highway38-deployment-config\.js/.test(read('.github/workflows/business-office-production-v2.yml')));
check('legacy automatic project creation is retired', !/create-script --type standalone/.test(read('.github/workflows/business-office.yml')) && /Production V2/.test(read('.github/workflows/business-office.yml')));
check('standalone deployment script exists', fs.existsSync(path.join(root,'scripts/deploy-business-office-standalone.sh')));
check('clean authenticated acceptance deployment exists', fs.existsSync(path.join(root,'scripts/deploy-business-office-clean-acceptance.sh')) && /clasp run/.test(read('scripts/deploy-business-office-clean-acceptance.sh')));
check('clean installation generator exists', fs.existsSync(path.join(root,'scripts/business-office/create-installation-plan.js')));

const result = {status:failures.length?'HOLD':'PASS', passes, failures};
const out = path.join(root,'artifacts','business-office-separation');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
process.exit(failures.length?1:0);
