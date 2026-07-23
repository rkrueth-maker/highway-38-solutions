/**
 * Highway 38 unified Apps Script application shell.
 *
 * This file owns the combined deployment entry point, authentication boundary,
 * route selection, application registry, and capability ownership. Business
 * modules remain in their existing reusable source files.
 */

var H38_UNIFIED_SHELL = Object.freeze({
  VERSION:'3.1.0',
  OWNER_PORTAL:'owner-portal',
  BUSINESS_OFFICE:'business-office',
  QUOTE_BUILDER:'quote-builder',
  EXTERNAL_ACTIONS_ENABLED:false
});

var H38_PORTAL_AUTH_BRIDGE = (function(){
  var SHEETS = Object.freeze({USERS:'BO Users',ROLES:'BO Roles',PERMISSIONS:'BO Permissions'});
  var packCache = null;
  var spreadsheetCache = null;

  function text(value){return String(value == null ? '' : value).trim();}
  function assertValue(condition,message){if(!condition)throw new Error(message || 'Unified application authentication failed.');}
  function properties(){return PropertiesService.getScriptProperties();}

  function readPack(){
    if(packCache)return packCache;
    var pack = null;
    var raw = properties().getProperty('BUSINESS_OFFICE_PACK_JSON');
    if(raw){
      try{pack=JSON.parse(raw);}catch(error){throw new Error('Business Office pack JSON is invalid: '+error.message);}
    }
    if(!pack && typeof BO_EMBEDDED_BUSINESS_PACK !== 'undefined' && BO_EMBEDDED_BUSINESS_PACK)pack=BO_EMBEDDED_BUSINESS_PACK;
    assertValue(pack && pack.business && pack.storage,'No valid Business Office business pack is installed.');
    packCache=pack;
    return packCache;
  }

  function packValue(path,fallback){
    var value=readPack();
    String(path||'').split('.').filter(Boolean).forEach(function(key){
      value=value!=null && Object.prototype.hasOwnProperty.call(value,key)?value[key]:undefined;
    });
    return value==null?fallback:value;
  }

  function configuredValue(logicalName,aliases){
    var key=packValue('storage.propertyKeys.'+logicalName,logicalName);
    var candidates=[key,logicalName].concat(aliases||[]);
    var scriptProperties=properties();
    for(var index=0;index<candidates.length;index+=1){
      var candidate=text(candidates[index]);
      if(!candidate)continue;
      var value=text(scriptProperties.getProperty(candidate));
      if(value)return value;
    }
    return '';
  }

  function businessId(){
    return configuredValue('businessId',['H38_BUSINESS_OFFICE_DEFAULT_BUSINESS_ID','BUSINESS_OFFICE_DEFAULT_BUSINESS_ID']) || text(packValue('business.id','BUSINESS')) || 'BUSINESS';
  }

  function businessTitle(){
    var name=text(packValue('business.publicName','Business Office')) || 'Business Office';
    return /business office$/i.test(name)?name:name+' Business Office';
  }

  function spreadsheet(){
    if(spreadsheetCache)return spreadsheetCache;
    var id=configuredValue('spreadsheetId',['H38_BUSINESS_OFFICE_SPREADSHEET_ID','BUSINESS_OFFICE_SPREADSHEET_ID','H38_BACKEND_SPREADSHEET_ID']);
    assertValue(id,'Missing Business Office spreadsheet configuration.');
    spreadsheetCache=SpreadsheetApp.openById(id);
    return spreadsheetCache;
  }

  function readTable(sheetName,options){
    var opts=options||{};
    var sheet=spreadsheet().getSheetByName(sheetName);
    assertValue(sheet,'Missing Business Office sheet: '+sheetName);
    var values=sheet.getDataRange().getDisplayValues();
    if(!values.length)return [];
    var headers=values[0].map(text);
    return values.slice(1).filter(function(row){return row.some(function(value){return value!=='';});}).map(function(row,index){
      var record={__rowNumber:index+2};
      headers.forEach(function(header,columnIndex){if(header)record[header]=row[columnIndex];});
      return record;
    }).filter(function(record){
      if(opts.allBusinesses)return true;
      if(!Object.prototype.hasOwnProperty.call(record,'Business ID'))return true;
      return text(record['Business ID'])===businessId();
    }).filter(function(record){
      return opts.includeVoided || (record['Is Voided']!=='Yes' && record.Status!=='Voided');
    });
  }

  function getActiveEmail(){return text(Session.getActiveUser().getEmail()).toLowerCase();}

  function getCurrentUser(){
    var email=getActiveEmail();
    assertValue(email,'A signed-in Google account is required.');
    var user=readTable(SHEETS.USERS,{includeVoided:true}).find(function(row){
      return text(row.Email).toLowerCase()===email && row.Status==='Active';
    });
    assertValue(user,'This account is not authorized for '+businessTitle()+'.');
    assertValue(text(user['Business ID'])===businessId(),'This account is not authorized for the selected business installation.');
    return user;
  }

  function getRole(roleId){
    return readTable(SHEETS.ROLES,{includeVoided:true}).find(function(row){return row['Role ID']===roleId && row.Active==='Yes';}) || null;
  }

  function getPermissionRows(roleId){
    return readTable(SHEETS.PERMISSIONS,{includeVoided:true}).filter(function(row){return row['Role ID']===roleId;});
  }

  function moduleMatchesPermission(permissionModule,requestedModule){
    var granted=text(permissionModule).toLowerCase();
    var requested=text(requestedModule).toLowerCase();
    if(granted==='all modules')return true;
    return granted.split(',').some(function(part){
      var token=text(part).toLowerCase();
      return token && (requested.indexOf(token)>=0 || token.indexOf(requested)>=0);
    });
  }

  function hasPermission(user,moduleName,action){
    var role=getRole(user['Role ID']);
    if(!role)return false;
    var column=String(action||'View').replace(/^./,function(character){return character.toUpperCase();});
    return getPermissionRows(user['Role ID']).some(function(row){return moduleMatchesPermission(row.Module,moduleName) && row[column]==='Yes';});
  }

  function requirePermission(moduleName,action){
    var user=getCurrentUser();
    assertValue(hasPermission(user,moduleName,action),'Your role does not allow '+action+' access to '+moduleName+'.');
    return user;
  }

  function requireOwner(){
    var user=getCurrentUser();
    var role=getRole(user['Role ID']);
    assertValue(role && role['Role Name']==='Owner','Owner approval is required.');
    return user;
  }

  function canAccessRestrictedArea(user,area){
    var key={payroll:'Payroll Access',tax:'Tax Access',posting:'Posting Access',send:'Customer Send Access',export:'Export Access',users:'User Access Admin'}[String(area||'').toLowerCase()];
    return key?user[key]==='Yes':false;
  }

  function requireRestrictedArea(area){
    var user=getCurrentUser();
    assertValue(canAccessRestrictedArea(user,area),'Your role does not allow access to '+area+'.');
    return user;
  }

  function getClientContext(){
    var user=getCurrentUser();
    var role=getRole(user['Role ID']);
    var pack=readPack();
    var workflow=pack.workflow||{};
    var boundaries=pack.boundaries||{};
    var deployment=pack.deployment||{};
    return {
      version:H38_UNIFIED_SHELL.VERSION,
      businessId:businessId(),
      business:{id:text(packValue('business.id',businessId())),name:text(packValue('business.publicName','Business Office')),legalName:text(packValue('business.legalName','')),timeZone:text(packValue('business.timeZone','UTC'))||'UTC',branding:pack.branding||{},urls:pack.urls||{},approvalNotice:text(workflow.approvalNotice||'External actions require explicit owner approval.'),packId:text(pack.packId||'configured-business'),deploymentMode:text(deployment.mode||'combined')},
      modules:pack.modules||{},
      user:{id:user['User ID'],email:user.Email,displayName:user['Display Name'],role:role?role['Role Name']:'',payrollAccess:user['Payroll Access']==='Yes',taxAccess:user['Tax Access']==='Yes',postingAccess:user['Posting Access']==='Yes',customerSendAccess:user['Customer Send Access']==='Yes',exportAccess:user['Export Access']==='Yes',userAdminAccess:user['User Access Admin']==='Yes'},
      boundaries:{externalActionsEnabled:false,directPaymentProcessing:false,directPayrollFunding:false,directTaxFiling:false,tax:text(boundaries.tax||'Tax-preparation support only.'),accounting:text(boundaries.accounting||'Accounting-preparation system.')}
    };
  }

  return Object.freeze({text:text,assertValue:assertValue,readPack:readPack,packValue:packValue,businessId:businessId,readTable:readTable,getActiveEmail:getActiveEmail,getCurrentUser:getCurrentUser,getRole:getRole,getPermissionRows:getPermissionRows,moduleMatchesPermission:moduleMatchesPermission,hasPermission:hasPermission,requirePermission:requirePermission,requireOwner:requireOwner,canAccessRestrictedArea:canAccessRestrictedArea,requireRestrictedArea:requireRestrictedArea,getClientContext:getClientContext});
})();

