#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const registry=read('apps-script/business-office/BusinessOffice_ModuleRegistry.gs');
const contractSource=read('apps-script/business-office/BusinessOffice_ModuleContract.gs');
const moduleRegistrySource=read('apps-script/core-engine/owner-portal-next/Portal_Module_Registry.js');
const shell=read('apps-script/core-engine/owner-portal-next/Portal_UX_Client_Shell.html');
const architecture=read('apps-script/core-engine/owner-portal-next/Portal_ProductArchitecture.js');
const unified=read('apps-script/core-engine/owner-portal-next/Portal_Unified.js');
const applicationUx=read('apps-script/core-engine/owner-portal-next/Portal_Application_UX.js');
const aiAssistant=read('apps-script/business-office/BusinessOffice_AI_Assistant.gs');
const aiActions=read('apps-script/business-office/BusinessOffice_AI_Actions.gs');
const config=read('apps-script/business-office/BusinessOffice_Config.gs');
const failures=[],passes=[];
function check(name,condition,evidence=''){(condition?passes:failures).push({name,evidence});console[condition?'log':'error'](`${condition?'PASS':'FAIL'}: ${name}${evidence?` — ${evidence}`:''}`);}
for(const [name,source] of [['compatibility product registry',registry],['canonical module contract',contractSource],['unified module registry',moduleRegistrySource],['product architecture server',architecture],['unified shell',shell]]){try{new vm.Script(source,{filename:name});check(`${name} parses`,true);}catch(error){check(`${name} parses`,false,error.message);}}

const properties={OPENAI_API_KEY:'configured-for-test',BO_ENABLED_APPS:''};
const managerModules=[];
const sandbox={
  console,Object,Array,String,Number,Boolean,Math,JSON,Date,RegExp,Error,
  PropertiesService:{getScriptProperties(){return{getProperty(key){return properties[key]||'';}};}},
  H38_BO:{ROLES:['Owner','Administrator','Foreman','Estimator','Employee','Field Staff','Staff','Bookkeeper','Payroll','Viewer']},
  boNormalizeText_(value){return String(value==null?'':value).trim();},
  boAssert_(condition,message){if(!condition)throw new Error(message||'Assertion failed.');},
  boModuleEnabled_(){return true;},
  boRoleNames_(){return['Owner','Administrator','Foreman','Estimator','Employee','Field Staff','Staff','Bookkeeper','Payroll','Viewer','Customer'];},
  boAiEvents_(){return[{type:'ai_chat'},{type:'module_open'}];},
  h38PortalRequireUnifiedUser_(){return{ownerMode:true,role:'Owner',user:{'User ID':'USR-1',Email:'owner@example.com','Display Name':'Owner'}};},
  h38PortalModuleManager(){return{status:'PASS',ownerMode:true,modules:managerModules,recordsPreserved:true,externalActionsOccurred:false};},
  h38PortalApplicationModuleMeta_(){return{};},
  h38PortalApplicationRolesForModule_(){return['Owner','Administrator'];},
  h38PortalApplicationRecordCount_(){return 2;}
};

