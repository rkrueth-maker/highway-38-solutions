/** Role-aware bootstrap and client schema for the single Highway 38 application. */

function h38PortalApplicationBootstrap() {
  var access = h38PortalRequireUnifiedUser_();
  if (access.ownerMode) return h38PortalBootstrap();
  var unified = h38PortalUnifiedBootstrap();
  return {
    release:(typeof H38_BO !== 'undefined' ? H38_BO.VERSION : 'Unified') + ' · Role workspace',
    installed:{installed:true,reason:'Business Office role access is active.'},
    catalog:{status:'Role controlled'},
    modules:unified.groups.reduce(function(list,group){return list.concat(group.items.map(function(item){return item.module;}));},[]),
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
  return {
    release:typeof H38_BO !== 'undefined' ? H38_BO.VERSION : 'Unified',
    modules:Object.keys(definitions).filter(function(moduleKey){return h38PortalApplicationRoleCanView_(access,moduleKey);}),
    workspaceSections:['Summary','Related records','Files','Communications','Money','Proof and errors','Timeline'],
    tables:{},
    statuses:{
      task:['Open','In progress','Waiting','On hold','Complete'],
      approval:['Owner Review Required','Approved','Revision Requested','On Hold','Rejected']
    },
    expenseCategories:[],catalog:[],creatable:creatable,editable:editable,businessDefinitions:definitions,
    safety:{ownerOnly:false,roleAware:true,selectedRecordOnly:true,bulkExecution:false,triggers:false,liveExternalActions:false}
  };
}
