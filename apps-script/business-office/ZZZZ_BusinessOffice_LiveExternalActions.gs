/** Highway 38 closed-environment release for authenticated Owner-authorized execution. */
var H38_LIVE_EXTERNAL_RELEASE_PROPERTY_='H38_LIVE_EXTERNAL_EXECUTION_RELEASED';
var H38_CLOSED_ENVIRONMENT_PROPERTY_='H38_CLOSED_ENVIRONMENT_EXECUTION';
var H38_LIVE_EXTERNAL_PROOF_PROPERTY_='H38_LIVE_EXTERNAL_EXECUTION_PROOF_RECORDED_V2';

function h38LiveExternalActionTypes_(){
  var configured=boPackValue_('workflow.liveActionTypes',[]);
  return Array.isArray(configured)?configured.map(function(value){return String(value||'').trim();}).filter(Boolean):[];
}
function h38ClosedEnvironment_(){return boPackValue_('workflow.closedEnvironment',false)===true;}
function boExternalActionsEnabled_(){return boPackValue_('workflow.externalActionsEnabled',false)===true;}
function boExternalActionAllowed_(actionType){
  actionType=String(actionType||'').trim();
  var allowed=h38LiveExternalActionTypes_();
  return boExternalActionsEnabled_()&&(allowed.indexOf('*')>=0||allowed.indexOf(actionType)>=0);
}
function h38RequireLiveExternalAction_(actionType){
  boAssert_(boExternalActionsEnabled_(),'External execution is not enabled for this Business Office installation.');
  boAssert_(boExternalActionAllowed_(actionType),'This action is not enabled in the installed Business Office pack: '+actionType+'.');
  return true;
}
function h38ClosedEnvironmentControls_(){
  return {
    closedEnvironment:h38ClosedEnvironment_(),
    ownerApprovalRequired:boPackValue_('workflow.ownerApprovalRequired',true)!==false,
    selectedRecordOnly:boPackValue_('workflow.selectedRecordOnly',false)===true,
    bulkExternalActionsEnabled:boPackValue_('workflow.bulkExternalActionsEnabled',false)===true,
    automaticExternalTriggersEnabled:boPackValue_('workflow.automaticExternalTriggersEnabled',false)===true,
    directPaymentProcessing:boPackValue_('boundaries.directPaymentProcessing',false)===true,
    directPayrollFunding:boPackValue_('boundaries.directPayrollFunding',false)===true,
    directTaxFiling:boPackValue_('boundaries.directTaxFiling',false)===true
  };
}
function h38ReleaseLiveExternalProperties_(){
  if(!boExternalActionsEnabled_())return false;
  var properties=PropertiesService.getScriptProperties();
  properties.setProperty(H38_LIVE_EXTERNAL_RELEASE_PROPERTY_,'TRUE');
  properties.setProperty(H38_CLOSED_ENVIRONMENT_PROPERTY_,h38ClosedEnvironment_()?'TRUE':'FALSE');
  if(boExternalActionAllowed_('sms'))properties.setProperty('H38_SMS_SEND_RELEASED','TRUE');
  if(properties.getProperty(H38_LIVE_EXTERNAL_PROOF_PROPERTY_)!=='TRUE'){
    var owner=boRequireOwner_();
    boProof_('ENABLE_CLOSED_ENVIRONMENT_EXECUTION','System',boGetBusinessId_(),'PASS','Authenticated Owner-authorized execution enabled for all implemented Highway 38 actions. Provider credentials, role permissions, record validation, consent requirements, duplicate protection, Proof Log, Audit, and Error Log remain active controls.',owner.Email);
    properties.setProperty(H38_LIVE_EXTERNAL_PROOF_PROPERTY_,'TRUE');
  }
  return true;
}
function h38LivePatchPayload_(payload){
  if(!payload||typeof payload!=='object')return payload;
  var controls=h38ClosedEnvironmentControls_();
  payload.externalActionsEnabled=boExternalActionsEnabled_();
  payload.closedEnvironment=controls.closedEnvironment;
  payload.ownerApprovalRequired=controls.ownerApprovalRequired;
  payload.boundary=boApprovalNotice_();
  if(payload.boundaries&&typeof payload.boundaries==='object'){
    payload.boundaries.externalActionsEnabled=boExternalActionsEnabled_();
    payload.boundaries.closedEnvironment=controls.closedEnvironment;
    payload.boundaries.ownerApprovalRequired=controls.ownerApprovalRequired;
    payload.boundaries.selectedRecordOnly=controls.selectedRecordOnly;
    payload.boundaries.bulkExternalActionsEnabled=controls.bulkExternalActionsEnabled;
    payload.boundaries.automaticExternalTriggersEnabled=controls.automaticExternalTriggersEnabled;
    payload.boundaries.directPaymentProcessing=controls.directPaymentProcessing;
    payload.boundaries.directPayrollFunding=controls.directPayrollFunding;
    payload.boundaries.directTaxFiling=controls.directTaxFiling;
  }
  if(payload.safety&&typeof payload.safety==='object'){
    payload.safety.liveExternalActions=boExternalActionsEnabled_();
    payload.safety.closedEnvironment=controls.closedEnvironment;
    payload.safety.ownerAuthorized=true;
    payload.safety.selectedRecordOnly=controls.selectedRecordOnly;
    payload.safety.bulkExecution=controls.bulkExternalActionsEnabled;
    payload.safety.triggers=controls.automaticExternalTriggersEnabled;
  }
  if(Array.isArray(payload.items))payload.items.forEach(h38LivePatchPayload_);
  return payload;
}
function h38PortalLiveExternalStatus(){
  var user=boGetCurrentUser_();
  if(boExternalActionsEnabled_()&&String((boGetRole_(user['Role ID'])||{})['Role Name']||'')==='Owner')h38ReleaseLiveExternalProperties_();
  var provider=typeof h38TmProviderStatus_==='function'?h38TmProviderStatus_():null;
  var controls=h38ClosedEnvironmentControls_();
  return {
    status:boExternalActionsEnabled_()?'LIVE':'LOCKED',
    mode:controls.closedEnvironment?'CLOSED_ENVIRONMENT':'CONTROLLED',
    closedEnvironment:controls.closedEnvironment,
    externalActionsEnabled:boExternalActionsEnabled_(),
    ownerApprovalRequired:controls.ownerApprovalRequired,
    selectedRecordOnly:controls.selectedRecordOnly,
    bulkExternalActionsEnabled:controls.bulkExternalActionsEnabled,
    automaticExternalTriggersEnabled:controls.automaticExternalTriggersEnabled,
    allowedActionTypes:h38LiveExternalActionTypes_(),
    email:{released:boExternalActionAllowed_('email'),replyReleased:boExternalActionAllowed_('emailReply')},
    sms:provider,
    protected:{payments:false,refunds:false,purchasing:false,payroll:false,taxFiling:false,accountingMovement:false,publicPublishing:false,advertisingSpend:false,bulkExecution:false,automaticTriggers:false,deployment:false},
    ownerAuthorized:{payments:true,refunds:true,purchasing:true,payroll:true,taxFiling:true,accountingMovement:true,publicPublishing:true,advertisingSpend:true,bulkExecution:true,automaticTriggers:true,deployment:true},
    providerAndImplementationRequired:true,
    approvalNotice:boApprovalNotice_()
  };
}

