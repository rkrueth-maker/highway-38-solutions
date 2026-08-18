(function(){
'use strict';
const BUILD='20260818-jobs-scroll-restore-2';
const MOBILE='(max-width: 760px)';
const REVIEW_WORK_MAX_MS=60000;
let resizeTimer=0;
let interactionUntil=0;
const reviewWorkingSince=new Map();
function mobile(){return !!window.matchMedia?.(MOBILE).matches;}
function interacting(){return Date.now()<interactionUntil;}
function markInteraction(){interactionUntil=Date.now()+700;}
function statePage(){try{return String(window.state?.page||'');}catch(_){return'';}}
function fieldOpen(){
  if(document.body.classList.contains('field-visit-open'))return true;
  const app=document.getElementById('h38FieldVisitApp');if(!app||app.hidden||app.getAttribute('aria-hidden')==='true')return false;
  try{const style=getComputedStyle(app);return style.display!=='none'&&style.visibility!=='hidden'&&app.getClientRects().length>0;}catch(_){return false;}
}
function setViewportVars(){const viewport=window.visualViewport;const height=Math.round(viewport?.height||window.innerHeight||0);if(height)document.documentElement.style.setProperty('--h38-mobile-vh',`${height}px`);}
function installStyle(){if(document.getElementById('h38MobileRuntimeStabilityStyle'))return;const style=document.createElement('style');style.id='h38MobileRuntimeStabilityStyle';style.textContent=`
html,body{max-width:100%;overflow-x:hidden}body{min-height:100dvh;background:var(--bg,#eef3f6)}
#mainContent{overflow-anchor:none;min-width:0}.h38-five-primary-nav{isolation:isolate}
@media(max-width:760px){
 html{height:auto!important;min-height:100%!important;overflow-y:auto!important;overscroll-behavior-y:contain!important;touch-action:pan-y!important}
 body:not(.field-visit-open){height:auto!important;min-height:100%!important;overflow-y:auto!important;overscroll-behavior-y:contain!important;touch-action:pan-y!important;-webkit-overflow-scrolling:touch}
 .topbar{position:sticky;top:0;z-index:1600;transform:translateZ(0);backface-visibility:hidden}
 .topbar .brand{min-width:0;overflow:hidden}.topbar .brand>div{min-width:0}.topbar .brand strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px}.topbar .brand small{display:none}
 .business-bar:empty{display:none}.business-bar{position:relative;z-index:1500}
 body:not(.field-visit-open) .app-shell{height:auto!important;min-height:0!important;overflow:visible!important;touch-action:pan-y!important}
 body:not(.field-visit-open) #mainContent{box-sizing:border-box;width:100%;height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important;overflow-y:visible!important;overscroll-behavior-y:auto!important;padding-bottom:calc(104px + env(safe-area-inset-bottom,0px))!important;contain:none!important;touch-action:pan-y!important}
 #mainNav.h38-five-primary-nav{position:fixed!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;z-index:2500!important;margin:0!important;padding-bottom:env(safe-area-inset-bottom,0px)!important;background:var(--card,#fff)!important;box-shadow:0 -8px 24px rgba(11,36,56,.12);transform:translateZ(0);backface-visibility:hidden}
 #mainNav.h38-five-primary-nav button{min-width:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
 #toast{position:fixed;left:10px;right:10px;bottom:calc(86px + env(safe-area-inset-bottom,0px));z-index:3000;max-width:none;transform:translateZ(0)}
 dialog{max-height:calc(var(--h38-mobile-vh,100dvh) - 24px)}
 body.field-visit-open{height:var(--h38-mobile-vh,100dvh)!important;overflow:hidden!important}
 body.field-visit-open #mainNav.h38-five-primary-nav{display:none!important}
 body.field-visit-open #mainContent{padding-bottom:0!important}
 #h38FieldVisitApp{position:fixed;inset:0;z-index:2400;height:var(--h38-mobile-vh,100dvh);max-height:var(--h38-mobile-vh,100dvh);overflow:hidden;background:var(--bg,#eef3f6);transform:translateZ(0)}
 #h38FieldVisitApp .field-visit-main{height:100%;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))}
 #h38FieldVisitApp .field-bottom-nav{position:fixed;left:0;right:0;bottom:0;z-index:2600;padding-bottom:env(safe-area-inset-bottom,0px);background:var(--card,#fff);transform:translateZ(0)}
 input,textarea,select{font-size:16px!important}
 .h38-review-terminal-note{margin:12px 0;padding:14px;border-radius:14px;background:#fff;border:1px solid rgba(11,36,56,.18)}
 .h38-review-terminal-note strong{display:block;margin-bottom:5px}.h38-review-terminal-note span{display:block;color:#52616d;line-height:1.35}
}
`;document.head.appendChild(style);}
function restoreOfficeScroll(){
  if(!mobile()||fieldOpen())return;
  for(const node of [document.documentElement,document.body]){node.style.removeProperty('overflow');node.style.removeProperty('overflow-y');node.style.removeProperty('height');node.style.removeProperty('max-height');}
  for(const node of [document.querySelector('.app-shell'),document.getElementById('mainContent')]){if(!node)continue;node.style.removeProperty('height');node.style.removeProperty('max-height');node.style.removeProperty('overflow');node.style.removeProperty('overflow-y');}
}
function cleanFixedLayer(){if(!mobile())return;const nav=document.getElementById('mainNav');if(nav?.classList.contains('h38-five-primary-nav'))nav.setAttribute('data-h38-stable-fixed','1');}
function restoreChrome(){document.querySelectorAll('.topbar,.business-bar,.app-shell,#mainNav,#mainContent').forEach(node=>{node?.style.removeProperty('visibility');node?.style.removeProperty('opacity');});}
function stabilizeAfterRender(){if(!mobile())return;setViewportVars();cleanFixedLayer();if(!fieldOpen()){restoreChrome();restoreOfficeScroll();}}
function schedule(){clearTimeout(resizeTimer);resizeTimer=setTimeout(stabilizeAfterRender,40);}
function wrapOpenPage(){if(typeof window.openPage!=='function'||window.openPage.h38ScreenStable)return;const base=window.openPage;function stableOpenPage(key,...args){const before=statePage();const result=base.call(this,key,...args);requestAnimationFrame(()=>requestAnimationFrame(()=>{stabilizeAfterRender();if(!interacting()&&before!==statePage()&&!fieldOpen())window.scrollTo({top:0,left:0,behavior:'instant'});}));return result;}stableOpenPage.h38ScreenStable=true;stableOpenPage.h38Base=base;window.openPage=stableOpenPage;}
function activeVisit(){return window.H38_FIELD_VISIT_CORE?.state?.visit||null;}
function reviewRecordExists(sessionId){const rows=Array.isArray(window.state?.snapshot?.siteAiReviews)?window.state.snapshot.siteAiReviews:[];return rows.some(row=>String(row?.['Capture Session ID']||row?.captureSessionId||'')===String(sessionId||''));}
function clearTerminalPresentation(){const card=document.getElementById('h38GuidedController');card?.querySelector('.h38-review-terminal-note')?.remove();card?.removeAttribute('data-h38-review-terminal');}
function showTerminalPresentation(message){const card=document.getElementById('h38GuidedController');if(!card)return;card.setAttribute('data-h38-review-terminal','1');card.querySelector('.h38-guided-working')?.remove();const title=card.querySelector('.h38-guided-title strong');if(title)title.textContent='Review complete';const subtitle=card.querySelector('.h38-guided-title small');if(subtitle)subtitle.textContent='No actionable findings from the current evidence.';let note=card.querySelector('.h38-review-terminal-note');if(!note){note=document.createElement('div');note.className='h38-review-terminal-note';note.innerHTML='<strong>Nothing else required from this walkthrough yet</strong><span></span>';card.querySelector('.h38-guided-title')?.insertAdjacentElement('afterend',note);}const span=note?.querySelector('span');if(span)span.textContent=message;card.querySelectorAll('.h38-guided-section p').forEach(p=>{if(/still processing|reading the saved|reviewing walkthrough/i.test(String(p.textContent||'')))p.textContent='No additional finding was produced from the current evidence.';});const next=card.querySelector('.h38-guided-next.done strong');if(next)next.textContent='Add a spoken/typed note, measurement, or detail photo if you want H38 to analyze more.';}
async function settleWalkthroughReview(){if(!mobile()||!fieldOpen())return;const v=activeVisit(),s=v?.walkthroughAi;if(!v?.sessionId||!s)return;const status=String(s.status||'').toUpperCase(),key=String(v.sessionId);if(!['SYNCING','ANALYZING'].includes(status)){reviewWorkingSince.delete(key);if(status!=='NEEDS_INPUT')clearTerminalPresentation();else showTerminalPresentation(String(s.message||'Add a note, measurement, or detail photo to continue.'));return;}if(reviewRecordExists(v.sessionId)){reviewWorkingSince.delete(key);return;}if(!reviewWorkingSince.has(key))reviewWorkingSince.set(key,Date.now());if(Date.now()-reviewWorkingSince.get(key)<REVIEW_WORK_MAX_MS)return;s.status='NEEDS_INPUT';s.message='The walkthrough is saved, but H38 did not find enough actionable evidence to produce another field recommendation. Add a spoken or typed note, a measurement, or a detail photo, then tap Reanalyze current evidence.';s.updatedAt=new Date().toISOString();reviewWorkingSince.delete(key);try{await window.H38_FIELD_VISIT_CORE?.saveDraft?.();}catch(_){}try{window.H38_FIELD_VISIT_GUIDANCE?.decorate?.(true);}catch(_){}setTimeout(()=>showTerminalPresentation(s.message),0);try{window.toast?.('Walkthrough saved. No additional field input is required unless you want H38 to analyze more.',false);}catch(_){}}
installStyle();setViewportVars();['pointerdown','touchstart','wheel','keydown'].forEach(name=>window.addEventListener(name,markInteraction,{passive:true,capture:true}));window.visualViewport?.addEventListener('resize',schedule,{passive:true});window.addEventListener('resize',schedule,{passive:true});window.addEventListener('orientationchange',()=>setTimeout(schedule,120),{passive:true});window.addEventListener('pageshow',()=>{wrapOpenPage();stabilizeAfterRender();});window.addEventListener('focus',stabilizeAfterRender);const observer=new MutationObserver(()=>{wrapOpenPage();if(statePage()!=='work')schedule();if(activeVisit()?.walkthroughAi?.status==='NEEDS_INPUT')showTerminalPresentation(activeVisit().walkthroughAi.message);});observer.observe(document.body,{childList:true,subtree:true});setInterval(()=>void settleWalkthroughReview(),2500);setTimeout(()=>{wrapOpenPage();stabilizeAfterRender();void settleWalkthroughReview();},0);setTimeout(()=>{wrapOpenPage();stabilizeAfterRender();void settleWalkthroughReview();},800);
window.H38_MOBILE_RUNTIME_STABILITY=Object.freeze({build:BUILD,publishedOfficeAuthority:true,nativeShellHardwareOnly:true,dynamicViewport:true,safeAreaBottom:true,fixedNavIsolation:true,fieldVisitSingleBottomNav:true,keyboardZoomGuard:true,screenInstabilityGuard:true,officeDocumentScroll:true,scrollRegressionRepair:true,officeOverscrollBounceDisabled:true,officeOverscrollContained:true,officeVerticalPanPreserved:true,staleFieldDomDoesNotLockOfficeScroll:true,jobsMutationScrollChurnDisabled:true,visualViewportScrollStabilizerDisabled:true,walkthroughReviewTerminalState:true,walkthroughReviewMaxWorkingMs:REVIEW_WORK_MAX_MS,noInfiniteReviewSpinner:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false});
})();
