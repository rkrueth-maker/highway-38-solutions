#!/usr/bin/env node
'use strict';

const fs=require('fs');
const os=require('os');
const path=require('path');
const vm=require('vm');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const failures=[],passes=[];
function check(name,condition,detail=''){(condition?passes:failures).push({name,detail});console[condition?'log':'error'](`${condition?'PASS':'FAIL'}: ${name}${detail?` — ${detail}`:''}`);}

const contractSource=read('apps-script/business-office/BusinessOffice_ModuleContract.gs');
const actionSource=read('apps-script/business-office/BusinessOffice_ActionContract.gs');
const accessSource=read('apps-script/business-office/BusinessOffice_ModuleAccess.gs');
const appRegistrySource=read('apps/business-office/BusinessOffice_ModuleRegistry.gs');
const reusableWeb=read('apps/business-office/BusinessOffice_Web.gs');
const builder=read('scripts/build-business-office-installation.js');
const boundaries=read('scripts/verify-source-boundaries.js');

for(const [name,source] of [['module contract',contractSource],['action contract',actionSource],['module access',accessSource],['compatibility app registry',appRegistrySource],['reusable web',reusableWeb],['installer builder',builder]]){try{new vm.Script(source,{filename:name});check(`${name} parses`,true);}catch(error){check(`${name} parses`,false,error.message);}}

const context={boAssert_:(condition,message)=>{if(!condition)throw new Error(message||'Assertion failed.');}};
try{
  vm.createContext(context);
  new vm.Script(contractSource).runInContext(context);
  const contract=context.boGetUnifiedModuleContract_();
  const moduleKeys=contract.modules.map(item=>item.module);
  const appKeys=[...appRegistrySource.matchAll(/\{key:'([^']+)'/g)].map(match=>match[1]);
  const appModules=[...appRegistrySource.matchAll(/modules:\[([^\]]*)\]/g)].flatMap(match=>[...match[1].matchAll(/'([^']+)'/g)].map(item=>item[1]));
  check('module contract keys are unique',new Set(moduleKeys).size===moduleKeys.length,`${moduleKeys.length} modules`);
  check('compatibility app keys are unique',appKeys.length>0&&new Set(appKeys).size===appKeys.length,`${appKeys.length} apps`);
  check('every compatibility app module resolves',appModules.every(key=>moduleKeys.includes(key)),[...new Set(appModules.filter(key=>!moduleKeys.includes(key)))].join(','));
  check('module dependency graph is acyclic',context.boGetUnifiedModuleDependencyOrder_().length===moduleKeys.length);
}catch(error){check('canonical contract evaluates',false,error.stack||error.message);}

check('reusable web derives schemas from contract',/boGetUnifiedBusinessDefinitions_\(\)/.test(reusableWeb)&&!/function boGetModuleDefinitions_\(\)\{return\{/.test(reusableWeb));
check('reusable web enforces action contract',/boGuardApiRequest_\(action,args\)/.test(reusableWeb));
check('module access delegates to action contract',/boModulesForApiAction_/.test(accessSource));
check('installer copies exact shared contracts',['BusinessOffice_ModuleContract.gs','BusinessOffice_ActionContract.gs','BusinessOffice_ModuleAccess.gs'].every(name=>builder.includes(`'apps-script/business-office/${name}'`)));
check('installer derives compatibility app keys',/matchAll\(\/\\\{key:/.test(builder)&&!/const apps=\[\s*'quote-builder'/.test(builder));
check('source boundary recognizes shared contracts',/sharedContracts/.test(boundaries)&&/BusinessOffice_ModuleContract\.gs/.test(boundaries));

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'h38-reusable-contract-'));
try{
  const build=spawnSync(process.execPath,[path.join(root,'scripts/build-business-office-installation.js'),'--pack','template-business','--mode','standalone','--out',temp],{cwd:root,encoding:'utf8'});
  if(build.stdout)process.stdout.write(build.stdout);
  if(build.stderr)process.stderr.write(build.stderr);
  check('clean template build passes',build.status===0,`exit ${build.status}`);
  if(build.status===0){
    const names=fs.readdirSync(temp);
    const manifest=JSON.parse(fs.readFileSync(path.join(temp,'installation-manifest.json'),'utf8'));
    check('generated template contains shared contracts',['BusinessOffice_ModuleContract.gs','BusinessOffice_ActionContract.gs','BusinessOffice_ModuleAccess.gs'].every(name=>names.includes(name)),names.join(','));
    check('generated manifest records contract version',manifest.moduleContractVersion==='2026-07-24-v2',manifest.moduleContractVersion||'missing');
    check('generated manifest is contract-driven',manifest.startupArchitecture==='contract-driven');
    const generatedWeb=fs.readFileSync(path.join(temp,'BusinessOffice_Web.gs'),'utf8');
    check('generated web has no duplicate schema list',!/function boGetModuleDefinitions_\(\)\{return\{/.test(generatedWeb));
    const generated=names.filter(name=>/\.(?:gs|html|json)$/.test(name)).map(name=>fs.readFileSync(path.join(temp,name),'utf8')).join('\n');
    check('template contains no Highway 38 deployment leakage',!/rkrueth|highway-38-solutions|AKfyc/i.test(generated));
  }
}catch(error){check('clean template build completes',false,error.stack||error.message);}finally{fs.rmSync(temp,{recursive:true,force:true});}

const boundary=spawnSync(process.execPath,[path.join(root,'scripts/verify-source-boundaries.js')],{cwd:root,encoding:'utf8'});
if(boundary.stdout)process.stdout.write(boundary.stdout);if(boundary.stderr)process.stderr.write(boundary.stderr);
check('source boundary verification passes',boundary.status===0,`exit ${boundary.status}`);

const result={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),moduleContractVersion:'2026-07-24-v2',externalActionsEnabled:false,passed:passes.length,failed:failures.length,passes,failures};
const outDir=path.join(root,'artifacts','reusable-business-office-contracts');fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));process.exit(failures.length?1:0);
