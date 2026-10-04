(function(){
'use strict';
// H38 Offline Mode — readiness panel, reconnect auto-sync with backoff, conflict resolution UI.
// Extends the existing offline queue in app-02.js (queueOperation/sync/syncPass). Builds no second queue.
// Parse-time work is trivial (toggle registration + event listeners); nothing here runs at startup
// beyond that, so the authenticated shell startup budget is untouched.
const BUILD='20261004-offline-1';
const FEATURE_ID='offline_mode';

// --- Owner Controls toggle (id-guarded push; owner-controls.js is never edited) ---
if(window.H38OwnerControls&&Array.isArray(window.H38OwnerControls.FEATURES)&&!window.H38OwnerControls.FEATURES.some(f=>f.id===FEATURE_ID)){
  window.H38OwnerControls.FEATURES.push({id:FEATURE_ID,title:'Offline mode',desc:'Full offline operation: cached business pack, offline queue with auto-sync, sync status.',icon:'📴',default:true,category:'General'});
}

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v||0);
const text=v=>String(v==null?'':v).trim();
const store=()=>window.H38DB||{};
function office(){try{if(typeof state!=='undefined'&&state)return state;}catch(e){}return{};}
function enabled(){try{if(window.H38OwnerControls&&typeof window.H38OwnerControls.isEnabled==='function')return window.H38OwnerControls.isEnabled(FEATURE_ID);}catch(e){}return true;}
function $(id){return typeof document==='undefined'?null:document.getElementById(id);}
function isOnline(){return typeof navigator!=='undefined'&&navigator.onLine!==false;}
function fmtTime(value){try{if(typeof dateTime==='function')return dateTime(value);}catch(e){}return value||'Not set';}
function callGlobal(name,...args){try{const fn=typeof window!=='undefined'?window[name]:undefined;if(typeof fn==='function')return fn(...args);}catch(e){}return undefined;}

// ---------- sync status bookkeeping (last successful sync) ----------
const META_ID='offlineMode';
async function readStatus(){try{const rec=await store().get('meta',META_ID);return rec||{};}catch(e){return{};}}
async function writeStatus(patch){try{const cur=await readStatus();await store().put('meta',Object.assign({id:META_ID},cur,patch));}catch(e){}}

// ---------- cached business pack collections ----------
const COLLECTION_LABELS={customers:'Customers',jobs:'Jobs',tasks:'Tasks',quotes:'Quotes',priceBook:'Price book',scheduleEvents:'Schedule',messages:'Messages',equipment:'Equipment',properties:'Properties',assets:'Assets',users:'Users',vehicles:'Vehicles',invoices:'Invoices',payments:'Payments',expenses:'Expenses',documents:'Documents',attachments:'Attachments',campaigns:'Campaigns',requests:'Requests',quickActions:'Quick actions',aiRecommendations:'Recommendations',roles:'Roles',providers:'Providers',timeEntries:'Time entries',socialPosts:'Social posts',modules:'Modules'};
function prettyKey(key){return text(key).replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase()).trim();}
function cachedCollections(){const snap=office().snapshot||{};return Object.keys(snap).filter(k=>Array.isArray(snap[k])).map(k=>({key:k,label:COLLECTION_LABELS[k]||prettyKey(k),count:snap[k].length})).sort((a,b)=>b.count-a.count);}

// ---------- operations ----------
async function businessOps(){try{const rows=await store().all('operations');const bid=office().businessId;return (rows||[]).filter(op=>op.businessId===bid);}catch(e){return[];}}
async function findOp(opId){const ops=await businessOps();return ops.find(o=>String(o.operationId||o.id)===String(opId))||null;}
function findCachedRecord(op){try{if(!op||!op.collection||typeof records!=='function'||typeof v!=='function')return null;const idKeys=op.idKeys&&op.idKeys.length?op.idKeys:['id'];const target=String(op.recordId??'');if(!target)return null;return (records(op.collection)||[]).find(row=>idKeys.some(key=>{const value=v(row,key);return value!==''&&String(value)===target;}))||null;}catch(e){return null;}}

// ---------- conflict detail (field-level what-changed, when comparable data exists) ----------
const HIDDEN_PAYLOAD_KEYS=new Set(['base64Data','baseVersion','Base Version','password','token','Payload','payload']);
function payloadSource(payload){if(payload&&typeof payload==='object'&&payload.record&&typeof payload.record==='object')return payload.record;return payload||{};}
function payloadFields(payload,max){const out=[],source=payloadSource(payload);if(!source||typeof source!=='object')return out;for(const key of Object.keys(source)){if(out.length>=max)break;if(HIDDEN_PAYLOAD_KEYS.has(key))continue;const value=source[key];if(value==null||typeof value==='object')continue;const str=String(value);if(!str||str.length>140)continue;out.push({key,value:str});}return out;}
function fieldDiffs(op,cached,max){const diffs=[];if(!cached)return diffs;for(const f of payloadFields(op.payload,24)){if(diffs.length>=max)break;if(!(f.key in cached))continue;const cur=cached[f.key];if(cur==null||String(cur)===f.value)continue;diffs.push({key:f.key,mine:f.value,server:String(cur).slice(0,80)});}return diffs;}
function describeConflict(op){const cached=findCachedRecord(op);const diffs=fieldDiffs(op,cached,6);return{opId:String(op.operationId||op.id),recordType:text(op.recordType)||'Record',recordId:String(op.recordId||''),action:text(op.action).replaceAll('_',' '),queuedAt:op.localTimestamp||'',baseVersion:num(op.baseVersion),serverVersion:num(op.serverVersion),conflictId:text(op.conflictId),fields:payloadFields(op.payload,8),diffs,cached:!!cached};}

