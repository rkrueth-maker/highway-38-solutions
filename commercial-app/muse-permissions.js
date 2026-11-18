(function(){
'use strict';
// H38 Muse Permissions: explicit grant flow for contractor personal AI.
// REQUIRED at minimum: Office access, Business email, and Google Drive.
// Optional: Calendar, SMS, and Fleet Location. Grants are revocable.
const BUILD='20261118-muse-permissions-3';
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

// The app shell never links muse-permissions.css, so load it on demand the
// same way the guided tour loads its CSS: only when this module renders
// (it loads with the Settings page group), zero startup cost.
function ensurePermCss(){
  try{
    if(document.querySelector('link[data-h38-muse-perms-css]'))return;
    const l=document.createElement('link');
    l.rel='stylesheet';
    l.setAttribute('data-h38-muse-perms-css','1');
    l.href='./muse-permissions.css?build='+BUILD;
    document.head.appendChild(l);
  }catch(_){}
}

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

// ---- Muse connection keys (added 2026-11-18) ----
// Self-serve keys for the Connect Your Muse offer. The h38-muse-keys edge
// function issues keys into the same business_records store the MCP server
// validates (collection 'mcp_api_keys', SHA-256 hash only, record_status
// 'active'), so an issued key works with the live MCP server exactly like
// the original hand-made key, and revoke flips record_status server-side —
// the MCP server accepts only 'active', so a revoked key stops working at
// once. The raw key is shown exactly once, here, at issue time; it is never
// stored or shown again. Keys follow the permissions granted on this screen:
// issuing requires the required grants, and Revoke All revokes the keys too.
const MCP_ENDPOINT='https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-mcp-server';
const KEY_STATE={keys:null,busy:'',error:'',notice:'',newKey:'',loaded:false,loading:false};

function isOwnerAdmin(){
  try{
    const u=window.state?.snapshot?.user;
    return !!(u&&(u.owner===true||/owner|administrator/i.test(text(u.roleName||u.role||''))));
  }catch(_){return false;}
}
function supabaseClient(){
  try{
    return window.H38_SUPABASE_SHARED_CLIENT?.ensure?window.H38_SUPABASE_SHARED_CLIENT.ensure():null;
  }catch(_){return null;}
}
async function invokeKeys(payload){
  const client=supabaseClient();
  if(!client)throw new Error('Secure connection unavailable. Try again in a moment.');
  const res=await client.functions.invoke('h38-muse-keys',{body:payload});
  if(res.error){
    let msg=text(res.error.message)||'Request failed';
    try{
      const ctx=res.error.context;
      if(ctx&&typeof ctx.json==='function'){const j=await ctx.json();if(j&&j.error)msg=text(j.error);}
    }catch(_){}
    throw new Error(msg);
  }
  if(res.data&&res.data.error)throw new Error(text(res.data.error));
  return res.data||{};
}
async function loadKeys(){
  if(KEY_STATE.loading||!businessId())return;
  KEY_STATE.loading=true;
  try{
    const d=await invokeKeys({action:'list',businessId:businessId()});
    KEY_STATE.keys=Array.isArray(d.keys)?d.keys:[];
    KEY_STATE.loaded=true;
  }catch(e){
    KEY_STATE.error=text(e?.message)||'Could not load your connection keys.';
  }
  KEY_STATE.loading=false;
  paintKeySection();
}
async function copyText(value,okMsg){
  try{
    if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(value);toast(okMsg);return;}
    throw new Error('clipboard unavailable');
  }catch(_){
    toast('Copy it by hand: tap the field, select all, and copy.',true);
  }
}
function keySectionHtml(){
  const granted=hasRequired();
  const ownerAdmin=isOwnerAdmin();
  let h=`<div class="card"><h2>🔑 Your Muse Connection Key</h2>
    <p class="muted">Connect your own Muse to your Office — <strong>free</strong>, included with your Office. With a key, your Muse can read your customers, jobs, quotes, schedule, and invoices, and draft quotes, invoices, and time entries for your review.</p>`;
  if(KEY_STATE.error)h+=`<div class="h38-perm-status warn">${esc(KEY_STATE.error)}</div>`;
  if(KEY_STATE.notice)h+=`<div class="h38-perm-status good">${esc(KEY_STATE.notice)}</div>`;
  if(KEY_STATE.newKey){
    h+=`<div class="h38-key-reveal">
      <p><strong>Your new connection key — copy it now.</strong></p>
      <p class="muted small">⚠️ You won't see this key again — it is not stored anywhere you can open later. If you lose it, revoke it below and issue a new one. Anyone with this key can connect a Muse to your Office with the permissions on this screen, so keep it private.</p>
      <div class="h38-key-fieldrow"><input type="text" readonly value="${esc(KEY_STATE.newKey)}" data-key-new-field aria-label="Your new Muse connection key"></div>
      <div class="actions"><button type="button" class="primary" data-key-copy-new>Copy key</button><button type="button" class="secondary" data-key-done>Done</button></div>
    </div>`;
  }
  h+=`<h3>Connection address</h3>
    <div class="h38-key-fieldrow"><input type="text" readonly value="${esc(MCP_ENDPOINT)}" data-key-endpoint-field aria-label="Muse connection address"><button type="button" class="secondary" data-key-copy-endpoint>Copy</button></div>
    <h3>Set it up in Muse</h3>
    <ol class="h38-perm-list">
      <li>Issue a connection key below and copy it right away — it is shown only once.</li>
      <li>In Muse, open <strong>Settings → Connectors</strong> and choose <strong>Add custom connector</strong>.</li>
      <li>Name it <strong>H38 Office</strong> and paste the connection address above.</li>
      <li>When Muse asks for an API key or Bearer token, paste your connection key.</li>
      <li>Start a chat and ask Muse to list your customers — if they come up, you're connected.</li>
    </ol>`;
  if(!granted){
    h+=`<p class="muted small">Grant access on this screen first — a connection key follows the permissions you grant here, and issuing opens once the required permissions are on.</p>`;
  }else if(!ownerAdmin){
    h+=`<p class="muted small">Only the business Owner or an Administrator can issue or revoke connection keys.</p>`;
  }else{
    h+=`<h3>Issue a key</h3>
    <label class="small" for="h38MuseKeyName">Key name (optional — e.g. whose Muse this is for)</label>
    <div class="h38-key-fieldrow"><input type="text" id="h38MuseKeyName" maxlength="120" placeholder="e.g. My Muse"></div>
    <div class="actions"><button type="button" class="primary" data-key-issue ${KEY_STATE.busy==='issue'?'disabled':''}>${KEY_STATE.busy==='issue'?'Issuing…':'Issue connection key'}</button></div>`;
  }
  h+=`<h3>Your keys</h3>`;
  if(!KEY_STATE.loaded){
    h+=`<p class="muted small">${KEY_STATE.loading?'Loading your keys…':'Your keys will load here.'}</p>`;
  }else if(!KEY_STATE.keys.length){
    h+=`<p class="muted small">No connection keys yet. Issue one above and your Muse can connect.</p>`;
  }else{
    h+=KEY_STATE.keys.map(k=>{
      const active=k.status==='active';
      const created=k.created_at?new Date(k.created_at).toLocaleDateString():'';
      return `<div class="h38-perm-row">
        <span class="h38-perm-icon">🔑</span>
        <span><strong>${esc(k.name||'Muse connection key')}</strong> <span class="pill">${active?'Active':'Revoked'}</span><br><small class="muted">Created ${esc(created)}</small></span>
        ${active&&ownerAdmin?`<button type="button" class="secondary" data-key-revoke="${esc(k.record_key)}" ${KEY_STATE.busy==='revoke'?'disabled':''}>Revoke</button>`:''}
      </div>`;
    }).join('');
  }
  h+=`</div>`;
  return h;
}
function paintKeySection(){
  const mount=document.getElementById('h38MuseKeysMount');
  if(!mount)return;
  mount.innerHTML=keySectionHtml();
  mount.querySelector('[data-key-copy-endpoint]')?.addEventListener('click',()=>copyText(MCP_ENDPOINT,'Connection address copied.'));
  mount.querySelector('[data-key-copy-new]')?.addEventListener('click',()=>copyText(KEY_STATE.newKey,'Key copied.'));
  mount.querySelector('[data-key-done]')?.addEventListener('click',()=>{KEY_STATE.newKey='';paintKeySection();});
  mount.querySelector('[data-key-new-field]')?.addEventListener('focus',e=>{try{e.target.select();}catch(_){}});
  mount.querySelector('[data-key-endpoint-field]')?.addEventListener('focus',e=>{try{e.target.select();}catch(_){}});
  mount.querySelector('[data-key-issue]')?.addEventListener('click',async()=>{
    const nameEl=document.getElementById('h38MuseKeyName');
    const name=nameEl?text(nameEl.value):'';
    KEY_STATE.error='';KEY_STATE.notice='';KEY_STATE.busy='issue';paintKeySection();
    try{
      const d=await invokeKeys({action:'issue',businessId:businessId(),name});
      KEY_STATE.newKey=text(d.key);
      KEY_STATE.notice='Key issued. Copy it now — it will not be shown again.';
      KEY_STATE.loaded=false;
      await loadKeys();
    }catch(e){
      KEY_STATE.error=text(e?.message)||'Could not issue a key.';
    }
    KEY_STATE.busy='';paintKeySection();
  });
  mount.querySelectorAll('[data-key-revoke]').forEach(btn=>btn.addEventListener('click',async()=>{
    const recordKey=btn.getAttribute('data-key-revoke');
    if(!recordKey)return;
    if(!confirm('Revoke this connection key? Any Muse using it will be disconnected right away.'))return;
    KEY_STATE.error='';KEY_STATE.notice='';KEY_STATE.busy='revoke';paintKeySection();
    try{
      await invokeKeys({action:'revoke',businessId:businessId(),recordKey});
      KEY_STATE.notice='Key revoked.';
      KEY_STATE.loaded=false;
      await loadKeys();
    }catch(e){
      KEY_STATE.error=text(e?.message)||'Could not revoke that key.';
    }
    KEY_STATE.busy='';paintKeySection();
  }));
}
function mountKeySection(){
  if(!document.getElementById('h38MuseKeysMount'))return;
  paintKeySection();
  if(!KEY_STATE.loaded&&!KEY_STATE.loading)loadKeys();
}
async function revokeAllKeys(){
  // Best effort: Revoke All on this screen also revokes issued keys, so
  // "disconnect my Muse" really disconnects it (server-side, at once).
  try{
    if(!KEY_STATE.loaded)await loadKeys();
    const active=(KEY_STATE.keys||[]).filter(k=>k.status==='active');
    for(const k of active){
      try{await invokeKeys({action:'revoke',businessId:businessId(),recordKey:k.record_key});}catch(_){}
    }
    KEY_STATE.loaded=false;
  }catch(_){}
}

function renderGrantScreen(){
  const main=document.getElementById('mainContent');
  if(!main)return;
  ensurePermCss();
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
  </div>
  <div id="h38MuseKeysMount"></div>`;
  
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
  mountKeySection();
}

function renderStatus(){
  const main=document.getElementById('mainContent');
  if(!main)return;
  ensurePermCss();
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
  </div>
  <div id="h38MuseKeysMount"></div>`;
  
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
  document.querySelector('[data-perm-revoke-all]')?.addEventListener('click',async()=>{
    if(confirm('Revoke all Muse permissions? Your Muse will be disconnected, and your connection keys will be revoked too.')){
      await revokeAllKeys();
      saveGrants({granted:[],grantedAt:null,grantedBy:null});
      KEY_STATE.newKey='';
      renderStatus();toast('Muse disconnected.');
    }
  });
  mountKeySection();
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
    return baseOpen.apply(this,[page,...args]);
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
