/** Owner-only web shell for the separate commercial beta. */
function doGet(){
  try{
    cbRequireOwner_();
    return HtmlService.createTemplateFromFile('CommercialBeta_Index').evaluate()
      .setTitle(CB_CONFIG.title)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
  }catch(error){
    return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Commercial Office Beta</title><main style="max-width:720px;margin:60px auto;padding:24px;font:16px system-ui"><h1>Commercial Office Beta</h1><p>This separate beta is Owner-only during initial provisioning.</p><pre style="white-space:pre-wrap;background:#f4f6f8;padding:16px;border-radius:12px">'+cbEscapeHtml_(error.message||String(error))+'</pre></main>');
  }
}
function cbEscapeHtml_(value){return String(value==null?'':value).replace(/[&<>"']/g,function(character){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];});}
function cbApi(request){
  var payload=request||{},action=cbText_(payload.action),args=payload.args||{};cbRequireOwner_();
  try{
    if(action==='bootstrap'||action==='status')return cbInstallerStatus_();
    if(action==='createBusiness')return cbCreateBusiness_(args);
    if(action==='listBusinesses')return cbListBusinesses_();
    if(action==='verifyBusiness')return cbVerifyBusiness_(cbText_(args.businessId));
    throw new Error('Unsupported commercial beta action: '+action);
  }catch(error){cbError_(cbText_(args.businessId),action,error);throw error;}
}
function cbDeploymentIdentity(){
  var user=cbRequireOwner_(),properties=cbProperties_(),serviceUrl=ScriptApp.getService().getUrl()||'';
  return {status:'PASS',environment:CB_CONFIG.environment,version:CB_CONFIG.version,userEmail:user.email,serviceUrl:serviceUrl,scriptId:ScriptApp.getScriptId(),deploymentId:cbText_(properties.getProperty('COMMERCIAL_BETA_DEPLOYMENT_ID')),productionSystemChanged:false};
}
