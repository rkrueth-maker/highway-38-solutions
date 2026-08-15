(function(){
'use strict';
const BUILD='20260814-quote-measurement-action-photo-guard-1';
const Bridge=window.H38Bridge;
if(!Bridge||!Bridge.prototype)return;
const previousRequest=Bridge.prototype.request;
const text=value=>String(value==null?'':value);
function valueOf(row,...keys){for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';}
function rows(name){const list=window.state?.snapshot?.[name];return Array.isArray(list)?list:[];}
function compactMeasurement(row){
  const value=Number(valueOf(row,'Value','value'));
  const label=text(valueOf(row,'Label','label')).trim();
  if(!label||!Number.isFinite(value)||value<=0)return null;
  return{
    measurementId:text(valueOf(row,'Site Measurement ID','measurementId','Measurement ID')),
    label,
    value,
    unit:text(valueOf(row,'Unit','unit')||'in'),
    source:text(valueOf(row,'Source','source')),
    verificationStatus:text(valueOf(row,'Verification Status','verificationStatus')||'UNVERIFIED'),
    notes:text(valueOf(row,'Notes','notes'))
  };
}
function linkedMeasurementEvidence(args){
  const supplied=Array.isArray(args?.measurementEvidence)?args.measurementEvidence.map(compactMeasurement).filter(Boolean):[];
  if(supplied.length)return supplied.slice(0,80);
  const quoteId=text(args?.quoteId).trim();
  if(!quoteId)return[];
  const quote=rows('quotes').find(row=>text(valueOf(row,'Quote ID','quoteId'))===quoteId);
  const sessionId=text(valueOf(quote,'Site Scanner Session ID','siteScannerSessionId')).trim();
  const all=[...rows('siteMeasurements'),...rows('measurements')];
  const seen=new Set();
  return all.filter(row=>{
    const rowQuote=text(valueOf(row,'Quote ID','quoteId'));
    const rowSession=text(valueOf(row,'Capture Session ID','captureSessionId'));
    return (sessionId&&rowSession===sessionId)||rowQuote===quoteId;
  }).map(compactMeasurement).filter(Boolean).filter(item=>{
    const key=[item.measurementId,item.label,item.value,item.unit,item.source,item.verificationStatus].join('|');
    if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,80);
}
function actionPhotoMap(){return window.H38_QUOTE_ACTION_PHOTO_BY_QUOTE||(window.H38_QUOTE_ACTION_PHOTO_BY_QUOTE=Object.create(null));}
function actionPhotoId(quoteId,args){
  const explicit=text(args?.actionPhotoDocumentId).trim();if(explicit)return explicit;
  const mapped=text(actionPhotoMap()[quoteId]).trim();if(mapped)return mapped;
  const visit=window.H38_FIELD_VISIT_CORE?.state?.visit;
  if(visit&&text(visit.quoteId)===quoteId)return text(visit.actionPictureId).trim();
  return'';
}
function skipRender(result){
  if(!result||typeof result!=='object')return result;
  return{...result,photoCount:0,renderStatus:'SKIPPED_NO_ACTION_PHOTO',actionPhotoRequiredForRender:true};
}
Bridge.prototype.request=async function(action,args,timeout){
  if(action==='aiBuildQuoteDraft'){
    const prepared={...(args||{})};
    const evidence=linkedMeasurementEvidence(prepared);
    if(evidence.length)prepared.measurementEvidence=evidence;
    const result=await previousRequest.call(this,action,prepared,timeout);
    const quoteId=text(prepared.quoteId).trim();
    if(!actionPhotoId(quoteId,prepared))return skipRender(result);
    return result;
  }
  if(action==='aiRenderQuoteConcept'){
    const prepared={...(args||{})},quoteId=text(prepared.quoteId).trim(),selected=actionPhotoId(quoteId,prepared);
    if(!selected)return{status:'PASS',renderStatus:'SKIPPED_NO_ACTION_PHOTO',renderedConcepts:[],actionPhotoRequiredForRender:true,ownerReviewRequired:true,externalActionOccurred:false};
    prepared.actionPhotoDocumentId=selected;
    return previousRequest.call(this,action,prepared,timeout);
  }
  return previousRequest.call(this,action,args,timeout);
};
window.H38_QUOTE_MEASUREMENT_ACTION_PHOTO_GUARD=Object.freeze({
  build:BUILD,
  linkedMeasurementHydrationRestored:true,
  measurementEvidencePassedToQuoteAi:true,
  noAutomaticRenderWithoutActionPhoto:true,
  actionPhotoRequiredForRender:true,
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticFinancialAction:false
});
})();
