function boSiteMeasurementShapeResult_(shape,dimensions){
  if(shape==='rectangle')return boSiteMeasurementPositive_(dimensions.length,'Length')*boSiteMeasurementPositive_(dimensions.width,'Width');
  if(shape==='triangle')return boSiteMeasurementPositive_(dimensions.base,'Base')*boSiteMeasurementPositive_(dimensions.height,'Height')/2;
  if(shape==='trapezoid')return(boSiteMeasurementPositive_(dimensions.sideA,'Side A')+boSiteMeasurementPositive_(dimensions.sideB,'Side B'))/2*boSiteMeasurementPositive_(dimensions.height,'Height');
  if(shape==='circle')return Math.PI*Math.pow(boSiteMeasurementPositive_(dimensions.radius,'Radius'),2);
  if(shape==='half_circle')return Math.PI*Math.pow(boSiteMeasurementPositive_(dimensions.radius,'Radius'),2)/2;
  if(shape==='polygon'){
    var points=Array.isArray(dimensions.points)?dimensions.points:[];boAssert_(points.length>=3,'A polygon requires at least three points.');
    points=points.map(function(point){return{x:boSiteMeasurementNumber_(point.x,'Point X'),y:boSiteMeasurementNumber_(point.y,'Point Y')};});
    return boSiteMeasurementPolygonArea_(points);
  }
  throw new Error('Unsupported shape: '+shape);
}
function boSiteMeasurementShapeFormula_(shape){
  return{rectangle:'length × width',triangle:'(base × height) / 2',trapezoid:'((sideA + sideB) / 2) × height',circle:'π × radius²',half_circle:'(π × radius²) / 2',polygon:'shoelace formula'}[shape]||'';
}
function boSiteMeasurementSaveShape(projectId,subquoteId,payload){
  return boSafeExecute_('Save measured shape',function(){
    var access=boQuoteBuilderRequireAction_('Edit');payload=payload||{};var area=boSiteMeasurementArea_(projectId,subquoteId),shape=boSiteMeasurementText_(payload.shape);
    boAssert_(H38_SITE_MEASUREMENT.SHAPES.indexOf(shape)>=0,'Unsupported shape.');
    var dimensions=payload.dimensions||{},result=boSiteMeasurementRound_(boSiteMeasurementShapeResult_(shape,dimensions),3),role=payload.role==='exclusion'?'exclusion':'add',sessionId=boSiteMeasurementId_('SMS');
    var sourceType=payload.sourceType||'Verified field measurement',verificationStatus=payload.verificationStatus||'Unverified';
    var confidence=/map|customer|estimate/i.test(sourceType)?'PRELIMINARY_ESTIMATE':/conflict|failed/i.test(verificationStatus)?'NEEDS_REMEASUREMENT':/verified|checked/i.test(verificationStatus)?'FIELD_MEASURED_AND_CHECKED':'FIELD_MEASURED';
    boSiteMeasurementAppendMeasurement_(projectId,subquoteId,{area:area.Title,measurementType:'shape_'+shape,value:result,units:'sq ft',sourceType:sourceType,sourceId:sessionId,verificationStatus:verificationStatus,confidence:confidence,kind:'shape',meta:{sessionId:sessionId,shape:shape,role:role,dimensions:dimensions,label:payload.label||'',critical:!!payload.critical}});
    boSiteMeasurementAppendCalculation_(projectId,subquoteId,{calculationType:'Measured '+shape+' area',inputs:{shape:shape,role:role,dimensions:dimensions,sessionId:sessionId},formula:boSiteMeasurementShapeFormula_(shape),result:role==='exclusion'?-result:result,units:'sq ft',sourceStatus:boSiteMeasurementSourceStatus_(sourceType,verificationStatus),approvalStatus:confidence==='NEEDS_REMEASUREMENT'?'Review Required':'Calculation Prepared'});
    boSiteMeasurementUpdateAreaOptions_(area,{measurementMethods:['Simple shapes'],measurementConfidence:confidence,warnings:confidence==='PRELIMINARY_ESTIMATE'?['This shape is a preliminary estimate.']:confidence==='NEEDS_REMEASUREMENT'?['This shape requires remeasurement.']:[],lastMeasurementSessionId:sessionId,lastMeasuredAt:boNow_(),lastMeasuredBy:access.user.email});
    boProof_('SAVE SHAPE MEASUREMENT','Subquote',subquoteId,confidence==='NEEDS_REMEASUREMENT'?'HOLD':'PASS',shape+' '+result+' sq ft ('+role+').',access.user.email);
    return boSiteMeasurementGetArea(projectId,subquoteId);
  },'Subquote',subquoteId);
}