// ---------- conflict resolution ----------
async function keepServer(opId){const op=await findOp(opId);if(!op||op.syncStatus!=='CONFLICT')return false;await store().remove('operations',op.id);callGlobal('updatePending');callGlobal('toast','Kept the server version. Your queued change was discarded.');await renderPanel();return true;}
async function reapplyMine(opId){const op=await findOp(opId);if(!op||op.syncStatus!=='CONFLICT')return false;op.baseVersion=Math.max(num(op.serverVersion),num(op.baseVersion));op.syncStatus='PENDING';op.retryCount=0;op.lastError='';op.conflictId='';op.serverVersion=0;await store().put('operations',op);callGlobal('updatePending');callGlobal('toast','Your change was re-queued on top of the server version.');await renderPanel();const st=office();if(isOnline()&&st.bridgeReady)callGlobal('sync',false);return true;}

// ---------- business pack refresh ----------
const PACK_SESSION_KEY='h38-offline-pack-refreshed';
const PACK_STALE_MS=24*3600*1000;
async function refreshPack(){const st=office();if(!st.businessId)throw new Error('Open a business first.');if(!isOnline()){callGlobal('toast','Offline — showing the saved business pack. Reconnect to refresh.',true);return false;}await callGlobal('loadBusiness',st.businessId);return true;}
async function autoRefreshPack(){
  // Once-per-session, only when the pack is older than a day and the device is online with a live bridge.
  if(!enabled())return 'disabled';
  try{if(sessionStorage.getItem(PACK_SESSION_KEY))return 'session-done';}catch(e){}
  const st=office();if(!st.businessId)return 'no-business';
  const cachedAt=st.snapshot&&st.snapshot.cachedAt?new Date(st.snapshot.cachedAt).getTime():0;
  if(cachedAt&&Date.now()-cachedAt<PACK_STALE_MS)return 'fresh';
  if(!isOnline())return 'offline';
  if(!st.bridgeReady)return 'not-ready';
  try{sessionStorage.setItem(PACK_SESSION_KEY,'1');}catch(e){}
  await callGlobal('loadBusiness',st.businessId,true);
  return 'refreshed';
}

// ---------- reconnect auto-sync with backoff ----------
let retryTimer=null,retryAttempt=0,lastOnlineHandled=0;
const BACKOFF_MS=[5000,15000,45000,120000,300000];
function clearRetry(){if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}}
async function handleOnline(){
  if(!enabled()||!isOnline())return 'skipped';
  const nowMs=Date.now();
  if(nowMs-lastOnlineHandled<2000)return 'debounced';
  lastOnlineHandled=nowMs;
  clearRetry();retryAttempt=0;
  if(office().bridgeReady)await callGlobal('sync',false);
  return 'synced';
}
function onSyncPassComplete(detail){
  const d=detail||{};
  writeStatus({lastSyncAt:new Date().toISOString(),lastSyncResult:{done:num(d.done),failed:num(d.failed),conflicts:num(d.conflicts)},businessId:office().businessId||''});
  refreshPanel();
  if(!enabled()){clearRetry();return;}
  if(d.error||num(d.failed)>0){
    if(!isOnline())return;
    if(retryAttempt>=BACKOFF_MS.length){clearRetry();return;} // stop; user can tap Sync now or wait for next reconnect
    if(retryTimer)return; // single-timer guard
    const delay=BACKOFF_MS[retryAttempt];retryAttempt++;
    retryTimer=setTimeout(()=>{retryTimer=null;if(!isOnline()||!enabled())return;if(office().bridgeReady)callGlobal('sync',false);},delay);
  }else{clearRetry();retryAttempt=0;}
}

