function boSiteMeasurementAppendCalculation_(projectId,subquoteId,payload){
  payload=payload||{};
  var access=boUniversalUser_(),id=boSiteMeasurementId_('UQBC'),record=boUniversalAppend_('CALCULATIONS',{
    'Calculation ID':id,
    'Project ID':projectId,
    'Subquote ID':subquoteId||'',
    'Item ID':payload.itemId||'',
    'Calculation Type':payload.calculationType||'Site measurement',
    'Inputs JSON':boUniversalJsonText_(payload.inputs||{}),
    Formula:payload.formula||'',
    Result:boSiteMeasurementRound_(payload.result,3),
    Units:payload.units||'',
    Deterministic:'Yes',
    'Price Book Version':payload.priceBookVersion||'',
    'Source Status':payload.sourceStatus||'User supplied — verification pending',
    'Approval Status':payload.approvalStatus||'Calculation Prepared',
    'Created By':access.id
  });
  return record;
}
function boSiteMeasurementRows_(projectId,subquoteId){
  return boUniversalReadRows_('MEASUREMENTS').filter(function(row){
    return row['Project ID']===projectId&&(!subquoteId||row['Subquote ID']===subquoteId);
  });
}
function boSiteMeasurementCalculations_(projectId,subquoteId){
  return boUniversalReadRows_('CALCULATIONS').filter(function(row){
    return row['Project ID']===projectId&&(!subquoteId||row['Subquote ID']===subquoteId);
  });
}
function boSiteMeasurementSummary_(projectId){
  var areas=boUniversalReadRows_('SUBQUOTES').filter(function(row){
    return row['Project ID']===projectId&&H38_SITE_MEASUREMENT.AREA_TYPES.indexOf(row['Subquote Type'])>=0;
  });
  var counts={areas:areas.length,outdoor:0,indoor:0,needsRemeasurement:0,preliminary:0,checked:0};
  areas.forEach(function(area){
    var options=boSiteMeasurementAreaOptions_(area),environment=options.environment||'';
    if(environment==='Outdoor')counts.outdoor+=1;
    if(environment==='Indoor')counts.indoor+=1;
    if(options.measurementConfidence==='NEEDS_REMEASUREMENT')counts.needsRemeasurement+=1;
    if(options.measurementConfidence==='PRELIMINARY_ESTIMATE')counts.preliminary+=1;
    if(/_AND_CHECKED$|IMPORTED_VERIFIED/.test(options.measurementConfidence||''))counts.checked+=1;
  });
  return{areas:areas.map(function(area){
    var options=boSiteMeasurementAreaOptions_(area);
    return{
      subquoteId:area['Subquote ID'],name:area.Title,areaCode:options.areaCode||area['Area / System / Trade / Phase / Assembly'],
      areaType:area['Subquote Type'],environment:options.environment||'',workTypes:options.workTypes||[],
      measurementMethods:options.measurementMethods||[],measurementConfidence:options.measurementConfidence||'NEEDS_REMEASUREMENT',
      warningCount:(options.warnings||[]).length,approvalStatus:area['Approval Status'],status:area.Status
    };
  }),counts:counts};
}

function boSiteMeasurementCatalog(){
  boQuoteBuilderRequireAction_('View');
  return{
    status:'PASS',version:H38_SITE_MEASUREMENT.VERSION,
    environments:H38_SITE_MEASUREMENT.ENVIRONMENTS,
    areaTypes:H38_SITE_MEASUREMENT.AREA_TYPES,
    methods:H38_SITE_MEASUREMENT.METHODS,
    confidenceStatuses:H38_SITE_MEASUREMENT.CONFIDENCE,
    shapes:H38_SITE_MEASUREMENT.SHAPES,
    calculators:H38_SITE_MEASUREMENT.CALCULATORS,
    arPolicy:{outdoorPrimary:false,indoorAssisted:true,criticalVerificationRequired:true,nativeRoomCapturePhase:'Phase 2',browserCapabilityDetection:true},
    externalActionsPerformed:false
  };
}
function boSiteMeasurementGetProject(projectId){
  boQuoteBuilderRequireAction_('View');
  var project=boUniversalGetProject(projectId),summary=boSiteMeasurementSummary_(projectId);
  project.siteMeasurement={version:H38_SITE_MEASUREMENT.VERSION,areas:summary.areas,counts:summary.counts,externalActionsPerformed:false};
  return project;
}
function boSiteMeasurementGetArea(projectId,subquoteId){
  boQuoteBuilderRequireAction_('View');
  var area=boSiteMeasurementArea_(projectId,subquoteId),options=boSiteMeasurementAreaOptions_(area);
  return{
    status:'PASS',projectId:projectId,area:area,options:options,
    measurements:boSiteMeasurementRows_(projectId,subquoteId),
    calculations:boSiteMeasurementCalculations_(projectId,subquoteId),
    validation:boSiteMeasurementValidateArea_(projectId,subquoteId,false),
    externalActionsPerformed:false
  };
}
