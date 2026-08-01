function boSiteMeasurementMaterialResult_(type,inputs){
  var waste=Math.max(0,Number(inputs.wasteFactor||0));
  if(type==='mulch'){
    var area=boSiteMeasurementPositive_(inputs.areaSqFt,'Area'),depth=boSiteMeasurementPositive_(inputs.depthIn,'Depth'),raw=area*(depth/12)/27,withWaste=raw*(1+waste),rounded=boSiteMeasurementRoundPackage_(withWaste,Number(inputs.roundingYards||0.5));
    return{result:boSiteMeasurementRound_(rounded,2),units:'cubic yards',formula:'area × (depth / 12) ÷ 27 × (1 + waste)',details:{rawCubicYards:boSiteMeasurementRound_(raw,3),withWaste:boSiteMeasurementRound_(withWaste,3),finalOrder:boSiteMeasurementRound_(rounded,2)}};
  }
  if(type==='paint'){
    var paintArea=boSiteMeasurementPositive_(inputs.areaSqFt,'Paintable area'),coats=boSiteMeasurementPositive_(inputs.coats||2,'Coats'),coverage=boSiteMeasurementPositive_(inputs.coverageSqFtPerGallon||350,'Coverage'),gallons=paintArea*coats/coverage*(1+waste),paintRounded=boSiteMeasurementRoundPackage_(gallons,Number(inputs.packageSizeGallons||1));
    return{result:boSiteMeasurementRound_(paintRounded,2),units:'gallons',formula:'area × coats ÷ coverage × (1 + waste)',details:{rawGallons:boSiteMeasurementRound_(gallons,3),finalOrder:boSiteMeasurementRound_(paintRounded,2)}};
  }
  if(type==='flooring'){
    var floorArea=boSiteMeasurementPositive_(inputs.areaSqFt,'Floor area'),order=floorArea*(1+waste),packageCoverage=boSiteMeasurementPositive_(inputs.packageCoverageSqFt||1,'Package coverage'),packages=Math.ceil(order/packageCoverage);
    return{result:packages,units:'packages',formula:'CEILING(area × (1 + waste) ÷ package coverage)',details:{orderSqFt:boSiteMeasurementRound_(order,2),packages:packages,coveredSqFt:boSiteMeasurementRound_(packages*packageCoverage,2)}};
  }
  if(type==='drywall'){
    var surface=boSiteMeasurementPositive_(inputs.areaSqFt,'Drywall area'),layers=boSiteMeasurementPositive_(inputs.layers||1,'Layer count'),sheetArea=boSiteMeasurementPositive_(inputs.sheetAreaSqFt||32,'Sheet area'),sheets=Math.ceil(surface*layers*(1+waste)/sheetArea);
    return{result:sheets,units:'sheets',formula:'CEILING(area × layers × (1 + waste) ÷ sheet area)',details:{sheets:sheets,coveredSqFt:boSiteMeasurementRound_(sheets*sheetArea,2)}};
  }
  if(type==='trim'){
    var linear=boSiteMeasurementPositive_(inputs.linearFeet,'Trim length'),stock=boSiteMeasurementPositive_(inputs.stockLengthFeet||16,'Stock length'),pieces=Math.ceil(linear*(1+waste)/stock);
    return{result:pieces,units:'pieces',formula:'CEILING(linear feet × (1 + waste) ÷ stock length)',details:{orderLinearFeet:boSiteMeasurementRound_(linear*(1+waste),2),pieces:pieces,stockLengthFeet:stock}};
  }
  throw new Error('Unsupported material calculator: '+type);
}
function boSiteMeasurementSaveMaterial(projectId,subquoteId,payload){
  return boSafeExecute_('Save material quantity calculation',function(){
    var access=boQuoteBuilderRequireAction_('Edit');payload=payload||{};var area=boSiteMeasurementArea_(projectId,subquoteId),type=boSiteMeasurementText_(payload.calculatorType);
    boAssert_(H38_SITE_MEASUREMENT.CALCULATORS.indexOf(type)>=0,'Unsupported material calculator.');
    var output=boSiteMeasurementMaterialResult_(type,payload.inputs||{}),record=boSiteMeasurementAppendCalculation_(projectId,subquoteId,{calculationType:'Material quantity — '+type,inputs:{calculatorType:type,inputs:payload.inputs||{},details:output.details},formula:output.formula,result:output.result,units:output.units,sourceStatus:payload.sourceStatus||'Derived from approved measurement inputs',approvalStatus:'Calculation Prepared'});
    boSiteMeasurementUpdateAreaOptions_(area,{lastMaterialCalculator:type,lastMaterialCalculationId:record['Calculation ID'],lastCalculatedAt:boNow_(),lastCalculatedBy:access.user.email});
    boProof_('CALCULATE SITE MATERIAL QUANTITY','Subquote',subquoteId,'PASS',type+' = '+output.result+' '+output.units+'.',access.user.email);
    return{status:'PASS',calculation:record,output:output,area:boSiteMeasurementGetArea(projectId,subquoteId),externalActionsPerformed:false};
  },'Subquote',subquoteId);
}
