/**
 * Owner-only Cabin Demo 08 generator.
 * Creates one linked project, one master quote, 21 individual sub-quotes,
 * linked records across every relevant Business Office table, one master PDF,
 * 21 package PDFs, proof, activity, and backup evidence.
 * No customer send, order, payment, scheduling, or other external action occurs.
 */
const H38_CABIN_MARKER='H38-DEMO8-CABIN';
const H38_CABIN_ROOT='H38 DEMO 08 — UNCLEARED LOT TO 3-BEDROOM CABIN';

function boCabinDemo_(){
  return {
    projectId:H38_CABIN_MARKER+'-PROJECT-001',
    customerId:H38_CABIN_MARKER+'-CUSTOMER-001',
    contactId:H38_CABIN_MARKER+'-CONTACT-001',
    addressId:H38_CABIN_MARKER+'-ADDRESS-001',
    requestId:H38_CABIN_MARKER+'-REQUEST-001',
    jobId:H38_CABIN_MARKER+'-JOB-001',
    masterQuoteId:H38_CABIN_MARKER+'-QUOTE-MASTER',
    masterApprovalId:H38_CABIN_MARKER+'-APPROVAL-MASTER',
    title:'Uncleared Lot to 3-Bedroom, 2-Bath Northwoods Cabin',
    customer:'Northwoods Cabin Demo Customer',
    email:'cabin.customer@example.invalid',
    address:'108 Demo Cabin Road, Grand Rapids, MN 55744',
    start:'2026-07-22',
    total:572550,
    direct:520500,
    contingency:52050,
    scope:'Plan and construct an approximately 1,248 sq ft single-story, 3-bedroom, 2-bath Northwoods cabin on an uncleared rural lot. Includes feasibility, clearing, driveway, well, septic, utilities, plans, permits, foundation, structure, electrical, plumbing, HVAC, finishes, inspections and closeout. Land purchase excluded.',
    visuals:[
      ['PLAN','Architectural plan sheet','https://raw.githubusercontent.com/rkrueth-maker/highway-38-solutions/main/assets/demo-workthroughs/cabin-plan-sheet.png'],
      ['EXTERIOR','Completed exterior concept','https://raw.githubusercontent.com/rkrueth-maker/highway-38-solutions/main/assets/demo-workthroughs/cabin-exterior-render.png'],
      ['INTERIOR','Kitchen, dining and living concept','https://raw.githubusercontent.com/rkrueth-maker/highway-38-solutions/main/assets/demo-workthroughs/cabin-interior-render.png']
    ],
    packages:[
      ['01-SURVEY','Survey, Soils and Preconstruction',18000,'Boundary/topographic survey allowance, soils and bearing review, septic soil evaluation, utility research, staking and preconstruction coordination.'],
      ['02-SITE','Clearing, Grading and Driveway',34000,'Selective clearing, stump removal, debris handling, erosion control, rough grading, building pad, approximately 250 ft Class 5 access drive, drainage and final shaping.'],
      ['03-WELL','Private Well',18500,'Licensed well contractor allowance including drilling, casing, grout, pump, pressure system, trench to cabin, notification, well record and initial water testing.'],
      ['04-SEPTIC','Septic / SSTS',24500,'Three-bedroom licensed design basis, tank, distribution, trench or bed allowance, piping, installation, inspection and as-built record. Mound upgrade excluded.'],
      ['05-UTILITY','Utility Service and Exterior Trenching',11500,'Electrical service coordination, transformer/service allowance, trenching, conduit, meter equipment and exterior connections, subject to actual utility distance.'],
      ['06-PLANS','House Plans, Engineering and Permits',22000,'Dimensioned floor plan, elevations, foundation and framing details, structural and energy review allowances, mechanical layouts, permit drawings, review and permit allowances.'],
      ['07-SLAB','Insulated Slab Foundation',32000,'Excavation, compacted base, frost protection, insulation, vapor barrier, reinforcing, thickened edges, under-slab plumbing coordination and concrete finish.'],
      ['08-FRAME','Framing and Structural Shell',58000,'Exterior and interior framing, engineered roof package, sheathing, connectors, blocking, labor, equipment and dry-in coordination.'],
      ['09-ROOF','Roofing',18000,'Underlayment, ice and water protection, asphalt shingles, flashing, ventilation, drip edge and gutter allowance.'],
      ['10-OPENINGS','Windows and Exterior Doors',22000,'Cold-climate window package, insulated exterior doors, flashing, air sealing, hardware and installation.'],
      ['11-SIDING','Siding and Exterior Finish',24000,'Weather-resistive barrier, durable siding, trim, soffit, fascia, exterior sealants and finish details.'],
      ['12-INSULATION','Insulation and Air Sealing',18000,'Code-compliant wall, roof and slab package, penetration sealing, blower-door readiness and energy documentation allowance.'],
      ['13-ELECTRICAL','Electrical',24000,'200-amp service and panel, branch wiring, AFCI/GFCI protection, lighting, receptacles, smoke/CO alarms, appliance circuits, exterior outlets, low-voltage allowance, permits and inspections.'],
      ['14-PLUMBING','Plumbing',28000,'Well-to-house connection, underground and above-floor DWV, water distribution, two bathrooms, kitchen, laundry, water heater, fixtures allowance, testing, permits and inspections.'],
      ['15-HVAC','HVAC and Ventilation',22000,'Cold-climate heat pump or equivalent, backup heat, load calculation allowance, distribution, bath exhaust, range ventilation, ERV, controls, startup, balancing, permits and inspections.'],
      ['16-DRYWALL','Drywall and Painting',22000,'Drywall, finishing, selected texture, primer, interior paint and touch-up.'],
      ['17-CABINETS','Cabinets and Countertops',28000,'Mid-range kitchen cabinetry, bath vanities, hardware, quartz or comparable countertop allowance, installation and templates.'],
      ['18-FINISH','Flooring, Trim and Interior Doors',26000,'Durable flooring, bedroom flooring allowance, interior doors, casing, base, closet shelving and finish carpentry.'],
      ['19-FIXTURES','Fixtures and Appliances',18000,'Plumbing fixture allowance, lighting fixture allowance, kitchen appliance package, bath accessories and installation coordination.'],
      ['20-EXTERIOR','Covered Entry, Steps and Exterior Completion',14000,'Covered entry structure, steps and landing, railings as required, final grading, topsoil and seed allowance and construction cleanup.'],
      ['21-MANAGEMENT','General Conditions and Project Management',38000,'Scheduling, procurement, temporary power and sanitation, dumpsters, site protection, supervision, quality checks, documentation, inspections, closeout and overhead allowance.']
    ]
  };
}

