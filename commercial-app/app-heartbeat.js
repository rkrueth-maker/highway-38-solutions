(function(){
'use strict';
// App usage heartbeat — tracks who opens the app, when, and for how long.
// Include after the app's Supabase client is available. Writes to business_records
// collection 'app_sessions'. Configure via window.H38_HEARTBEAT = {app:'office'}.

const CFG = window.H38_HEARTBEAT || {};
const APP = CFG.app || 'office';
const SESSION_KEY = 'h38-heartbeat-session';

function getSessionId(){
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if(!id){ id = 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2,9); sessionStorage.setItem(SESSION_KEY, id); }
    return id;
  } catch(e){ return 'sess-' + Date.now(); }
}

async function getToken(){
  if(typeof CFG.getToken === 'function'){ try{ return await CFG.getToken(); }catch(e){ return null; } }
  return null;
}
function getUser(){
  if(typeof CFG.getUser === 'function'){ try{ return CFG.getUser() || {}; }catch(e){ return {}; } }
  return {};
}
function getBusinessId(){
  if(typeof CFG.getBusinessId === 'function'){ try{ return CFG.getBusinessId(); }catch(e){ return null; } }
  return null;
}
function getSupabase(){
  if(CFG.supabaseUrl && CFG.supabaseKey) return {url: CFG.supabaseUrl, key: CFG.supabaseKey};
  return null;
}

async function writeSession(patch){
  const sb = getSupabase();
  const token = await getToken();
  if(!sb || !token) return;
  const user = getUser();
  const sessionId = getSessionId();
  const body = {
    business_id: getBusinessId(),
    collection: 'app_sessions',
    record_key: sessionId,
    record_status: 'active',
    payload: Object.assign({
      'Session ID': sessionId,
      'App': APP,
      'User Email': user.email || '',
      'User ID': user.id || '',
      'Started At': new Date().toISOString(),
      'Last Seen At': new Date().toISOString(),
    }, patch || {}),
  };
  try{
    await fetch(sb.url + '/rest/v1/business_records', {
      method: 'POST',
      headers: {
        'apikey': sb.key,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(body),
    });
  }catch(e){ /* heartbeat is best-effort */ }
}

async function beat(){
  await writeSession({});
}

// Start: record session open
beat();
// Heartbeat every 60s while the page is visible
setInterval(()=>{ if(!document.hidden) beat(); }, 60000);
// On close: mark ended
window.addEventListener('beforeunload', ()=>{
  const sb = getSupabase();
  getToken().then(token=>{
    if(!sb || !token) return;
    const payload = JSON.stringify({
      business_id: getBusinessId(),
      collection: 'app_sessions',
      record_key: getSessionId(),
      record_status: 'active',
      payload: { 'Ended At': new Date().toISOString(), 'Last Seen At': new Date().toISOString() },
    });
    try{
      navigator.sendBeacon(sb.url + '/rest/v1/business_records?on_conflict=record_key',
        new Blob([payload], {type:'application/json'}));
    }catch(e){}
  });
});
})();
