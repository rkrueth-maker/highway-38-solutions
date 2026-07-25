/** Universal Quote Builder resumable example-run seeding. */
var H38_UQB_RESUME=Object.freeze({
  VERSION:'2026-07-25-resumable-v1',
  SIMPLE_BATCH:4,
  HOUSE_BATCH:3,
  DRAWING_BATCH:5,
  BID_BATCH:3,
  SCOPE_TYPES:Object.freeze(['customer_scope','internal_instruction','quality','evidence','completion','change_condition'])
});

function boUniversalResumeContext_(){
  return {
    projects:boUniversalReadRows_('PROJECTS'),
    revisions:boUniversalReadRows_('REVISIONS'),
    subquotes:boUniversalReadRows_('SUBQUOTES'),
    items:boUniversalReadRows_('ITEMS'),
    calculations:boUniversalReadRows_('CALCULATIONS'),
    scopes:boUniversalReadRows_('SCOPES'),
    drawings:boUniversalReadRows_('DRAWINGS'),
    drawingRevisions:boUniversalReadRows_('DRAWING_REVISIONS'),
    bidPackages:boUniversalReadRows_('BID_PACKAGES')
  };
}
function boUniversalResumeFind_(rows,predicate){
  for(var i=0;i<rows.length;i+=1)if(predicate(rows[i]))return rows[i];
  return null;
}
function boUniversalResumeRunProjects_(ctx,runKey){
  return ctx.projects.filter(function(row){return row['Run Key']===runKey;});
}
function boUniversalResumeHouseProject_(ctx,runKey){
  return boUniversalResumeFind_(ctx.projects,function(row){return row['Run Key']===runKey&&row['Project Type']==='whole_house';});
}
function boUniversalResumeExpected_(){
  var examples=boUniversalQuoteExamples_(),house=boUniversalHouseDemo_();
  return {examples:examples,simple:examples.filter(function(example){return example.key!=='whole_house';}),house:house};
}
function boUniversalResumeStatusFromContext_(ctx,runKey){
  var expected=boUniversalResumeExpected_(),projects=boUniversalResumeRunProjects_(ctx,runKey),byType={};
  projects.forEach(function(row){byType[row['Project Type']]=row;});
  var simpleProjects=0,simpleSubquotes=0,simpleItems=0;
  expected.simple.forEach(function(example){
    var project=byType[example.key];if(!project)return;simpleProjects+=1;
    var sub=boUniversalResumeFind_(ctx.subquotes,function(row){return row['Project ID']===project['Project ID']&&row.Title===example.title;});
    if(sub){simpleSubquotes+=1;if(boUniversalResumeFind_(ctx.items,function(row){return row['Project ID']===project['Project ID']&&row['Subquote ID']===sub['Subquote ID']&&row.Description===example.title+' demonstration package';}))simpleItems+=1;}
  });
  var houseProject=byType.whole_house||null,houseSubquotes=0,houseItems=0,houseScopes=0,drawings=0,bidPackages=0;
  if(houseProject){
    expected.house.subquotes.forEach(function(spec){
      var sub=boUniversalResumeFind_(ctx.subquotes,function(row){return row['Project ID']===houseProject['Project ID']&&row['Area / System / Trade / Phase / Assembly']===spec.key;});
      if(!sub)return;houseSubquotes+=1;
      if(boUniversalResumeFind_(ctx.items,function(row){return row['Project ID']===houseProject['Project ID']&&row['Subquote ID']===sub['Subquote ID']&&row.Description===spec.title+' package';}))houseItems+=1;
      H38_UQB_RESUME.SCOPE_TYPES.forEach(function(type){if(boUniversalResumeFind_(ctx.scopes,function(row){return row['Project ID']===houseProject['Project ID']&&row['Subquote ID']===sub['Subquote ID']&&row['Section Type']===type;}))houseScopes+=1;});
    });
    expected.house.drawings.forEach(function(spec){if(boUniversalResumeFind_(ctx.drawings,function(row){return row['Project ID']===houseProject['Project ID']&&row['Sheet Number']===spec.number;}))drawings+=1;});
    expected.house.bidPackages.forEach(function(title){if(boUniversalResumeFind_(ctx.bidPackages,function(row){return row['Project ID']===houseProject['Project ID']&&row.Title===title+' bid package';}))bidPackages+=1;});
  }
  var counts={projectCount:projects.length,simpleProjects:simpleProjects,simpleSubquotes:simpleSubquotes,simpleItems:simpleItems,houseProject:houseProject?1:0,houseSubquotes:houseSubquotes,houseItems:houseItems,houseScopes:houseScopes,drawings:drawings,bidPackages:bidPackages};
  var expectedCounts={projectCount:18,simpleProjects:17,simpleSubquotes:17,simpleItems:17,houseProject:1,houseSubquotes:14,houseItems:14,houseScopes:84,drawings:10,bidPackages:6};
  var complete=Object.keys(expectedCounts).every(function(key){return Number(counts[key]||0)>=expectedCounts[key];});
  var completedUnits=0,totalUnits=0;Object.keys(expectedCounts).forEach(function(key){completedUnits+=Math.min(Number(counts[key]||0),expectedCounts[key]);totalUnits+=expectedCounts[key];});
  return {status:complete?'PASS':'PARTIAL',complete:complete,runKey:runKey,counts:counts,expected:expectedCounts,progressPercent:Math.round(completedUnits/totalUnits*100),houseProjectId:houseProject?houseProject['Project ID']:'',externalActionsPerformed:false};
}
function boUniversalExampleRunStatus(runKey){
  boQuoteBuilderRequireAction_('View');boUniversalEnsureStore_();var key=boUniversalRunKey_(runKey);return boUniversalResumeStatusFromContext_(boUniversalResumeContext_(),key);
}
function boUniversalLatestIncompleteExampleRun(){
  boRequireOwner_();boUniversalEnsureStore_();var ctx=boUniversalResumeContext_(),keys=[];
  ctx.projects.slice().sort(function(a,b){return String(b['Updated Time']||b['Created Time']).localeCompare(String(a['Updated Time']||a['Created Time']));}).forEach(function(row){if(row['Run Key']&&keys.indexOf(row['Run Key'])<0)keys.push(row['Run Key']);});
  for(var i=0;i<keys.length;i+=1){var status=boUniversalResumeStatusFromContext_(ctx,keys[i]);if(!status.complete&&status.counts.projectCount>0)return status;}
  return {status:'PASS',complete:true,runKey:'',counts:{},expected:{},progressPercent:100,externalActionsPerformed:false};
}
function boUniversalResumeEnsureRevision_(ctx,project,access,summary){
  var found=boUniversalResumeFind_(ctx.revisions,function(row){return row['Project ID']===project['Project ID']&&Number(row['Revision Number']||0)===1;});
  if(found)return found;
  var revision=boUniversalAppend_('REVISIONS',{'Project Revision ID':boId_('UQBR'),'Project ID':project['Project ID'],'Revision Number':1,'Change Summary':summary,'Snapshot JSON':boUniversalJsonText_(project),'Approval Status':'Owner Approval Required','Created By':access.user.id});ctx.revisions.push(revision);return revision;
}
function boUniversalResumeEnsurePricingItem_(ctx,projectId,subquoteId,spec,access){
  var existing=boUniversalResumeFind_(ctx.items,function(row){return row['Project ID']===projectId&&row['Subquote ID']===subquoteId&&row.Description===spec.description;});if(existing)return existing;
  var index=ctx.items.filter(function(row){return row['Project ID']===projectId;}).length,priced=boUniversalPriceLine_(spec,index),id=boId_('UQBI');
  var item=boUniversalAppend_('ITEMS',{'Item ID':id,'Project ID':projectId,'Subquote ID':subquoteId,Sequence:priced.lineNumber,Category:spec.category||'Other',Description:priced.description,Quantity:priced.inputValues.quantity,Unit:spec.unit||'each','Pricing Method':priced.method,Rate:priced.inputValues.rate,Cost:priced.inputValues.cost,Formula:priced.formula,'Price Book Version':priced.priceBookVersion,'Input Values JSON':boUniversalJsonText_(priced.inputValues),'Factors JSON':boUniversalJsonText_(priced.factors),'Calculated Price':priced.calculatedPrice,'Final Price':priced.finalPrice,Taxable:'No','Customer Visible':'Yes','Source Status':priced.sourceStatus,'Manual Override':'No','Override Reason':'','Approving User':'','Warnings JSON':boUniversalJsonText_(priced.warnings),Status:'Active','Created By':access.user.id});ctx.items.push(item);
  var calculation=boUniversalAppend_('CALCULATIONS',{'Calculation ID':boId_('UQBC'),'Project ID':projectId,'Subquote ID':subquoteId,'Item ID':id,'Calculation Type':'Pricing','Inputs JSON':item['Input Values JSON'],Formula:item.Formula,Result:item['Final Price'],Units:'USD',Deterministic:'Yes','Price Book Version':item['Price Book Version'],'Source Status':item['Source Status'],'Approval Status':'Calculation Prepared','Created By':access.user.id});ctx.calculations.push(calculation);return item;
}
function boUniversalResumeEnsureSimple_(ctx,access,customer,runKey,example,index){
  var project=boUniversalResumeFind_(ctx.projects,function(row){return row['Run Key']===runKey&&row['Project Type']===example.key;});var amount=boMoney_(500+index*775);
  if(!project){var id=boId_('UQBP');project=boUniversalAppend_('PROJECTS',{'Project ID':id,'Run Key':runKey,'Customer ID':customer['Customer ID'],'Customer Name':customer['Display Name'],'Project Title':example.title,'Property / Site':'Reusable demonstration site — '+runKey,'Quote Level':example.level,'Project Type':example.key,Summary:example.summary,'Revision Number':1,'Revision Status':'Current','Customer Total':amount,'Internal Cost':boMoney_(amount*.7),Margin:.3,Allowances:0,Contingency:0,'Schedule Basis':'Hypothetical demonstration schedule','Payment Milestones JSON':'[]','Options JSON':'[]',Assumptions:'Hypothetical planning assumptions only.',Exclusions:'No contract, permit, purchase, schedule promise, or work authorization.','Risk Summary':'Source information and professional-review requirements must be confirmed.','Approval Status':'Owner Approval Required','Consistency Status':'Review Required','Professional Review Status':example.level>=4?'Professional-review requirements must be evaluated':'Not normally required for this demonstration',Status:'Demonstration','Created By':access.user.id});ctx.projects.push(project);}
  boUniversalResumeEnsureRevision_(ctx,project,access,'Reusable example run creation');
  var sub=boUniversalResumeFind_(ctx.subquotes,function(row){return row['Project ID']===project['Project ID']&&row.Title===example.title;});
  if(!sub){sub=boUniversalAppend_('SUBQUOTES',{'Subquote ID':boId_('UQBS'),'Project ID':project['Project ID'],Sequence:1,'Subquote Type':example.level>=4?'Technical package':'Service package',Title:example.title,'Area / System / Trade / Phase / Assembly':example.business,'Customer Scope':example.summary,'Internal Instructions':'Verify inputs, apply approved business rules, perform the work, inspect, and collect completion evidence.','Quality Requirements':'Complete against the approved scope and referenced records.','Evidence Requirements':'Before, progress, and completion records as applicable.','Completion Criteria':'Approved scope complete and evidence reviewed.','Change Conditions':'Missing facts, changed scope, or technical conflicts require review.',Assumptions:'Hypothetical demonstration inputs.',Exclusions:'External actions and regulated approvals are excluded.','Options JSON':'[]','Internal Cost':boMoney_(amount*.7),'Customer Price':amount,'Customer Visible':'Yes',Selected:'Yes','Revision Number':1,'Approval Status':'Owner Approval Required',Status:'Demonstration','Created By':access.user.id});ctx.subquotes.push(sub);}
  boUniversalResumeEnsurePricingItem_(ctx,project['Project ID'],sub['Subquote ID'],{description:example.title+' demonstration package',quantity:1,unit:'package',method:example.pricing[0]||'flat_rate_package',rate:amount,cost:boMoney_(amount*.7),priceBookVersion:'DEMO-'+H38_UQB.VERSION,category:example.level>=4?'Technical operations':'Service',sourceStatus:'Hypothetical demonstration'},access);return project;
}
function boUniversalResumeEnsureHouseProject_(ctx,access,customer,runKey,house){
  var project=boUniversalResumeHouseProject_(ctx,runKey);if(project){boUniversalResumeEnsureRevision_(ctx,project,access,'Coordinated reusable house demonstration');return project;}
  var id=boId_('UQBP');project=boUniversalAppend_('PROJECTS',{'Project ID':id,'Run Key':runKey,'Customer ID':customer['Customer ID'],'Customer Name':customer['Display Name'],'Project Title':house.title,'Property / Site':house.property,'Quote Level':5,'Project Type':'whole_house',Summary:house.summary,'Revision Number':1,'Revision Status':'Current','Customer Total':house.total,'Internal Cost':house.directCost,Margin:boMoney_((house.total-house.directCost)/house.total),Allowances:house.allowances,Contingency:house.contingency,'Schedule Basis':house.phases.join(' → '),'Payment Milestones JSON':boUniversalJsonText_(house.milestones),'Options JSON':'[]',Assumptions:'Hypothetical planning assumptions and allowances require confirmation.',Exclusions:'Land, concealed conditions, final permits, professional design, and unapproved changes unless specifically included.','Risk Summary':house.internal.scopeGapChecks.join('; '),'Approval Status':'Owner Approval Required','Consistency Status':'Review Required','Professional Review Status':'Licensed-professional and jurisdiction review required by package.',Status:'Demonstration','Created By':access.user.id});ctx.projects.push(project);boUniversalResumeEnsureRevision_(ctx,project,access,'Coordinated reusable house demonstration');return project;
}
function boUniversalResumeEnsureHouseSubquote_(ctx,access,project,spec,index){
  var sub=boUniversalResumeFind_(ctx.subquotes,function(row){return row['Project ID']===project['Project ID']&&row['Area / System / Trade / Phase / Assembly']===spec.key;});
  if(!sub){sub=boUniversalAppend_('SUBQUOTES',{'Subquote ID':boId_('UQBS'),'Project ID':project['Project ID'],Sequence:index+1,'Subquote Type':'Trade / Package',Title:spec.title,'Area / System / Trade / Phase / Assembly':spec.key,'Customer Scope':spec.scope,'Internal Instructions':'Coordinate this package with adjacent trades, drawings, inspections, schedule dependencies, and selected materials.','Quality Requirements':'Meet approved scope, manufacturer requirements, applicable inspections, and documented acceptance criteria.','Evidence Requirements':'Photos, measurements, inspection records, startup or test results, and completion signoff as applicable.','Completion Criteria':'Package complete, deficiencies resolved, evidence reviewed, and closeout records attached.','Change Conditions':'Changed selections, concealed conditions, conflicts, or missing professional input require a change review.',Assumptions:'Hypothetical demonstration assumptions only.',Exclusions:'Unlisted work and unapproved changes.','Options JSON':'[]','Internal Cost':boMoney_(spec.amount*.78),'Customer Price':spec.amount,'Customer Visible':'Yes',Selected:'Yes','Revision Number':1,'Approval Status':'Owner Approval Required',Status:'Demonstration','Created By':access.user.id});ctx.subquotes.push(sub);}
  boUniversalResumeEnsurePricingItem_(ctx,project['Project ID'],sub['Subquote ID'],{description:spec.title+' package',quantity:1,unit:'package',method:'flat_rate_package',rate:spec.amount,cost:boMoney_(spec.amount*.78),priceBookVersion:'HOUSE-DEMO-'+H38_UQB.VERSION,category:/cabinet|plumb|electric|hvac|concrete|landscape/.test(spec.key)?'Subcontractor':'Labor and materials',sourceStatus:'Hypothetical demonstration'},access);
  var bodies=[spec.scope,'Coordinate with drawings, other trades, schedule, and approval records.','Inspect against approved scope and applicable manufacturer or professional requirements.','Required photos, dimensions, readings, documents, and signoff.','Approved scope complete with evidence and deficiencies closed.','Changed scope or missing verified inputs require review and approval.'];
  H38_UQB_RESUME.SCOPE_TYPES.forEach(function(type,sectionIndex){var existing=boUniversalResumeFind_(ctx.scopes,function(row){return row['Project ID']===project['Project ID']&&row['Subquote ID']===sub['Subquote ID']&&row['Section Type']===type;});if(existing)return;var scope=boUniversalAppend_('SCOPES',{'Scope Section ID':boId_('UQBSCOPE'),'Project ID':project['Project ID'],'Subquote ID':sub['Subquote ID'],'Section Type':type,Sequence:sectionIndex+1,Title:type.replace(/_/g,' '),Body:bodies[sectionIndex],'References JSON':'[]','Approval Status':'Owner Approval Required',Status:'Demonstration','Created By':access.user.id});ctx.scopes.push(scope);});return sub;
}
function boUniversalResumeSubMap_(ctx,projectId){var map={};ctx.subquotes.filter(function(row){return row['Project ID']===projectId;}).forEach(function(row){map[row['Area / System / Trade / Phase / Assembly']]=row['Subquote ID'];});return map;}
function boUniversalResumeDrawingSubquote_(drawing,subMap){var prefix=drawing.number.charAt(0),key=prefix==='P'?'plumbing':prefix==='E'?'electrical':prefix==='M'?'hvac':prefix==='C'?'concrete':prefix==='S'?'deck':prefix==='L'?'landscape':prefix==='G'?'garage':'planning';return subMap[key]||'';}
function boUniversalResumeEnsureDrawing_(ctx,access,project,drawing,subMap){
  var existing=boUniversalResumeFind_(ctx.drawings,function(row){return row['Project ID']===project['Project ID']&&row['Sheet Number']===drawing.number;});if(existing)return existing;
  var classification=drawing.classification,professional=/Permit submission|Engineer or licensed-professional review required|Construction-ready|Approved final/.test(classification)?'Yes':'No',id=boId_('UQBD');
  var record=boUniversalAppend_('DRAWINGS',{'Drawing ID':id,'Project ID':project['Project ID'],'Subquote ID':boUniversalResumeDrawingSubquote_(drawing,subMap),'Sheet Number':drawing.number,'Drawing Title':drawing.title,'Drawing Type':'Layout',Classification:classification,Scale:'Not to scale',Units:'','File ID':'','Preview File ID':'','Current Revision':drawing.revision,'Revision Date':boUniversalToday_(),Notes:'Professional title block fields, notes, units, classification, revision, and review status are required in the attached drawing sheet.',Assumptions:'','Prepared By':access.user.displayName||access.user.email,'Review Status':drawing.review,'Approval Status':'Owner Approval Required','Professional Review Required':professional,'Quantity Impact':'Yes','Scope Impact':'Yes',Status:'Draft','Created By':access.user.id});ctx.drawings.push(record);
  var revision=boUniversalAppend_('DRAWING_REVISIONS',{'Drawing Revision ID':boId_('UQBDR'),'Drawing ID':id,'Project ID':project['Project ID'],'From Revision':'','To Revision':drawing.revision,'Change Summary':'Initial drawing record','File ID':'','Quantity Review Required':'Yes','Scope Review Required':'Yes','Review Status':'Needs Review','Approval Status':'Owner Approval Required','Created By':access.user.id});ctx.drawingRevisions.push(revision);return record;
}
function boUniversalResumeBidSubquote_(title,subMap){var key=title.toLowerCase().split(' ')[0],subId=subMap[key]||'';if(subId)return subId;Object.keys(subMap).some(function(k){if(title.toLowerCase().indexOf(k)>=0){subId=subMap[k];return true;}return false;});return subId;}
function boUniversalResumeEnsureBidPackage_(ctx,access,project,title,subMap){
  var fullTitle=title+' bid package',existing=boUniversalResumeFind_(ctx.bidPackages,function(row){return row['Project ID']===project['Project ID']&&row.Title===fullTitle;});if(existing)return existing;
  var drawingIds=ctx.drawings.filter(function(row){return row['Project ID']===project['Project ID'];}).map(function(row){return row['Drawing ID'];});
  var record=boUniversalAppend_('BID_PACKAGES',{'Bid Package ID':boId_('UQBBP'),'Project ID':project['Project ID'],'Subquote ID':boUniversalResumeBidSubquote_(title,subMap),Title:fullTitle,Scope:'Provide complete pricing for the specified '+title+' scope.','Included Work':'Labor, materials, equipment, coordination, testing, and closeout listed in the package.','Excluded Work':'Clearly identify exclusions and qualifications.','Drawing IDs JSON':boUniversalJsonText_(drawingIds),'Photo IDs JSON':'[]','Measurements JSON':'[]','Quantities JSON':'[]','Material Requirements':'','Site Conditions':'Occupied residential property; verify access and protection requirements.','Schedule Expectations':'Coordinate with the project phase schedule. No schedule is promised until approved.','Permit / License Requirements':'Identify required permits, licensing, and professional review.','Insurance Requirements':'Provide required insurance and business documentation.','Bid Deadline':'','Pricing Form JSON':boUniversalJsonText_({baseBid:'required',alternates:'itemized',allowances:'identified'}),Alternates:'','Clarification Questions':'List assumptions, exclusions, substitutions, lead times, and open questions.','Submission Instructions':'Return the completed pricing form and supporting documents for owner review.','Selected Bid ID':'','Approval Status':'Owner Approval Required','Send Allowed':'No','Revision Number':1,Status:'Prepared','Created By':access.user.id});ctx.bidPackages.push(record);return record;
}
function boUniversalResumeExampleSuite(runKey){
  return boSafeExecute_('Resume Universal Quote example suite',function(){
    var owner=boRequireOwner_(),key=boUniversalRunKey_(runKey),lock=LockService.getScriptLock();lock.waitLock(30000);
    try{
      boUniversalEnsureStore_();var access={user:{id:owner['User ID'],email:owner.Email,displayName:owner['Display Name']||owner.Email}},customer=boUniversalDemoCustomer_(key),expected=boUniversalResumeExpected_(),ctx=boUniversalResumeContext_(),phase='finalize',processed=0;
      var simplePending=expected.simple.filter(function(example){var project=boUniversalResumeFind_(ctx.projects,function(row){return row['Run Key']===key&&row['Project Type']===example.key;});if(!project)return true;var sub=boUniversalResumeFind_(ctx.subquotes,function(row){return row['Project ID']===project['Project ID']&&row.Title===example.title;});if(!sub)return true;return !boUniversalResumeFind_(ctx.items,function(row){return row['Project ID']===project['Project ID']&&row['Subquote ID']===sub['Subquote ID']&&row.Description===example.title+' demonstration package';});});
      if(simplePending.length){phase='examples';simplePending.slice(0,H38_UQB_RESUME.SIMPLE_BATCH).forEach(function(example){boUniversalResumeEnsureSimple_(ctx,access,customer,key,example,expected.simple.indexOf(example));processed+=1;});}
      else{
        var project=boUniversalResumeEnsureHouseProject_(ctx,access,customer,key,expected.house),housePending=expected.house.subquotes.filter(function(spec){var sub=boUniversalResumeFind_(ctx.subquotes,function(row){return row['Project ID']===project['Project ID']&&row['Area / System / Trade / Phase / Assembly']===spec.key;});if(!sub)return true;var item=boUniversalResumeFind_(ctx.items,function(row){return row['Project ID']===project['Project ID']&&row['Subquote ID']===sub['Subquote ID']&&row.Description===spec.title+' package';});if(!item)return true;var scopeCount=H38_UQB_RESUME.SCOPE_TYPES.filter(function(type){return !!boUniversalResumeFind_(ctx.scopes,function(row){return row['Project ID']===project['Project ID']&&row['Subquote ID']===sub['Subquote ID']&&row['Section Type']===type;});}).length;return scopeCount<H38_UQB_RESUME.SCOPE_TYPES.length;});
        if(housePending.length){phase='house_subquotes';housePending.slice(0,H38_UQB_RESUME.HOUSE_BATCH).forEach(function(spec){boUniversalResumeEnsureHouseSubquote_(ctx,access,project,spec,expected.house.subquotes.indexOf(spec));processed+=1;});boUniversalRecalculateProject_(project['Project ID']);}
        else{
          var subMap=boUniversalResumeSubMap_(ctx,project['Project ID']),drawingPending=expected.house.drawings.filter(function(spec){return !boUniversalResumeFind_(ctx.drawings,function(row){return row['Project ID']===project['Project ID']&&row['Sheet Number']===spec.number;});});
          if(drawingPending.length){phase='drawings';drawingPending.slice(0,H38_UQB_RESUME.DRAWING_BATCH).forEach(function(spec){boUniversalResumeEnsureDrawing_(ctx,access,project,spec,subMap);processed+=1;});boUniversalUpdate_('PROJECTS',project['Project ID'],{'Consistency Status':'Review Required','Approval Status':'Owner Approval Required'});}
          else{
            var bidPending=expected.house.bidPackages.filter(function(title){return !boUniversalResumeFind_(ctx.bidPackages,function(row){return row['Project ID']===project['Project ID']&&row.Title===title+' bid package';});});
            if(bidPending.length){phase='bid_packages';bidPending.slice(0,H38_UQB_RESUME.BID_BATCH).forEach(function(title){boUniversalResumeEnsureBidPackage_(ctx,access,project,title,subMap);processed+=1;});}
          }
        }
      }
      SpreadsheetApp.flush();ctx=boUniversalResumeContext_();var status=boUniversalResumeStatusFromContext_(ctx,key);status.phase=phase;status.processedThisCall=processed;status.version=H38_UQB_RESUME.VERSION;status.nextAction=status.complete?'Example run complete.':'Continue resumable generation.';
      boProof_(status.complete?'COMPLETE UNIVERSAL EXAMPLE SUITE':'RESUME UNIVERSAL EXAMPLE SUITE','Project',key,'PASS',JSON.stringify({phase:phase,processed:processed,progressPercent:status.progressPercent,counts:status.counts,complete:status.complete}),owner.Email);return status;
    }finally{lock.releaseLock();}
  },'Project',runKey);
}
