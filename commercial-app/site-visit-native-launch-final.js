(function(){
'use strict';
const BUILD='20260816-native-launch-direct-final-1';
const RESUME_KEY='h38:field-visit-resume-step';
const RETURN_KEY='h38:native-walkthrough-return-context-v2';
let busy=false;
const text=value=>String(value==null?'':value);
function core(){return window.H38_FIELD_VISIT_CORE||null;}
function bridge(){try{return window.AndroidH38Native||null;}catch(_){return null;}}
function nativeAndroid(){return /H38SiteScannerAndroid\//.test(String(navigator.userAgent||''))||!!bridge();}
function toast(message,bad){try{window.toast?.(message,!!bad);}catch(_){} }
function context(){const C=core(),visit=C?.state?.visit||{};return{tab:'capture',time:Date.now(),url:location.href,route:`${location.pathname}${location.search}${location.hash}`,businessId:text(C?.business?.()||visit.businessId||window.state?.businessId),visitId:text(visit.visitId),sessionId:text(visit.sessionId),customerId:text(visit.customerId),quoteId:text(visit.quoteId),projectTitle:text(visit.projectTitle)};}
function remember(){try{const value=context();if(!value.visitId||!value.sessionId)return null;localStorage.setItem(RESUME_KEY,JSON.stringify(value));localStorage.setItem(RETURN_KEY,JSON.stringify({...value,mirroredAt:Date.now()}));return value;}catch(_){return null;}}
async function waitForBridge(attempt=0){const b=bridge();if(b&&typeof b.launchWalkthroughCapture==='function')return b;if(attempt>=20)return null;await new Promise(resolve=>setTimeout(resolve,75));return waitForBridge(attempt+1);}
async function launch(){remember();const b=await waitForBridge();if(!b){toast('The Android walkthrough camera bridge did not become ready. Close H38 and reopen it before trying again.',true);return false;}try{b.launchWalkthroughCapture();return true;}catch(error){toast(error?.message||'The Android walkthrough camera could not open.',true);return false;}}
async function saveAndLaunch(form){if(busy)return;busy=true;try{const C=core(),workflow=window.H38_FIELD_VISIT_WORKFLOW;if(!C?.state||!workflow?.saveJobDraft||!workflow?.ensureSession)throw Error('Site Visit is still loading.');await workflow.saveJobDraft(form);await workflow.ensureSession();C.state.tab='capture';await C.load?.();C.state.render?.();if(!remember())throw Error('The Site Visit return context could not be saved.');await launch();}catch(error){toast(error?.message||String(error),true);}finally{busy=false;}}
function intercept(event){if(!nativeAndroid())return;const button=event.target?.closest?.('#fieldStartWalkthrough');if(!button)return;const form=button.form||button.closest?.('#fieldContext');if(!form)return;event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();void saveAndLaunch(form);}
window.addEventListener('click',intercept,true);
window.H38_SITE_VISIT_NATIVE_LAUNCH_FINAL={build:BUILD,directBridgeAfterSave:true,realSaveStartButton:true,webRtcFallback:false,cameraXChanged:false,automaticApproval:false,automaticCustomerSending:false};
})();
