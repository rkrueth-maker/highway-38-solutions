function boSiteMeasurementSaveRoom(projectId,subquoteId,payload){
  return boSafeExecute_('Save indoor room measurement',function(){
    var access=boQuoteBuilderRequireAction_('Edit');payload=payload||{};var area=boSiteMeasurementArea_(projectId,subquoteId),method=payload.method||'Tape measure',sourceType=payload.sourceType||method,sessionId=boSiteMeasurementId_('SMR');
    var length=boSiteMeasurementPositive_(payload.length,'Room length'),width=boSiteMeasurementPositive_(payload.width,'Room width'),height=boSiteMeasurementPositive_(payload.height,'Ceiling height');
    var openings=(Array.isArray(payload.openings)?payload.openings:[]).map(function(opening,index){
      return{type:opening.type||'opening',width:boSiteMeasurementPositive_(opening.width,'Opening '+(index+1)+' width'),height:boSiteMeasurementPositive_(opening.height,'Opening '+(index+1)+' height'),count:Math.max(1,Math.round(boSiteMeasurementPositive_(opening.count||1,'Opening count'))),verified:!!opening.verified,critical:!!opening.critical};
    });
    var floorArea=length*width,perimeter=2*(length+width),grossWallArea=perimeter*height,openingArea=0,trimDeduction=0,criticalUnchecked=false;
    openings.forEach(function(opening){openingArea+=opening.width*opening.height*opening.count;if(/door|passage/i.test(opening.type))trimDeduction+=opening.width*opening.count;if(opening.critical&&!opening.verified)criticalUnchecked=true;});
    var netWallArea=Math.max(0,grossWallArea-openingArea),baseboardLength=Math.max(0,perimeter-trimDeduction),volume=floorArea*height;
    var ar=/\bAR\b|LiDAR/i.test(method+' '+sourceType),checked=!!payload.checked,confidence=criticalUnchecked?'NEEDS_REMEASUREMENT':ar?(checked?'AR_CAPTURED_AND_CHECKED':'AR_CAPTURED'):(checked?'FIELD_MEASURED_AND_CHECKED':'FIELD_MEASURED');
    var warnings=[];if(criticalUnchecked)warnings.push('At least one quote-critical opening has not been verified.');if(ar&&!checked)warnings.push('AR-assisted room dimensions require the configured field checks before final use.');
    [['room_length',length,'ft'],['room_width',width,'ft'],['ceiling_height',height,'ft']].forEach(function(def){boSiteMeasurementAppendMeasurement_(projectId,subquoteId,{area:area.Title,measurementType:def[0],value:def[1],units:def[2],sourceType:sourceType,sourceId:sessionId,verificationStatus:checked?'Checked':'Unverified',confidence:confidence,kind:'room_dimension',meta:{sessionId:sessionId,method:method,device:payload.device||'',critical:true}});});
    openings.forEach(function(opening,index){boSiteMeasurementAppendMeasurement_(projectId,subquoteId,{area:area.Title,measurementType:'opening_'+opening.type,value:opening.width*opening.height*opening.count,units:'sq ft',sourceType:sourceType,sourceId:sessionId,verificationStatus:opening.verified?'Checked':'Unverified',confidence:confidence,kind:'room_opening',meta:{sessionId:sessionId,index:index+1,opening:opening}});});
    var calculations=[
      ['Indoor floor area',{length:length,width:width},'length × width',floorArea,'sq ft'],
      ['Indoor room perimeter',{length:length,width:width},'2 × (length + width)',perimeter,'linear ft'],
      ['Gross wall area',{perimeter:perimeter,height:height},'perimeter × ceiling height',grossWallArea,'sq ft'],
      ['Opening deduction',{openings:openings},'Σ (opening width × height × count)',openingArea,'sq ft'],
      ['Net wall area',{grossWallArea:grossWallArea,openingArea:openingArea},'gross wall area - opening area',netWallArea,'sq ft'],
      ['Ceiling area',{length:length,width:width},'length × width',floorArea,'sq ft'],
      ['Room volume',{floorArea:floorArea,height:height},'floor area × ceiling height',volume,'cu ft'],
      ['Baseboard path',{perimeter:perimeter,doorAndPassageWidth:trimDeduction},'perimeter - door and passage widths',baseboardLength,'linear ft']
    ];
    calculations.forEach(function(def){boSiteMeasurementAppendCalculation_(projectId,subquoteId,{calculationType:def[0],inputs:Object.assign({sessionId:sessionId},def[1]),formula:def[2],result:def[3],units:def[4],sourceStatus:boSiteMeasurementSourceStatus_(sourceType,checked?'Checked':'Unverified'),approvalStatus:confidence==='NEEDS_REMEASUREMENT'?'Review Required':'Calculation Prepared'});});
    boSiteMeasurementUpdateAreaOptions_(area,{environment:'Indoor',measurementMethods:[method],measurementConfidence:confidence,warnings:warnings,lastMeasurementSessionId:sessionId,lastMeasuredAt:boNow_(),lastMeasuredBy:access.user.email,deviceCapability:payload.deviceCapability||''});
    boProof_('SAVE INDOOR ROOM MEASUREMENT','Subquote',subquoteId,confidence==='NEEDS_REMEASUREMENT'?'HOLD':'PASS',floorArea+' sq ft floor; '+netWallArea+' sq ft net walls.',access.user.email);
    return boSiteMeasurementGetArea(projectId,subquoteId);
  },'Subquote',subquoteId);
}

function boSiteMeasurementRoundPackage_(raw,packageSize){
  var size=Number(packageSize||0);return size>0?Math.ceil(raw/size)*size:raw;
}
