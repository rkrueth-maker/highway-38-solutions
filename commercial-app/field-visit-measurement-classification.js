(function(){
'use strict';
const BUILD='20260810-measurement-classification-2140';
const VERIFIED='OPERATOR_VERIFIED';
const UNVERIFIED='UNVERIFIED_SPOKEN';
const C=window.H38_FIELD_VISIT_CORE;
if(!C)return;
const text=v=>String(v==null?'':v);
function combined(item){return [item?.label,item?.valueText,item?.statement,item?.detail,item?.request].map(text).join(' ').trim()}
function isMaterialSpecification(item){
  const s=combined(item).toLowerCase();
  if(!s)return false;
  if(/\br\s*-?\s*\d{1,2}\b/.test(s)&&/(insulat|batt|fiberglass|mineral wool|wall|ceiling|wide|width)/.test(s))return true;
  if(/\b(r-value|sku|model(?: number)?|part number|gauge|capacity)\b/.test(s))return true;
  return false;
}
function isOperatorVerified(item){
  const status=text(item?.verificationStatus).toUpperCase();
  if(['OPERATOR_VERIFIED','VERIFIED_BY_OPERATOR','FIELD_VERIFIED','VERIFIED'].includes(status))return true;
  const s=combined(item).toLowerCase();
  if(/\b(?:verified|confirmed|measured)\b.{0,32}\b(?:tape(?: measure)?|laser|ar(?:core)?|lidar)\b/.test(s))return true;
  if(/\b(?:tape(?: measure)?|laser|ar(?:core)?|lidar)\b.{0,32}\b(?:verified|confirmed|measured)\b/.test(s))return true;
  return false;
}
function normalizeOne(item){
  if(!item||typeof item!=='object'||isMaterialSpecification(item))return null;
  const verified=isOperatorVerified(item);
  return Object.assign({},item,{
    verificationStatus:verified?VERIFIED:(text(item.verificationStatus)||UNVERIFIED),
    fieldVerified:verified||item.fieldVerified===true,
    verificationSource:verified?'OPERATOR_STATED_FIELD_MEASUREMENT':text(item.verificationSource||'WALKTHROUGH_NARRATION')
  });
}
function normalizeList(list){return (Array.isArray(list)?list:[]).map(normalizeOne).filter(Boolean)}
function normalizeSessionRow(row){
  if(!row||typeof row!=='object')return;
  for(const key of ['Walkthrough Spoken Measurements','walkthroughSpokenMeasurements']){
    if(Array.isArray(row[key]))row[key]=normalizeList(row[key]);
  }
}
function normalizeAll(){
  const v=C.state.visit;
  const sessions=window.state?.snapshot?.siteCaptureSessions;
  if(Array.isArray(sessions))sessions.forEach(normalizeSessionRow);
  if(!v)return;
  v.walkthroughSpokenMeasurements=normalizeList(v.walkthroughSpokenMeasurements);
  v.walkthroughMeasurementCandidates=normalizeList(v.walkthroughMeasurementCandidates);
  if(v.walkthroughVoice&&Array.isArray(v.walkthroughVoice.spokenMeasurements))v.walkthroughVoice.spokenMeasurements=normalizeList(v.walkthroughVoice.spokenMeasurements);
  if(v.walkthroughProfessionalNotes&&Array.isArray(v.walkthroughProfessionalNotes.spokenMeasurements))v.walkthroughProfessionalNotes.spokenMeasurements=normalizeList(v.walkthroughProfessionalNotes.spokenMeasurements);
}
function install(){
  if(C.state.__walkthroughMeasurementClassificationWrapped)return;
  const base=C.state.render;
  if(typeof base!=='function')return;
  C.state.__walkthroughMeasurementClassificationWrapped=true;
  C.setRender(function(){normalizeAll();base()});
  normalizeAll();
  C.state.render?.();
}
window.H38_FIELD_VISIT_MEASUREMENT_CLASSIFICATION=Object.freeze({
  build:BUILD,
  materialSpecificationsAreNotFieldMeasurements:true,
  operatorVerifiedSpokenDimensionsStayVerified:true,
  verifiedStatus:VERIFIED,
  unverifiedStatus:UNVERIFIED,
  normalizeList,
  isMaterialSpecification,
  isOperatorVerified
});
install();setTimeout(install,500);
})();
