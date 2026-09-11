(function(){
'use strict';
const BUILD='20260911-shared-settings-runtime-authority-1';
let rendering=false;
let enhanceScheduled=false;
let reassertTimer=0;
const text=value=>String(value==null?'':value).trim();
const app=()=>{try{return window.state||null;}catch(_){return null;}};
const snap=()=>app()?.snapshot||{};
const rows=name=>Array.isArray(snap()[name])?snap()[name]:[];
const esc=value=>typeof window.esc==='function'?window.esc(value):text(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const id=(row,...keys)=>text(typeof window.rowId==='function'?window.rowId(row,...keys):value(row,...keys));
const pill=(label,kind='')=>typeof window.pill==='function'?window.pill(label,kind):`<span class="pill ${esc(kind)}">${esc(label)}</span>`;
const pageHead=(title,description)=>typeof window.pageHead==='function'?window.pageHead(title,description):`<header class="page-head"><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="page-tools"></div></header>`;
const optionRows=(items,keys,labelFn,blank='Select')=>`<option value="">${esc(blank)}</option>`+items.map(row=>`<option value="${esc(id(row,...keys))}">${esc(labelFn(row))}</option>`).join('');
function shellLabels(){try{return typeof SHELL_LABELS!=='undefined'&&SHELL_LABELS?SHELL_LABELS:{office:'Business Office',employee:'Employee Office',field:'Field Office'};}catch(_){return{office:'Business Office',employee:'Employee Office',field:'Field Office'};}}
function toast(message,error=false){try{window.toast?.(message,error);}catch(_){} }
function currentBusinessKey(){const business=snap().business||{};return text(business.businessKey||business['Business Key']||app()?.businessKey).toLowerCase();}
function isH38Owner(){return currentBusinessKey()==='highway38'&&snap().user?.owner===true;}
function coreMarkup(){
  const users=rows('users').slice(0,100),roles=rows('roles').slice(0,50),providers=rows('providers').slice(0,50),modules=(Array.isArray(snap().modules)?snap().modules:[]).slice(0,100);
  const labels=shellLabels();
  return pageHead('Settings & Apps','Manage users, roles, product shells, providers, offline storage and owner-controlled recommendations.')+`<div class="grid">
    <section class="card span5"><h2>Add business user</h2><form id="userForm"><label>Email</label><input name="email" type="email" required><label>Display name</label><input name="displayName"><label>Role</label><select name="roleId">${optionRows(roles,['Role ID'],row=>value(row,'Role Name'),'Select role')}</select><div class="actions"><button>Save user access</button></div></form><div class="list">${users.length?users.map(row=>`<div class="row"><div class="row-top"><strong>${esc(value(row,'Display Name','Email'))}</strong>${pill(value(row,'Status'))}</div><small>${esc(value(row,'Email'))} · ${esc(value(row,'Role ID'))}</small></div>`).join(''):'<div class="empty">No users.</div>'}</div></section>
    <section class="card span4"><h2>Provider connections</h2><div class="list">${providers.length?providers.map(row=>`<div class="row provider"><div><strong>${esc(value(row,'Provider Name'))}</strong><small>${esc(value(row,'Provider Type'))}</small></div>${pill(value(row,'Connection Status'),value(row,'Connection Status')==='Connected'?'good':'pending')}</div>`).join(''):'<div class="empty">No provider connections.</div>'}</div><p class="muted small">Email, SMS, social and AI providers are connected per business. Credentials are never copied from one business to another.</p></section>
    <section class="card span3"><h2>Installed modules</h2><div class="list">${modules.length?modules.map(module=>`<div class="row"><strong>${esc(module)}</strong></div>`).join(''):'<div class="empty">No modules listed.</div>'}</div></section>
    <section class="card span6"><h2>Product shells</h2><div class="list">${Object.entries(labels).map(([key,label])=>`<div class="row"><div class="row-top"><strong>${esc(label)}</strong><a href="./?shell=${esc(key)}">Open shell</a></div><small>Uses the same business records and upgrade path.</small></div>`).join('')}</div></section>
    <section class="card span6"><h2>Offline device</h2><p class="muted">Last pack: ${esc(snap().cachedAt?new Date(snap().cachedAt).toLocaleString():'Not cached yet')}</p><label>Secure bridge URL</label><input id="bridgeUrlSetting" value="${esc(app()?.bridge?.url||window.BRIDGE_URL||'')}"><label><input id="settingsDrivingMode" type="checkbox" ${app()?.drivingMode?'checked':''}> Driving mode</label><div class="actions"><button id="saveLocalSettings" type="button">Save device settings</button><button id="clearDevice" type="button" class="danger">Clear this device</button></div><div class="notice warn"><strong>Owner control:</strong> drafts and internal work can be created here. Nothing is automatically sent, published, purchased, paid, deleted or approved.</div></section>
  </div>`;
}
function bindCoreActions(){
  const form=document.getElementById('userForm');
  if(form)form.onsubmit=async event=>{
    event.preventDefault();
    const data=new FormData(form),email=text(data.get('email'));
    if(!email){toast('Email is required.',true);return;}
    try{
      if(typeof window.queueOperation!=='function')throw new Error('User-access queue is unavailable.');
      const recordId=typeof window.newId==='function'?window.newId('USER'):`USER-${Date.now()}`;
      await window.queueOperation('SAVE_USER','User',recordId,{email,displayName:text(data.get('displayName')),roleId:text(data.get('roleId'))});
      form.reset();toast('User access queued. The user will only see this business after synchronization.');
    }catch(error){toast(text(error?.message||error),true);}
  };
  const save=document.getElementById('saveLocalSettings');
  if(save)save.onclick=async()=>{
    try{
      const settings={id:'settings',bridgeUrl:text(document.getElementById('bridgeUrlSetting')?.value)||window.BRIDGE_URL||'',drivingMode:!!document.getElementById('settingsDrivingMode')?.checked};
      if(typeof window.put==='function')await window.put('meta',settings);
      if(app())app().drivingMode=settings.drivingMode;
      app()?.bridge?.setUrl?.(settings.bridgeUrl);
      toast('Device settings saved.');
    }catch(error){toast(text(error?.message||error),true);}
  };
  const clear=document.getElementById('clearDevice');
  if(clear)clear.onclick=async()=>{
    if(!window.confirm?.('Clear all Commercial Office data saved on this device? Server records will not be deleted.'))return;
    try{if(typeof window.clearAll==='function')await window.clearAll();location.reload();}catch(error){toast(text(error?.message||error),true);}
  };
}
function storageCard(){
  const grid=document.querySelector('#mainContent .grid');if(!grid||document.getElementById('businessStorageProviderCard'))return;
  const storage=snap().storageSettings||{provider:'supabase',connectionStatus:'connected'};
  const drive=storage.provider==='google_drive';
  const card=document.createElement('section');card.id='businessStorageProviderCard';card.className='card span6';
  card.innerHTML=`<h2>File storage</h2><div class="row"><div><strong>${drive?'Client Google Drive':'Supabase private storage'}</strong><small>${drive?`Business-owned Drive${storage.providerAccountEmail?' · '+esc(storage.providerAccountEmail):''}`:'Default private storage inside the business Supabase tenant'}</small></div>${pill(storage.connectionStatus==='connected'?'Connected':'Setup required',storage.connectionStatus==='connected'?'good':'pending')}</div><p class="muted">Supabase remains the system of record. File metadata, permissions, assignments, proof and error history stay in Supabase even when the original file is stored in the client’s own Google Drive.</p>`;
  grid.appendChild(card);
}
function privacyCard(){
  const grid=document.querySelector('#mainContent .grid');if(!grid||document.getElementById('h38AccountPrivacyCard'))return;
  const card=document.createElement('section');card.id='h38AccountPrivacyCard';card.className='card span6';
  card.innerHTML='<h2>Account & privacy</h2><p class="muted">Review how H38 handles Business Office data or request deletion of your signed-in account and user-private records.</p><div class="actions"><a class="secondary" href="https://highway38solutions.com/privacy.html" target="_self">Privacy policy</a><a class="secondary" href="https://highway38solutions.com/account-deletion.html" target="_self">Delete account / data</a></div><p class="muted small">Shared business records may be retained by the business for legitimate accounting, audit, security, contractual, or legal purposes after a user\'s access is removed.</p>';
  grid.appendChild(card);
}
function h38TenantFallback(){
  if(!isH38Owner())return;
  const grid=document.querySelector('#mainContent .grid');if(!grid||document.getElementById('clientTenantInstallerCard'))return;
  const api=window.H38_CLIENT_TENANT_INSTALLER;
  if(api?.renderCard){try{api.renderCard();return;}catch(error){console.warn('[H38 Settings] tenant card:',error);}}
  const card=document.createElement('section');card.id='clientTenantInstallerCard';card.className='card span6';
  card.innerHTML='<h2>Client tenant installer</h2><p class="muted">Tenant status is loaded only when requested so Settings stays responsive.</p><div class="actions"><button id="h38SettingsLoadTenants" type="button" class="secondary">Load client tenants</button></div><div id="clientTenantList" class="list"><div class="empty">Client tenants are not loaded automatically.</div></div>';
  grid.appendChild(card);
  const button=document.getElementById('h38SettingsLoadTenants');
  if(button)button.onclick=async()=>{
    if(!api?.refresh){toast('Tenant installer is refreshing to the current Office build. Reopen Settings after the Office refresh completes.',true);return;}
    button.disabled=true;button.textContent='Loading…';
    try{
      const result=await Promise.race([api.refresh(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Tenant status timed out. Settings remains usable.')),8000))]);
      const businesses=Array.isArray(result?.businesses)?result.businesses:[];
      const list=document.getElementById('clientTenantList');
      if(list)list.innerHTML=businesses.length?businesses.map(row=>`<div class="row"><div class="row-top"><strong>${esc(row.displayName||row.businessKey)}</strong>${pill(row.businessStatus||'unknown')}</div><small>${esc(row.businessKey||'')} · ${Number(row.recordCount||0)} records</small></div>`).join(''):'<div class="empty">No client tenants found.</div>';
    }catch(error){toast(text(error?.message||error),true);}finally{button.disabled=false;button.textContent='Refresh client tenants';}
  };
}
function enhance(){
  enhanceScheduled=false;
  if(app()?.page!=='settings'||!document.querySelector('#mainContent .grid'))return;
  for(const task of [storageCard,privacyCard,h38TenantFallback,()=>window.H38_OFFICE_ACCESS_COMPLETION?.enhance?.()]){
    try{task();}catch(error){console.warn('[H38 Settings] optional enhancer failed:',error);}
  }
}
function scheduleEnhance(){
  if(enhanceScheduled)return;
  enhanceScheduled=true;
  const run=()=>{enhanceScheduled=false;enhance();};
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);
}
function renderSettingsAuthority(){
  if(rendering)return;
  const main=document.getElementById('mainContent');if(!main)return;
  rendering=true;
  try{main.innerHTML=coreMarkup();bindCoreActions();}
  catch(error){console.error('[H38 Settings] core render failed:',error);main.innerHTML=pageHead('Settings & Apps','Settings opened in safe mode.')+`<section class="card"><h2>Settings safe mode</h2><p class="notice warn">A Settings component failed to render, but the Business Office remains usable.</p><p class="muted">${esc(text(error?.message||error))}</p></section>`;}
  finally{rendering=false;}
  scheduleEnhance();
}
renderSettingsAuthority.__h38SettingsRuntimeAuthority=true;
renderSettingsAuthority.__h38SettingsRuntimeBuild=BUILD;
function install(){
  if(window.renderSettings!==renderSettingsAuthority){window.renderSettings=renderSettingsAuthority;try{renderSettings=renderSettingsAuthority;}catch(_){} }
  return true;
}
function boundedReassert(){
  let attempts=0;clearInterval(reassertTimer);
  reassertTimer=setInterval(()=>{install();if(++attempts>=20)clearInterval(reassertTimer);},250);
}
install();boundedReassert();
window.addEventListener('pageshow',()=>{install();boundedReassert();});
window.addEventListener('h38:office-page-rendered',event=>{if(event?.detail?.page==='settings'){install();scheduleEnhance();}});
window.addEventListener('h38:business-snapshot-updated',()=>{if(app()?.page==='settings')scheduleEnhance();});
window.H38_SETTINGS_RUNTIME_AUTHORITY=Object.freeze({enabled:true,build:BUILD,sharedTenants:true,reentrant:false,automaticNetworkOnOpen:false,mutationObserver:false,boundedReassert:true,render:renderSettingsAuthority,install,enhance});
})();
