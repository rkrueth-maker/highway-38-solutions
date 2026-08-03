/** Connected business workspace backed by the isolated Core, Inventory, and Asset workbooks. */
function cbBusinessRow_(businessId){
  var id=cbText_(businessId);
  cbAssert_(id,'Business ID is required.');
  var row=cbRows_(cbControlSpreadsheet_(),CB_CONTROL_SHEETS.BUSINESSES).find(function(item){return item['Business ID']===id;});
  cbAssert_(row,'Business installation was not found.');
  cbAssert_(row.Status==='Active','This business installation is not active.');
  return row;
}
function cbWorkbookRows_(spreadsheet,sheetName){
  var sheet=spreadsheet.getSheetByName(sheetName);cbAssert_(sheet,'Missing business sheet: '+sheetName);
  if(sheet.getLastRow()<2)return[];
  var values=sheet.getDataRange().getDisplayValues(),headers=values.shift();
  return values.filter(function(row){return row.some(Boolean);}).map(function(row,index){var out={__row:index+2};headers.forEach(function(header,column){out[header]=row[column];});return out;});
}
function cbAppendWorkbookRecord_(spreadsheet,sheetName,record){
  var sheet=spreadsheet.getSheetByName(sheetName);cbAssert_(sheet,'Missing business sheet: '+sheetName);
  var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  sheet.appendRow(headers.map(function(header){return Object.prototype.hasOwnProperty.call(record,header)?record[header]:'';}));
  return record;
}
function cbBusinessContext_(businessId){
  cbRequireOwner_();var row=cbBusinessRow_(businessId);
  return {row:row,core:SpreadsheetApp.openById(row['Core Spreadsheet ID']),inventory:SpreadsheetApp.openById(row['Inventory Spreadsheet ID']),assets:SpreadsheetApp.openById(row['Asset Spreadsheet ID'])};
}
function cbNumber_(value){var number=Number(value);return isFinite(number)?number:0;}
function cbMoney_(value){return Math.round(cbNumber_(value)*100)/100;}
function cbItemStockMap_(transactions){
  var stock={};transactions.forEach(function(row){var itemId=row['Item ID'],quantity=Math.abs(cbNumber_(row.Quantity)),direction=cbText_(row.Direction).toUpperCase();if(!itemId)return;stock[itemId]=(stock[itemId]||0)+(direction==='OUT'?-quantity:quantity);});return stock;
}
function cbOfficeSnapshot_(businessId){
  var context=cbBusinessContext_(businessId),row=context.row,user=cbRequireOwner_();
  var customers=cbWorkbookRows_(context.core,'customers'),jobs=cbWorkbookRows_(context.core,'jobs'),locations=cbWorkbookRows_(context.core,'locations'),users=cbWorkbookRows_(context.core,'users');
  var items=cbWorkbookRows_(context.inventory,'items'),transactions=cbWorkbookRows_(context.inventory,'transactions'),assets=cbWorkbookRows_(context.assets,'assets'),stock=cbItemStockMap_(transactions);
  var itemView=items.map(function(item){return{itemId:item['Item ID'],sku:item.SKU,description:item.Description,category:item.Category,unit:item['Unit of Measure'],purchaseCost:item['Purchase Cost'],sellingPrice:item['Selling Price'],reorderPoint:item['Reorder Point'],status:item.Status,onHand:stock[item['Item ID']]||0,updatedTime:item['Updated Time']};});
  return {status:'PASS',connected:true,user:user,business:{businessId:row['Business ID'],businessName:row['Business Name'],ownerEmail:row['Owner Email'],timeZone:row['Time Zone'],currency:row.Currency,industryPack:row['Industry Pack'],status:row.Status,installationId:row['Installation ID']},links:{driveRoot:cbUrl_('folder',row['Tenant Root Folder ID']),core:cbUrl_('sheet',row['Core Spreadsheet ID']),inventory:cbUrl_('sheet',row['Inventory Spreadsheet ID']),assets:cbUrl_('sheet',row['Asset Spreadsheet ID'])},counts:{customers:customers.length,jobs:jobs.length,openJobs:jobs.filter(function(job){return ['COMPLETE','CLOSED','CANCELLED'].indexOf(cbText_(job.Status).toUpperCase())<0;}).length,inventoryItems:items.length,lowStock:itemView.filter(function(item){return cbNumber_(item.reorderPoint)>0&&cbNumber_(item.onHand)<=cbNumber_(item.reorderPoint);}).length,assets:assets.length,unavailableAssets:assets.filter(function(asset){return cbText_(asset.Availability).toUpperCase()&&cbText_(asset.Availability).toUpperCase()!=='AVAILABLE';}).length},customers:customers.slice().reverse().slice(0,100).map(function(item){return{customerId:item['Customer ID'],name:item['Customer Name'],email:item.Email,phone:item.Phone,status:item.Status,updatedTime:item['Updated Time']};}),jobs:jobs.slice().reverse().slice(0,100).map(function(item){return{jobId:item['Job ID'],jobNumber:item['Job Number'],projectTitle:item['Project Title'],customerId:item['Customer ID'],status:item.Status,locationId:item['Location ID'],crewId:item['Crew ID'],updatedTime:item['Updated Time']};}),inventoryItems:itemView.slice().reverse().slice(0,200),transactions:transactions.slice().reverse().slice(0,50).map(function(item){return{transactionId:item['Transaction ID'],itemId:item['Item ID'],quantity:item.Quantity,direction:item.Direction,unitCost:item['Unit Cost'],reason:item.Reason,timestamp:item.Timestamp};}),assets:assets.slice().reverse().slice(0,200).map(function(item){return{assetId:item['Asset ID'],assetNumber:item['Asset Number'],description:item.Description,category:item.Category,manufacturer:item.Manufacturer,model:item.Model,serialNumber:item['Serial Number'],status:item.Status,availability:item.Availability,currentLocationId:item['Current Location ID'],nextService:item['Next Service'],updatedTime:item['Updated Time']};}),locations:locations.map(function(item){return{locationId:item['Location ID'],name:item['Location Name'],type:item['Location Type'],status:item.Status};}),users:users.map(function(item){return{userId:item['User ID'],email:item.Email,displayName:item['Display Name'],roleId:item['Role ID'],status:item.Status};}),safeguards:{externalActionsEnabled:false,productionMigrationEnabled:false}};
}
function cbAddCustomer_(request){
  var input=request||{},context=cbBusinessContext_(input.businessId),name=cbText_(input.customerName),now=cbNow_();cbAssert_(name,'Customer name is required.');var customerId=cbUuid_('CUSTOMER');
  cbAppendWorkbookRecord_(context.core,'customers',{'Customer ID':customerId,'Business ID':context.row['Business ID'],'Customer Name':name,'Email':cbText_(input.email),'Phone':cbText_(input.phone),'Status':'Active','Created Time':now,'Updated Time':now,'Record Version':1});
  cbAudit_(context.row['Business ID'],'ADD CUSTOMER','Customer',customerId,'PASS','Customer added from connected Commercial Office workspace.');return{status:'PASS',message:'Customer added.',customerId:customerId};
}
function cbAddJob_(request){
  var input=request||{},context=cbBusinessContext_(input.businessId),title=cbText_(input.projectTitle),now=cbNow_();cbAssert_(title,'Project title is required.');var customerId=cbText_(input.customerId);
  if(customerId)cbAssert_(cbWorkbookRows_(context.core,'customers').some(function(item){return item['Customer ID']===customerId;}),'Selected customer was not found.');
  var jobId=cbUuid_('JOB'),jobNumber='JOB-'+Utilities.formatDate(new Date(),context.row['Time Zone']||CB_CONFIG.defaultTimeZone,'yyyyMMdd-HHmmss');
  cbAppendWorkbookRecord_(context.core,'jobs',{'Job ID':jobId,'Business ID':context.row['Business ID'],'Customer ID':customerId,'Property ID':'','Job Number':jobNumber,'Project Title':title,'Status':cbText_(input.status)||'Lead','Location ID':cbText_(input.locationId)||'LOC-MAIN-SHOP','Crew ID':'','Created Time':now,'Updated Time':now,'Record Version':1});
  cbAudit_(context.row['Business ID'],'ADD JOB','Job',jobId,'PASS','Job added from connected Commercial Office workspace.');return{status:'PASS',message:'Job added.',jobId:jobId,jobNumber:jobNumber};
}
function cbAddInventoryItem_(request){
  var input=request||{},context=cbBusinessContext_(input.businessId),description=cbText_(input.description),now=cbNow_();cbAssert_(description,'Inventory description is required.');var itemId=cbUuid_('ITEM'),sku=cbText_(input.sku)||('SKU-'+itemId.slice(-8)),unit=cbText_(input.unit)||'each';
  cbAppendWorkbookRecord_(context.inventory,'items',{'Item ID':itemId,'Business ID':context.row['Business ID'],'SKU':sku,'Barcode':'','QR Code':'','UPC':'','Description':description,'Category':cbText_(input.category),'Manufacturer':cbText_(input.manufacturer),'Model':cbText_(input.model),'Unit of Measure':unit,'Purchase Unit':unit,'Issue Unit':unit,'Preferred Vendor ID':'','Purchase Cost':cbMoney_(input.purchaseCost),'Average Cost':cbMoney_(input.purchaseCost),'Selling Price':cbMoney_(input.sellingPrice),'Taxable Status':'','Minimum Stock':'','Maximum Stock':'','Reorder Point':cbNumber_(input.reorderPoint),'Serial Tracking':'No','Lot Tracking':'No','Expiration Tracking':'No','Status':'Active','Created Time':now,'Updated Time':now,'Record Version':1});
  cbAudit_(context.row['Business ID'],'ADD INVENTORY ITEM','Inventory Item',itemId,'PASS','Inventory item added to isolated Inventory Data workbook.');return{status:'PASS',message:'Inventory item added.',itemId:itemId,sku:sku};
}
function cbPostInventoryTransaction_(request){
  var input=request||{},context=cbBusinessContext_(input.businessId),itemId=cbText_(input.itemId),direction=cbText_(input.direction).toUpperCase(),quantity=Math.abs(cbNumber_(input.quantity)),now=cbNow_();cbAssert_(itemId,'Inventory item is required.');cbAssert_(direction==='IN'||direction==='OUT','Inventory direction must be IN or OUT.');cbAssert_(quantity>0,'Quantity must be greater than zero.');
  var item=cbWorkbookRows_(context.inventory,'items').find(function(row){return row['Item ID']===itemId;});cbAssert_(item,'Inventory item was not found.');var stock=cbItemStockMap_(cbWorkbookRows_(context.inventory,'transactions')),onHand=stock[itemId]||0;if(direction==='OUT')cbAssert_(onHand>=quantity,'Not enough stock is available for this issue.');
  var unitCost=cbMoney_(input.unitCost||item['Average Cost']||item['Purchase Cost']),transactionId=cbUuid_('TXN');
  cbAppendWorkbookRecord_(context.inventory,'transactions',{'Transaction ID':transactionId,'Business ID':context.row['Business ID'],'Location ID':cbText_(input.locationId)||'LOC-MAIN-SHOP','Item ID':itemId,'Quantity':quantity,'Direction':direction,'Unit Cost':unitCost,'Total Value':cbMoney_(quantity*unitCost),'Job ID':cbText_(input.jobId),'User ID':'USER-OWNER','Source Type':'Commercial Office','Source Record ID':'','Reason':cbText_(input.reason)||(direction==='IN'?'Stock received':'Stock issued'),'Timestamp':now,'Offline Transaction ID':'','Idempotency Key':cbUuid_('IDEMPOTENCY'),'Sync Status':'SERVER','Record Version':1,'Audit Metadata JSON':JSON.stringify({userEmail:cbCurrentEmail_(),source:'commercial-office-beta'})});
  cbAudit_(context.row['Business ID'],'POST INVENTORY '+direction,'Inventory Transaction',transactionId,'PASS','Append-only inventory transaction recorded.');return{status:'PASS',message:direction==='IN'?'Stock received.':'Stock issued.',transactionId:transactionId,onHand:direction==='IN'?onHand+quantity:onHand-quantity};
}
function cbAddAsset_(request){
  var input=request||{},context=cbBusinessContext_(input.businessId),description=cbText_(input.description),now=cbNow_();cbAssert_(description,'Asset description is required.');var assetId=cbUuid_('ASSET'),assetNumber=cbText_(input.assetNumber)||('ASSET-'+assetId.slice(-8));
  cbAppendWorkbookRecord_(context.assets,'assets',{'Asset ID':assetId,'Business ID':context.row['Business ID'],'Asset Number':assetNumber,'QR Code':'','Barcode':'','Serial Number':cbText_(input.serialNumber),'Manufacturer':cbText_(input.manufacturer),'Model':cbText_(input.model),'VIN':cbText_(input.vin),'Description':description,'Category':cbText_(input.category),'Ownership':cbText_(input.ownership)||'Owned','Purchase Date':cbText_(input.purchaseDate),'Purchase Cost':cbMoney_(input.purchaseCost),'Current Value':cbMoney_(input.currentValue||input.purchaseCost),'Warranty':'','Current Location ID':cbText_(input.locationId)||'LOC-MAIN-SHOP','Assigned User ID':'','Assigned Crew ID':'','Assigned Truck ID':'','Assigned Job ID':'','Status':'Active','Availability':'Available','Meter Hours':cbNumber_(input.meterHours),'Mileage':cbNumber_(input.mileage),'Inspection Interval':'','Maintenance Interval':'','Last Service':'','Next Service':cbText_(input.nextService),'Created Time':now,'Updated Time':now,'Record Version':1});
  cbAudit_(context.row['Business ID'],'ADD ASSET','Asset',assetId,'PASS','Asset added to isolated Asset Data workbook.');return{status:'PASS',message:'Asset added.',assetId:assetId,assetNumber:assetNumber};
}