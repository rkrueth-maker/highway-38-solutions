#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const failures=[];
function pass(name,ok,detail=''){console[ok?'log':'error'](`${ok?'PASS':'FAIL'}: ${name}${detail?' — '+detail:''}`);if(!ok)failures.push({name,detail});}
const server=read('apps-script/core-engine/owner-portal-next/Portal_Navigation_Performance.js');
const client=read('apps-script/core-engine/owner-portal-next/Portal_Navigation_Performance_Client.html');
const ux=read('apps-script/core-engine/owner-portal-next/Portal_UX.js');
const unified=read('apps-script/core-engine/owner-portal-next/Portal_Unified.js');
const role=read('apps-script/core-engine/owner-portal-next/Portal_Role_Dashboard.js');
pass('persistent user cache is used',server.includes('CacheService.getUserCache')&&server.includes('H38_PORTAL_NAVIGATION_CACHE_EPOCH_KEY_'));
pass('cache keys preserve business and user isolation',server.includes('h38PortalNavigationBusinessKey_')&&server.includes('PropertiesService.getUserProperties()'));
pass('server cache invalidation is available after writes',server.includes('function h38PortalNavigationInvalidate')&&client.includes("call('h38PortalNavigationInvalidate')"));
pass('Business Office cold lists use short persistent cache',server.includes("'bo:' + module + ':' + limit")&&server.includes(',15,loader,false'));
pass('growth website and system health are lazy surfaces',server.includes("route === 'growth'")&&server.includes("route === 'websiteCenter'")&&server.includes("route === 'systemHealth'"));
pass('startup avoids the heavy legacy bootstrap dashboard',unified.includes('h38PortalStartupBootstrapLite_')&&unified.includes("return h38PortalStartupBootstrapLite_();")&&!unified.includes("'bootstrap',function(){return h38PortalBootstrap();}"));
pass('startup defers secondary calendar and growth data',unified.includes('calendarDeferred:true')&&unified.includes('growthDeferred:true'));
pass('owner experience no longer calls full experience control center',!ux.match(/function h38PortalUxControlCenter\(\)[\s\S]*?h38PortalExperienceControlCenter\(\)/));
pass('owner experience is persistently cached',ux.includes("startup:owner-experience-v3")&&ux.includes('h38PortalNavigationCachePut_'));
pass('calendar and approvals have server cache wrappers',role.includes('h38PortalApplicationCalendarUncached_')&&role.includes("native:calendar-center")&&role.includes('h38PortalApplicationApprovalCenterUncached_')&&role.includes("native:approval-center"));
pass('startup control center defers calendar calculation',role.includes("owner.calendar = {status:'DEFERRED'")&&role.includes("calendar:{status:'DEFERRED'"));
pass('route-level in-flight prefetch promises are registered',client.includes('H38_NAV_ROUTE_PREFETCH_INFLIGHT')&&client.includes('function h38NavPrefetchOne'));
pass('likely next three routes are prefetched individually',client.includes('candidates[0]')&&client.includes('candidates[1]')&&client.includes('candidates[2]'));
pass('clicks join route prefetch instead of duplicating RPCs',client.includes('var prefetched=!force&&H38_NAV_ROUTE_PREFETCH_INFLIGHT[route]')&&client.includes('prefetched=h38NavDefaultBusinessRequest(request)&&H38_NAV_ROUTE_PREFETCH_INFLIGHT[route]'));
pass('low-priority remainder remains capped',client.includes('h38NavPrefetchBatch(candidates.slice(3,8))')&&client.includes('.slice(0,5)'));
pass('writes clear route HTML and persistent server cache',client.includes("delete H38_NAV_HTML_CACHE['bo:'+module]")&&client.includes('h38NavInvalidateServerSoon'));
pass('cold-load changes add no external actions',!/MailApp|GmailApp|UrlFetchApp|DriveApp\.getFileById/.test(server+client+ux+unified+role));
for(const [name,source] of [['server',server],['client',client],['ux',ux],['unified',unified],['role',role]]){try{new vm.Script(source,{filename:name});pass(name+' parses',true);}catch(error){pass(name+' parses',false,error.message);}}
console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',failed:failures.length,failures},null,2));
process.exit(failures.length?1:0);
