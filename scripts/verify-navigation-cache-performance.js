#!/usr/bin/env node
'use strict';
// Guards navigation grouping, bounded record reads, cache freshness, prefetch reuse, and approval boundaries.
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const failures=[];
const pass=(name,ok,detail='')=>{console[ok?'log':'error'](`${ok?'PASS':'FAIL'}: ${name}${detail?' — '+detail:''}`);if(!ok)failures.push({name,detail});};
const contract=read('apps-script/business-office/BusinessOffice_ModuleContract.gs');
const core=read('apps-script/business-office/BusinessOffice_Core.gs');
const server=read('apps-script/core-engine/owner-portal-next/Portal_Business.js');
const client=read('apps-script/core-engine/owner-portal-next/Portal_Business_Client.html');
const appCore=read('apps-script/core-engine/owner-portal-next/Portal_Application_Client_Core.html');
const views=read('apps-script/core-engine/owner-portal-next/Portal_Application_Client_Views.html');
const tasks=read('apps-script/core-engine/owner-portal-next/Portal_TaskMessaging_Client.html');
const reusable=read('scripts/verify-reusable-business-office-contracts.js');
const sales=['requests','customers','quotes','messaging','smsConsent'];
const positions=sales.map(key=>contract.indexOf(`boUnifiedModule_('${key}'`));
pass('Quotes are under Customers',contract.includes("boUnifiedModule_('quotes','Quotes','sales'"));
pass('Customer options use intended order',positions.every((value,index)=>value>=0&&(index===0||value>positions[index-1])),JSON.stringify(positions));
pass('Reports are under Money',contract.includes("boUnifiedModule_('reports','Reports','money'"));
pass('ordinary lists default to fifty records',client.includes('limit:50')&&server.includes('opts.limit || 50')&&core.includes('opts.limit || 50'));
pass('ordinary reads scan bounded chunks until the requested visible rows are found',core.includes('function boReadTableLimited_')&&core.includes('records.length < target')&&core.includes('startRow += chunkSize'));
pass('limited reads preserve business and void filtering',core.includes('boRecordInScope_')&&core.includes("record['Business ID'] !== businessId")&&core.includes("record['Is Voided'] === 'Yes'"));
pass('search and filters preserve complete-table behavior',core.includes("!query && Object.keys(filters).length === 0")&&core.includes("boReadTable_(sheetName,{ includeVoided"));
pass('one batch endpoint owns route prefetch',server.includes('function h38PortalBusinessModuleBatch')&&client.includes("call('h38PortalBusinessModuleBatch'"));
pass('module cache reuses in-flight and recent data',client.includes('H38_BO_MODULE_CACHE')&&client.includes('H38_BO_MODULE_INFLIGHT')&&client.includes('boNativeCacheRead'));
pass('cache epochs prevent stale in-flight writes',client.includes('H38_BO_MODULE_EPOCH')&&client.includes('boNativeModuleEpoch(module)===epoch'));
pass('manual refresh bypasses and invalidates cache',client.includes('function boNativeRefreshModule')&&client.includes('boNativeInvalidate(module)')&&client.includes("{force:true}"));
pass('writes invalidate module and dependent native surfaces',client.includes('boNativeInvalidateAfterWrite')&&client.includes("h38SurfaceInvalidate('approvalsCenter')")&&client.includes("h38SurfaceInvalidate('calendarCenter')")&&tasks.includes('boNativeInvalidateAfterWrite'));
pass('Today prefetches Approvals Calendar and business modules',appCore.includes("h38SurfaceLoad('approvalsCenter'")&&appCore.includes("h38SurfaceLoad('calendarCenter'")&&appCore.includes('boNativePrefetchFromRoute'));
pass('Approval and Calendar reuse prefetched data',views.includes("h38SurfaceLoad('approvalsCenter'")&&views.includes("h38SurfaceLoad('calendarCenter'"));
pass('task filters use cache and fifty-record limit',tasks.includes('boNativeLoadModule(module')&&tasks.includes('limit:50'));
pass('reusable installer verification tracks the current contract version',reusable.includes("manifest.moduleContractVersion==='2026-07-24-v2'")&&reusable.includes("moduleContractVersion:'2026-07-24-v2'"));
pass('external actions stay locked',server.includes('externalActionsEnabled:false')&&!/UrlFetchApp|GmailApp|MailApp/.test(client+appCore+views));
for(const [name,source] of [['BusinessOffice_Core',core],['Portal_Business',server],['Portal_Business_Client',client],['Portal_Application_Client_Core',appCore],['Portal_Application_Client_Views',views],['Portal_TaskMessaging_Client',tasks]]){
  try{new vm.Script(source,{filename:name});pass(name+' parses',true);}catch(error){pass(name+' parses',false,error.message);}
}
console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',failed:failures.length,failures},null,2));
process.exit(failures.length?1:0);
