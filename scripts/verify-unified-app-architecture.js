#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const childProcess=require('child_process');
const ROOT=path.resolve(__dirname,'..');
const PORTAL=path.join(ROOT,'apps-script','core-engine','owner-portal-next');
const BUSINESS=path.join(ROOT,'apps-script','business-office');
const EVIDENCE=path.join(ROOT,'launch-control','evidence','unified-app-architecture-verification.json');
const pass=[];
const failures=[];

function check(name,condition,detail=''){
  (condition?pass:failures).push({name,detail});
}
function read(file){return fs.readFileSync(file,'utf8');}
function exists(file){return fs.existsSync(file);}

const files={
  registry:path.join(PORTAL,'Portal_Module_Registry.js'),
  unified:path.join(PORTAL,'Portal_Unified.js'),
  index:path.join(PORTAL,'Portal_Index.html'),
  styles:path.join(PORTAL,'Portal_Product_Styles.html'),
  client:path.join(PORTAL,'Portal_Product_Client.html'),
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

Object.entries(files).forEach(([name,file])=>{
  if(name.startsWith('obsolete'))return;
  check(name+' exists',exists(file),path.relative(ROOT,file));
});

if(failures.length===0){
  const registrySource=read(files.registry);
  const unifiedSource=read(files.unified);
  const indexSource=read(files.index);
  const styleSource=read(files.styles);
  const clientSource=read(files.client);
  const manifestSource=read(files.manifest);
  const rulesSource=read(files.rules);
  const agentsSource=read(files.agents);

  try{new vm.Script(registrySource,{filename:'Portal_Module_Registry.js'});check('module registry syntax',true);}catch(error){check('module registry syntax',false,error.message);}
  try{new vm.Script(unifiedSource,{filename:'Portal_Unified.js'});check('unified bootstrap syntax',true);}catch(error){check('unified bootstrap syntax',false,error.message);}
  try{new vm.Script(clientSource,{filename:'Portal_Product_Client.html'});check('product client syntax',true);}catch(error){check('product client syntax',false,error.message);}

  const context={};
  try{
    vm.createContext(context);
    new vm.Script(registrySource).runInContext(context);
    const groups=context.h38PortalModuleRegistry_('quoteBuilder');
    check('registry returns groups',Array.isArray(groups)&&groups.length>=7,String(groups&&groups.length));
    const groupIds=[];
    const routeKeys=[];
    (groups||[]).forEach(group=>{
      groupIds.push(group.id);
      check('group '+group.id+' has label and items',Boolean(group.id&&group.label&&Array.isArray(group.items)&&group.items.length),group.label||'');
      group.items.forEach(item=>{
        routeKeys.push(item.key);
        check('module '+item.key+' has required metadata',Boolean(item.key&&item.label&&item.icon&&item.type&&item.module&&item.gate&&item.keywords),JSON.stringify(item));
        check('module '+item.key+' has valid type',['native','business'].includes(item.type),item.type);
        check('business route '+item.key+' uses bo prefix',item.type!=='business'||item.key.startsWith('bo:'),item.key);
        check('native route '+item.key+' is not bo prefixed',item.type!=='native'||!item.key.startsWith('bo:'),item.key);
      });
    });
    check('group IDs are unique',new Set(groupIds).size===groupIds.length,groupIds.join(','));
    check('route keys are unique',new Set(routeKeys).size===routeKeys.length,routeKeys.join(','));
    check('required spaces exist',['Today','Customers','Work','Money','Documents','Growth','Office'].every(label=>groups.some(group=>group.label===label)),groups.map(group=>group.label).join(','));
    check('Office replaces Control group',groups.some(group=>group.id==='office'&&group.label==='Office')&&!groups.some(group=>group.id==='control'||group.label==='Control'),groupIds.join(','));
    check('enabled apps are direct workspaces',['bo:requests','bo:customers','bo:quotes','bo:workOrders','bo:jobs','bo:invoices','bo:payments','bo:expenses','bo:documents','bo:reports'].every(key=>routeKeys.includes(key)),routeKeys.join(','));
    check('Office exposes app management',routeKeys.includes('moduleManager')&&groups.find(group=>group.id==='office').items.some(item=>item.key==='moduleManager'&&item.label==='Apps & Modules'));
    check('core routes exist',['today','bo:assignedTasks','proof','errors'].every(key=>routeKeys.includes(key)),routeKeys.join(','));
  }catch(error){
    check('registry evaluates',false,error.stack||error.message);
  }

  check('bootstrap reads central registry',/h38PortalModuleRegistry_\(/.test(unifiedSource));
  check('bootstrap exposes module index',/moduleIndex:moduleIndex/.test(unifiedSource));
  check('bootstrap does not hard-code group array',!/var\s+groups\s*=\s*\[/.test(unifiedSource));
  check('portal loads product styles',indexSource.includes("h38PortalRawInclude_('Portal_Product_Styles')"));
  check('portal loads product client',indexSource.includes("h38PortalRawInclude_('Portal_Product_Client')"));
  check('portal has one top bar',(indexSource.match(/id=\"ownerTopbar\"/g)||[]).length===1);
  check('portal has one navigation host',(indexSource.match(/id=\"nav\"/g)||[]).length===1);
  check('portal keeps approved logo host',(indexSource.match(/id=\"h38PortalLogo\"/g)||[]).length===1);
  check('obsolete polish include removed',!indexSource.includes('BusinessOffice_AI_Native_UX_Client')&&!manifestSource.includes('BusinessOffice_AI_Native_UX_Client'));
  check('legacy Control Center client inactive',!manifestSource.includes('BusinessOffice_ControlPlane_Client')&&!manifestSource.includes('BusinessOffice_ControlPlane_Live_Client'));
  check('legacy Business Apps hub inactive',!manifestSource.includes('BusinessOffice_Modular_Suite'));
  check('obsolete UI files deleted',!exists(files.obsoletePolish)&&!exists(files.obsoleteControl)&&!exists(files.obsoleteControlLive)&&!exists(files.obsoleteApps));
  check('design system owns all major components',['#ownerTopbar','.nav-group-items','#view','.tablewrap','.drawer-panel','#h38-ai-panel','@media(max-width:800px)'].every(marker=>styleSource.includes(marker)),styleSource.length+' bytes');
  check('product client connects render lifecycle',/h38ProductConnectRenderLifecycle/.test(clientSource)&&/h38AfterSurfaceRender/.test(clientSource));
  check('product client provides contextual AI',/h38ProductPrompts/.test(clientSource)&&/data-h38-ai-prompt/.test(clientSource));
  check('product client provides shared loading state',/h38ProductLoadingState/.test(clientSource)&&/data-h38-product-loading/.test(clientSource));
  check('change rules lock logo',/logo is locked/i.test(rulesSource)&&/may not be redrawn/i.test(rulesSource));
  check('change rules require registry',/Portal_Module_Registry\.js/.test(rulesSource));
  check('change rules require deployment authority',/Deploy Unified Owner Portal/.test(rulesSource));
  check('existing asset authority remains',/Approved Asset Authority/.test(agentsSource)&&/controlled binary/.test(agentsSource));
  check('approved asset manifest remains present',exists(files.assetManifest));

  const assembly=childProcess.spawnSync(process.execPath,[files.assemblyVerifier],{cwd:ROOT,encoding:'utf8'});
  if(assembly.stdout)process.stdout.write(assembly.stdout);
  if(assembly.stderr)process.stderr.write(assembly.stderr);
  check('deterministic unified source assembly',assembly.status===0,'exit '+assembly.status);
}

const evidence={
  status:failures.length?'FAIL':'PASS',
  generatedAt:new Date().toISOString(),
  architecture:'single-shell-office-registry-v2',
  logoLocked:true,
  passed:pass.length,
  failed:failures.length,
  pass,
  failures
};
fs.mkdirSync(path.dirname(EVIDENCE),{recursive:true});
fs.writeFileSync(EVIDENCE,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
process.exit(failures.length?1:0);
