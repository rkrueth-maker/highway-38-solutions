(function(){
'use strict';
const BUILD='20260827-site-visit-customer-top-actions-2';
const RESUME_KEY='h38:field-visit-resume-step';
const RETURN_KEY='h38:native-walkthrough-return-context-v2';
let blankSince=0,blankRepairBusy=false,nativeRetryTimer=0;
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
function mirrorReturnContext(){try{const resume=readContext(RESUME_KEY);if(!resume)return null;const previous=readContext(RETURN_KEY);const candidate={...resume,mirroredAt:Number(resume.mirroredAt||resume.time||Date.now())};if(!previous||text(previous.visitId)!==text(candidate.visitId)||text(previous.sessionId)!==text(candidate.sessionId)||Number(previous.time||0)<Number(candidate.time||0))localStorage.setItem(RETURN_KEY,JSON.stringify(candidate));return candidate;}catch(_){return null;}}
function scheduleNativeRepair(delay=250){clearTimeout(nativeRetryTimer);nativeRetryTimer=setTimeout(()=>void repairNativeReturn('retry'),delay);}
async function repairNativeReturn(reason){if(!nativeAndroid()||!nativeEvidencePending())return false;const authority=window.H38_ANDROID_WALKTHROUGH_RETURN_STABILIZER;if(authority?.singleReturnAuthority&&typeof authority.recoverNow==='function')return !!(await authority.recoverNow(reason||'delegate'));scheduleNativeRepair(350);return false;}
function start(){try{document.activeElement?.blur?.();}catch(_){}if(window.H38_FIELD_VISIT?.open){window.H38_FIELD_VISIT.open({customerId:'',quoteId:''});return;}if(typeof window.openPage==='function')window.openPage('field');}
function revealCustomerForm(){
  const form=document.getElementById('customerForm');
  if(!form)return false;
  const details=form.closest('details');
  if(details)details.open=true;
  const target=details||form.closest('.card')||form;
  try{target.scrollIntoView?.({behavior:'smooth',block:'start'});}catch(_){}
  const field=form.querySelector('[name="customerName"],input:not([type="hidden"]),select,textarea');
  if(field){try{field.focus({preventScroll:true});}catch(_){try{field.focus?.();}catch(__){}}}
  return true;
}
function addCustomer(){
  if(revealCustomerForm())return;
  try{window.renderCustomers?.();}catch(_){}
  const reveal=()=>revealCustomerForm();
  queueMicrotask(reveal);
  requestAnimationFrame(reveal);
  setTimeout(reveal,80);
}
function ensureCustomerTopActions(bar){
  if(!bar)return;
  let site=bar.querySelector('#h38StartSiteVisitTop'),add=bar.querySelector('#h38AddCustomerTop');
  if(site&&add)return;
  bar.innerHTML='<button type="button" id="h38StartSiteVisitTop" class="primary">📍 Start Site Visit</button><button type="button" id="h38AddCustomerTop" class="secondary">＋ Add Customer</button>';
  site=bar.querySelector('#h38StartSiteVisitTop');add=bar.querySelector('#h38AddCustomerTop');
  site?.addEventListener('click',event=>{event.preventDefault();event.currentTarget.blur();start();});
  add?.addEventListener('click',event=>{event.preventDefault();event.currentTarget.blur();addCustomer();});
}
function polishWalkthroughDuplication(){const C=core(),app=document.querySelector('.field-visit-app');if(!C?.state?.visit||!app)return;const ready=Array.isArray(C.state.visit.videoAttachmentIds)&&C.state.visit.videoAttachmentIds.length>0||C.state.visit.walkthroughSkipped===true;const next=app.querySelector('#h38SiteVisitStageRail .h38-site-next');if(next)next.hidden=!ready&&!!document.getElementById('fieldWalkthrough');}
function recoverBlankSiteVisit(){const body=document.body;if(!body)return;const claimedOpen=body.classList.contains('field-visit-open');const app=document.querySelector('.field-visit-app');if(!claimedOpen||app){blankSince=0;return;}if(nativeEvidencePending()){if(!blankSince)blankSince=Date.now();void repairNativeReturn('blank-screen');return;}if(!blankSince){blankSince=Date.now();return;}if(Date.now()-blankSince<900||blankRepairBusy)return;blankRepairBusy=true;try{const C=core();if(C?.state)C.state.open=false;body.classList.remove('field-visit-open');document.querySelectorAll('.topbar,.business-bar,.app-shell,#toast').forEach(node=>node.style.removeProperty('visibility'));console.error('[H38 Site Visit blank recovery] restored Business Office because Site Visit UI was missing');try{window.toast?.('Site Visit could not finish opening. Business Office was restored; your saved visit was kept.',true);}catch(_){}blankSince=0;}finally{blankRepairBusy=false;}}
function decorate(){recoverBlankSiteVisit();polishWalkthroughDuplication();if(nativeEvidencePending())void repairNativeReturn('decorate');const s=officeState(),main=document.getElementById('mainContent');if(!main||s?.page!=='customers'){document.getElementById('h38TopSiteVisitAction')?.remove();return;}main.querySelectorAll('[data-customer-site]').forEach(button=>button.remove());main.querySelectorAll('[data-h38-customer-quick]').forEach(actions=>{if(!actions.querySelector('button'))actions.remove();});let bar=document.getElementById('h38TopSiteVisitAction');if(!bar){bar=document.createElement('div');bar.id='h38TopSiteVisitAction';bar.className='h38-top-site-visit-action';const head=main.querySelector('.page-head');if(head)head.insertAdjacentElement('afterend',bar);else main.prepend(bar);}ensureCustomerTopActions(bar);}
function loadAndroidReturnStabilizer(){if(window.H38_ANDROID_WALKTHROUGH_RETURN_STABILIZER||document.querySelector('script[data-h38-android-return-stabilizer]'))return;const script=document.createElement('script');script.src='./android-walkthrough-return-stabilizer.js?build=20260817-single-native-return-authority-1';script.dataset.h38AndroidReturnStabilizer='1';document.head.appendChild(script);}
function loadAndroidWalkthroughPhotoRecovery(){if(window.H38_ANDROID_WALKTHROUGH_PHOTO_RECOVERY||document.querySelector('script[data-h38-android-walkthrough-photo-recovery]'))return;const script=document.createElement('script');script.src='./android-walkthrough-photo-recovery.js?build=20260816-native-walkthrough-photos-1';script.dataset.h38AndroidWalkthroughPhotoRecovery='1';document.head.appendChild(script);}
function loadPhoneFinalFix(){if(window.H38_SITE_VISIT_PHONE_FINAL_FIX||document.querySelector('script[data-h38-site-visit-phone-final]'))return;const script=document.createElement('script');script.src='./site-visit-phone-final-fix.js?build=20260810-1228';script.dataset.h38SiteVisitPhoneFinal='1';document.head.appendChild(script);}
function loadPhotoQuoteRuntimeRepair(){if(window.H38_SITE_VISIT_PHOTO_QUOTE_RUNTIME_REPAIR||document.querySelector('script[data-h38-photo-quote-runtime-repair]'))return;const script=document.createElement('script');script.src='./site-visit-photo-quote-runtime-repair.js?build=20260821-site-visit-photo-quote-runtime-repair-3';script.dataset.h38PhotoQuoteRuntimeRepair='1';document.head.appendChild(script);}
function loadQuoteHandoff(){if(window.H38_FIELD_VISIT_QUOTE_HANDOFF||document.querySelector('script[data-h38-site-visit-quote-handoff]'))return;const script=document.createElement('script');script.src='./field-visit-quote-handoff.js?build=20260811-site-visit-quote-handoff-3';script.dataset.h38SiteVisitQuoteHandoff='1';script.addEventListener('load',loadFinishBuild);document.head.appendChild(script);}
function loadFinishBuild(){if(window.H38_FIELD_VISIT_FINISH_BUILD||document.querySelector('script[data-h38-site-visit-finish-build]'))return;loadPhotoQuoteRuntimeRepair();const script=document.createElement('script');script.src='./field-visit-finish-build.js?build=20260821-finish-site-visit-build-quote-4';script.dataset.h38SiteVisitFinishBuild='1';document.head.appendChild(script);}
function loadQuoteMeasurementActionPhotoGuard(){if(window.H38_QUOTE_MEASUREMENT_ACTION_PHOTO_GUARD||document.querySelector('script[data-h38-quote-measurement-action-photo-guard]'))return;const script=document.createElement('script');script.src='./quote-measurement-action-photo-guard.js?build=20260814-quote-measurement-action-photo-guard-4';script.dataset.h38QuoteMeasurementActionPhotoGuard='1';document.head.appendChild(script);}
function loadJobCenteredFlow(){if(window.H38_JOB_CENTERED_FLOW||document.querySelector('script[data-h38-job-centered-flow]'))return;const script=document.createElement('script');script.src='./job-centered-flow.js?build=20260816-job-centered-flow-1';script.dataset.h38JobCenteredFlow='1';document.head.appendChild(script);}
function loadDeleteResetFix(){if(window.H38_SITE_VISIT_DELETE_RESET_FIX||document.querySelector('script[data-h38-site-visit-delete-reset]'))return;const script=document.createElement('script');script.src='./site-visit-delete-reset-fix.js?build=20260816-site-visit-delete-reset-0425';script.dataset.h38SiteVisitDeleteReset='1';document.head.appendChild(script);}
const style=document.createElement('style');style.textContent='.h38-top-site-visit-action{display:flex;justify-content:flex-start;align-items:center;gap:8px;margin:0 0 14px}.h38-top-site-visit-action button{min-height:48px;padding:0 18px;font-weight:800}@media(max-width:760px){.h38-top-site-visit-action{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:8px}.h38-top-site-visit-action button{width:100%;min-width:0;padding:0 10px;white-space:nowrap}}#h38SiteVisitStageRail .h38-site-next[hidden]{display:none!important}';document.head.appendChild(style);
const observer=new MutationObserver(()=>decorate());observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('blur',mirrorReturnContext,true);
window.addEventListener('pagehide',mirrorReturnContext,true);
window.addEventListener('focus',()=>void repairNativeReturn('focus'));
window.addEventListener('pageshow',()=>void repairNativeReturn('pageshow'));
window.addEventListener('h38:native-scanner-ready',()=>void repairNativeReturn('native-ready'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void repairNativeReturn('visible');});
setInterval(()=>{decorate();if(nativeEvidencePending())void repairNativeReturn('poll');},900);
setTimeout(decorate,0);setTimeout(decorate,900);loadAndroidReturnStabilizer();loadAndroidWalkthroughPhotoRecovery();loadPhoneFinalFix();loadQuoteMeasurementActionPhotoGuard();loadPhotoQuoteRuntimeRepair();loadQuoteHandoff();loadJobCenteredFlow();loadDeleteResetFix();setTimeout(loadFinishBuild,1200);
window.H38_SITE_VISIT_TOP_ACTION={build:BUILD,topLevel:true,rowActionRemoved:true,addCustomerTopLevel:true,addCustomerBesideSiteVisit:true,addCustomerUsesCanonicalForm:true,addCustomerExpandsMobileEntry:true,addCustomerNoNewWorkflow:true,keyboardSafe:true,phoneFinalFixLoaded:true,androidReturnStabilizerLoaded:true,androidWalkthroughPhotoRecoveryLoaded:true,quoteMeasurementActionPhotoGuardLoaded:true,photoQuoteRuntimeRepairLoaded:true,quoteHandoffLoaded:true,finishBuildLoaded:true,jobCenteredFlowLoaded:true,deleteResetFixLoaded:true,blankScreenRecovery:true,physicalAndroidReturnRepair:true,persistentReturnContext:true,nonSlidingReturnContext:true,delegatesNativeReturn:true,nativeEvidenceRequired:true,nativeEvidencePoll:true,duplicateWalkthroughCtaRemoved:true,singleNativeLaunchAuthority:true,nativeSaveStartDelegated:true,realWalkthroughButtonAuthority:true,automaticApproval:false,automaticCustomerSending:false};
})();