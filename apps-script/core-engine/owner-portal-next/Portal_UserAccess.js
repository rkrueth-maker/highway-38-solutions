/** Owner-controlled user creation, role assignment, and account status management. */

var H38_USER_ACCESS_FIELDS_ = Object.freeze([
  'Payroll Access','Tax Access','Posting Access','Customer Send Access','Export Access','User Access Admin'
]);

function h38PortalUserAccessRequireOwner_() {
  var access = h38PortalRequireUnifiedUser_();
  boAssert_(access.ownerMode,'Owner approval is required to change user access.');
  return access;
}

function h38PortalUserAccessActiveRoles_() {
  return boReadTable_(H38_BO_SHEETS.ROLES,{includeVoided:true}).filter(function(role){
    return role.Active === 'Yes';
  }).map(function(role){
    return {
      id:role['Role ID'],
      name:role['Role Name'],
      description:role.Description || role['Role Description'] || '',
      active:true
    };
  }).sort(function(a,b){
    var order=['Owner','Administrator','Foreman','Employee','Field Staff','Estimator','Staff','Bookkeeper','Payroll','Viewer','Customer'];
    var ai=order.indexOf(a.name),bi=order.indexOf(b.name);
    if(ai<0)ai=999;if(bi<0)bi=999;
    return ai-bi || a.name.localeCompare(b.name);
  });
}

function h38PortalUserAccessDefaultsForRole_(roleName) {
  var defaults={
    'Payroll Access':'No',
    'Tax Access':'No',
    'Posting Access':'No',
    'Customer Send Access':'No',
    'Export Access':'No',
    'User Access Admin':'No'
  };
  if(roleName==='Owner')H38_USER_ACCESS_FIELDS_.forEach(function(field){defaults[field]='Yes';});
  if(roleName==='Administrator'){
    defaults['Customer Send Access']='Yes';
    defaults['Export Access']='Yes';
    defaults['User Access Admin']='Yes';
  }
  if(roleName==='Bookkeeper'){
    defaults['Posting Access']='Yes';
    defaults['Export Access']='Yes';
  }
  if(roleName==='Payroll'){
    defaults['Payroll Access']='Yes';
    defaults['Export Access']='Yes';
  }
  return defaults;
}

function h38PortalUserAccessRows_() {
  var roles=h38PortalUserAccessActiveRoles_(),roleById={};
  roles.forEach(function(role){roleById[role.id]=role;});
  return boReadTable_(H38_BO_SHEETS.USERS,{includeVoided:true}).filter(function(user){
    return boNormalizeText_(user['Business ID'])===boGetBusinessId_();
  }).map(function(user){
    var role=roleById[user['Role ID']]||{id:user['Role ID'],name:'Unknown role'};
    return {
      id:user['User ID'],
      businessId:user['Business ID'],
      displayName:user['Display Name'],
      email:user.Email,
      status:user.Status,
      roleId:role.id,
      role:role.name,
      payrollAccess:user['Payroll Access']||'No',
      taxAccess:user['Tax Access']||'No',
      postingAccess:user['Posting Access']||'No',
      customerSendAccess:user['Customer Send Access']||'No',
      exportAccess:user['Export Access']||'No',
      userAdminAccess:user['User Access Admin']||'No',
      isOwner:role.name==='Owner'
    };
  }).sort(function(a,b){
    if(a.isOwner!==b.isOwner)return a.isOwner?-1:1;
    return String(a.displayName||a.email).localeCompare(String(b.displayName||b.email));
  });
}

function h38PortalUserAccessManagerSnapshot() {
  var access=h38PortalRequireUnifiedUser_();
  boAssert_(access.ownerMode || access.role==='Administrator','User access administration is restricted.');
  return {
    status:'PASS',
    canManage:access.ownerMode===true,
    currentUserId:access.user['User ID'],
    users:h38PortalUserAccessRows_(),
    roles:h38PortalUserAccessActiveRoles_(),
    guidance:'Adding a user authorizes that exact Google account email. No invitation email is sent automatically.',
    externalActionsOccurred:false
  };
}

function h38PortalUserAccessSheet_() {
  var sheet=boGetSpreadsheet_().getSheetByName(H38_BO_SHEETS.USERS);
  boAssert_(sheet,'The user access table is unavailable.');
  var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  ['User ID','Business ID','Email','Display Name','Role ID','Status'].forEach(function(header){
    boAssert_(headers.indexOf(header)>=0,'The user access table is missing '+header+'.');
  });
  return {sheet:sheet,headers:headers};
}

