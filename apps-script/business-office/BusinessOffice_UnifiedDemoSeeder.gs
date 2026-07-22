/**
 * Business Office — unified seven-project controlled demo seeder.
 *
 * Owner-only. Creates isolated demo records and per-project folders/PDFs.
 * No customer contact, purchases, payments, filing, scheduling, inspection booking,
 * worker assignment, or other external action is performed.
 */

const H38_DEMO7_ROOT_NAME = 'H38 DEMO PROJECTS — SEPARATE OUTPUTS';
const H38_DEMO7_MARKER = 'H38-DEMO7';

function boUnifiedDemoProjects_() {
  return [
    { key:'FLOWER', title:'Flower Garden Installation', category:'Landscape', total:3250, customer:'Amanda and Chris Demo', email:'flower.customer@example.invalid', start:'2026-06-02', complete:'2026-06-06', scope:'Install approximately 240 sq ft of flower garden with sod removal, soil amendment, edging, cold-hardy plants, mulch, cleanup, and restoration.', items:[['Layout and bed marking',200],['Sod removal',480],['Soil amendment',360],['Edging',360],['Plants',1150],['Mulch',320],['Cleanup',380]], tasks:['Confirm layout and utilities','Protect adjacent surfaces','Remove sod','Amend and grade soil','Install edging','Install plants','Apply mulch','Restore edges','Capture completion proof','Close project'] },
    { key:'DRIVE', title:'Class 5 Driveway', category:'Site Work', total:3250, customer:'Jordan Demo', email:'driveway.customer@example.invalid', start:'2026-06-09', complete:'2026-06-13', scope:'Supply, place, crown, grade, and compact Class 5 aggregate on an approximately 12 ft by 80 ft driveway.', items:[['Mobilization',350],['Subgrade preparation',480],['Class 5 aggregate',1428],['Spread and grade',550],['Compaction',342],['Cleanup',100]], tasks:['Confirm limits and drainage','Verify utilities and access','Prepare subgrade','Approve aggregate purchase','Place aggregate','Establish crown','Compact surface','Shape edges','Capture proof','Close project'] },
    { key:'POND', title:'Premium Small Backyard Pond', category:'Water Feature', total:12500, customer:'Taylor Demo', email:'pond.customer@example.invalid', start:'2026-06-16', complete:'2026-06-24', scope:'Construct an approximately 10 ft by 14 ft pond with excavation, liner, pump, filtration, natural stone, planting, testing, and startup.', items:[['Layout and protection',500],['Excavation',2800],['Liner system',2100],['Pump and filtration',2450],['Natural stone',2150],['Planting and startup',1000],['Cleanup',1500]], tasks:['Confirm location and utilities','Protect access path','Lay out basin','Excavate shelves and basin','Inspect excavation','Install underlayment and liner','Install pump and plumbing','Set stone','Add plants','Fill and test','Restore site','Capture proof','Owner walkthrough','Close project'] },
    { key:'CLEAR', title:'Residential Lot Clearing', category:'Land Preparation', total:16500, customer:'Morgan Demo', email:'clearing.customer@example.invalid', start:'2026-06-25', complete:'2026-07-03', scope:'Clear and rough-prepare approximately one acre for a residence with selected tree removal, targeted grubbing, access, rough grading, debris handling, and cleanup.', items:[['Mobilization',1500],['Tree and brush clearing',6000],['Targeted grubbing',3500],['Rough grading',4000],['Cleanup',1500]], tasks:['Confirm surveyed limits','Verify wetlands and utilities','Establish exclusion zones','Clear selected trees','Clear brush','Grub approved zones','Handle debris','Rough grade site','Control erosion','Capture final grades','Record quantities','Owner acceptance','Close project'] },
    { key:'DECK', title:'8 × 12 Pressure-Treated Deck', category:'Exterior Construction', total:5842, customer:'Daniel and Erin Demo', email:'deck.customer@example.invalid', start:'2026-07-15', complete:'2026-07-19', scope:'Construct an attached 8 × 12 pressure-treated deck with six frost-depth footings, framing, decking, stairs, guard railing, connectors, cleanup, and restoration.', items:[['Planning and mobilization',525],['Field verification',275],['Footings',1110],['Framing package',1425],['Decking',984],['Guard railing',1050],['Stairs',675],['Cleanup',265]], tasks:['Confirm code, permit, and utilities','Capture matched before photos','Verify dimensions and elevations','Approve final scope','Approve material purchase','Lay out footings','Excavate and verify footing depth','Place footings and posts','Verify ledger substrate','Install framing','Inspect concealed framing','Install decking','Build stairs and railing','Final quality check','Capture matched after photos','Prepare invoice and closeout'] },
    { key:'IRR', title:'Four-Zone Residential Irrigation System', category:'Landscape Systems', total:3926.5, customer:'Megan and Tyler Demo', email:'irrigation.customer@example.invalid', start:'2026-07-17', complete:'2026-07-19', scope:'Design and install a four-zone automatic irrigation system with backflow protection, smart controller, rain sensor, piping, heads, drip areas, restoration, programming, and owner training.', items:[['Measure, flow test, and design',425],['Backflow and connection',625],['Valve manifold',480],['Controller and rain sensor',485],['Mainline and lateral piping',1111.5],['Heads',912],['Drip laterals',348],['Testing and restoration',540]], tasks:['Perform pressure and flow test','Capture property plan and before photos','Verify utility markings','Complete hydraulic design','Approve zone layout','Create job package','Approve material purchase','Lay out heads and lines','Install backflow','Install manifold and controller','Install four zones','Install drip lines','Pressure test and flush','Program and balance coverage','Restore trenches','Create as-built plan','Capture after visuals','Owner training and closeout'] },
    { key:'KIT', title:'Mid-Range Kitchen Remodel', category:'Interior Remodeling', total:18745, customer:'Rachel and Mark Demo', email:'kitchen.customer@example.invalid', start:'2026-07-20', complete:'2026-08-01', scope:'Complete a mid-range kitchen remodel with demolition, cabinets, quartz countertops, sink and faucet, backsplash, LVP flooring, appliances, lighting, paint, trim, cleanup, commissioning, and closeout.', items:[['Design and selections',1250],['Protection and demolition',2100],['Cabinets and hardware',6200],['Quartz countertops',3276],['Plumbing allowance',1250],['Backsplash',952],['LVP flooring',1710],['Electrical allowance',1650],['Appliance allowance',2500],['Paint, trim, and closeout',1514]], tasks:['Confirm field measurements and selections','Capture matched before photos','Verify permits and trade scope','Protect occupied areas','Complete controlled demolition','Inspect concealed conditions','Approve cabinet and material orders','Complete rough plumbing','Complete rough electrical','Install cabinets','Template and install countertops','Install sink and faucet','Install backsplash','Install flooring','Install appliances and lighting','Paint and trim','Commission systems','Capture matched after photos','Final walkthrough','Invoice, payment record, and closeout'] }
  ];
}

