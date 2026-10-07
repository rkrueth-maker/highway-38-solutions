(function(){
'use strict';
// H38 Muse Permissions: explicit grant flow for contractor personal AI.
// REQUIRED at minimum: Office access, Business email, and Google Drive.
// Optional: Calendar, SMS, and Fleet Location. Grants are revocable.
const BUILD='20261006-muse-permissions-2';
const text=v=>String(v==null?'':v).trim();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const businessId=()=>text(window.state?.businessId);
const now=()=>new Date().toISOString();

const REQUIRED_PERMS=[
  {id:'office',title:'Business Office Access',desc:'Read and manage your customers, quotes, jobs, schedule, and money. Required for Muse to help run your business.',icon:'🏢',required:true},
  {id:'email',title:'Business Email',desc:'Send quotes, invoices, and customer messages from your business email. Required at minimum.',icon:'📧',required:true},
  {id:'drive',title:'Google Drive',desc:'Access job files, photos, documents, and customer records stored in Drive. Required for installation.',icon:'💾',required:true},
];

const OPTIONAL_PERMS=[
  {id:'calendar',title:'Calendar',desc:'Optional outside-calendar access. Your Office Schedule is already included with Business Office Access and works without this.',icon:'📅',required:false},
  {id:'sms',title:'Business SMS',desc:'Send text messages to customers.',icon:'💬',required:false},
  {id:'fleet',title:'Fleet Location',desc:'View vehicle locations for dispatch.',icon:'🚛',required:false},
];

function getGrants(){
  try{
    const raw=localStorage.getItem('h38-muse-perms-'+businessId());
    if(raw)return JSON.parse(raw);
  }catch(_){}
  return {granted:[],grantedAt:null,grantedBy:null};
}

function saveGrants(grants){
  try{
    localStorage.setItem('h38-muse-perms-'+businessId(),JSON.stringify(grants));
  }catch(_){}
}

function hasPermission(permId){
  const g=getGrants();
  return g.granted.includes(permId);
}

function hasRequired(){
  const g=getGrants();
  return REQUIRED_PERMS.every(p=>g.granted.includes(p.id));
}

function renderGrantScreen(){
  const main=document.getElementById('mainContent');
  if(!main)return;
  const g=getGrants();
  
  main.innerHTML=`<div class="page-head"><div><span class="kicker">MUSE SETUP</span>
    <h1>Connect Your Muse</h1>
    <p>Grant your personal AI permission to help run your business.</p></div></div>
  
  <div class="card"><h2>🔒 Permission Request</h2>
    <p>Your Muse (downloaded from the Muse app) is requesting access to your H38 Business Office.</p>
    <p class="muted">Your Muse can only do what you allow. Required permissions are marked. You can revoke access anytime in Settings.</p>
  </div>
  
  <div class="card"><h2>Required Permissions</h2>
    <p class="muted small">These are the minimum for Muse to be useful.</p>
    ${REQUIRED_PERMS.map(p=>`
      <div class="h38-perm-row">
        <span class="h38-perm-icon">${p.icon}</span>
        <span><strong>${esc(p.title)}</strong> <span class="pill">Required</span><br><small class="muted">${esc(p.desc)}</small></span>
        <label class="h38-perm-toggle"><input type="checkbox" checked disabled data-perm="${p.id}"><span>Granted</span></label>
      </div>`).join('')}
  </div>
  
  <div class="card"><h2>Optional Permissions</h2>
    <p class="muted small">Check what you want your Muse to access.</p>
    ${OPTIONAL_PERMS.map(p=>`
      <div class="h38-perm-row">
        <span class="h38-perm-icon">${p.icon}</span>
        <span><strong>${esc(p.title)}</strong><br><small class="muted">${esc(p.desc)}</small></span>
        <label class="h38-perm-toggle"><input type="checkbox" data-perm="${p.id}" ${g.granted.includes(p.id)?'checked':''}><span>Allow</span></label>
      </div>`).join('')}
  </div>
  
  <div class="card"><h2>What your Muse can and cannot do</h2>
    <div class="two">
      <div><h3>✅ Can</h3><ul class="h38-perm-list">
        <li>Draft quotes, emails, and messages for your review</li>
        <li>Organize customer lists and schedule</li>
        <li>Look up job history and customer details</li>
        <li>Prepare reports and summaries</li>
      </ul></div>
      <div><h3>🚫 Cannot (without asking)</h3><ul class="h38-perm-list">
        <li>Send anything to customers</li>
        <li>Move money or process payments</li>
        <li>Delete records</li>
        <li>Share your data with anyone else</li>
      </ul></div>
    </div>
    <div class="actions" style="margin-top:16px">
      <button class="secondary" data-perm-cancel>Not now</button>
      <button class="primary" data-perm-grant>✓ Grant Access</button>
    </div>
    <p class="muted small">By granting access, you allow your Muse to act on your behalf within these permissions. Revoke anytime in Settings → Muse Permissions.</p>
  </div>`;
  
  document.querySelector('[data-perm-grant]')?.addEventListener('click',()=>{
    const granted=REQUIRED_PERMS.map(p=>p.id);
    document.querySelectorAll('[data-perm]:not([disabled])').forEach(cb=>{
      if(cb.checked)granted.push(cb.dataset.perm);
    });
    saveGrants({granted,grantedAt:now(),grantedBy:text(window.state?.snapshot?.user?.userId)});
    // Also save to backend if available
    if(typeof window.queueOperation==='function'){
      window.queueOperation('SAVE_MUSE_GRANT','Muse Grant',businessId(),{
        businessId:businessId(),granted,grantedAt:now(),
        grantedBy:text(window.state?.snapshot?.user?.userId)
      },{collection:'museGrants',record:{businessId:businessId(),granted}},true).catch(()=>{});
    }
    toast('✓ Muse connected with your permissions.');
    renderStatus();
  });
  document.querySelector('[data-perm-cancel]')?.addEventListener('click',()=>{
    if(window.openPage)window.openPage('today');
  });
}

function renderStatus(){
  const main=document.getElementById('mainContent');
  if(!main)return;
  const g=getGrants();
  const allPerms=[...REQUIRED_PERMS,...OPTIONAL_PERMS];
  
  main.innerHTML=`<div class="page-head"><div><span class="kicker">SETTINGS</span>
    <h1>Muse Permissions</h1><p>Control what your personal AI can access.</p></div>
    <div class="page-tools"><button class="secondary" data-perm-back>Back to Settings</button><button class="secondary" data-perm-revoke-all>Revoke All</button></div></div>
  
  <div class="card">
    <div class="h38-perm-status ${hasRequired()?'good':'warn'}">
      ${hasRequired()?'✅ Your Muse is connected':'⚠️ Required permissions not granted'}
    </div>
    ${g.grantedAt?`<p class="muted small">Granted ${new Date(g.grantedAt).toLocaleDateString()} ${g.grantedBy?'by '+esc(g.grantedBy):''}</p>`:''}
  </div>
  
  <div class="card"><h2>Current Permissions</h2>
    ${allPerms.map(p=>{
      const granted=g.granted.includes(p.id);
      return `<div class="h38-perm-row">
        <span class="h38-perm-icon">${p.icon}</span>
        <span><strong>${esc(p.title)}</strong> ${p.required?'<span class="pill">Required</span>':''}<br><small class="muted">${esc(p.desc)}</small></span>
        <label class="h38-perm-toggle">
          <input type="checkbox" data-perm-toggle="${p.id}" ${granted?'checked':''} ${p.required&&granted?'disabled':''}>
          <span>${granted?'On':'Off'}</span>
        </label>
      </div>`;
    }).join('')}
    <p class="muted small">Required permissions cannot be turned off while Muse is connected. Use Revoke All to disconnect.</p>
  </div>`;
  
  document.querySelector('[data-perm-back]')?.addEventListener('click',()=>{
    if(window.openPage)window.openPage('settings');
  });
  document.querySelectorAll('[data-perm-toggle]').forEach(cb=>cb.onchange=()=>{
    const g=getGrants();
    const id=cb.dataset.permToggle;
    if(cb.checked){if(!g.granted.includes(id))g.granted.push(id);}
    else{g.granted=g.granted.filter(x=>x!==id);}
    g.grantedAt=now();saveGrants(g);renderStatus();
    toast(cb.checked?'Permission granted.':'Permission revoked.');
  });
  document.querySelector('[data-perm-revoke-all]')?.addEventListener('click',()=>{
    if(confirm('Revoke all Muse permissions? Your Muse will be disconnected.')){
      saveGrants({granted:[],grantedAt:null,grantedBy:null});
      renderStatus();toast('Muse disconnected.');
    }
  });
}

function toast(msg,bad){
  if(typeof window.toast==='function')window.toast(msg,!!bad);
}

function startGrant(){renderGrantScreen();}
function startStatus(){renderStatus();}

function openPermissionsPage(){
  if(window.state)window.state.page='musePermissions';
  renderStatus();
  try{window.renderNav?.();}catch(_){}
  try{
    const main=document.getElementById('mainContent');
    if(main){main.scrollTop=0;main.focus?.({preventScroll:true});}
  }catch(_){}
}

function openConnectPage(){
  if(window.state)window.state.page='museConnect';
  renderGrantScreen();
  try{window.renderNav?.();}catch(_){}
  try{
    const main=document.getElementById('mainContent');
    if(main){main.scrollTop=0;main.focus?.({preventScroll:true});}
  }catch(_){}
}

function renderSettingsCard(){
  if(window.state?.page!=='settings')return false;
  const grid=document.querySelector('#mainContent .grid');
  if(!grid)return false;
  let card=document.getElementById('h38MusePermissionsCard');
  if(!card){
    card=document.createElement('section');
    card.id='h38MusePermissionsCard';
    card.className='card span6';
    const ownerControls=Array.from(grid.querySelectorAll(':scope > section.card')).find(section=>section.querySelector('h2')?.textContent?.trim()==='Owner Controls');
    if(ownerControls)grid.insertBefore(card,ownerControls);else grid.appendChild(card);
  }
  const connected=hasRequired();
  card.innerHTML=`<h2>Muse Permissions</h2>
    <p class="muted">${connected?'Your Muse is connected with the required permissions.':'Control what your personal AI can access.'}</p>
    <p class="muted small">Required: Business Office Access, Business Email, and Google Drive. Optional: Calendar, Business SMS, and Fleet Location. Your Office Schedule works without the Calendar permission.</p>
    <div class="actions"><button type="button" class="secondary" data-muse-permissions-open>Open Muse Permissions</button></div>`;
  card.querySelector('[data-muse-permissions-open]')?.addEventListener('click',event=>{event.stopPropagation();openPermissionsPage();});
  return true;
}

function scheduleSettingsCard(){
  queueMicrotask(()=>{try{renderSettingsCard();}catch(error){console.warn('Muse Permissions Settings card:',error?.message||error);}});
}

let officeIntegrationListenersInstalled=false;
let settingsCardObserver=null;
function installOpenPageWrapper(){
  const baseOpen=window.openPage;
  if(typeof baseOpen!=='function'||baseOpen.__h38MusePermissions)return;
  const wrapped=function(page,...args){
    if(page==='musePermissions'){openPermissionsPage();return;}
    if(page==='museConnect'){openConnectPage();return;}
    return baseOpen.apply(this,args);
  };
  wrapped.__h38MusePermissions=true;
  wrapped.__h38MusePermissionsBase=baseOpen;
  window.openPage=wrapped;
}

function installOfficeIntegration(){
  window.H38_PAGES=window.H38_PAGES||{};
  window.H38_PAGES.museConnect={render:startGrant,title:'Connect Muse'};
  window.H38_PAGES.musePermissions={render:startStatus,title:'Muse Permissions'};
  if(!officeIntegrationListenersInstalled){
    officeIntegrationListenersInstalled=true;
    window.addEventListener('h38:office-page-rendered',event=>{if(event?.detail?.page==='settings')scheduleSettingsCard();});
    window.addEventListener('h38:business-snapshot-updated',()=>{if(window.state?.page==='settings')scheduleSettingsCard();});
    document.addEventListener('click',event=>{
      if(event.target?.closest?.('[data-muse-permissions-open]'))openPermissionsPage();
    });
    if(document.body&&!settingsCardObserver){
      settingsCardObserver=new MutationObserver(()=>{if(window.state?.page==='settings'&&!document.getElementById('h38MusePermissionsCard'))scheduleSettingsCard();});
      settingsCardObserver.observe(document.body,{childList:true,subtree:true});
    }
  }
  installOpenPageWrapper();
  scheduleSettingsCard();
}

window.H38_MUSE_PERMS=Object.freeze({build:BUILD,hasPermission,hasRequired,getGrants,startGrant,startStatus,openGrant:openConnectPage,openStatus:openPermissionsPage,renderSettingsCard});

installOfficeIntegration();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installOfficeIntegration,{once:true});

})();
