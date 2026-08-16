(function(){
'use strict';
const BUILD='20260816-native-launch-direct-final-2';
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
function hammer(){let node=document.getElementById('h38SiteVisitWorkingHammer');if(!node){node=document.createElement('div');node.id='h38SiteVisitWorkingHammer';node.setAttribute('role','status');node.setAttribute('aria-live','polite');node.innerHTML='<div class="h38-site-working-card"><div class="h38-site-working-hammer" aria-hidden="true">🔨</div><strong data-h38-working-title>Working…</strong><span data-h38-working-detail>Please wait.</span></div>';document.body.appendChild(node);}return node;}
function working(title,detail){const node=hammer();node.querySelector('[data-h38-working-title]').textContent=title||'Working…';node.querySelector('[data-h38-working-detail]').textContent=detail||'Please wait.';node.classList.add('show');document.documentElement.classList.add('h38-site-visit-working');}
function clearWorking(){document.getElementById('h38SiteVisitWorkingHammer')?.classList.remove('show');document.documentElement.classList.remove('h38-site-visit-working');}
async function waitForBridge(attempt=0){const b=bridge();if(b&&typeof b.launchWalkthroughCapture==='function')return b;if(attempt>=20)return null;await new Promise(resolve=>setTimeout(resolve,75));return waitForBridge(attempt+1);}
async function launch(){remember();working('Opening walkthrough…','Starting the Android camera.');const b=await waitForBridge();if(!b){toast('The Android walkthrough camera bridge did not become ready. Close H38 and reopen it before trying again.',true);return false;}try{b.launchWalkthroughCapture();return true;}catch(error){toast(error?.message||'The Android walkthrough camera could not open.',true);return false;}}
async function saveAndLaunch(form){if(busy)return;busy=true;working('Saving Site Visit…','Keeping this job and return point safe before opening the camera.');try{const C=core(),workflow=window.H38_FIELD_VISIT_WORKFLOW;if(!C?.state||!workflow?.saveJobDraft||!workflow?.ensureSession)throw Error('Site Visit is still loading.');await workflow.saveJobDraft(form);working('Preparing walkthrough…','Finishing the capture session.');await workflow.ensureSession();C.state.tab='capture';if(!remember())throw Error('The Site Visit return context could not be saved.');const opened=await launch();if(!opened)clearWorking();}catch(error){clearWorking();toast(error?.message||String(error),true);}finally{busy=false;}}
function intercept(event){if(!nativeAndroid())return;const button=event.target?.closest?.('#fieldStartWalkthrough');if(!button)return;const form=button.form||button.closest?.('#fieldContext');if(!form)return;event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();void saveAndLaunch(form);}
window.addEventListener('click',intercept,true);
window.addEventListener('focus',()=>setTimeout(clearWorking,250));
window.addEventListener('pageshow',()=>setTimeout(clearWorking,250));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(clearWorking,250);});
const style=document.createElement('style');style.textContent='#h38SiteVisitWorkingHammer{position:fixed;inset:0;z-index:2147483000;display:none;place-items:center;background:rgba(6,16,24,.58);padding:24px}#h38SiteVisitWorkingHammer.show{display:grid}.h38-site-working-card{width:min(330px,88vw);display:grid;justify-items:center;gap:9px;padding:22px 20px;border-radius:18px;background:#fff;color:#10212c;box-shadow:0 18px 55px rgba(0,0,0,.32);text-align:center}.h38-site-working-hammer{font-size:42px;transform-origin:75% 75%;animation:h38HammerWork .72s ease-in-out infinite}.h38-site-working-card strong{font-size:18px}.h38-site-working-card span{font-size:14px;color:#52616d}@keyframes h38HammerWork{0%,100%{transform:rotate(-18deg)}50%{transform:rotate(22deg)}}';document.head.appendChild(style);
window.H38_SITE_VISIT_NATIVE_LAUNCH_FINAL={build:BUILD,directBridgeAfterSave:true,launchBeforeReload:true,workingHammer:true,realSaveStartButton:true,webRtcFallback:false,cameraXChanged:false,automaticApproval:false,automaticCustomerSending:false};
})();
