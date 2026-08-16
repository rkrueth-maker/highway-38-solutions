(function(){
'use strict';
const BUILD='20260816-mobile-scroll-restore-1';
const MOBILE='(max-width: 760px)';
function install(){
  if(document.getElementById('h38MobileScrollRestoreStyle'))return;
  const style=document.createElement('style');
  style.id='h38MobileScrollRestoreStyle';
  style.textContent=`
@media(max-width:760px){
  html{height:auto!important;min-height:100%!important;overflow-x:hidden!important;overflow-y:auto!important;touch-action:pan-y!important}
  body:not(.field-visit-open){height:auto!important;min-height:100%!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:auto!important;touch-action:pan-y!important;-webkit-overflow-scrolling:touch}
  body:not(.field-visit-open) .app-shell{height:auto!important;min-height:0!important;overflow:visible!important;touch-action:pan-y!important}
  body:not(.field-visit-open) #mainContent{height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important;overflow-y:visible!important;contain:none!important;touch-action:pan-y!important;-webkit-overflow-scrolling:touch}
  body:not(.field-visit-open) #mainContent>*{touch-action:pan-y manipulation}
  body:not(.field-visit-open) .card,body:not(.field-visit-open) .list,body:not(.field-visit-open) .row{touch-action:pan-y manipulation}
  body:not(.field-visit-open) #mainNav.h38-five-primary-nav{touch-action:manipulation!important}
}
`;
  document.head.appendChild(style);
}
function restore(){
  if(!window.matchMedia?.(MOBILE).matches)return;
  if(document.body.classList.contains('field-visit-open'))return;
  document.documentElement.style.removeProperty('overflow-y');
  document.body.style.removeProperty('overflow-y');
  const main=document.getElementById('mainContent');
  if(main){main.style.removeProperty('height');main.style.removeProperty('max-height');main.style.removeProperty('overflow');main.style.removeProperty('overflow-y');}
  const shell=document.querySelector('.app-shell');
  if(shell){shell.style.removeProperty('height');shell.style.removeProperty('max-height');shell.style.removeProperty('overflow');shell.style.removeProperty('overflow-y');}
}
install();
window.addEventListener('pageshow',restore);
window.addEventListener('focus',restore);
window.addEventListener('resize',restore,{passive:true});
document.addEventListener('click',()=>setTimeout(restore,0),true);
setTimeout(restore,0);setTimeout(restore,500);
window.H38_MOBILE_SCROLL_RESTORE=Object.freeze({build:BUILD,officeDocumentScroll:true,fieldVisitOwnScroll:true,fixedNavPreserved:true,screenStabilityPreserved:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false});
})();
