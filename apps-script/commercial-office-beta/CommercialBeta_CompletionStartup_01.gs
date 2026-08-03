/** Fast signed-in startup path for the custom-domain Business Office. */
function cbStartupCollections_(){
  var names=['users','roles','settings','quickActions','providers','customers','contacts','properties','requests','jobs','workOrders','tasks','scheduleEvents','timeEntries','jobNotes','quotes','measurements','measurementPoints','priceBook','inventoryTransactions','materialRequests','assets','assignments','maintenance','inspections','vehicles','usageLogs','invoices','invoiceLines','payments','expenses','documents','attachments','conversations','messages','emailThreads','emailMessages','smsThreads','smsMessages','portalThreads','portalMessages','socialAccounts','socialPosts','socialMetrics','campaigns','aiKnowledge','aiRecommendations','featureRequests','voiceQueue','actionQueue','notifications','syncConflicts'];
  var output={};names.forEach(function(name){output[name]=[];});return output;
}
function cbStartupSnapshot_(businessId){
  var user=cbCompletionBusinessUser_(businessId),row=user.businessRow,packs=cbNormalizeIndustryPacks_(row['Industry Pack']);
  var snapshot={
    status:'PASS',startupMode:'FAST',fullRefreshPending:true,serverTime:cbNow_(),version:CB_CONFIG.version,schemaVersion:CB_CONFIG.schemaVersion,
    user:{email:user.email,userId:user.userId,displayName:user.displayName||user.email,roleId:user.roleId,roleName:user.roleName,owner:user.owner,permissions:user.permissions},
    business:{businessId:row['Business ID'],businessName:row['Business Name'],currency:row.Currency||CB_CONFIG.defaultCurrency,timeZone:row['Time Zone']||CB_CONFIG.defaultTimeZone,industryPack:packs[0]||'',industryPacks:packs},
    modules:CB_CONFIG.modules.slice(),
    productShells:typeof cbCompletionProductShells_==='function'?cbCompletionProductShells_():[],
    safeguards:{externalActionsEnabled:false,productionMigrationEnabled:false,automaticSocialPublishing:false,automaticCustomerSending:false,automaticFinancialActions:false}
  };
  var empty=cbStartupCollections_();Object.keys(empty).forEach(function(key){snapshot[key]=empty[key];});return snapshot;
}
function cbStartupBootstrap(requestedBusinessId){
  var started=new Date().getTime(),signed=cbCompletionSignedIn_(),businesses=cbCompletionVisibleBusinesses_(),canSwitch=cbCompletionOwnerEmail_(signed.email),requested=cbText_(requestedBusinessId),selected='';
  cbAssert_(businesses.length,'No active business is assigned to this account.');
  if(canSwitch){
    if(requested&&businesses.some(function(item){return item.businessId===requested;}))selected=requested;
    else if(businesses.length===1)selected=businesses[0].businessId;
  }else{
    selected=businesses[0].businessId;
  }
  return {status:'PASS',canSwitchBusinesses:canSwitch,businesses:businesses,selectedBusinessId:selected,snapshot:selected?cbStartupSnapshot_(selected):null,elapsedMs:new Date().getTime()-started};
}
function cbFullStartupRefresh(businessId){return cbCompletionBootstrap_(cbText_(businessId));}
function cbPwaExecutionHandoff(requestedBusinessId){
  var startup=cbStartupBootstrap(cbText_(requestedBusinessId));
  var properties=cbProperties_();
  var deploymentId=cbText_(properties.getProperty('COMMERCIAL_BETA_API_DEPLOYMENT_ID'))||cbText_(properties.getProperty('COMMERCIAL_BETA_DEPLOYMENT_ID'))||'AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow';
  return {
    status:'PASS',
    handoffType:'H38_EXECUTION_HANDOFF',
    handoffVersion:1,
    issuedAt:cbNow_(),
    refreshAfterMs:600000,
    scriptId:ScriptApp.getScriptId(),
    apiDeploymentId:deploymentId,
    accessToken:ScriptApp.getOAuthToken(),
    startup:startup,
    safeguards:{externalActionsEnabled:false,productionMigrationEnabled:false,automaticCustomerSending:false,automaticSocialPublishing:false,automaticFinancialActions:false}
  };
}
function cbStartupAcceptance(){
  cbRequireOwner_();var started=new Date().getTime(),businesses=cbCompletionVisibleBusinesses_();cbAssert_(businesses.length,'Startup acceptance requires an active business.');
  var result=cbStartupBootstrap(businesses[0].businessId);cbAssert_(result.snapshot&&result.snapshot.business&&result.snapshot.user,'Fast startup did not return an authorized Office snapshot.');
  return {status:'PASS',businessId:result.selectedBusinessId,businessName:result.snapshot.business.businessName,canSwitchBusinesses:result.canSwitchBusinesses,elapsedMs:new Date().getTime()-started,fullRefreshPending:result.snapshot.fullRefreshPending===true};
}
