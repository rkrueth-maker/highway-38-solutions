/** Owner-only web shell for the separate commercial beta. */
function doGet(event){
  try{
    cbRequireOwner_();
    var parameters=event&&event.parameter?event.parameter:{};
    var serviceUrl=ScriptApp.getService().getUrl()||'';
    var forceInstaller=cbText_(parameters.install)==='1';
    var businessId=cbText_(parameters.businessId);
    if(!forceInstaller&&!businessId){var installed=cbListBusinesses_();if(installed.length===1)businessId=installed[0].businessId;}
    if(businessId)cbBusinessRow_(businessId);
    var template=HtmlService.createTemplateFromFile(businessId?'CommercialBeta_Office':'CommercialBeta_Index');
    template.businessId=businessId;
    template.homeUrl=serviceUrl+'?install=1';
    return template.evaluate()
      .setTitle(businessId?'Commercial Office — '+cbBusinessRow_(businessId)['Business Name']:CB_CONFIG.title)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
  }catch(error){
    return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Commercial Office Beta</title><main style="max-width:720px;margin:60px auto;padding:24px;font:16px system-ui"><h1>Commercial Office Beta</h1><p>This separate beta is Owner-only during initial provisioning.</p><pre style="white-space:pre-wrap;background:#f4f6f8;padding:16px;border-radius:12px">'+cbEscapeHtml_(error.message||String(error))+'</pre></main>');
  }
}
function cbEscapeHtml_(value){return String(value==null?'':value).replace(/[&<>"']/g,function(character){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];});}
function cbBusinessUrls_(items){
  var serviceUrl=ScriptApp.getService().getUrl()||'';
  return (items||[]).map(function(item){item.businessUrl=serviceUrl+'?businessId='+encodeURIComponent(item.businessId);return item;});
}
function cbApi(request){
  var payload=request||{},action=cbText_(payload.action),args=payload.args||{};cbRequireOwner_();
  try{
    if(action==='bootstrap'||action==='status'){var status=cbInstallerStatus_();status.serviceUrl=ScriptApp.getService().getUrl()||'';status.businesses=cbBusinessUrls_(status.businesses);return status;}
    if(action==='createBusiness')return cbCreateBusiness_(args);
    if(action==='listBusinesses')return cbBusinessUrls_(cbListBusinesses_());
    if(action==='verifyBusiness')return cbVerifyBusiness_(cbText_(args.businessId));
    if(action==='openBusiness')return cbOfficeSnapshot_(cbText_(args.businessId));
    if(action==='addCustomer')return cbAddCustomer_(args);
    if(action==='addJob')return cbAddJob_(args);
    if(action==='addInventoryItem')return cbAddInventoryItem_(args);
    if(action==='postInventoryTransaction')return cbPostInventoryTransaction_(args);
    if(action==='addAsset')return cbAddAsset_(args);
    throw new Error('Unsupported commercial beta action: '+action);
  }catch(error){cbError_(cbText_(args.businessId),action,error);throw error;}
}
function cbDeploymentIdentity(){
  var user=cbRequireOwner_(),properties=cbProperties_(),serviceUrl=ScriptApp.getService().getUrl()||'';
  return {status:'PASS',environment:CB_CONFIG.environment,version:CB_CONFIG.version,userEmail:user.email,serviceUrl:serviceUrl,scriptId:ScriptApp.getScriptId(),deploymentId:cbText_(properties.getProperty('COMMERCIAL_BETA_DEPLOYMENT_ID')),productionSystemChanged:false};
}
