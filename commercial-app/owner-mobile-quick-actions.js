(function(){
'use strict';
const BUILD='20260915-owner-mobile-quick-actions-2';
const MOBILE='(max-width: 760px)';
const text=value=>String(value==null?'':value).trim();
function mobile(){return !!window.matchMedia?.(MOBILE).matches;}
function user(){return window.state?.snapshot?.user||{};}
function role(){const u=user();return text(u.roleName||u.roleId||u.role).toLowerCase();}
function manager(){const u=user();return !!(u.owner||u.permissions?.all||['owner','administrator','admin'].includes(role()));}
function closeQuick(){const d=document.getElementById('h38QuickCreateDialog');if(!d)return;try{d.close();}catch(_){d.removeAttribute('open');}}
function installStyle(){
  let style=document.getElementById('h38OwnerMobileQuickActionsStyle');
  if(!style){style=document.createElement('style');style.id='h38OwnerMobileQuickActionsStyle';document.head.appendChild(style);}
  const css=`@media(max-width:760px){
#mainNav.h38-five-primary-nav button{box-sizing:border-box!important;border-width:1px!important;margin:0!important;transform:none!important;translate:none!important;scale:1!important;animation:none!important;transition:background-color .12s ease,border-color .12s ease,box-shadow .12s ease!important;contain:layout paint!important}
#mainNav.h38-five-primary-nav button.active,#mainNav.h38-five-primary-nav button:active,#mainNav.h38-five-primary-nav button:focus-visible{transform:none!important;translate:none!important;scale:1!important}
#mainNav.h38-five-primary-nav button .nav-icon,#mainNav.h38-five-primary-nav button span{transform:none!important;translate:none!important}
body:not(.h38-employee-mode) #h38TimeClockCard{display:none!important}
}`;
  if(style.textContent!==css)style.textContent=css;
}
function triggerErp(target){
  if(!document.body)return false;
  const existing=document.querySelector(`[data-h38-erp-open="${target}"]`);
  if(existing){existing.click();return true;}
  const proxy=document.createElement('button');proxy.type='button';proxy.hidden=true;proxy.dataset.h38ErpOpen=target;document.body.appendChild(proxy);proxy.click();proxy.remove();return true;
}
function ensureErp(target){
  if(window.H38_ERP_FOUNDATION){triggerErp(target);return;}
  let script=document.querySelector('script[data-h38-erp-foundation]');
  if(!script){script=document.createElement('script');script.src='./erp-foundation.js?build=20260903-erp-time-uptake-learning-2';script.async=false;script.dataset.h38ErpFoundation='owner-mobile-quick-actions';document.body.appendChild(script);}
  let tries=0;const timer=setInterval(()=>{if(window.H38_ERP_FOUNDATION){clearInterval(timer);triggerErp(target);}else if(++tries>=40){clearInterval(timer);window.toast?.('Time controls are still loading. Try again.',true);}},100);
}
function openPersonalAssistant(){
  closeQuick();
  try{window.openPage?.('assistant');if(window.state?.page==='assistant')return;}catch(_){}
  document.getElementById('globalAiButton')?.click();
}
function openClock(){closeQuick();ensureErp('time');}
function focusOperations(){
  const panel=document.getElementById('h38OperationsActionCenter');
  if(panel){try{panel.scrollIntoView({block:'start',behavior:'smooth'});}catch(_){panel.scrollIntoView();}return true;}
  return false;
}
function openOperations(){
  closeQuick();
  try{window.openPage?.('today');}catch(_){}
  if(focusOperations())return;
  if(!window.H38_OPERATIONS_INTELLIGENCE&&!document.querySelector('script[data-h38-operations-intelligence]')){
    const script=document.createElement('script');script.src='./operations-intelligence.js?build=20260908-operations-intelligence-1';script.async=false;script.dataset.h38OperationsIntelligence='owner-mobile-quick-actions';document.body.appendChild(script);
  }
  let tries=0;const timer=setInterval(()=>{if(focusOperations()||++tries>=40){clearInterval(timer);if(tries>=40&&!document.getElementById('h38OperationsActionCenter'))window.toast?.('Operations Intelligence is not available for this account.',true);}},100);
}
function makeAction(key,icon,label,detail,handler){
  const button=document.createElement('button');button.type='button';button.dataset.h38OwnerQuick=key;button.innerHTML=`<span>${icon}</span><strong>${label}</strong><small>${detail}</small>`;button.onclick=handler;return button;
}
function patchQuickDialog(){
  if(!mobile())return;
  const dialog=document.getElementById('h38QuickCreateDialog'),grid=dialog?.querySelector('.h38-quick-grid');if(!dialog||!grid)return;
  const assistant=grid.querySelector('[data-h38-quick="assistant"]');
  if(assistant){
    const strong=assistant.querySelector('strong'),small=assistant.querySelector('small');
    if(strong&&text(strong.textContent)!=='Personal Assistant')strong.textContent='Personal Assistant';
    if(small&&text(small.textContent)!=='Private reminders and Office commands')small.textContent='Private reminders and Office commands';
    if(assistant.onclick!==openPersonalAssistant)assistant.onclick=openPersonalAssistant;
  }
  if(!grid.querySelector('[data-h38-owner-quick="time"]')){
    const clock=makeAction('time','⏱️','Clock In / Out','Open audited time controls',openClock);
    const meeting=grid.querySelector('[data-h38-quick="meeting"]');
    if(meeting?.nextSibling)grid.insertBefore(clock,meeting.nextSibling);else grid.appendChild(clock);
  }
  if(manager()&&!grid.querySelector('[data-h38-owner-quick="operations"]')){
    const ops=makeAction('operations','📊','Operations Intelligence','Owner action center and operating signals',openOperations);
    const assistantNow=grid.querySelector('[data-h38-quick="assistant"]');
    if(assistantNow)grid.insertBefore(ops,assistantNow);else grid.appendChild(ops);
  }
  if(dialog.dataset.h38OwnerMobileQuickActions!=='2')dialog.dataset.h38OwnerMobileQuickActions='2';
}
function clarifyAssistantLauncher(){
  if(!mobile()||!manager())return;
  const launcher=document.getElementById('globalAiButton');if(!launcher)return;
  if(launcher.getAttribute('aria-label')!=='Open Personal Assistant')launcher.setAttribute('aria-label','Open Personal Assistant');
  if(launcher.getAttribute('title')!=='Personal Assistant')launcher.setAttribute('title','Personal Assistant');
  const label=launcher.querySelector('.h38-floating-assistant-label');if(label&&text(label.textContent)!=='Assistant')label.textContent='Assistant';
}
let applyQueued=false;
function apply(){
  applyQueued=false;
  if(!mobile())return;
  installStyle();patchQuickDialog();clarifyAssistantLauncher();
}
function scheduleApply(){if(applyQueued)return;applyQueued=true;queueMicrotask(apply);}
const observer=new MutationObserver(scheduleApply);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','open']});
window.addEventListener('pageshow',scheduleApply);window.addEventListener('h38:business-snapshot-updated',scheduleApply);window.addEventListener('resize',scheduleApply,{passive:true});
scheduleApply();
window.H38_OWNER_MOBILE_QUICK_ACTIONS=Object.freeze({enabled:true,build:BUILD,plusLocationPreserved:true,clockInOutUnderPlus:true,personalAssistantUnderPlus:true,operationsIntelligenceUnderPlus:true,ownerTodayClockCardHiddenOnMobile:true,bottomNavGeometryLocked:true,idempotentMutationObserver:true,openClock,openPersonalAssistant,openOperations,patchQuickDialog});
})();
