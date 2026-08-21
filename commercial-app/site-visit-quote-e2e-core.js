(function(root,factory){
'use strict';
const api=factory();
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.H38_SITE_VISIT_QUOTE_E2E_CORE=Object.freeze(api);
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:null),function(){
'use strict';
const BUILD='20260821-site-visit-quote-e2e-core-1';
const text=value=>String(value==null?'':value).trim();
const value=(row,...keys)=>{const source=row?.payload&&typeof row.payload==='object'?row.payload:row;for(const key of keys){if(source&&source[key]!==undefined&&source[key]!==null&&source[key]!=='')return source[key];}return'';};
const normalize=value=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
function normalizeRotation(value){const number=Number(value);if(!Number.isFinite(number))return 0;const rounded=Math.round(number/90)*90;return((rounded%360)+360)%360;}
function rotationInstruction(value){const rotation=normalizeRotation(value);if(rotation===90)return'Rotate the source image 90 degrees clockwise before visual editing. Preserve the corrected landscape/portrait orientation.';if(rotation===180)return'Rotate the source image 180 degrees before visual editing. Preserve the corrected orientation.';if(rotation===270)return'Rotate the source image 90 degrees counterclockwise before visual editing. Preserve the corrected landscape/portrait orientation.';return'Use the source image in its stored orientation.';}
function resolveActionPictureId({quoteId,args={},quote=null,documents=[],map={},visit=null}={}){
  const explicit=text(args.actionPhotoDocumentId||args.actionPictureId);if(explicit)return explicit;
  const saved=text(value(quote,'Action Picture ID','actionPictureId'));if(saved)return saved;
  const mapped=text(map?.[quoteId]);if(mapped)return mapped;
  if(visit&&text(visit.quoteId)===text(quoteId)){const current=text(visit.actionPictureId);if(current)return current;}
  const linked=(Array.isArray(documents)?documents:[]).find(row=>{
    const sourceType=text(value(row,'Source Type','sourceType')).toLowerCase(),sourceId=text(value(row,'Source ID','sourceId'));
    if(sourceType!=='quote'||sourceId!==text(quoteId))return false;
    return value(row,'Action Picture','actionPicture')===true||Boolean(text(value(row,'Action Picture Source ID','actionPictureSourceId','Original Document ID','originalDocumentId')));
  });
  return text(value(linked,'Action Picture Source ID','actionPictureSourceId','Original Document ID','originalDocumentId','Document ID','documentId'));
}
function actionPictureRotation({quoteId,sourceId,quote=null,documents=[]}={}){
  const quoteRotation=value(quote,'Action Picture Rotation Degrees','actionPictureRotationDegrees');if(quoteRotation!==''&&quoteRotation!==null&&quoteRotation!==undefined)return normalizeRotation(quoteRotation);
  const source=text(sourceId);const row=(Array.isArray(documents)?documents:[]).find(item=>{
    const doc=text(value(item,'Document ID','documentId')),original=text(value(item,'Original Document ID','originalDocumentId')),action=text(value(item,'Action Picture Source ID','actionPictureSourceId')),q=text(value(item,'Source ID','sourceId'));
    return(doc===source||original===source||action===source)&&(q===text(quoteId)||text(value(item,'Source Type','sourceType')).toLowerCase()==='site visit');
  });
  return normalizeRotation(value(row,'Action Picture Rotation Degrees','actionPictureRotationDegrees','Image Rotation Degrees','imageRotationDegrees','rotationDegrees'));
}
function projectScopeText(project={}){return[project.projectTitle,project.scope,project.ownerWorkRequest].map(text).filter(Boolean).join(' ').toLowerCase();}
function scopeRequiresTarget(project,target){const scope=projectScopeText(project);if(target==='insulation')return/\binsulat(e|ion|ing)\b/.test(scope);if(target==='drywall')return/\b(sheet\s*rock|sheetrock|drywall)\b/.test(scope);return false;}
function quantityOf(line){const n=Number(line?.quantity);return Number.isFinite(n)?n:0;}
function rateOf(line){const n=Number(line?.rate??line?.unitPrice);return Number.isFinite(n)?n:0;}
function ownerEditableRate(line){const source=text(line?.priceSource).toLowerCase(),review=line?.ownerReviewRequired===true||text(line?.ownerReviewRequired).toLowerCase()==='true';return rateOf(line)<=0&&(source==='manual_required'||review);}
function blockingProblems(lines,project={}){
  const list=Array.isArray(lines)?lines:[],problems=[];
  const invalid=list.filter(line=>quantityOf(line)<=0);if(invalid.length)problems.push(`non-positive quantity: ${invalid.map(line=>text(line?.description)).filter(Boolean).slice(0,6).join('; ')}`);
  const blockedRate=list.filter(line=>rateOf(line)<=0&&!ownerEditableRate(line));if(blockedRate.length)problems.push(`non-positive non-editable rate: ${blockedRate.map(line=>text(line?.description)).filter(Boolean).slice(0,6).join('; ')}`);
  for(const target of['insulation','drywall'])if(scopeRequiresTarget(project,target)){
    const relevant=list.filter(line=>target==='insulation'?/\binsulat(e|ion|ing)\b/i.test(text(line?.description)):/\b(sheet\s*rock|sheetrock|drywall)\b/i.test(text(line?.description)));
    const hasMaterial=relevant.some(line=>/material/i.test(text(line?.costType))||/material|sheet|batt|board|gypsum/i.test(text(line?.description)));
    const hasLabor=relevant.some(line=>/labor|labour/i.test(text(line?.costType))||/^\s*(install|hang|finish|tape|place|fit)/i.test(text(line?.description)));
    if(!hasMaterial||!hasLabor)problems.push(`${target} material/labor separation missing`);
  }
  return problems;
}
return{build:BUILD,normalizeRotation,rotationInstruction,resolveActionPictureId,actionPictureRotation,projectScopeText,scopeRequiresTarget,ownerEditableRate,blockingProblems,policyTextIsNeverProjectScope:true,manualRequiredRatesRemainEditable:true,savedActionPictureSurvivesClosedVisit:true};
});
