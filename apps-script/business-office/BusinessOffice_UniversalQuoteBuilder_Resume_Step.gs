/** Safe resumable UQB example-run step with non-nested locking. */
function boUniversalResumeExampleSuiteStep(runKey){
  return boSafeExecute_('Resume Universal Quote example suite step',function(){
    var owner=boRequireOwner_(),key=boUniversalRunKey_(runKey);
    boUniversalEnsureStore_();
    var lock=LockService.getScriptLock();lock.waitLock(30000);
    try{
      var access={user:{id:owner['User ID'],email:owner.Email,displayName:owner['Display Name']||owner.Email}},customer=boUniversalDemoCustomer_(key),expected=boUniversalResumeExpected_(),ctx=boUniversalResumeContext_(),phase='finalize',processed=0;
      var simplePending=expected.simple.filter(function(example){
        var project=boUniversalResumeFind_(ctx.projects,function(row){return row['Run Key']===key&&row['Project Type']===example.key;});
        if(!project)return true;
        var sub=boUniversalResumeFind_(ctx.subquotes,function(row){return row['Project ID']===project['Project ID']&&row.Title===example.title;});
        if(!sub)return true;
        return !boUniversalResumeFind_(ctx.items,function(row){return row['Project ID']===project['Project ID']&&row['Subquote ID']===sub['Subquote ID']&&row.Description===example.title+' demonstration package';});
      });
      if(simplePending.length){
        phase='examples';
        simplePending.slice(0,H38_UQB_RESUME.SIMPLE_BATCH).forEach(function(example){boUniversalResumeEnsureSimple_(ctx,access,customer,key,example,expected.simple.indexOf(example));processed+=1;});
      }else{
        var project=boUniversalResumeEnsureHouseProject_(ctx,access,customer,key,expected.house);
        var housePending=expected.house.subquotes.filter(function(spec){
          var sub=boUniversalResumeFind_(ctx.subquotes,function(row){return row['Project ID']===project['Project ID']&&row['Area / System / Trade / Phase / Assembly']===spec.key;});
          if(!sub)return true;
          var item=boUniversalResumeFind_(ctx.items,function(row){return row['Project ID']===project['Project ID']&&row['Subquote ID']===sub['Subquote ID']&&row.Description===spec.title+' package';});
          if(!item)return true;
          var scopeCount=H38_UQB_RESUME.SCOPE_TYPES.filter(function(type){return !!boUniversalResumeFind_(ctx.scopes,function(row){return row['Project ID']===project['Project ID']&&row['Subquote ID']===sub['Subquote ID']&&row['Section Type']===type;});}).length;
          return scopeCount<H38_UQB_RESUME.SCOPE_TYPES.length;
        });
        if(housePending.length){
          phase='house_subquotes';
          housePending.slice(0,H38_UQB_RESUME.HOUSE_BATCH).forEach(function(spec){boUniversalResumeEnsureHouseSubquote_(ctx,access,project,spec,expected.house.subquotes.indexOf(spec));processed+=1;});
          boUniversalRecalculateProject_(project['Project ID']);
        }else{
          var subMap=boUniversalResumeSubMap_(ctx,project['Project ID']);
          var drawingPending=expected.house.drawings.filter(function(spec){return !boUniversalResumeFind_(ctx.drawings,function(row){return row['Project ID']===project['Project ID']&&row['Sheet Number']===spec.number;});});
          if(drawingPending.length){
            phase='drawings';
            drawingPending.slice(0,H38_UQB_RESUME.DRAWING_BATCH).forEach(function(spec){boUniversalResumeEnsureDrawing_(ctx,access,project,spec,subMap);processed+=1;});
            boUniversalUpdate_('PROJECTS',project['Project ID'],{'Consistency Status':'Review Required','Approval Status':'Owner Approval Required'});
          }else{
            var bidPending=expected.house.bidPackages.filter(function(title){return !boUniversalResumeFind_(ctx.bidPackages,function(row){return row['Project ID']===project['Project ID']&&row.Title===title+' bid package';});});
            if(bidPending.length){
              phase='bid_packages';
              bidPending.slice(0,H38_UQB_RESUME.BID_BATCH).forEach(function(title){boUniversalResumeEnsureBidPackage_(ctx,access,project,title,subMap);processed+=1;});
            }
          }
        }
      }
      SpreadsheetApp.flush();ctx=boUniversalResumeContext_();
      var status=boUniversalResumeStatusFromContext_(ctx,key);status.phase=phase;status.processedThisCall=processed;status.version=H38_UQB_RESUME.VERSION;status.nextAction=status.complete?'Example run complete.':'Continue resumable generation.';
      boProof_(status.complete?'COMPLETE UNIVERSAL EXAMPLE SUITE':'RESUME UNIVERSAL EXAMPLE SUITE','Project',key,'PASS',JSON.stringify({phase:phase,processed:processed,progressPercent:status.progressPercent,counts:status.counts,complete:status.complete}),owner.Email);
      return status;
    }finally{lock.releaseLock();}
  },'Project',runKey);
}