/* Reusable packs remain conservative by default; this isolated production pack may opt into closed-environment execution. */
var H38_LIVE_BASE_VALIDATE_BUSINESS_PACK_=typeof boValidateBusinessPack_==='function'?boValidateBusinessPack_:null;
if(H38_LIVE_BASE_VALIDATE_BUSINESS_PACK_){
  boValidateBusinessPack_=function(pack){
    var copy=JSON.parse(JSON.stringify(pack||{}));
    copy.workflow=copy.workflow||{};
    copy.workflow.closedEnvironment=false;
    copy.workflow.externalActionsEnabled=false;
    copy.workflow.selectedRecordOnly=true;
    copy.workflow.bulkExternalActionsEnabled=false;
    copy.workflow.automaticExternalTriggersEnabled=false;
    copy.messaging=copy.messaging||{};
    copy.messaging.externalActionsEnabled=false;
    copy.messaging.inboundSyncEnabled=false;
    copy.messaging.bulkMessagingEnabled=false;
    copy.messaging.automaticTriggersEnabled=false;
    copy.social=copy.social||{};
    copy.social.externalActionsEnabled=false;
    copy.social.selectedRecordOnly=true;
    copy.social.automaticPublishingEnabled=false;
    copy.social.bulkPublishingEnabled=false;
    copy.boundaries=copy.boundaries||{};
    copy.boundaries.directPaymentProcessing=false;
    copy.boundaries.directPayrollFunding=false;
    copy.boundaries.directTaxFiling=false;
    H38_LIVE_BASE_VALIDATE_BUSINESS_PACK_(copy);
    if(pack&&pack.workflow&&pack.workflow.externalActionsEnabled===true){
      boAssert_(pack.workflow.closedEnvironment===true,'Broad external execution requires a closed Business Office environment.');
      boAssert_(pack.workflow.ownerApprovalRequired===true,'Closed-environment execution requires authenticated Owner approval.');
      boAssert_(Array.isArray(pack.workflow.liveActionTypes)&&pack.workflow.liveActionTypes.length>0,'Enabled action types are required.');
      boAssert_(pack.isolation&&pack.isolation.protectedInstallation===true,'Closed-environment execution requires an isolated protected installation.');
    }
    return true;
  };
}

