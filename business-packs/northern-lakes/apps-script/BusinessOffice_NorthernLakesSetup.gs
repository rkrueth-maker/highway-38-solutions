/** Northern Lakes first-run installation, Drive provisioning, examples, and record-folder automation. */
var NLPS_SETUP = Object.freeze({
  VERSION:'clean-core-v1',
  BUSINESS_ID:'NLPS',
  BUSINESS_NAME:'Northern Lakes Property Maintenance LLC',
  SYSTEM_OWNER_EMAIL:'northernlakesproperty@gmail.com',
  IMPLEMENTATION_OWNER_EMAIL:'rkrueth@gmail.com',
  CONFIRMATION:'CREATE CLEAN NORTHERN LAKES OFFICE',
  SCHEMA_GZIP_B64:'__BO_NEUTRAL_SCHEMA_GZIP_B64__'
});

function nlpsSetupText_(value){return String(value==null?'':value).trim();}
function nlpsSetupEmail_(){return nlpsSetupText_(Session.getActiveUser().getEmail()).toLowerCase();}
function nlpsSetupAssert_(condition,message){if(!condition)throw new Error(message||'Northern Lakes setup is on hold.');}
function nlpsSetupProperty_(name){return boGetProperties_().getProperty(name)||'';}
function nlpsSetupFolderUrl_(id){return id?'https://drive.google.com/drive/folders/'+id:'';}
function nlpsSetupSheetUrl_(id){return id?'https://docs.google.com/spreadsheets/d/'+id+'/edit':'';}
function nlpsSetupServiceUrl_(){return ScriptApp.getService().getUrl()||'';}

function boSetupEntryAllowed_(event){
  var setup=nlpsSetupText_(event&&event.parameter&&event.parameter.setup);
  return boPackValue_('packId','')==='northern-lakes'&&setup==='1';
}

