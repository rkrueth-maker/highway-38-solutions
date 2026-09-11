(function(){
'use strict';
const BUILD='20260911-cross-platform-assistant-polish-3-launch-stability';
let lastSearchTrigger=null;
let shellSyncTimer=0;
let applyScheduled=false;

function text(value){return String(value==null?'':value).trim();}
function setText(node,value){const next=String(value==null?'':value);if(node&&node.textContent!==next)node.textContent=next;}
function searchDialog(){return document.getElementById('h38OfficeSearchDialog');}
function androidNative(){return /H38SiteScannerAndroid\//.test(String(navigator.userAgent||''))||!!window.AndroidH38Native;}
function iosLike(){return /iPhone|iPad|iPod/i.test(String(navigator.userAgent||''));}
function isStaff(){
  const user=window.state?.snapshot?.user||{};
  const role=text(user.roleId||user.roleName||user.role).toLowerCase();
  return role==='staff'||document.body.classList.contains('h38-employee-mode');
}
function ownerLabel(){
  const user=window.state?.snapshot?.user||{};
  const auth=window.H38_SUPABASE_AUTH?.getState?.()||{};
  return text(user.displayName||user.name||user.email||auth.user?.email||auth.email||'your signed-in account');
}
function resetSearch(dialog){
  const input=dialog?.querySelector('#h38OfficeSearchInput');
  const results=dialog?.querySelector('#h38OfficeSearchResults');
  if(input){input.value='';input.blur();}
  if(results&&results.innerHTML!=='<p class="muted">Type at least two characters.</p>')results.innerHTML='<p class="muted">Type at least two characters.</p>';
}
function closeSearch(reason='close'){
  const dialog=searchDialog();
  if(!dialog||!dialog.open)return false;
  resetSearch(dialog);
  try{dialog.close(reason);}catch(_){dialog.removeAttribute('open');}
  const target=lastSearchTrigger||document.getElementById('h38OfficeSearchButton');
  setTimeout(()=>{try{target?.focus?.({preventScroll:true});}catch(_){}},0);
  return true;
}
function polishSearch(){
  const dialog=searchDialog();
  if(!dialog||dialog.dataset.h38OfficePolished==='1')return;
  dialog.dataset.h38OfficePolished='1';
  const shell=dialog.querySelector('.h38-search-shell');
  shell?.setAttribute('role','search');
  const input=dialog.querySelector('#h38OfficeSearchInput');
  if(input){input.setAttribute('aria-label','Search Business Office');input.setAttribute('enterkeyhint','search');}
  const close=dialog.querySelector('header button');
  if(close){
    close.type='button';
    close.removeAttribute('value');
    close.classList.add('h38-search-close');
    close.setAttribute('aria-label','Close Business Office search');
    close.innerHTML='<span aria-hidden="true">×</span><span class="h38-search-close-label">Close</span>';
    close.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();closeSearch('close');});
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeSearch('cancel');});
  dialog.addEventListener('click',event=>{if(event.target===dialog)closeSearch('backdrop');});
  dialog.addEventListener('close',()=>resetSearch(dialog));
}
function bindSearchTrigger(button){
  if(!button||button.dataset.h38OfficePolishTrigger==='1')return;
  button.dataset.h38OfficePolishTrigger='1';
  button.setAttribute('aria-haspopup','dialog');
  button.setAttribute('title','Search Business Office');
  button.addEventListener('click',()=>{lastSearchTrigger=button;queueMicrotask(polishSearch);});
}
function installPlatformClasses(){
  const root=document.documentElement;
  root.classList.toggle('h38-native-android',androidNative());
  root.classList.toggle('h38-ios-like',iosLike());
  root.classList.add('h38-cross-platform-shell');
}
function syncShellTop(){
  clearTimeout(shellSyncTimer);
  shellSyncTimer=setTimeout(()=>{
    if(!matchMedia('(max-width:760px)').matches)return;
    let bottom=0;
    for(const node of [document.querySelector('.topbar'),document.querySelector('.business-bar')]){
      if(!node||node.hidden)continue;
      try{
        const style=getComputedStyle(node);
        if(style.display==='none'||style.visibility==='hidden'||!node.getClientRects().length)continue;
        bottom=Math.max(bottom,Math.ceil(node.getBoundingClientRect().bottom));
      }catch(_){}
    }
    if(bottom>0){
      const next=`${bottom}px`;
      if(document.documentElement.style.getPropertyValue('--h38-office-shell-top')!==next)document.documentElement.style.setProperty('--h38-office-shell-top',next);
    }
  },0);
}
function openUnifiedAssistant(event){
  if(isStaff())return;
  event?.preventDefault?.();
  event?.stopImmediatePropagation?.();
  try{
    if(window.H38_PERSONAL_ASSISTANT&&typeof window.openPage==='function'){
      window.openPage('assistant');
      return true;
    }
  }catch(_){}
  try{
    if(typeof window.openPage==='function'){
      window.openPage('assistant');
      if(window.state?.page==='assistant')return true;
    }
  }catch(_){}
  try{window.openGlobalAi?.();return true;}catch(_){return false;}
}
function syncAssistantBadge(){
  const source=document.querySelector('#personalAssistantButton .pa-due-dot');
  const launcher=document.getElementById('globalAiButton');
  if(!launcher)return;
  let badge=launcher.querySelector('.h38-floating-due');
  const count=text(source?.textContent);
  if(!count){badge?.remove();return;}
  if(!badge){badge=document.createElement('span');badge.className='h38-floating-due';launcher.appendChild(badge);}
  setText(badge,count);
}
function polishAssistantLauncher(){
  const personal=document.getElementById('personalAssistantButton');
  if(personal){personal.hidden=true;personal.tabIndex=-1;personal.setAttribute('aria-hidden','true');}
  const launcher=document.getElementById('globalAiButton');
  if(launcher){
    launcher.classList.add('h38-floating-assistant','h38-polish-touch');
    launcher.setAttribute('aria-label','Open My H38 Assistant');
    launcher.setAttribute('title','My H38 Assistant');
    if(launcher.dataset.h38UnifiedAssistant!=='1'){
      launcher.dataset.h38UnifiedAssistant='1';
      launcher.innerHTML='<span class="h38-floating-assistant-icon" aria-hidden="true">✦</span><span class="h38-floating-assistant-label">Ask H38</span>';
      launcher.addEventListener('click',openUnifiedAssistant,true);
    }
  }
  syncAssistantBadge();
}
function commandButton(label,command){
  const button=document.createElement('button');
  button.type='button';
  button.className='secondary h38-assistant-chip';
  button.textContent=label;
  button.dataset.h38AssistantCommand=command;
  button.addEventListener('click',()=>{
    const form=document.getElementById('paCommandForm'),input=form?.querySelector('[name="command"]');
    if(!form||!input)return;
    input.value=command;
    form.requestSubmit();
  });
  return button;
}
function ensureOwnerNote(main){
  let note=main.querySelector('.h38-owner-assistant-note');
  if(note)return note;
  note=document.createElement('div');
  note.className='h38-owner-assistant-note';
  const strong=document.createElement('strong');strong.textContent='Your private assistant';
  const span=document.createElement('span');
  note.append(strong,span);
  main.querySelector('.pa-shell')?.prepend(note);
  return note;
}
function decorateAssistantPage(){
  if(window.state?.page!=='assistant')return;
  const main=document.getElementById('mainContent');
  const form=document.getElementById('paCommandForm');
  if(!main||!form)return;
  const heading=main.querySelector('.page-head h1');
  setText(heading,'My H38 Assistant');
  const intro=main.querySelector('.page-head p');
  setText(intro,'Private to your sign-in. Ask questions, manage personal reminders, or give H38 Business Office commands.');
  const label=form.querySelector('label');
  setText(label,'Ask or command H38');
  const input=form.querySelector('[name="command"]');
  if(input){
    input.setAttribute('placeholder','Open Smith customer  |  Start quote for Johnson  |  Show inventory  |  Remind me to call supplier tomorrow');
    input.setAttribute('enterkeyhint','send');
  }
  const ownerNote=ensureOwnerNote(main);
  const ownerSpan=ownerNote?.querySelector('span');
  setText(ownerSpan,`Personal items belong only to ${ownerLabel()}. Business commands use your current Office permissions and existing review gates.`);
  if(!form.querySelector('.h38-assistant-command-chips')){
    const chips=document.createElement('div');
    chips.className='h38-assistant-command-chips';
    chips.append(
      commandButton('My day','What do I need to do today?'),
      commandButton('Open jobs','Open jobs'),
      commandButton('Find customer','Open customer Smith'),
      commandButton('Show schedule','Show schedule'),
      commandButton('Agent status','Agent status')
    );
    form.insertBefore(chips,form.firstChild);
  }
}
function polishTouchTargets(){
  bindSearchTrigger(document.getElementById('h38OfficeSearchButton'));
  bindSearchTrigger(document.getElementById('h38AssistantSearch'));
  bindSearchTrigger(document.getElementById('h38OpenLifecycleSearch'));
  document.getElementById('h38OfficeSearchButton')?.classList.add('h38-polish-touch');
}
function apply(){
  installPlatformClasses();
  polishSearch();
  polishTouchTargets();
  polishAssistantLauncher();
  decorateAssistantPage();
  syncShellTop();
}
function scheduleApply(){
  if(applyScheduled)return;
  applyScheduled=true;
  const run=()=>{applyScheduled=false;apply();};
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);
}

