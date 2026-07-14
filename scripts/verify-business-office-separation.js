#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { loadPack, validatePack } = require('./business-office/lib/business-pack');
const root = path.resolve(__dirname, '..');
const failures = [];
const passes = [];
const check = (name, condition, detail='') => (condition ? passes : failures).push({name, detail});
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

for (const packName of ['highway38','template-business']) {
  try {
    const pack = loadPack(root, packName);
    check(`${packName} pack validates`, validatePack(pack).length === 0);
  } catch (error) { check(`${packName} pack validates`, false, error.message); }
}
const templateText = read('business-packs/template-business/business-pack.json') + read('business-packs/template-business/apps-script/BusinessOffice_Pack.gs');
check('template contains no Highway 38 identity', !/Highway 38|rkrueth|AKfyc|1kDDKW|1Vq8Uj|11ak4Q/i.test(templateText));
check('template catalog starts empty', /"requiredProductCount": 0/.test(templateText) && /"requiredBundleCount": 0/.test(templateText));
check('template uses generic property keys', /BUSINESS_OFFICE_SPREADSHEET_ID/.test(templateText) && !/H38_BUSINESS_OFFICE_SPREADSHEET_ID/.test(templateText));
check('Highway 38 pack keeps approved catalog counts', /"requiredProductCount": 15/.test(read('business-packs/highway38/business-pack.json')) && /"requiredBundleCount": 9/.test(read('business-packs/highway38/business-pack.json')));
check('architecture application boundaries exist', ['apps/highway38-website/README.md','apps/highway38-owner-portal/README.md','apps/business-office/README.md'].every(rel => fs.existsSync(path.join(root, rel))));
check('shared package boundaries exist', ['core-engine','authentication','roles-permissions','document-intake','ocr','pdf-generation','accounting','payroll-preparation','tax-preparation','approval-engine','audit-logging','error-logging','shared-ui'].every(name => fs.existsSync(path.join(root,'packages',name,'README.md'))));
check('core business pack loader exists', fs.existsSync(path.join(root,'apps-script/business-office/BusinessOffice_BusinessPack.gs')));
check('Highway 38 deployment assembles Highway 38 pack', /business-packs\/highway38\/apps-script\/BusinessOffice_Pack\.gs/.test(read('scripts/deploy-unified-owner-portal-web.sh')));
check('standalone deployment script exists', fs.existsSync(path.join(root,'scripts/deploy-business-office-standalone.sh')));
check('clean installation generator exists', fs.existsSync(path.join(root,'scripts/business-office/create-installation-plan.js')));

const result = {status:failures.length?'HOLD':'PASS', passes, failures};
const out = path.join(root,'artifacts','business-office-separation');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
process.exit(failures.length?1:0);