function boRenderInstallationPage_(){
  return HtmlService.createTemplateFromFile('BusinessOffice_Installation').evaluate()
    .setTitle('Northern Lakes Business Office Setup')
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function nlpsSetupAuthorizedViewer_(email){
  if(email===NLPS_SETUP.SYSTEM_OWNER_EMAIL||email===NLPS_SETUP.IMPLEMENTATION_OWNER_EMAIL)return true;
  try{
    var user=boReadTable_(H38_BO_SHEETS.USERS,{includeVoided:true}).find(function(row){
      return nlpsSetupText_(row.Email).toLowerCase()===email&&row.Status==='Active';
    });
    if(!user)return false;
    var role=boGetRole_(user['Role ID']);
    return !!(role&&role['Role Name']==='Owner');
  }catch(error){return false;}
}

function boNorthernLakesSetupStatus(){
  var email=nlpsSetupEmail_();
  var authorized=!!email&&nlpsSetupAuthorizedViewer_(email);
  var properties=boGetProperties_();
  var spreadsheetId=properties.getProperty(boPackPropertyKey_('spreadsheetId'))||'';
  var rootFolderId=properties.getProperty(boPackPropertyKey_('rootFolderId'))||'';
  var generation=properties.getProperty('NLPS_SETUP_GENERATION')||'';
  var configured=false;
  if(spreadsheetId&&rootFolderId&&generation){
    try{
      configured=SpreadsheetApp.openById(spreadsheetId).getSheets().length===81&&!!DriveApp.getFolderById(rootFolderId).getName();
    }catch(error){configured=false;}
  }
  return {
    status:'PASS',
    signedIn:!!email,
    authorized:authorized,
    canInstall:email===NLPS_SETUP.SYSTEM_OWNER_EMAIL,
    activeEmail:email,
    requiredSetupEmail:NLPS_SETUP.SYSTEM_OWNER_EMAIL,
    configured:configured,
    generation:generation,
    expectedGeneration:NLPS_SETUP.VERSION,
    businessId:NLPS_SETUP.BUSINESS_ID,
    businessName:NLPS_SETUP.BUSINESS_NAME,
    spreadsheetId:authorized?spreadsheetId:'',
    spreadsheetUrl:authorized?nlpsSetupSheetUrl_(spreadsheetId):'',
    rootFolderId:authorized?rootFolderId:'',
    rootFolderUrl:authorized?nlpsSetupFolderUrl_(rootFolderId):'',
    officeUrl:nlpsSetupServiceUrl_(),
    setupUrl:nlpsSetupServiceUrl_()+'?setup=1',
    confirmation:email===NLPS_SETUP.SYSTEM_OWNER_EMAIL?NLPS_SETUP.CONFIRMATION:'',
    note:configured?'Clean Northern Lakes installation is active.':'Sign in with the Northern Lakes system account to create the clean installation.'
  };
}

function nlpsSetupParentFolder_(value){
  var source=nlpsSetupText_(value);
  if(!source)return DriveApp.getRootFolder();
  var match=source.match(/[-\w]{20,}/);
  nlpsSetupAssert_(match,'The parent Drive folder URL or ID is not valid.');
  var folder=DriveApp.getFolderById(match[0]);
  folder.getName();
  return folder;
}

function nlpsFindOrCreateFolder_(parent,name){
  var folders=parent.getFoldersByName(name);
  return folders.hasNext()?folders.next():parent.createFolder(name);
}

function nlpsCreateFolderTree_(parent){
  var root=parent.createFolder('Northern Lakes Business Office');
  var system=root.createFolder('00 — System');
  var systemConfig=system.createFolder('Configuration and Price Book');
  var systemProof=system.createFolder('Proof, Audit and Error Records');
  var systemUpgrade=system.createFolder('Upgrade History');
  var systemManifest=system.createFolder('Installation Manifest');
  var systemExports=system.createFolder('Exports');

  var customers=root.createFolder('01 — Customers');

  var requestsQuotes=root.createFolder('02 — Requests and Quotes');
  requestsQuotes.createFolder('New Requests');
  requestsQuotes.createFolder('Draft Quotes');
  requestsQuotes.createFolder('Sent Quotes');
  requestsQuotes.createFolder('Approved Quotes');

  var work=root.createFolder('03 — Work');
  work.createFolder('Work Orders');
  var activeJobs=work.createFolder('Active Jobs');
  work.createFolder('Completed Jobs');
  work.createFolder('Job Photos');
  work.createFolder('Measurements and Site Capture');

  var money=root.createFolder('04 — Money');
  money.createFolder('Invoices');
  money.createFolder('Payments');
  money.createFolder('Expenses and Receipts');
  money.createFolder('Vendors and Purchases');
  money.createFolder('Reports');

  var payrollTax=root.createFolder('05 — Payroll and Tax — Restricted');

  var documents=root.createFolder('06 — Documents and Templates');
  var quoteTemplates=documents.createFolder('Quote Templates');
  var invoiceTemplates=documents.createFolder('Invoice Templates');
  var workOrderTemplates=documents.createFolder('Work Order Templates');
  var customerDocuments=documents.createFolder('Customer Documents');
  documents.createFolder('Checklists');
  documents.createFolder('Terms and Agreements');
  var generatedPdfs=documents.createFolder('Generated PDFs');

  var growth=root.createFolder('07 — Growth');
  growth.createFolder('Website');
  growth.createFolder('Social Media');
  growth.createFolder('Advertising');
  growth.createFolder('Marketing Assets');

  var examples=root.createFolder('08 — Examples and Training');
  var imports=root.createFolder('90 — Imports');
  var backups=root.createFolder('98 — Backups');
  var archive=root.createFolder('99 — Archived Old Office');

  return {
    root:root,system:system,systemConfig:systemConfig,systemProof:systemProof,systemUpgrade:systemUpgrade,
    systemManifest:systemManifest,systemExports:systemExports,customers:customers,requestsQuotes:requestsQuotes,
    work:work,activeJobs:activeJobs,money:money,payrollTax:payrollTax,documents:documents,
    quoteTemplates:quoteTemplates,invoiceTemplates:invoiceTemplates,workOrderTemplates:workOrderTemplates,
    customerDocuments:customerDocuments,generatedPdfs:generatedPdfs,growth:growth,examples:examples,
    imports:imports,backups:backups,archive:archive
  };
}

function nlpsDecodeSchema_(){
  nlpsSetupAssert_(NLPS_SETUP.SCHEMA_GZIP_B64&&NLPS_SETUP.SCHEMA_GZIP_B64.indexOf('__BO_NEUTRAL')<0,'Northern Lakes neutral schema was not embedded during deployment.');
  var blob=Utilities.newBlob(Utilities.base64Decode(NLPS_SETUP.SCHEMA_GZIP_B64),'application/gzip');
  var schema=JSON.parse(Utilities.ungzip(blob).getDataAsString('UTF-8'));
  nlpsSetupAssert_(schema&&Array.isArray(schema.sheets)&&schema.sheets.length===81,'Northern Lakes clean workbook schema must contain exactly 81 sheets.');
  nlpsSetupAssert_(!/Highway\s*38|\bH38\b|rkrueth-maker|AKfyc/i.test(JSON.stringify(schema)),'The neutral workbook schema contains another business identity.');
  return schema;
}

function nlpsPatchSchemaRow_(schema,sheetName,values){
  var sheet=schema.sheets.find(function(item){return item.name===sheetName;});
  nlpsSetupAssert_(sheet&&sheet.rows&&sheet.rows.length>1,'Missing clean seed row: '+sheetName);
  var headers=sheet.rows[0];
  Object.keys(values).forEach(function(header){
    var index=headers.indexOf(header);
    nlpsSetupAssert_(index>=0,sheetName+' is missing '+header);
    sheet.rows[1][index]=values[header];
  });
}

function nlpsBindSchema_(schema,installationId,folderTree){
  var now=new Date().toISOString();
  schema.sheets.forEach(function(sheet){
    if(!sheet||!Array.isArray(sheet.rows))return;
    var businessIndex=sheet.rows.length?sheet.rows[0].indexOf('Business ID'):-1;
    sheet.rows=sheet.rows.map(function(row,rowIndex){
      return row.map(function(value,columnIndex){
        if(value==='{{OWNER_EMAIL}}')return NLPS_SETUP.SYSTEM_OWNER_EMAIL;
        if(value==='{{NOW}}')return now;
        if(rowIndex>0&&columnIndex===businessIndex&&String(value||'').trim()==='BUSINESS')return NLPS_SETUP.BUSINESS_ID;
        return value;
      });
    });
  });
  nlpsPatchSchemaRow_(schema,'BO Businesses',{
    'Business ID':NLPS_SETUP.BUSINESS_ID,
    'Legal Name':NLPS_SETUP.BUSINESS_NAME,
    'Public Name':NLPS_SETUP.BUSINESS_NAME,
    'Time Zone':'America/Chicago',
    'Private Root Folder ID':folderTree.root.getId(),
    'Original Documents Folder ID':folderTree.customerDocuments.getId(),
    'Generated PDF Folder ID':folderTree.generatedPdfs.getId(),
    'Export Folder ID':folderTree.systemExports.getId(),
    'Backup Folder ID':folderTree.backups.getId(),
    'White-Label Name':'Northern Lakes Business Office',
    'Created Time':now,
    'Updated Time':now
  });
  nlpsPatchSchemaRow_(schema,'BO Users',{
    'User ID':'USER-OWNER',
    'Business ID':NLPS_SETUP.BUSINESS_ID,
    'Email':NLPS_SETUP.SYSTEM_OWNER_EMAIL,
    'Display Name':'Northern Lakes System Owner',
    'Role ID':'ROLE-OWNER',
    'Status':'Active',
    'Payroll Access':'Yes',
    'Tax Access':'Yes',
    'Posting Access':'Yes',
    'Customer Send Access':'Yes',
    'Export Access':'Yes',
    'User Access Admin':'Yes',
    'Created Time':now,
    'Updated Time':now
  });
  nlpsPatchSchemaRow_(schema,'BO Migrations',{
    'Migration ID':'MIGRATION-'+installationId,
    'Business ID':NLPS_SETUP.BUSINESS_ID,
    'Source System':'Embedded Neutral Core Engine Schema',
    'Status':'Provisioned — Owner Setup',
    'Validation Result':'Clean isolated resources created; old installation retained as archive reference.',
    'Started Time':now,
    'Notes':'No customer, vendor, financial, payroll, tax, document, proof, or error records were copied from H38 or the retired Northern Lakes office.'
  });
  return schema;
}

function nlpsCreateCoreWorkbook_(schema,folder,installationId){
  var spreadsheet=SpreadsheetApp.create(NLPS_SETUP.BUSINESS_NAME+' — Business Office — '+installationId,100,26);
  spreadsheet.setSpreadsheetTimeZone('America/Chicago');
  var first=spreadsheet.getSheets()[0];
  first.setName(schema.sheets[0].name);
  schema.sheets.forEach(function(definition,index){
    var sheet=index===0?first:spreadsheet.insertSheet(definition.name);
    var rows=definition.rows||[];
    if(!rows.length)return;
    var columnCount=Math.max.apply(null,rows.map(function(row){return row.length;}));
    var normalized=rows.map(function(row){var copy=row.slice();while(copy.length<columnCount)copy.push('');return copy;});
    if(sheet.getMaxColumns()<columnCount)sheet.insertColumnsAfter(sheet.getMaxColumns(),columnCount-sheet.getMaxColumns());
    sheet.getRange(1,1,normalized.length,columnCount).setValues(normalized);
    sheet.setFrozenRows(1);
  });
  DriveApp.getFileById(spreadsheet.getId()).moveTo(folder);
  return spreadsheet;
}

function nlpsExampleDefinitions_(){
  return [
    {name:'SAMPLE — Customer and Request',headers:['Record Type','Customer / Request ID','Customer','Contact','Service','Status','Next Action'],rows:[['Customer','SAMPLE-CUST-001','Example Property Owner','sample@example.invalid','Property maintenance','Training Only','Review intake'],['Request','SAMPLE-REQ-001','Example Property Owner','218-555-0100','Driveway grading','Training Only','Build scope']]},
    {name:'SAMPLE — Quote and Pricing',headers:['Quote ID','Service','Pricing Method','Quantity','Unit','Unit Price','Extended','Approval'],rows:[['SAMPLE-QUOTE-001','Driveway grading','Unit price',1000,'sq ft',1.25,1250,'Owner Review']]},
    {name:'SAMPLE — Work Order and Job Plan',headers:['Job ID','Task','Assigned Role','Due','Proof Required','Status'],rows:[['SAMPLE-JOB-001','Confirm site access','Foreman','','Before photos','Training Only'],['SAMPLE-JOB-001','Complete grading','Field Staff','','Completion photos','Training Only']]},
    {name:'SAMPLE — Daily Field Checklist',headers:['Date','Crew','Job ID','Safety Check','Equipment Check','Before Photos','Completion Notes'],rows:[['','','SAMPLE-JOB-001','Not Started','Not Started','Required','Training example']]},
    {name:'SAMPLE — Time Entry',headers:['Employee','Job ID','Clock In','Clock Out','Break Minutes','Hours','Approval'],rows:[['Example Employee','SAMPLE-JOB-001','','',30,'','Supervisor Review']]},
    {name:'SAMPLE — Expense and Receipt',headers:['Expense ID','Vendor','Job ID','Category','Amount','Receipt','Posting Status'],rows:[['SAMPLE-EXP-001','Example Supplier','SAMPLE-JOB-001','Materials',125,'Required','Not Posted']]},
    {name:'SAMPLE — Vendor and Purchase',headers:['Vendor','Purchase Order','Item','Quantity','Expected Cost','Approval'],rows:[['Example Aggregate Supplier','SAMPLE-PO-001','Class 5 aggregate',10,350,'Owner Review']]},
    {name:'SAMPLE — Invoice and Payment',headers:['Invoice ID','Customer','Job ID','Invoice Total','Balance','Status','Next Action'],rows:[['SAMPLE-INV-001','Example Property Owner','SAMPLE-JOB-001',1250,1250,'Draft','Owner review before sending']]},
    {name:'SAMPLE — Equipment Maintenance',headers:['Asset','Service Item','Due Date','Meter','Status','Proof'],rows:[['Example Skid Steer','Hydraulic inspection','','','Training Only','Service photo']]},
    {name:'SAMPLE — Customer Communication',headers:['Channel','Customer','Related Record','Draft Message','Approval','Delivery'],rows:[['Email','Example Property Owner','SAMPLE-QUOTE-001','Draft only — no external send','Owner Review','Locked']]},
    {name:'SAMPLE — Marketing Calendar',headers:['Date','Channel','Campaign','Asset','Approval','Publishing'],rows:[['','Social','Seasonal service reminder','Approved Northern Lakes image','Owner Review','Locked']]},
    {name:'SAMPLE — Proof and Audit',headers:['Event','Record Type','Record ID','Result','Evidence','Actor'],rows:[['Training event','Job','SAMPLE-JOB-001','PASS','Example proof reference','Example User']]},
    {name:'SAMPLE — Employee Task Assignment',headers:['Task ID','Task','Assigned User / Role','Priority','Due','Closeout Proof','Status'],rows:[['SAMPLE-TASK-001','Inspect equipment','Field Staff','Normal','','Inspection photo','Training Only']]}
  ];
}

function nlpsCreateExamples_(folder){
  return nlpsExampleDefinitions_().map(function(definition){
    var spreadsheet=SpreadsheetApp.create(definition.name);
    spreadsheet.setSpreadsheetTimeZone('America/Chicago');
    var sheet=spreadsheet.getSheets()[0];
    sheet.setName('Training Example');
    var rows=[['TRAINING EXAMPLE — NOT A LIVE OPERATING RECORD']].concat([definition.headers]).concat(definition.rows);
    var width=Math.max.apply(null,rows.map(function(row){return row.length;}));
    rows=rows.map(function(row){var copy=row.slice();while(copy.length<width)copy.push('');return copy;});
    if(sheet.getMaxColumns()<width)sheet.insertColumnsAfter(sheet.getMaxColumns(),width-sheet.getMaxColumns());
    sheet.getRange(1,1,rows.length,width).setValues(rows);
    sheet.getRange(1,1,1,width).merge().setFontWeight('bold');
    sheet.setFrozenRows(2);
    DriveApp.getFileById(spreadsheet.getId()).moveTo(folder);
    return {name:definition.name,id:spreadsheet.getId(),url:spreadsheet.getUrl()};
  });
}

function nlpsCreateArchiveReference_(folder,previous){
  var spreadsheet=SpreadsheetApp.create('ARCHIVE — Previous Northern Lakes Office References');
  var sheet=spreadsheet.getSheets()[0];
  sheet.setName('Archive Reference');
  var rows=[
    ['Previous resource','ID','Status'],
    ['Spreadsheet',previous.spreadsheetId||'','Disconnected from active installation'],
    ['Root folder',previous.rootFolderId||'','Preserved; not deleted'],
    ['Documents folder',previous.documentFolderId||'','Preserved; not deleted'],
    ['PDF folder',previous.pdfFolderId||'','Preserved; not deleted'],
    ['Export folder',previous.exportFolderId||'','Preserved; not deleted'],
    ['Backup folder',previous.backupFolderId||'','Preserved; not deleted'],
    ['Archived at',new Date().toISOString(),'Reference only']
  ];
  sheet.getRange(1,1,rows.length,3).setValues(rows);
  sheet.setFrozenRows(1);
  DriveApp.getFileById(spreadsheet.getId()).moveTo(folder);
  return {id:spreadsheet.getId(),url:spreadsheet.getUrl()};
}

function nlpsCreateManifest_(folder,details){
  var spreadsheet=SpreadsheetApp.create('Northern Lakes Installation Manifest');
  var sheet=spreadsheet.getSheets()[0];
  sheet.setName('Installation Manifest');
  var rows=[['Field','Value']].concat(Object.keys(details).map(function(key){
    var value=details[key];
    return [key,typeof value==='string'?value:JSON.stringify(value)];
  }));
  sheet.getRange(1,1,rows.length,2).setValues(rows);
  sheet.setFrozenRows(1);
  DriveApp.getFileById(spreadsheet.getId()).moveTo(folder);
  return {id:spreadsheet.getId(),url:spreadsheet.getUrl()};
}

function nlpsPreviousInstallation_(){
  return {
    spreadsheetId:boConfiguredValue_('spreadsheetId'),
    rootFolderId:boConfiguredValue_('rootFolderId'),
    documentFolderId:boConfiguredValue_('documentFolderId'),
    pdfFolderId:boConfiguredValue_('pdfFolderId'),
    exportFolderId:boConfiguredValue_('exportFolderId'),
    backupFolderId:boConfiguredValue_('backupFolderId'),
    installationId:nlpsSetupProperty_('BUSINESS_OFFICE_INSTALLATION_ID'),
    generation:nlpsSetupProperty_('NLPS_SETUP_GENERATION')
  };
}

function boNorthernLakesCreateCleanOffice(payload){
  var input=payload||{};
  var email=nlpsSetupEmail_();
  nlpsSetupAssert_(email===NLPS_SETUP.SYSTEM_OWNER_EMAIL,'Sign in as '+NLPS_SETUP.SYSTEM_OWNER_EMAIL+' to create the Northern Lakes office.');
  nlpsSetupAssert_(nlpsSetupText_(input.confirmation)===NLPS_SETUP.CONFIRMATION,'Type the exact clean-install confirmation before continuing.');

  var lock=LockService.getScriptLock();
  nlpsSetupAssert_(lock.tryLock(30000),'Another Northern Lakes setup is already running.');
  try{
    var existingGeneration=nlpsSetupProperty_('NLPS_SETUP_GENERATION');
    if(existingGeneration===NLPS_SETUP.VERSION&&!input.forceNew){
      return boNorthernLakesSetupStatus();
    }

    var previous=nlpsPreviousInstallation_();
    var protectedIds=Object.keys(previous).filter(function(key){return /Id$/.test(key)&&previous[key];}).map(function(key){return previous[key];});
    var parent=nlpsSetupParentFolder_(input.parentFolder);
    var folders=nlpsCreateFolderTree_(parent);
    var installationId='NLPS-'+Utilities.getUuid();
    var schema=nlpsBindSchema_(nlpsDecodeSchema_(),installationId,folders);
    var workbook=nlpsCreateCoreWorkbook_(schema,folders.root,installationId);

    boApplyInstallationProperties_({
      spreadsheetId:workbook.getId(),
      backendSpreadsheetId:workbook.getId(),
      businessId:NLPS_SETUP.BUSINESS_ID,
      rootFolderId:folders.root.getId(),
      documentFolderId:folders.customerDocuments.getId(),
      pdfFolderId:folders.generatedPdfs.getId(),
      exportFolderId:folders.systemExports.getId(),
      backupFolderId:folders.backups.getId(),
      installationId:installationId,
      protectedResourceIds:protectedIds,
      businessPackJson:boGetPackSnapshot_()
    });
    H38_BO_SPREADSHEET_CACHE_=null;

    var now=boNow_();
    boUpsertSeedRow_(H38_BO_SHEETS.BUSINESSES,'Business ID',NLPS_SETUP.BUSINESS_ID,{
      'Business ID':NLPS_SETUP.BUSINESS_ID,'Legal Name':NLPS_SETUP.BUSINESS_NAME,'Public Name':NLPS_SETUP.BUSINESS_NAME,
      'Time Zone':'America/Chicago','Private Root Folder ID':folders.root.getId(),
      'Original Documents Folder ID':folders.customerDocuments.getId(),'Generated PDF Folder ID':folders.generatedPdfs.getId(),
      'Export Folder ID':folders.systemExports.getId(),'Backup Folder ID':folders.backups.getId(),
      'White-Label Name':'Northern Lakes Business Office','Status':'Active','Created Time':now,'Updated Time':now
    });
    boUpsertSeedRow_(H38_BO_SHEETS.USERS,'User ID','USER-OWNER',{
      'User ID':'USER-OWNER','Business ID':NLPS_SETUP.BUSINESS_ID,'Email':NLPS_SETUP.SYSTEM_OWNER_EMAIL,
      'Display Name':'Northern Lakes System Owner','Role ID':'ROLE-OWNER','Status':'Active',
      'Payroll Access':'Yes','Tax Access':'Yes','Posting Access':'Yes','Customer Send Access':'Yes',
      'Export Access':'Yes','User Access Admin':'Yes','Created Time':now,'Updated Time':now
    });
    boUpsertSeedRow_(H38_BO_SHEETS.USERS,'User ID','USER-H38-IMPLEMENTATION-OWNER',{
      'User ID':'USER-H38-IMPLEMENTATION-OWNER','Business ID':NLPS_SETUP.BUSINESS_ID,'Email':NLPS_SETUP.IMPLEMENTATION_OWNER_EMAIL,
      'Display Name':'Rick Krueth — Implementation Owner','Role ID':'ROLE-OWNER','Status':'Active',
      'Payroll Access':'Yes','Tax Access':'Yes','Posting Access':'Yes','Customer Send Access':'Yes',
      'Export Access':'Yes','User Access Admin':'Yes','Created Time':now,'Updated Time':now
    });

    var examples=nlpsCreateExamples_(folders.examples);
    var archiveReference=nlpsCreateArchiveReference_(folders.archive,previous);
    var manifestDetails={
      installationId:installationId,businessId:NLPS_SETUP.BUSINESS_ID,businessName:NLPS_SETUP.BUSINESS_NAME,
      setupAccount:email,coreEngineVersion:typeof H38_UNIFIED_SHELL!=='undefined'?H38_UNIFIED_SHELL.VERSION:H38_BO.VERSION,
      setupGeneration:NLPS_SETUP.VERSION,createdAt:new Date().toISOString(),spreadsheetId:workbook.getId(),
      rootFolderId:folders.root.getId(),folderIds:{
        customers:folders.customers.getId(),requestsQuotes:folders.requestsQuotes.getId(),work:folders.work.getId(),
        activeJobs:folders.activeJobs.getId(),money:folders.money.getId(),payrollTax:folders.payrollTax.getId(),
        documents:folders.documents.getId(),growth:folders.growth.getId(),examples:folders.examples.getId(),
        imports:folders.imports.getId(),backups:folders.backups.getId(),archive:folders.archive.getId()
      },examples:examples,previousInstallation:previous,archiveReference:archiveReference
    };
    var manifest=nlpsCreateManifest_(folders.systemManifest,manifestDetails);

    boGetProperties_().setProperties({
      NLPS_SETUP_GENERATION:NLPS_SETUP.VERSION,
      NLPS_SETUP_COMPLETED_AT:new Date().toISOString(),
      NLPS_SETUP_ACCOUNT:email,
      NLPS_CUSTOMERS_FOLDER_ID:folders.customers.getId(),
      NLPS_REQUESTS_QUOTES_FOLDER_ID:folders.requestsQuotes.getId(),
      NLPS_WORK_FOLDER_ID:folders.work.getId(),
      NLPS_ACTIVE_JOBS_FOLDER_ID:folders.activeJobs.getId(),
      NLPS_MONEY_FOLDER_ID:folders.money.getId(),
      NLPS_EXAMPLES_FOLDER_ID:folders.examples.getId(),
      NLPS_ARCHIVE_FOLDER_ID:folders.archive.getId(),
      NLPS_INSTALLATION_MANIFEST_ID:manifest.id,
      NLPS_ARCHIVED_INSTALLATIONS_JSON:JSON.stringify([previous])
    },false);

    var validation=boValidateInstallation();
    nlpsSetupAssert_(validation.valid,'The clean Northern Lakes installation did not pass validation: '+JSON.stringify(validation));
    boProof_('CLEAN INSTALL','System',NLPS_SETUP.BUSINESS_ID,'PASS',JSON.stringify({
      installationId:installationId,spreadsheetId:workbook.getId(),rootFolderId:folders.root.getId(),
      examples:examples.length,previousInstallationPreserved:true
    }),email);

    return {
      status:'PASS',configured:true,generation:NLPS_SETUP.VERSION,installationId:installationId,
      businessId:NLPS_SETUP.BUSINESS_ID,officeUrl:nlpsSetupServiceUrl_(),setupUrl:nlpsSetupServiceUrl_()+'?setup=1',
      rootFolderId:folders.root.getId(),rootFolderUrl:folders.root.getUrl(),
      spreadsheetId:workbook.getId(),spreadsheetUrl:workbook.getUrl(),manifest:manifest,
      exampleCount:examples.length,archiveReference:archiveReference,previousInstallation:previous,validation:validation
    };
  }finally{
    lock.releaseLock();
  }
}

function nlpsSafeFolderName_(value){
  return nlpsSetupText_(value).replace(/[\\/:*?"<>|#%{}[\]]/g,'-').replace(/\s+/g,' ').slice(0,120)||'Untitled';
}

function nlpsCustomerFolder_(record){
  var parentId=nlpsSetupProperty_('NLPS_CUSTOMERS_FOLDER_ID');
  if(!parentId)return null;
  var customerId=nlpsSetupText_(record&&record['Customer ID']);
  if(!customerId)return null;
  var label=customerId+' — '+nlpsSafeFolderName_(record['Display Name']||record['Customer Name']||'Customer');
  var folder=nlpsFindOrCreateFolder_(DriveApp.getFolderById(parentId),label);
  ['Requests','Quotes','Jobs','Photos and Measurements','Customer Documents','Invoices and Payments','Communications'].forEach(function(name){nlpsFindOrCreateFolder_(folder,name);});
  return folder;
}

function nlpsLookupCustomer_(customerId){
  if(!customerId)return null;
  return boReadTable_(H38_BO_SHEETS.CUSTOMERS,{includeVoided:true}).find(function(row){return row['Customer ID']===customerId;})||null;
}

function nlpsJobFolder_(record){
  var parentId=nlpsSetupProperty_('NLPS_ACTIVE_JOBS_FOLDER_ID')||nlpsSetupProperty_('NLPS_WORK_FOLDER_ID');
  if(!parentId)return null;
  var jobId=nlpsSetupText_(record&&record['Job ID']);
  if(!jobId)return null;
  var name=jobId+' — '+nlpsSafeFolderName_(record['Project Title']||'Job');
  var folder=nlpsFindOrCreateFolder_(DriveApp.getFolderById(parentId),name);
  ['Intake','Quote and Approval','Before Photos','Site Measurements','Work Documents','Progress Photos','Receipts and Purchases','Completion Photos','Invoice and Payment'].forEach(function(child){nlpsFindOrCreateFolder_(folder,child);});
  return folder;
}

function boAfterBusinessRecordSave_(moduleKey,saved){
  if(boPackValue_('packId','')!=='northern-lakes')return null;
  var module=nlpsSetupText_(moduleKey),record=saved||{},result={status:'PASS',module:module,folders:[]};
  if(module==='customers'){
    var customerFolder=nlpsCustomerFolder_(record);
    if(customerFolder)result.folders.push({type:'customer',id:customerFolder.getId(),url:customerFolder.getUrl()});
  }
  if(['requests','quotes','workOrders','invoices'].indexOf(module)>=0){
    var customer=nlpsLookupCustomer_(record['Customer ID']);
    var parent=customer&&nlpsCustomerFolder_(customer);
    if(parent){
      var subName={requests:'Requests',quotes:'Quotes',workOrders:'Jobs',invoices:'Invoices and Payments'}[module];
      var section=nlpsFindOrCreateFolder_(parent,subName);
      var id=record['Request ID']||record['Quote ID']||record['Work Order ID']||record['Invoice ID']||'Record';
      var folder=nlpsFindOrCreateFolder_(section,nlpsSafeFolderName_(id+' — '+(record.Subject||record['Project Title']||record.Status||module)));
      result.folders.push({type:module,id:folder.getId(),url:folder.getUrl()});
    }
  }
  if(module==='jobs'){
    var jobFolder=nlpsJobFolder_(record);
    if(jobFolder){
      result.folders.push({type:'job',id:jobFolder.getId(),url:jobFolder.getUrl()});
      if(!record['Drive Folder ID']){
        var updated={};Object.keys(record).forEach(function(key){if(key.charAt(0)!=='_')updated[key]=record[key];});
        updated['Drive Folder ID']=jobFolder.getId();
        result.record=boSaveRecord('jobs',record['Job ID'],updated);
      }
    }
  }
  return result;
}