try{
  vm.createContext(sandbox);
  new vm.Script(contractSource,{filename:'BusinessOffice_ModuleContract.gs'}).runInContext(sandbox);
  const contract=sandbox.boGetUnifiedModuleContract_();
  contract.modules.forEach(item=>managerModules.push({key:item.module,label:item.label,purpose:item.key+' purpose',enabled:true,essential:item.essential,dependencies:item.dependencies,roles:['Owner','Administrator'],canView:true,recordCount:item.definition?1:0,recordsPreserved:true,lastUsed:'2026-07-23 12:00:00',lastUsedBy:'owner@example.com'}));
  new vm.Script(registry,{filename:'BusinessOffice_ModuleRegistry.gs'}).runInContext(sandbox);
  new vm.Script(moduleRegistrySource,{filename:'Portal_Module_Registry.js'}).runInContext(sandbox);
  new vm.Script(architecture,{filename:'Portal_ProductArchitecture.js'}).runInContext(sandbox);

  const moduleKeys=contract.modules.map(item=>item.module);
  const visibleRoutes=contract.modules.filter(item=>item.visible&&item.route).map(item=>item.route);
  const packs=sandbox.boGetProductPackCatalog_();
  const apps=sandbox.boGetBusinessAppCatalog_();
  const aliases=sandbox.boGetLegacyProductPackAliasMap_();
  const packKeys=packs.map(pack=>pack.key);
  check('contract contains unique modules',new Set(moduleKeys).size===moduleKeys.length,`${moduleKeys.length} modules`);
  check('all product pack modules resolve to contract',packs.every(pack=>(pack.modules||[]).every(key=>moduleKeys.includes(key))),packs.filter(pack=>(pack.modules||[]).some(key=>!moduleKeys.includes(key))).map(pack=>pack.key).join(','));
  check('all product pack dependencies resolve',packs.every(pack=>(pack.dependencies||[]).every(key=>packKeys.includes(key))),packs.map(pack=>pack.key).join(','));
  check('all compatibility app modules resolve to contract',apps.every(app=>(app.modules||[]).every(key=>moduleKeys.includes(key))),apps.filter(app=>(app.modules||[]).some(key=>!moduleKeys.includes(key))).map(app=>app.key).join(','));
  check('every compatibility app has an alias',apps.every(app=>aliases[app.key]),Object.keys(aliases).length+' aliases');
  check('every alias targets defined packs',Object.values(aliases).every(alias=>(alias.packKeys||[]).every(key=>packKeys.includes(key))),packKeys.join(','));
  check('five primary packs and five add-ons',packs.filter(pack=>pack.kind!=='addon').length===5&&packs.filter(pack=>pack.kind==='addon').length===5,`${packs.length} packs`);
  check('Operations retains Foreman and Employee',packs.find(pack=>pack.key==='operations').roleExperiences.join('|')==='Foreman|Employee');
  check('visible navigation is contract-derived',sandbox.h38PortalModuleRegistry_('quoteBuilder').flatMap(group=>group.items).length===visibleRoutes.length,`${visibleRoutes.length} routes`);
  check('retired product controls route is absent',!visibleRoutes.includes('bo:setup'));
  check('retired product and control bookmarks redirect safely',/'bo:setup':'moduleManager'/.test(shell)&&/route\.indexOf\('app:'\)===0/.test(shell)&&/control:'today'/.test(shell));
  check('unified bootstrap consumes central registry',/h38PortalModuleRegistry_\(/.test(unified)&&/moduleContractVersion/.test(unified));
  check('module disable preserves records',applicationUx.includes('recordsPreserved:true')&&applicationUx.includes('preservedRecordCount'));
  check('module changes require owner approval',applicationUx.includes('Owner approval is required to change installed modules.'));
  check('AI cannot modify source or deploy',aiAssistant.includes("never:['modify source code','deploy code'")&&aiActions.includes('Never plan source-code changes, deployments, permission changes, credential changes'));
  check('financial payroll and tax boundaries disabled',config.includes('DIRECT_PAYMENT_PROCESSING:false')&&config.includes('DIRECT_PAYROLL_FUNDING:false')&&config.includes('DIRECT_TAX_FILING:false'));

  const snapshot=sandbox.h38PortalProductArchitecture();
  check('runtime product architecture returns PASS',snapshot.status==='PASS');
  check('runtime returns every compatibility product',snapshot.legacyProducts.length===apps.length,`${snapshot.legacyProducts.length} products`);
  check('runtime retains protected roles',['Owner','Administrator','Foreman','Employee','Bookkeeper','Payroll','Viewer','Staff','Estimator','Field Staff','Customer'].every(role=>snapshot.allRoles.includes(role)));
  check('runtime H38 AI is available through Core',snapshot.moduleAvailability.h38Ai.enabled===true&&snapshot.moduleAvailability.h38Ai.packMembership.includes('h38-core'));
  check('runtime preserves compatibility metadata and records',snapshot.legacyRoutesPreserved===true&&snapshot.existingRecordsPreserved===true&&snapshot.migrationMode==='alias-only');
  check('runtime performs no automatic changes',snapshot.automaticInstallOrEnable===false&&snapshot.externalActionsOccurred===false);
  const resolved=sandbox.h38PortalResolveLegacyProduct('shop-flow-manager');
  check('runtime resolves legacy product to add-on',resolved.status==='PASS'&&resolved.alias.primaryPack==='shop-flow-manufacturing'&&resolved.legacyRoutePreserved===true);
}catch(error){check('product architecture runtime simulation',false,error.stack||error.message);}

const forbidden=[/setProperty\s*\(/,/h38PortalSetModuleOverride\s*\(/,/boSaveRecord\s*\(/,/GmailApp\.sendEmail/,/MailApp\.sendEmail/,/UrlFetchApp\.fetch/,/createDeployment/i];
for(const pattern of forbidden)check(`architecture has no protected write ${pattern}`,!pattern.test(architecture));
const result={status:failures.length?'HOLD':'PASS',passes:passes.length,failures};
const outDir=path.join(root,'artifacts','product-architecture');fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(`\nRESULT: ${result.status} (${passes.length} pass, ${failures.length} fail)`);process.exit(failures.length?1:0);
