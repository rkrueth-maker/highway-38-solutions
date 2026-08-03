/** Google Sheets repository layer for the separate commercial beta. */
var CB_CONTROL_SHEETS=Object.freeze({
  BUSINESSES:'Businesses',
  INSTALLATIONS:'Installation Manifests',
  AUDIT:'Audit Events',
  ERRORS:'Error Events'
});

var CB_HEADERS=Object.freeze({
  businesses:Object.freeze(['Business ID','Business Key','Business Name','Owner Email','Time Zone','Currency','Industry Pack','Enabled Modules','Status','Tenant Root Folder ID','Core Spreadsheet ID','Inventory Spreadsheet ID','Asset Spreadsheet ID','Installation ID','Created Time','Updated Time']),
  installations:Object.freeze(['Installation ID','Idempotency Key','Business ID','Business Name','Owner Email','Apps Script Project ID','Deployment ID','Web App URL','Drive Root ID','Core Spreadsheet ID','Inventory Spreadsheet ID','Asset Spreadsheet ID','Enabled Modules','Industry Pack','Schema Version','Installer Version','Installation Status','Last Verification Result','Backup Folder ID','Support Access Status','Created Time','Updated Time']),
  audit:Object.freeze(['Audit Event ID','Business ID','User Email','Action','Record Type','Record ID','Result','Details','Timestamp']),
  errors:Object.freeze(['Error Event ID','Business ID','User Email','Action','Message','Stack','Timestamp']),
  core:Object.freeze({
    businesses:Object.freeze(['Business ID','Business Name','Legal Name','Owner Email','Time Zone','Currency','Industry Pack','Status','Created Time','Updated Time','Record Version']),
    settings:Object.freeze(['Setting ID','Business ID','Setting Key','Setting Value','Updated By','Updated Time','Record Version']),
    users:Object.freeze(['User ID','Business ID','Email','Display Name','Role ID','Status','Location Restrictions','Crew Restrictions','Module Restrictions','Created Time','Updated Time','Record Version']),
    invitations:Object.freeze(['Invitation ID','Business ID','Email','Role ID','Token Hash','Expires Time','Accepted Time','Status','Created By','Created Time','Record Version']),
    roles:Object.freeze(['Role ID','Business ID','Role Name','Permissions JSON','Status','Created Time','Updated Time','Record Version']),
    locations:Object.freeze(['Location ID','Business ID','Location Name','Location Type','Parent Location ID','Status','Created Time','Updated Time','Record Version']),
    departments:Object.freeze(['Department ID','Business ID','Department Name','Status','Created Time','Updated Time','Record Version']),
    crews:Object.freeze(['Crew ID','Business ID','Crew Name','Department ID','Location ID','Status','Created Time','Updated Time','Record Version']),
    customers:Object.freeze(['Customer ID','Business ID','Customer Name','Email','Phone','Status','Created Time','Updated Time','Record Version']),
    properties:Object.freeze(['Property ID','Business ID','Customer ID','Property Name','Address','Status','Created Time','Updated Time','Record Version']),
    jobs:Object.freeze(['Job ID','Business ID','Customer ID','Property ID','Job Number','Project Title','Status','Location ID','Crew ID','Created Time','Updated Time','Record Version']),
    tasks:Object.freeze(['Task ID','Business ID','Job ID','Task Title','Assigned User ID','Assigned Crew ID','Status','Due Time','Created Time','Updated Time','Record Version']),
    documents:Object.freeze(['Document ID','Business ID','Source Type','Source ID','File ID','File Name','Mime Type','Access Classification','Created By','Created Time','Record Version']),
    approvals:Object.freeze(['Approval ID','Business ID','Record Type','Record ID','Approval Type','Decision','Requested By','Decided By','Requested Time','Decided Time','Notes','Record Version']),
    offlineSync:Object.freeze(['Sync Event ID','Business ID','User ID','Device ID','Action Type','Local Timestamp','Record Type','Record ID','Record Version','Idempotency Key','Sync Status','Retry Count','Payload Hash','Error Status','Server Timestamp']),
    audit:Object.freeze(['Audit Event ID','Business ID','User ID','Action','Record Type','Record ID','Result','Details','Timestamp']),
    errors:Object.freeze(['Error Event ID','Business ID','User ID','Action','Message','Stack','Timestamp']),
    entitlements:Object.freeze(['Entitlement ID','Business ID','Module Key','Enabled','Plan','Seat Limit','Storage Limit','Created Time','Updated Time','Record Version'])
  }),
  inventory:Object.freeze({
    items:Object.freeze(['Item ID','Business ID','SKU','Barcode','QR Code','UPC','Description','Category','Manufacturer','Model','Unit of Measure','Purchase Unit','Issue Unit','Preferred Vendor ID','Purchase Cost','Average Cost','Selling Price','Taxable Status','Minimum Stock','Maximum Stock','Reorder Point','Serial Tracking','Lot Tracking','Expiration Tracking','Status','Created Time','Updated Time','Record Version']),
    transactions:Object.freeze(['Transaction ID','Business ID','Location ID','Item ID','Quantity','Direction','Unit Cost','Total Value','Job ID','User ID','Source Type','Source Record ID','Reason','Timestamp','Offline Transaction ID','Idempotency Key','Sync Status','Record Version','Audit Metadata JSON']),
    reservations:Object.freeze(['Reservation ID','Business ID','Job ID','Item ID','Location ID','Quantity','Status','Created By','Created Time','Updated Time','Record Version']),
    purchaseOrders:Object.freeze(['Purchase Order ID','Business ID','Vendor ID','Location ID','Status','Order Date','Expected Date','Approved By','Created Time','Updated Time','Record Version']),
    purchaseOrderLines:Object.freeze(['Purchase Order Line ID','Business ID','Purchase Order ID','Item ID','Ordered Quantity','Received Quantity','Unit Cost','Status','Record Version']),
    vendors:Object.freeze(['Vendor ID','Business ID','Vendor Name','Email','Phone','Status','Created Time','Updated Time','Record Version'])
  }),
  assets:Object.freeze({
    assets:Object.freeze(['Asset ID','Business ID','Asset Number','QR Code','Barcode','Serial Number','Manufacturer','Model','VIN','Description','Category','Ownership','Purchase Date','Purchase Cost','Current Value','Warranty','Current Location ID','Assigned User ID','Assigned Crew ID','Assigned Truck ID','Assigned Job ID','Status','Availability','Meter Hours','Mileage','Inspection Interval','Maintenance Interval','Last Service','Next Service','Created Time','Updated Time','Record Version']),
    assignments:Object.freeze(['Asset Assignment ID','Business ID','Asset ID','User ID','Crew ID','Truck ID','Job ID','Location ID','Assignment Type','Assigned Time','Returned Time','Status','Condition Out','Condition In','Created By','Updated By','Record Version']),
    inspections:Object.freeze(['Inspection ID','Business ID','Asset ID','Inspection Type','Result','Meter Reading','Mileage','Notes','Document IDs JSON','Inspected By','Inspection Time','Record Version']),
    maintenance:Object.freeze(['Maintenance ID','Business ID','Asset ID','Maintenance Type','Status','Priority','Due Date','Due Meter','Completed Date','Vendor ID','Labor Hours','Parts Cost','Labor Cost','Downtime Hours','Notes','Created Time','Updated Time','Record Version']),
    events:Object.freeze(['Asset Event ID','Business ID','Asset ID','Event Type','Source Record ID','User ID','Location ID','Job ID','Details JSON','Timestamp','Record Version'])
  })
});