function boUnifiedDemoId_(project, type, suffix) {
  return [H38_DEMO7_MARKER, project.key, type, suffix || '001'].join('-');
}

function boUnifiedDemoProjectFolder_(root, project) {
  const name = boUnifiedDemoId_(project, 'PROJECT') + ' — ' + project.title;
  const existing = root.getFoldersByName(name);
  const folder = existing.hasNext() ? existing.next() : root.createFolder(name);
  ['01 Intake','02 Photos','03 Measurements','04 Quotes','05 Approvals','06 Job Guide','07 Tasks','08 Purchases and Inspections','09 Proof','10 Invoice and Payment','11 Closeout','12 Backup'].forEach(function(subName){
    if (!folder.getFoldersByName(subName).hasNext()) folder.createFolder(subName);
  });
  return folder;
}

function boUnifiedDemoRoot_() {
  const parent = DriveApp.getFolderById(boGetFolderId_(H38_BO.DOCUMENT_FOLDER_PROPERTY));
  const folders = parent.getFoldersByName(H38_DEMO7_ROOT_NAME);
  return folders.hasNext() ? folders.next() : parent.createFolder(H38_DEMO7_ROOT_NAME);
}

function boUnifiedDemoPayload_(sheetName, stableId, values) {
  const headers = boHeaders_(sheetName);
  const payload = Object.assign({}, values || {});
  payload[boPrimaryKeyHeader_(headers)] = stableId;
  if (headers.indexOf('Demo Data') >= 0) payload['Demo Data'] = 'Yes';
  if (headers.indexOf('Duplicate Key') >= 0) payload['Duplicate Key'] = stableId;
  if (headers.indexOf('Notes') >= 0) payload.Notes = [payload.Notes, H38_DEMO7_MARKER, 'Controlled demonstration data only.'].filter(Boolean).join(' | ');
  return payload;
}

