/** Universal Quote Builder approval, review, and completion-package controls. */
function boUniversalListKnowledgePacks(){
  boQuoteBuilderRequireAction_('View');
  if(!boUniversalStoreReady_())return[];
  return boUniversalReadRows_('KNOWLEDGE').sort(function(a,b){return String(b['Updated Time']||b['Created Time']).localeCompare(String(a['Updated Time']||a['Created Time']));});
}
function boUniversalRecordApproval_(recordType,recordId,decision,notes,owner){
  var approval=boAppendRecord_(H38_BO_SHEETS.APPROVALS,{
    'Approval ID':boId_('APP'),
    'Record Type':recordType,
    'Record ID':recordId,
    'Approval Type':'Universal Quote Builder Review',
    'Required Role':'Owner',
    Status:decision==='Approved'?'Complete':'Rejected',
    Decision:decision,
    'Decision By':owner['User ID'],
    'Decision Time':boNow_(),
    'Allowed Flag':decision==='Approved'?'Yes':'No',
    Notes:notes||''
  },'Universal Quote Builder approval');
  return approval['Approval ID'];
}
function boUniversalApproveRecord(recordType,recordId,decision,notes){
  return boSafeExecute_('Review Universal Quote record',function(){
    var owner=boRequireOwner_();
    boAssert_(['Approved','Rejected'].indexOf(decision)>=0,'Decision must be Approved or Rejected.');
    var map={Project:'PROJECTS',Subquote:'SUBQUOTES',Drawing:'DRAWINGS','Bid Package':'BID_PACKAGES'};
    var key=map[recordType];boAssert_(key,'Unsupported Universal Quote approval type: '+recordType);
    var record=boUniversalFind_(key,recordId);
    if(recordType==='Project'&&decision==='Approved')boAssert_(record['Consistency Status']==='Current','Complete the quote consistency review before project approval.');
    if(recordType==='Drawing'&&decision==='Approved'){
      var regulated=record['Professional Review Required']==='Yes';
      if(regulated)boAssert_(/professionally reviewed|licensed review complete|approved final/i.test(record['Review Status']||''),'A regulated or construction-ready drawing requires documented licensed-professional review before approval.');
    }
    var patch={'Approval Status':decision};
    if(recordType==='Bid Package')patch['Send Allowed']=decision==='Approved'?'Yes':'No';
    if(recordType==='Project')patch.Status=decision==='Approved'?'Approved':record.Status;
    if(recordType==='Subquote')patch.Status=decision==='Approved'?'Approved':record.Status;
    var updated=boUniversalUpdate_(key,recordId,patch),approvalId=boUniversalRecordApproval_(recordType,recordId,decision,notes,owner);
    boProof_('UNIVERSAL QUOTE APPROVAL',recordType,recordId,'PASS',decision+'; approval '+approvalId+'; no external action.',owner.Email);
    return{status:'PASS',record:updated,approvalId:approvalId,decision:decision,externalActionsPerformed:false};
  },recordType,recordId);
}
function boUniversalCompleteConsistencyReview(projectId,notes){
  return boSafeExecute_('Complete Universal Quote consistency review',function(){
    var owner=boRequireOwner_(),data=boUniversalGetProject(projectId),issues=[];
    data.measurements.filter(function(row){return /conflict/i.test(row['Verification Status']||'');}).forEach(function(row){issues.push('Measurement conflict: '+row['Measurement ID']);});
    data.drawings.filter(function(row){return (row['Quantity Impact']==='Yes'||row['Scope Impact']==='Yes')&&!/approved|reviewed/i.test(row['Review Status']||'');}).forEach(function(row){issues.push('Drawing impact review incomplete: '+row['Sheet Number']);});
    data.items.filter(function(row){return row['Source Status']===''||/invented|unknown/i.test(row['Source Status']);}).forEach(function(row){issues.push('Uncontrolled pricing source: '+row['Item ID']);});
    boAssert_(!issues.length,'Consistency review cannot pass: '+issues.join('; '));
    var updated=boUniversalUpdate_('PROJECTS',projectId,{'Consistency Status':'Current','Approval Status':'Owner Approval Required'});
    var approvalId=boUniversalRecordApproval_('Project',projectId,'Approved','Consistency review only — final project release still requires approval. '+(notes||''),owner);
    boProof_('COMPLETE QUOTE CONSISTENCY REVIEW','Project',projectId,'PASS','No unresolved measurement, drawing-impact, or pricing-source conflicts. '+approvalId,owner.Email);
    return{status:'PASS',project:updated,issues:[],approvalId:approvalId,externalActionsPerformed:false};
  },'Project',projectId);
}
function boUniversalReviewProject(projectId){
  boQuoteBuilderRequireAction_('View');
  var data=boUniversalGetProject(projectId),p=data.project,findings=[];
  function required(value,label){if(!boNormalizeText_(value))findings.push({severity:'HOLD',area:'Completeness',message:label+' is missing.'});}
  required(p['Project Title'],'Project title');required(p['Customer Name'],'Customer');required(p.Summary,'Project summary');required(p['Schedule Basis'],'Schedule basis');
  if(Number(p['Quote Level']||1)>=2&&!data.items.length)findings.push({severity:'HOLD',area:'Pricing',message:'No structured pricing items exist.'});
  if(Number(p['Quote Level']||1)>=3&&!data.measurements.length)findings.push({severity:'REVIEW',area:'Quantity',message:'Area-based work has no measurement records.'});
  if(Number(p['Quote Level']||1)>=3&&!data.drawings.length)findings.push({severity:'REVIEW',area:'Drawings',message:'Area-based or higher work has no drawing records.'});
  if(Number(p['Quote Level']||1)>=4&&!data.scopeSections.some(function(row){return /quality|inspection/i.test(row['Section Type']||'');}))findings.push({severity:'REVIEW',area:'Quality',message:'Technical quote has no quality or inspection section.'});
  if(Number(p['Quote Level']||1)>=5&&!data.subquotes.length)findings.push({severity:'HOLD',area:'Architecture',message:'Concept and integration proposal has no sub-quotes.'});
  data.measurements.filter(function(row){return /unverified|estimated|conflict/i.test(row['Verification Status']||'');}).forEach(function(row){findings.push({severity:/conflict/i.test(row['Verification Status'])?'HOLD':'REVIEW',area:'Measurement',message:row['Measurement ID']+' is '+row['Verification Status']+'.'});});
  data.drawings.filter(function(row){return row['Professional Review Required']==='Yes'&&!/professionally reviewed|licensed review complete|approved final/i.test(row['Review Status']||'');}).forEach(function(row){findings.push({severity:'REVIEW',area:'Professional review',message:row['Sheet Number']+' requires licensed-professional or jurisdiction review.'});});
  data.bidPackages.filter(function(row){return row['Approval Status']!=='Approved';}).forEach(function(row){findings.push({severity:'REVIEW',area:'Bid package',message:row.Title+' is not approved for release.'});});
  var holds=findings.filter(function(item){return item.severity==='HOLD';}).length,reviews=findings.filter(function(item){return item.severity==='REVIEW';}).length;
  return{status:holds?'HOLD':reviews?'REVIEW':'PASS',projectId:projectId,findings:findings,holdCount:holds,reviewCount:reviews,externalActionsPerformed:false};
}
function boUniversalGenerateCompletionPackage(projectId){
  return boSafeExecute_('Generate Universal Quote completion package',function(){
    var access=boQuoteBuilderRequireAction_('documents'),review=boUniversalReviewProject(projectId);
    boAssert_(review.status!=='HOLD','Completion package cannot be generated while project review has HOLD findings.');
    var outputs=['Customer Proposal','Drawing Package','Internal Estimate','Material Takeoff','Labor Estimate','Work Instructions','Revision Comparison'].map(function(type){return boUniversalGenerateDocument(type,projectId,{});});
    boProof_('GENERATE UNIVERSAL COMPLETION PACKAGE','Project',projectId,'PASS',outputs.length+' private PDFs generated; no delivery.',access.user.email);
    return{status:'PASS',projectId:projectId,review:review,documents:outputs,externalActionsPerformed:false};
  },'Project',projectId);
}
function boUniversalPrepareChangeOrderRecord(projectId,subquoteId,payload){
  return boSafeExecute_('Prepare Universal Quote change order',function(){
    var access=boQuoteBuilderRequireAction_('Edit'),data=boUniversalGetProject(projectId),project=data.project;payload=payload||{};
    boAssert_(payload.description,'Change description is required.');
    var change=boAppendRecord_(H38_BO_SHEETS.CHANGE_ORDERS,{
      'Change Order ID':boId_('CO'),
      'Change Order Number':boGetNextNumber_('Change Order'),
      'Job ID':payload.jobId||'',
      'Quote ID':project['Master Quote ID']||'',
      'Customer ID':project['Customer ID'],
      Description:payload.description,
      Reason:payload.reason||'Scope change under review',
      'Amount Change':boMoney_(payload.amountChange||0),
      'Schedule Change':payload.scheduleChange||'',
      Status:'Prepared',
      'Approval Status':'Owner Approval Required',
      'Customer Approval Status':'Pending',
      Notes:'Universal Quote project '+projectId+(subquoteId?' / subquote '+subquoteId:'')
    },'Universal Quote change-order preparation');
    boUniversalUpdate_('PROJECTS',projectId,{'Consistency Status':'Review Required','Approval Status':'Owner Approval Required'});
    boProof_('PREPARE UNIVERSAL CHANGE ORDER','Project',projectId,'PASS',change['Change Order ID']+'; not approved or sent.',access.user.email);
    return{status:'PASS',changeOrder:change,externalActionsPerformed:false};
  },'Project',projectId);
}
