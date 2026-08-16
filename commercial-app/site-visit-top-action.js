(function(){
'use strict';
const BUILD='20260816-native-save-start-launch-2';
const RESUME_KEY='h38:field-visit-resume-step';
const RETURN_KEY='h38:native-walkthrough-return-context-v2';
let blankSince=0,blankRepairBusy=false,nativeReturnBusy=false,nativeRetryTimer=0,nativeSaveStartBusy=false;
const text=value=>String(value==null?'':value);
function officeState(){try{return typeof state!=='undefined'?state:window.state}catch(_){return window.state}}
function core(){return window.H38_FIELD_VISIT_CORE||null;}
function bridge(){try{return window.AndroidH38Native||null;}catch(_){return null;}}
function nativeAndroid(){return /H38SiteScannerAndroid\//.test(String(navigator.userAgent||''))||!!bridge();}
function parseJson(value){try{return JSON.parse(text(value)||'{}');}catch(_){return{};}}
function nativeVideoInfo(){try{return parseJson(bridge()?.getRecoveredWalkthroughInfo?.()||'{}');}catch(_){return{};}}
function nativePhotoInfo(){try{return parseJson(bridge()?.getRecoveredWalkthroughPhotosInfo?.()||'{}');}catch(_){return{};}}
function nativeEvidencePending(){if(!nativeAndroid())return false;const video=nativeVideoInfo(),photos=nativePhotoInfo();return video.ready===true&&Number(video.size||0)>0||photos.ready===true&&Number(photos.count||photos.photos?.length||0)>0;}
function readContext(key){try{const raw=localStorage.getItem(key);if(!raw)return null;const value=JSON.parse(raw);if(!value?.visitId)return null;return value;}catch(_){return null;}}
function mirrorReturnContext(){try{const resume=readContext(RESUME_KEY);if(!resume)return null;const previous=readContext(RETURN_KEY);const candidate={...resume,mirroredAt:Date.now()};if(!previous||text(previous.visitId)!==text(candidate.visitId)||Number(previous.time||0)<=Number(candidate.time||0))localStorage.setItem(RETURN_KEY,JSON.stringify(candidate));return candidate;}catch(_){return null;}}
function returnContext(){return readContext(RETURN_KEY)||readContext(RESUME_KEY);}
function sameVisit(visit,expected){if(!visit||!expected?.visitId)return false;if(text(visit.visitId)!==text(expected.visitId))return false;if(expected.sessionId&&text(visit.sessionId)!==text(expected.sessionId))return false;if(expected.businessId&&text(visit.businessId)&&text(visit.businessId)!==text(expected.businessId))return false;return true;}
async function restoreReturnVisit(expected){const C=core();if(!C?.state||!expected?.visitId||!window.H38DB?.all)return false;if(sameVisit(C.state.visit,expected))return true;let drafts=[];try{drafts=await window.H38DB.all('drafts')||[];}catch(_){return false;}const visit=drafts.find(row=>row?.kind==='H38_FIELD_VISIT'&&text(row.visitId)===text(expected.visitId)&&(!expected.sessionId||text(row.sessionId)===text(expected.sessionId))&&(!expected.businessId||!text(row.businessId)||text(row.businessId)===text(expected.businessId)));if(!visit)return false;C.state.visit=visit;C.state.open=true;C.state.tab='capture';document.body.classList.add('field-visit-open');try{await C.load?.();}catch(_){}try{C.state.render?.();}catch(_){}return sameVisit(C.state.visit,expected);}
function scheduleNativeRepair(delay=250){clearTimeout(nativeRetryTimer);nativeRetryTimer=setTimeout(()=>void repairNativeReturn('retry'),delay);}
async function repairNativeReturn(reason){if(!nativeAndroid()||nativeReturnBusy)return false;mirrorReturnContext();if(!nativeEvidencePending()){window.H38_NATIVE_RETURN_REPAIR_ACTIVE=false;return false;}const C=core(),expected=returnContext();if(!C?.state||!window.H38DB?.all){scheduleNativeRepair(350);return false;}nativeReturnBusy=true;window.H38_NATIVE_RETURN_REPAIR_ACTIVE=true;try{if(expected?.visitId&&!sameVisit(C.state.visit,expected)){const restored=await restoreReturnVisit(expected);if(!restored){scheduleNativeRepair(500);return false;}}if(!C.state.visit?.visitId||!C.state.visit?.sessionId){scheduleNativeRepair(500);return false;}C.state.open=true;C.state.tab='capture';document.body.classList.add('field-visit-open');try{C.state.render?.();}catch(_){}try{window.H38_ANDROID_NATIVE_WALKTHROUGH_GUARD?.recoverNow?.();}catch(_){}setTimeout(()=>{try{window.H38_ANDROID_WALKTHROUGH_PHOTO_RECOVERY?.recoverNow?.();}catch(_){}},220);scheduleNativeRepair(700);return true;}finally{nativeReturnBusy=false;}}
function clickRealWalkthrough(attempt=0){const button=document.getElementById('fieldWalkthrough');if(button){button.click();return true;}if(attempt<8){setTimeout(()=>clickRealWalkthrough(attempt+1),60);return false;}try{window.toast?.('The walkthrough button is still loading. Tap Start Video Walkthrough once it appears.',true);}catch(_){}return false;}
async function nativeSaveAndStart(form){if(nativeSaveStartBusy)return;nativeSaveStartBusy=true;try{const workflow=window.H38_FIELD_VISIT_WORKFLOW,C=core();if(!workflow?.saveJobDraft||!workflow?.ensureSession||!C?.state)throw new Error('Site Visit is still loading.');await workflow.saveJobDraft(form);await workflow.ensureSession();C.state.tab='capture';await C.load?.();C.state.render?.();setTimeout(()=>clickRealWalkthrough(),40);}catch(error){try{window.toast?.(error?.message||String(error),true);}catch(_){}}finally{nativeSaveStartBusy=false;}}
function interceptNativeSaveStart(event){if(!nativeAndroid())return;const form=event.target;if(!(form instanceof HTMLFormElement)||form.id!=='fieldContext')return;event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();void nativeSaveAndStart(form);}
function interceptNativeSaveStartClick(event){if(!nativeAndroid())return;const button=event.target?.closest?.('#fieldStartWalkthrough');if(!button)return;const form=button.form||button.closest?.('#fieldContext');if(!form)return;event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();void nativeSaveAndStart(form);}
function start(){
  try{document.activeElement?.blur?.();}catch(_){}
  if(window.H38_FIELD_VISIT?.open){window.H38_FIELD_VISIT.open({customerId:'',quoteId:''});return;}
  if(typeof window.openPage==='function')window.openPage('field');
}
function polishWalkthroughDuplication(){
  const C=core(),app=document.querySelector('.field-visit-app');
  if(!C?.state?.visit||!app)return;
  const ready=Array.isArray(C.state.visit.videoAttachmentIds)&&C.state.visit.videoAttachmentIds.length>0||C.state.visit.walkthroughSkipped===true;
  const next=app.querySelector('#h38SiteVisitStageRail .h38-site-next');
  if(next)next.hidden=!ready&&!!document.getElementById('fieldWalkthrough');
}
function recoverBlankSiteVisit(){
  const body=document.body;
  if(!body)return;
  const claimedOpen=body.classList.contains('field-visit-open');
  const app=document.querySelector('.field-visit-app');
  if(!claimedOpen||app){blankSince=0;return;}
  mirrorReturnContext();
  if(nativeEvidencePending()||window.H38_NATIVE_RETURN_REPAIR_ACTIVE){
    if(!blankSince)blankSince=Date.now();
    try{core()?.state?.render?.();}catch(_){}
    void repairNativeReturn('blank-screen');
    return;
  }
  if(!blankSince){blankSince=Date.now();return;}
  if(Date.now()-blankSince<900||blankRepairBusy)return;
  blankRepairBusy=true;
  try{
    const C=core();
    try{C?.state?.render?.();}catch(error){console.error('[H38 Site Visit blank recovery] render failed',error);}
    if(document.querySelector('.field-visit-app')){blankSince=0;return;}
    if(C?.state)C.state.open=false;
    body.classList.remove('field-visit-open');
    document.querySelectorAll('.topbar,.business-bar,.app-shell,#toast').forEach(node=>node.style.removeProperty('visibility'));
    console.error('[H38 Site Visit blank recovery] restored Business Office because Site Visit UI was missing');
    try{window.toast?.('Site Visit could not finish opening. Business Office was restored; your saved visit was kept.',true);}catch(_){}
    blankSince=0;
  }finally{blankRepairBusy=false;}
}
function decorate(){
  recoverBlankSiteVisit();
  polishWalkthroughDuplication();
  if(nativeEvidencePending())void repairNativeReturn('decorate');
  const s=officeState(),main=document.getElementById('mainContent');
  if(!main||s?.page!=='customers'){document.getElementById('h38TopSiteVisitAction')?.remove();return;}
  main.querySelectorAll('[data-customer-site]').forEach(button=>button.remove());
  main.querySelectorAll('[data-h38-customer-quick]').forEach(actions=>{if(!actions.querySelector('button'))actions.remove();});
  let bar=document.getElementById('h38TopSiteVisitAction');
  if(!bar){
    bar=document.createElement('div');bar.id='h38TopSiteVisitAction';bar.className='h38-top-site-visit-action';
    bar.innerHTML='<button type="button" id="h38StartSiteVisitTop" class="primary">📍 Start Site Visit</button>';
    const head=main.querySelector('.page-head');
    if(head)head.insertAdjacentElement('afterend',bar);else main.prepend(bar);
    bar.querySelector('#h38StartSiteVisitTop').addEventListener('click',event=>{event.preventDefault();event.currentTarget.blur();start();});
  }
}
function loadAndroidReturnStabilizer(){
  if(window.H38_ANDROID_WALKTHROUGH_RETURN_STABILIZER||document.querySelector('script[data-h38-android-return-stabilizer]'))return;
  const script=document.createElement('script');
  script.src='./android-walkthrough-return-stabilizer.js?build=20260811-android-return-stable-1245';
  script.dataset.h38AndroidReturnStabilizer='1';
  document.head.appendChild(script);
}
function loadAndroidWalkthroughPhotoRecovery(){
  if(window.H38_ANDROID_WALKTHROUGH_PHOTO_RECOVERY||document.querySelector('script[data-h38-android-walkthrough-photo-recovery]'))return;
  const script=document.createElement('script');
  script.src='./android-walkthrough-photo-recovery.js?build=20260816-native-walkthrough-photos-1';
  script.dataset.h38AndroidWalkthroughPhotoRecovery='1';
  document.head.appendChild(script);
}
function loadPhoneFinalFix(){
  if(window.H38_SITE_VISIT_PHONE_FINAL_FIX||document.querySelector('script[data-h38-site-visit-phone-final]'))return;
  const script=document.createElement('script');
  script.src='./site-visit-phone-final-fix.js?build=20260810-1228';
  script.dataset.h38SiteVisitPhoneFinal='1';
  document.head.appendChild(script);
}
function loadQuoteHandoff(){
  if(window.H38_FIELD_VISIT_QUOTE_HANDOFF||document.querySelector('script[data-h38-site-visit-quote-handoff]'))return;
  const script=document.createElement('script');
  script.src='./field-visit-quote-handoff.js?build=20260811-site-visit-quote-handoff-3';
  script.dataset.h38SiteVisitQuoteHandoff='1';
  script.addEventListener('load',loadFinishBuild);
  document.head.appendChild(script);
}
function loadFinishBuild(){
  if(window.H38_FIELD_VISIT_FINISH_BUILD||document.querySelector('script[data-h38-site-visit-finish-build]'))return;
  const script=document.createElement('script');
  script.src='./field-visit-finish-build.js?build=20260814-finish-site-visit-build-quote-3';
  script.dataset.h38SiteVisitFinishBuild='1';
  document.head.appendChild(script);
}
function loadQuoteMeasurementActionPhotoGuard(){
  if(window.H38_QUOTE_MEASUREMENT_ACTION_PHOTO_GUARD||document.querySelector('script[data-h38-quote-measurement-action-photo-guard]'))return;
  const script=document.createElement('script');
  script.src='./quote-measurement-action-photo-guard.js?build=20260814-quote-measurement-action-photo-guard-4';
  script.dataset.h38QuoteMeasurementActionPhotoGuard='1';
  document.head.appendChild(script);
}
function loadJobCenteredFlow(){
  if(window.H38_JOB_CENTERED_FLOW||document.querySelector('script[data-h38-job-centered-flow]'))return;
  const script=document.createElement('script');
  script.src='./job-centered-flow.js?build=20260816-job-centered-flow-1';
  script.dataset.h38JobCenteredFlow='1';
  document.head.appendChild(script);
}
function loadDeleteResetFix(){
  if(window.H38_SITE_VISIT_DELETE_RESET_FIX||document.querySelector('script[data-h38-site-visit-delete-reset]'))return;
  const script=document.createElement('script');
  script.src='./site-visit-delete-reset-fix.js?build=20260816-site-visit-delete-reset-0425';
  script.dataset.h38SiteVisitDeleteReset='1';
  document.head.appendChild(script);
}
const style=document.createElement('style');style.textContent='.h38-top-site-visit-action{display:flex;justify-content:flex-start;align-items:center;margin:0 0 14px}.h38-top-site-visit-action button{min-height:48px;padding:0 18px;font-weight:800}#h38SiteVisitStageRail .h38-site-next[hidden]{display:none!important}';document.head.appendChild(style);
const observer=new MutationObserver(()=>decorate());observer.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',interceptNativeSaveStartClick,true);
document.addEventListener('submit',interceptNativeSaveStart,true);
window.addEventListener('blur',mirrorReturnContext,true);
window.addEventListener('pagehide',mirrorReturnContext,true);
window.addEventListener('focus',()=>{mirrorReturnContext();void repairNativeReturn('focus');});
window.addEventListener('pageshow',()=>{mirrorReturnContext();void repairNativeReturn('pageshow');});
window.addEventListener('h38:native-scanner-ready',()=>void repairNativeReturn('native-ready'));
document.addEventListener('visibilitychange',()=>{mirrorReturnContext();if(!document.hidden)void repairNativeReturn('visible');});
setInterval(()=>{mirrorReturnContext();decorate();if(nativeEvidencePending())void repairNativeReturn('poll');},650);
setTimeout(decorate,0);setTimeout(decorate,900);loadAndroidReturnStabilizer();loadAndroidWalkthroughPhotoRecovery();loadPhoneFinalFix();loadQuoteMeasurementActionPhotoGuard();loadQuoteHandoff();loadJobCenteredFlow();loadDeleteResetFix();setTimeout(loadFinishBuild,1200);
window.H38_SITE_VISIT_TOP_ACTION={build:BUILD,topLevel:true,rowActionRemoved:true,keyboardSafe:true,phoneFinalFixLoaded:true,androidReturnStabilizerLoaded:true,androidWalkthroughPhotoRecoveryLoaded:true,quoteMeasurementActionPhotoGuardLoaded:true,quoteHandoffLoaded:true,finishBuildLoaded:true,jobCenteredFlowLoaded:true,deleteResetFixLoaded:true,blankScreenRecovery:true,physicalAndroidReturnRepair:true,persistentReturnContext:true,nativeEvidencePoll:true,duplicateWalkthroughCtaRemoved:true,nativeSaveStartLaunchRepair:true,directNativeSaveStartClick:true,realWalkthroughButtonAuthority:true,automaticApproval:false,automaticCustomerSending:false};
})();