function boUnifiedDemoUpsert_(sheetName, stableId, values) {
  const headers = boHeaders_(sheetName);
  const key = boPrimaryKeyHeader_(headers);
  const existing = boReadTable_(sheetName, { includeVoided:true }).find(function(row){ return row[key] === stableId; });
  const payload = boUnifiedDemoPayload_(sheetName, stableId, values);
  return existing ? boUpdateRecord_(sheetName, stableId, payload, 'Unified seven-demo reload') : boAppendRecord_(sheetName, payload, 'Unified seven-demo seed');
}

function boUnifiedDemoPdf_(folder, project, type, lines) {
  const name = boUnifiedDemoId_(project, type) + ' — ' + project.title;
  const existing = folder.getFilesByName(name + '.pdf');
  if (existing.hasNext()) return existing.next();
  const doc = DocumentApp.create(name);
  const body = doc.getBody();
  body.appendParagraph('HIGHWAY 38 SOLUTIONS').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('CONTROLLED DEMONSTRATION — ' + project.title).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Project ID: ' + boUnifiedDemoId_(project, 'PROJECT'));
  body.appendParagraph('Demo customer: ' + project.customer + ' · ' + project.email);
  body.appendParagraph('No real customer, purchase, payment, filing, scheduling, inspection booking, assignment, or external communication is created.');
  (lines || []).forEach(function(line){ body.appendParagraph(String(line)); });
  doc.saveAndClose();
  const source = DriveApp.getFileById(doc.getId());
  const pdf = folder.createFile(source.getAs(MimeType.PDF).setName(name + '.pdf'));
  source.setTrashed(true);
  return pdf;
}

function boUnifiedDemoDocumentRecord_(project, jobId, type, file) {
  return boUnifiedDemoUpsert_(H38_BO_SHEETS.DOCUMENTS, boUnifiedDemoId_(project, 'DOC', type), {
    'Document Type': type,
    'File Name': file.getName(),
    'Drive File ID': file.getId(),
    'File ID': file.getId(),
    'File URL': file.getUrl(),
    'Job ID': jobId,
    'Project ID': boUnifiedDemoId_(project, 'PROJECT'),
    Status:'Approved',
    'Review Status':'Approved',
    'OCR State':'Not Required — Demo',
    Notes:'Separate project output. Do not associate with another demo project.'
  });
}

