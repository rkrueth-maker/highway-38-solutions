#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const childProcess=require('child_process');
const ROOT=path.resolve(__dirname,'..');
const governance=childProcess.spawnSync(process.execPath,[path.join(__dirname,'verify-change-governance.js')],{cwd:ROOT,encoding:'utf8'});
if(governance.stdout)process.stdout.write(governance.stdout);
if(governance.stderr)process.stderr.write(governance.stderr);
if(governance.status!==0)process.exit(governance.status||1);

const PORTAL=path.join(ROOT,'apps-script','core-engine','owner-portal-next');
const BUSINESS=path.join(ROOT,'apps-script','business-office');
const EVIDENCE=path.join(ROOT,'launch-control','evidence','unified-app-architecture-verification.json');
const pass=[];
const failures=[];
function check(name,condition,detail=''){(condition?pass:failures).push({name,detail});}
function read(file){return fs.readFileSync(file,'utf8');}
function exists(file){return fs.existsSync(file);}

const files={
  contract:path.join(BUSINESS,'BusinessOffice_ModuleContract.gs'),
  actions:path.join(BUSINESS,'BusinessOffice_ActionContract.gs'),
  access:path.join(BUSINESS,'BusinessOffice_ModuleAccess.gs'),
  web:path.join(BUSINESS,'BusinessOffice_Web.gs'),
  registry:path.join(PORTAL,'Portal_Module_Registry.js'),
  unified:path.join(PORTAL,'Portal_Unified.js'),
  repository:path.join(PORTAL,'Portal_Repository.js'),
  services:path.join(PORTAL,'Portal_Services.js'),
  index:path.join(PORTAL,'Portal_Index.html'),
  raw:path.join(PORTAL,'Portal_RawIncludes.js'),
  shell:path.join(PORTAL,'Portal_UX_Client_Shell.html'),
  experienceCore:path.join(PORTAL,'Portal_Experience_Client_Core.html'),
  workspace:path.join(PORTAL,'Portal_Experience_Client_Workspace.html'),
  boot:path.join(PORTAL,'Portal_UX_Client_Boot.html'),
  styles:path.join(PORTAL,'Portal_Product_Styles.html'),
  client:path.join(PORTAL,'Portal_Product_Client.html'),
  linkedClient:path.join(PORTAL,'Portal_LinkedOffices_Client.html'),
  linkedServer:path.join(ROOT,'business-packs','highway38','apps-script','BusinessOffice_LinkedOffices.gs'),
  businessConfig:path.join(BUSINESS,'BusinessOffice_Config.gs'),
  businessCore:path.join(BUSINESS,'BusinessOffice_Core.gs'),
  businessPack:path.join(BUSINESS,'BusinessOffice_BusinessPack.gs'),
  taskMessaging:path.join(BUSINESS,'BusinessOffice_TaskMessaging_10_Core.gs'),
  publicPortal:path.join(ROOT,'portal.html'),
  manifest:path.join(BUSINESS,'BusinessOffice_ClientManifest.gs'),
  obsoletePolish:path.join(BUSINESS,'BusinessOffice_AI_Native_UX_Client.html'),
  obsoleteControl:path.join(BUSINESS,'BusinessOffice_ControlPlane_Client.html'),
  obsoleteControlLive:path.join(BUSINESS,'BusinessOffice_ControlPlane_Live_Client.html'),
  obsoleteApps:path.join(BUSINESS,'BusinessOffice_Modular_Suite.html'),
  rules:path.join(ROOT,'docs','architecture','UNIFIED_APP_CHANGE_RULES.md'),
  agents:path.join(ROOT,'AGENTS.md'),
  assetManifest:path.join(ROOT,'scripts','config','approved-public-assets.json'),
  assemblyVerifier:path.join(ROOT,'scripts','verify-unified-source-assembly.js')
};
const legacyPortalUi=['Portal_ControlPlane_Client.html','Portal_ControlPlane_Live_Client.html','Portal_ControlPlane_Styles.html','Portal_ProductApps_Client.html','Portal_ProductCenter_Client.html','Portal_ProductCenter_Styles.html','Portal_Product_Unification_Styles.html'].map(name=>path.join(PORTAL,name));
Object.entries(files).forEach(([name,file])=>{if(name.startsWith('obsolete'))return;check(name+' exists',exists(file),path.relative(ROOT,file));});

