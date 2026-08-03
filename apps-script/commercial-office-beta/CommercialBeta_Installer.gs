/** Idempotent tenant provisioning for the separate commercial beta. */
function cbInstallerStatus_(){
  var user=cbRequireOwner_(),root=cbRootFolder_(),control=cbControlSpreadsheet_();
  return {status:'PASS',environment:CB_CONFIG.environment,version:CB_CONFIG.version,user:user,rootFolderId:root.getId(),rootFolderUrl:cbUrl_('folder',root.getId()),controlSpreadsheetId:control.getId(),controlSpreadsheetUrl:cbUrl_('sheet',control.getId()),businesses:cbListBusinesses_(),externalActionsEnabled:false,productionMigrationEnabled:false};
}

function cbListBusinesses_(){
  cbRequireOwner_();
  return cbRows_(cbControlSpreadsheet_(),CB_CONTROL_SHEETS.BUSINESSES).map(function(row){return{
    businessId:row['Business ID'],businessName:row['Business Name'],ownerEmail:row['Owner Email'],industryPack:row['Industry Pack'],status:row.Status,installationId:row['Installation ID'],rootFolderId:row['Tenant Root Folder ID'],rootFolderUrl:cbUrl_('folder',row['Tenant Root Folder ID']),coreSpreadsheetUrl:cbUrl_('sheet',row['Core Spreadsheet ID']),inventorySpreadsheetUrl:cbUrl_('sheet',row['Inventory Spreadsheet ID']),assetSpreadsheetUrl:cbUrl_('sheet',row['Asset Spreadsheet ID']),createdTime:row['Created Time']
  };});
}

