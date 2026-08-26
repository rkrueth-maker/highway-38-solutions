(function(){
'use strict';
const BUILD='20260826-office-polish-desktop-hit-proxy-1';
const NAV_PROXY_BUILD='20260826-desktop-sidebar-physical-proxy-1';
let lastSearchTrigger=null;
let navProxyTimer=0;
let navProxyObserver=null;
let navProxyObserved=null;

function searchDialog(){return document.getElementById('h38OfficeSearchDialog');}
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
function polishTouchTargets(){
  bindSearchTrigger(document.getElementById('h38OfficeSearchButton'));
  bindSearchTrigger(document.getElementById('h38AssistantSearch'));
  bindSearchTrigger(document.getElementById('h38OpenLifecycleSearch'));
  const assistant=document.getElementById('personalAssistantButton');
  if(assistant){assistant.setAttribute('title','Open Personal Assistant');assistant.classList.add('h38-polish-touch');}
  document.getElementById('h38OfficeSearchButton')?.classList.add('h38-polish-touch');
}
function desktopOffice(){
  return !!window.matchMedia?.('(min-width: 761px)').matches&&String(window.state?.shell||'office')==='office';
}
function proxyHost(){
  let host=document.getElementById('h38DesktopSidebarPhysicalProxy');
  if(host)return host;
  host=document.createElement('div');
  host.id='h38DesktopSidebarPhysicalProxy';
  host.dataset.build=NAV_PROXY_BUILD;
  host.setAttribute('aria-hidden','true');
  host.style.cssText='position:fixed;inset:0;z-index:2147483000;pointer-events:none;background:transparent;';
  document.body.appendChild(host);
  return host;
}
function removeProxy(){document.getElementById('h38DesktopSidebarPhysicalProxy')?.remove();}
function openProxyPage(page){
  page=String(page||'').trim();
  if(!page)return false;
  try{
    if(page==='meetings'&&typeof window.renderMeetings==='function'){
      if(window.state)window.state.page='meetings';
      window.renderMeetings();
      return String(window.state?.page||'')==='meetings';
    }
    if(typeof window.H38_CORE_OPEN_PAGE==='function'){
      window.H38_CORE_OPEN_PAGE(page,false);
      return String(window.state?.page||'')===page;
    }
    if(typeof window.H38_CORE_NAVIGATION?.openPage==='function'){
      window.H38_CORE_NAVIGATION.openPage(page,false);
      return String(window.state?.page||'')===page;
    }
    if(typeof window.openPage==='function'){
      window.openPage(page,false);
      return String(window.state?.page||'')===page;
    }
  }catch(error){console.error('[H38 desktop physical sidebar proxy]',page,error);}
  return false;
}
function syncSidebarProxy(){
  clearTimeout(navProxyTimer);
  if(!desktopOffice()){removeProxy();return false;}
  if(document.querySelector('dialog[open]')){removeProxy();return false;}
  const nav=document.getElementById('mainNav');
  if(!nav){removeProxy();return false;}
  const style=getComputedStyle(nav);
  if(style.display==='none'||style.visibility==='hidden'||style.pointerEvents==='none'&&nav.getClientRects().length===0){removeProxy();return false;}
  const buttons=Array.from(nav.querySelectorAll(':scope > [data-page]')).filter(button=>{
    const rect=button.getBoundingClientRect();
    const s=getComputedStyle(button);
    return rect.width>8&&rect.height>8&&s.display!=='none'&&s.visibility!=='hidden';
  });
  if(!buttons.length){removeProxy();return false;}
  const host=proxyHost();
  const signature=buttons.map(button=>{
    const r=button.getBoundingClientRect();
    return `${button.dataset.page}:${Math.round(r.left)}:${Math.round(r.top)}:${Math.round(r.width)}:${Math.round(r.height)}`;
  }).join('|');
  if(host.dataset.signature===signature)return true;
  host.dataset.signature=signature;
  host.replaceChildren(...buttons.map(button=>{
    const rect=button.getBoundingClientRect();
    const hit=document.createElement('button');
    hit.type='button';
    hit.tabIndex=-1;
    hit.dataset.h38SidebarProxyPage=String(button.dataset.page||'');
    hit.title=String(button.textContent||'').trim();
    hit.style.cssText=`position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;z-index:2147483001;border:0;margin:0;padding:0;background:transparent;opacity:.001;pointer-events:auto;cursor:pointer;`;
    hit.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const page=hit.dataset.h38SidebarProxyPage;
      const opened=openProxyPage(page);
      if(!opened){
        try{window.toast?.(`Could not open ${hit.title||page}.`,true);}catch(_){}
      }
      setTimeout(syncSidebarProxy,0);
    },true);
    return hit;
  }));
  return true;
}
function scheduleSidebarProxy(delay=0){
  clearTimeout(navProxyTimer);
  navProxyTimer=setTimeout(syncSidebarProxy,delay);
}
function observeSidebar(){
  const nav=document.getElementById('mainNav');
  if(!nav){scheduleSidebarProxy(150);return false;}
  if(navProxyObserved!==nav){
    navProxyObserver?.disconnect();
    navProxyObserved=nav;
    navProxyObserver=new MutationObserver(()=>scheduleSidebarProxy());
    navProxyObserver.observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','data-page']});
  }
  scheduleSidebarProxy();
  return true;
}
function apply(){polishSearch();polishTouchTargets();observeSidebar();}

const observer=new MutationObserver(apply);
observer.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&searchDialog()?.open){event.preventDefault();closeSearch('escape');}},true);
window.addEventListener('resize',()=>scheduleSidebarProxy(20));
window.addEventListener('scroll',()=>scheduleSidebarProxy(20),true);
window.addEventListener('pageshow',()=>scheduleSidebarProxy());
window.addEventListener('focus',()=>scheduleSidebarProxy());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleSidebarProxy();});
window.addEventListener('h38:business-snapshot-updated',()=>scheduleSidebarProxy());
setInterval(()=>{observeSidebar();syncSidebarProxy();},1000);
apply();

window.H38_OFFICE_POLISH=Object.freeze({
  enabled:true,
  build:BUILD,
  searchExitGuaranteed:true,
  closeSearch,
  quoteAiChanged:false,
  desktopSidebarPhysicalProxy:true,
  desktopSidebarPhysicalProxyBuild:NAV_PROXY_BUILD,
  syncSidebarProxy
});
})();
