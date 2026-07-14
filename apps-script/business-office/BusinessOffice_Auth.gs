/** Highway 38 Business Office — user, role, and permission enforcement. */

function boGetActiveEmail_() {
  return boNormalizeText_(Session.getActiveUser().getEmail()).toLowerCase();
}

function boGetCurrentUser_() {
  const email = boGetActiveEmail_();
  boAssert_(email, 'A signed-in Google account is required.');
  const rows = boReadTable_(H38_BO_SHEETS.USERS, { includeVoided: true });
  const user = rows.find(function (row) {
    return boNormalizeText_(row.Email).toLowerCase() === email && row.Status === 'Active';
  });
  boAssert_(user, 'This account is not authorized for the Highway 38 Business Office.');
  boAssert_(user['Business ID'] === boGetBusinessId_(), 'This account is not authorized for the selected business.');
  return user;
}

function boGetRole_(roleId) {
  return boReadTable_(H38_BO_SHEETS.ROLES, { includeVoided: true }).find(function (row) {
    return row['Role ID'] === roleId && row.Active === 'Yes';
  }) || null;
}

function boGetPermissionRows_(roleId) {
  return boReadTable_(H38_BO_SHEETS.PERMISSIONS, { includeVoided: true }).filter(function (row) {
    return row['Role ID'] === roleId;
  });
}

function boModuleMatchesPermission_(permissionModule, requestedModule) {
  const granted = boNormalizeText_(permissionModule).toLowerCase();
  const requested = boNormalizeText_(requestedModule).toLowerCase();
  if (granted === 'all modules') return true;
  return granted.split(',').some(function (part) {
    const token = part.trim().toLowerCase();
    return token && (requested.indexOf(token) >= 0 || token.indexOf(requested) >= 0);
  });
}

function boHasPermission_(user, moduleName, action) {
  const role = boGetRole_(user['Role ID']);
  if (!role) return false;
  const column = String(action || 'View').replace(/^./, function (c) { return c.toUpperCase(); });
  return boGetPermissionRows_(user['Role ID']).some(function (row) {
    return boModuleMatchesPermission_(row.Module, moduleName) && row[column] === 'Yes';
  });
}

function boRequirePermission_(moduleName, action) {
  const user = boGetCurrentUser_();
  boAssert_(boHasPermission_(user, moduleName, action), 'Your role does not allow ' + action + ' access to ' + moduleName + '.');
  return user;
}

function boRequireOwner_() {
  const user = boGetCurrentUser_();
  const role = boGetRole_(user['Role ID']);
  boAssert_(role && role['Role Name'] === 'Owner', 'Owner approval is required.');
  return user;
}

function boCanAccessRestrictedArea_(user, area) {
  const key = {
    payroll: 'Payroll Access',
    tax: 'Tax Access',
    posting: 'Posting Access',
    send: 'Customer Send Access',
    export: 'Export Access',
    users: 'User Access Admin'
  }[String(area || '').toLowerCase()];
  return key ? user[key] === 'Yes' : false;
}

function boRequireRestrictedArea_(area) {
  const user = boGetCurrentUser_();
  boAssert_(boCanAccessRestrictedArea_(user, area), 'Your role does not allow access to ' + area + '.');
  return user;
}

function boGetClientContext() {
  const user = boGetCurrentUser_();
  const role = boGetRole_(user['Role ID']);
  return {
    version: H38_BO.VERSION,
    businessId: boGetBusinessId_(),
    user: {
      id: user['User ID'],
      email: user.Email,
      displayName: user['Display Name'],
      role: role ? role['Role Name'] : '',
      payrollAccess: user['Payroll Access'] === 'Yes',
      taxAccess: user['Tax Access'] === 'Yes',
      postingAccess: user['Posting Access'] === 'Yes',
      customerSendAccess: user['Customer Send Access'] === 'Yes',
      exportAccess: user['Export Access'] === 'Yes',
      userAdminAccess: user['User Access Admin'] === 'Yes'
    },
    boundaries: {
      externalActionsEnabled: H38_BO.EXTERNAL_ACTIONS_ENABLED,
      directPaymentProcessing: H38_BO.DIRECT_PAYMENT_PROCESSING,
      directPayrollFunding: H38_BO.DIRECT_PAYROLL_FUNDING,
      directTaxFiling: H38_BO.DIRECT_TAX_FILING,
      tax: H38_BO.TAX_BOUNDARY,
      accounting: H38_BO.ACCOUNTING_BOUNDARY
    }
  };
}