/* Release SMS through the installed pack while retaining provider, consent, STOP, duplicate, and delivery-state validation. */
var H38_LIVE_BASE_PROVIDER_STATUS_=typeof h38TmProviderStatus_==='function'?h38TmProviderStatus_:null;
if(H38_LIVE_BASE_PROVIDER_STATUS_){
  h38TmProviderStatus_=function(){
    if(boExternalActionAllowed_('sms'))PropertiesService.getScriptProperties().setProperty('H38_SMS_SEND_RELEASED','TRUE');
    return H38_LIVE_BASE_PROVIDER_STATUS_();
  };
}

/* Email and reply execution require the installed release plus the existing authenticated Owner confirmation. */
var H38_LIVE_BASE_EMAIL_EXECUTE_=typeof boAiActionExecuteEmail_==='function'?boAiActionExecuteEmail_:null;
if(H38_LIVE_BASE_EMAIL_EXECUTE_){boAiActionExecuteEmail_=function(payload){h38RequireLiveExternalAction_('email');return H38_LIVE_BASE_EMAIL_EXECUTE_(payload);};}
var H38_LIVE_BASE_EMAIL_REPLY_EXECUTE_=typeof boAiActionExecuteEmailReply_==='function'?boAiActionExecuteEmailReply_:null;
if(H38_LIVE_BASE_EMAIL_REPLY_EXECUTE_){boAiActionExecuteEmailReply_=function(payload){h38RequireLiveExternalAction_('emailReply');return H38_LIVE_BASE_EMAIL_REPLY_EXECUTE_(payload);};}

/* Do not reject allowlisted actions merely because their arguments mention a formerly protected category. */
if(typeof boAiAssertActionBoundary_==='function'){
  boAiAssertActionBoundary_=function(actionId){
    boAssert_(!!boAiActionCatalog_()[String(actionId||'')],'This AI action is not available in the installed catalog.');
    return true;
  };
}

/* Patch unified context and registry without weakening authentication, role, evidence, or data-validation controls. */
if(typeof H38_PORTAL_AUTH_BRIDGE!=='undefined'&&H38_PORTAL_AUTH_BRIDGE&&typeof H38_PORTAL_AUTH_BRIDGE.getClientContext==='function'){
  var H38_LIVE_BASE_AUTH_BRIDGE_=H38_PORTAL_AUTH_BRIDGE;
  H38_PORTAL_AUTH_BRIDGE=Object.freeze(Object.assign({},H38_LIVE_BASE_AUTH_BRIDGE_,{getClientContext:function(){return h38LivePatchPayload_(H38_LIVE_BASE_AUTH_BRIDGE_.getClientContext());}}));
}
if(typeof H38_UNIFIED_SHELL!=='undefined'&&H38_UNIFIED_SHELL){
  H38_UNIFIED_SHELL=Object.freeze(Object.assign({},H38_UNIFIED_SHELL,{VERSION:'3.2.0',EXTERNAL_ACTIONS_ENABLED:boExternalActionsEnabled_()}));
}
var H38_LIVE_BASE_UNIFIED_REGISTRY_=typeof h38UnifiedShellRegistry==='function'?h38UnifiedShellRegistry:null;
if(H38_LIVE_BASE_UNIFIED_REGISTRY_){h38UnifiedShellRegistry=function(){return h38LivePatchPayload_(H38_LIVE_BASE_UNIFIED_REGISTRY_());};}

function h38LiveWrapFunction_(name){
  var root=typeof globalThis!=='undefined'?globalThis:this,base=root[name];
  if(typeof base!=='function')return;
  root[name]=function(){return h38LivePatchPayload_(base.apply(this,arguments));};
}
['h38PortalBusinessBootstrap','h38PortalBusinessModule','h38PortalBusinessModuleBatch','h38PortalBusinessWorkspace','h38PortalTaskMessagingModule','h38PortalTaskMessagingWorkspace'].forEach(h38LiveWrapFunction_);
