/** Non-destructive server self-test. */
function h38PortalSelfTest(){
  h38PortalAssertOwner_();
  var checks=[];
  function check(name,fn){try{var detail=fn();checks.push({name:name,status:'PASS',detail:detail});}catch(e){checks.push({name:name,status:'HOLD',detail:String(e&&e.message?e.message:e)});}}
  check('Owner access',function(){return h38PortalAccess_();});
  check('Candidate install status',function(){return h38PortalInstalledStatus_();});
  check('Required product IDs',function(){if(H38_PORTAL_NEXT.REQUIRED_PRODUCTS.length!==15)throw new Error('Expected 15 products');return H38_PORTAL_NEXT.REQUIRED_PRODUCTS;});
  check('Required bundle IDs',function(){if(H38_PORTAL_NEXT.REQUIRED_BUNDLES.length!==9)throw new Error('Expected 9 bundles');return H38_PORTAL_NEXT.REQUIRED_BUNDLES;});
  check('External actions disabled',function(){if(H38_PORTAL_NEXT.LIVE_EXTERNAL_ACTIONS_ENABLED)throw new Error('Live external actions unexpectedly enabled');return false;});
  check('Test mode enabled',function(){if(!H38_PORTAL_NEXT.TEST_MODE)throw new Error('Test mode unexpectedly disabled');return true;});
  check('No trigger API',function(){return 'Static verifier enforces absence of trigger-creation APIs.';});
  check('Legacy queues readable',function(){return H38_PORTAL_NEXT.LEGACY_QUEUES.filter(function(n){return !!h38PortalSpreadsheet_().getSheetByName(n);});});
  check('Catalog status',function(){return h38PortalCatalogStatus_();});
  var pass=checks.every(function(c){return c.status==='PASS';});
  return {status:pass?'PASS':'HOLD',checks:checks,timestamp:h38PortalNow_(),externalActionsOccurred:false};
}
