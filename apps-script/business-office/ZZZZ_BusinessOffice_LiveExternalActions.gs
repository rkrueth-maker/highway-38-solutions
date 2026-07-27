/** Highway 38 production release for selected-record, Owner-approved external execution. */
var H38_LIVE_EXTERNAL_RELEASE_PROPERTY_='H38_LIVE_EXTERNAL_EXECUTION_RELEASED';
var H38_LIVE_EXTERNAL_PROOF_PROPERTY_='H38_LIVE_EXTERNAL_EXECUTION_PROOF_RECORDED';

function h38LiveExternalActionTypes_(){
  var configured=boPackValue_('workflow.liveActionTypes',[]);
  return Array.isArray(configured)?configured.map(function(value){return String(value||'').trim();}).filter(Boolean):[];
}
function boExternalActionsEnabled_(){return boPackValue_('workflow.externalActionsEnabled',false)===true;}
function boExternalActionAllowed_(actionType){
  actionType=String(actionType||'').trim();
  return boExternalActionsEnabled_()&&h38LiveExternalActionTypes_().indexOf(actionType)>=0;
}
function h38RequireLiveExternalAction_(actionType){
  boAssert_(boExternalActionsEnabled_(),'Live external execution is disabled for this Business Office installation.');
  boAssert_(boExternalActionAllowed_(actionType),'This external action is not released for live execution: '+actionType+'.');
  return true;
}
function h38ReleaseLiveExternalProperties_(){
  if(!boExternalActionsEnabled_())return false;
  var properties=PropertiesService.getScriptProperties();
  properties.setProperty(H38_LIVE_EXTERNAL_RELEASE_PROPERTY_,'TRUE');
  if(boExternalActionAllowed_('sms'))properties.setProperty('H38_SMS_SEND_RELEASED','TRUE');
  if(properties.getProperty(H38_LIVE_EXTERNAL_PROOF_PROPERTY_)!=='TRUE'){
    var owner=boRequireOwner_();
    boProof_('ENABLE_LIVE_EXTERNAL_EXECUTION','System',boGetBusinessId_(),'PASS','Owner-approved selected-record customer communication and delivery released. Bulk sends, automatic triggers, payments, refunds, purchasing, payroll, tax filing, accounting movement, public publishing, and advertising spend remain blocked.',owner.Email);
    properties.setProperty(H38_LIVE_EXTERNAL_PROOF_PROPERTY_,'TRUE');
  }
  return true;
}
function h38LivePatchPayload_(payload){
  if(!payload||typeof payload!=='object')return payload;
  payload.externalActionsEnabled=boExternalActionsEnabled_();
  payload.ownerApprovalRequired=true;
  payload.boundary=boApprovalNotice_();
  if(payload.boundaries&&typeof payload.boundaries==='object'){
    payload.boundaries.externalActionsEnabled=boExternalActionsEnabled_();
    payload.boundaries.ownerApprovalRequired=true;
    payload.boundaries.selectedRecordOnly=true;
    payload.boundaries.bulkExternalActionsEnabled=false;
    payload.boundaries.automaticExternalTriggersEnabled=false;
  }
  if(payload.safety&&typeof payload.safety==='object'){
    payload.safety.liveExternalActions=boExternalActionsEnabled_();
    payload.safety.selectedRecordOnly=true;
    payload.safety.bulkExecution=false;
    payload.safety.triggers=false;
  }
  if(Array.isArray(payload.items))payload.items.forEach(h38LivePatchPayload_);
  return payload;
}
function h38PortalLiveExternalStatus(){
  var user=boGetCurrentUser_();
  if(boExternalActionsEnabled_()&&String((boGetRole_(user['Role ID'])||{})['Role Name']||'')==='Owner')h38ReleaseLiveExternalProperties_();
  var provider=typeof h38TmProviderStatus_==='function'?h38TmProviderStatus_():null;
  return {
    status:boExternalActionsEnabled_()?'LIVE':'LOCKED',
    externalActionsEnabled:boExternalActionsEnabled_(),
    ownerApprovalRequired:true,
    selectedRecordOnly:true,
    bulkExternalActionsEnabled:false,
    automaticExternalTriggersEnabled:false,
    allowedActionTypes:h38LiveExternalActionTypes_(),
    email:{released:boExternalActionAllowed_('email'),replyReleased:boExternalActionAllowed_('emailReply')},
    sms:provider,
    protected:{payments:true,refunds:true,purchasing:true,payroll:true,taxFiling:true,accountingMovement:true,publicPublishing:true,advertisingSpend:true},
    approvalNotice:boApprovalNotice_()
  };
}

