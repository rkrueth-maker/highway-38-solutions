/** Business Office — user, role, and permission enforcement. */

function boAuthBridge_(){
  var root=typeof globalThis!=='undefined'?globalThis:this;
  return root&&root.H38_PORTAL_AUTH_BRIDGE?root.H38_PORTAL_AUTH_BRIDGE:null;
}
function boAuthText_(value){return String(value==null?'':value).trim();}
function boAuthAssert_(condition,message){if(!condition)throw new Error(message||'Business Office authentication failed.');}

function boGetActiveEmail_(){
  var bridge=boAuthBridge_();
  if(bridge&&typeof bridge.getActiveEmail==='function')return bridge.getActiveEmail();
  return boAuthText_(Session.getActiveUser().getEmail()).toLowerCase();
}
function boGetCurrentUser_(){
  var bridge=boAuthBridge_();
  if(bridge&&typeof bridge.getCurrentUser==='function')return bridge.getCurrentUser();
  var email=boGetActiveEmail_();
  boAuthAssert_(email,'A signed-in Google account is required.');
  var user=boReadTable_(H38_BO_SHEETS.USERS,{includeVoided:true}).find(function(row){
    return boAuthText_(row.Email).toLowerCase()===email&&row.Status==='Active';
  });
  boAuthAssert_(user,'This account is not authorized for '+boBusinessOfficeTitle_()+'.');
  boAuthAssert_(boAuthText_(user['Business ID'])===boGetBusinessId_(),'This account is not authorized for the selected business installation.');
  return user;
}
function boGetRole_(roleId){
  var bridge=boAuthBridge_();
  if(bridge&&typeof bridge.getRole==='function')return bridge.getRole(roleId);
  return boReadTable_(H38_BO_SHEETS.ROLES,{includeVoided:true}).find(function(row){
    return row['Role ID']===roleId&&row.Active==='Yes';
  })||null;
}
function boGetPermissionRows_(roleId){
  var bridge=boAuthBridge_();
  if(bridge&&typeof bridge.getPermissionRows==='function')return bridge.getPermissionRows(roleId);
  return boReadTable_(H38_BO_SHEETS.PERMISSIONS,{includeVoided:true}).filter(function(row){
    return row['Role ID']===roleId;
  });
}
function boModuleMatchesPermission_(permissionModule,requestedModule){
  var bridge=boAuthBridge_();
  if(bridge&&typeof bridge.moduleMatchesPermission==='function')return bridge.moduleMatchesPermission(permissionModule,requestedModule);
  var granted=boAuthText_(permissionModule).toLowerCase();
  var requested=boAuthText_(requestedModule).toLowerCase();
  if(granted==='all modules')return true;
  return granted.split(',').some(function(part){
    var token=boAuthText_(part).toLowerCase();
    return token&&(requested.indexOf(token)>=0||token.indexOf(requested)>=0);
  });
}
function boHasPermission_(user,moduleName,action){
  var bridge=boAuthBridge_();
  if(bridge&&typeof bridge.hasPermission==='function')return bridge.hasPermission(user,moduleName,action);
  var role=boGetRole_(user['Role ID']);
  if(!role)return false;
  var column=String(action||'View').replace(/^./,function(character){return character.toUpperCase();});
  return boGetPermissionRows_(user['Role ID']).some(function(row){
    return boModuleMatchesPermission_(row.Module,moduleName)&&row[column]==='Yes';
  });
}
function boRequirePermission_(moduleName,action){
  var bridge=boAuthBridge_();
  if(bridge&&typeof bridge.requirePermission==='function')return bridge.requirePermission(moduleName,action);
  var user=boGetCurrentUser_();
  boAuthAssert_(boHasPermission_(user,moduleName,action),'Your role does not allow '+action+' access to '+moduleName+'.');
  return user;
}
function boRequireOwner_(){
  var bridge=boAuthBridge_();
  if(bridge&&typeof bridge.requireOwner==='function')return bridge.requireOwner();
  var user=boGetCurrentUser_();
  var role=boGetRole_(user['Role ID']);
  boAuthAssert_(role&&role['Role Name']==='Owner','Owner approval is required.');
  return user;
}
function boCanAccessRestrictedArea_(user,area){
  var bridge=boAuthBridge_();
  if(bridge&&typeof bridge.canAccessRestrictedArea==='function')return bridge.canAccessRestrictedArea(user,area);
  var key={payroll:'Payroll Access',tax:'Tax Access',posting:'Posting Access',send:'Customer Send Access',export:'Export Access',users:'User Access Admin'}[String(area||'').toLowerCase()];
  return key?user[key]==='Yes':false;
}
function boRequireRestrictedArea_(area){
  var bridge=boAuthBridge_();
  if(bridge&&typeof bridge.requireRestrictedArea==='function')return bridge.requireRestrictedArea(area);
  var user=boGetCurrentUser_();
  boAuthAssert_(boCanAccessRestrictedArea_(user,area),'Your role does not allow access to '+area+'.');
  return user;
}
function boGetClientContext(){
  var bridge=boAuthBridge_();
  if(bridge&&typeof bridge.getClientContext==='function')return bridge.getClientContext();
  var user=boGetCurrentUser_(),role=boGetRole_(user['Role ID']),pack=boGetPackSnapshot_();
  return {
    version:H38_BO.VERSION,
    businessId:boGetBusinessId_(),
    business:{id:pack.business.id,name:pack.business.publicName,legalName:pack.business.legalName||'',timeZone:pack.business.timeZone,branding:pack.branding,urls:pack.urls,approvalNotice:boApprovalNotice_(),packId:pack.packId,deploymentMode:pack.deployment.mode},
    modules:pack.modules,
    user:{id:user['User ID'],email:user.Email,displayName:user['Display Name'],role:role?role['Role Name']:'',payrollAccess:user['Payroll Access']==='Yes',taxAccess:user['Tax Access']==='Yes',postingAccess:user['Posting Access']==='Yes',customerSendAccess:user['Customer Send Access']==='Yes',exportAccess:user['Export Access']==='Yes',userAdminAccess:user['User Access Admin']==='Yes'},
    boundaries:{externalActionsEnabled:false,directPaymentProcessing:false,directPayrollFunding:false,directTaxFiling:false,tax:boTaxBoundary_(),accounting:boAccountingBoundary_()}
  };
}
