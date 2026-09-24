(function(){
'use strict';
const BUILD='20260924-qbo-server-bridge-1';
const ENDPOINT='h38-quickbooks-bridge';
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
let db=null,scheduled=false,statusCache=new Map();
const text=v=>String(v==null?'':v).trim();
const esc=v=>typeof window.esc==='function'?window.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const taxCenterOwnsUi=()=>window.H38_TAX_CENTER?.enabled===true;
function canFinancial(){
  const user=window.state?.snapshot?.user||{};
  if(user.owner===true||/\b(owner|administrator)\b/i.test(text(user.roleName||user.role)))return true;
  try{return typeof window.can==='function'&&(window.can('manageFinancial')||window.can('manageSettings'));}catch(_){return false;}
}
function client(){
  if(db)return db;
  if(!cfg.enabled||!window.supabase||!cfg.url||!cfg.publishableKey)throw new Error('Supabase Business Office is unavailable.');
  db=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},global:{headers:{'x-client-info':`h38-qbo-browser-${BUILD}`}}});
  return db;
}
async function functionError(error){
  let detail='';
  const context=error&&error.context;
  if(context&&typeof context.clone==='function'){
    try{const payload=await context.clone().json();detail=text(payload?.error||payload?.message);}catch(_){}
  }
  return detail||text(error?.message||error||'QuickBooks request failed.');
}
async function invoke(action,extra={}){
  const businessId=text(window.state?.businessId);
  if(!businessId)throw new Error('Open a business before using QuickBooks.');
  const api=client(),{data:auth,error:authError}=await api.auth.getSession();
  if(authError)throw authError;
  const token=auth?.session?.access_token;
  if(!token)throw new Error('Sign in again before using QuickBooks.');
  if(api.functions&&typeof api.functions.setAuth==='function')api.functions.setAuth(token);
  const {data,error}=await api.functions.invoke(ENDPOINT,{body:{action,businessId,...extra},headers:{authorization:`Bearer ${token}`,'x-client-info':`h38-qbo-browser-${BUILD}`}});
  if(error)throw new Error(await functionError(error));
  if(!data||data.status!=='PASS')throw new Error(text(data?.error||'QuickBooks request did not complete.'));
  return data;
}
function returnUrl(){
  const url=new URL(window.location.href);
  url.searchParams.delete('qbo');
  url.searchParams.delete('qbo_message');
  return url.toString();
}
function mode(){
  const snapshot=Array.isArray(window.state?.snapshot?.accountingConnections)?window.state.snapshot.accountingConnections:[];
  const row=snapshot.find(r=>text(r.id||r['Accounting Connection ID'])==='quickbooks-online');
  return text(row?.mode).toLowerCase()==='sandbox'?'sandbox':'production';
}
function statusLine(connection){
  if(!connection?.configured)return 'Server connector needs its Intuit secrets configured.';
  if(connection.status!=='connected')return 'Not connected to QuickBooks Online.';
  return `${connection.companyName||'QuickBooks company'} · ${connection.mode||'production'} · realm ${connection.realmId||'—'}`;
}
async function persistMetadata(connection){
  if(!connection||connection.status!=='connected'||typeof window.H38_PLATFORM_NEXT?.saveEntity!=='function')return;
  const prior=(Array.isArray(window.state?.snapshot?.accountingConnections)?window.state.snapshot.accountingConnections:[]).find(r=>text(r.id||r['Accounting Connection ID'])==='quickbooks-online')||{};
  const record={...prior,id:'quickbooks-online','Accounting Connection ID':'quickbooks-online','Business ID':window.state.businessId,provider:'quickbooks-online',companyLabel:text(connection.companyName),realmId:text(connection.realmId),mode:text(connection.mode)||'production',status:'Connected — Server Managed',serverManaged:true,externalWritesEnabled:false,lastServerSync:text(connection.lastSyncedAt),'Updated Time':new Date().toISOString(),'Record Version':Math.max(1,Number(prior['Record Version']||0)+1)};
  await window.H38_PLATFORM_NEXT.saveEntity('accountingConnections','Accounting Connection','quickbooks-online',record,['id']);
}
async function recordPreview(payload){
  if(typeof window.H38_PLATFORM_NEXT?.saveEntity!=='function')return;
  const id=typeof window.newId==='function'?window.newId('ACCOUNTING-SYNC'):`ACCOUNTING-SYNC-${crypto.randomUUID().toUpperCase()}`;
  const record={id,'Accounting Sync Run ID':id,'Business ID':window.state.businessId,provider:'quickbooks-online',status:'Server Reconciliation Preview — No Provider Writes',counts:payload?.counts||{},conflictsRequireReview:true,externalWritesEnabled:false,'Created Time':new Date().toISOString(),'Updated Time':new Date().toISOString(),'Record Version':1};
  await window.H38_PLATFORM_NEXT.saveEntity('accountingSyncRuns','Accounting Sync Preview',id,record,['id'],false);
}
function renderPreview(panel,preview){
  const target=panel.querySelector('[data-qbo-server-preview]');
  if(!target)return;
  if(!preview){target.innerHTML='<p class="h38-platform-note">Run a read-only reconciliation preview after connecting. Nothing is posted to QuickBooks.</p>';return;}
  const rows=['customers','invoices','payments','expenses'].map(key=>{const row=preview.counts?.[key]||{};return `<div class="h38-platform-row"><strong>${esc(key[0].toUpperCase()+key.slice(1))}</strong><small>H38 ${Number(row.h38||0)} · QuickBooks ${Number(row.quickBooks||0)} · mapped ${Number(row.mapped||0)}</small></div>`;}).join('');
  target.innerHTML=`<div class="h38-platform-list">${rows}</div><p class="h38-platform-note">${esc(preview.message||'Preview complete.')} Conflicts stay review-first.</p>`;
}
function bind(panel,connection){
  panel.querySelector('[data-qbo-connect]')?.addEventListener('click',async()=>{
    const button=panel.querySelector('[data-qbo-connect]');
    try{button.disabled=true;button.textContent='Opening Intuit…';const data=await invoke('start',{mode:mode(),returnUrl:returnUrl()});if(!data.authorizationUrl)throw new Error('QuickBooks authorization URL was not returned.');window.location.assign(data.authorizationUrl);}catch(error){window.toast?.(text(error.message)||'Could not start QuickBooks connection.');button.disabled=false;button.textContent='Connect QuickBooks';}
  });
  panel.querySelector('[data-qbo-refresh]')?.addEventListener('click',async()=>{
    try{const data=await invoke('refresh');statusCache.set(text(window.state.businessId),{time:Date.now(),connection:data.connection});await persistMetadata(data.connection);window.toast?.('QuickBooks connection refreshed.');schedule();}catch(error){window.toast?.(text(error.message)||'QuickBooks refresh failed.');}
  });
  panel.querySelector('[data-qbo-preview-run]')?.addEventListener('click',async()=>{
    const button=panel.querySelector('[data-qbo-preview-run]');
    try{button.disabled=true;button.textContent='Checking…';const data=await invoke('preview');renderPreview(panel,data.preview);statusCache.set(text(window.state.businessId),{time:Date.now(),connection:data.connection});await recordPreview(data.preview);window.toast?.('QuickBooks reconciliation preview complete. No provider records changed.');}catch(error){window.toast?.(text(error.message)||'QuickBooks preview failed.');}finally{button.disabled=false;button.textContent='Reconciliation preview';}
  });
  panel.querySelector('[data-qbo-disconnect]')?.addEventListener('click',async()=>{
    if(!window.confirm('Disconnect QuickBooks for this business? This revokes the provider connection but does not delete H38 records.'))return;
    try{const data=await invoke('disconnect');statusCache.set(text(window.state.businessId),{time:Date.now(),connection:data.connection});window.toast?.('QuickBooks disconnected.');schedule();}catch(error){window.toast?.(text(error.message)||'QuickBooks disconnect failed.');}
  });
}
async function loadStatus(force=false){
  const businessId=text(window.state?.businessId);
  if(!businessId)return null;
  const cached=statusCache.get(businessId);
  if(!force&&cached&&Date.now()-cached.time<30000)return cached.connection;
  const data=await invoke('status');statusCache.set(businessId,{time:Date.now(),connection:data.connection});return data.connection;
}
async function render(){
  if(text(window.state?.page)!=='accounting'||!canFinancial())return;
  if(taxCenterOwnsUi()){document.querySelector('[data-h38-qbo-server]')?.remove();return;}
  const card=document.querySelector('#h38QuickBooksBridge');
  if(!card)return;
  let panel=card.querySelector('[data-h38-qbo-server]');
  if(!panel){panel=document.createElement('section');panel.dataset.h38QboServer='1';panel.style.marginTop='14px';card.appendChild(panel);}
  let connection={status:'loading',configured:true,externalWritesEnabled:false};
  try{connection=await loadStatus(false)||connection;}catch(error){connection={status:'error',configured:true,lastError:text(error.message),externalWritesEnabled:false};}
  if(taxCenterOwnsUi()){panel.remove();return;}
  const connected=connection.status==='connected';
  panel.innerHTML=`<div class="h38-platform-head"><div><span class="h38-platform-kicker">SERVER CONNECTION</span><h3>Secure Intuit connection</h3><p class="h38-platform-note">${esc(statusLine(connection))}</p></div><span class="h38-platform-badge">${esc(connection.status||'unknown')}</span></div><div class="h38-platform-actions">${connected?'<button type="button" class="secondary" data-qbo-refresh>Refresh connection</button><button type="button" class="secondary" data-qbo-preview-run>Reconciliation preview</button><button type="button" class="secondary" data-qbo-disconnect>Disconnect</button>':'<button type="button" data-qbo-connect>Connect QuickBooks</button>'}</div>${connection.lastError?`<p class="h38-platform-note">Last connector error: ${esc(connection.lastError)}</p>`:''}<div data-qbo-server-preview></div><p class="h38-platform-note">OAuth tokens stay encrypted on the server. Browser code receives only non-secret status. QuickBooks accounting writes remain disabled in this phase.</p>`;
  renderPreview(panel,null);bind(panel,connection);
}
function consumeCallbackMarker(){
  const url=new URL(window.location.href),marker=url.searchParams.get('qbo');
  if(!marker)return;
  const message=url.searchParams.get('qbo_message');
  if(marker==='connected')window.toast?.('QuickBooks connected securely.');
  if(marker==='error')window.toast?.(message||'QuickBooks authorization did not complete.');
  url.searchParams.delete('qbo');url.searchParams.delete('qbo_message');history.replaceState(history.state,'',url.toString());
  statusCache.delete(text(window.state?.businessId));
}
function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;render();});}
window.addEventListener('h38:office-page-rendered',schedule);
window.addEventListener('h38:business-snapshot-updated',schedule);
window.addEventListener('pageshow',schedule);
consumeCallbackMarker();schedule();
window.H38_QUICKBOOKS_SERVER_BRIDGE=Object.freeze({build:BUILD,endpoint:ENDPOINT,serverManagedTokens:true,browserSecrets:false,externalAccountingWrites:false,loadStatus,invoke});
})();