/* Preserve reusable packs as locked by default while allowing this protected production pack to opt in. */
var H38_LIVE_BASE_VALIDATE_BUSINESS_PACK_=typeof boValidateBusinessPack_==='function'?boValidateBusinessPack_:null;
if(H38_LIVE_BASE_VALIDATE_BUSINESS_PACK_){
  boValidateBusinessPack_=function(pack){
    var copy=JSON.parse(JSON.stringify(pack||{}));
    if(copy.workflow)copy.workflow.externalActionsEnabled=false;
    H38_LIVE_BASE_VALIDATE_BUSINESS_PACK_(copy);
    if(pack&&pack.workflow&&pack.workflow.externalActionsEnabled===true){
      boAssert_(pack.workflow.ownerApprovalRequired===true,'Live external execution requires Owner approval.');
      boAssert_(pack.workflow.selectedRecordOnly===true,'Live external execution must remain selected-record only.');
      boAssert_(pack.workflow.bulkExternalActionsEnabled===false,'Bulk external execution must remain disabled.');
      boAssert_(pack.workflow.automaticExternalTriggersEnabled===false,'Automatic external triggers must remain disabled.');
      boAssert_(Array.isArray(pack.workflow.liveActionTypes)&&pack.workflow.liveActionTypes.length>0,'Released live action types are required.');
    }
    return true;
  };
}

/* Release SMS only through the same pack, Owner, consent, credential, A2P, usage, and duplicate gates. */
var H38_LIVE_BASE_PROVIDER_STATUS_=typeof h38TmProviderStatus_==='function'?h38TmProviderStatus_:null;
if(H38_LIVE_BASE_PROVIDER_STATUS_){
  h38TmProviderStatus_=function(){
    if(boExternalActionAllowed_('sms'))PropertiesService.getScriptProperties().setProperty('H38_SMS_SEND_RELEASED','TRUE');
    return H38_LIVE_BASE_PROVIDER_STATUS_();
  };
}

/* Email and reply execution now require the explicit production release in addition to existing Owner confirmation. */
var H38_LIVE_BASE_EMAIL_EXECUTE_=typeof boAiActionExecuteEmail_==='function'?boAiActionExecuteEmail_:null;
if(H38_LIVE_BASE_EMAIL_EXECUTE_){boAiActionExecuteEmail_=function(payload){h38RequireLiveExternalAction_('email');return H38_LIVE_BASE_EMAIL_EXECUTE_(payload);};}
var H38_LIVE_BASE_EMAIL_REPLY_EXECUTE_=typeof boAiActionExecuteEmailReply_==='function'?boAiActionExecuteEmailReply_:null;
if(H38_LIVE_BASE_EMAIL_REPLY_EXECUTE_){boAiActionExecuteEmailReply_=function(payload){h38RequireLiveExternalAction_('emailReply');return H38_LIVE_BASE_EMAIL_REPLY_EXECUTE_(payload);};}

/* Patch the unified authentication bridge and registry without weakening financial or administrative boundaries. */
if(typeof H38_PORTAL_AUTH_BRIDGE!=='undefined'&&H38_PORTAL_AUTH_BRIDGE&&typeof H38_PORTAL_AUTH_BRIDGE.getClientContext==='function'){
  var H38_LIVE_BASE_AUTH_BRIDGE_=H38_PORTAL_AUTH_BRIDGE;
  H38_PORTAL_AUTH_BRIDGE=Object.freeze(Object.assign({},H38_LIVE_BASE_AUTH_BRIDGE_,{getClientContext:function(){return h38LivePatchPayload_(H38_LIVE_BASE_AUTH_BRIDGE_.getClientContext());}}));
}
if(typeof H38_UNIFIED_SHELL!=='undefined'&&H38_UNIFIED_SHELL){
  H38_UNIFIED_SHELL=Object.freeze(Object.assign({},H38_UNIFIED_SHELL,{VERSION:'3.1.1',EXTERNAL_ACTIONS_ENABLED:boExternalActionsEnabled_()}));
}
var H38_LIVE_BASE_UNIFIED_REGISTRY_=typeof h38UnifiedShellRegistry==='function'?h38UnifiedShellRegistry:null;
if(H38_LIVE_BASE_UNIFIED_REGISTRY_){h38UnifiedShellRegistry=function(){return h38LivePatchPayload_(H38_LIVE_BASE_UNIFIED_REGISTRY_());};}

function h38LiveWrapFunction_(name){
  var root=typeof globalThis!=='undefined'?globalThis:this,base=root[name];
  if(typeof base!=='function')return;
  root[name]=function(){return h38LivePatchPayload_(base.apply(this,arguments));};
}
['h38PortalBusinessBootstrap','h38PortalBusinessModule','h38PortalBusinessModuleBatch','h38PortalBusinessWorkspace','h38PortalTaskMessagingModule','h38PortalTaskMessagingWorkspace'].forEach(h38LiveWrapFunction_);