function h38PortalUserAccessGenerateId_(existingUsers) {
  var known={};(existingUsers||[]).forEach(function(user){known[user['User ID']]=true;});
  var id='';
  do{id='USER-'+Utilities.getUuid().replace(/-/g,'').slice(0,12).toUpperCase();}while(known[id]);
  return id;
}

function h38PortalUserAccessWrite_(record) {
  var table=h38PortalUserAccessSheet_(),sheet=table.sheet,headers=table.headers;
  var rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,headers.length).getDisplayValues():[];
  var idIndex=headers.indexOf('User ID'),match=-1;
  rows.some(function(row,index){if(row[idIndex]===record['User ID']){match=index;return true;}return false;});
  var current={};
  if(match>=0)headers.forEach(function(header,index){current[header]=rows[match][index];});
  Object.keys(record).forEach(function(key){current[key]=record[key];});
  var target=match>=0?match+2:sheet.getLastRow()+1;
  sheet.getRange(target,1,1,headers.length).setValues([headers.map(function(header){return current[header]==null?'':current[header];})]);
  return current;
}

function h38PortalUserAccessSave(payload) {
  var access=h38PortalUserAccessRequireOwner_(),input=payload||{};
  var userId=boNormalizeText_(input.userId),email=boNormalizeText_(input.email).toLowerCase();
  var displayName=boNormalizeText_(input.displayName),roleId=boNormalizeText_(input.roleId),status=boNormalizeText_(input.status)||'Active';
  boAssert_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email),'Enter a valid Google account email address.');
  boAssert_(displayName,'Display name is required.');
  boAssert_(['Active','Inactive'].indexOf(status)>=0,'Status must be Active or Inactive.');
  var roles=h38PortalUserAccessActiveRoles_(),role=roles.filter(function(item){return item.id===roleId;})[0];
  boAssert_(role,'Select an active role.');
  var rawUsers=boReadTable_(H38_BO_SHEETS.USERS,{includeVoided:true}).filter(function(user){return boNormalizeText_(user['Business ID'])===boGetBusinessId_();});
  var existing=userId?rawUsers.filter(function(user){return user['User ID']===userId;})[0]:null;
  boAssert_(!userId || existing,'The selected user no longer exists. Refresh User Access and try again.');
  var duplicate=rawUsers.filter(function(user){return boNormalizeText_(user.Email).toLowerCase()===email && user['User ID']!==userId;})[0];
  boAssert_(!duplicate,'That Google account is already authorized. Open its existing user card to edit it.');
  var isCurrentOwner=existing && existing['User ID']===access.user['User ID'];
  if(isCurrentOwner){
    boAssert_(role.name==='Owner','The signed-in Owner cannot be assigned a different role.');
    boAssert_(status==='Active','The signed-in Owner cannot be deactivated.');
    boAssert_(email===boNormalizeText_(existing.Email).toLowerCase(),'The signed-in Owner email cannot be changed here.');
  }
  boAssert_(role.name!=='Owner' || isCurrentOwner,'Additional Owner accounts cannot be created from User Access.');
  var creating=!existing;
  if(!userId)userId=h38PortalUserAccessGenerateId_(rawUsers);
  var record=existing?Object.assign({},existing):{};
  record['User ID']=userId;
  record['Business ID']=boGetBusinessId_();
  record.Email=email;
  record['Display Name']=displayName;
  record['Role ID']=role.id;
  record.Status=status;
  if(!existing || existing['Role ID']!==role.id){
    var defaults=h38PortalUserAccessDefaultsForRole_(role.name);
    H38_USER_ACCESS_FIELDS_.forEach(function(field){record[field]=defaults[field];});
  } else {
    H38_USER_ACCESS_FIELDS_.forEach(function(field){record[field]=record[field]||'No';});
  }
  h38PortalUserAccessWrite_(record);
  if(typeof boProof_==='function')boProof_(creating?'USER_ACCESS_CREATED':'USER_ACCESS_UPDATED','User',userId,'PASS',JSON.stringify({email:email,role:role.name,status:status,externalActionsOccurred:false}),access.user.Email);
  var snapshot=h38PortalUserAccessManagerSnapshot();
  snapshot.savedUserId=userId;
  snapshot.message=(creating?'User added':'User access updated')+'. The person must sign in with '+email+'.';
  return snapshot;
}
