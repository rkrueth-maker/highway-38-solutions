(function(){
'use strict';
const BUILD='20260816-native-launch-single-authority-3';
const RESUME_KEY='h38:field-visit-resume-step';
const RETURN_KEY='h38:native-walkthrough-return-context-v2';
const SAVE_TIMEOUT_MS=4500;
const SESSION_TIMEOUT_MS=3500;
const BRIDGE_TIMEOUT_MS=1800;
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
function timeoutError(label,ms){const error=new Error(`${label} took too long. Nothing was sent or approved. Try Save & Start Walkthrough again.`);error.code='H38_NATIVE_SAVE_START_TIMEOUT';error.stage=label;error.timeoutMs=ms;return error;}
async function bounded(factory,ms,label){let timer;try{return await Promise.race([Promise.resolve().then(factory),new Promise((_,reject)=>{timer=setTimeout(()=>reject(timeoutError(label,ms)),ms);})]);}finally{clearTimeout(timer);}}
async function waitForBridge(){const started=Date.now();while(Date.now()-started<BRIDGE_TIMEOUT_MS){const b=bridge();if(b&&typeof b.launchWalkthroughCapture==='function')return b;await new Promise(resolve=>setTimeout(resolve,75));}return null;}
async function launch(){remember();working('Opening walkthrough…','Starting the Android camera.');const b=await waitForBridge();if(!b)throw timeoutError('Android camera bridge',BRIDGE_TIMEOUT_MS);b.launchWalkthroughCapture();return true;}
async function saveAndLaunch(form){if(busy)return;busy=true;window.H38_NATIVE_SAVE_START_ACTIVE=true;working('Saving Site Visit…','Saving this job on the phone before opening the camera.');try{const C=core(),workflow=window.H38_FIELD_VISIT_WORKFLOW;if(!C?.state||!workflow?.saveJobDraft||!workflow?.ensureSession)throw Error('Site Visit is still loading.');await bounded(()=>workflow.saveJobDraft(form),SAVE_TIMEOUT_MS,'Saving Site Visit');working('Preparing walkthrough…','Creating the capture session and return point.');await bounded(()=>workflow.ensureSession(),SESSION_TIMEOUT_MS,'Preparing walkthrough');C.state.tab='capture';if(!remember())throw Error('The Site Visit return context could not be saved.');await launch();}catch(error){clearWorking();console.error('[H38 native Save & Start]',error);toast(error?.message||String(error),true);}finally{busy=false;window.H38_NATIVE_SAVE_START_ACTIVE=false;}}
function intercept(event){if(!nativeAndroid())return;const button=event.target?.closest?.('#fieldStartWalkthrough');if(!button)return;const form=button.form||button.closest?.('#fieldContext');if(!form)return;event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();void saveAndLaunch(form);}
window.H38_NATIVE_SAVE_START_AUTHORITY='site-visit-native-launch-final-v3';
window.addEventListener('click',intercept,true);
window.addEventListener('focus',()=>setTimeout(clearWorking,250));
window.addEventListener('pageshow',()=>setTimeout(clearWorking,250));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(clearWorking,250);});
const style=document.createElement('style');style.textContent='#h38SiteVisitWorkingHammer{position:fixed;inset:0;z-index:2147483000;display:none;place-items:center;background:rgba(6,16,24,.58);padding:24px}#h38SiteVisitWorkingHammer.show{display:grid}.h38-site-working-card{width:min(330px,88vw);display:grid;justify-items:center;gap:9px;padding:22px 20px;border-radius:18px;background:#fff;color:#10212c;box-shadow:0 18px 55px rgba(0,0,0,.32);text-align:center}.h38-site-working-hammer{font-size:42px;transform-origin:75% 75%;animation:h38HammerWork .72s ease-in-out infinite}.h38-site-working-card strong{font-size:18px}.h38-site-working-card span{font-size:14px;color:#52616d}@keyframes h38HammerWork{0%,100%{transform:rotate(-18deg)}50%{transform:rotate(22deg)}}';document.head.appendChild(style);
window.H38_SITE_VISIT_NATIVE_LAUNCH_FINAL=Object.freeze({build:BUILD,directBridgeAfterSave:true,launchBeforeReload:true,workingHammer:true,realSaveStartButton:true,singleActiveAuthority:true,saveTimeoutMs:SAVE_TIMEOUT_MS,sessionTimeoutMs:SESSION_TIMEOUT_MS,bridgeTimeoutMs:BRIDGE_TIMEOUT_MS,indefiniteHammer:false,webRtcFallback:false,cameraXChanged:false,automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false});
})();