const observer=new MutationObserver(scheduleApply);
observer.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&searchDialog()?.open){event.preventDefault();closeSearch('escape');}},true);
window.addEventListener('resize',syncShellTop,{passive:true});
window.visualViewport?.addEventListener('resize',syncShellTop,{passive:true});
window.visualViewport?.addEventListener('scroll',syncShellTop,{passive:true});
window.addEventListener('pageshow',scheduleApply);
apply();

window.H38_OFFICE_POLISH=Object.freeze({
  enabled:true,
  build:BUILD,
  searchExitGuaranteed:true,
  closeSearch,
  quoteAiChanged:false,
  navigationAuthority:false,
  unifiedAssistantLauncher:true,
  personalAssistantPrivatePerUser:true,
  businessCommandBusPreserved:true,
  androidSafeArea:true,
  iosSafeAreaReady:true,
  mutationFeedbackLoopPrevented:true,
  mutationObserverCoalesced:true,
  nativeIosShellCreated:false
});
})();

(function(){
'use strict';
const BUILD='20260905-assistant-management-commands-1';
const text=value=>String(value==null?'':value).trim();
const lower=value=>text(value).toLowerCase();
let scheduled=false;

function isStaff(){
  const user=window.state?.snapshot?.user||{};
  const role=lower(user.roleId||user.roleName||user.role);
  return role==='staff'||document.body.classList.contains('h38-employee-mode');
}
function businessControlKind(command){
  const q=lower(command);
  if(!q)return'';
  if(/\b(team access|team directory|employee access|staff access|manage employees?|employee accounts?)\b/.test(q))return'team';
  if(/\b(existing[- ]data uptake|data uptake|import (?:existing|historical|old) data|historical import|bring in (?:old|existing) data)\b/.test(q))return'data';
  if(/\b(quote learning|business quote learning|quote history|pricing history|labor history|learn(?:ing)? from (?:quotes|jobs|history)|analy[sz]e (?:this )?business|analy[sz]e .*quote)\b/.test(q))return'learning';
  if(/\b(time\s*&\s*attendance|time and attendance|time attendance|time clock|time details|timesheets?|time entries|attendance)\b/.test(q))return'time';
  if(/\b(task manager|deployment|assign(?:ed)? tasks?|team tasks?)\b/.test(q))return'tasks';
  if(/\b(erp center|h38 erp|erp)\b/.test(q))return'erp';
  return'';
}
function focusWhenReady(selector,activate=false){
  if(!selector)return;
  let tries=0;
  const check=()=>{
    const node=document.querySelector(selector);
    if(node){
      try{(node.closest?.('.h38-erp-section')||node).scrollIntoView?.({block:'start'});}catch(_){}
      if(activate)try{node.click?.();}catch(_){}
      return;
    }
    if(++tries<30)setTimeout(check,100);
  };
  setTimeout(check,60);
}
function triggerErp(target){
  if(!document.body)return false;
  const selector=`[data-h38-erp-open="${target}"]`;
  const existing=document.querySelector(selector);
  if(existing){existing.click();return true;}
  const proxy=document.createElement('button');
  proxy.type='button';
  proxy.hidden=true;
  proxy.dataset.h38ErpOpen=target;
  document.body.appendChild(proxy);
  proxy.click();
  proxy.remove();
  return true;
}
function openErpSurface(target='erp',selector='',activate=false){
  let opened=false;
  const run=()=>{
    if(opened||!window.H38_ERP_FOUNDATION)return false;
    opened=true;
    triggerErp(target);
    focusWhenReady(selector,activate);
    return true;
  };
  if(run())return true;
  let script=document.querySelector('script[data-h38-erp-foundation]');
  if(!script&&document.body){
    script=document.createElement('script');
    script.src='./erp-foundation.js?build=20260903-erp-time-uptake-learning-2';
    script.async=false;
    script.dataset.h38ErpFoundation='assistant-management-commands';
    document.body.appendChild(script);
  }
  let tries=0;
  const timer=setInterval(()=>{if(run()||++tries>=30)clearInterval(timer);},100);
  return true;
}
async function handleBusinessControl(command){
  const kind=businessControlKind(command);
  if(!kind)return'';
  if(kind==='tasks'){
    try{window.openPage?.('work');}catch(_){}
    return'Opened Jobs & Task Manager. Assignment and deployment changes still require the explicit Task Manager controls.';
  }
  if(isStaff())return'That management control is owner/administrator-only. Employee mode stays limited to your assigned work and your own time punch.';
  if(kind==='time'){
    openErpSurface('time','#h38ErpTime',false);
    return'Opened Time & attendance. The assistant does not clock, edit, or approve time; use the audited time controls.';
  }
  if(kind==='team'){
    openErpSurface('erp','#h38TeamAccess',false);
    return'Opened Team Access in ERP Center. Adding, changing, or removing employee access still requires the explicit Team Access controls.';
  }
  if(kind==='data'){
    openErpSurface('erp','#h38DataUptake',false);
    return'Opened Existing-data uptake in ERP Center. H38 does not stage or apply an import until you use those explicit controls.';
  }
  if(kind==='learning'){
    const runAnalysis=/\b(analy[sz]e|run|check|review|learn from)\b/.test(lower(command));
    openErpSurface('erp',runAnalysis?'[data-h38-learning]':'#h38QuoteLearning',runAnalysis);
    return runAnalysis?'Opened Business-specific quote learning and started the internal advisory analysis. It does not change quote prices, approve, or send anything.':'Opened Business-specific quote learning. It remains tenant-only and advisory.';
  }
  openErpSurface('erp','',false);
  return'Opened H38 ERP Center. External actions remain owner-controlled.';
}
function augmentCommandBus(){
  const base=window.H38_ASSISTANT_COMMAND_BUS;
  if(!base?.canHandle||!base?.handle||base.h38CrossPlatformBusinessControls===true)return;
  const baseCanHandle=base.canHandle.bind(base);
  const baseHandle=base.handle.bind(base);
  const canHandle=command=>!!businessControlKind(command)||baseCanHandle(command);
  const handle=async(command,options={})=>businessControlKind(command)?handleBusinessControl(command):baseHandle(command,options);
  window.H38_ASSISTANT_COMMAND_BUS=Object.freeze({
    ...base,
    build:`${text(base.build)||'assistant-command-bus'}+${BUILD}`,
    canHandle,
    handle,
    h38CrossPlatformBusinessControls:true,
    erpCenterCommands:true,
    timeAttendanceCommands:true,
    teamAccessCommands:true,
    dataUptakeCommands:true,
    quoteLearningCommands:true,
    taskManagerCommands:true,
    automaticTimePunch:false,
    automaticTeamAccessChange:false,
    automaticDataImportApply:false,
    automaticQuoteLearningMutation:false
  });
  window.dispatchEvent(new CustomEvent('h38:assistant-command-bus-ready',{detail:{build:BUILD,managementCommands:true}}));
}
function augmentPersonalAssistant(){
  const pa=window.H38_PERSONAL_ASSISTANT;
  const bus=window.H38_ASSISTANT_COMMAND_BUS;
  if(!pa?.runCommand||!bus?.h38CrossPlatformBusinessControls||pa.h38CrossPlatformBusinessControls===true)return;
  const baseRun=pa.runCommand.bind(pa);
  window.H38_PERSONAL_ASSISTANT=Object.freeze({
    ...pa,
    build:`${text(pa.build)||'personal-assistant'}+${BUILD}`,
    runCommand:async command=>businessControlKind(command)?bus.handle(command,{source:'my-h38-assistant-management'}):baseRun(command),
    h38CrossPlatformBusinessControls:true,
    managementCommandsUseExistingAuthorities:true
  });
}
function managementChip(container,label,command,key){
  if(container.querySelector(`[data-h38-business-control-chip="${key}"]`))return;
  const button=document.createElement('button');
  button.type='button';
  button.className='secondary h38-assistant-chip';
  button.dataset.h38BusinessControlChip=key;
  button.textContent=label;
  button.addEventListener('click',()=>{
    const form=document.getElementById('paCommandForm'),input=form?.querySelector('[name="command"]');
    if(!form||!input)return;
    input.value=command;
    form.requestSubmit();
  });
  container.appendChild(button);
}
function addManagementChips(){
  if(window.state?.page!=='assistant'||isStaff())return;
  const chips=document.querySelector('#paCommandForm .h38-assistant-command-chips');
  if(!chips)return;
  managementChip(chips,'ERP center','Open ERP Center','erp');
  managementChip(chips,'Time & attendance','Open Time & Attendance','time');
  managementChip(chips,'Team access','Open Team Access','team');
}
function publishFlags(){
  const current=window.H38_OFFICE_POLISH||{};
  if(current.erpAssistantCommands===true)return;
  window.H38_OFFICE_POLISH=Object.freeze({
    ...current,
    erpAssistantCommands:true,
    timeAttendanceAssistantCommands:true,
    teamAccessAssistantCommands:true,
    dataUptakeAssistantCommands:true,
    quoteLearningAssistantCommands:true,
    taskManagerAssistantCommands:true,
    automaticTimePunch:false,
    automaticTeamAccessChange:false,
    automaticDataImportApply:false,
    automaticQuoteLearningMutation:false
  });
}
function apply(){
  augmentCommandBus();
  augmentPersonalAssistant();
  addManagementChips();
  publishFlags();
}
function schedule(){
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{scheduled=false;apply();});
}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('h38:assistant-command-bus-ready',schedule);
window.addEventListener('h38:business-snapshot-updated',schedule);
window.addEventListener('pageshow',schedule);
apply();
})();