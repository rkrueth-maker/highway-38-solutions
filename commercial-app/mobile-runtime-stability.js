(function(){
'use strict';
const BUILD='20260816-mobile-runtime-stability-2';
const MOBILE='(max-width: 760px)';
let resizeTimer=0;
let interactionUntil=0;
function mobile(){return !!window.matchMedia?.(MOBILE).matches;}
function interacting(){return Date.now()<interactionUntil;}
function markInteraction(){interactionUntil=Date.now()+700;}
function statePage(){try{return String(window.state?.page||'');}catch(_){return'';}}
function fieldOpen(){return document.body.classList.contains('field-visit-open')||!!document.getElementById('h38FieldVisitApp');}
function setViewportVars(){const viewport=window.visualViewport;const height=Math.round(viewport?.height||window.innerHeight||0);if(height)document.documentElement.style.setProperty('--h38-mobile-vh',`${height}px`);}
function installStyle(){if(document.getElementById('h38MobileRuntimeStabilityStyle'))return;const style=document.createElement('style');style.id='h38MobileRuntimeStabilityStyle';style.textContent=`
html,body{max-width:100%;overflow-x:hidden}body{min-height:100dvh;background:var(--bg,#eef3f6)}
#mainContent{overflow-anchor:none;min-width:0}.h38-five-primary-nav{isolation:isolate}
@media(max-width:760px){
 html{height:auto!important;min-height:100%!important;overflow-y:auto!important;touch-action:pan-y}
 body:not(.field-visit-open){height:auto!important;min-height:100%!important;overflow-y:auto!important;overscroll-behavior-y:auto!important;touch-action:pan-y;-webkit-overflow-scrolling:touch}
 .topbar{position:sticky;top:0;z-index:1600;transform:translateZ(0);backface-visibility:hidden}
 .topbar .brand{min-width:0;overflow:hidden}.topbar .brand>div{min-width:0}.topbar .brand strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px}.topbar .brand small{display:none}
 .business-bar:empty{display:none}.business-bar{position:relative;z-index:1500}
 body:not(.field-visit-open) .app-shell{height:auto!important;min-height:0!important;overflow:visible!important;touch-action:pan-y}
 body:not(.field-visit-open) #mainContent{box-sizing:border-box;width:100%;height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important;overflow-y:visible!important;padding-bottom:calc(104px + env(safe-area-inset-bottom,0px))!important;contain:none!important;touch-action:pan-y}
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
}
`;document.head.appendChild(style);}
function restoreOfficeScroll(){if(!mobile()||fieldOpen())return;document.documentElement.style.removeProperty('overflow-y');document.body.style.removeProperty('overflow-y');for(const node of [document.querySelector('.app-shell'),document.getElementById('mainContent')]){if(!node)continue;node.style.removeProperty('height');node.style.removeProperty('max-height');node.style.removeProperty('overflow');node.style.removeProperty('overflow-y');}}
function cleanFixedLayer(){if(!mobile())return;const nav=document.getElementById('mainNav');if(nav?.classList.contains('h38-five-primary-nav'))nav.setAttribute('data-h38-stable-fixed','1');}
function restoreChrome(){document.querySelectorAll('.topbar,.business-bar,.app-shell,#mainNav,#mainContent').forEach(node=>{node?.style.removeProperty('visibility');node?.style.removeProperty('opacity');});}
function stabilizeAfterRender(){if(!mobile())return;setViewportVars();cleanFixedLayer();if(!fieldOpen()){restoreChrome();restoreOfficeScroll();}}
function schedule(){clearTimeout(resizeTimer);resizeTimer=setTimeout(stabilizeAfterRender,40);}
function wrapOpenPage(){if(typeof window.openPage!=='function'||window.openPage.h38ScreenStable)return;const base=window.openPage;function stableOpenPage(key,...args){const before=statePage();const result=base.call(this,key,...args);requestAnimationFrame(()=>requestAnimationFrame(()=>{stabilizeAfterRender();if(!interacting()&&before!==statePage()&&!fieldOpen())window.scrollTo({top:0,left:0,behavior:'instant'});}));return result;}stableOpenPage.h38ScreenStable=true;stableOpenPage.h38Base=base;window.openPage=stableOpenPage;}
installStyle();setViewportVars();['pointerdown','touchstart','wheel','keydown'].forEach(name=>window.addEventListener(name,markInteraction,{passive:true,capture:true}));window.visualViewport?.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule,{passive:true});window.addEventListener('orientationchange',()=>setTimeout(schedule,120),{passive:true});window.addEventListener('pageshow',()=>{wrapOpenPage();stabilizeAfterRender();});window.addEventListener('focus',stabilizeAfterRender);const observer=new MutationObserver(()=>{wrapOpenPage();schedule();});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>{wrapOpenPage();stabilizeAfterRender();},0);setTimeout(()=>{wrapOpenPage();stabilizeAfterRender();},800);
window.H38_MOBILE_RUNTIME_STABILITY=Object.freeze({build:BUILD,publishedOfficeAuthority:true,nativeShellHardwareOnly:true,dynamicViewport:true,safeAreaBottom:true,fixedNavIsolation:true,fieldVisitSingleBottomNav:true,keyboardZoomGuard:true,screenInstabilityGuard:true,officeDocumentScroll:true,scrollRegressionRepair:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false});
})();
