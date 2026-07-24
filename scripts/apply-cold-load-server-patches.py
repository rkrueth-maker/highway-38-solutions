from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)

def regex_once(text, pattern, replacement, label):
    updated, count = re.subn(pattern, lambda match: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    return updated

ux_path = 'apps-script/core-engine/owner-portal-next/Portal_UX.js'
ux = read(ux_path)
ux_control = r'''function h38PortalUxControlCenter() {
  h38PortalAssertOwner_();
  if (typeof h38PortalNavigationCacheGet_ === 'function') {
    var existing = h38PortalNavigationCacheGet_('startup:owner-experience-v3');
    if (existing) return existing;
  }
  var today = h38PortalToday_();
  var tasks = h38PortalTaskProjection_({});
  var openTasks = tasks.filter(function(task){ return !h38PortalTaskTerminal_(task.status); });
  var invoices = h38PortalUxSafeList_('invoices');
  var quotes = h38PortalUxSafeList_('quotes');
  var payments = h38PortalUxSafeList_('payments');
  var expenses = h38PortalUxSafeList_('expenses');
  var jobs = h38PortalUxSafeList_('jobs');
  var errors = h38PortalUxSafeErrors_();
  var dueToday = openTasks.filter(function(task){ return task.dueDate && task.dueDate === today; });
  var overdue = openTasks.filter(function(task){ return task.dueDate && task.dueDate < today; });
  var blocked = openTasks.filter(function(task){ return /block|hold|failed|error|missing/i.test([task.status,task.blockingIssue,task.nextAction].join(' ')); });
  var waitingCustomer = openTasks.filter(function(task){ return /waiting on customer|customer response|customer information|awaiting customer/i.test([task.status,task.nextAction,task.blockingIssue].join(' ')); });
  var noNextAction = openTasks.filter(function(task){ return !String(task.nextAction || '').trim(); });
  var needsReview = openTasks.filter(function(task){ return /review|required|approval|decision|revise|reject|hold/i.test([task.status,task.approvalStatus,task.approvalRequirement,task.decision].join(' ')); });
  var unpaidInvoices = invoices.filter(function(row){ return h38PortalUxAmount_(row.Balance || row['Balance Due'] || row.Total) > 0 && !/paid|cancel|written off|void/i.test(String(row.Status || '')); });
  var overdueInvoices = unpaidInvoices.filter(function(row){ var due = row['Due Date'] || ''; return due && due < today; });
  var cashExpected = unpaidInvoices.reduce(function(sum,row){ return sum + h38PortalUxAmount_(row.Balance || row['Balance Due'] || row.Total); },0);
  var month = today.slice(0,7);
  var paidThisMonth = payments.filter(function(row){ return String(row['Payment Date'] || row.Date || '').slice(0,7) === month; }).reduce(function(sum,row){ return sum + h38PortalUxAmount_(row.Amount); },0);
  var expensesThisMonth = expenses.filter(function(row){ return String(row.Date || '').slice(0,7) === month; }).reduce(function(sum,row){ return sum + h38PortalUxAmount_(row.Amount || row.Total); },0);
  var activeJobs = jobs.filter(function(row){ return !/complete|cancel|archive|delivered/i.test(String(row['Job Stage'] || row.Status || '')); });
  var approvalItems = h38PortalUxApprovalItems_(needsReview,quotes,invoices);
  var base = {
    generatedAt:h38PortalNow_(),today:today,
    views:{
      today:{tasks:dueToday.concat(overdue).slice(0,50),openCount:openTasks.length,overdueCount:overdue.length},
      decisions:{tasks:needsReview.slice(0,50),count:needsReview.length},
      activeWork:{tasks:openTasks.slice(0,75),count:openTasks.length},
      money:{summary:{cashExpected:cashExpected,paymentsReceived:paidThisMonth,expenses:expensesThisMonth,activeJobs:activeJobs.length},invoices:unpaidInvoices.slice(0,40)},
      growth:{deferred:true,summary:{leads:0,socialDrafts:0,advertisingPlans:0},leads:[],social:[],advertising:[]},
      website:{deferred:true,records:[]},
      systemHealth:{deferred:true,installed:{installed:true},catalog:{status:'Deferred'},integrations:[],blockers:[],safety:{ownerOnly:true,selectedRecordOnly:true,bulkExecution:false,automaticRetry:false,liveExternalActions:false,triggers:false}},
      calendar:{deferred:true,records:[]}
    },
    quickCreate:['task','lead','customer','job','quote','invoice','payment','expense','communication','social','advertising','website','calendar'],
    externalActionsOccurred:false
  };
  base.ux = {
    generatedAt:h38PortalNow_(),
    metrics:{needsReview:needsReview.length,dueToday:dueToday.length,overdue:overdue.length,blocked:blocked.length,cashExpected:cashExpected,unpaidInvoices:unpaidInvoices.length,overdueInvoices:overdueInvoices.length,paidThisMonth:paidThisMonth,expensesThisMonth:expensesThisMonth,activeJobs:activeJobs.length,noNextAction:noNextAction.length,waitingCustomer:waitingCustomer.length,openErrors:errors.filter(function(row){ return !/resolved|closed/i.test(String(row['Resolution Status'] || row.Status || '')); }).length},
    approvalQueue:approvalItems.slice(0,30),dueToday:dueToday.slice(0,30),overdue:overdue.slice(0,30),blocked:blocked.slice(0,30),noNextAction:noNextAction.slice(0,30),waitingCustomer:waitingCustomer.slice(0,30),unpaidInvoices:unpaidInvoices.slice(0,30),overdueInvoices:overdueInvoices.slice(0,30),
    recentActivity:h38PortalUxActivity_(tasks,quotes,invoices,payments,expenses,errors).slice(0,30),
    builtInViews:[
      {id:'needs-review',name:'Needs my approval',module:'decisions'},
      {id:'due-today',name:'Due today',module:'tasks',filters:{due:'today'}},
      {id:'overdue',name:'Overdue',module:'tasks',filters:{overdue:'yes'}},
      {id:'waiting-customer',name:'Waiting on customer',module:'tasks',filters:{waitingCustomer:'yes'}},
      {id:'blocked',name:'Blocked',module:'tasks',filters:{blocked:'yes'}},
      {id:'no-next-action',name:'No next action',module:'tasks',filters:{noNextAction:'yes'}},
      {id:'high-priority',name:'High priority',module:'tasks',filters:{priority:'High'}},
      {id:'recently-updated',name:'Recently updated',module:'tasks',filters:{sort:'updated'}}
    ]
  };
  return typeof h38PortalNavigationCachePut_ === 'function' ? h38PortalNavigationCachePut_('startup:owner-experience-v3',base,20) : base;
}

'''
ux = regex_once(ux, r'function h38PortalUxControlCenter\(\) \{.*?\n\}\n\n(?=function h38PortalUxWorkspace)', ux_control, 'lean owner control center')
write(ux_path, ux)

services_path = 'apps-script/core-engine/owner-portal-next/Portal_Services.js'
services = read(services_path)
services = replace_once(
    services,
    "  var tasks = H38_PORTAL_TASK_PROJECTION_CACHE_ ? h38PortalCloneRows_(H38_PORTAL_TASK_PROJECTION_CACHE_) : null;\n",
    "  var tasks = H38_PORTAL_TASK_PROJECTION_CACHE_ ? h38PortalCloneRows_(H38_PORTAL_TASK_PROJECTION_CACHE_) : null;\n  if (!tasks && typeof h38PortalNavigationCacheGet_ === 'function') {\n    var persistentTasks = h38PortalNavigationCacheGet_('startup:task-projection-v3');\n    if (Array.isArray(persistentTasks)) tasks = h38PortalCloneRows_(persistentTasks);\n  }\n",
    'persistent task cache read'
)
services = replace_once(
    services,
    "    H38_PORTAL_TASK_PROJECTION_CACHE_ = h38PortalCloneRows_(tasks);\n",
    "    H38_PORTAL_TASK_PROJECTION_CACHE_ = h38PortalCloneRows_(tasks);\n    if (typeof h38PortalNavigationCachePut_ === 'function') h38PortalNavigationCachePut_('startup:task-projection-v3',H38_PORTAL_TASK_PROJECTION_CACHE_,20);\n",
    'persistent task cache write'
)
write(services_path, services)

role_path = 'apps-script/core-engine/owner-portal-next/Portal_Role_Dashboard.js'
role = read(role_path)
role = replace_once(role, 'function h38PortalApplicationApprovalCenter() {', "function h38PortalApplicationApprovalCenter() {\n  if (typeof h38PortalNavigationCached_ === 'function') return h38PortalNavigationCached_('native:approval-center',10,h38PortalApplicationApprovalCenterUncached_,false);\n  return h38PortalApplicationApprovalCenterUncached_();\n}\n\nfunction h38PortalApplicationApprovalCenterUncached_() {", 'approval cache wrapper')
role = replace_once(role, 'function h38PortalApplicationCalendar() {', "function h38PortalApplicationCalendar() {\n  if (typeof h38PortalNavigationCached_ === 'function') return h38PortalNavigationCached_('native:calendar-center',60,h38PortalApplicationCalendarUncached_,false);\n  return h38PortalApplicationCalendarUncached_();\n}\n\nfunction h38PortalApplicationCalendarUncached_() {", 'calendar cache wrapper')
role = replace_once(role, '    owner.calendar = h38PortalApplicationCalendar();', "    owner.calendar = {status:'DEFERRED',events:[],externalActionsOccurred:false};", 'owner calendar defer')
role = replace_once(role, '      calendar:h38PortalApplicationCalendar()', "      calendar:{status:'DEFERRED',events:[],externalActionsOccurred:false}", 'role calendar defer')
write(role_path, role)

unified_path = 'apps-script/core-engine/owner-portal-next/Portal_Unified.js'
unified = read(unified_path)
lite = r'''function h38PortalStartupBootstrapLite_(){
  var access=h38PortalRequireUnifiedUser_();
  if(!access.ownerMode){
    var unified=h38PortalUnifiedBootstrap();
    return {
      release:(typeof H38_BO!=='undefined'?H38_BO.VERSION:'Unified')+' · Role workspace',
      installed:{installed:true,reason:'Business Office role access is active.'},catalog:{status:'Role controlled'},
      modules:unified.groups.reduce(function(list,group){return list.concat(group.items.map(function(item){return item.module;}));},[]),
      fieldRole:typeof h38FieldRoleKnown_==='function'&&h38FieldRoleKnown_(access.role)?h38FieldRoleProfile_(access.role):null,
      safety:{ownerOnly:false,roleAware:true,selectedRecordOnly:true,bulkExecution:false,automaticRetry:false,liveExternalActions:false,triggers:false},user:unified.user,dashboard:{deferred:true}
    };
  }
  var installed=h38PortalInstalledStatus_();
  var catalog=installed.installed?(typeof h38PortalNavigationCached_==='function'?h38PortalNavigationCached_('startup:catalog',90,function(){return h38PortalCatalogStatus_();},false):h38PortalCatalogStatus_()):{status:'HOLD'};
  var integrations=typeof h38PortalNavigationCached_==='function'?h38PortalNavigationCached_('startup:integrations',90,function(){return h38PortalIntegrationStatus_();},false):h38PortalIntegrationStatus_();
  return {
    appName:H38_PORTAL_NEXT.APP_NAME,release:H38_PORTAL_NEXT.RELEASE,timezone:H38_PORTAL_NEXT.TIMEZONE,access:access,installed:installed,catalog:catalog,
    modules:H38_PORTAL_NEXT.MODULES,statuses:H38_PORTAL_STATUS,expenseCategories:H38_PORTAL_EXPENSE_CATEGORIES,approvalMatrix:H38_PORTAL_APPROVAL_MATRIX,
    integrations:integrations,dashboard:{deferred:true},
    safety:{testMode:H38_PORTAL_NEXT.TEST_MODE,liveExternalActions:H38_PORTAL_NEXT.LIVE_EXTERNAL_ACTIONS_ENABLED,selectedRecordOnly:true,bulkExecution:false,triggers:false},timestamp:h38PortalNow_()
  };
}

'''
unified = replace_once(unified, 'function h38PortalStartupPhase_(phases,name,callback){', lite + 'function h38PortalStartupPhase_(phases,name,callback){', 'light startup bootstrap insert')
unified = replace_once(unified, "bootstrap:h38PortalStartupPhase_(phases,'bootstrap',function(){return h38PortalBootstrap();}),", "bootstrap:h38PortalStartupPhase_(phases,'bootstrap',function(){return h38PortalStartupBootstrapLite_();}),", 'light startup bootstrap use')
unified = replace_once(unified, 'secondaryModulesDeferred:true,schemaChecksDeferred:true,requestScopedReadCache:true', 'secondaryModulesDeferred:true,schemaChecksDeferred:true,requestScopedReadCache:true,persistentNavigationCache:true,calendarDeferred:true,growthDeferred:true', 'startup performance metadata')
write(unified_path, unified)

verifier_path = ROOT / 'scripts/verify-cold-load-cache-prefetch.js'
verifier_path.write_text(r'''#!/usr/bin/env node
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
const services=read('apps-script/core-engine/owner-portal-next/Portal_Services.js');
pass('persistent user cache is used',server.includes('CacheService.getUserCache')&&server.includes('H38_PORTAL_NAVIGATION_CACHE_EPOCH_KEY_'));
pass('server cache invalidation is owner-session scoped',server.includes('PropertiesService.getUserProperties()')&&server.includes('function h38PortalNavigationInvalidate'));
pass('Business Office cold lists use short persistent cache',server.includes("'bo:' + module + ':' + limit")&&server.includes(',15,loader,false'));
pass('growth website and system health are lazy surfaces',server.includes("route === 'growth'")&&server.includes("route === 'websiteCenter'")&&server.includes("route === 'systemHealth'"));
pass('startup avoids the heavy legacy bootstrap dashboard',unified.includes('h38PortalStartupBootstrapLite_')&&unified.includes("return h38PortalStartupBootstrapLite_();")&&!unified.includes("'bootstrap',function(){return h38PortalBootstrap();}"));
pass('startup defers secondary calendar and growth data',unified.includes('calendarDeferred:true')&&unified.includes('growthDeferred:true'));
pass('owner experience no longer calls full experience control center',!ux.match(/function h38PortalUxControlCenter\(\)[\s\S]*?h38PortalExperienceControlCenter\(\)/));
pass('owner experience is persistently cached',ux.includes("startup:owner-experience-v3")&&ux.includes("h38PortalNavigationCachePut_"));
pass('task projection is persistently cached',services.includes("startup:task-projection-v3")&&services.includes('persistentTasks'));
pass('calendar and approvals have server cache wrappers',role.includes('h38PortalApplicationCalendarUncached_')&&role.includes("native:calendar-center")&&role.includes('h38PortalApplicationApprovalCenterUncached_')&&role.includes("native:approval-center"));
pass('startup control center defers calendar calculation',role.includes("owner.calendar = {status:'DEFERRED'")&&role.includes("calendar:{status:'DEFERRED'"));
pass('route-level in-flight prefetch promises are registered',client.includes('H38_NAV_ROUTE_PREFETCH_INFLIGHT')&&client.includes('function h38NavPrefetchOne'));
pass('likely next three routes are prefetched individually',client.includes('candidates[0]')&&client.includes('candidates[1]')&&client.includes('candidates[2]'));
pass('clicks join route prefetch instead of duplicating RPCs',client.includes('var prefetched=!force&&H38_NAV_ROUTE_PREFETCH_INFLIGHT[route]')&&client.includes('prefetched=h38NavDefaultBusinessRequest(request)&&H38_NAV_ROUTE_PREFETCH_INFLIGHT[route]'));
pass('low-priority remainder remains capped',client.includes('h38NavPrefetchBatch(candidates.slice(3,8))')&&client.includes('.slice(0,5)'));
pass('writes invalidate persistent navigation cache',client.includes("call('h38PortalNavigationInvalidate')")&&client.includes('H38_NAV_BASE_WRITE_INVALIDATE'));
pass('cold-load changes add no external actions',!/MailApp|GmailApp|UrlFetchApp|DriveApp\.getFileById/.test(server+client+ux+unified+role));
for(const [name,source] of [['server',server],['client',client],['ux',ux],['unified',unified],['role',role],['services',services]]){try{new vm.Script(source,{filename:name});pass(name+' parses',true);}catch(error){pass(name+' parses',false,error.message);}}
console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',failed:failures.length,failures},null,2));
process.exit(failures.length?1:0);
''',encoding='utf-8')

package_path = 'package.json'
package = read(package_path)
package = replace_once(package, 'node scripts/verify-whole-navigation-performance.js &&', 'node scripts/verify-whole-navigation-performance.js && node scripts/verify-cold-load-cache-prefetch.js &&', 'commercial verifier entry')
package = replace_once(package, '"test:whole-navigation-performance": "node scripts/verify-whole-navigation-performance.js",', '"test:whole-navigation-performance": "node scripts/verify-whole-navigation-performance.js && node scripts/verify-cold-load-cache-prefetch.js",\n    "test:cold-load-performance": "node scripts/verify-cold-load-cache-prefetch.js",', 'focused verifier scripts')
write(package_path, package)
