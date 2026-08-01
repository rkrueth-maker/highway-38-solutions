/**
 * Highway 38 Site Measurement Wizard.
 *
 * Guided indoor and outdoor measurement workflows inside the existing
 * Universal Quote Builder and Business Office. Detailed capture metadata is
 * preserved in the existing UQB Measurements Notes field and deterministic
 * outputs are stored in UQB Calculations. No second app, database, approval
 * system, customer record, quote record, or external action is created.
 */
var H38_SITE_MEASUREMENT=Object.freeze({
  VERSION:'2026-07-31-site-measurement-v1',
  NOTE_MARKER:'H38_SITE_MEASUREMENT_V1',
  ENVIRONMENTS:Object.freeze(['Outdoor','Indoor','Mixed']),
  AREA_TYPES:Object.freeze([
    'OUTDOOR_ZONE','INDOOR_ROOM','INDOOR_HALL','INDOOR_STAIR',
    'INDOOR_OPEN_AREA','INDOOR_GARAGE_OR_SHOP','EXTERIOR_STRUCTURE_FACE',
    'MANUAL_QUANTITY_AREA'
  ]),
  METHODS:Object.freeze([
    'Baseline and widths','Simple shapes','Tape or laser polygon',
    'Tape measure','Laser distance meter','Measuring wheel',
    'AR room scan','AR point-to-point','LiDAR-assisted room capture',
    'Moasure import','Existing plan','Imported plan','Map estimate',
    'Customer-provided dimensions','Manual quantity'
  ]),
  CONFIDENCE:Object.freeze([
    'FIELD_MEASURED','FIELD_MEASURED_AND_CHECKED','AR_CAPTURED',
    'AR_CAPTURED_AND_CHECKED','IMPORTED_VERIFIED','PRELIMINARY_ESTIMATE',
    'NEEDS_REMEASUREMENT'
  ]),
  SHAPES:Object.freeze(['rectangle','triangle','trapezoid','circle','half_circle','polygon']),
  CALCULATORS:Object.freeze(['mulch','paint','flooring','drywall','trim']),
  FINAL_QUOTE_BLOCKING:Object.freeze(['NEEDS_REMEASUREMENT']),
  DEFAULT_TOLERANCE_FEET:0.25,
  AR_CRITICAL_TYPES:Object.freeze([
    'cabinet_run','countertop','appliance_opening','door_replacement',
    'window_replacement','rough_opening','stair','custom_fabrication',
    'plumbing_rough_in','electrical_clearance','hvac_connection'
  ])
});

function boSiteMeasurementText_(value){return String(value==null?'':value).trim();}
function boSiteMeasurementNumber_(value,label){
  var n=Number(value);
  boAssert_(isFinite(n),label+' must be a number.');
  return n;
}
function boSiteMeasurementPositive_(value,label,allowZero){
  var n=boSiteMeasurementNumber_(value,label);
  boAssert_(allowZero?n>=0:n>0,label+' must be '+(allowZero?'zero or greater':'greater than zero')+'.');
  return n;
}
function boSiteMeasurementRound_(value,places){
  var power=Math.pow(10,places==null?3:places);
  return Math.round(Number(value||0)*power)/power;
}
function boSiteMeasurementId_(prefix){return boId_(prefix||'SM');}
function boSiteMeasurementMeta_(kind,payload){
  return JSON.stringify({marker:H38_SITE_MEASUREMENT.NOTE_MARKER,kind:kind,data:payload||{}});
}
function boSiteMeasurementParseMeta_(notes){
  var parsed=boUniversalJson_(notes,{});
  return parsed&&parsed.marker===H38_SITE_MEASUREMENT.NOTE_MARKER?parsed:null;
}
function boSiteMeasurementSourceStatus_(sourceType,verificationStatus){
  var source=boSiteMeasurementText_(sourceType).toLowerCase();
  var verification=boSiteMeasurementText_(verificationStatus).toLowerCase();
  if(source.indexOf('map')>=0||source.indexOf('customer')>=0||source.indexOf('estimate')>=0)return 'Preliminary estimate';
  if(verification.indexOf('conflict')>=0||verification.indexOf('failed')>=0)return 'Conflict — Review Required';
  if(verification.indexOf('verified')>=0||verification.indexOf('checked')>=0)return 'Verified field source';
  return 'User supplied — verification pending';
}
function boSiteMeasurementArea_(projectId,subquoteId){
  var area=boUniversalFind_('SUBQUOTES',subquoteId);
  boAssert_(area['Project ID']===projectId,'The selected area does not belong to this project.');
  return area;
}
function boSiteMeasurementAreaOptions_(area){
  var options=boUniversalJson_(area['Options JSON'],{});
  if(Array.isArray(options))options={legacyOptions:options};
  return options||{};
}
function boSiteMeasurementUpdateAreaOptions_(area,patch){
  var options=boSiteMeasurementAreaOptions_(area),next=Object.assign({},options,patch||{});
  boUniversalUpdate_('SUBQUOTES',area['Subquote ID'],{'Options JSON':boUniversalJsonText_(next),'Approval Status':'Owner Approval Required','Updated Time':boNow_()});
  boUniversalUpdate_('PROJECTS',area['Project ID'],{'Consistency Status':'Review Required','Approval Status':'Owner Approval Required'});
  return next;
}
function boSiteMeasurementAppendMeasurement_(projectId,subquoteId,payload){
  payload=payload||{};
  var access=boUniversalUser_(),id=boSiteMeasurementId_('UQBM'),record=boUniversalAppend_('MEASUREMENTS',{
    'Measurement ID':id,
    'Project ID':projectId,
    'Subquote ID':subquoteId||'',
    'Area / Zone':payload.area||'',
    'Measurement Type':payload.measurementType||'',
    Value:payload.value,
    Units:payload.units||'',
    'Source Type':payload.sourceType||'Manual field entry',
    'Source ID':payload.sourceId||'',
    'Verification Status':payload.verificationStatus||'Unverified',
    Confidence:payload.confidence||'Not scored',
    Notes:boSiteMeasurementMeta_(payload.kind||'measurement',payload.meta||{}),
    Status:payload.status||'Active',
    'Created By':access.id
  });
  return record;
}