function boCabinRoot_(){
  const parent=DriveApp.getFolderById(boGetFolderId_(H38_BO.DOCUMENT_FOLDER_PROPERTY));
  const it=parent.getFoldersByName(H38_CABIN_ROOT);
  const root=it.hasNext()?it.next():parent.createFolder(H38_CABIN_ROOT);
  ['01 Intake','02 Shared Visuals','03 Master Quote','04 Sub-Quotes','05 Approvals','06 Job Guide','07 Tasks','08 Purchases and Inspections','09 Proof','10 Invoice and Payment','11 Closeout','12 Backup'].forEach(function(name){if(!root.getFoldersByName(name).hasNext())root.createFolder(name);});
  return root;
}

function boCabinUpsert_(sheetName,id,values){
  const headers=boHeaders_(sheetName),key=boPrimaryKeyHeader_(headers),payload=Object.assign({},values||{});
  payload[key]=id;
  if(headers.indexOf('Demo Data')>=0)payload['Demo Data']='Yes';
  if(headers.indexOf('Duplicate Key')>=0)payload['Duplicate Key']=id;
  if(headers.indexOf('Notes')>=0)payload.Notes=[payload.Notes,H38_CABIN_MARKER,'Controlled demonstration only.'].filter(Boolean).join(' | ');
  const existing=boReadTable_(sheetName,{includeVoided:true}).find(function(row){return row[key]===id;});
  return existing?boUpdateRecord_(sheetName,id,payload,'Reload Cabin Demo 08'):boAppendRecord_(sheetName,payload,'Seed Cabin Demo 08');
}

function boCabinInsertVisuals_(body,cfg){
  cfg.visuals.forEach(function(visual){
    body.appendParagraph(visual[1]).setHeading(DocumentApp.ParagraphHeading.HEADING3);
    try{const blob=UrlFetchApp.fetch(visual[2],{muteHttpExceptions:false}).getBlob();const image=body.appendImage(blob);image.setWidth(520);}catch(error){body.appendParagraph('Visual reference: '+visual[2]);}
  });
}

