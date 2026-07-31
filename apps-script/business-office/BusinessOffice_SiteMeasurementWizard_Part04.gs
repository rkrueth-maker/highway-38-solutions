function boSiteMeasurementSaveBaseline(projectId,subquoteId,payload){
  return boSafeExecute_('Save baseline and widths',function(){
    var access=boQuoteBuilderRequireAction_('Edit');payload=payload||{};boUniversalEnsureStore_();var area=boSiteMeasurementArea_(projectId,subquoteId);
    var baselineLength=boSiteMeasurementPositive_(payload.baselineLength,'Baseline length'),units=payload.units||'ft';
    boAssert_(units==='ft','Phase 1 baseline entry currently requires decimal feet.');
    var stations=(Array.isArray(payload.stations)?payload.stations:[]).map(function(station,index){
      return{sequence:index+1,distance:boSiteMeasurementPositive_(station.distance,'Station distance',true),width:boSiteMeasurementPositive_(station.width,'Station width',true),checked:!!station.checked,recheckValue:station.recheckValue==null||station.recheckValue===''?null:boSiteMeasurementPositive_(station.recheckValue,'Recheck value',true),note:station.note||''};
    }).sort(function(a,b){return a.distance-b.distance;});
    boAssert_(stations.length>=2,'At least two width stations are required.');
    var tolerance=payload.tolerance==null?H38_SITE_MEASUREMENT.DEFAULT_TOLERANCE_FEET:boSiteMeasurementPositive_(payload.tolerance,'Tolerance',true),warnings=boSiteMeasurementBaselineWarnings_(baselineLength,stations,tolerance),sessionId=boSiteMeasurementId_('SMB');
    var checked=0,failedCheck=false;
    stations.forEach(function(station){
      if(station.checked&&station.recheckValue!=null){checked+=1;if(Math.abs(station.width-station.recheckValue)>tolerance)failedCheck=true;}
    });
    var confidence=failedCheck||warnings.some(function(w){return /outside|duplicate|does not reach/.test(w.toLowerCase());})?'NEEDS_REMEASUREMENT':checked?'FIELD_MEASURED_AND_CHECKED':'FIELD_MEASURED';
    boSiteMeasurementAppendMeasurement_(projectId,subquoteId,{area:area.Title,measurementType:'baseline_length',value:baselineLength,units:units,sourceType:payload.sourceType||'Verified field measurement',sourceId:sessionId,verificationStatus:checked?'Checked':'Unverified',confidence:confidence,kind:'baseline',meta:{sessionId:sessionId,description:payload.baselineDescription||'',tool:payload.tool||'',tolerance:tolerance,warnings:warnings}});
    stations.forEach(function(station){
      boSiteMeasurementAppendMeasurement_(projectId,subquoteId,{area:area.Title,measurementType:'baseline_station_width',value:station.width,units:units,sourceType:payload.sourceType||'Verified field measurement',sourceId:sessionId,verificationStatus:station.checked?'Checked':'Unverified',confidence:confidence,kind:'baseline_station',meta:station});
    });
    if(payload.exposedPerimeter!==undefined&&payload.exposedPerimeter!=='')boSiteMeasurementAppendMeasurement_(projectId,subquoteId,{area:area.Title,measurementType:'exposed_perimeter',value:boSiteMeasurementPositive_(payload.exposedPerimeter,'Exposed perimeter',true),units:units,sourceType:payload.sourceType||'Verified field measurement',sourceId:sessionId,verificationStatus:'Unverified',confidence:confidence,kind:'perimeter',meta:{sessionId:sessionId}});
    var result=boSiteMeasurementBaselineArea_(stations);
    boSiteMeasurementAppendCalculation_(projectId,subquoteId,{calculationType:'Outdoor baseline area',inputs:{baselineLength:baselineLength,stations:stations,sessionId:sessionId},formula:'Σ (((width1 + width2) / 2) × station distance)',result:result,units:'sq ft',sourceStatus:boSiteMeasurementSourceStatus_(payload.sourceType||'Verified field measurement',confidence),approvalStatus:confidence==='NEEDS_REMEASUREMENT'?'Review Required':'Calculation Prepared'});
    boSiteMeasurementUpdateAreaOptions_(area,{measurementMethods:['Baseline and widths'],measurementConfidence:confidence,warnings:warnings,lastMeasurementSessionId:sessionId,lastMeasuredAt:boNow_(),lastMeasuredBy:access.user.email});
    boProof_('SAVE BASELINE MEASUREMENT','Subquote',subquoteId,confidence==='NEEDS_REMEASUREMENT'?'HOLD':'PASS',result+' sq ft; '+warnings.length+' warning(s).',access.user.email);
    return boSiteMeasurementGetArea(projectId,subquoteId);
  },'Subquote',subquoteId);
}

function boSiteMeasurementPolygonArea_(points){
  var total=0;
  for(var i=0;i<points.length;i+=1){var next=(i+1)%points.length;total+=points[i].x*points[next].y-points[next].x*points[i].y;}
  return Math.abs(total)/2;
}