function cbEnsureSheet_(spreadsheet,name,headers){
  var sheet=spreadsheet.getSheetByName(name)||spreadsheet.insertSheet(name);
  if(sheet.getLastRow()===0){sheet.getRange(1,1,1,headers.length).setValues([headers.slice()]);sheet.setFrozenRows(1);}
  return sheet;
}
function cbEnsureWorkbookSchema_(spreadsheet,definitions){
  Object.keys(definitions).forEach(function(key){cbEnsureSheet_(spreadsheet,key,definitions[key]);});
  return spreadsheet;
}
function cbRootFolder_(){
  var properties=cbProperties_(),id=cbText_(properties.getProperty('COMMERCIAL_BETA_ROOT_FOLDER_ID'));
  if(id){try{return DriveApp.getFolderById(id);}catch(error){properties.deleteProperty('COMMERCIAL_BETA_ROOT_FOLDER_ID');}}
  var existing=DriveApp.getRootFolder().getFoldersByName(CB_CONFIG.rootFolderName);
  var folder=existing.hasNext()?existing.next():DriveApp.getRootFolder().createFolder(CB_CONFIG.rootFolderName);
  properties.setProperty('COMMERCIAL_BETA_ROOT_FOLDER_ID',folder.getId());
  return folder;
}
function cbControlSpreadsheet_(){
  var properties=cbProperties_(),id=cbText_(properties.getProperty('COMMERCIAL_BETA_CONTROL_SPREADSHEET_ID')),spreadsheet;
  if(id){try{spreadsheet=SpreadsheetApp.openById(id);}catch(error){properties.deleteProperty('COMMERCIAL_BETA_CONTROL_SPREADSHEET_ID');}}
  if(!spreadsheet){
    spreadsheet=SpreadsheetApp.create(CB_CONFIG.controlWorkbookName);
    DriveApp.getFileById(spreadsheet.getId()).moveTo(cbRootFolder_());
    properties.setProperty('COMMERCIAL_BETA_CONTROL_SPREADSHEET_ID',spreadsheet.getId());
  }
  cbEnsureSheet_(spreadsheet,CB_CONTROL_SHEETS.BUSINESSES,CB_HEADERS.businesses);
  cbEnsureSheet_(spreadsheet,CB_CONTROL_SHEETS.INSTALLATIONS,CB_HEADERS.installations);
  cbEnsureSheet_(spreadsheet,CB_CONTROL_SHEETS.AUDIT,CB_HEADERS.audit);
  cbEnsureSheet_(spreadsheet,CB_CONTROL_SHEETS.ERRORS,CB_HEADERS.errors);
  return spreadsheet;
}
function cbRows_(spreadsheet,sheetName){
  var sheet=spreadsheet.getSheetByName(sheetName);if(!sheet||sheet.getLastRow()<2)return[];
  var values=sheet.getDataRange().getDisplayValues(),headers=values.shift();
  return values.filter(function(row){return row.some(Boolean);}).map(function(row,index){var out={__row:index+2};headers.forEach(function(header,column){out[header]=row[column];});return out;});
}
function cbAppend_(spreadsheet,sheetName,record){
  var sheet=spreadsheet.getSheetByName(sheetName);cbAssert_(sheet,'Missing sheet: '+sheetName);
  var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  sheet.appendRow(headers.map(function(header){return Object.prototype.hasOwnProperty.call(record,header)?record[header]:'';}));
  return record;
}
function cbCreateWorkbook_(name,parent,definitions){
  var spreadsheet=SpreadsheetApp.create(name);DriveApp.getFileById(spreadsheet.getId()).moveTo(parent);
  var first=spreadsheet.getSheets()[0],keys=Object.keys(definitions);first.setName(keys[0]);
  keys.forEach(function(key,index){var sheet=index===0?first:spreadsheet.insertSheet(key);sheet.getRange(1,1,1,definitions[key].length).setValues([definitions[key].slice()]);sheet.setFrozenRows(1);});
  return spreadsheet;
}
function cbAudit_(businessId,action,recordType,recordId,result,details){
  var user=cbCurrentEmail_();
  return cbAppend_(cbControlSpreadsheet_(),CB_CONTROL_SHEETS.AUDIT,{'Audit Event ID':cbUuid_('AUDIT'),'Business ID':businessId||'','User Email':user,'Action':action,'Record Type':recordType||'','Record ID':recordId||'','Result':result||'PASS','Details':details||'','Timestamp':cbNow_()});
}
function cbError_(businessId,action,error){
  try{cbAppend_(cbControlSpreadsheet_(),CB_CONTROL_SHEETS.ERRORS,{'Error Event ID':cbUuid_('ERROR'),'Business ID':businessId||'','User Email':cbCurrentEmail_(),'Action':action,'Message':error&&error.message?error.message:String(error),'Stack':error&&error.stack?error.stack:'','Timestamp':cbNow_()});}catch(ignored){}
}
