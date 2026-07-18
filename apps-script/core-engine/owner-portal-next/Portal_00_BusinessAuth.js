/**
 * Unified Owner Portal authentication bridge.
 *
 * This bridge is intentionally self-contained. Apps Script can expose server
 * functions from different source files through separate runtime bindings, so
 * authentication must not depend on Business Office helper visibility.
 */
(function(global){
  var SHEETS = Object.freeze({
    USERS:'BO Users',
    ROLES:'BO Roles',
    PERMISSIONS:'BO Permissions'
  });
  var PACK_CACHE = null;
  var SPREADSHEET_CACHE = null;

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function assertValue(condition,message){
    if (!condition) throw new Error(message || 'Business Office authentication failed.');
  }

  function scriptProperties(){
    return PropertiesService.getScriptProperties();
  }

  function readPack(){
    if (PACK_CACHE) return PACK_CACHE;
    var pack = null;
    var raw = scriptProperties().getProperty('BUSINESS_OFFICE_PACK_JSON');
    if (raw) {
      try {
        pack = JSON.parse(raw);
      } catch (error) {
        throw new Error('Business Office pack JSON is invalid: ' + error.message);
      }
    }
    if (!pack) {
      try {
        if (typeof BO_EMBEDDED_BUSINESS_PACK !== 'undefined' && BO_EMBEDDED_BUSINESS_PACK) {
          pack = BO_EMBEDDED_BUSINESS_PACK;
        }
      } catch (ignored) {}
    }
    if (!pack && global && global.BO_EMBEDDED_BUSINESS_PACK) {
      pack = global.BO_EMBEDDED_BUSINESS_PACK;
    }
    PACK_CACHE = pack || {
      schemaVersion:1,
      packId:'configured-business',
      business:{id:'BUSINESS',publicName:'Business Office',legalName:'',timeZone:'UTC'},
      branding:{},
      urls:{},
      modules:{},
      workflow:{
        externalActionsEnabled:false,
        approvalNotice:'Customer actions and external actions require explicit owner approval.'
      },
      boundaries:{
        directPaymentProcessing:false,
        directPayrollFunding:false,
        directTaxFiling:false,
        tax:'Tax-preparation support only.',
        accounting:'Accounting-preparation system.'
      },
      storage:{propertyKeys:{}},
      deployment:{mode:'combined'}
    };
    return PACK_CACHE;
  }

  function packValue(path,fallback){
    var value = readPack();
    String(path || '').split('.').filter(Boolean).forEach(function(key){
      if (value != null && Object.prototype.hasOwnProperty.call(value,key)) value = value[key];
      else value = undefined;
    });
    return value == null ? fallback : value;
  }

  function configuredValue(logicalName,aliases){
    var propertyKey = packValue('storage.propertyKeys.' + logicalName,logicalName);
    var candidates = [propertyKey,logicalName].concat(aliases || []);
    var properties = scriptProperties();
    for (var index = 0; index < candidates.length; index += 1) {
      var key = text(candidates[index]);
      if (!key) continue;
      var value = text(properties.getProperty(key));
      if (value) return value;
    }
    return '';
  }

  function businessId(){
    return configuredValue('businessId',[
      'H38_BUSINESS_OFFICE_DEFAULT_BUSINESS_ID',
      'BUSINESS_OFFICE_DEFAULT_BUSINESS_ID'
    ]) || text(packValue('business.id','BUSINESS')) || 'BUSINESS';
  }

  function businessTitle(){
    var name = text(packValue('business.publicName','Business Office')) || 'Business Office';
    return /business office$/i.test(name) ? name : name + ' Business Office';
  }

  function spreadsheet(){
    if (SPREADSHEET_CACHE) return SPREADSHEET_CACHE;
    var id = configuredValue('spreadsheetId',[
      'H38_BUSINESS_OFFICE_SPREADSHEET_ID',
      'BUSINESS_OFFICE_SPREADSHEET_ID',
      'H38_BACKEND_SPREADSHEET_ID'
    ]);
    assertValue(id,'Missing Business Office spreadsheet configuration.');
    SPREADSHEET_CACHE = SpreadsheetApp.openById(id);
    return SPREADSHEET_CACHE;
  }

  function readTable(sheetName,options){
    var opts = options || {};
    var sheet = spreadsheet().getSheetByName(sheetName);
    assertValue(sheet,'Missing Business Office sheet: ' + sheetName);
    var values = sheet.getDataRange().getDisplayValues();
    if (!values.length) return [];
    var headers = values[0].map(text);
    return values.slice(1).filter(function(row){
      return row.some(function(value){return value !== '';});
    }).map(function(row,index){
      var record = {__rowNumber:index + 2};
      headers.forEach(function(header,columnIndex){
        if (header) record[header] = row[columnIndex];
      });
      return record;
    }).filter(function(record){
      if (opts.allBusinesses) return true;
      if (!Object.prototype.hasOwnProperty.call(record,'Business ID')) return true;
      return text(record['Business ID']) === businessId();
    }).filter(function(record){
      if (opts.includeVoided) return true;
      return record['Is Voided'] !== 'Yes' && record.Status !== 'Voided';
    });
  }

  function getActiveEmail(){
    return text(Session.getActiveUser().getEmail()).toLowerCase();
  }

  function getCurrentUser(){
    var email = getActiveEmail();
    assertValue(email,'A signed-in Google account is required.');
    var user = readTable(SHEETS.USERS,{includeVoided:true}).find(function(row){
      return text(row.Email).toLowerCase() === email && row.Status === 'Active';
    });
    assertValue(user,'This account is not authorized for ' + businessTitle() + '.');
    assertValue(text(user['Business ID']) === businessId(),'This account is not authorized for the selected business installation.');
    return user;
  }

  function getRole(roleId){
    return readTable(SHEETS.ROLES,{includeVoided:true}).find(function(row){
      return row['Role ID'] === roleId && row.Active === 'Yes';
    }) || null;
  }

  function getPermissionRows(roleId){
    return readTable(SHEETS.PERMISSIONS,{includeVoided:true}).filter(function(row){
      return row['Role ID'] === roleId;
    });
  }

  function moduleMatchesPermission(permissionModule,requestedModule){
    var granted = text(permissionModule).toLowerCase();
    var requested = text(requestedModule).toLowerCase();
    if (granted === 'all modules') return true;
    return granted.split(',').some(function(part){
      var token = text(part).toLowerCase();
      return token && (requested.indexOf(token) >= 0 || token.indexOf(requested) >= 0);
    });
  }

  function hasPermission(user,moduleName,action){
    var role = getRole(user['Role ID']);
    if (!role) return false;
    var column = String(action || 'View').replace(/^./,function(character){
      return character.toUpperCase();
    });
    return getPermissionRows(user['Role ID']).some(function(row){
      return moduleMatchesPermission(row.Module,moduleName) && row[column] === 'Yes';
    });
  }

  function requirePermission(moduleName,action){
    var user = getCurrentUser();
    assertValue(hasPermission(user,moduleName,action),'Your role does not allow ' + action + ' access to ' + moduleName + '.');
    return user;
  }

  function requireOwner(){
    var user = getCurrentUser();
    var role = getRole(user['Role ID']);
    assertValue(role && role['Role Name'] === 'Owner','Owner approval is required.');
    return user;
  }

  function canAccessRestrictedArea(user,area){
    var key = {
      payroll:'Payroll Access',
      tax:'Tax Access',
      posting:'Posting Access',
      send:'Customer Send Access',
      export:'Export Access',
      users:'User Access Admin'
    }[String(area || '').toLowerCase()];
    return key ? user[key] === 'Yes' : false;
  }

  function requireRestrictedArea(area){
    var user = getCurrentUser();
    assertValue(canAccessRestrictedArea(user,area),'Your role does not allow access to ' + area + '.');
    return user;
  }

  function getClientContext(){
    var user = getCurrentUser();
    var role = getRole(user['Role ID']);
    var pack = readPack();
    var workflow = pack.workflow || {};
    var boundaries = pack.boundaries || {};
    var deployment = pack.deployment || {};
    return {
      version:'2.0.0',
      businessId:businessId(),
      business:{
        id:text(packValue('business.id',businessId())),
        name:text(packValue('business.publicName','Business Office')),
        legalName:text(packValue('business.legalName','')),
        timeZone:text(packValue('business.timeZone','UTC')) || 'UTC',
        branding:pack.branding || {},
        urls:pack.urls || {},
        approvalNotice:text(workflow.approvalNotice || 'External actions require explicit owner approval.'),
        packId:text(pack.packId || 'configured-business'),
        deploymentMode:text(deployment.mode || 'combined')
      },
      modules:pack.modules || {},
      user:{
        id:user['User ID'],
        email:user.Email,
        displayName:user['Display Name'],
        role:role ? role['Role Name'] : '',
        payrollAccess:user['Payroll Access'] === 'Yes',
        taxAccess:user['Tax Access'] === 'Yes',
        postingAccess:user['Posting Access'] === 'Yes',
        customerSendAccess:user['Customer Send Access'] === 'Yes',
        exportAccess:user['Export Access'] === 'Yes',
        userAdminAccess:user['User Access Admin'] === 'Yes'
      },
      boundaries:{
        externalActionsEnabled:false,
        directPaymentProcessing:false,
        directPayrollFunding:false,
        directTaxFiling:false,
        tax:text(boundaries.tax || 'Tax-preparation support only.'),
        accounting:text(boundaries.accounting || 'Accounting-preparation system.')
      }
    };
  }

  var api = Object.freeze({
    text:text,
    assertValue:assertValue,
    readPack:readPack,
    businessId:businessId,
    readTable:readTable,
    getActiveEmail:getActiveEmail,
    getCurrentUser:getCurrentUser,
    getRole:getRole,
    getPermissionRows:getPermissionRows,
    moduleMatchesPermission:moduleMatchesPermission,
    hasPermission:hasPermission,
    requirePermission:requirePermission,
    requireOwner:requireOwner,
    canAccessRestrictedArea:canAccessRestrictedArea,
    requireRestrictedArea:requireRestrictedArea,
    getClientContext:getClientContext
  });
  global.H38_PORTAL_AUTH_BRIDGE = api;

  if (typeof global.boGetActiveEmail_ !== 'function') global.boGetActiveEmail_ = function(){return getActiveEmail();};
  if (typeof global.boGetCurrentUser_ !== 'function') global.boGetCurrentUser_ = function(){return getCurrentUser();};
  if (typeof global.boGetRole_ !== 'function') global.boGetRole_ = getRole;
  if (typeof global.boGetPermissionRows_ !== 'function') global.boGetPermissionRows_ = getPermissionRows;
  if (typeof global.boModuleMatchesPermission_ !== 'function') global.boModuleMatchesPermission_ = moduleMatchesPermission;
  if (typeof global.boHasPermission_ !== 'function') global.boHasPermission_ = hasPermission;
  if (typeof global.boRequirePermission_ !== 'function') global.boRequirePermission_ = requirePermission;
  if (typeof global.boRequireOwner_ !== 'function') global.boRequireOwner_ = requireOwner;
  if (typeof global.boCanAccessRestrictedArea_ !== 'function') global.boCanAccessRestrictedArea_ = canAccessRestrictedArea;
  if (typeof global.boRequireRestrictedArea_ !== 'function') global.boRequireRestrictedArea_ = requireRestrictedArea;
  if (typeof global.boGetClientContext !== 'function') global.boGetClientContext = getClientContext;
})(typeof globalThis !== 'undefined' ? globalThis : this);
