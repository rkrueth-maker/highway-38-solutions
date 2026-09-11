(function(){
'use strict';
const BUILD='20260911-mobile-field-view-2';
const PREF_KEY='h38:mobile-workspace-view:v1';
const STYLE_ID='h38MobileFieldViewStyle';
const TOGGLE_ID='h38MobileWorkspaceToggle';
const MORE_ID='h38MobileFieldMore';
const FIELD_PRIMARY=Object.freeze([
  ['today','⌂','Today'],
  ['work','🧰','Jobs'],
  ['field','📷','Site Visit'],
  ['schedule','📅','Schedule']
]);
const FIELD_LABEL='Field View';
const OFFICE_LABEL='Full Business Office';
let applying=false;
let navScheduled=false;

const text=value=>String(value==null?'':value).trim();
function mobile(){return !!window.matchMedia?.('(max-width: 760px)').matches;}
function officeState(){try{return window.state||null;}catch(_){return null;}}
function user(){return officeState()?.snapshot?.user||null;}
function role(){const u=user()||{};return text(u.roleId||u.roleName||u.role).toLowerCase();}
function can(capability){const u=user();if(!u)return false;if(u.owner===true||u.permissions?.all===true)return true;return u.permissions?.[capability]===true;}
function fieldEligible(){return !!user()&&(can('manageField')||can('captureEvidence')||can('viewAssignedWork')||can('manageAssignedWork')||can('manageWork'));}
function fieldWorkerDefault(){return role()==='staff';}
function savedMode(){try{return localStorage.getItem(PREF_KEY)==='office'?'office':localStorage.getItem(PREF_KEY)==='field'?'field':'';}catch(_){return'';}}
function requestedMode(){
  try{
    const q=new URLSearchParams(location.search);
    if(q.get('view')==='office'||q.get('fullOffice')==='1')return'office';
    if(q.get('view')==='field'||q.get('shell')==='field')return'field';
  }catch(_){}
  return'';
}
function currentMode(){return officeState()?.shell==='field'?'field':'office';}
function desiredMode(){
  if(!mobile()||!fieldEligible())return'office';
  const requested=requestedMode();
  if(requested)return requested;
  const saved=savedMode();
  if(saved)return saved;
  return fieldWorkerDefault()?'field':'office';
}
function persist(mode){try{localStorage.setItem(PREF_KEY,mode);}catch(_){} }
function shellLabel(mode){const node=document.getElementById('shellLabel');if(node)node.textContent=mode==='field'?FIELD_LABEL:OFFICE_LABEL;}
function allowed(){try{return Array.isArray(window.allowedPages?.())?window.allowedPages():[];}catch(_){return[];}}
function safePage(mode){
  const state=officeState();
  if(!state)return'today';
  const pages=allowed();
  if(pages.includes(state.page))return state.page;
  if(mode==='field')return pages.includes('work')?'work':pages.includes('today')?'today':pages[0]||'today';
  return pages.includes('today')?'today':pages[0]||'today';
}
function renderExisting(page){
  try{window.renderNav?.();}catch(_){}
  if(page){try{window.openPage?.(page,false);}catch(_){try{window.openPage?.(page);}catch(__){}}}
}
function setMode(mode,{remember=true,openPage=true}={}){
  const state=officeState();
  if(!mobile()||!state||!state.snapshot?.user)return false;
  const next=mode==='office'?'office':'field';
  if(next==='field'&&!fieldEligible())return false;
  applying=true;
  try{
    state.shell=next;
    document.documentElement.classList.toggle('h38-mobile-field-view',next==='field');
    document.documentElement.classList.toggle('h38-mobile-full-office',next==='office');
    shellLabel(next);
    if(remember)persist(next);
    const page=safePage(next);
    renderExisting(openPage?page:null);
    ensureToggle();
    scheduleFieldNav();
    window.dispatchEvent(new CustomEvent('h38:mobile-workspace-view-changed',{detail:{mode:next,fieldView:next==='field',fullOffice:next==='office'}}));
    return true;
  }finally{applying=false;}
}
function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
@media(max-width:760px){
 #${TOGGLE_ID}{min-height:36px!important;padding:6px 9px!important;border:1px solid var(--line-strong,#c8d5de)!important;border-radius:10px!important;background:var(--card,#fff)!important;color:var(--navy,#0b2438)!important;font-size:.72rem!important;font-weight:900!important;white-space:nowrap!important}
 html.h38-mobile-field-view #mainNav.main-nav{position:fixed!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;z-index:2600!important;margin:0!important;padding:6px 6px calc(6px + env(safe-area-inset-bottom,0px))!important;background:rgba(255,255,255,.98)!important;box-shadow:0 -8px 24px rgba(11,36,56,.14)!important;display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:2px!important;overflow:visible!important}
 html.h38-mobile-field-view #mainNav.main-nav>button{min-width:0!important;max-width:none!important;min-height:58px!important;padding:5px 2px!important;border-radius:11px!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:3px!important}
 html.h38-mobile-field-view #mainNav.main-nav>button span:last-child{font-size:.68rem!important;line-height:1.05!important;font-weight:900!important;white-space:nowrap!important}
 html.h38-mobile-field-view #mainNav.main-nav>button .nav-icon{font-size:1.05rem!important}
 .h38-mobile-field-more{width:min(430px,calc(100vw - 20px));max-height:min(72dvh,620px);padding:0;border:0;border-radius:18px;background:var(--card,#fff);color:var(--text,#132435);box-shadow:0 22px 70px rgba(0,0,0,.28)}
 .h38-mobile-field-more::backdrop{background:rgba(8,19,28,.58)}
 .h38-mobile-field-more-shell{display:grid;gap:10px;padding:14px}.h38-mobile-field-more header{display:flex;justify-content:space-between;align-items:center;gap:8px}.h38-mobile-field-more header button{border:0;background:transparent;font-size:1.6rem;min-width:40px;min-height:40px}.h38-mobile-field-more-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.h38-mobile-field-more-grid button{min-height:52px;text-align:left}.h38-mobile-field-more .h38-full-office-choice{grid-column:1/-1;min-height:54px;font-weight:900}
}
`;
  document.head.appendChild(style);
}
function ensureToggle(){
  if(!mobile()||!user()||!fieldEligible())return false;
  ensureStyle();
  let button=document.getElementById(TOGGLE_ID);
  if(!button){
    button=document.createElement('button');button.id=TOGGLE_ID;button.type='button';
    const actions=document.querySelector('.topbar .top-actions')||document.querySelector('.top-actions')||document.querySelector('.topbar');
    if(!actions)return false;
    actions.prepend(button);
    button.addEventListener('click',()=>setMode(currentMode()==='field'?'office':'field',{remember:true,openPage:true}));
  }
  const mode=currentMode();
  button.textContent=mode==='field'?'Full Office':'Field View';
  button.setAttribute('aria-label',mode==='field'?'Show full Business Office':'Show mobile Field View');
  button.title=mode==='field'?'Show the complete Business Office on this phone':'Open the simplified field-work phone view';
  return true;
}
function pageDefinition(key){
  try{const def=window.PAGE_DEFS?.[key]||(typeof PAGE_DEFS!=='undefined'?PAGE_DEFS[key]:null);return def||['•',key];}catch(_){return['•',key];}
}
function openMore(){
  document.getElementById(MORE_ID)?.remove();
  const pages=allowed();
  const primary=new Set(FIELD_PRIMARY.map(item=>item[0]));
  const extras=pages.filter(page=>!primary.has(page)&&page!=='ai');
  const dialog=document.createElement('dialog');dialog.id=MORE_ID;dialog.className='h38-mobile-field-more';
  const buttons=extras.map(page=>{const def=pageDefinition(page);return `<button type="button" data-h38-field-extra="${page}"><span>${def[0]} ${def[1]}</span></button>`;}).join('');
  dialog.innerHTML=`<div class="h38-mobile-field-more-shell"><header><div><strong>Field tools</strong><div class="muted small">Same Business Office records, simplified for the phone.</div></div><button type="button" data-h38-field-more-close aria-label="Close">×</button></header><div class="h38-mobile-field-more-grid">${buttons}<button type="button" class="h38-full-office-choice" data-h38-full-office>▦ Open Full Business Office</button></div></div>`;
  document.body.appendChild(dialog);
  const close=()=>{try{dialog.close();}catch(_){}dialog.remove();};
  dialog.querySelector('[data-h38-field-more-close]')?.addEventListener('click',close);
  dialog.querySelector('[data-h38-full-office]')?.addEventListener('click',()=>{close();setMode('office',{remember:true,openPage:true});});
  dialog.querySelectorAll('[data-h38-field-extra]').forEach(button=>button.addEventListener('click',()=>{const page=button.dataset.h38FieldExtra;close();window.openPage?.(page);}));
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.showModal();
}
function fieldNavigationHtml(){
  const state=officeState();
  const pages=new Set(allowed());
  const current=text(state?.page);
  const items=FIELD_PRIMARY.filter(([page])=>pages.has(page));
  const html=items.map(([page,icon,label])=>`<button type="button" data-h38-field-primary="${page}" class="${current===page?'active':''}"${current===page?' aria-current="page"':''}><span class="nav-icon">${icon}</span><span>${label}</span></button>`);
  html.push(`<button type="button" data-h38-field-primary="more" class="${items.some(([page])=>page===current)?'':'active'}"><span class="nav-icon">•••</span><span>More</span></button>`);
  return html.join('');
}
function renderFieldNavigation(){
  if(!mobile()||currentMode()!=='field')return false;
  const nav=document.getElementById('mainNav');
  if(!nav||!user())return false;
  const desired=fieldNavigationHtml();
  if(nav.dataset.h38MobileFieldSignature!==desired){nav.innerHTML=desired;nav.dataset.h38MobileFieldSignature=desired;}
  nav.classList.add('h38-five-primary-nav');
  nav.dataset.h38PrimaryNav='field-view';
  nav.querySelectorAll('[data-h38-field-primary]').forEach(button=>{
    button.onclick=()=>{
      const target=button.dataset.h38FieldPrimary;
      if(target==='more'){openMore();return;}
      if(target&&target!==officeState()?.page)window.openPage?.(target);
    };
  });
  return true;
}
function scheduleFieldNav(){
  if(navScheduled)return;
  navScheduled=true;
  requestAnimationFrame(()=>{navScheduled=false;ensureToggle();if(currentMode()==='field')renderFieldNavigation();});
}
function reconcile({initial=false}={}){
  if(!mobile()){
    document.documentElement.classList.remove('h38-mobile-field-view','h38-mobile-full-office');
    document.getElementById(TOGGLE_ID)?.remove();
    return false;
  }
  if(!user())return false;
  ensureToggle();
  if(initial||!applying){
    const desired=desiredMode();
    if(currentMode()!==desired)setMode(desired,{remember:false,openPage:true});
    else{
      document.documentElement.classList.toggle('h38-mobile-field-view',desired==='field');
      document.documentElement.classList.toggle('h38-mobile-full-office',desired==='office');
      shellLabel(desired);
      scheduleFieldNav();
    }
  }
  return true;
}
function start(){
  ensureStyle();
  const main=document.getElementById('mainContent');
  if(main)new MutationObserver(scheduleFieldNav).observe(main,{childList:true,subtree:true});
  const nav=document.getElementById('mainNav');
  if(nav)new MutationObserver(()=>{if(currentMode()==='field')scheduleFieldNav();}).observe(nav,{childList:true,subtree:false});
  window.addEventListener('h38:business-snapshot-updated',()=>reconcile());
  window.addEventListener('h38:office-page-rendered',scheduleFieldNav);
  window.addEventListener('pageshow',()=>reconcile());
  window.addEventListener('h38:auth-cleared',()=>{document.getElementById(TOGGLE_ID)?.remove();});
  window.matchMedia?.('(max-width: 760px)')?.addEventListener?.('change',()=>reconcile({initial:true}));
  let attempts=0;const timer=setInterval(()=>{attempts++;if(reconcile({initial:true})||attempts>40)clearInterval(timer);},250);
}

window.H38_MOBILE_FIELD_VIEW=Object.freeze({
  build:BUILD,
  presentationOnly:true,
  officeSetupUntouched:true,
  mobileDefaultForStaff:'field',
  mobileDefaultForOwnerAdmin:'office',
  desktopDefault:'office',
  fullOfficeAlwaysAvailable:true,
  fieldViewAvailableToOwnerAdmin:true,
  sameBusinessOfficeData:true,
  samePermissions:true,
  separateAppRequired:false,
  setFieldView:()=>setMode('field',{remember:true,openPage:true}),
  setFullOffice:()=>setMode('office',{remember:true,openPage:true}),
  reconcile,
  preferenceKey:PREF_KEY
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
