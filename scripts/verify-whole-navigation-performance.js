#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const failures=[];
function pass(name,condition,detail=''){console[condition?'log':'error'](`${condition?'PASS':'FAIL'}: ${name}${detail?' — '+detail:''}`);if(!condition)failures.push({name,detail});}
const index=read('apps-script/core-engine/owner-portal-next/Portal_Index.html');
const raw=read('apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js');
const client=read('apps-script/core-engine/owner-portal-next/Portal_Navigation_Performance_Client.html');
const server=read('apps-script/core-engine/owner-portal-next/Portal_Navigation_Performance.js');
const business=read('apps-script/core-engine/owner-portal-next/Portal_Business_Client.html');
const appCore=read('apps-script/core-engine/owner-portal-next/Portal_Application_Client_Core.html');

pass('performance controller is included before boot',index.indexOf("Portal_Navigation_Performance_Client")>index.indexOf("Portal_Product_Client")&&index.indexOf("Portal_Navigation_Performance_Client")<index.indexOf("Portal_UX_Client_Boot"));
pass('performance controller is allowlisted',raw.includes("'Portal_Navigation_Performance_Client'"));
pass('previous workspace is not replaced by loading placeholder',!client.includes("Loading selected operating surface")&&!client.includes("view.innerHTML='<div class=\"card\" data-h38-workspace-state=\"loading\""));
pass('route tokens reject stale responses',client.includes('H38_NAV_ROUTE_SEQUENCE')&&client.includes('h38NavCurrent(token,route)')&&client.includes('if(!h38NavCurrent(token,module))return null'));
pass('all route types use shared surface cache',client.includes('function h38NavLoadSurface(route,ttl,loader,force)')&&client.includes('return h38SurfaceLoad(route,ttl,loader,force===true)')&&client.includes('h38NavLoadSurface(module,h38NavTtl(module)')&&client.includes('boNativeCacheRead'));
pass('Business Office rendering waits for current route',client.includes("window.renderBusinessModule=async function")&&client.includes("if(!h38NavCurrent(token,route))return null"));
pass('returning routes restore rendered HTML immediately',client.includes('H38_NAV_HTML_CACHE')&&client.includes('h38NavRestoreHtml(route)'));
pass('current navigation group prefetches in one server batch',client.includes("call('h38PortalNavigationSurfaceBatch'")&&client.includes('h38NavGroupRoutes(route)')&&client.includes('.slice(0,8)'));
pass('server batch remains read only and capped',server.includes("externalActionsOccurred: false")&&server.includes('requests.slice(0, 8)'));
pass('server batch covers Business Office and slow native routes',server.includes("route.indexOf('bo:') === 0")&&server.includes("route === 'calendarCenter'")&&server.includes("route === 'moduleManager'")&&server.includes("route === 'help'")&&server.includes("route === 'errors'"));
pass('old duplicate prefetch paths are disabled',client.includes('window.h38PrefetchOperatingSurfaces=function(){}')&&client.includes('window.boNativePrefetchFromRoute=function(){}'));
pass('route timings are recorded per workspace',client.includes('H38_NAV_TIMINGS[route]')&&client.includes('data-h38-route-ms')&&client.includes('h38NavigationPerformanceSnapshot'));
pass('busy indicator keeps content visible and reports progress',client.includes('h38RouteProgress')&&client.includes("view.setAttribute('aria-busy'"));
pass('external actions remain absent',!/MailApp|GmailApp|UrlFetchApp|DriveApp\.getFileById/.test(client+server));
pass('existing navigation loader remains available as fallback source',appCore.includes('async function show(module)')&&business.includes('async function renderBusinessModule'));
try{new vm.Script(client,{filename:'Portal_Navigation_Performance_Client.html'});pass('performance client parses',true);}catch(error){pass('performance client parses',false,error.message);}
try{new vm.Script(server,{filename:'Portal_Navigation_Performance.js'});pass('performance server parses',true);}catch(error){pass('performance server parses',false,error.message);}
console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',failed:failures.length,failures},null,2));
process.exit(failures.length?1:0);
