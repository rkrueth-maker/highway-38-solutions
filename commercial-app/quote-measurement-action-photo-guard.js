(function(){
'use strict';
const BUILD='20260814-quote-measurement-action-photo-guard-4';
const Bridge=window.H38Bridge;
const shared=window.H38_SUPABASE_SHARED_CLIENT;
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
function uniqueMeasurements(items){
  const seen=new Set();
  return items.map(compactMeasurement).filter(Boolean).filter(item=>{
    const key=[item.measurementId,item.label,item.value,item.unit,item.source,item.verificationStatus].join('|');
    if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,80);
}
function linkedMeasurementEvidence(args){
  const supplied=uniqueMeasurements([
    ...(Array.isArray(args?.measurementEvidence)?args.measurementEvidence:[]),
    ...(Array.isArray(args?.siteMeasurements)?args.siteMeasurements:[])
  ]);
  if(supplied.length)return supplied;
  const quoteId=text(args?.quoteId).trim();
  if(!quoteId)return[];
  const quote=rows('quotes').find(row=>text(valueOf(row,'Quote ID','quoteId'))===quoteId);
  const sessionId=text(valueOf(quote,'Site Scanner Session ID','siteScannerSessionId')).trim();
  const all=[...rows('siteMeasurements'),...rows('measurements')];
  return uniqueMeasurements(all.filter(row=>{
    const rowQuote=text(valueOf(row,'Quote ID','quoteId'));
    const rowSession=text(valueOf(row,'Capture Session ID','captureSessionId'));
    return (sessionId&&rowSession===sessionId)||rowQuote===quoteId;
  }));
}
async function liveMeasurementEvidence(args){
  const quoteId=text(args?.quoteId).trim(),businessId=text(args?.businessId||window.state?.businessId).trim();
  if(!quoteId||!businessId)return[];
  const api=shared?.ensure?.();
  if(!api)return[];
  const quote=rows('quotes').find(row=>text(valueOf(row,'Quote ID','quoteId'))===quoteId);
  const sessionId=text(valueOf(quote,'Site Scanner Session ID','siteScannerSessionId')).trim();
  try{
    const result=await api.from('business_records').select('record_key,payload,updated_at').eq('business_id',businessId).eq('collection','siteMeasurements').eq('record_status','active').order('updated_at',{ascending:false}).limit(500);
    if(result.error)throw result.error;
    return uniqueMeasurements((result.data||[]).map(row=>row?.payload||{}).filter(payload=>{
      const rowQuote=text(valueOf(payload,'Quote ID','quoteId'));
      const rowSession=text(valueOf(payload,'Capture Session ID','captureSessionId'));
      return rowQuote===quoteId||(sessionId&&rowSession===sessionId);
    }));
  }catch(error){
    console.warn('[H38 Quote measurement guard] live measurement hydration failed',error);
    return[];
  }
}
function materialBreakoutInstructions(){return [
  'QUOTE COST BREAKOUT REQUIREMENT: Show material cost and labor cost as separate required quote lines whenever both are part of the scope. Do not hide materials inside a blended installed rate.',
  'For sheetrock/drywall, create separate lines for sheetrock/materials and for hanging/taping/finishing labor. For insulation, likewise separate insulation material from installation labor when both are included.',
  'MATERIAL ORDER ALLOWANCE: calculate purchase/order quantities at 110% of the measured installed material quantity (10% extra for waste, cuts, damage, and ordering allowance). Clearly state the measured quantity and the 10% allowance in the rationale.',
  'Labor quantities must use the actual installed/net work quantity, not the 110% material purchase quantity.',
  'If the Price Book only contains a blended installed material+labor price, do not use that blended row as the rate for a material-only or labor-only line. Use an appropriate separate Price Book row when available; otherwise use a clearly owner-review-required local-research or manual-required component rate.',
  'Keep all generated prices owner-review required. Never approve, send, purchase, pay, or financially commit automatically.'
].join('\n');}
function applyMaterialBreakoutPolicy(prepared){
  const policy=materialBreakoutInstructions(),existing=text(prepared.notes);
  if(!existing.includes('QUOTE COST BREAKOUT REQUIREMENT:'))prepared.notes=[existing,policy].filter(Boolean).join('\n\n');
  prepared.materialOrderAllowancePercent=10;
  prepared.separateMaterialAndLabor=true;
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
async function promoteActionPhotoSource(quoteId,selected){
  const api=shared?.ensure?.(),businessId=text(window.state?.businessId).trim();
  if(!api||!businessId||!quoteId||!selected)throw new Error('The selected Action Picture could not be prepared securely for rendering.');
  if(typeof window.sync==='function')await window.sync(false);
  const result=await api.from('business_records').select('record_key,payload').eq('business_id',businessId).eq('collection','documents').eq('record_status','active').limit(500);
  if(result.error)throw result.error;
  const candidates=(result.data||[]).filter(row=>{
    const payload=row?.payload||{};
    const sourceType=text(valueOf(payload,'Source Type','sourceType')).toLowerCase();
    const sourceId=text(valueOf(payload,'Source ID','sourceId'));
    const mime=text(valueOf(payload,'Mime Type','mimeType')).toLowerCase();
    const documentId=text(valueOf(payload,'Document ID','documentId'));
    const originalId=text(valueOf(payload,'Original Document ID','originalDocumentId'));
    return sourceType==='quote'&&sourceId===quoteId&&mime.startsWith('image/')&&(documentId===selected||originalId===selected);
  });
  if(!candidates.length)throw new Error('The selected Action Picture is not linked to this quote yet. Reopen the Site Visit and finish it again before rendering.');
  const target=candidates[0],now=new Date().toISOString(),payload={...(target.payload||{}),'Action Picture':true,'Action Picture Source ID':selected,'Action Picture Selected Time':now,'Updated Time':now};
  const updated=await api.from('business_records').update({payload,updated_at:now}).eq('business_id',businessId).eq('collection','documents').eq('record_key',target.record_key);
  if(updated.error)throw updated.error;
  return text(target.record_key);
}
Bridge.prototype.request=async function(action,args,timeout){
  if(action==='aiBuildQuoteDraft'){
    const prepared={...(args||{})};
    applyMaterialBreakoutPolicy(prepared);
    let evidence=linkedMeasurementEvidence(prepared);
    const live=await liveMeasurementEvidence(prepared);
    if(live.length)evidence=live;
    if(evidence.length){
      prepared.measurementEvidence=evidence;
      prepared.siteMeasurements=evidence;
    }
    const result=await previousRequest.call(this,action,prepared,timeout);
    const quoteId=text(prepared.quoteId).trim();
    if(!actionPhotoId(quoteId,prepared))return skipRender(result);
    return result;
  }
  if(action==='aiRenderQuoteConcept'){
    const prepared={...(args||{})},quoteId=text(prepared.quoteId).trim(),selected=actionPhotoId(quoteId,prepared);
    if(!selected)return{status:'PASS',renderStatus:'SKIPPED_NO_ACTION_PHOTO',renderedConcepts:[],actionPhotoRequiredForRender:true,ownerReviewRequired:true,externalActionOccurred:false};
    prepared.actionPhotoDocumentId=selected;
    prepared.actionPhotoQuoteLinkId=await promoteActionPhotoSource(quoteId,selected);
    return previousRequest.call(this,action,prepared,timeout);
  }
  return previousRequest.call(this,action,args,timeout);
};
window.H38_QUOTE_MEASUREMENT_ACTION_PHOTO_GUARD=Object.freeze({
  build:BUILD,
  linkedMeasurementHydrationRestored:true,
  acceptsSiteMeasurementsPayload:true,
  liveSupabaseMeasurementHydration:true,
  measurementEvidencePassedToQuoteAi:true,
  separateMaterialAndLabor:true,
  materialOrderAllowancePercent:10,
  noBlendedInstalledRateForSeparatedComponents:true,
  noAutomaticRenderWithoutActionPhoto:true,
  actionPhotoRequiredForRender:true,
  selectedActionPhotoPromotedAsRenderSource:true,
  selectedActionPhotoMustBeLinkedToQuote:true,
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticFinancialAction:false
});
})();
