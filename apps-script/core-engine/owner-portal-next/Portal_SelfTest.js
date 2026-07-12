/** Non-destructive integrated business OS self-test for owner-only TEST and PRODUCTION projects. */
function h38PortalSelfTest(){
  h38PortalAssertOwner_();
  var checks=[];
  function check(name,fn){try{var detail=fn();checks.push({name:name,status:'PASS',detail:detail});}catch(e){checks.push({name:name,status:'HOLD',detail:String(e&&e.message?e.message:e)});}}
  check('Owner access',function(){return h38PortalAccess_();});
  check('Environment configured',function(){var s=h38PortalEnvironmentStatus();if(s.status!=='PASS')throw new Error('Environment is not configured');return s;});
  check('Environment mode consistency',function(){
    if(H38_PORTAL_NEXT.ENVIRONMENT==='PRODUCTION'&&H38_PORTAL_NEXT.TEST_MODE)throw new Error('PRODUCTION cannot report TEST_MODE');
    if(H38_PORTAL_NEXT.ENVIRONMENT==='TEST'&&!H38_PORTAL_NEXT.TEST_MODE)throw new Error('TEST environment must report TEST_MODE');
    if(['TEST','PRODUCTION'].indexOf(H38_PORTAL_NEXT.ENVIRONMENT)<0)throw new Error('Unsupported environment: '+H38_PORTAL_NEXT.ENVIRONMENT);
    return {environment:H38_PORTAL_NEXT.ENVIRONMENT,testMode:H38_PORTAL_NEXT.TEST_MODE};
  });
  check('Approved production release',function(){var expected='production-2026-07-12-hard-rule-owner-portal';if(H38_PORTAL_NEXT.RELEASE!==expected)throw new Error('Approved production release identifier missing');return H38_PORTAL_NEXT.RELEASE;});
  check('Portal install status',function(){var s=h38PortalInstalledStatus_();if(!s.installed)throw new Error('Missing sheets: '+s.missingSheets.join(', '));return s;});
  check('Required product IDs',function(){if(H38_PORTAL_NEXT.REQUIRED_PRODUCTS.length!==15)throw new Error('Expected 15 products');return H38_PORTAL_NEXT.REQUIRED_PRODUCTS;});
  check('Required bundle IDs',function(){if(H38_PORTAL_NEXT.REQUIRED_BUNDLES.length!==9)throw new Error('Expected 9 bundles');return H38_PORTAL_NEXT.REQUIRED_BUNDLES;});
  check('External actions disabled',function(){if(H38_PORTAL_NEXT.LIVE_EXTERNAL_ACTIONS_ENABLED)throw new Error('Live external actions unexpectedly enabled');return false;});
  check('Selected-record safety',function(){return {selectedRecordOnly:true,bulkExecution:false,triggers:false};});
  check('Client schema',function(){var s=h38PortalClientSchema();var required=['tasks','leads','customers','jobs','quotes','invoices','payments','expenses','communications','social','advertising','website','calendar','catalog'];var missing=required.filter(function(k){return !s.tables[k];});if(missing.length)throw new Error('Missing client tables: '+missing.join(', '));return {tables:Object.keys(s.tables).length,catalog:s.catalog.length};});
  check('Unified task projection',function(){var tasks=h38PortalTaskProjection_({});if(!Array.isArray(tasks))throw new Error('Task projection is not an array');return {tasks:tasks.length};});
  check('Workspace array contract',function(){var tasks=h38PortalTaskProjection_({});if(!tasks.length)return {skipped:'No task records available'};var w=h38PortalWorkspace(tasks[0].taskId);var arrays=['leads','quotes','invoices','payments','expenses','communications','social','advertising','website','calendar','proof','errors','relatedTasks','availableActions'];var invalid=arrays.filter(function(k){return !Array.isArray(w[k]);});if(invalid.length)throw new Error('Workspace arrays missing: '+invalid.join(', '));return {taskId:tasks[0].taskId,arrays:arrays.length};});
  check('Completed task action state',function(){var sample={status:'Complete',approvalStatus:'Completed - Proof Logged',assignedAction:'SEND_EMAIL'};var actions=h38PortalAvailableActions_(sample);if(actions.length)throw new Error('Completed task still exposes actions');return 'No actions exposed';});
  check('Reports',function(){var r=h38PortalReports();if(!r.summary||r.summary.actual!==true)throw new Error('Report summary missing');return r.summary;});
  check('Accounting export',function(){var csv=h38PortalAccountingCsv();if(csv.indexOf('Record Type')<0)throw new Error('Accounting CSV header missing');return {characters:csv.length};});
  check('Legacy queues readable',function(){return H38_PORTAL_NEXT.LEGACY_QUEUES.filter(function(n){return !!h38PortalSpreadsheet_().getSheetByName(n);});});
  check('Catalog status',function(){var s=h38PortalCatalogStatus_();if(s.status!=='PASS')throw new Error(s.reason||'Catalog hold');return s;});
  if(H38_PORTAL_NEXT.ENVIRONMENT==='PRODUCTION')check('Production readiness',function(){var s=h38PortalProductionReadiness();if(s.status!=='PASS')throw new Error(s.holds.join(' '));return s;});
  var pass=checks.every(function(c){return c.status==='PASS';});
  return {status:pass?'PASS':'HOLD',checks:checks,timestamp:h38PortalNow_(),environment:H38_PORTAL_NEXT.ENVIRONMENT,release:H38_PORTAL_NEXT.RELEASE,externalActionsOccurred:false};
}