function h38UnifiedShellParameter_(event,name){
  return H38_PORTAL_AUTH_BRIDGE.text(event && event.parameter ? event.parameter[name] : '');
}

function h38UnifiedShellCapabilityOwner_(capability){
  var modules=H38_PORTAL_AUTH_BRIDGE.readPack().modules||{};
  if(capability==='quotes')return modules.quoteBuilder===true && modules.quotes!==false ? 'quoteBuilder' : 'legacyQuotes';
  return capability;
}

function h38UnifiedShellRegistry(){
  var pack=H38_PORTAL_AUTH_BRIDGE.readPack();
  var modules=pack.modules||{};
  var quoteOwner=h38UnifiedShellCapabilityOwner_('quotes');
  return {
    version:H38_UNIFIED_SHELL.VERSION,
    singleApp:true,
    installedApps:{businessOffice:true,quoteBuilder:quoteOwner==='quoteBuilder'},
    capabilityOwners:{quotes:quoteOwner},
    disabledLegacyCapabilities:{quotes:quoteOwner==='quoteBuilder'},
    routes:{ownerPortal:'',businessOffice:'',quoteBuilder:'?quoteBuilder=1'},
    modules:modules,
    externalActionsEnabled:false,
    ownerApprovalRequired:true
  };
}

function h38UnifiedShellBootstrap(){
  var user=H38_PORTAL_AUTH_BRIDGE.getCurrentUser();
  var role=H38_PORTAL_AUTH_BRIDGE.getRole(user['Role ID']);
  var registry=h38UnifiedShellRegistry();
  registry.user={id:user['User ID'],email:user.Email,displayName:user['Display Name'],role:role?role['Role Name']:'',ownerMode:!!(role&&role['Role Name']==='Owner')};
  return registry;
}

