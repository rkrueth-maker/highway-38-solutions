(function(){
'use strict';
const BUILD='20260904-cross-platform-assistant-polish-1';
let lastSearchTrigger=null;
let shellSyncTimer=0;

function text(value){return String(value==null?'':value).trim();}
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
  if(results)results.innerHTML='<p class="muted">Type at least two characters.</p>';
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
    if(bottom>0)document.documentElement.style.setProperty('--h38-office-shell-top',`${bottom}px`);
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
  badge.textContent=count;
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
function decorateAssistantPage(){
  if(window.state?.page!=='assistant')return;
  const main=document.getElementById('mainContent');
  const form=document.getElementById('paCommandForm');
  if(!main||!form)return;
  const heading=main.querySelector('.page-head h1');
  if(heading)heading.textContent='My H38 Assistant';
  const intro=main.querySelector('.page-head p');
  if(intro)intro.textContent='Private to your sign-in. Ask questions, manage personal reminders, or give H38 Business Office commands.';
  const label=form.querySelector('label');
  if(label)label.textContent='Ask or command H38';
  const input=form.querySelector('[name="command"]');
  if(input){
    input.setAttribute('placeholder','Open Smith customer  |  Start quote for Johnson  |  Show inventory  |  Remind me to call supplier tomorrow');
    input.setAttribute('enterkeyhint','send');
  }
  let ownerNote=main.querySelector('.h38-owner-assistant-note');
  if(!ownerNote){
    ownerNote=document.createElement('div');
    ownerNote.className='h38-owner-assistant-note';
    const shell=main.querySelector('.pa-shell');
    shell?.prepend(ownerNote);
  }
  if(ownerNote)ownerNote.innerHTML=`<strong>Your private assistant</strong><span>Personal items belong only to ${text(ownerLabel()).replace(/[&<>"']/g,'')}. Business commands use your current Office permissions and existing review gates.</span>`;
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

const observer=new MutationObserver(apply);
observer.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&searchDialog()?.open){event.preventDefault();closeSearch('escape');}},true);
window.addEventListener('resize',syncShellTop,{passive:true});
window.visualViewport?.addEventListener('resize',syncShellTop,{passive:true});
window.visualViewport?.addEventListener('scroll',syncShellTop,{passive:true});
window.addEventListener('pageshow',apply);
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
  nativeIosShellCreated:false
});
})();