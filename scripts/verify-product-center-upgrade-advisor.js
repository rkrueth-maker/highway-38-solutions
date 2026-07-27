#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const files={
  productCenter:'apps-script/core-engine/owner-portal-next/Portal_ProductCenter.js',
  advisor:'apps-script/core-engine/owner-portal-next/Portal_UpgradeAdvisor.js',
  client:'apps-script/core-engine/owner-portal-next/Portal_Application_Client_Views.html',
  styles:'apps-script/core-engine/owner-portal-next/Portal_Application_UX_Styles.html',
  index:'apps-script/core-engine/owner-portal-next/Portal_Index.html',
  raw:'apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js',
  aiAssistant:'apps-script/business-office/BusinessOffice_AI_Assistant.gs'
};
const failures=[],passes=[];
function check(name,condition,evidence=''){(condition?passes:failures).push({name,evidence});console.log(`${condition?'PASS':'FAIL'}: ${name}${evidence?` — ${evidence}`:''}`);}
Object.keys(files).forEach(key=>check(`required ${files[key]}`,fs.existsSync(path.join(root,files[key]))));
if(failures.length){console.error('Required current Product Center ownership files are missing.');process.exit(1);}
const productCenter=read(files.productCenter),advisor=read(files.advisor),client=read(files.client),styles=read(files.styles),index=read(files.index),raw=read(files.raw),aiAssistant=read(files.aiAssistant);
for(const [name,source] of [['Product Center server',productCenter],['Upgrade Advisor server',advisor],['Apps and Modules client',client],['H38 AI assistant',aiAssistant]]){try{new vm.Script(source,{filename:name});check(`${name} parses`,true);}catch(error){check(`${name} parses`,false,error.message);}}
check('Product Center remains owner-only',productCenter.includes('Owner access is required for Product Center.'));
check('Product Center groups installed available and add-ons',['installedPacks','availablePacks','specialistAddOns'].every(marker=>productCenter.includes(marker)));
check('Product Center exposes records roles dependencies and last used',['recordCount','roleVisibility','dependencies','lastUsed'].every(marker=>productCenter.includes(marker)));
check('pack changes require exact Owner confirmation',productCenter.includes("exactConfirmation:'ENABLE PACK'")&&productCenter.includes('Type ENABLE PACK'));
check('pack action never disables modules',productCenter.includes("action==='ENABLE'")&&productCenter.includes('automaticDisable:false')&&productCenter.includes('noModuleDisabled:true'));
check('pack action never purchases',productCenter.includes('noPurchaseOccurred:true')&&productCenter.includes('No purchase'));
check('pack action preserves records and permissions',productCenter.includes('existingRecordsPreserved:true')&&productCenter.includes('permissionsPreserved:true'));
check('Upgrade Advisor stores all required statuses',['New','Reviewed','Postponed','Dismissed','Accepted'].every(status=>advisor.includes(`'${status}'`)));
check('Upgrade Advisor returns all required recommendation fields',['title','recommendationType','evidence','businessProblem','expectedBenefit','effortLevel','possibleCostImpact','dependencies','permissionDataImpact','migrationSteps','ownerApprovalRequired'].every(marker=>advisor.includes(marker)));
check('deterministic signals cover operating evidence',['workflow_error','Overdue open tasks','Overlapping dated commitments','Active jobs','Active employees','Quotes on file','Overdue invoices','Receipts awaiting review','Equipment records','Repeated AI coaching requests','Recent module opens','Prerequisites ready'].every(marker=>advisor.includes(marker)));
check('existing H38 AI uses deterministic Advisor first',aiAssistant.includes("typeof h38PortalUpgradeAdvisor==='function'")&&aiAssistant.includes('boAiTelemetryRecommendations_')&&aiAssistant.includes('acceptedDoesNotInstallOrEnable:true'));
check('Advisor cannot install or enable',advisor.includes('aiMayInstallOrEnable:false')&&advisor.includes('acceptedRecommendationsDoNotApplyChanges:true')&&advisor.includes('automaticInstallOrEnable:false'));
check('AI explanation is optional and guarded',advisor.includes('deterministicSignalsFirst:true')&&advisor.includes('aiExplanationOptional:true')&&advisor.includes('Do not claim any product, module, permission'));
check('Apps and Modules owns the current configuration renderer',client.includes('async function h38RenderModuleManager()')&&client.includes('<h1>Apps & Modules</h1>'));
check('current module cards expose operating evidence',['Records','Roles','Dependencies:','Last used:','Turning this off preserves'].every(marker=>client.includes(marker)));
check('module changes remain explicit and record-preserving',client.includes('async function h38ToggleModule')&&client.includes('Existing records, proof, errors, and audit history will remain.')&&client.includes('Dependent modules:'));
check('shared application styles own responsive module controls',styles.includes('.module-manager-grid')&&styles.includes('.module-card')&&styles.includes('@media(max-width:800px)'));
check('Portal index includes current shared styles and client',index.includes("h38PortalRawInclude_('Portal_Application_UX_Styles')")&&index.includes("h38PortalRawInclude_('Portal_Application_Client_Views')"));
check('raw include allowlist includes current shared fragments',raw.includes("'Portal_Application_UX_Styles'")&&raw.includes("'Portal_Application_Client_Views'"));
check('no obsolete Product Center fragments are required',!index.includes("Portal_ProductCenter_Client")&&!index.includes("Portal_ProductCenter_Styles")&&!raw.includes("'Portal_ProductCenter_Client'")&&!raw.includes("'Portal_ProductCenter_Styles'"));
const result={status:failures.length?'HOLD':'PASS',passes:passes.length,failures};
const out=path.join(root,'artifacts','product-center-upgrade-advisor');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(`\nRESULT: ${result.status} (${passes.length} pass, ${failures.length} fail)`);
process.exit(failures.length?1:0);
