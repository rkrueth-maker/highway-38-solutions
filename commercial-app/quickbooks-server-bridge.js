(function(){
'use strict';
const BUILD='20261101-wave3tail1-qbo-sync-1';
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
async function invoke(action,extra={}){
  const businessId=text(window.state?.businessId);
  if(!businessId)throw new Error('Open a business before using QuickBooks.');
  const api=client(),{data:auth,error:authError}=await api.auth.getSession();
  if(authError)throw authError;
  const token=auth?.session?.access_token;
  if(!token)throw new Error('Sign in again before using QuickBooks.');
  // Direct fetch with exactly one Authorization header. Routing this through the
  // second client's invoke helper merged its default anon-key Authorization
  // ahead of the user token, so the bridge function received the publishable key
  // as the bearer and rejected every call as an invalid session (HTTP 401).
  const response=await fetch(`${cfg.url}/functions/v1/${ENDPOINT}`,{method:'POST',headers:{authorization:`Bearer ${token}`,apikey:cfg.publishableKey,'content-type':'application/json','x-client-info':`h38-qbo-browser-${BUILD}`},body:JSON.stringify({action,businessId,...extra})});
  let data=null;
  try{data=await response.json();}catch(_){}
  if(!response.ok)throw new Error(text(data?.error||data?.message||'QuickBooks request failed.'));
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
  const record={...prior,id:'quickbooks-online','Accounting Connection ID':'quickbooks-online','Business ID':window.state.businessId,provider:'quickbooks-online',companyLabel:text(connection.companyName),realmId:text(connection.realmId),mode:text(connection.mode)||'production',status:'Connected — Server Managed',serverManaged:true,externalWritesEnabled:connection.externalWritesEnabled===true,lastServerSync:text(connection.lastSyncedAt),'Updated Time':new Date().toISOString(),'Record Version':Math.max(1,Number(prior['Record Version']||0)+1)};
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
function renderQueue(panel,queue){
  const target=panel.querySelector('[data-qbo-sync-queue]');
  if(!target)return;
  if(!queue){target.innerHTML='<p class="h38-platform-note">Sync queue loads after the connection status.</p>';return;}
  const counts=queue.counts||{};
  const failed=(queue.items||[]).filter(item=>item.status==='failed');
  const rows=failed.slice(0,10).map(item=>`<div class="h38-platform-row"><strong>${esc(item.entityType||'')} · ${esc(item.h38RecordKey||'')}</strong><small>${esc(item.lastError||'Sync failed.')} (attempts: ${Number(item.attempts||0)})</small></div>`).join('');
  target.innerHTML=`<div class="h38-platform-list"><div class="h38-platform-row"><strong>Sync queue</strong><small>${Number(counts.pending||0)} waiting · ${Number(counts.failed||0)} in the error queue · ${Number(counts.synced||0)} synced</small></div>${rows||'<div class="h38-platform-row"><strong>Error queue is clear</strong><small>No failed syncs waiting for review.</small></div>'}</div>`;
}
async function loadQueue(panel){
  try{const data=await invoke('queue');renderQueue(panel,data.queue);}catch(error){renderQueue(panel,null);const target=panel.querySelector('[data-qbo-sync-queue]');if(target)target.innerHTML=`<p class="h38-platform-note">Sync queue could not load: ${esc(text(error.message))}</p>`;}
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
  panel.querySelector('[data-qbo-sync-run]')?.addEventListener('click',async()=>{
    const button=panel.querySelector('[data-qbo-sync-run]');
    try{button.disabled=true;button.textContent='Syncing…';await invoke('enqueue');const data=await invoke('sync');renderQueue(panel,data.queue);const s=data.sync||{};window.toast?.(s.connected?`QuickBooks sync: ${Number(s.synced||0)} sent, ${Number(s.importedPayments||0)} payments pulled in, ${Number(s.failed||0)} in the error queue.`:`QuickBooks is not reachable yet — ${Number(s.failed||0)} record(s) are safe in the error queue with the reason. Connect QuickBooks, then Retry.`,Number(s.failed||0)>0);}catch(error){window.toast?.(text(error.message)||'QuickBooks sync failed.');loadQueue(panel);}finally{button.disabled=false;button.textContent='Sync now';}
  });
  panel.querySelector('[data-qbo-retry]')?.addEventListener('click',async()=>{
    const button=panel.querySelector('[data-qbo-retry]');
    try{button.disabled=true;const data=await invoke('retry');renderQueue(panel,data.queue);window.toast?.(`${Number(data.retry?.requeued||0)} failed sync(s) put back in line. Run Sync now to send them.`);}catch(error){window.toast?.(text(error.message)||'Retry failed.');}finally{button.disabled=false;}
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
  panel.innerHTML=`<div class="h38-platform-head"><div><span class="h38-platform-kicker">SERVER CONNECTION</span><h3>Secure Intuit connection</h3><p class="h38-platform-note">${esc(statusLine(connection))}</p></div><span class="h38-platform-badge">${esc(connection.status||'unknown')}</span></div><div class="h38-platform-actions">${connected?'<button type="button" class="secondary" data-qbo-refresh>Refresh connection</button><button type="button" class="secondary" data-qbo-preview-run>Reconciliation preview</button><button type="button" class="secondary" data-qbo-disconnect>Disconnect</button>':'<button type="button" data-qbo-connect>Connect QuickBooks</button>'}<button type="button" data-qbo-sync-run>Sync now</button><button type="button" class="secondary" data-qbo-retry>Retry failed</button></div>${connection.lastError?`<p class="h38-platform-note">Last connector error: ${esc(connection.lastError)}</p>`:''}<div data-qbo-server-preview></div><div data-qbo-sync-queue></div><p class="h38-platform-note">OAuth tokens stay encrypted on the server. Browser code receives only non-secret status. Two-way sync: customers, invoices and payments push to QuickBooks, and payments recorded in QuickBooks pull back into the Office. Anything that fails lands in the error queue above with the reason — retry it after fixing the cause.</p>`;
  renderPreview(panel,null);bind(panel,connection);loadQueue(panel);
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
window.H38_QUICKBOOKS_SERVER_BRIDGE=Object.freeze({build:BUILD,endpoint:ENDPOINT,serverManagedTokens:true,browserSecrets:false,externalAccountingWrites:true,loadStatus,invoke});
})();
