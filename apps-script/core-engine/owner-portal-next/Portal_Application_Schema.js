/** Role-aware bootstrap and client schema for the single Highway 38 application. */

function h38PortalApplicationBootstrap() {
  var access = h38PortalRequireUnifiedUser_();
  if (access.ownerMode) {
    var owner = h38PortalBootstrap();
    try { owner.fieldRoles = typeof h38PortalEnsureFieldRoles_ === 'function' ? h38PortalEnsureFieldRoles_() : {status:'HOLD',message:'Field-role provisioning service is unavailable.'}; }
    catch (error) { owner.fieldRoles = {status:'HOLD',message:error.message || String(error)}; }
    return owner;
  }
  var unified = h38PortalUnifiedBootstrap();
  return {
    release:(typeof H38_BO !== 'undefined' ? H38_BO.VERSION : 'Unified') + ' · Role workspace',
    installed:{installed:true,reason:'Business Office role access is active.'},
    catalog:{status:'Role controlled'},
    modules:unified.groups.reduce(function(list,group){return list.concat(group.items.map(function(item){return item.module;}));},[]),
    fieldRole:typeof h38FieldRoleKnown_ === 'function' && h38FieldRoleKnown_(access.role) ? h38FieldRoleProfile_(access.role) : null,
    safety:{ownerOnly:false,roleAware:true,selectedRecordOnly:true,bulkExecution:false,automaticRetry:false,liveExternalActions:false,triggers:false},
    user:unified.user
  };
}

function h38PortalApplicationClientSchema() {
  var access = h38PortalRequireUnifiedUser_();
  if (access.ownerMode) return h38PortalClientSchema();
  var definitions = h38PortalBusinessDefinitions_();
  var creatable = [];
  var editable = [];
  Object.keys(definitions).forEach(function(moduleKey){
    if (h38PortalBusinessPermission_(access,moduleKey,'Create')) creatable.push(moduleKey);
    if (h38PortalBusinessPermission_(access,moduleKey,'Edit')) editable.push(moduleKey);
  });
  var canView=function(moduleKey){
    if(typeof h38FieldRoleKnown_==='function'&&h38FieldRoleKnown_(access.role))return h38FieldRoleCanView_(access,moduleKey);
    return h38PortalApplicationRoleCanView_(access,moduleKey);
  };
  return {
    release:typeof H38_BO !== 'undefined' ? H38_BO.VERSION : 'Unified',
    modules:Object.keys(definitions).filter(canView),
    workspaceSections:['Summary','Related records','Files','Communications','Money','Proof and errors','Timeline'],
    tables:{},
    statuses:{
      task:['Open','In progress','Waiting','On hold','Complete'],
      approval:['Owner Review Required','Approved','Revision Requested','On Hold','Rejected']
    },
    expenseCategories:[],catalog:[],creatable:creatable,editable:editable,businessDefinitions:definitions,
    fieldRole:typeof h38FieldRoleKnown_==='function'&&h38FieldRoleKnown_(access.role)?h38FieldRoleProfile_(access.role):null,
    safety:{ownerOnly:false,roleAware:true,selectedRecordOnly:true,bulkExecution:false,triggers:false,liveExternalActions:false}
  };
}
