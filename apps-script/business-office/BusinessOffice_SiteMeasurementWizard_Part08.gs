function boSiteMeasurementVerify(projectId,subquoteId,payload){
  return boSafeExecute_('Verify Site Measurement value',function(){
    var access=boQuoteBuilderRequireAction_('Edit');payload=payload||{};boSiteMeasurementArea_(projectId,subquoteId);
    var row=boUniversalFind_('MEASUREMENTS',payload.measurementId);
    boAssert_(row['Project ID']===projectId&&row['Subquote ID']===subquoteId,'The selected measurement does not belong to this project area.');
    var original=boSiteMeasurementNumber_(row.Value,'Original value'),checked=boSiteMeasurementNumber_(payload.checkedValue,'Checked value'),tolerance=payload.tolerance==null?H38_SITE_MEASUREMENT.DEFAULT_TOLERANCE_FEET:boSiteMeasurementPositive_(payload.tolerance,'Tolerance',true),difference=Math.abs(original-checked),passed=difference<=tolerance;
    var meta=boSiteMeasurementParseMeta_(row.Notes)||{marker:H38_SITE_MEASUREMENT.NOTE_MARKER,kind:'measurement',data:{}},nextMeta=Object.assign({},meta.data,{verification:{originalValue:original,checkedValue:checked,difference:difference,tolerance:tolerance,tool:payload.tool||'',user:access.user.email,time:boNow_(),passed:passed,note:payload.note||''}});
    boUniversalUpdate_('MEASUREMENTS',payload.measurementId,{'Verification Status':passed?'Checked':'Conflict — Review Required',Confidence:passed?'FIELD_MEASURED_AND_CHECKED':'NEEDS_REMEASUREMENT',Notes:boSiteMeasurementMeta_(meta.kind,nextMeta)});
    boUniversalUpdate_('PROJECTS',projectId,{'Consistency Status':'Review Required','Approval Status':'Owner Approval Required'});
    var validation=boSiteMeasurementValidateArea_(projectId,subquoteId,true);
    boProof_('VERIFY SITE MEASUREMENT','Measurement',payload.measurementId,passed?'PASS':'HOLD','Difference '+boSiteMeasurementRound_(difference,3)+'; tolerance '+tolerance+'.',access.user.email);
    return{status:passed?'PASS':'HOLD',measurementId:payload.measurementId,originalValue:original,checkedValue:checked,difference:boSiteMeasurementRound_(difference,3),tolerance:tolerance,validation:validation,externalActionsPerformed:false};
  },'Measurement',payload&&payload.measurementId);
}

function boSiteMeasurementValidateArea_(projectId,subquoteId,persist){
  var area=boSiteMeasurementArea_(projectId,subquoteId),rows=boSiteMeasurementRows_(projectId,subquoteId),warnings=[],hasAr=false,hasPreliminary=false,hasConflict=false,hasChecked=false,hasField=false,criticalUnchecked=false;
  if(!rows.length)warnings.push('No measurement records are present.');
  rows.forEach(function(row){
    var source=(row['Source Type']||'').toLowerCase(),verification=(row['Verification Status']||'').toLowerCase(),confidence=row.Confidence||'',meta=boSiteMeasurementParseMeta_(row.Notes);
    if(/\bar\b|lidar/.test(source))hasAr=true;
    if(/map|customer|estimate/.test(source)||confidence==='PRELIMINARY_ESTIMATE')hasPreliminary=true;
    if(/conflict|failed/.test(verification)||confidence==='NEEDS_REMEASUREMENT')hasConflict=true;
    if(/checked|verified/.test(verification)||/_AND_CHECKED$|IMPORTED_VERIFIED/.test(confidence))hasChecked=true;
    if(/field|tape|laser|wheel/.test(source))hasField=true;
    if(meta&&meta.data&&meta.data.critical&&!/checked|verified/.test(verification))criticalUnchecked=true;
  });
  if(criticalUnchecked)warnings.push('A quote-critical measurement has not been checked.');
  if(hasConflict)warnings.push('At least one measurement has a conflict or failed check.');
  var confidence='NEEDS_REMEASUREMENT';
  if(rows.length&&!hasConflict&&!criticalUnchecked){
    if(hasPreliminary&&!hasField&&!hasAr)confidence='PRELIMINARY_ESTIMATE';
    else if(hasAr)confidence=hasChecked?'AR_CAPTURED_AND_CHECKED':'AR_CAPTURED';
    else if(hasField)confidence=hasChecked?'FIELD_MEASURED_AND_CHECKED':'FIELD_MEASURED';
    else if(hasChecked)confidence='IMPORTED_VERIFIED';
    else confidence='PRELIMINARY_ESTIMATE';
  }
  var result={status:confidence==='NEEDS_REMEASUREMENT'?'HOLD':'PASS',measurementConfidence:confidence,warnings:warnings,measurementCount:rows.length,finalQuoteBlocked:H38_SITE_MEASUREMENT.FINAL_QUOTE_BLOCKING.indexOf(confidence)>=0,externalActionsPerformed:false};
  if(persist)boSiteMeasurementUpdateAreaOptions_(area,{measurementConfidence:confidence,warnings:warnings,lastValidatedAt:boNow_()});
  return result;
}
function boSiteMeasurementValidateArea(projectId,subquoteId){
  var access=boQuoteBuilderRequireAction_('Edit'),result=boSiteMeasurementValidateArea_(projectId,subquoteId,true);
  boProof_('VALIDATE SITE MEASUREMENT AREA','Subquote',subquoteId,result.status,result.measurementConfidence+'; '+result.warnings.length+' warning(s).',access.user.email);
  return result;
}
