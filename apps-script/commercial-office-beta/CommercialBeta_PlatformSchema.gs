/** Additive commercial platform schema. Existing sheets and records are preserved. */
var CB_PLATFORM_HEADERS=Object.freeze({
  core:Object.freeze({
    businessIndustries:Object.freeze(['Business Industry ID','Business ID','Industry Pack','Primary','Status','Created Time','Updated Time','Record Version']),
    quotes:Object.freeze(['Quote ID','Business ID','Customer ID','Property ID','Job ID','Quote Number','Project Title','Scope','Measurement Notes','Status','Revision','Subtotal','Tax','Total','Price Snapshot Time','Offline Pack ID','Created By','Created Time','Updated Time','Record Version']),
    quoteLines:Object.freeze(['Quote Line ID','Business ID','Quote ID','Quote Revision','Line Type','Description','Quantity','Unit','Unit Price','Line Total','Price Source','Price Status','Status','Created Time','Record Version']),
    priceBookSnapshots:Object.freeze(['Price Snapshot ID','Business ID','Snapshot Time','Source Version','Items JSON','Expires Time','Created Time','Record Version']),
    channels:Object.freeze(['Channel ID','Business ID','Channel Name','Channel Type','Visibility','Related Record Type','Related Record ID','Status','Created By','Created Time','Updated Time','Record Version']),
    conversations:Object.freeze(['Conversation ID','Business ID','Conversation Type','Subject','Related Record Type','Related Record ID','Participant IDs JSON','Status','Created Time','Updated Time','Record Version']),
    messages:Object.freeze(['Message ID','Business ID','Conversation ID','Sender User ID','Message Type','Body','Attachment IDs JSON','Reply To Message ID','Status','Created Time','Edited Time','Record Version']),
    communicationLinks:Object.freeze(['Communication Link ID','Business ID','Channel Type','Provider','Provider Record ID','Customer ID','Job ID','Quote ID','Conversation ID','Status','Created Time','Updated Time','Record Version']),
    emailThreads:Object.freeze(['Email Thread ID','Business ID','Provider','Provider Thread ID','Mailbox','Subject','Customer ID','Job ID','Quote ID','Assigned User ID','Needs Reply','Last Message Time','Status','Updated Time','Record Version']),
    smsThreads:Object.freeze(['SMS Thread ID','Business ID','Provider','Provider Thread ID','Business Number','Customer Number','Customer ID','Job ID','Quote ID','Assigned User ID','Consent Status','Needs Reply','Last Message Time','Status','Updated Time','Record Version']),
    aiRecommendations:Object.freeze(['Recommendation ID','Business ID','Recommendation Type','Title','Evidence JSON','Proposed Change JSON','Risk JSON','Status','Approved By','Applied Time','Undo Data JSON','Created Time','Updated Time','Record Version']),
    usageEvents:Object.freeze(['Usage Event ID','Business ID','User ID','Device ID','Page Key','Action Key','Record Type','Record ID','Outcome','Duration MS','Metadata JSON','Timestamp']),
    devices:Object.freeze(['Device ID','Business ID','User ID','Device Name','Platform','Last Seen Time','Status','Created Time','Record Version']),
    offlinePacks:Object.freeze(['Offline Pack ID','Business ID','User ID','Device ID','Pack Type','Record IDs JSON','Snapshot Version','Status','Prepared Time','Expires Time','Record Version']),
    offlineOperations:Object.freeze(['Operation ID','Business ID','User ID','Device ID','Record Type','Record ID','Action','Base Version','Local Timestamp','Payload JSON','Attachment IDs JSON','Sync Status','Retry Count','Error Status','Server Timestamp','Record Version']),
    syncConflicts:Object.freeze(['Conflict ID','Business ID','Operation ID','Record Type','Record ID','Base Version','Server Version','Local Payload JSON','Server Payload JSON','Resolution','Resolved By','Resolved Time','Status','Created Time','Record Version'])
  }),
  assets:Object.freeze({
    vehicles:Object.freeze(['Vehicle ID','Business ID','Asset ID','VIN','License Plate','Year','Make','Model','Vehicle Type','Fuel Type','GVWR','Odometer','Engine Hours','Registration Expires','Insurance Expires','Status','Created Time','Updated Time','Record Version']),
    jobEquipment:Object.freeze(['Job Equipment ID','Business ID','Job ID','Asset ID','Requirement Type','Quantity','Status','Assigned Time','Returned Time','Assigned By','Notes','Created Time','Updated Time','Record Version']),
    servicePlans:Object.freeze(['Service Plan ID','Business ID','Asset ID','Plan Name','Service Type','Interval Days','Interval Miles','Interval Hours','Last Completed Date','Last Completed Miles','Last Completed Hours','Next Due Date','Next Due Miles','Next Due Hours','Status','Created Time','Updated Time','Record Version']),
    fuelLogs:Object.freeze(['Fuel Log ID','Business ID','Asset ID','Job ID','Gallons','Fuel Cost','Odometer','Engine Hours','Vendor','Receipt Document ID','User ID','Timestamp','Record Version']),
    usageLogs:Object.freeze(['Usage Log ID','Business ID','Asset ID','Job ID','User ID','Start Time','End Time','Start Meter','End Meter','Start Mileage','End Mileage','Usage Type','Notes','Offline Operation ID','Record Version'])
  })
});
function cbPlatformEnsureHeaders_(spreadsheet,name,headers){
  var sheet=spreadsheet.getSheetByName(name)||spreadsheet.insertSheet(name);
  if(sheet.getLastRow()===0){sheet.getRange(1,1,1,headers.length).setValues([headers.slice()]);sheet.setFrozenRows(1);return sheet;}
  var existing=sheet.getRange(1,1,1,Math.max(1,sheet.getLastColumn())).getDisplayValues()[0];
  var missing=headers.filter(function(header){return existing.indexOf(header)<0;});
  if(missing.length)sheet.getRange(1,existing.length+1,1,missing.length).setValues([missing]);
  sheet.setFrozenRows(1);return sheet;
}
function cbEnsurePlatformSchema_(core,assets){
  Object.keys(CB_PLATFORM_HEADERS.core).forEach(function(name){cbPlatformEnsureHeaders_(core,name,CB_PLATFORM_HEADERS.core[name]);});
  Object.keys(CB_PLATFORM_HEADERS.assets).forEach(function(name){cbPlatformEnsureHeaders_(assets,name,CB_PLATFORM_HEADERS.assets[name]);});
  cbPlatformEnsureHeaders_(assets,'assets',['Asset ID','Business ID','Asset Number','QR Code','Barcode','Serial Number','Manufacturer','Model','VIN','Description','Category','Ownership','Purchase Date','Purchase Cost','Current Value','Warranty','Current Location ID','Assigned User ID','Assigned Crew ID','Assigned Truck ID','Assigned Job ID','Status','Availability','Meter Hours','Mileage','Inspection Interval','Maintenance Interval','Last Service','Next Service','Created Time','Updated Time','Record Version','Asset Type','License Plate']);
  return{core:core,assets:assets};
}
function cbPlatformContext_(businessId){var context=cbBusinessContext_(businessId);cbEnsurePlatformSchema_(context.core,context.assets);return context;}
function cbPlatformUpdateRow_(spreadsheet,sheetName,rowNumber,updates){
  var sheet=spreadsheet.getSheetByName(sheetName);cbAssert_(sheet,'Missing sheet: '+sheetName);var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0],range=sheet.getRange(rowNumber,1,1,headers.length),values=range.getValues()[0];
  headers.forEach(function(header,index){if(Object.prototype.hasOwnProperty.call(updates,header))values[index]=updates[header];});range.setValues([values]);return updates;
}
function cbPlatformFindRow_(spreadsheet,sheetName,key,value){return cbRows_(spreadsheet,sheetName).find(function(row){return cbText_(row[key])===cbText_(value);})||null;}