function boCabinPackageFileName_(cfg,pkg){return H38_CABIN_MARKER+'-QUOTE-'+pkg[0]+' — '+pkg[1]+'.pdf';}
function boCabinMasterFileName_(cfg){return cfg.masterQuoteId+' — Plans and All 21 Quotes.pdf';}

function boCabinPackagePdf_(folder,cfg,pkg){
  const quoteId=H38_CABIN_MARKER+'-QUOTE-'+pkg[0],name=quoteId+' — '+pkg[1];
  const old=folder.getFilesByName(name+'.pdf');if(old.hasNext())return old.next();
  const doc=DocumentApp.create(name),body=doc.getBody();
  body.appendParagraph('HIGHWAY 38 SOLUTIONS').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('CABIN PROJECT SUB-QUOTE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(pkg[1]);body.appendParagraph('Sub-quote ID: '+quoteId);
  body.appendParagraph('Parent master quote: '+cfg.masterQuoteId);body.appendParagraph('Parent project: '+cfg.projectId);body.appendParagraph('Parent job: '+cfg.jobId);
  body.appendParagraph('Demo customer: '+cfg.customer);body.appendParagraph('Project address: '+cfg.address);
  body.appendParagraph('Scope').setHeading(DocumentApp.ParagraphHeading.HEADING2);body.appendParagraph(pkg[3]);
  body.appendParagraph('Planning amount: $'+Number(pkg[2]).toFixed(2));
  body.appendParagraph('Shared assumptions').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  ['1,248 sq ft concept; 48 ft × 26 ft; 3 bedrooms; 2 bathrooms.','Single story, simple gable roof, insulated slab concept, no basement or attached garage.','Final pricing requires site, permit, supplier and licensed-trade verification.','Land purchase excluded.','No purchase, customer send, payment, scheduling, or other external action is performed.'].forEach(function(text){body.appendListItem(text);});
  body.appendParagraph('Shared project visuals').setHeading(DocumentApp.ParagraphHeading.HEADING2);boCabinInsertVisuals_(body,cfg);
  body.appendParagraph('Business Office handoff').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  ['Review package scope and assumptions.','Collect vendor or licensed-trade proposal where required.','Record clarifications, alternates, exclusions and approvals.','Convert only an approved package to active work and purchasing.','Capture inspections, photos, receipts, proof and closeout under the parent job.'].forEach(function(text,index){body.appendListItem((index+1)+'. '+text);});
  body.appendParagraph('CONTROLLED DEMONSTRATION — no external action was performed.');
  doc.saveAndClose();const source=DriveApp.getFileById(doc.getId());const pdf=folder.createFile(source.getAs(MimeType.PDF).setName(name+'.pdf'));source.setTrashed(true);return pdf;
}

function boCabinMasterPdf_(folder,cfg){
  const name=cfg.masterQuoteId+' — Plans and All 21 Quotes',old=folder.getFilesByName(name+'.pdf');if(old.hasNext())return old.next();
  const doc=DocumentApp.create(name),body=doc.getBody();
  body.appendParagraph('HIGHWAY 38 SOLUTIONS').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('NORTHWOODS CABIN — PLANS AND ALL 21 QUOTES').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(cfg.scope);body.appendParagraph('Direct project subtotal: $'+cfg.direct.toFixed(2));body.appendParagraph('Planning contingency: $'+cfg.contingency.toFixed(2));body.appendParagraph('Planning total excluding land: $'+cfg.total.toFixed(2));
  boCabinInsertVisuals_(body,cfg);
  body.appendParagraph('Complete quote stack').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  cfg.packages.forEach(function(pkg,index){body.appendParagraph((index+1)+'. '+pkg[1]+' — $'+Number(pkg[2]).toFixed(2));body.appendParagraph(pkg[3]);});
  body.appendParagraph('CONTROLLED DEMONSTRATION — all packages remain pending verification and approval.');
  doc.saveAndClose();const source=DriveApp.getFileById(doc.getId());const pdf=folder.createFile(source.getAs(MimeType.PDF).setName(name+'.pdf'));source.setTrashed(true);return pdf;
}

function boCabinSeedCore_(cfg,root){
  boCabinUpsert_(H38_BO_SHEETS.CUSTOMERS,cfg.customerId,{'Customer Name':cfg.customer,Name:cfg.customer,Email:cfg.email,Status:'Active Demo'});
  boCabinUpsert_(H38_BO_SHEETS.CONTACTS,cfg.contactId,{'Customer ID':cfg.customerId,Name:cfg.customer,Email:cfg.email,Status:'Active Demo'});
  boCabinUpsert_(H38_BO_SHEETS.ADDRESSES,cfg.addressId,{'Customer ID':cfg.customerId,'Address Type':'Project Demo',Address:cfg.address,Status:'Active Demo'});
  boCabinUpsert_(H38_BO_SHEETS.REQUESTS,cfg.requestId,{'Customer ID':cfg.customerId,'Project ID':cfg.projectId,'Request Type':'Residential Construction',Description:cfg.scope,Status:'Planning Demo','Requested Date':cfg.start,'Customer Name':cfg.customer,'Customer Email':cfg.email});
  boCabinUpsert_(H38_BO_SHEETS.QUOTES,cfg.masterQuoteId,{'Quote Number':'Q-'+cfg.masterQuoteId,'Customer ID':cfg.customerId,'Project ID':cfg.projectId,'Job ID':cfg.jobId,Title:cfg.title,Description:cfg.scope,Status:'Planning Demo — Master',Subtotal:cfg.direct,Total:cfg.total,'Approved Total':0,'Quote Date':cfg.start,'Approval Status':'Not Requested'});
  boCabinUpsert_(H38_BO_SHEETS.APPROVALS,cfg.masterApprovalId,{'Related Record Type':'Quote','Related Record ID':cfg.masterQuoteId,'Project ID':cfg.projectId,'Job ID':cfg.jobId,Status:'Pending Demo',Decision:'Not Requested','Approval Type':'Master Cabin Planning Approval',Notes:'Approval record only. No approval request was sent.'});
  boCabinUpsert_(H38_BO_SHEETS.JOBS,cfg.jobId,{'Job Number':'JOB-'+cfg.projectId,'Customer ID':cfg.customerId,'Quote ID':cfg.masterQuoteId,'Project ID':cfg.projectId,Title:cfg.title,Description:cfg.scope,Status:'Preconstruction Demo','Start Date':cfg.start,Revenue:cfg.total,'Invoice Status':'Not Ready'});
  cfg.packages.forEach(function(pkg,index){
    boCabinUpsert_(H38_BO_SHEETS.QUOTE_LINES,cfg.masterQuoteId+'-LINE-'+String(index+1).padStart(3,'0'),{'Quote ID':cfg.masterQuoteId,'Line Number':index+1,Description:pkg[1]+' — '+pkg[3],Quantity:1,Unit:'LS','Unit Price':pkg[2],Amount:pkg[2],Total:pkg[2],Status:'Planning Demo'});
  });
  cfg.visuals.forEach(function(visual){boCabinUpsert_(H38_BO_SHEETS.DOCUMENTS,H38_CABIN_MARKER+'-VISUAL-'+visual[0],{'Document Type':'Cabin Shared Visual','File Name':visual[1],'File URL':visual[2],'Job ID':cfg.jobId,'Project ID':cfg.projectId,Status:'Approved Demo Reference','Review Status':'Approved Demo','OCR State':'Not Required — Demo'});});
  const masterPdf=boCabinMasterPdf_(root.getFoldersByName('03 Master Quote').next(),cfg);
  boCabinUpsert_(H38_BO_SHEETS.DOCUMENTS,H38_CABIN_MARKER+'-DOC-MASTER',{'Document Type':'Cabin Plans and All 21 Quotes PDF','File Name':masterPdf.getName(),'Drive File ID':masterPdf.getId(),'File ID':masterPdf.getId(),'File URL':masterPdf.getUrl(),'Job ID':cfg.jobId,'Project ID':cfg.projectId,Status:'Planning Demo','Review Status':'Ready for Owner Review'});
  return masterPdf;
}

function boCabinSeedPackage_(cfg,root,pkg,index,owner){
  const sequence=index+1,suffix=pkg[0],quoteId=H38_CABIN_MARKER+'-QUOTE-'+suffix,approvalId=H38_CABIN_MARKER+'-APPROVAL-'+suffix,taskId=H38_CABIN_MARKER+'-TASK-'+suffix,vendorId=H38_CABIN_MARKER+'-VENDOR-'+suffix,poId=H38_CABIN_MARKER+'-PO-'+suffix;
  boCabinUpsert_(H38_BO_SHEETS.QUOTES,quoteId,{'Quote Number':'Q-'+quoteId,'Customer ID':cfg.customerId,'Project ID':cfg.projectId,'Job ID':cfg.jobId,'Parent Quote ID':cfg.masterQuoteId,Title:pkg[1],Description:pkg[3],Status:'Planning Demo — Sub-Quote',Subtotal:pkg[2],Total:pkg[2],'Approved Total':0,'Quote Date':cfg.start,'Approval Status':'Not Requested'});
  boCabinUpsert_(H38_BO_SHEETS.QUOTE_LINES,quoteId+'-LINE-001',{'Quote ID':quoteId,'Line Number':1,Description:pkg[1]+' — '+pkg[3],Quantity:1,Unit:'LS','Unit Price':pkg[2],Amount:pkg[2],Total:pkg[2],Status:'Planning Demo'});
  boCabinUpsert_(H38_BO_SHEETS.APPROVALS,approvalId,{'Related Record Type':'Quote','Related Record ID':quoteId,'Project ID':cfg.projectId,'Job ID':cfg.jobId,Status:'Pending Demo',Decision:'Not Requested','Approval Type':'Cabin Package Approval',Notes:'Pending verification; no approval request was sent.'});
  boCabinUpsert_(H38_BO_SHEETS.WORK_ORDERS,taskId,{'Work Order Number':'TASK-CABIN-'+String(sequence).padStart(3,'0'),'Job ID':cfg.jobId,'Project ID':cfg.projectId,'Quote ID':quoteId,Title:'Verify and approve '+pkg[1],Description:pkg[3],'Task Name':'Verify and approve '+pkg[1],Sequence:sequence,Status:'Ready Demo','Approval Status':'Required','Proof Required':'Yes','Assigned To':'Demo User — no live assignment'});
  boCabinUpsert_(H38_BO_SHEETS.VENDORS,vendorId,{'Vendor Name':pkg[1]+' Demo Vendor',Name:pkg[1]+' Demo Vendor',Email:suffix.toLowerCase()+'@example.invalid',Status:'Planning Demo'});
  boCabinUpsert_(H38_BO_SHEETS.PURCHASE_ORDERS,poId,{'PO Number':'PO-'+quoteId,'Vendor ID':vendorId,'Job ID':cfg.jobId,'Project ID':cfg.projectId,'Quote ID':quoteId,Status:'Planning Demo — Not Ordered','Approval Status':'Required',Total:pkg[2],'Order Date':'',Notes:'Planning record only. No order was transmitted.'});
  boCabinUpsert_(H38_BO_SHEETS.PO_LINES,poId+'-LINE-001',{'Purchase Order ID':poId,'PO ID':poId,Description:pkg[1]+' planning allowance',Quantity:1,Unit:'package','Unit Cost':pkg[2],Amount:pkg[2],Status:'Planning Demo — Not Ordered'});
  const pdf=boCabinPackagePdf_(root.getFoldersByName('04 Sub-Quotes').next(),cfg,pkg);
  boCabinUpsert_(H38_BO_SHEETS.DOCUMENTS,quoteId+'-DOC',{'Document Type':'Cabin Sub-Quote PDF','File Name':pdf.getName(),'Drive File ID':pdf.getId(),'File ID':pdf.getId(),'File URL':pdf.getUrl(),'Job ID':cfg.jobId,'Project ID':cfg.projectId,'Quote ID':quoteId,Status:'Planning Demo','Review Status':'Ready for Owner Review',Notes:'Uses the same approved cabin plan, exterior, and interior visuals as the master project.'});
  boCabinUpsert_(H38_BO_SHEETS.PROOF_LOG,H38_CABIN_MARKER+'-PROOF-'+suffix,{'Record Type':'Quote','Record ID':quoteId,'Job ID':cfg.jobId,'Project ID':cfg.projectId,Action:'CABIN SUB-QUOTE GENERATED',Result:'PASS',Status:'Complete Demo',Evidence:'Linked quote, line, approval, task, purchase-planning record, PDF, and document record created.','Performed By':owner.Email||'Owner'});
  boCabinUpsert_(H38_BO_SHEETS.ACTIVITY,H38_CABIN_MARKER+'-ACTIVITY-'+suffix,{'Activity Type':'Cabin Package Demo','Record Type':'Quote','Record ID':quoteId,'Project ID':cfg.projectId,'Job ID':cfg.jobId,Description:'Generated and linked '+pkg[1]+' through quote, approval, task, purchasing, document, and proof tables.',Status:'Completed Demo',Notes:'Internal records only; no external action.'});
  return {quoteId:quoteId,title:pkg[1],amount:pkg[2],pdfId:pdf.getId(),pdfUrl:pdf.getUrl(),approvalId:approvalId,taskId:taskId,poId:poId};
}

function boFinalizeCabinBackup_(cfg,root,owner,results){
  const folder=root.getFoldersByName('12 Backup').next(),name=H38_CABIN_MARKER+'-BACKUP-MANIFEST.json';
  const old=folder.getFilesByName(name);while(old.hasNext())old.next().setTrashed(true);
  const file=folder.createFile(name,JSON.stringify({marker:H38_CABIN_MARKER,projectId:cfg.projectId,jobId:cfg.jobId,masterQuoteId:cfg.masterQuoteId,subquotes:results,generated:boNow_(),externalActionsPerformed:false},null,2),MimeType.PLAIN_TEXT);
  boCabinUpsert_(H38_BO_SHEETS.BACKUP_LOG,H38_CABIN_MARKER+'-BACKUP-001',{'Backup Type':'Cabin Demo Project Manifest','Source Spreadsheet ID':boGetSpreadsheet_().getId(),'Backup File ID':file.getId(),Status:'Complete','Created By':owner['User ID']||owner.Email,Notes:'Idempotent controlled demo manifest; no destructive restore performed.'});
  return file;
}

function boCabinExpectedIds_(cfg){
  const packageIds=function(prefix,suffix){return cfg.packages.map(function(pkg){return H38_CABIN_MARKER+prefix+pkg[0]+(suffix||'');});};
  const masterLines=cfg.packages.map(function(pkg,index){return cfg.masterQuoteId+'-LINE-'+String(index+1).padStart(3,'0');});
  const subQuotes=packageIds('-QUOTE-');
  return {
    customers:[cfg.customerId],contacts:[cfg.contactId],addresses:[cfg.addressId],requests:[cfg.requestId],
    quotes:[cfg.masterQuoteId].concat(subQuotes),quoteLines:masterLines.concat(subQuotes.map(function(id){return id+'-LINE-001';})),
    approvals:[cfg.masterApprovalId].concat(packageIds('-APPROVAL-')),jobs:[cfg.jobId],workOrders:packageIds('-TASK-'),vendors:packageIds('-VENDOR-'),
    purchaseOrders:packageIds('-PO-'),poLines:packageIds('-PO-','-LINE-001'),
    documents:cfg.visuals.map(function(visual){return H38_CABIN_MARKER+'-VISUAL-'+visual[0];}).concat([H38_CABIN_MARKER+'-DOC-MASTER']).concat(subQuotes.map(function(id){return id+'-DOC';})),
    proof:packageIds('-PROOF-'),activity:packageIds('-ACTIVITY-'),backup:[H38_CABIN_MARKER+'-BACKUP-001']
  };
}

function boCabinCountExpected_(sheetName,ids){
  const headers=boHeaders_(sheetName),key=boPrimaryKeyHeader_(headers),wanted={};
  ids.forEach(function(id){wanted[String(id)]=true;});
  return boReadTable_(sheetName,{includeVoided:true}).filter(function(row){return Boolean(wanted[String(row[key])]);}).length;
}

function boVerifyCabinDemo08TableCoverage_(cfg,root){
  cfg=cfg||boCabinDemo_();root=root||boCabinRoot_();
  const ids=boCabinExpectedIds_(cfg),counts={
    customers:boCabinCountExpected_(H38_BO_SHEETS.CUSTOMERS,ids.customers),contacts:boCabinCountExpected_(H38_BO_SHEETS.CONTACTS,ids.contacts),addresses:boCabinCountExpected_(H38_BO_SHEETS.ADDRESSES,ids.addresses),requests:boCabinCountExpected_(H38_BO_SHEETS.REQUESTS,ids.requests),
    quotes:boCabinCountExpected_(H38_BO_SHEETS.QUOTES,ids.quotes),quoteLines:boCabinCountExpected_(H38_BO_SHEETS.QUOTE_LINES,ids.quoteLines),approvals:boCabinCountExpected_(H38_BO_SHEETS.APPROVALS,ids.approvals),jobs:boCabinCountExpected_(H38_BO_SHEETS.JOBS,ids.jobs),
    workOrders:boCabinCountExpected_(H38_BO_SHEETS.WORK_ORDERS,ids.workOrders),vendors:boCabinCountExpected_(H38_BO_SHEETS.VENDORS,ids.vendors),purchaseOrders:boCabinCountExpected_(H38_BO_SHEETS.PURCHASE_ORDERS,ids.purchaseOrders),poLines:boCabinCountExpected_(H38_BO_SHEETS.PO_LINES,ids.poLines),
    documents:boCabinCountExpected_(H38_BO_SHEETS.DOCUMENTS,ids.documents),proof:boCabinCountExpected_(H38_BO_SHEETS.PROOF_LOG,ids.proof),activity:boCabinCountExpected_(H38_BO_SHEETS.ACTIVITY,ids.activity),backup:boCabinCountExpected_(H38_BO_SHEETS.BACKUP_LOG,ids.backup)
  };
  const expected={customers:1,contacts:1,addresses:1,requests:1,quotes:22,quoteLines:42,approvals:22,jobs:1,workOrders:21,vendors:21,purchaseOrders:21,poLines:21,documents:25,proof:21,activity:21,backup:1};
  const masterFolder=root.getFoldersByName('03 Master Quote').next(),subFolder=root.getFoldersByName('04 Sub-Quotes').next();
  const masterPdfs=masterFolder.getFilesByName(boCabinMasterFileName_(cfg)).hasNext()?1:0;
  const packagePdfs=cfg.packages.reduce(function(total,pkg){return total+(subFolder.getFilesByName(boCabinPackageFileName_(cfg,pkg)).hasNext()?1:0);},0);
  const missing=Object.keys(expected).filter(function(key){return counts[key]!==expected[key];});
  if(masterPdfs!==1)missing.push('masterPdfs');if(packagePdfs!==21)missing.push('packagePdfs');
  return {status:missing.length?'HOLD':'PASS',marker:H38_CABIN_MARKER,projectId:cfg.projectId,jobId:cfg.jobId,masterQuoteId:cfg.masterQuoteId,expected:expected,counts:counts,masterPdfCount:masterPdfs,packagePdfCount:packagePdfs,totalPdfCount:masterPdfs+packagePdfs,missing:missing,externalActionsPerformed:false};
}

function boVerifyCabinDemo08TableCoverage(){boRequireOwner_();return boVerifyCabinDemo08TableCoverage_(boCabinDemo_(),boCabinRoot_());}

function boPrepareCabinDemo08Generation_(owner){
  const cfg=boCabinDemo_(),root=boCabinRoot_(),masterPdf=boCabinSeedCore_(cfg,root);
  return {status:'PASS',projectId:cfg.projectId,jobId:cfg.jobId,masterQuoteId:cfg.masterQuoteId,masterPdfId:masterPdf.getId(),packageCount:cfg.packages.length,ownerEmail:owner.Email||'',externalActionsPerformed:false};
}
function boPrepareCabinDemo08Generation(){return boPrepareCabinDemo08Generation_(boRequireOwner_());}

function boGeneratePreparedCabinSubquote_(packageKey,owner){
  const cfg=boCabinDemo_(),pkg=cfg.packages.find(function(item){return item[0]===String(packageKey);});
  if(!pkg)throw new Error('Unknown cabin package: '+packageKey);
  const result=boCabinSeedPackage_(cfg,boCabinRoot_(),pkg,cfg.packages.indexOf(pkg),owner);
  return Object.assign({status:'PASS',projectId:cfg.projectId,jobId:cfg.jobId,externalActionsPerformed:false},result);
}
function boGeneratePreparedCabinSubquote(packageKey){return boGeneratePreparedCabinSubquote_(packageKey,boRequireOwner_());}

function boGeneratePreparedCabinBatch(startIndex,batchSize){
  const owner=boRequireOwner_(),cfg=boCabinDemo_(),start=Math.max(0,Number(startIndex)||0),size=Math.max(1,Math.min(5,Number(batchSize)||3)),results=[];
  cfg.packages.slice(start,start+size).forEach(function(pkg,index){results.push(boCabinSeedPackage_(cfg,boCabinRoot_(),pkg,start+index,owner));});
  return {status:'PASS',startIndex:start,processed:results.length,nextIndex:start+results.length,total:cfg.packages.length,subquotes:results,externalActionsPerformed:false};
}

function boCabinExistingResults_(cfg,root){
  const folder=root.getFoldersByName('04 Sub-Quotes').next();
  return cfg.packages.map(function(pkg,index){
    const quoteId=H38_CABIN_MARKER+'-QUOTE-'+pkg[0],files=folder.getFilesByName(boCabinPackageFileName_(cfg,pkg)),pdf=files.hasNext()?files.next():null;
    return {quoteId:quoteId,title:pkg[1],amount:pkg[2],pdfId:pdf?pdf.getId():'',pdfUrl:pdf?pdf.getUrl():'',approvalId:H38_CABIN_MARKER+'-APPROVAL-'+pkg[0],taskId:H38_CABIN_MARKER+'-TASK-'+pkg[0],poId:H38_CABIN_MARKER+'-PO-'+pkg[0],sequence:index+1};
  });
}

function boFinalizeCabinDemo08Generation_(owner){
  const cfg=boCabinDemo_(),root=boCabinRoot_(),results=boCabinExistingResults_(cfg,root),backup=boFinalizeCabinBackup_(cfg,root,owner,results),coverage=boVerifyCabinDemo08TableCoverage_(cfg,root);
  if(coverage.status!=='PASS')throw new Error('Cabin Demo 08 table coverage incomplete: '+JSON.stringify(coverage));
  boProof_('GENERATE ALL CABIN SUBQUOTES','Project',cfg.projectId,'PASS','Generated master project and all 21 linked sub-quotes across customers, contacts, addresses, requests, quotes, quote lines, approvals, jobs, work orders, vendors, purchase orders, PO lines, documents, proof, activity, and backup tables.',owner.Email||'Owner');
  const properties=PropertiesService.getScriptProperties(),version=typeof H38_CABIN_AUTOSEED_VERSION!=='undefined'?H38_CABIN_AUTOSEED_VERSION:'V3-VERIFIED-ALL-TABLES';
  properties.setProperty('H38_CABIN_DEMO08_GENERATED','YES');properties.setProperty('H38_CABIN_DEMO08_GENERATED_VERSION',version);properties.setProperty('H38_CABIN_DEMO08_STATUS','PASS');properties.setProperty('H38_CABIN_DEMO08_COMPLETED_AT',new Date().toISOString());properties.setProperty('H38_CABIN_DEMO08_RESULT_JSON',JSON.stringify(coverage));properties.deleteProperty('H38_CABIN_DEMO08_ERROR');
  return {status:'PASS',projectId:cfg.projectId,jobId:cfg.jobId,masterQuoteId:cfg.masterQuoteId,subquoteCount:21,pdfCount:21,totalPdfCount:22,quoteRecordCount:coverage.counts.quotes,quoteLineCount:coverage.counts.quoteLines,approvalCount:coverage.counts.approvals,workOrderCount:coverage.counts.workOrders,vendorCount:coverage.counts.vendors,purchaseOrderCount:coverage.counts.purchaseOrders,poLineCount:coverage.counts.poLines,documentCount:coverage.counts.documents,proofCount:coverage.counts.proof,activityCount:coverage.counts.activity,backupCount:coverage.counts.backup,totalOfPackages:cfg.direct,masterPlanningTotal:cfg.total,backupFileId:backup.getId(),coverage:coverage,subquotes:results,externalActionsPerformed:false};
}
function boFinalizeCabinDemo08Generation(){return boFinalizeCabinDemo08Generation_(boRequireOwner_());}

function boGenerateCabinSubquote(packageKey){
  const owner=boRequireOwner_();boPrepareCabinDemo08Generation_(owner);const result=boGeneratePreparedCabinSubquote_(packageKey,owner);
  boProof_('GENERATE CABIN SUBQUOTE','Quote',result.quoteId,'PASS','Generated and linked one Cabin Demo 08 package across the system tables.',owner.Email||'Owner');return result;
}

function boGenerateAllCabinSubquotes(){
  const owner=boRequireOwner_(),cfg=boCabinDemo_();boPrepareCabinDemo08Generation_(owner);
  cfg.packages.forEach(function(pkg){boGeneratePreparedCabinSubquote_(pkg[0],owner);});
  return boFinalizeCabinDemo08Generation_(owner);
}

function boSeedCabinDemoProject(){return boGenerateAllCabinSubquotes();}
