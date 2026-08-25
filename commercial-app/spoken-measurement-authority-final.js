(function(){
'use strict';
const BUILD='20260825-spoken-measurement-authority-final-2';
const C=window.H38_FIELD_VISIT_CORE;if(!C)return;
const text=value=>String(value==null?'':value);
const UNVERIFIED='UNVERIFIED_SPOKEN';
function combined(item){return [item?.label,item?.valueText,item?.statement,item?.detail,item?.request,item?.value,item?.unit].map(text).join(' ').trim();}
function materialSpec(item){const s=combined(item).toLowerCase();return (/\br\s*-?\s*\d{1,2}\b/.test(s)&&/(insulat|batt|fiberglass|mineral wool|wide|width)/.test(s))||/\b(?:r-value|sku|model(?: number)?|part number|gauge|capacity)\b/.test(s);}
function dimension(item){if(Number(item?.value)>0&&text(item?.unit))return true;const s=combined(item);return /\b\d+(?:\.\d+)?\s*(?:ft|feet|foot|in|inch|inches|yd|yard|yards|lf|sf|["'])\b/i.test(s)||/\b\d+(?:\.\d+)?\s*(?:x|×|by)\s*\d+(?:\.\d+)?\b/i.test(s);}
function normalize(item){
  if(!item||typeof item!=='object'||materialSpec(item))return null;
  // Walkthrough speech is evidence, not field-verification authority. Even if an
  // AI/transcript payload contains a field-looking status or method name, it stays
  // unverified until a separate persisted Site Measurement is operator verified.
  return {...item,verificationStatus:UNVERIFIED,fieldVerified:false,verificationSource:'WALKTHROUGH_NARRATION',requiresOperatorVerification:dimension(item)};
}
function list(value){return (Array.isArray(value)?value:[]).map(normalize).filter(Boolean);}
function run(){const v=C.state?.visit;if(!v)return;v.walkthroughSpokenMeasurements=list(v.walkthroughSpokenMeasurements);v.walkthroughMeasurementCandidates=list(v.walkthroughMeasurementCandidates);if(v.walkthroughVoice&&Array.isArray(v.walkthroughVoice.spokenMeasurements))v.walkthroughVoice.spokenMeasurements=list(v.walkthroughVoice.spokenMeasurements);if(v.walkthroughProfessionalNotes&&Array.isArray(v.walkthroughProfessionalNotes.spokenMeasurements))v.walkthroughProfessionalNotes.spokenMeasurements=list(v.walkthroughProfessionalNotes.spokenMeasurements);for(const row of Array.isArray(window.state?.snapshot?.siteCaptureSessions)?window.state.snapshot.siteCaptureSessions:[]){for(const key of ['Walkthrough Spoken Measurements','walkthroughSpokenMeasurements'])if(Array.isArray(row[key]))row[key]=list(row[key]);}}
function install(){if(C.state.__h38SpokenAuthorityFinal===BUILD)return true;const base=C.state.render;if(typeof base!=='function')return false;C.state.__h38SpokenAuthorityFinal=BUILD;C.setRender(function(){run();base();});run();C.state.render?.();return true;}
let ticks=0;const timer=setInterval(()=>{if(install()||++ticks>20)clearInterval(timer);},100);install();
window.H38_SPOKEN_MEASUREMENT_AUTHORITY_FINAL=Object.freeze({enabled:true,build:BUILD,normalize,run,spokenDimensionsDefaultVerified:false,spokenDimensionsRequirePersistedOperatorVerification:true,deviceAndCameraRemainSeparateAuthority:true,materialSpecsExcluded:true,automaticApproval:false});
})();
