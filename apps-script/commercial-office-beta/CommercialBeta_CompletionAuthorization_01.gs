/** Multi-user authorization for the reusable Commercial Office platform. */
function cbCompletionSignedIn_(){
  var email=cbCurrentEmail_();
  cbAssert_(email,'Sign in with an authorized Google account. Anonymous access is not allowed.');
  return {email:email};
}
function cbCompletionOwnerEmail_(email){return cbOwnerEmails_().indexOf(cbText_(email).toLowerCase())>=0;}
function cbCompletionBusinessRow_(businessId){
  var id=cbText_(businessId);cbAssert_(id,'Business ID is required.');
  var row=cbRows_(cbControlSpreadsheet_(),CB_CONTROL_SHEETS.BUSINESSES).find(function(item){return item['Business ID']===id;});
  cbAssert_(row,'Business installation was not found.');cbAssert_(cbText_(row.Status).toUpperCase()==='ACTIVE','This business installation is not active.');return row;
}
function cbCompletionRole_(core,roleId){
  var row=cbRows_(core,'roles').find(function(item){return item['Role ID']===roleId;})||{};
  return {roleId:roleId,roleName:row['Role Name']||'',permissions:cbParseJson_(row['Permissions JSON'],{})||{}};
}
function cbCompletionBusinessUser_(businessId){
  var signed=cbCompletionSignedIn_(),row=cbCompletionBusinessRow_(businessId),core=SpreadsheetApp.openById(row['Core Spreadsheet ID']);
  if(cbCompletionOwnerEmail_(signed.email)||cbText_(row['Owner Email']).toLowerCase()===signed.email){
    return {email:signed.email,userId:'USER-OWNER',roleId:'ROLE-OWNER',roleName:'Owner',permissions:{all:true},owner:true,businessId:row['Business ID'],businessRow:row,core:core};
  }
  var user=cbRows_(core,'users').find(function(item){return cbText_(item.Email).toLowerCase()===signed.email&&cbText_(item.Status).toUpperCase()==='ACTIVE';});
  cbAssert_(user,'Your account is not active in this business. Ask the business owner or administrator to add your email.');
  var role=cbCompletionRole_(core,user['Role ID']);
  return {email:signed.email,userId:user['User ID'],displayName:user['Display Name'],roleId:role.roleId,roleName:role.roleName,permissions:role.permissions,owner:false,businessId:row['Business ID'],businessRow:row,core:core,userRow:user};
}
function cbCompletionCan_(user,capability){
  if(user&&user.owner)return true;var permissions=user&&user.permissions?user.permissions:{};
  if(permissions.all===true||permissions[capability]===true)return true;
  var role=cbText_(user&&user.roleName).toLowerCase();
  var managers=['administrator','operations manager'];
  if(managers.indexOf(role)>=0&&['manageBusiness','manageWork','manageUsers','manageSettings','manageCommunications','manageSocial','manageFinancial','manageInventory','manageAssets'].indexOf(capability)>=0)return true;
  if(role==='estimator'&&['manageQuotes','viewCustomers','manageCommunications'].indexOf(capability)>=0)return true;
  if(role==='dispatcher'&&['manageSchedule','manageWork','manageCommunications'].indexOf(capability)>=0)return true;
  if(role==='foreman'&&['manageAssignedWork','manageField','manageCommunications','manageAssets','useInventory'].indexOf(capability)>=0)return true;
  if(role==='field employee'&&['viewAssignedWork','manageField','manageCommunications','useInventory','useAssets'].indexOf(capability)>=0)return true;
  if(role==='inventory manager'&&['manageInventory','managePurchasing','manageCommunications'].indexOf(capability)>=0)return true;
  if(role==='equipment manager'&&['manageAssets','manageMaintenance','manageCommunications'].indexOf(capability)>=0)return true;
  if(role==='bookkeeper'&&['manageFinancial','viewFinancial','manageCommunications'].indexOf(capability)>=0)return true;
  return false;
}
function cbCompletionRequire_(businessId,capability){
  var user=cbCompletionBusinessUser_(businessId);if(capability)cbAssert_(cbCompletionCan_(user,capability),'Your role does not allow this action.');return user;
}
function cbCompletionVisibleBusinesses_(){
  var signed=cbCompletionSignedIn_(),serviceUrl=ScriptApp.getService().getUrl()||'';
  return cbRows_(cbControlSpreadsheet_(),CB_CONTROL_SHEETS.BUSINESSES).filter(function(row){
    if(cbText_(row.Status).toUpperCase()!=='ACTIVE')return false;
    if(cbCompletionOwnerEmail_(signed.email)||cbText_(row['Owner Email']).toLowerCase()===signed.email)return true;
    try{return cbRows_(SpreadsheetApp.openById(row['Core Spreadsheet ID']),'users').some(function(user){return cbText_(user.Email).toLowerCase()===signed.email&&cbText_(user.Status).toUpperCase()==='ACTIVE';});}catch(error){return false;}
  }).map(function(row){
    var packs=cbNormalizeIndustryPacks_(row['Industry Pack']);
    return {businessId:row['Business ID'],businessName:row['Business Name'],ownerEmail:row['Owner Email'],status:row.Status,industryPack:packs[0]||row['Industry Pack'],industryPacks:packs,businessUrl:serviceUrl+'?businessId='+encodeURIComponent(row['Business ID'])};
  });
}
function cbCompletionContext_(businessId,capability){
  var user=cbCompletionRequire_(businessId,capability),row=user.businessRow;
  var context={row:row,user:user,core:user.core,inventory:SpreadsheetApp.openById(row['Inventory Spreadsheet ID']),assets:SpreadsheetApp.openById(row['Asset Spreadsheet ID'])};
  cbEnsurePlatformSchema_(context.core,context.assets);if(typeof cbEnsureCompletionSchema_==='function')cbEnsureCompletionSchema_(context.core,context.inventory,context.assets);return context;
}
