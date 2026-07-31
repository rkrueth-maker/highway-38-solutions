function boSiteMeasurementCreateArea(projectId,payload){
  return boSafeExecute_('Create Site Measurement area',function(){
    var access=boQuoteBuilderRequireAction_('Create');payload=payload||{};boUniversalEnsureStore_();boUniversalFind_('PROJECTS',projectId);
    var areaType=boSiteMeasurementText_(payload.areaType||'OUTDOOR_ZONE'),environment=boSiteMeasurementText_(payload.environment||'Outdoor');
    boAssert_(H38_SITE_MEASUREMENT.AREA_TYPES.indexOf(areaType)>=0,'Unsupported measurement area type.');
    boAssert_(H38_SITE_MEASUREMENT.ENVIRONMENTS.indexOf(environment)>=0,'Unsupported project environment.');
    boAssert_(boSiteMeasurementText_(payload.name),'Area or room name is required.');
    var existing=boUniversalReadRows_('SUBQUOTES').filter(function(row){return row['Project ID']===projectId;}),id=boSiteMeasurementId_('UQBA');
    var options={
      measurementWizard:'Site Measurement Wizard',environment:environment,areaCode:payload.areaCode||'',
      floorOrLevel:payload.floorOrLevel||'',workTypes:Array.isArray(payload.workTypes)?payload.workTypes:[],
      measurementMethods:Array.isArray(payload.measurementMethods)?payload.measurementMethods:[],
      measurementConfidence:'NEEDS_REMEASUREMENT',criticality:payload.criticality||'Normal',warnings:['No approved measurements recorded yet.'],
      customerVisible:payload.customerVisible!==false
    };
    boUniversalAppend_('SUBQUOTES',{
      'Subquote ID':id,'Project ID':projectId,'Parent Subquote ID':'','Existing Quote ID':'',Sequence:payload.sequence||existing.length+1,
      'Subquote Type':areaType,Title:payload.name,'Area / System / Trade / Phase / Assembly':payload.areaCode||payload.floorOrLevel||'',
      'Customer Scope':payload.customerScope||'','Internal Instructions':payload.internalInstructions||'',
      'Quality Requirements':payload.qualityRequirements||'','Evidence Requirements':payload.evidenceRequirements||'Capture required measurements and supporting site photos.',
      'Completion Criteria':payload.completionCriteria||'Required measurements are complete, reviewed, and quote-ready.',
      'Change Conditions':payload.changeConditions||'Changed site conditions or dimensions require recalculation and review.',
      Assumptions:payload.assumptions||'',Exclusions:payload.exclusions||'','Options JSON':boUniversalJsonText_(options),
      'Internal Cost':0,'Customer Price':0,'Customer Visible':boUniversalYesNo_(payload.customerVisible!==false),Selected:'Yes',
      'Revision Number':1,'Approval Status':'Owner Approval Required',Status:'Draft','Created By':access.user.id
    });
    boUniversalUpdate_('PROJECTS',projectId,{'Consistency Status':'Review Required','Approval Status':'Owner Approval Required'});
    boProof_('CREATE SITE MEASUREMENT AREA','Subquote',id,'PASS',environment+' '+areaType+' — '+payload.name,access.user.email);
    return boSiteMeasurementGetProject(projectId);
  },'Project',projectId);
}

function boSiteMeasurementBaselineArea_(stations){
  var area=0;
  for(var i=0;i<stations.length-1;i+=1){
    var a=stations[i],b=stations[i+1];
    area+=((a.width+b.width)/2)*(b.distance-a.distance);
  }
  return boSiteMeasurementRound_(area,3);
}
function boSiteMeasurementBaselineWarnings_(baselineLength,stations,tolerance){
  var warnings=[];
  if(stations.length<2)warnings.push('At least two stations are required.');
  if(stations.length&&stations[0].distance!==0)warnings.push('The first station should normally begin at zero feet.');
  if(stations.length&&stations[stations.length-1].distance<baselineLength-tolerance)warnings.push('The final station does not reach the recorded baseline length.');
  for(var i=0;i<stations.length;i+=1){
    if(stations[i].distance<0||stations[i].distance>baselineLength+tolerance)warnings.push('Station '+(i+1)+' is outside the baseline.');
    if(i&&stations[i].distance===stations[i-1].distance)warnings.push('Duplicate station distance at '+stations[i].distance+' feet.');
    if(i&&Math.abs(stations[i].width-stations[i-1].width)>5)warnings.push('Width changes by more than five feet between stations '+i+' and '+(i+1)+'.');
  }
  return warnings;
}
