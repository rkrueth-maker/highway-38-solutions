#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const failures=[];
const passes=[];
const read=relativePath=>fs.readFileSync(path.join(root,relativePath),'utf8');
const assert=(name,condition,evidence='')=>{(condition?passes:failures).push({name,evidence});console[condition?'log':'error'](`${condition?'PASS':'FAIL'}: ${name}${evidence?` — ${evidence}`:''}`);};

const portal=read('portal.html');
const publicShell=read('assets/js/h38-site-v2.js');
const portalIndex=read('apps-script/core-engine/owner-portal-next/Portal_Index.html');
const portalRawIncludes=read('apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js');
const moduleContractSource=read('apps-script/business-office/BusinessOffice_ModuleContract.gs');
const moduleRegistrySource=read('apps-script/core-engine/owner-portal-next/Portal_Module_Registry.js');
const unifiedServer=read('apps-script/core-engine/owner-portal-next/Portal_Unified.js');
const unifiedShell=read('apps-script/core-engine/owner-portal-next/Portal_UX_Client_Shell.html');
const productClient=read('apps-script/core-engine/owner-portal-next/Portal_Product_Client.html');
const unifiedAppShell=read('apps-script/unified-shell/Unified_AppShell.gs');
const nativeBusinessServer=read('apps-script/core-engine/owner-portal-next/Portal_Business.js');
const portalAuthBridge=read('apps-script/core-engine/owner-portal-next/Portal_00_BusinessAuth.js');
const nativeBusinessClient=read('apps-script/core-engine/owner-portal-next/Portal_Business_Client.html');
const businessUi=read('apps-script/business-office/BusinessOffice_Index.html');
const businessCore=read('apps-script/business-office/BusinessOffice_Core.gs');
const businessAuth=read('apps-script/business-office/BusinessOffice_Auth.gs');
const businessWeb=read('apps-script/business-office/BusinessOffice_Web.gs');
const businessClientManifest=read('apps-script/business-office/BusinessOffice_ClientManifest.gs');
const businessGate=read('apps-script/business-office/BusinessOffice_ModuleAccess.gs');
const businessUnified=read('apps-script/business-office/BusinessOffice_Unified_Client.html');
const pack=read('business-packs/highway38/apps-script/BusinessOffice_Pack.gs');
const deploySource=read('scripts/deploy-unified-owner-portal-web.sh');
const shellBuilder=read('scripts/build-unified-apps-script-shell.js');

