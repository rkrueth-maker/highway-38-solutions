#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');
const failures=[];const passes=[];
function check(name,condition,detail=''){(condition?passes:failures).push({name,detail});console.log(`${condition?'PASS':'FAIL'}: ${name}${detail?' — '+detail:''}`);}
function read(p){return fs.readFileSync(path.join(root,p),'utf8');}
function withoutCanonicalContractIdentifiers(text){return String(text||'').replace(/\bH38_UNIFIED_[A-Z0-9_]+\b/g,'').replace(/\bH38_BO_ACTION_CONTRACT_VERSION\b/g,'');}
const neutralRoots=['packages/business-office-core','packages/business-office-control-plane','packages/authentication','packages/document-intake','packages/accounting','packages/payroll-preparation','packages/shared-ui','apps/business-office'];
let neutral='';
for(const start of neutralRoots){const stack=[path.join(root,start)];while(stack.length){const p=stack.pop();for(const n of fs.readdirSync(p)){const f=path.join(p,n);if(fs.statSync(f).isDirectory())stack.push(f);else neutral+=fs.readFileSync(f,'utf8')+'\n';}}}
check('neutral core contains no Highway 38 identity',!/Highway\s*38|rkrueth|highway-38-solutions/i.test(neutral));
check('neutral core contains no business-specific H38 identifiers',!(/\bH38(?:_|\b)/.test(withoutCanonicalContractIdentifiers(neutral))));
check('neutral core contains no live resource IDs',!/(?:\b1[A-Za-z0-9_-]{20,}\b|\bAKfyc[A-Za-z0-9_-]{15,}\b)/.test(neutral));
check('neutral control plane contains assigned task and field services',/function boTaskAssign_/.test(neutral)&&/function boControlClockIn_/.test(neutral)&&/function boControlSaveTaskProof_/.test(neutral)&&/function boControlCaptureReceipt_/.test(neutral));
check('neutral Equipment Manager contains asset assignment inspection service and return controls',/function boEquipmentSaveAsset_/.test(neutral)&&/function boEquipmentAssign_/.test(neutral)&&/function boEquipmentInspect_/.test(neutral)&&/function boEquipmentService_/.test(neutral)&&/function boEquipmentReturn_/.test(neutral));
check('neutral equipment photos and events remain private and internal',/Equipment Checkout Photo/.test(neutral)&&/Equipment Inspection Photo/.test(neutral)&&/BO Equipment Events/.test(neutral)&&/accountingPosted:false/.test(neutral));
check('neutral Social Control keeps provider publishing locked',/External social publishing is locked\./.test(neutral)&&!/UrlFetchApp\s*\.\s*fetch/.test(neutral));
check('neutral cellphone UI uses large actions and rear camera',/min-height:94px/.test(neutral)&&/capture="environment"/.test(neutral)&&/Scan receipt/i.test(neutral)&&/Assign \/ check out/.test(neutral));
const h38=JSON.parse(read('business-packs/highway38/business-office.config.json'));
const template=JSON.parse(read('business-packs/template-business/business-office.config.json'));
const templatePack=JSON.parse(read('business-packs/template-business/business-pack.json'));
const templateEmbedded=read('business-packs/template-business/apps-script/BusinessOffice_Pack.gs');
check('Highway 38 pack carries Highway 38 identity',h38.business.id==='H38'&&/Highway 38/.test(h38.branding.businessName));
check('Highway 38 pack uses property references rather than embedded resource IDs',Object.values(h38.resources.propertyKeys).every(v=>/^[A-Z0-9_]+$/.test(v)));
check('template pack is neutral',!/Highway\s*38|rkrueth|highway-38-solutions|H38_/i.test(JSON.stringify(template)));
check('template business pack support is neutral and opt-in',templatePack.support.enabled===false&&templatePack.support.customerVisible===false&&templatePack.support.provider===''&&Array.isArray(templatePack.support.accounts)&&templatePack.support.accounts.length===0&&!/Highway\s*38|rkrueth|highway-38-solutions|H38_/i.test(JSON.stringify(templatePack)));
check('template embedded pack contains no support identity',!/Highway\s*38|rkrueth|highway-38-solutions|H38_/i.test(withoutCanonicalContractIdentifiers(templateEmbedded)));
check('template pack has empty catalog',template.catalog.mode==='empty'&&template.validation.expectedProductCount===0&&template.validation.expectedBundleCount===0);
check('template pack retains safety boundaries',template.tax.directFiling===false&&template.social.externalActionsEnabled===false&&template.social.automaticPublishingEnabled===false&&template.social.bulkPublishingEnabled===false);
check('template pack declares nine credential roles',['Owner','Administrator','Foreman','Estimator','Field Staff','Staff','Bookkeeper','Payroll','Viewer'].every(role=>template.defaults.roles.includes(role)));
check('both packs enable equipment assets',h38.modules.equipment===true&&template.modules.equipment===true);
for(const [pack,mode] of [['highway38','combined'],['template-business','standalone']]){
 const out=path.join(root,'artifacts','separate-business-office-platform','builds',`${pack}-${mode}`);
 cp.execFileSync(process.execPath,[path.join(root,'scripts/build-business-office-installation.js'),'--pack',pack,'--mode',mode,'--out',out],{stdio:'inherit'});
 check(`${pack} ${mode} bundle generated`,fs.existsSync(path.join(out,'installation-manifest.json')));
 const names=fs.readdirSync(out),all=names.filter(n=>/\.(gs|html|json)$/.test(n)).map(n=>fs.readFileSync(path.join(out,n),'utf8')).join('\n');
 ['BusinessOffice_ControlRules.gs','BusinessOffice_EquipmentRules.gs','BusinessOffice_TaskCore.gs','BusinessOffice_ControlCore.gs','BusinessOffice_EquipmentCore.gs','BusinessOffice_ControlLive.gs','BusinessOffice_ControlPlane.html','BusinessOffice_ControlPlane_Routes.html','BusinessOffice_Equipment.html'].forEach(file=>check(`${pack} bundle includes ${file}`,names.includes(file)));
 check(`${pack} bundle includes Field Operations Equipment and Social Control`,all.includes("key:'field-operations'")&&all.includes("key:'equipment-asset-manager'")&&all.includes("key:'social-control'"));
 check(`${pack} bundle keeps social external actions disabled`,all.includes('External social publishing is locked.')&&!/UrlFetchApp\s*\.\s*fetch/.test(all));
 check(`${pack} bundle keeps equipment financial actions internal`,all.includes('accountingPosted:false')&&all.includes('expenseCreated:false'));
 if(pack==='template-business')check('clean bundle has no Highway 38 branding or resource leakage',!/Highway\s*38|rkrueth|highway-38-solutions|H38_|AKfyc/i.test(withoutCanonicalContractIdentifiers(all)));
}
const result={status:failures.length?'HOLD':'PASS',passes,failures};
const outDir=path.join(root,'artifacts','separate-business-office-platform');fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'separation-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(`RESULT: ${result.status}`);process.exit(failures.length?1:0);
