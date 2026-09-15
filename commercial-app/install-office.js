(function(){
'use strict';
const BUILD='20260915-install-office-2';
const MOBILE='(max-width: 760px)';
const SHORTCUTS=new Set(['today','customers','schedule','messages','work','quotes','field']);
let deferredPrompt=null;
let installed=false;
let shortcutHandled=false;
const mobile=()=>!!window.matchMedia?.(MOBILE).matches;
const standalone=()=>!!(window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true||document.referrer.startsWith('android-app://'));
const isiOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent||'')&&!window.MSStream;
const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function installState(){return {installed:installed||standalone(),promptReady:!!deferredPrompt,ios:isiOS(),mobile:mobile()};}
function ensureStyle(){
  if(document.getElementById('h38InstallOfficeStyle'))return;
  const style=document.createElement('style');style.id='h38InstallOfficeStyle';style.textContent=`
#h38InstallOfficeButton{min-height:42px;padding:0 12px;border-radius:10px;font-weight:850;white-space:nowrap}.h38-install-dialog{width:min(520px,calc(100vw - 22px));border:0;border-radius:18px;padding:0;max-height:82dvh}.h38-install-dialog::backdrop{background:rgba(0,0,0,.55)}.h38-install-shell{display:grid;gap:14px;padding:18px}.h38-install-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.h38-install-head h2{margin:0}.h38-install-head p{margin:5px 0 0;color:var(--muted,#607285);line-height:1.4}.h38-install-steps{margin:0;padding-left:21px;display:grid;gap:8px}.h38-install-note{padding:11px 12px;border-radius:12px;background:#eef3f7;color:#31495c}.h38-install-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.h38-install-actions button{min-height:44px}.h38-install-status{font-weight:800;color:#1d6631}@media(max-width:760px){#h38InstallOfficeButton{display:none!important}.h38-install-dialog{width:calc(100vw - 14px)}}`;(document.head||document.documentElement).appendChild(style);
}
function ensureDialog(){
  let dialog=document.getElementById('h38InstallOfficeDialog');if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='h38InstallOfficeDialog';dialog.className='h38-install-dialog';dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});document.body.appendChild(dialog);return dialog;
}
function instructions(){
  const state=installState();
  if(state.installed)return {title:'H38 Office is installed',lead:'Open it from your Home Screen, app launcher, Start menu, or shelf.',steps:[],direct:false};
  if(state.promptReady)return {title:'Install H38 Office',lead:'Install the Business Office so it opens from its own icon like an app.',steps:['Choose Install below.','Confirm the browser installation prompt.','Open H38 Office from the new app icon.'],direct:true};
  if(state.ios)return {title:'Add H38 Office to iPhone or iPad',lead:'Apple requires this one-time Home Screen step from Safari.',steps:['Open this page in Safari.','Tap the Share button.','Choose Add to Home Screen.','Keep the H38 Office name and tap Add.'],direct:false};
  return {title:'Install H38 Office',lead:'Your browser can save H38 Office as an app or Home Screen shortcut.',steps:['Open the browser menu.','Choose Install app or Add to Home screen.','Confirm the H38 Office icon.'],direct:false};
}
function renderDialog(){
  const dialog=ensureDialog(),info=instructions();dialog.innerHTML=`<div class="h38-install-shell"><div class="h38-install-head"><div><h2>${esc(info.title)}</h2><p>${esc(info.lead)}</p></div><button type="button" class="icon-button" data-install-close aria-label="Close">×</button></div>${info.steps.length?`<ol class="h38-install-steps">${info.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>`:'<div class="h38-install-note h38-install-status">Installed and ready.</div>'}<div class="h38-install-note">H38 keeps the same secure sign-in and Business Office data. Installing only changes how you launch it.</div><div class="h38-install-actions">${info.direct?'<button type="button" class="primary" data-install-now>Install H38 Office</button>':''}<button type="button" class="secondary" data-install-close>Close</button></div></div>`;dialog.querySelectorAll('[data-install-close]').forEach(button=>button.onclick=()=>dialog.close());dialog.querySelector('[data-install-now]')?.addEventListener('click',installNow);return dialog;
}
async function installNow(){
  if(standalone()||installed){renderDialog();return {outcome:'installed'};}
  if(!deferredPrompt){open();return {outcome:'instructions'};}
  const prompt=deferredPrompt;deferredPrompt=null;try{await prompt.prompt();const choice=await prompt.userChoice;installed=choice?.outcome==='accepted';syncButton();syncMoreAction();renderDialog();return choice||{outcome:installed?'accepted':'dismissed'};}catch(error){syncButton();syncMoreAction();renderDialog();return {outcome:'error',error};}
}
function open(){ensureStyle();const dialog=renderDialog();if(typeof dialog.showModal==='function'){if(!dialog.open)dialog.showModal();}else dialog.setAttribute('open','');}
function syncButton(){
  ensureStyle();let button=document.getElementById('h38InstallOfficeButton');const actions=document.querySelector('.topbar .top-actions');
  if(!actions||mobile()||standalone()||installed){button?.remove();return;}
  if(!button){button=document.createElement('button');button.type='button';button.id='h38InstallOfficeButton';button.className='secondary';button.textContent='Install H38';button.setAttribute('aria-label','Install H38 Office app');button.onclick=open;actions.insertBefore(button,actions.firstChild);}
}
function syncMoreAction(){
  if(!mobile())return;
  const groups=document.querySelector('#h38PrimaryMoreDialog .h38-more-groups');if(!groups||groups.querySelector('[data-h38-install-group]'))return;
  const section=document.createElement('section');section.className='h38-more-group';section.dataset.h38InstallGroup='1';const isInstalled=standalone()||installed;
  section.innerHTML=`<h3>App</h3><div class="h38-more-grid"><button type="button" data-h38-install-more><span>${isInstalled?'✓':'⬇'}</span><strong>${isInstalled?'H38 Office installed':'Install H38 Office'}</strong></button></div>`;
  section.querySelector('[data-h38-install-more]').onclick=open;groups.appendChild(section);
}
function routeShortcut(){
  if(shortcutHandled)return;const params=new URLSearchParams(location.search),shortcut=String(params.get('shortcut')||'').trim();if(!SHORTCUTS.has(shortcut)){shortcutHandled=true;return;}
  const ready=()=>typeof window.openPage==='function'&&window.state?.snapshot?.user;
  let tries=0;const go=()=>{if(ready()){shortcutHandled=true;window.openPage(shortcut);return;}if(++tries<80)setTimeout(go,150);};go();
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredPrompt=event;installed=false;syncButton();syncMoreAction();});
window.addEventListener('appinstalled',()=>{installed=true;deferredPrompt=null;syncButton();syncMoreAction();if(document.getElementById('h38InstallOfficeDialog')?.open)renderDialog();});
window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change',()=>{syncButton();syncMoreAction();});
document.addEventListener('click',event=>{if(event.target.closest?.('[data-h38-primary="more"]'))setTimeout(syncMoreAction,0);});
const observer=new MutationObserver(()=>{if(document.querySelector('#h38PrimaryMoreDialog[open],#h38PrimaryMoreDialog[open=""]'))syncMoreAction();});
if(document.body)observer.observe(document.body,{childList:true,subtree:true});
window.H38_INSTALL_OFFICE={BUILD,open,install:installNow,state:installState,sync:syncButton,syncMoreAction};
function init(){ensureStyle();syncButton();syncMoreAction();routeShortcut();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
