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
function cbGatewayErrorMessage_(payload,responseCode){
  var message=payload&&payload.error?cbText_(payload.error):'';
  return message||('Secure Office gateway rejected authorization ('+responseCode+').');
}
function cbPwaGatewayHandoff(requestedBusinessId){
  var startup=cbStartupBootstrap(cbText_(requestedBusinessId));
  var serviceUrl=ScriptApp.getService().getUrl()||'';
  cbAssert_(serviceUrl,'The existing Business Office deployment URL is unavailable.');
  var response=UrlFetchApp.fetch(CB_CONFIG.gatewayUrl,{
    method:'post',
    contentType:'application/json; charset=utf-8',
    payload:JSON.stringify({
      type:'bootstrap',
      accessToken:ScriptApp.getOAuthToken(),
      scriptId:ScriptApp.getScriptId(),
      deploymentUrl:serviceUrl
    }),
    muteHttpExceptions:true,
    followRedirects:true
  });
  var responseCode=response.getResponseCode();
  var payload=cbParseJson_(response.getContentText(),{});
  cbAssert_(responseCode>=200&&responseCode<300&&payload.status==='PASS',cbGatewayErrorMessage_(payload,responseCode));
  cbAssert_(cbText_(payload.gatewaySession),'Secure Office gateway returned no session.');
  var signedEmail=cbText_(startup&&startup.snapshot&&startup.snapshot.user&&startup.snapshot.user.email).toLowerCase();
  var gatewayEmail=cbText_(payload.email).toLowerCase();
  cbAssert_(!signedEmail||!gatewayEmail||signedEmail===gatewayEmail,'Secure Office gateway user did not match the signed-in business user.');
  var expiresAt=cbText_(payload.expiresAt),expiryTime=new Date(expiresAt).getTime(),refreshAfterMs=2400000;
  if(isFinite(expiryTime))refreshAfterMs=Math.max(60000,Math.min(2400000,expiryTime-new Date().getTime()-120000));
  return {
    status:'PASS',
    handoffType:'H38_GATEWAY_HANDOFF',
    handoffVersion:1,
    transport:'supabase-gateway',
    issuedAt:cbNow_(),
    expiresAt:expiresAt,
    refreshAfterMs:refreshAfterMs,
    gatewayUrl:CB_CONFIG.gatewayUrl,
    gatewaySession:payload.gatewaySession,
    startup:startup,
    browserReceivesGoogleToken:false,
    safeguards:{externalActionsEnabled:false,productionMigrationEnabled:false,automaticCustomerSending:false,automaticSocialPublishing:false,automaticFinancialActions:false}
  };
}
function cbStartupAcceptance(){
  cbRequireOwner_();var started=new Date().getTime(),businesses=cbCompletionVisibleBusinesses_();cbAssert_(businesses.length,'Startup acceptance requires an active business.');
  var result=cbStartupBootstrap(businesses[0].businessId);cbAssert_(result.snapshot&&result.snapshot.business&&result.snapshot.user,'Fast startup did not return an authorized Office snapshot.');
  return {status:'PASS',businessId:result.selectedBusinessId,businessName:result.snapshot.business.businessName,canSwitchBusinesses:result.canSwitchBusinesses,elapsedMs:new Date().getTime()-started,fullRefreshPending:result.snapshot.fullRefreshPending===true};
}