function cbRoleDefinitions_(){
  return [
    ['OWNER','Owner',{all:true}],
    ['ADMIN','Administrator',{manageUsers:true,manageSettings:true,manageInventory:true,manageAssets:true,approve:true}],
    ['OPS','Operations Manager',{manageWork:true,manageCrews:true,manageInventory:true,manageAssets:true}],
    ['ESTIMATOR','Estimator',{manageQuotes:true,viewCustomers:true}],
    ['DISPATCH','Dispatcher',{manageSchedule:true,assignCrews:true}],
    ['FOREMAN','Foreman',{manageAssignedWork:true,issueInventory:true,assignAssets:true}],
    ['FIELD','Field Employee',{viewAssignedWork:true,captureEvidence:true,useInventory:true,useAssets:true}],
    ['INVENTORY','Inventory Manager',{manageInventory:true,purchasing:true}],
    ['PURCHASING','Purchasing',{purchaseOrders:true,receiving:true}],
    ['EQUIPMENT','Equipment Manager',{manageAssets:true,manageMaintenance:true}],
    ['BOOKKEEPER','Bookkeeper',{viewFinancial:true,prepareAccounting:true}],
    ['VIEWER','Viewer',{readOnly:true}]
  ];
}
function cbSeedCore_(spreadsheet,businessId,input,now){
  var businessSheet=spreadsheet.getSheetByName('businesses');
  businessSheet.appendRow([businessId,input.businessName,input.legalName||input.businessName,input.ownerEmail,input.timeZone,input.currency,input.industryPack,'Active',now,now,1]);
  var roles=spreadsheet.getSheetByName('roles');
  cbRoleDefinitions_().forEach(function(def){roles.appendRow(['ROLE-'+def[0],businessId,def[1],JSON.stringify(def[2]),'Active',now,now,1]);});
  spreadsheet.getSheetByName('users').appendRow(['USER-OWNER',businessId,input.ownerEmail,input.ownerName||'Business Owner','ROLE-OWNER','Active','','','',now,now,1]);
  var locations=spreadsheet.getSheetByName('locations');
  locations.appendRow(['LOC-MAIN-SHOP',businessId,'Main Shop','Shop','','Active',now,now,1]);
  locations.appendRow(['LOC-TRUCK-1',businessId,'Truck 1','Truck','','Active',now,now,1]);
  var entitlements=spreadsheet.getSheetByName('entitlements');
  input.modules.forEach(function(moduleKey){entitlements.appendRow([cbUuid_('ENTITLEMENT'),businessId,moduleKey,'Yes','Beta','','',now,now,1]);});
}
function cbManifestRecord_(manifest){
  return {'Installation ID':manifest.installationId,'Idempotency Key':manifest.idempotencyKey,'Business ID':manifest.businessId,'Business Name':manifest.businessName,'Owner Email':manifest.ownerEmail,'Apps Script Project ID':cbText_(cbProperties_().getProperty('COMMERCIAL_BETA_SCRIPT_ID')),'Deployment ID':cbText_(cbProperties_().getProperty('COMMERCIAL_BETA_DEPLOYMENT_ID')),'Web App URL':ScriptApp.getService().getUrl()||'','Drive Root ID':manifest.driveRootId,'Core Spreadsheet ID':manifest.coreSpreadsheetId,'Inventory Spreadsheet ID':manifest.inventorySpreadsheetId,'Asset Spreadsheet ID':manifest.assetSpreadsheetId,'Enabled Modules':manifest.enabledModules.join(','),'Industry Pack':manifest.industryPack,'Schema Version':CB_CONFIG.schemaVersion,'Installer Version':CB_CONFIG.version,'Installation Status':manifest.status,'Last Verification Result':manifest.lastVerificationResult,'Backup Folder ID':manifest.backupFolderId,'Support Access Status':'Revocable — not granted by default','Created Time':manifest.createdTime,'Updated Time':manifest.updatedTime};
}
function cbWriteManifest_(folder,manifest){
  var name='installation-manifest-'+manifest.installationId+'.json',files=folder.getFilesByName(name),file=files.hasNext()?files.next():null,blob=Utilities.newBlob(cbJson_(manifest),'application/json',name);
  if(file)file.setContent(cbJson_(manifest));else file=folder.createFile(blob);
  return file.getId();
}
function cbExistingInstallation_(idempotencyKey,businessKey){
  var rows=cbRows_(cbControlSpreadsheet_(),CB_CONTROL_SHEETS.INSTALLATIONS);
  return rows.find(function(row){return row['Idempotency Key']===idempotencyKey;})||cbRows_(cbControlSpreadsheet_(),CB_CONTROL_SHEETS.BUSINESSES).find(function(row){return row['Business Key']===businessKey;})||null;
}
function cbExistingResult_(row){
  var businessId=row['Business ID'],business=cbRows_(cbControlSpreadsheet_(),CB_CONTROL_SHEETS.BUSINESSES).find(function(item){return item['Business ID']===businessId;})||row;
  return {status:'EXISTS',message:'An isolated installation already exists. No duplicate resources were created.',businessId:businessId,businessName:business['Business Name'],installationId:business['Installation ID']||row['Installation ID'],rootFolderUrl:cbUrl_('folder',business['Tenant Root Folder ID']||row['Drive Root ID']),coreSpreadsheetUrl:cbUrl_('sheet',business['Core Spreadsheet ID']),inventorySpreadsheetUrl:cbUrl_('sheet',business['Inventory Spreadsheet ID']),assetSpreadsheetUrl:cbUrl_('sheet',business['Asset Spreadsheet ID'])};
}
function cbCreateBusiness_(request){
  var actor=cbRequireOwner_(),input=request||{},name=cbText_(input.businessName),ownerEmail=cbText_(input.ownerEmail).toLowerCase(),businessKey=cbNormalizeKey_(name),idempotencyKey=cbText_(input.idempotencyKey)||('INSTALL-'+businessKey+'-'+cbNormalizeKey_(ownerEmail));
  cbAssert_(name,'Business name is required.');cbAssert_(businessKey,'Business name must contain letters or numbers.');cbAssert_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail),'A valid owner email is required.');
  cbAssert_(CB_CONFIG.industryPacks.indexOf(input.industryPack)>=0,'Select an approved industry pack.');
  var modules=Array.isArray(input.modules)?input.modules.filter(function(key){return CB_CONFIG.modules.indexOf(key)>=0;}):CB_CONFIG.modules.slice();
  cbAssert_(modules.length>0,'At least one module is required.');
  input={businessName:name,legalName:cbText_(input.legalName)||name,ownerEmail:ownerEmail,ownerName:cbText_(input.ownerName),timeZone:cbText_(input.timeZone)||CB_CONFIG.defaultTimeZone,currency:cbText_(input.currency)||CB_CONFIG.defaultCurrency,industryPack:input.industryPack,modules:modules};
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    var existing=cbExistingInstallation_(idempotencyKey,businessKey);if(existing)return cbExistingResult_(existing);
    var now=cbNow_(),businessId='BUS-'+Utilities.getUuid().slice(0,12).toUpperCase(),installationId='INSTALL-'+Utilities.getUuid().toUpperCase(),root=cbRootFolder_();
    var tenantRoot=root.createFolder(name+' — '+businessId),system=tenantRoot.createFolder('00 — System'),documents=tenantRoot.createFolder('01 — Documents'),customers=tenantRoot.createFolder('02 — Customers'),jobs=tenantRoot.createFolder('03 — Jobs'),inventoryFolder=tenantRoot.createFolder('04 — Inventory'),assetsFolder=tenantRoot.createFolder('05 — Assets'),backups=tenantRoot.createFolder('98 — Backups'),archive=tenantRoot.createFolder('99 — Archive');
    system.createFolder('Audit and Error Logs');system.createFolder('Installation Manifests');documents.createFolder('Generated PDFs');customers.createFolder('Customer Records');jobs.createFolder('Job Records');inventoryFolder.createFolder('Receipts and Attachments');assetsFolder.createFolder('Photos, Manuals and Maintenance');
    var core=cbCreateWorkbook_(name+' — Core Data',tenantRoot,CB_HEADERS.core),inventory=cbCreateWorkbook_(name+' — Inventory Data',tenantRoot,CB_HEADERS.inventory),assets=cbCreateWorkbook_(name+' — Asset Data',tenantRoot,CB_HEADERS.assets);
    cbSeedCore_(core,businessId,input,now);
    var manifest={installationId:installationId,idempotencyKey:idempotencyKey,businessId:businessId,businessName:name,ownerEmail:ownerEmail,environment:CB_CONFIG.environment,industryPack:input.industryPack,enabledModules:modules,driveRootId:tenantRoot.getId(),coreSpreadsheetId:core.getId(),inventorySpreadsheetId:inventory.getId(),assetSpreadsheetId:assets.getId(),backupFolderId:backups.getId(),schemaVersion:CB_CONFIG.schemaVersion,installerVersion:CB_CONFIG.version,status:'Provisioned',lastVerificationResult:'PENDING',productionDataMigrated:false,externalActionsEnabled:false,createdBy:actor.email,createdTime:now,updatedTime:now};
    manifest.manifestFileId=cbWriteManifest_(system,manifest);
    cbAppend_(cbControlSpreadsheet_(),CB_CONTROL_SHEETS.BUSINESSES,{'Business ID':businessId,'Business Key':businessKey,'Business Name':name,'Owner Email':ownerEmail,'Time Zone':input.timeZone,'Currency':input.currency,'Industry Pack':input.industryPack,'Enabled Modules':modules.join(','),'Status':'Active','Tenant Root Folder ID':tenantRoot.getId(),'Core Spreadsheet ID':core.getId(),'Inventory Spreadsheet ID':inventory.getId(),'Asset Spreadsheet ID':assets.getId(),'Installation ID':installationId,'Created Time':now,'Updated Time':now});
    cbAppend_(cbControlSpreadsheet_(),CB_CONTROL_SHEETS.INSTALLATIONS,cbManifestRecord_(manifest));
    var verification=cbVerifyBusiness_(businessId);manifest.lastVerificationResult=verification.status;manifest.updatedTime=cbNow_();cbWriteManifest_(system,manifest);
    cbAudit_(businessId,'CREATE ISOLATED BUSINESS','Business',businessId,'PASS','Created separate Drive root and purpose-specific spreadsheets. No production data copied.');
    return {status:'PASS',message:'Isolated commercial beta business created.',businessId:businessId,businessName:name,installationId:installationId,rootFolderUrl:cbUrl_('folder',tenantRoot.getId()),coreSpreadsheetUrl:cbUrl_('sheet',core.getId()),inventorySpreadsheetUrl:cbUrl_('sheet',inventory.getId()),assetSpreadsheetUrl:cbUrl_('sheet',assets.getId()),verification:verification};
  }catch(error){cbError_('', 'CREATE ISOLATED BUSINESS',error);throw error;}finally{lock.releaseLock();}
}
function cbVerifyBusiness_(businessId){
  cbRequireOwner_();var row=cbRows_(cbControlSpreadsheet_(),CB_CONTROL_SHEETS.BUSINESSES).find(function(item){return item['Business ID']===businessId;});cbAssert_(row,'Business installation was not found.');
  var checks=[];function check(name,fn){try{fn();checks.push({name:name,status:'PASS'});}catch(error){checks.push({name:name,status:'FAIL',message:error.message});}}
  check('Tenant Drive root',function(){DriveApp.getFolderById(row['Tenant Root Folder ID']).getName();});
  check('Core workbook',function(){var book=SpreadsheetApp.openById(row['Core Spreadsheet ID']);Object.keys(CB_HEADERS.core).forEach(function(name){cbAssert_(book.getSheetByName(name),'Missing core sheet '+name);});});
  check('Inventory workbook',function(){var book=SpreadsheetApp.openById(row['Inventory Spreadsheet ID']);Object.keys(CB_HEADERS.inventory).forEach(function(name){cbAssert_(book.getSheetByName(name),'Missing inventory sheet '+name);});});
  check('Asset workbook',function(){var book=SpreadsheetApp.openById(row['Asset Spreadsheet ID']);Object.keys(CB_HEADERS.assets).forEach(function(name){cbAssert_(book.getSheetByName(name),'Missing asset sheet '+name);});});
  check('Business isolation IDs',function(){cbAssert_(row['Tenant Root Folder ID']&&row['Core Spreadsheet ID']&&row['Inventory Spreadsheet ID']&&row['Asset Spreadsheet ID'],'Dedicated resource IDs are incomplete.');});
  var status=checks.every(function(item){return item.status==='PASS';})?'PASS':'FAIL';cbAudit_(businessId,'VERIFY INSTALLATION','Installation',row['Installation ID'],status,JSON.stringify(checks));return{status:status,businessId:businessId,checks:checks};
}
