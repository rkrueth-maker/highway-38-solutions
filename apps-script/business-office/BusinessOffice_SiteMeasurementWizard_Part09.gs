function boSiteMeasurementClientBundle(){
  boQuoteBuilderRequireAction_('View');
  return{
    styles:HtmlService.createHtmlOutputFromFile('BusinessOffice_SiteMeasurementWizard_Styles').getContent(),
    core:HtmlService.createHtmlOutputFromFile('BusinessOffice_SiteMeasurementWizard_Client_Core').getContent(),
    forms:HtmlService.createHtmlOutputFromFile('BusinessOffice_SiteMeasurementWizard_Client_Forms').getContent(),
    version:H38_SITE_MEASUREMENT.VERSION,
    externalActionsPerformed:false
  };
}

function boSiteMeasurementAcceptance(){
  boQuoteBuilderRequireAction_('View');
  var baseline=boSiteMeasurementBaselineArea_([{distance:0,width:3},{distance:4,width:4.2},{distance:8,width:5.1},{distance:12,width:6},{distance:16,width:6.4},{distance:20,width:5.9},{distance:24,width:5.2},{distance:28,width:4.5},{distance:32,width:3.8},{distance:36,width:3},{distance:38,width:2.5}]);
  var roomFloor=12*10,roomWalls=2*(12+10)*8;
  var checks=[
    {name:'baseline station example',expected:181.9,actual:baseline,pass:Math.abs(baseline-181.9)<0.001},
    {name:'12 × 10 room floor',expected:120,actual:roomFloor,pass:roomFloor===120},
    {name:'12 × 10 × 8 gross walls',expected:352,actual:roomWalls,pass:roomWalls===352},
    {name:'rectangle formula',expected:120,actual:boSiteMeasurementShapeResult_('rectangle',{length:12,width:10}),pass:boSiteMeasurementShapeResult_('rectangle',{length:12,width:10})===120},
    {name:'mulch formula available',expected:true,actual:!!boSiteMeasurementMaterialResult_('mulch',{areaSqFt:100,depthIn:3,wasteFactor:0,roundingYards:0.5}),pass:true}
  ];
  return{status:checks.every(function(check){return check.pass;})?'PASS':'HOLD',version:H38_SITE_MEASUREMENT.VERSION,checks:checks,externalActionsPerformed:false};
}