function boSeedUnifiedSevenDemoSystem() {
  const owner = boRequireOwner_();
  const root = boUnifiedDemoRoot_();
  const projects = boUnifiedDemoProjects_();
  const results = [];

  projects.forEach(function(project, projectIndex){
    const projectId = boUnifiedDemoId_(project, 'PROJECT');
    const requestId = boUnifiedDemoId_(project, 'REQUEST');
    const customerId = boUnifiedDemoId_(project, 'CUSTOMER');
    const quoteId = boUnifiedDemoId_(project, 'QUOTE');
    const approvalId = boUnifiedDemoId_(project, 'APPROVAL');
    const jobId = boUnifiedDemoId_(project, 'JOB');
    const invoiceId = boUnifiedDemoId_(project, 'INVOICE');
    const paymentId = boUnifiedDemoId_(project, 'PAYMENT');
    const vendorId = boUnifiedDemoId_(project, 'VENDOR');
    const poId = boUnifiedDemoId_(project, 'PO');
    const folder = boUnifiedDemoProjectFolder_(root, project);

    boUnifiedDemoUpsert_(H38_BO_SHEETS.REQUESTS, requestId, {'Customer ID':customerId,'Project ID':projectId,'Request Type':project.category,Description:project.scope,Status:'Completed Demo','Requested Date':project.start,'Customer Name':project.customer,'Customer Email':project.email});
    boUnifiedDemoUpsert_(H38_BO_SHEETS.CUSTOMERS, customerId, {'Customer Name':project.customer,Name:project.customer,Email:project.email,Phone:'218-555-01' + String(projectIndex + 10).slice(-2),Status:'Active Demo','Attention Status':'None'});
    boUnifiedDemoUpsert_(H38_BO_SHEETS.CONTACTS, boUnifiedDemoId_(project, 'CONTACT'), {'Customer ID':customerId,Name:project.customer,Email:project.email,Phone:'218-555-01' + String(projectIndex + 10).slice(-2),Status:'Active Demo'});
    boUnifiedDemoUpsert_(H38_BO_SHEETS.ADDRESSES, boUnifiedDemoId_(project, 'ADDRESS'), {'Customer ID':customerId,'Address Type':'Project Demo',Address:(projectIndex + 101) + ' Demo Project Road, Grand Rapids, MN 55744',Status:'Active Demo'});
    boUnifiedDemoUpsert_(H38_BO_SHEETS.QUOTES, quoteId, {'Quote Number':'Q-' + projectId,'Customer ID':customerId,'Project ID':projectId,Title:project.title,Description:project.scope,Status:'Approved Demo',Subtotal:project.total,Total:project.total,'Approved Total':project.total,'Quote Date':project.start,'Approval Status':'Approved'});

    project.items.forEach(function(item, itemIndex){
      boUnifiedDemoUpsert_(H38_BO_SHEETS.QUOTE_LINES, boUnifiedDemoId_(project, 'QUOTE-LINE', String(itemIndex + 1).padStart(3,'0')), {'Quote ID':quoteId,'Line Number':itemIndex + 1,Description:item[0],Quantity:1,Unit:'LS','Unit Price':item[1],Amount:item[1],Total:item[1],Status:'Approved Demo'});
    });

    boUnifiedDemoUpsert_(H38_BO_SHEETS.APPROVALS, approvalId, {'Related Record Type':'Quote','Related Record ID':quoteId,'Project ID':projectId,'Job ID':jobId,Status:'Approved',Decision:'Approved','Approval Type':'Owner and Customer Demo Approval','Decision Date':project.start,Notes:'Both owner and customer approvals represented as controlled demo records.'});
    boUnifiedDemoUpsert_(H38_BO_SHEETS.JOBS, jobId, {'Job Number':'JOB-' + projectId,'Customer ID':customerId,'Quote ID':quoteId,'Project ID':projectId,Title:project.title,Description:project.scope,Status:'Completed Demo','Start Date':project.start,'Completion Date':project.complete,Revenue:project.total,'Total Cost':Math.round(project.total * 0.67 * 100) / 100,Profit:Math.round(project.total * 0.33 * 100) / 100,'Invoice Status':'Paid Demo'});

    project.tasks.forEach(function(task, taskIndex){
      boUnifiedDemoUpsert_(H38_BO_SHEETS.WORK_ORDERS, boUnifiedDemoId_(project, 'TASK', String(taskIndex + 1).padStart(3,'0')), {'Work Order Number':'TASK-' + project.key + '-' + String(taskIndex + 1).padStart(3,'0'),'Job ID':jobId,'Project ID':projectId,Title:task,Description:task,'Task Name':task,'Sequence':taskIndex + 1,Status:'Completed Demo','Due Date':project.complete,'Completion Date':project.complete,'Approval Status':/approve|inspect|verify/i.test(task)?'Approved':'Not Required','Proof Required':'Yes','Assigned To':'Demo User — no live assignment'});
      boUnifiedDemoUpsert_(H38_BO_SHEETS.PROOF_LOG, boUnifiedDemoId_(project, 'PROOF', String(taskIndex + 1).padStart(3,'0')), {'Record Type':'Task','Record ID':boUnifiedDemoId_(project, 'TASK', String(taskIndex + 1).padStart(3,'0')),'Job ID':jobId,'Project ID':projectId,Action:'TASK COMPLETE',Result:'PASS',Status:'Complete Demo',Evidence:'Completion note and project-specific proof retained in isolated project folder.','Performed By':'Demo User'});
    });

    boUnifiedDemoUpsert_(H38_BO_SHEETS.VENDORS, vendorId, {'Vendor Name':project.category + ' Demo Supplier',Name:project.category + ' Demo Supplier',Email:project.key.toLowerCase() + '.vendor@example.invalid',Status:'Active Demo'});
    boUnifiedDemoUpsert_(H38_BO_SHEETS.PURCHASE_ORDERS, poId, {'PO Number':'PO-' + projectId,'Vendor ID':vendorId,'Job ID':jobId,'Project ID':projectId,Status:'Approved Demo','Approval Status':'Approved',Total:Math.round(project.total * 0.38 * 100) / 100,'Order Date':project.start,Notes:'Demo purchase record only. No order was transmitted.'});
    boUnifiedDemoUpsert_(H38_BO_SHEETS.PO_LINES, boUnifiedDemoId_(project, 'PO-LINE'), {'Purchase Order ID':poId,'PO ID':poId,Description:project.title + ' materials package',Quantity:1,Unit:'package','Unit Cost':Math.round(project.total * 0.38 * 100) / 100,Amount:Math.round(project.total * 0.38 * 100) / 100,Status:'Demo'});
    boUnifiedDemoUpsert_(H38_BO_SHEETS.EXPENSES, boUnifiedDemoId_(project, 'EXPENSE'), {'Vendor ID':vendorId,'Job ID':jobId,'Project ID':projectId,Description:project.title + ' recorded demo project cost',Total:Math.round(project.total * 0.67 * 100) / 100,Amount:Math.round(project.total * 0.67 * 100) / 100,Status:'Posted Demo','Approval Status':'Approved','Posting Status':'Posted','Expense Date':project.complete});
    boUnifiedDemoUpsert_(H38_BO_SHEETS.INVOICES, invoiceId, {'Invoice Number':'INV-' + projectId,'Customer ID':customerId,'Job ID':jobId,'Project ID':projectId,Status:'Paid Demo',Subtotal:project.total,Total:project.total,'Balance Due':0,'Invoice Date':project.complete,'Due Date':project.complete,'Overdue Days':0});
    boUnifiedDemoUpsert_(H38_BO_SHEETS.INVOICE_LINES, boUnifiedDemoId_(project, 'INVOICE-LINE'), {'Invoice ID':invoiceId,Description:project.title + ' — approved completed scope',Quantity:1,Unit:'LS','Unit Price':project.total,Amount:project.total,Total:project.total,Status:'Demo'});
    boUnifiedDemoUpsert_(H38_BO_SHEETS.PAYMENTS, paymentId, {'Invoice ID':invoiceId,'Customer ID':customerId,'Job ID':jobId,'Project ID':projectId,Amount:project.total,'Payment Date':project.complete,'Payment Method':'Demo Record — no funds moved',Status:'Recorded Demo'});
    boUnifiedDemoUpsert_(H38_BO_SHEETS.TIME_ENTRIES, boUnifiedDemoId_(project, 'TIME'), {'Job ID':jobId,'Project ID':projectId,'Employee ID':'DEMO-USER',Date:project.complete,Hours:Math.max(8, project.tasks.length * 1.5),Status:'Approved Demo','Approval Status':'Approved'});
    boUnifiedDemoUpsert_(H38_BO_SHEETS.PAYROLL_PERIODS, boUnifiedDemoId_(project, 'PAYROLL'), {'Period Name':project.title + ' — Not Required Demo',Status:'Not Required — Demo','Approval Status':'Approved','Export Allowed':'No',Notes:'Project-level demonstration does not create or fund payroll.'});
    boUnifiedDemoUpsert_(H38_BO_SHEETS.TAX_PERIODS, boUnifiedDemoId_(project, 'TAX'), {'Period Name':project.title + ' — Not Required Demo',Status:'Not Required — Demo','Approval Status':'Approved','Finalization Allowed':'No',Notes:'Project-level demonstration does not file taxes or provide tax advice.'});
    boUnifiedDemoUpsert_(H38_BO_SHEETS.ERROR_LOG, boUnifiedDemoId_(project, 'ERROR'), {Severity:'Warning',Status:'Resolved',Message:'Demo validation completed with no active project errors.',Context:projectId,'Resolved Time':project.complete});

    const quotePdf = boUnifiedDemoPdf_(folder.getFoldersByName('04 Quotes').next(), project, 'QUOTE-PDF', ['Scope: ' + project.scope,'Approved total: $' + project.total.toFixed(2),'Line items:'].concat(project.items.map(function(item){return '• ' + item[0] + ' — $' + Number(item[1]).toFixed(2);}))); 
    const jobPdf = boUnifiedDemoPdf_(folder.getFoldersByName('06 Job Guide').next(), project, 'JOB-GUIDE-PDF', ['Approved scope: ' + project.scope,'Ordered job instructions:'].concat(project.tasks.map(function(task,index){return (index + 1) + '. ' + task;})));
    const tasksPdf = boUnifiedDemoPdf_(folder.getFoldersByName('07 Tasks').next(), project, 'TASK-LIST-PDF', ['All tasks are completed demo records:'].concat(project.tasks.map(function(task,index){return '☑ ' + String(index + 1).padStart(2,'0') + ' — ' + task;})));
    const invoicePdf = boUnifiedDemoPdf_(folder.getFoldersByName('10 Invoice and Payment').next(), project, 'INVOICE-PDF', ['Invoice ID: ' + invoiceId,'Total: $' + project.total.toFixed(2),'Balance due: $0.00','Payment status: Recorded Demo — no funds moved.']);
    const closeoutPdf = boUnifiedDemoPdf_(folder.getFoldersByName('11 Closeout').next(), project, 'CLOSEOUT-PDF', ['Project status: Completed Demo','Completion date: ' + project.complete,'All tasks complete.','Proof records complete.','Invoice and payment demo records complete.','Outputs remain isolated in this project folder.']);

    [['Quote PDF',quotePdf],['Job Guide PDF',jobPdf],['Task List PDF',tasksPdf],['Invoice PDF',invoicePdf],['Closeout PDF',closeoutPdf]].forEach(function(pair){ boUnifiedDemoDocumentRecord_(project, jobId, pair[0], pair[1]); });

    const backupFolder = folder.getFoldersByName('12 Backup').next();
    const manifest = backupFolder.createFile(boUnifiedDemoId_(project, 'BACKUP-MANIFEST') + '.json', JSON.stringify({marker:H38_DEMO7_MARKER,projectId:projectId,jobId:jobId,quoteId:quoteId,invoiceId:invoiceId,paymentId:paymentId,folderId:folder.getId(),generated:boNow_()}, null, 2), MimeType.PLAIN_TEXT);
    boUnifiedDemoUpsert_(H38_BO_SHEETS.BACKUP_LOG, boUnifiedDemoId_(project, 'BACKUP'), {'Backup Type':'Project Demo Snapshot','Source Spreadsheet ID':boGetSpreadsheet_().getId(),'Backup File ID':manifest.getId(),Status:'Complete','Created By':owner['User ID'],Notes:'Separate project manifest. No destructive restore performed.'});

    ['Quote Approved → Create Job','Job Created → Generate Instructions','Instructions Created → Generate Tasks','Task Completed → Require Proof','Proof Complete → Prepare Invoice','Payment Recorded → Close Project'].forEach(function(trigger,index){
      boUnifiedDemoUpsert_(H38_BO_SHEETS.ACTIVITY, boUnifiedDemoId_(project, 'TRIGGER', String(index + 1).padStart(3,'0')), {'Activity Type':'Trigger Demo','Record Type':'Project','Record ID':projectId,'Project ID':projectId,'Job ID':jobId,Description:trigger,Status:'Completed Demo',Notes:'Internal demonstration trigger. No external action.'});
    });

    results.push({projectId:projectId,title:project.title,folderId:folder.getId(),folderUrl:folder.getUrl(),quoteId:quoteId,jobId:jobId,invoiceId:invoiceId,paymentId:paymentId,pdfCount:5,taskCount:project.tasks.length,status:'Completed Demo'});
  });

  boProof_('SEED UNIFIED SEVEN DEMOS','System',H38_DEMO7_MARKER,'PASS','Seven complete isolated demo projects created or reloaded. External actions remained disabled.',owner.Email);
  return {status:'PASS',marker:H38_DEMO7_MARKER,projectCount:results.length,rootFolderId:root.getId(),rootFolderUrl:root.getUrl(),projects:results,externalActionsPerformed:false};
}

