/**
 * Unified Owner Portal authentication bridge.
 *
 * The canonical implementations live in BusinessOffice_Auth.gs. The unified
 * deployment also carries these guarded definitions in a Portal-prefixed file
 * so an inherited clasp ignore rule or incomplete Business Office assembly can
 * never leave the production Owner Portal without authentication functions.
 * Existing canonical functions always win when they are present.
 */
(function(global){
  if (typeof global.boGetActiveEmail_ !== 'function') {
    global.boGetActiveEmail_ = function(){
      return boNormalizeText_(Session.getActiveUser().getEmail()).toLowerCase();
    };
  }

  if (typeof global.boGetCurrentUser_ !== 'function') {
    global.boGetCurrentUser_ = function(){
      var email = global.boGetActiveEmail_();
      boAssert_(email,'A signed-in Google account is required.');
      var user = boReadTable_(H38_BO_SHEETS.USERS,{includeVoided:true}).find(function(row){
        return boNormalizeText_(row.Email).toLowerCase() === email && row.Status === 'Active';
      });
      boAssert_(user,'This account is not authorized for ' + boBusinessOfficeTitle_() + '.');
      boAssert_(user['Business ID'] === boGetBusinessId_(),'This account is not authorized for the selected business installation.');
      return user;
    };
  }

  if (typeof global.boGetRole_ !== 'function') {
    global.boGetRole_ = function(roleId){
      return boReadTable_(H38_BO_SHEETS.ROLES,{includeVoided:true}).find(function(row){
        return row['Role ID'] === roleId && row.Active === 'Yes';
      }) || null;
    };
  }

  if (typeof global.boGetPermissionRows_ !== 'function') {
    global.boGetPermissionRows_ = function(roleId){
      return boReadTable_(H38_BO_SHEETS.PERMISSIONS,{includeVoided:true}).filter(function(row){
        return row['Role ID'] === roleId;
      });
    };
  }

  if (typeof global.boModuleMatchesPermission_ !== 'function') {
    global.boModuleMatchesPermission_ = function(permissionModule,requestedModule){
      var granted = boNormalizeText_(permissionModule).toLowerCase();
      var requested = boNormalizeText_(requestedModule).toLowerCase();
      if (granted === 'all modules') return true;
      return granted.split(',').some(function(part){
        var token = part.trim().toLowerCase();
        return token && (requested.indexOf(token) >= 0 || token.indexOf(requested) >= 0);
      });
    };
  }

  if (typeof global.boHasPermission_ !== 'function') {
    global.boHasPermission_ = function(user,moduleName,action){
      var role = global.boGetRole_(user['Role ID']);
      if (!role) return false;
      var column = String(action || 'View').replace(/^./,function(character){return character.toUpperCase();});
      return global.boGetPermissionRows_(user['Role ID']).some(function(row){
        return global.boModuleMatchesPermission_(row.Module,moduleName) && row[column] === 'Yes';
      });
    };
  }

  if (typeof global.boRequirePermission_ !== 'function') {
    global.boRequirePermission_ = function(moduleName,action){
      var user = global.boGetCurrentUser_();
      boAssert_(global.boHasPermission_(user,moduleName,action),'Your role does not allow ' + action + ' access to ' + moduleName + '.');
      return user;
    };
  }

  if (typeof global.boRequireOwner_ !== 'function') {
    global.boRequireOwner_ = function(){
      var user = global.boGetCurrentUser_();
      var role = global.boGetRole_(user['Role ID']);
      boAssert_(role && role['Role Name'] === 'Owner','Owner approval is required.');
      return user;
    };
  }

  if (typeof global.boCanAccessRestrictedArea_ !== 'function') {
    global.boCanAccessRestrictedArea_ = function(user,area){
      var key = {
        payroll:'Payroll Access',tax:'Tax Access',posting:'Posting Access',send:'Customer Send Access',export:'Export Access',users:'User Access Admin'
      }[String(area || '').toLowerCase()];
      return key ? user[key] === 'Yes' : false;
    };
  }

  if (typeof global.boRequireRestrictedArea_ !== 'function') {
    global.boRequireRestrictedArea_ = function(area){
      var user = global.boGetCurrentUser_();
      boAssert_(global.boCanAccessRestrictedArea_(user,area),'Your role does not allow access to ' + area + '.');
      return user;
    };
  }

  if (typeof global.boGetClientContext !== 'function') {
    global.boGetClientContext = function(){
      var user = global.boGetCurrentUser_();
      var role = global.boGetRole_(user['Role ID']);
      var pack = boGetPackSnapshot_();
      return {
        version:H38_BO.VERSION,
        businessId:boGetBusinessId_(),
        business:{id:pack.business.id,name:pack.business.publicName,legalName:pack.business.legalName || '',timeZone:pack.business.timeZone,branding:pack.branding,urls:pack.urls,approvalNotice:boApprovalNotice_(),packId:pack.packId,deploymentMode:pack.deployment.mode},
        modules:pack.modules,
        user:{id:user['User ID'],email:user.Email,displayName:user['Display Name'],role:role ? role['Role Name'] : '',payrollAccess:user['Payroll Access'] === 'Yes',taxAccess:user['Tax Access'] === 'Yes',postingAccess:user['Posting Access'] === 'Yes',customerSendAccess:user['Customer Send Access'] === 'Yes',exportAccess:user['Export Access'] === 'Yes',userAdminAccess:user['User Access Admin'] === 'Yes'},
        boundaries:{externalActionsEnabled:false,directPaymentProcessing:false,directPayrollFunding:false,directTaxFiling:false,tax:boTaxBoundary_(),accounting:boAccountingBoundary_()}
      };
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
