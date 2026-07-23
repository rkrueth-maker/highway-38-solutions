/**
 * Owner-only cabin demo project and linked sub-quote generator.
 * Creates controlled demo records only. No external action is performed.
 */
const H38_CABIN_MARKER='H38-DEMO8-CABIN';
const H38_CABIN_ROOT='H38 DEMO 08 — UNCLEARED LOT TO 3-BEDROOM CABIN';

function boCabinDemo_(){
  return {
    projectId:H38_CABIN_MARKER+'-PROJECT-001', customerId:H38_CABIN_MARKER+'-CUSTOMER-001',
    jobId:H38_CABIN_MARKER+'-JOB-001', masterQuoteId:H38_CABIN_MARKER+'-QUOTE-MASTER',
    title:'Uncleared Lot to 3-Bedroom, 2-Bath Northwoods Cabin', customer:'Northwoods Cabin Demo Customer',
    email:'cabin.customer@example.invalid', address:'108 Demo Cabin Road, Grand Rapids, MN 55744',
    start:'2026-07-22', total:572550, direct:520500, contingency:52050,
    scope:'Plan and construct an approximately 1,248 sq ft single-story, 3-bedroom, 2-bath Northwoods cabin on an uncleared rural lot. Includes feasibility, clearing, driveway, well, septic, utilities, plans, permits, foundation, structure, electrical, plumbing, HVAC, finishes, inspections and closeout. Land purchase excluded.',
    visuals:[
      ['Architectural plan sheet','https://raw.githubusercontent.com/rkrueth-maker/highway-38-solutions/main/assets/demo-workthroughs/cabin-plan-sheet.png'],
      ['Completed exterior concept','https://raw.githubusercontent.com/rkrueth-maker/highway-38-solutions/main/assets/demo-workthroughs/cabin-exterior-render.png'],
      ['Kitchen, dining and living concept','https://raw.githubusercontent.com/rkrueth-maker/highway-38-solutions/main/assets/demo-workthroughs/cabin-interior-render.png']
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
  return it.hasNext()?it.next():parent.createFolder(H38_CABIN_ROOT);
}

function boCabinUpsert_(sheet,id,values){
  const headers=boHeaders_(sheet), key=boPrimaryKeyHeader_(headers);
  const payload=Object.assign({},values); payload[key]=id;
  if(headers.indexOf('Demo Data')>=0) payload['Demo Data']='Yes';
  if(headers.indexOf('Duplicate Key')>=0) payload['Duplicate Key']=id;
  if(headers.indexOf('Notes')>=0) payload.Notes=[payload.Notes,H38_CABIN_MARKER,'Controlled demonstration only.'].filter(Boolean).join(' | ');
  const existing=boReadTable_(sheet,{includeVoided:true}).find(r=>r[key]===id);
  return existing?boUpdateRecord_(sheet,id,payload,'Reload cabin demo'):boAppendRecord_(sheet,payload,'Seed cabin demo');
}

function boCabinInsertVisuals_(body,cfg){
  cfg.visuals.forEach(function(v){
    body.appendParagraph(v[0]).setHeading(DocumentApp.ParagraphHeading.HEADING3);
    try{const blob=UrlFetchApp.fetch(v[1],{muteHttpExceptions:false}).getBlob(); const img=body.appendImage(blob); img.setWidth(520);}catch(err){body.appendParagraph('Visual reference: '+v[1]);}
  });
}

function boCabinSubquotePdf_(folder,cfg,pkg){
  const quoteId=H38_CABIN_MARKER+'-QUOTE-'+pkg[0];
  const name=quoteId+' — '+pkg[1];
  const old=folder.getFilesByName(name+'.pdf'); if(old.hasNext()) return old.next();
  const doc=DocumentApp.create(name), body=doc.getBody();
  body.appendParagraph('HIGHWAY 38 SOLUTIONS').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('CABIN PROJECT SUB-QUOTE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(pkg[1]); body.appendParagraph('Sub-quote ID: '+quoteId);
  body.appendParagraph('Parent project: '+cfg.projectId); body.appendParagraph('Parent job: '+cfg.jobId);
  body.appendParagraph('Demo customer: '+cfg.customer); body.appendParagraph('Project address: '+cfg.address);
  body.appendParagraph('Scope').setHeading(DocumentApp.ParagraphHeading.HEADING2); body.appendParagraph(pkg[3]);
  body.appendParagraph('Planning amount: $'+Number(pkg[2]).toFixed(2));
  body.appendParagraph('Shared project assumptions').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  ['1,248 sq ft concept; 48 ft × 26 ft; 3 bedrooms; 2 bathrooms.','Single story, simple gable roof, insulated slab concept, no basement or attached garage.','Final amount requires site, permit, supplier and licensed-trade verification.','Land purchase excluded.','This package remains linked to the same plans, exterior concept and interior concept as the master project.'].forEach(x=>body.appendListItem(x));
  body.appendParagraph('Shared approved project visuals').setHeading(DocumentApp.ParagraphHeading.HEADING2); boCabinInsertVisuals_(body,cfg);
  body.appendParagraph('Business Office handoff').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  ['Review package scope and assumptions.','Collect vendor or licensed-trade proposal where required.','Record clarifications, alternates, exclusions and approvals.','Convert approved package to linked work orders and purchasing records.','Capture inspections, photos, receipts, proof and closeout under the parent job.'].forEach((x,i)=>body.appendListItem((i+1)+'. '+x));
  body.appendParagraph('CONTROLLED DEMONSTRATION — no quote was sent and no external action was performed.');
  doc.saveAndClose(); const source=DriveApp.getFileById(doc.getId());
  const pdf=folder.createFile(source.getAs(MimeType.PDF).setName(name+'.pdf')); source.setTrashed(true); return pdf;
}

function boGenerateCabinSubquote(packageKey){
  const owner=boRequireOwner_(), cfg=boCabinDemo_();
  const pkg=cfg.packages.find(p=>p[0]===String(packageKey)); if(!pkg) throw new Error('Unknown cabin package: '+packageKey);
  boSeedCabinDemoProject();
  const root=boCabinRoot_(), quotes=root.getFoldersByName('04 Sub-Quotes').hasNext()?root.getFoldersByName('04 Sub-Quotes').next():root.createFolder('04 Sub-Quotes');
  const quoteId=H38_CABIN_MARKER+'-QUOTE-'+pkg[0];
  boCabinUpsert_(H38_BO_SHEETS.QUOTES,quoteId,{'Quote Number':'Q-'+quoteId,'Customer ID':cfg.customerId,'Project ID':cfg.projectId,'Job ID':cfg.jobId,Title:pkg[1],Description:pkg[3],Status:'Draft Demo — Available On Request',Subtotal:pkg[2],Total:pkg[2],'Quote Date':cfg.start,'Approval Status':'Not Requested'});
  boCabinUpsert_(H38_BO_SHEETS.QUOTE_LINES,quoteId+'-LINE-001',{'Quote ID':quoteId,'Line Number':1,Description:pkg[1]+' — '+pkg[3],Quantity:1,Unit:'LS','Unit Price':pkg[2],Amount:pkg[2],Total:pkg[2],Status:'Draft Demo'});
  const pdf=boCabinSubquotePdf_(quotes,cfg,pkg);
  boCabinUpsert_(H38_BO_SHEETS.DOCUMENTS,quoteId+'-DOC',{'Document Type':'Cabin Sub-Quote PDF','File Name':pdf.getName(),'Drive File ID':pdf.getId(),'File ID':pdf.getId(),'File URL':pdf.getUrl(),'Job ID':cfg.jobId,'Project ID':cfg.projectId,Status:'Draft Demo','Review Status':'Ready On Request',Notes:'Uses the same three approved cabin visuals as the master project.'});
  boProof_('GENERATE CABIN SUBQUOTE','Quote',quoteId,'PASS','Generated linked sub-quote '+pkg[1]+' using shared cabin visuals.',owner.Email);
  return {status:'PASS',quoteId:quoteId,title:pkg[1],amount:pkg[2],pdfId:pdf.getId(),pdfUrl:pdf.getUrl(),projectId:cfg.projectId,jobId:cfg.jobId,externalActionsPerformed:false};
}

function boGenerateAllCabinSubquotes(){
  const owner=boRequireOwner_(), cfg=boCabinDemo_(), results=[];
  boSeedCabinDemoProject(); cfg.packages.forEach(p=>results.push(boGenerateCabinSubquote(p[0])));
  boProof_('GENERATE ALL CABIN SUBQUOTES','Project',cfg.projectId,'PASS','Generated all 21 linked cabin sub-quotes with the shared approved visual set.',owner.Email);
  return {status:'PASS',projectId:cfg.projectId,jobId:cfg.jobId,subquoteCount:results.length,totalOfPackages:cfg.direct,masterPlanningTotal:cfg.total,subquotes:results,externalActionsPerformed:false};
}

function boSeedCabinDemoProject(){
  const owner=boRequireOwner_(), cfg=boCabinDemo_(), root=boCabinRoot_();
  ['01 Intake','02 Shared Visuals','03 Master Quote','04 Sub-Quotes','05 Approvals','06 Job Guide','07 Tasks','08 Purchases and Inspections','09 Proof','10 Invoice and Payment','11 Closeout','12 Backup'].forEach(n=>{if(!root.getFoldersByName(n).hasNext())root.createFolder(n);});
  boCabinUpsert_(H38_BO_SHEETS.CUSTOMERS,cfg.customerId,{'Customer Name':cfg.customer,Name:cfg.customer,Email:cfg.email,Status:'Active Demo'});
  boCabinUpsert_(H38_BO_SHEETS.ADDRESSES,H38_CABIN_MARKER+'-ADDRESS-001',{'Customer ID':cfg.customerId,'Address Type':'Project Demo',Address:cfg.address,Status:'Active Demo'});
  boCabinUpsert_(H38_BO_SHEETS.REQUESTS,H38_CABIN_MARKER+'-REQUEST-001',{'Customer ID':cfg.customerId,'Project ID':cfg.projectId,'Request Type':'Residential Construction',Description:cfg.scope,Status:'Planning Demo','Requested Date':cfg.start,'Customer Name':cfg.customer,'Customer Email':cfg.email});
  boCabinUpsert_(H38_BO_SHEETS.QUOTES,cfg.masterQuoteId,{'Quote Number':'Q-'+cfg.masterQuoteId,'Customer ID':cfg.customerId,'Project ID':cfg.projectId,Title:cfg.title,Description:cfg.scope,Status:'Planning Demo',Subtotal:cfg.direct,Total:cfg.total,'Approved Total':0,'Quote Date':cfg.start,'Approval Status':'Not Requested'});
  boCabinUpsert_(H38_BO_SHEETS.JOBS,cfg.jobId,{'Job Number':'JOB-'+cfg.projectId,'Customer ID':cfg.customerId,'Quote ID':cfg.masterQuoteId,'Project ID':cfg.projectId,Title:cfg.title,Description:cfg.scope,Status:'Preconstruction Demo','Start Date':cfg.start,Revenue:cfg.total,'Invoice Status':'Not Ready'});
  cfg.packages.forEach(function(p,i){
    boCabinUpsert_(H38_BO_SHEETS.QUOTE_LINES,cfg.masterQuoteId+'-LINE-'+String(i+1).padStart(3,'0'),{'Quote ID':cfg.masterQuoteId,'Line Number':i+1,Description:p[1],Quantity:1,Unit:'LS','Unit Price':p[2],Amount:p[2],Total:p[2],Status:'Planning Demo'});
    boCabinUpsert_(H38_BO_SHEETS.WORK_ORDERS,H38_CABIN_MARKER+'-TASK-'+String(i+1).padStart(3,'0'),{'Work Order Number':'TASK-CABIN-'+String(i+1).padStart(3,'0'),'Job ID':cfg.jobId,'Project ID':cfg.projectId,Title:'Obtain and approve '+p[1]+' sub-quote',Description:p[3],'Task Name':'Obtain and approve '+p[1]+' sub-quote','Sequence':i+1,Status:'Ready Demo','Approval Status':'Required','Proof Required':'Yes','Assigned To':'Demo User — no live assignment'});
  });
  boProof_('SEED CABIN DEMO PROJECT','Project',cfg.projectId,'PASS','Created or reloaded cabin project with 21 linked quote packages and shared approved visuals. External actions remained disabled.',owner.Email);
  return {status:'PASS',projectId:cfg.projectId,jobId:cfg.jobId,masterQuoteId:cfg.masterQuoteId,packageCount:cfg.packages.length,folderId:root.getId(),folderUrl:root.getUrl(),externalActionsPerformed:false};
}