if(failures.length===0){
  const contractSource=read(files.contract),actionsSource=read(files.actions),accessSource=read(files.access),webSource=read(files.web),registrySource=read(files.registry),unifiedSource=read(files.unified),repositorySource=read(files.repository),servicesSource=read(files.services),indexSource=read(files.index),rawSource=read(files.raw),shellSource=read(files.shell),experienceCoreSource=read(files.experienceCore),workspaceSource=read(files.workspace),bootSource=read(files.boot),styleSource=read(files.styles),clientSource=read(files.client),linkedClientSource=read(files.linkedClient),linkedServerSource=read(files.linkedServer),businessConfigSource=read(files.businessConfig),businessCoreSource=read(files.businessCore),businessPackSource=read(files.businessPack),taskMessagingSource=read(files.taskMessaging),publicPortalSource=read(files.publicPortal),manifestSource=read(files.manifest),rulesSource=read(files.rules),agentsSource=read(files.agents);
  [
    ['module contract',contractSource],['action contract',actionsSource],['module access',accessSource],['Business Office web',webSource],['module registry',registrySource],['unified bootstrap',unifiedSource],['portal repository',repositorySource],['portal services',servicesSource],['Business Office config',businessConfigSource],['Business Office core',businessCoreSource],['Business Office pack',businessPackSource],['linked office server',linkedServerSource],['task messaging core',taskMessagingSource],['unified shell client',shellSource],['product client',clientSource]
  ].forEach(([name,source])=>{try{new vm.Script(source,{filename:name});check(name+' syntax',true);}catch(error){check(name+' syntax',false,error.message);}});
  try{new vm.Script(experienceCoreSource+'\n'+workspaceSource+'\n'+bootSource+'\n'+linkedClientSource,{filename:'Portal_Client_Foundation.html'});check('portal client foundation syntax',true);}catch(error){check('portal client foundation syntax',false,error.message);}

  const context={boAssert_:(condition,message)=>{if(!condition)throw new Error(message||'assertion failed');}};
  try{
    vm.createContext(context);
    new vm.Script(contractSource).runInContext(context);
    new vm.Script(registrySource).runInContext(context);
    const contract=context.boGetUnifiedModuleContract_();
    const groups=context.h38PortalModuleRegistry_('quoteBuilder');
    const modules=contract.modules||[],visible=modules.filter(item=>item.visible===true&&item.route),moduleKeys=modules.map(item=>item.module),routes=visible.map(item=>item.route),groupIds=(contract.groups||[]).map(group=>group.id);
    check('contract returns seven groups',(contract.groups||[]).length===7,groupIds.join(','));
    check('contract module keys are unique',new Set(moduleKeys).size===moduleKeys.length,moduleKeys.join(','));
    check('visible routes are unique',new Set(routes).size===routes.length,routes.join(','));
    check('every module has one gate owner and lifecycle',modules.every(item=>item.module&&item.gate&&item.dataOwner&&item.serverOwner&&item.clientOwner&&item.disablePolicy&&item.loadStrategy&&Number.isFinite(Number(item.cacheTtlSeconds))),modules.length+' modules');
    check('every dependency resolves',modules.every(item=>(item.dependencies||[]).every(key=>moduleKeys.includes(key))),modules.filter(item=>(item.dependencies||[]).some(key=>!moduleKeys.includes(key))).map(item=>item.module).join(','));
    check('every visible module belongs to a group',visible.every(item=>groupIds.includes(item.group)),visible.filter(item=>!groupIds.includes(item.group)).map(item=>item.module).join(','));
    check('navigation is fully contract-derived',groups.reduce((sum,group)=>sum+group.items.length,0)===visible.length,groups.reduce((sum,group)=>sum+group.items.length,0)+'/'+visible.length);
    check('required spaces exist',['Today','Customers','Work','Money','Documents','Growth','Office'].every(label=>groups.some(group=>group.label===label)),groups.map(group=>group.label).join(','));
    check('Office replaces Control group',groups.some(group=>group.id==='office'&&group.label==='Office')&&!groups.some(group=>group.id==='control'||group.label==='Control'));
    check('core direct workspaces exist',['today','bo:assignedTasks','bo:requests','bo:customers','bo:quotes','bo:jobs','bo:invoices','bo:documents','moduleManager','proof','errors'].every(key=>routes.includes(key)),routes.join(','));
    check('legacy Product Controls route is absent',!routes.includes('bo:setup'));
    check('dependency graph is acyclic',context.boGetUnifiedModuleDependencyOrder_().length===modules.length,String(modules.length));
  }catch(error){check('module contract evaluates',false,error.stack||error.message);}

  check('registry contains no module declarations',!/key:'bo:|key:'today'|label:'Customers'/.test(registrySource));
  check('registry reads canonical contract',/boGetUnifiedModuleContract_\(/.test(registrySource));
  check('Business Office schemas read canonical contract',/boGetUnifiedBusinessDefinitions_\(/.test(webSource)&&!/requests:\{title:/.test(webSource));
  check('API permissions read canonical action contract',/boModulesForApiAction_\(/.test(accessSource)&&!/if\(action===/.test(accessSource));
  check('bootstrap reads central registry',/h38PortalModuleRegistry_\(/.test(unifiedSource));
  check('bootstrap exposes lifecycle metadata',['dependencies:item.dependencies','loadStrategy:item.loadStrategy','cacheTtlSeconds:item.cacheTtlSeconds','dataOwner:item.dataOwner','disablePolicy:item.disablePolicy'].every(marker=>unifiedSource.includes(marker)));
  check('startup uses one browser RPC',/function h38PortalStartupBundle\(/.test(unifiedSource)&&/rpcCount:1/.test(unifiedSource)&&/call\('h38PortalStartupBundle'\)/.test(clientSource));
  check('startup defers task messaging schema verification',!/h38TmEnsureSchema_\(\)/.test(unifiedSource)&&/schemaChecksDeferred:true/.test(unifiedSource));
  check('startup reports phase timing and payload size',/phaseMs:phases/.test(unifiedSource)&&/payloadCharacters/.test(unifiedSource));
  check('portal repository caches spreadsheet, install status, and list reads',/H38_PORTAL_SPREADSHEET_CACHE_/.test(repositorySource)&&/H38_PORTAL_INSTALLED_STATUS_CACHE_/.test(repositorySource)&&/H38_PORTAL_LIST_CACHE_/.test(repositorySource));
  check('task projection is request cached',/H38_PORTAL_TASK_PROJECTION_CACHE_/.test(servicesSource)&&/h38PortalCloneRows_\(H38_PORTAL_TASK_PROJECTION_CACHE_\)/.test(servicesSource));
  check('Business Office spreadsheet is request cached',/H38_BO_SPREADSHEET_CACHE_/.test(businessConfigSource));
  check('pack snapshots preserve storage and setup identity',/storage: pack\.storage \|\| \{\}/.test(businessPackSource)&&/setup: pack\.setup \|\| \{\}/.test(businessPackSource)&&/package: pack\.package \|\| \{\}/.test(businessPackSource));
  check('record saves expose optional business-pack folder automation',/typeof boAfterBusinessRecordSave_ === 'function'/.test(businessCoreSource)&&/Record folder automation/.test(businessCoreSource));
  check('task messaging schema is version gated and locked',/H38_TM_SCHEMA_VERSION/.test(taskMessagingSource)&&/H38_TM_SCHEMA_PROPERTY/.test(taskMessagingSource)&&/LockService\.getScriptLock\(\)/.test(taskMessagingSource));
  check('startup begins without artificial delay',/requestAnimationFrame\(launch\)/.test(bootSource)&&!/setTimeout\(launch,100\)/.test(bootSource));
  check('product client renders immediate loading skeleton',/data-h38-workspace-state="loading"/.test(clientSource)&&/h38ProductLoadingState\(\)/.test(clientSource));
  check('product client owns refresh',/window\.refresh=h38ProductRefresh/.test(clientSource));
  check('page-wide MutationObserver removed',!/MutationObserver/.test(clientSource));
  check('secondary modules remain on demand',/secondaryModulesDeferred:true/.test(unifiedSource)&&/loadStrategy:'on-demand'/.test(contractSource));
  check('portal loads product styles',indexSource.includes("h38PortalRawInclude_('Portal_Product_Styles')"));
  check('portal loads product client',indexSource.includes("h38PortalRawInclude_('Portal_Product_Client')"));
  check('portal loads linked office control',indexSource.includes("h38PortalRawInclude_('Portal_LinkedOffices_Client')"));
  check('linked office client uses owner-only server configuration',/h38LinkedOfficeConfig/.test(linkedClientSource)&&/target='_blank'/.test(linkedClientSource)&&/rel='noopener'/.test(linkedClientSource));
  check('H38 linked office service requires Owner and opens isolated Northern Lakes deployment',/boRequireOwner_\(\)/.test(linkedServerSource)&&/AKfycbzQVvg-1E0ofK5QuBseKjTdJ5NhEjtArvbHxVCO_W329BbZxfSO0F6ENJd5zgvMLGaL/.test(linkedServerSource)&&/isolated:true/.test(linkedServerSource));
  check('portal has one top bar',(indexSource.match(/id="ownerTopbar"/g)||[]).length===1);
  check('portal has one navigation host',(indexSource.match(/id="nav"/g)||[]).length===1);
  check('portal keeps approved logo host',(indexSource.match(/id="h38PortalLogo"/g)||[]).length===1);
  check('legacy portal UI files are deleted',legacyPortalUi.every(file=>!exists(file)),legacyPortalUi.filter(exists).map(file=>path.basename(file)).join(','));
  check('legacy portal UI is not included',!/(Portal_ControlPlane|Portal_ProductApps|Portal_ProductCenter|Portal_Product_Unification)/.test(indexSource+rawSource));
  check('retired routes redirect into unified workspaces',/control:'today'/.test(shellSource)&&/'bo:setup':'moduleManager'/.test(shellSource)&&/route\.indexOf\('app:'\)===0/.test(shellSource));
  check('legacy experience core no longer owns navigation or routing',!/(function\s+renderNav\s*\(|function\s+refresh\s*\(|function\s+show\s*\(|Command Center)/.test(experienceCoreSource));
  check('settings no longer renders retired catalog panel',/function\s+renderSettings\s*\(/.test(workspaceSource)&&!/BOOT(?:&&BOOT)?\.catalog|<h2>Catalog<\/h2>|System Settings & Safety/.test(workspaceSource));
  check('workspace no longer starts a competing refresh',!/\nrefresh\(\);?\s*$/.test(workspaceSource));
  check('hash changes synchronize the visible workspace',/addEventListener\('hashchange'/.test(bootSource)&&/h38SyncWorkspaceFromHash/.test(bootSource)&&/await show\(requested\)/.test(bootSource));
  check('public portal is one automatic unified gateway',/location\.replace\(target\)/.test(publicPortalSource)&&/Opening Highway 38 Business Office/.test(publicPortalSource)&&!/Choose where to open|Enter Command Center|Enter Business Office|class="choices"/.test(publicPortalSource));
  check('obsolete Business Office UI files deleted',!exists(files.obsoletePolish)&&!exists(files.obsoleteControl)&&!exists(files.obsoleteControlLive)&&!exists(files.obsoleteApps));
  check('design system owns all major components',['#ownerTopbar','.nav-group-items','#view','.tablewrap','.drawer-panel','#h38-ai-panel','@media(max-width:800px)'].every(marker=>styleSource.includes(marker)),styleSource.length+' bytes');
  check('change rules lock logo',/logo is locked/i.test(rulesSource)&&/may not be redrawn/i.test(rulesSource));
  check('change rules require registry',/BusinessOffice_ModuleContract\.gs|Portal_Module_Registry\.js/.test(rulesSource));
  check('change rules require deployment authority',/Deploy Unified Owner Portal/.test(rulesSource));
  check('existing asset authority remains',/Approved Asset Authority/.test(agentsSource)&&/controlled binary/.test(agentsSource));
  check('approved asset manifest remains present',exists(files.assetManifest));
  const assembly=childProcess.spawnSync(process.execPath,[files.assemblyVerifier],{cwd:ROOT,encoding:'utf8'});
  if(assembly.stdout)process.stdout.write(assembly.stdout);if(assembly.stderr)process.stderr.write(assembly.stderr);
  check('deterministic unified source assembly',assembly.status===0,'exit '+assembly.status);
}

const evidence={status:failures.length?'FAIL':'PASS',generatedAt:new Date().toISOString(),architecture:'single-contract-office-registry-v4',governance:'website-and-web-app-governance-v1',logoLocked:true,performance:{startupRpcBudget:1,pageWideObserversAllowed:0,secondaryModules:'on-demand'},passed:pass.length,failed:failures.length,pass,failures};
fs.mkdirSync(path.dirname(EVIDENCE),{recursive:true});
fs.writeFileSync(EVIDENCE,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
process.exit(failures.length?1:0);
