(function(){
'use strict';
const BUILD='20260926-shared-tool-labels-6';
const MOBILE='(max-width: 760px)';
const text=value=>String(value==null?'':value).trim();
let timeDialogMode=false;
function mobile(){return !!window.matchMedia?.(MOBILE).matches;}
function user(){return window.state?.snapshot?.user||{};}
function role(){const u=user();return text(u.roleName||u.roleId||u.role).toLowerCase();}
function manager(){const u=user();return !!(u.owner||u.permissions?.all||['owner','administrator','admin'].includes(role()));}
function closeQuick(){const d=document.getElementById('h38QuickCreateDialog');if(!d)return;try{d.close();}catch(_){d.removeAttribute('open');}}
function installStyle(){
  let style=document.getElementById('h38OwnerMobileQuickActionsStyle');
  if(!style){style=document.createElement('style');style.id='h38OwnerMobileQuickActionsStyle';document.head.appendChild(style);}
  const css=`#h38TimeClockCard{display:none!important}
#h38ErpDialog[data-h38-time-only="1"] .h38-erp-body>.h38-erp-section:not(#h38ErpTime){display:none!important}
@media(max-width:760px){
#mainNav.h38-five-primary-nav button{box-sizing:border-box!important;border-width:1px!important;margin:0!important;transform:none!important;translate:none!important;scale:1!important;animation:none!important;transition:background-color .12s ease,border-color .12s ease,box-shadow .12s ease!important;contain:layout paint!important}
#mainNav.h38-five-primary-nav button.active,#mainNav.h38-five-primary-nav button:active,#mainNav.h38-five-primary-nav button:focus-visible{transform:none!important;translate:none!important;scale:1!important}
#mainNav.h38-five-primary-nav button .nav-icon,#mainNav.h38-five-primary-nav button span{transform:none!important;translate:none!important}
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
function polishTimeDialog(){
  const dialog=document.getElementById('h38ErpDialog');if(!dialog)return false;
  if(!timeDialogMode){delete dialog.dataset.h38TimeOnly;return false;}
  dialog.dataset.h38TimeOnly='1';
  const title=dialog.querySelector('.h38-erp-head strong');if(title&&text(title.textContent)!=='Time & Attendance')title.textContent='Time & Attendance';
  const note=dialog.querySelector('.h38-erp-head .h38-erp-note');if(note&&text(note.textContent)!=='Clock in or out and review audited time records.')note.textContent='Clock in or out and review audited time records.';
  if(dialog.dataset.h38TimeModeBound!=='1'){
    dialog.dataset.h38TimeModeBound='1';
    dialog.addEventListener('close',()=>{timeDialogMode=false;delete dialog.dataset.h38TimeOnly;},{passive:true});
  }
  return true;
}
function openClock(){timeDialogMode=true;closeQuick();ensureErp('time');setTimeout(polishTimeDialog,0);}
function focusOperations(){
  const panel=document.getElementById('h38OperationsJobPanel');
  if(panel){try{panel.scrollIntoView({block:'start',behavior:'smooth'});}catch(_){panel.scrollIntoView();}return true;}
  return false;
}
function openOperationsBrief(){
  try{
    const api=window.H38_OPERATIONS_INTELLIGENCE;
    if(!api)return false;
    focusOperations();
    api.openPreVisitBrief?.();
    return true;
  }catch(_){return false;}
}
function openOperations(){
  closeQuick();
  try{window.openPage?.('work');}catch(_){}
  if(openOperationsBrief())return;
  if(!document.querySelector('script[data-h38-operations-intelligence]')){
    const script=document.createElement('script');
    script.src='./operations-intelligence.js?build=20260908-operations-intelligence-1';
    script.async=false;
    script.dataset.h38OperationsIntelligence='owner-mobile-quick-actions';
    script.addEventListener('load',()=>{if(!openOperationsBrief())window.toast?.('Operations Intelligence is not available for this account.',true);},{once:true});
    document.body.appendChild(script);
    return;
  }
  let tries=0;const timer=setInterval(()=>{if(openOperationsBrief()){clearInterval(timer);return;}if(++tries>=40){clearInterval(timer);window.toast?.('Operations Intelligence is not available for this account.',true);}},100);
}
function makeAction(key,icon,label,detail,handler){
  const button=document.createElement('button');button.type='button';button.dataset.h38OwnerQuick=key;button.innerHTML=`<span>${icon}</span><strong>${label}</strong><small>${detail}</small>`;button.onclick=handler;return button;
}
function patchQuickDialog(){
  const dialog=document.getElementById('h38QuickCreateDialog'),grid=dialog?.querySelector('.h38-quick-grid');if(!dialog||!grid)return;
  const assistant=grid.querySelector('[data-h38-quick="assistant"]');
  if(assistant)assistant.remove();
  if(!grid.querySelector('[data-h38-owner-quick="time"]')){
    const clock=makeAction('time','⏱️','Clock In / Out','Clock in, clock out, or review audited time',openClock);
    const meeting=grid.querySelector('[data-h38-quick="meeting"]');
    if(meeting?.nextSibling)grid.insertBefore(clock,meeting.nextSibling);else grid.appendChild(clock);
  }
  const existingOps=grid.querySelector('[data-h38-owner-quick="operations"]');
  if(mobile()&&manager()&&!existingOps){
    const ops=makeAction('operations','📊','Operations Intelligence','Pre-visit brief and operating signals',openOperations);
    grid.appendChild(ops);
  }else if(!mobile()&&existingOps)existingOps.remove();
  if(dialog.dataset.h38OwnerMobileQuickActions!=='6')dialog.dataset.h38OwnerMobileQuickActions='6';
}
function normalizeInstallText(root){
  if(!root)return false;
  let changed=false;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
    const parent=node.parentElement;if(!parent||/^(SCRIPT|STYLE)$/i.test(parent.tagName))continue;
    const value=String(node.nodeValue||'');
    const next=value.replace(/\bInstall H38 Office\b/g,'Install Business Office').replace(/\bInstall H38\b/g,'Install Office').replace(/\bH38 Office\b/g,'Business Office');
    if(next!==value){node.nodeValue=next;changed=true;}
  }
  return changed;
}
function normalizeSharedToolLabels(){
  const launcher=document.getElementById('globalAiButton');
  if(launcher){
    if(launcher.getAttribute('aria-label')!=='Open Assistant')launcher.setAttribute('aria-label','Open Assistant');
    if(launcher.getAttribute('title')!=='Assistant')launcher.setAttribute('title','Assistant');
    launcher.querySelectorAll('.h38-floating-assistant-label,.ai-launcher-label').forEach(label=>{if(text(label.textContent)!=='Assistant')label.textContent='Assistant';});
  }
  const aiDialog=document.getElementById('globalAiDialog');if(aiDialog&&aiDialog.getAttribute('aria-label')!=='Assistant')aiDialog.setAttribute('aria-label','Assistant');
  const voice=document.getElementById('voiceButton');if(voice&&voice.getAttribute('aria-label')!=='Talk to Assistant')voice.setAttribute('aria-label','Talk to Assistant');
  if(Array.isArray(window.PAGE_DEFS?.ai)&&window.PAGE_DEFS.ai[1]!=='AI')window.PAGE_DEFS.ai[1]='AI';
  document.querySelectorAll('#mainNav [data-page="ai"] span:last-child').forEach(label=>{if(text(label.textContent)!=='AI')label.textContent='AI';});
  const install=document.getElementById('h38InstallOfficeButton');
  if(install){
    if(text(install.textContent)!=='Install Office')install.textContent='Install Office';
    if(install.getAttribute('aria-label')!=='Install Business Office app')install.setAttribute('aria-label','Install Business Office app');
    if(install.getAttribute('title')!=='Install Business Office')install.setAttribute('title','Install Business Office');
  }
  normalizeInstallText(document.querySelector('[data-h38-install-group]'));
  normalizeInstallText(document.getElementById('h38InstallOfficeDialog'));
  return true;
}
let applyQueued=false;
function apply(){
  applyQueued=false;
  installStyle();patchQuickDialog();polishTimeDialog();normalizeSharedToolLabels();
}
function scheduleApply(){if(applyQueued)return;applyQueued=true;queueMicrotask(apply);}
const observer=new MutationObserver(scheduleApply);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','open']});
window.addEventListener('pageshow',scheduleApply);window.addEventListener('h38:business-snapshot-updated',scheduleApply);window.addEventListener('h38:office-page-rendered',scheduleApply);window.addEventListener('resize',scheduleApply,{passive:true});
scheduleApply();
window.H38_OWNER_MOBILE_QUICK_ACTIONS=Object.freeze({enabled:true,build:BUILD,sharedOfficeEngine:true,plusLocationPreserved:true,clockInOutUnderPlus:true,clockInOutUnderPlusAllViewports:true,timeClockTodayCardHiddenAllViewports:true,timeDialogSeparatedFromErp:true,personalAssistantUnderPlus:false,globalAssistantCanonical:true,operationsIntelligenceUnderPlus:true,operationsIntelligenceAutoLoadsOnToday:false,operationsOpensWorkContext:true,ownerTodayClockCardHiddenOnMobile:true,staffTodayClockCardHiddenOnMobile:true,bottomNavGeometryLocked:true,idempotentMutationObserver:true,sharedToolLabelsNeutral:true,assistantLabelTenantNeutral:true,installLabelTenantNeutral:true,aiNavigationLabelTenantNeutral:true,openClock,openOperations,patchQuickDialog,polishTimeDialog,normalizeSharedToolLabels});
})();