const ownerAppUrl='https://script.google.com/macros/s/AKfycbzr0hoImRF4iQ1gR90Cr17juP8PODkEWRorXxW6qralEYTGLhOU33E1wYEPU_3duQKpQg/exec';
const registryContext={boAssert_:(condition,message)=>{if(!condition)throw new Error(message||'assertion failed');}};
vm.createContext(registryContext);
new vm.Script(moduleContractSource,{filename:'BusinessOffice_ModuleContract.gs'}).runInContext(registryContext);
new vm.Script(moduleRegistrySource,{filename:'Portal_Module_Registry.js'}).runInContext(registryContext);
const contract=registryContext.boGetUnifiedModuleContract_();
const moduleGroups=registryContext.h38PortalModuleRegistry_('quoteBuilder');
const moduleItems=moduleGroups.flatMap(group=>group.items.map(item=>({...item,groupId:group.id,groupLabel:group.label})));
const routeKeys=moduleItems.map(item=>item.key);
const representativeBusinessRoutes=['bo:requests','bo:customers','bo:quotes','bo:workOrders','bo:jobs','bo:invoices','bo:payments','bo:expenses','bo:documents','bo:reports'];
const rawFragmentNames=[...portalIndex.matchAll(/h38PortalRawInclude_\('([^']+)'\)/g)].map(match=>match[1]);
const missingRawAllowlistEntries=rawFragmentNames.filter(name=>!portalRawIncludes.includes(`'${name}'`));

assert('website unified Business Office gateway exists',/<title>Highway 38 Business Office \| Highway 38 Solutions<\/title>/.test(portal));
assert('public portal is one automatic secure gateway',portal.includes(`var secure='${ownerAppUrl}'`)&&/location\.replace\(target\)/.test(portal));
assert('public portal contains no obsolete workspace chooser',!/owner-tabs|owner-area-strip|Choose where to open|Enter Command Center|Enter Business Office|class="choices"/.test(portal));
assert('public portal contains one fallback Business Office action',(portal.match(/id="secureFallback"/g)||[]).length===1&&/Open Business Office/.test(portal));
assert('public portal contains no private application iframe',!/<iframe\b/i.test(portal));
assert('public portal preserves upload and business-office deep links',/upload:'documents'/.test(portal)&&/'business-office':'requests'/.test(portal));
assert('portal contains no spreadsheet destination',!/docs\.google\.com\/spreadsheets/i.test(portal));

assert('secure app contains no nested Business Office iframe',!/businessWorkspace|businessFrame|<iframe\b/i.test(portalIndex));
assert('secure app includes native Business Office styles and client',/Portal_Business_Styles/.test(portalIndex)&&/Portal_Business_Client/.test(portalIndex));
assert('every secure app raw fragment is allowlisted',rawFragmentNames.length>0&&missingRawAllowlistEntries.length===0,missingRawAllowlistEntries.join(', '));
assert('legacy portal control and product clients are absent',!/(Portal_ControlPlane|Portal_ProductApps|Portal_ProductCenter|Portal_Product_Unification)/.test(portalIndex+portalRawIncludes));
assert('secure app uses one package-controlled manifest',/function h38PortalUnifiedBootstrap\(\)/.test(unifiedServer)&&/moduleContractVersion/.test(unifiedServer));
assert('unified manifest declares native Business Office rendering',/nativeBusinessOffice:\s*true/.test(unifiedServer)&&/businessDefinitions/.test(unifiedServer));
assert('canonical contract owns all module metadata',/function boGetUnifiedModuleContract_\(/.test(moduleContractSource)&&/boGetUnifiedModuleContract_\(/.test(moduleRegistrySource));
assert('central registry exposes Today Customers Work Money Documents Growth and Office',['Today','Customers','Work','Money','Documents','Growth','Office'].every(label=>moduleGroups.some(group=>group.label===label)),moduleGroups.map(group=>group.label).join(', '));
assert('central registry has no Control group',!moduleGroups.some(group=>group.id==='control'||group.label==='Control'));
assert('representative Business Office routes are present',representativeBusinessRoutes.every(key=>routeKeys.includes(key)),representativeBusinessRoutes.join(', '));
assert('retired Product Controls route is absent',!routeKeys.includes('bo:setup'));
assert('Office owns Apps & Modules',moduleItems.some(item=>item.groupId==='office'&&item.key==='moduleManager'&&item.label==='Apps & Modules'));
assert('all visible contract modules appear once in navigation',contract.modules.filter(item=>item.visible&&item.route).length===routeKeys.length&&new Set(routeKeys).size===routeKeys.length,`${routeKeys.length} routes`);
assert('retired bookmarks redirect to current workspaces',/control:'today'/.test(unifiedShell)&&/'bo:setup':'moduleManager'/.test(unifiedShell)&&/route\.indexOf\('app:'\)===0/.test(unifiedShell));
assert('unified shell routes Business Office links directly',/await\s+(?:uxInvokeBusinessModule|renderBusinessModule)\(module/.test(unifiedShell)&&/typeof renderBusinessModule!==['"]function['"]/.test(unifiedShell)&&!/frame\.src|postMessage/.test(unifiedShell));
assert('unified shell prevents blank workspaces',/uxWorkspaceHasContent/.test(unifiedShell)&&/uxRenderWorkspaceFailure/.test(unifiedShell));
assert('startup uses one browser RPC',/h38PortalStartupBundle/.test(unifiedServer)&&/call\('h38PortalStartupBundle'\)/.test(productClient)&&/window\.refresh=h38ProductRefresh/.test(productClient));
assert('product client has no page-wide observer',!/MutationObserver/.test(productClient));

assert('native Business Office server adapter lists saves opens and uploads records',['h38PortalBusinessModule','h38PortalBusinessSave','h38PortalBusinessWorkspace','h38PortalBusinessUpload'].every(name=>nativeBusinessServer.includes(`function ${name}`)));
assert('native Business Office client renders tables details forms and upload',['boNativeRenderTable','openBusinessRecord','openBusinessRecordForm','openBusinessUpload'].every(name=>nativeBusinessClient.includes(`function ${name}`)));
assert('Business Office authentication defines unified user guard',/function boGetCurrentUser_\(\)/.test(businessAuth)&&/function boGetActiveEmail_\(\)/.test(businessAuth));
assert('standalone Portal auth bridge publishes guarded fallback functions',/global\.boGetCurrentUser_ = function/.test(portalAuthBridge)&&/global\.boGetRole_ = function/.test(portalAuthBridge));
assert('combined shell owns self-contained authentication',/var H38_PORTAL_AUTH_BRIDGE = \(function\(\)\{/.test(unifiedAppShell)&&!/globalThis|boNormalizeText_|boReadTable_|boAssert_/.test(unifiedAppShell));
assert('combined shell owns route and capability selection',/function h38UnifiedShellCapabilityOwner_/.test(unifiedAppShell)&&/function doGet\(event\)/.test(unifiedAppShell));
assert('Business Office package modules are enforced server-side',/boGuardApiRequest_\(action,args\)/.test(businessWeb)&&/MODULE NOT INCLUDED/.test(businessGate)&&/boModulesForApiAction_/.test(businessGate));
assert('native adapter enforces package modules',/boAssertModuleEnabled_\(moduleKey\)/.test(nativeBusinessServer)&&/boAssertModuleEnabled_\('documents'\)/.test(nativeBusinessServer));
assert('Business Office compatibility client is assembled once',(businessClientManifest.match(/BusinessOffice_Unified_Client/g)||[]).length===1&&/boRenderClientIncludes_\(\)/.test(businessWeb)&&/h38-embedded-business-office/.test(businessUnified));
assert('Documents and OCR keep upload inside unified app',/Upload PDF \/ Take Picture/.test(nativeBusinessClient)&&/capture="environment"/.test(nativeBusinessClient));
assert('complete package explicitly enables core modules',/package:Object\.freeze\(\{id:'complete-business-system'/.test(pack)&&/commandCenter:true/.test(pack)&&/documents:true/.test(pack));
assert('production deployment builds checked-in unified shell',/build-unified-apps-script-shell\.js/.test(deploySource)&&/Unified_AppShell\.gs/.test(deploySource)&&/Portal_Business\.js/.test(deploySource)&&/BusinessOffice_Auth\.gs/.test(deploySource));
assert('production deployment verifies exact remote source',/REMOTE_VERIFY/.test(deploySource)&&/remote-source-verification\.txt/.test(deploySource)&&/controlled-source-local\.json/.test(deploySource)&&/controlled-source-remote\.json/.test(deploySource));
assert('production deployment removes legacy combined auth bridge',/test ! -e "\$PROJECT\/Portal_00_BusinessAuth\.js"/.test(deploySource)&&/fs\.unlinkSync\(legacyPortalBridge\)/.test(shellBuilder));

assert('canonical public shell routes Owner links to portal.html',/function routeOwnerLinks\(\)/.test(publicShell)&&/link\.href='portal\.html'/.test(publicShell)&&/link\.removeAttribute\('target'\)/.test(publicShell));
assert('Business Office dashboard uses calculated owner metrics',/return boGetOwnerDashboard_\(\);/.test(businessCore));
assert('dashboard contains no Open source records action',!/Open source records/i.test(businessUi));
assert('administrative spreadsheet link is explicit and confirmed',/Administrative spreadsheet/.test(businessUi)&&/Open the administrative spreadsheet outside the Owner Portal\?/.test(businessUi));
assert('Business Office web app does not redirect to spreadsheet',!/docs\.google\.com\/spreadsheets|SpreadsheetApp\.getActiveSpreadsheet\(\)\.getUrl\(\)/i.test(businessWeb));

const rootHtmlFiles=fs.readdirSync(root).filter(name=>name.endsWith('.html'));
const ownerLinks=[],badOwnerLinks=[],sheetLinks=[];
for(const file of rootHtmlFiles){const html=read(file);for(const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){const href=match[1],label=match[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();if(/owner\s+(login|portal)/i.test(label)&&!href.startsWith('#')){ownerLinks.push({file,href,label});if(!/(^|\/)portal\.html(?:[?#].*)?$/.test(href))badOwnerLinks.push({file,href,label});}if(/docs\.google\.com\/spreadsheets/i.test(href))sheetLinks.push({file,href,label});}}
assert('all static Owner Login and Owner Portal links target portal.html',badOwnerLinks.length===0,badOwnerLinks.length?JSON.stringify(badOwnerLinks):`${ownerLinks.length} inspected`);
assert('public static pages contain no direct spreadsheet links',sheetLinks.length===0,sheetLinks.length?JSON.stringify(sheetLinks):`${rootHtmlFiles.length} HTML files inspected`);

const result={status:failures.length?'HOLD':'PASS',sourceCommit:process.env.GITHUB_SHA||'',inspected:{rootHtmlFiles:rootHtmlFiles.length,ownerLinks:ownerLinks.length,rawFragments:rawFragmentNames,representativeBusinessRoutes,unifiedApp:true,nativeBusinessOffice:true,moduleContractVersion:contract.version,startupRpcBudget:1},passes,failures};
const outDir=path.join(root,'artifacts','owner-portal-routing');fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(`\nRESULT: ${result.status} (${passes.length} pass, ${failures.length} fail)`);process.exit(failures.length?1:0);