function h38UnifiedShellRenderPortal_(){
  var title='Highway 38 Business System';
  if(typeof H38_PORTAL_NEXT!=='undefined' && H38_PORTAL_NEXT && H38_PORTAL_NEXT.APP_NAME)title=H38_PORTAL_NEXT.APP_NAME;
  return HtmlService.createTemplateFromFile('Portal_Index').evaluate().setTitle(title).setSandboxMode(HtmlService.SandboxMode.IFRAME).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function h38UnifiedShellRenderBusinessOffice_(){
  if(typeof boRenderWebApp_!=='function')throw new Error('Business Office renderer is unavailable.');
  return boRenderWebApp_();
}

function h38UnifiedShellRenderQuoteBuilder_(){
  if(h38UnifiedShellCapabilityOwner_('quotes')!=='quoteBuilder')return h38UnifiedShellRenderPortal_();
  if(typeof boRenderQuoteBuilderApp_!=='function')throw new Error('Quote Builder renderer is unavailable.');
  return boRenderQuoteBuilderApp_();
}

function doGet(event){
  H38_PORTAL_AUTH_BRIDGE.getCurrentUser();
  var app=h38UnifiedShellParameter_(event,'app').toLowerCase();
  var quoteBuilder=h38UnifiedShellParameter_(event,'quoteBuilder');
  if(quoteBuilder==='1' || app===H38_UNIFIED_SHELL.QUOTE_BUILDER)return h38UnifiedShellRenderQuoteBuilder_();
  if(app===H38_UNIFIED_SHELL.BUSINESS_OFFICE)return h38UnifiedShellRenderPortal_();
  return h38UnifiedShellRenderPortal_();
}
