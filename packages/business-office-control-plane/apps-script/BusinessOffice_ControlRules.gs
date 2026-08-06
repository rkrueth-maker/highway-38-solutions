/** Business Office Platform — deterministic mobile, field, receipt, equipment, and social rules. */
var BO_CONTROL_ROLES=Object.freeze({OWNER:'Owner',ADMIN:'Administrator',FOREMAN:'Foreman',ESTIMATOR:'Estimator',FIELD:'Field Staff',STAFF:'Staff',BOOKKEEPER:'Bookkeeper',PAYROLL:'Payroll',VIEWER:'Viewer'});
function boControlRole_(value){return String(value||'').trim();}
function boControlAction_(key,label,icon,route,primary){return{key:key,label:label,icon:icon,route:route,primary:primary===true};}
function boControlCapabilities_(role){
  role=boControlRole_(role);
  var owner=role===BO_CONTROL_ROLES.OWNER,admin=role===BO_CONTROL_ROLES.ADMIN,foreman=role===BO_CONTROL_ROLES.FOREMAN,estimator=role===BO_CONTROL_ROLES.ESTIMATOR,field=role===BO_CONTROL_ROLES.FIELD,staff=role===BO_CONTROL_ROLES.STAFF,bookkeeper=role===BO_CONTROL_ROLES.BOOKKEEPER,payroll=role===BO_CONTROL_ROLES.PAYROLL;
  return{controlPlane:owner||admin,assignWork:owner||admin||foreman,clockWork:owner||admin||foreman||field||staff,captureProgress:owner||admin||foreman||field||staff,captureReceipt:owner||admin||foreman||field||staff||bookkeeper,reviewReceipt:owner||admin||bookkeeper,createQuote:owner||admin||foreman||estimator||staff,sendQuote:owner||admin,prepareSocial:owner||admin||foreman||staff,approveSocial:owner,markSocialPosted:owner||admin,payrollReview:owner||admin||bookkeeper||payroll,customerVisibility:owner||admin||foreman,viewEquipment:owner||admin||foreman||field||staff||bookkeeper,manageEquipment:owner||admin,assignEquipment:owner||admin||foreman,inspectEquipment:owner||admin||foreman||field||staff,serviceEquipment:owner||admin||foreman,equipmentCostReview:owner||admin||bookkeeper,readOnly:role===BO_CONTROL_ROLES.VIEWER};
}
function boControlFastActions_(role,state){
  var caps=boControlCapabilities_(role),current=state&&state.currentSession||null,actions=[];
  if(caps.clockWork)actions.push(boControlAction_(current?'field-session':'clock-in',current?'Open Current Work':'Clock In','⏱','control:field',true));
  if(caps.assignWork)actions.push(boControlAction_('assign-work','Assign Work','✓','control:assign',true));
  if(caps.captureProgress)actions.push(boControlAction_('progress-photo','Add Job Photo','📷','control:photo',true));
  if(caps.captureReceipt)actions.push(boControlAction_('scan-receipt','Scan Receipt','🧾','control:receipt',true));
  if(caps.viewEquipment)actions.push(boControlAction_('equipment',caps.assignEquipment?'Equipment & Assets':'My Equipment','🛠','control:equipment',true));
  if(caps.createQuote)actions.push(boControlAction_('create-quote','Create Quote','＋','app:quote-builder',true));
  if(caps.controlPlane)actions.push(boControlAction_('approvals','Review Approvals','✓','bo:approvals',false));
  if(caps.prepareSocial)actions.push(boControlAction_('social','Social Media','◉','control:social',false));
  if(caps.payrollReview)actions.push(boControlAction_('timecards','Time & Payroll','👥','bo:time',false));
  return actions;
}
function boFieldSessionTransition_(session,event,payload,now){
  var current=session?Object.assign({},session):null,action=String(event||''),time=String(now||''),data=payload||{};
  if(action==='CLOCK_IN'){if(current&&current.status!=='CLOCKED_OUT')throw new Error('An active field session already exists.');if(!data.taskId&&!data.jobId)throw new Error('Select an assigned task or job before clocking in.');return{status:'WORKING',taskId:data.taskId||'',jobId:data.jobId||'',workOrderId:data.workOrderId||'',customerId:data.customerId||'',startedAt:time,pausedAt:'',endedAt:'',breakMinutes:0,notes:''};}
  if(!current)throw new Error('No active field session exists.');
  if(action==='PAUSE'){if(current.status!=='WORKING')throw new Error('Only working time can be paused.');current.status='PAUSED';current.pausedAt=time;return current;}
  if(action==='RESUME'){if(current.status!=='PAUSED')throw new Error('Only paused time can be resumed.');current.status='WORKING';current.pausedAt='';current.breakMinutes=Number(current.breakMinutes||0)+Number(data.breakMinutes||0);return current;}
  if(action==='CLOCK_OUT'){if(['WORKING','PAUSED'].indexOf(current.status)<0)throw new Error('The field session is not active.');current.status='CLOCKED_OUT';current.endedAt=time;current.notes=String(data.notes||current.notes||'');return current;}
  throw new Error('Unsupported field-session action: '+action);
}
function boFieldCloseoutValidation_(task,proofs,payload){
  var row=task||{},items=Array.isArray(proofs)?proofs:[],input=payload||{},required=String(row['Required Proof']||'Completion Photo,Notes').split(',').map(function(value){return value.trim();}).filter(Boolean),missing=[];
  function has(type){return items.some(function(item){return String(item.photoType||item['Photo Type']||'')===type&&String(item.documentId||item['Document ID']||'');});}
  required.forEach(function(rule){if(rule==='Before Photo'&&!has('Before'))missing.push(rule);else if(rule==='Progress Photo'&&!has('Progress'))missing.push(rule);else if(rule==='Completion Photo'&&!has('Completion'))missing.push(rule);else if(rule==='Notes'&&!String(input.notes||'').trim())missing.push(rule);else if(rule==='Checklist'&&input.checklistComplete!==true)missing.push(rule);});
  return{valid:missing.length===0,missing:missing,customerVisibleRequested:input.customerVisible===true,ownerReviewRequired:input.ownerReviewRequired!==false};
}
function boReceiptRouting_(payload){
  var input=payload||{};if(!input.fileName||!input.mimeType||!input.base64Data)throw new Error('A receipt photo or PDF is required.');if(!input.jobId&&!input.customerId)throw new Error('Choose a job or customer for the receipt.');
  return{document:{documentType:'Receipt',sourceType:input.jobId?'Job':'Customer',sourceId:input.jobId||input.customerId,accessClassification:'Private Financial'},receipt:{vendorId:input.vendorId||'',date:input.date||'',paymentMethod:input.paymentMethod||'',subtotal:Number(input.subtotal||0),tax:Number(input.tax||0),total:Number(input.total||0),customerId:input.customerId||'',jobId:input.jobId||'',expenseCategory:input.expenseCategory||'Materials',accountCode:input.accountCode||'',approvalStatus:'Owner Approval Required',postingStatus:'Not Posted',ocrStatus:'Needs Review'}};
}
function boSocialTransition_(post,action,role,now,externalActionsEnabled){
  var row=Object.assign({status:'Draft',approvalStatus:'Not Submitted',publishAllowed:'No'},post||{}),event=String(action||''),actor=boControlRole_(role),owner=actor===BO_CONTROL_ROLES.OWNER,admin=actor===BO_CONTROL_ROLES.ADMIN;
  if(event==='SUBMIT_REVIEW'){if(['Draft','Revision Required','Hold'].indexOf(row.status)<0)throw new Error('Only draft, held, or revision-required content can be submitted.');row.status='Needs Review';row.approvalStatus='Owner Approval Required';row.publishAllowed='No';row.submittedAt=String(now||'');return row;}
  if(event==='APPROVE'){if(!owner)throw new Error('Owner approval is required for social content.');row.status='Approved';row.approvalStatus='Approved';row.publishAllowed='Yes';row.approvedAt=String(now||'');return row;}
  if(event==='REVISE'){if(!owner)throw new Error('Owner decision is required.');row.status='Revision Required';row.approvalStatus='Revision Required';row.publishAllowed='No';return row;}
  if(event==='HOLD'){if(!owner&&!admin)throw new Error('Owner or Administrator access is required.');row.status='Hold';row.publishAllowed='No';return row;}
  if(event==='SCHEDULE'){if(row.approvalStatus!=='Approved'||row.publishAllowed!=='Yes')throw new Error('Approved content is required before scheduling.');row.status='Scheduled';row.scheduledAt=String(now||row.scheduledAt||'');return row;}
  if(event==='PUBLISH'){if(!owner)throw new Error('Owner release is required before publishing.');if(!externalActionsEnabled)return{status:'HOLD',reason:'External social publishing is locked.',externalActionOccurred:false,post:row};if(row.approvalStatus!=='Approved'||row.publishAllowed!=='Yes')throw new Error('Approved selected content is required before publishing.');return{status:'READY',reason:'Selected post passed internal release checks.',externalActionOccurred:false,post:row};}
  if(event==='MARK_POSTED'){if(!owner&&!admin)throw new Error('Owner or Administrator access is required.');if(row.approvalStatus!=='Approved')throw new Error('Only approved content can be marked posted.');row.status='Posted';row.publishedAt=String(now||'');return row;}
  throw new Error('Unsupported social-content action: '+event);
}