function boResetUnifiedSevenDemoSystem() {
  const owner = boRequireOwner_();
  const sheets = [H38_BO_SHEETS.REQUESTS,H38_BO_SHEETS.CUSTOMERS,H38_BO_SHEETS.CONTACTS,H38_BO_SHEETS.ADDRESSES,H38_BO_SHEETS.QUOTES,H38_BO_SHEETS.QUOTE_LINES,H38_BO_SHEETS.APPROVALS,H38_BO_SHEETS.JOBS,H38_BO_SHEETS.WORK_ORDERS,H38_BO_SHEETS.VENDORS,H38_BO_SHEETS.PURCHASE_ORDERS,H38_BO_SHEETS.PO_LINES,H38_BO_SHEETS.EXPENSES,H38_BO_SHEETS.INVOICES,H38_BO_SHEETS.INVOICE_LINES,H38_BO_SHEETS.PAYMENTS,H38_BO_SHEETS.TIME_ENTRIES,H38_BO_SHEETS.DOCUMENTS,H38_BO_SHEETS.PROOF_LOG,H38_BO_SHEETS.ACTIVITY,H38_BO_SHEETS.ERROR_LOG,H38_BO_SHEETS.BACKUP_LOG,H38_BO_SHEETS.PAYROLL_PERIODS,H38_BO_SHEETS.TAX_PERIODS];
  let voided = 0;
  sheets.forEach(function(sheetName){
    const headers = boHeaders_(sheetName);
    const key = boPrimaryKeyHeader_(headers);
    boReadTable_(sheetName,{includeVoided:true}).filter(function(row){ return String(row[key] || '').indexOf(H38_DEMO7_MARKER + '-') === 0 && row.Status !== 'Voided' && row['Is Voided'] !== 'Yes'; }).forEach(function(row){ boSoftVoidRecord_(sheetName,row[key],'Owner reset unified seven-demo system.'); voided += 1; });
  });
  const parent = DriveApp.getFolderById(boGetFolderId_(H38_BO.DOCUMENT_FOLDER_PROPERTY));
  const folders = parent.getFoldersByName(H38_DEMO7_ROOT_NAME);
  if (folders.hasNext()) folders.next().setTrashed(true);
  boProof_('RESET UNIFIED SEVEN DEMOS','System',H38_DEMO7_MARKER,'PASS','Soft-voided ' + voided + ' records and moved demo output root to trash.',owner.Email);
  return {status:'PASS',voidedRecords:voided,folderMovedToTrash:true,externalActionsPerformed:false};
}