// ---------- readiness panel ----------
function statusPill(){return isOnline()?'<span class="pill good">Online</span>':'<span class="pill pending">Offline</span>';}
function conflictHtml(d){
  const diffRows=d.diffs.length?`<div class="h38-conflict-diffs">${d.diffs.map(x=>`<div class="row"><div class="row-top"><strong>${esc(x.key)}</strong></div><small>yours: ${esc(x.mine)}<br>server: ${esc(x.server)}</small></div>`).join('')}</div>`:'';
  const fieldRows=d.fields.length?`<small>Your queued change set: ${esc(d.fields.map(f=>f.key+'='+f.value).join(', '))}</small>`:'';
  return `<div class="row"><div class="row-top"><strong>${esc(d.recordType)} · ${esc(d.recordId)}</strong><span class="pill pending">Needs review</span></div>`
    +`<small>${esc(d.action)} · queued ${esc(fmtTime(d.queuedAt))} · based on version ${d.baseVersion}, server is at version ${d.serverVersion}.</small>`
    +diffRows+fieldRows
    +`<div class="row-actions"><button data-offline-keep="${esc(d.opId)}">Keep server version</button><button class="secondary" data-offline-reapply="${esc(d.opId)}">Re-apply my changes</button></div></div>`;
}
async function renderPanel(){
  const mount=$('offlineReadinessPanel');if(!mount)return;
  const card=$('offlineReadinessCard');
  if(!enabled()){if(card)card.style.display='none';mount.innerHTML='';return;}
  if(card)card.style.display='';
  const st=office();
  const ops=await businessOps();
  const pending=ops.filter(o=>o.syncStatus==='PENDING'),failed=pending.filter(o=>num(o.retryCount)>0),conflicts=ops.filter(o=>o.syncStatus==='CONFLICT');
  const status=await readStatus();
  const lastSync=status.businessId===st.businessId&&status.lastSyncAt?fmtTime(status.lastSyncAt):'Not yet';
  const collections=cachedCollections();
  const described=conflicts.map(describeConflict);
  mount.innerHTML=`<div class="h38-offline-panel">`
    +`<div class="row-top">${statusPill()}<small>${failed.length?esc(failed.length+' failed — safe on this device'):''}</small></div>`
    +`<p class="muted small">Last sync: ${esc(lastSync)} · Last business pack: ${esc(fmtTime(st.snapshot&&st.snapshot.cachedAt))}. Use Sync before leaving service to refresh assigned work, prices, messages and equipment.</p>`
    +`<div class="stats"><div class="stat"><strong>${pending.length}</strong><span>Waiting to sync</span></div><div class="stat"><strong>${conflicts.length}</strong><span>Need review</span></div><div class="stat"><strong>${collections.length}</strong><span>Cached collections</span></div></div>`
    +(collections.length?`<div class="list">${collections.slice(0,12).map(c=>`<div class="row"><div class="row-top"><strong>${esc(c.label)}</strong><span>${c.count}</span></div></div>`).join('')}${collections.length>12?`<small class="muted">+${collections.length-12} more collections cached</small>`:''}</div>`:`<p class="muted small">No business pack cached yet.</p>`)
    +`<div class="actions"><button id="offlineSyncNow">Sync now</button><button id="offlineRefreshPack" class="secondary"${isOnline()?'':' disabled'}>Refresh business pack</button></div>`
    +(described.length?`<div class="notice warn"><strong>Sync conflicts — ${described.length} need review.</strong><br><span class="muted small">Someone changed these records after your offline copy. Keep the server version (recommended), or re-apply your changes on top.</span></div><div class="list">${described.map(conflictHtml).join('')}</div>`:'')
    +`</div>`;
  const syncBtn=$('offlineSyncNow');if(syncBtn)syncBtn.onclick=()=>callGlobal('sync',true);
  const packBtn=$('offlineRefreshPack');if(packBtn)packBtn.onclick=()=>{refreshPack().catch(err=>callGlobal('toast',err&&err.message||String(err),true));};
  mount.querySelectorAll('[data-offline-keep]').forEach(b=>{b.onclick=()=>{if(confirm('Discard your queued change and keep the server version?'))keepServer(b.dataset.offlineKeep).catch(err=>callGlobal('toast',err&&err.message||String(err),true));};});
  mount.querySelectorAll('[data-offline-reapply]').forEach(b=>{b.onclick=()=>{reapplyMine(b.dataset.offlineReapply).catch(err=>callGlobal('toast',err&&err.message||String(err),true));};});
  autoRefreshPack().catch(()=>{});
}
function refreshPanel(){if($('offlineReadinessPanel'))renderPanel();}

// ---------- wiring (installed once; never re-registers) ----------
if(!window.__h38OfflineModeInstalled){
  window.__h38OfflineModeInstalled=true;
  window.addEventListener('online',()=>{handleOnline();});
  window.addEventListener('h38:sync-pass-complete',event=>{onSyncPassComplete(event&&event.detail);});
}

window.H38OfflineMode=Object.freeze({
  BUILD,FEATURE_ID,
  isEnabled:enabled,
  renderPanel,refreshPanel,
  syncNow:()=>callGlobal('sync',true),
  refreshPack,autoRefreshPack,
  handleOnline,onSyncPassComplete,
  businessOps,cachedCollections,findCachedRecord,describeConflict,payloadFields,
  keepServer,reapplyMine,
  debug:()=>({retryAttempt,hasRetryTimer:!!retryTimer,backoffMs:BACKOFF_MS.slice()})
});
})();
