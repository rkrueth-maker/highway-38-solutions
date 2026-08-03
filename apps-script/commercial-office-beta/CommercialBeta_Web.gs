/** Web shell, secure bridge and routed API for the reusable Commercial Office. */
function doGet(event){
  try{
    var parameters=event&&event.parameter?event.parameter:{},serviceUrl=ScriptApp.getService().getUrl()||'',businessId=cbText_(parameters.businessId),forceInstaller=cbText_(parameters.install)==='1';
    if(cbText_(parameters.bridge)==='1'){
      cbCompletionSignedIn_();
      var bridge=HtmlService.createTemplateFromFile('CommercialBeta_Bridge');
      bridge.allowedOriginsJson=JSON.stringify(CB_CONFIG.pwaAllowedOrigins);bridge.requestedBusinessIdJson=JSON.stringify(businessId);
      return bridge.evaluate().setTitle('H38 Secure Bridge').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport','width=device-width, initial-scale=1');
    }
    if(forceInstaller){
      cbRequireOwner_();
      var setup=HtmlService.createTemplateFromFile('CommercialBeta_Setup');
      setup.businessId='';setup.homeUrl=serviceUrl+'?install=1';setup.industryPacksJson=JSON.stringify(CB_CONFIG.industryPacks);
      return setup.evaluate().setTitle(CB_CONFIG.title).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
    }
    var visible=cbCompletionVisibleBusinesses_(),businessRow=null;
    if(businessId){var context=cbCompletionContext_(businessId,'');businessRow=context.row;}
    else if(visible.length===1){businessId=visible[0].businessId;businessRow=cbBusinessRow_(businessId);}
    if(visible.length||businessRow){
      var office=HtmlService.createTemplateFromFile('CommercialBeta_Office');
      office.businessId=businessId;office.businessName=businessRow?businessRow['Business Name']:'Commercial Office';office.homeUrl=serviceUrl+'?install=1';office.pwaUrl=CB_CONFIG.pwaUrl;
      return office.evaluate().setTitle('Commercial Office — '+office.businessName).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
    }
    cbRequireOwner_();
    var installer=HtmlService.createTemplateFromFile('CommercialBeta_Setup');installer.businessId='';installer.homeUrl=serviceUrl+'?install=1';installer.industryPacksJson=JSON.stringify(CB_CONFIG.industryPacks);
    return installer.evaluate().setTitle(CB_CONFIG.title).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
  }catch(error){return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Commercial Office</title><main style="max-width:720px;margin:60px auto;padding:24px;font:16px system-ui"><h1>Commercial Office</h1><p>Sign in with an authorized business account.</p><pre style="white-space:pre-wrap">'+cbEscapeHtml_(error.message||String(error))+'</pre></main>');}
}
function cbEscapeHtml_(value){return String(value==null?'':value).replace(/[&<>"']/g,function(character){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[character];});}
function cbBusinessUrls_(items){var serviceUrl=ScriptApp.getService().getUrl()||'';return(items||[]).map(function(item){item.businessUrl=serviceUrl+'?businessId='+encodeURIComponent(item.businessId);return item;});}
function cbApi(request){
  var payload=request||{},action=cbText_(payload.action),args=payload.args||{};
  try{
    if(action==='startupBootstrap')return cbStartupBootstrap(cbText_(args.businessId));
    if(action==='fullStartupRefresh')return cbFullStartupRefresh(cbText_(args.businessId));
    if(action==='listBusinesses'||action==='visibleBusinesses')return cbCompletionVisibleBusinesses_();
    if(action==='completionBootstrap'||action==='pwaBootstrap')return cbCompletionBootstrap_(cbText_(args.businessId));
    if(action==='completionSync'||action==='syncOperations')return cbCompletionSyncOperations_(args);
    if(action==='communicationSummary')return cbCompletionCommunicationSummary_(cbText_(args.businessId));
    if(action==='aiAsk')return cbCompletionAiAsk_(args);
    if(action==='aiRecommendations'){var recommendationContext=cbCompletionContext_(args.businessId,'');return{status:'PASS',recommendations:cbCompletionRecommendations_(recommendationContext)};}
    if(action==='aiRecommendationDecision')return cbCompletionRecommendationDecision_(args);
    if(action==='saveCustomer')return cbCompletionSaveCustomer_(args);if(action==='saveMeasurement')return cbCompletionSaveMeasurement_(args);if(action==='saveProperty')return cbCompletionSaveProperty_(args);if(action==='saveRequest')return cbCompletionSaveRequest_(args);if(action==='saveJob')return cbCompletionSaveJob_(args);if(action==='saveTask')return cbCompletionSaveTask_(args);if(action==='saveSchedule')return cbCompletionSaveSchedule_(args);if(action==='recordTime')return cbCompletionRecordTime_(args);if(action==='saveQuote')return cbCompletionSaveQuote_(args);if(action==='postInventory')return cbCompletionPostInventory_(args);if(action==='assignAsset')return cbCompletionAssignAsset_(args);if(action==='returnAsset')return cbCompletionReturnAsset_(args);if(action==='scheduleMaintenance')return cbCompletionScheduleMaintenance_(args);if(action==='recordInspection')return cbCompletionRecordInspection_(args);if(action==='recordAssetUsage')return cbCompletionRecordAssetUsage_(args);if(action==='saveInvoice')return cbCompletionSaveInvoice_(args);if(action==='recordPayment')return cbCompletionRecordPayment_(args);if(action==='saveExpense')return cbCompletionSaveExpense_(args);if(action==='saveAttachment')return cbCompletionSaveAttachment_(args);if(action==='saveSetting')return cbCompletionSaveSetting_(args);if(action==='recordUsage')return cbCompletionRecordUsageEvent_(args);if(action==='saveUser')return cbCompletionSaveUser_(args);if(action==='saveEntity')return cbCompletionSaveEntity_(args);if(action==='archiveEntity')return cbCompletionArchiveEntity_(args);
    if(action==='createConversation')return cbCompletionCreateConversation_(args);if(action==='sendInternalMessage')return cbCompletionSendInternalMessage_(args);if(action==='saveEmailDraft')return cbCompletionSaveEmailDraft_(args);if(action==='saveSmsDraft')return cbCompletionSaveSmsDraft_(args);if(action==='savePortalMessage')return cbCompletionSavePortalMessage_(args);if(action==='convertMessageToTask')return cbCompletionConvertMessageToTask_(args);
    if(action==='saveCampaign')return cbCompletionSaveCampaign_(args);if(action==='saveSocialAccount')return cbCompletionSaveSocialAccount_(args);if(action==='saveSocialPost')return cbCompletionSaveSocialPost_(args);if(action==='requestSocialReview')return cbCompletionRequestSocialReview_(args);if(action==='approveSocialPost')return cbCompletionApproveSocialPost_(args);if(action==='scheduleSocialPost')return cbCompletionScheduleSocialPost_(args);if(action==='markSocialPosted')return cbCompletionMarkSocialPosted_(args);if(action==='recordSocialMetric')return cbCompletionRecordSocialMetric_(args);if(action==='publishSocial')return cbCompletionSocialPublishHold_(args);if(action==='saveFeatureRequest')return cbCompletionSaveFeatureRequest_(args);if(action==='saveVoiceItem')return cbCompletionSaveVoiceItem_(args);
    cbRequireOwner_();
    if(action==='bootstrap'||action==='status'){var status=cbInstallerStatus_();status.serviceUrl=ScriptApp.getService().getUrl()||'';status.businesses=cbBusinessUrls_(cbPlatformBusinessList_());return status;}if(action==='createBusiness')return cbCreateBusinessV2_(args);if(action==='verifyBusiness')return cbVerifyBusiness_(cbText_(args.businessId));if(action==='openBusiness')return cbOfficeSnapshot_(cbText_(args.businessId));if(action==='addCustomer')return cbAddCustomer_(args);if(action==='addJob')return cbAddJob_(args);if(action==='addInventoryItem')return cbAddInventoryItem_(args);if(action==='postInventoryTransaction')return cbPostInventoryTransaction_(args);if(action==='addAsset')return cbAddAsset_(args);if(action==='assignAssetToJob')return cbAssignAssetToJob_(args);if(action==='returnAssetFromJob')return cbReturnAssetFromJob_(args);if(action==='completeMaintenance')return cbCompleteMaintenance_(args);
    throw new Error('Unsupported commercial platform action: '+action);
  }catch(error){cbError_(cbText_(args.businessId),action,error);throw error;}
}
function cbDeploymentIdentity(){var user=cbRequireOwner_(),properties=cbProperties_(),serviceUrl=ScriptApp.getService().getUrl()||'';return{status:'PASS',environment:CB_CONFIG.environment,version:CB_CONFIG.version,userEmail:user.email,serviceUrl:serviceUrl,scriptId:ScriptApp.getScriptId(),deploymentId:cbText_(properties.getProperty('COMMERCIAL_BETA_DEPLOYMENT_ID')),productionSystemChanged:false};}
