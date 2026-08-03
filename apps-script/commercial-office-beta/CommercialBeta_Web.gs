/** Owner-only web shell and protected API for the separate commercial beta. */
function doGet(event){
  try{
    cbRequireOwner_();var parameters=event&&event.parameter?event.parameter:{},serviceUrl=ScriptApp.getService().getUrl()||'',businessId=cbText_(parameters.businessId),forceInstaller=cbText_(parameters.install)==='1';
    if(cbText_(parameters.bridge)==='1'){var bridge=HtmlService.createTemplateFromFile('CommercialBeta_Bridge');bridge.allowedOriginsJson=JSON.stringify(CB_CONFIG.pwaAllowedOrigins);return bridge.evaluate().setTitle('H38 Secure Bridge').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport','width=device-width, initial-scale=1');}
    if(!forceInstaller&&!businessId){var installed=cbPlatformBusinessList_();if(installed.length===1)businessId=installed[0].businessId;}
    if(businessId)cbBusinessRow_(businessId);var template=HtmlService.createTemplateFromFile(businessId?'CommercialBeta_Office':'CommercialBeta_Setup');template.businessId=businessId;template.homeUrl=serviceUrl+'?install=1';template.industryPacksJson=JSON.stringify(CB_CONFIG.industryPacks);
    return template.evaluate().setTitle(businessId?'Commercial Office — '+cbBusinessRow_(businessId)['Business Name']:CB_CONFIG.title).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
  }catch(error){return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Commercial Office Beta</title><main style="max-width:720px;margin:60px auto;padding:24px;font:16px system-ui"><h1>Commercial Office Beta</h1><p>This separate beta is Owner-only.</p><pre style="white-space:pre-wrap">'+cbEscapeHtml_(error.message||String(error))+'</pre></main>');}
}
function cbEscapeHtml_(value){return String(value==null?'':value).replace(/[&<>"']/g,function(character){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];});}
function cbBusinessUrls_(items){var serviceUrl=ScriptApp.getService().getUrl()||'';return(items||[]).map(function(item){item.businessUrl=serviceUrl+'?businessId='+encodeURIComponent(item.businessId);return item;});}
function cbApi(request){
  var payload=request||{},action=cbText_(payload.action),args=payload.args||{};cbRequireOwner_();
  try{
    if(action==='bootstrap'||action==='status'){var status=cbInstallerStatus_();status.serviceUrl=ScriptApp.getService().getUrl()||'';status.businesses=cbBusinessUrls_(cbPlatformBusinessList_());return status;}
    if(action==='createBusiness')return cbCreateBusinessV2_(args);if(action==='listBusinesses')return cbBusinessUrls_(cbPlatformBusinessList_());if(action==='verifyBusiness')return cbVerifyBusiness_(cbText_(args.businessId));if(action==='openBusiness')return cbOfficeSnapshot_(cbText_(args.businessId));if(action==='pwaBootstrap')return cbPwaBootstrap_(cbText_(args.businessId));if(action==='syncOperations')return cbSyncOperations_(args);
    if(action==='addCustomer')return cbAddCustomer_(args);if(action==='addJob')return cbAddJob_(args);if(action==='saveQuoteDraft')return cbUpsertQuoteDraft_(args);if(action==='addInventoryItem')return cbAddInventoryItem_(args);if(action==='postInventoryTransaction')return cbPostInventoryTransaction_(args);if(action==='addAsset')return cbAddAsset_(args);if(action==='assignAssetToJob')return cbAssignAssetToJob_(args);if(action==='returnAssetFromJob')return cbReturnAssetFromJob_(args);if(action==='scheduleMaintenance')return cbScheduleMaintenance_(args);if(action==='completeMaintenance')return cbCompleteMaintenance_(args);if(action==='recordInspection')return cbRecordInspection_(args);if(action==='recordAssetUsage')return cbRecordAssetUsage_(args);
    throw new Error('Unsupported commercial beta action: '+action);
  }catch(error){cbError_(cbText_(args.businessId),action,error);throw error;}
}
function cbDeploymentIdentity(){var user=cbRequireOwner_(),properties=cbProperties_(),serviceUrl=ScriptApp.getService().getUrl()||'';return{status:'PASS',environment:CB_CONFIG.environment,version:CB_CONFIG.version,userEmail:user.email,serviceUrl:serviceUrl,scriptId:ScriptApp.getScriptId(),deploymentId:cbText_(properties.getProperty('COMMERCIAL_BETA_DEPLOYMENT_ID')),productionSystemChanged:false};}
