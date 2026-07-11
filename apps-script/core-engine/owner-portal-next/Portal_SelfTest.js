/** Non-destructive server self-test for TEST and owner-only PRODUCTION projects. */
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
  check('Portal install status',function(){var s=h38PortalInstalledStatus_();if(!s.installed)throw new Error('Missing sheets: '+s.missingSheets.join(', '));return s;});
  check('Required product IDs',function(){if(H38_PORTAL_NEXT.REQUIRED_PRODUCTS.length!==15)throw new Error('Expected 15 products');return H38_PORTAL_NEXT.REQUIRED_PRODUCTS;});
  check('Required bundle IDs',function(){if(H38_PORTAL_NEXT.REQUIRED_BUNDLES.length!==9)throw new Error('Expected 9 bundles');return H38_PORTAL_NEXT.REQUIRED_BUNDLES;});
  check('External actions disabled',function(){if(H38_PORTAL_NEXT.LIVE_EXTERNAL_ACTIONS_ENABLED)throw new Error('Live external actions unexpectedly enabled');return false;});
  check('No trigger API',function(){return 'Static verifier enforces absence of trigger-creation APIs.';});
  check('Legacy queues readable',function(){return H38_PORTAL_NEXT.LEGACY_QUEUES.filter(function(n){return !!h38PortalSpreadsheet_().getSheetByName(n);});});
  check('Catalog status',function(){var s=h38PortalCatalogStatus_();if(s.status!=='PASS')throw new Error(s.reason||'Catalog hold');return s;});
  if(H38_PORTAL_NEXT.ENVIRONMENT==='PRODUCTION')check('Production readiness',function(){var s=h38PortalProductionReadiness();if(s.status!=='PASS')throw new Error(s.holds.join(' '));return s;});
  var pass=checks.every(function(c){return c.status==='PASS';});
  return {status:pass?'PASS':'HOLD',checks:checks,timestamp:h38PortalNow_(),environment:H38_PORTAL_NEXT.ENVIRONMENT,externalActionsOccurred:false};
}