(function(){
'use strict';
// App usage heartbeat — tracks who opens the app, when, and for how long.
// Include after the app's Supabase client is available. Writes to business_records
// collection 'app_sessions'. Configure via window.H38_HEARTBEAT = {app:'office'}.
//
// 2026-10-13 fix sweep:
// - The first beat used to fire immediately at script load, before
//   window.state had the business id, so business_id was null and Supabase
//   answered HTTP 403 on every cold start. Beats now wait until BOTH the
//   business id and an auth token exist (polled, plus the canonical
//   h38:authoritative-startup-ready event), then run on the normal interval.
// - getToken is supplied by index.html and reuses the existing bridge/shared
//   client session — no extra Supabase client is created for the heartbeat.
// - The beforeunload write used navigator.sendBeacon to the REST endpoint
//   with no apikey/Authorization headers, which produced CORS console errors
//   on the next navigation. It now uses fetch(..., {keepalive:true}) with
//   the exact same auth headers as a normal write. The session-close write is
//   kept because app_sessions rows are consumed by the Office movement watch
//   (see supabase/functions/h38-*-web heartbeat notes); only 'Last Seen At'
//   freshness matters there, but 'Ended At' is preserved for parity.
//
// 2026-10-19 fix (measured live, 9/9 tenant x viewport combos):
// - Repeat beats answered HTTP 409 (23505): the merge-duplicates POST named
//   no on_conflict target, so PostgREST arbitrated on the primary key while
//   the body's identity is the composite unique constraint
//   (business_id, collection, record_key) — 'Last Seen At' never advanced
//   past the first beat. Both writes now pass
//   ?on_conflict=business_id,collection,record_key.
// - The close write answered HTTP 400 (42P10): on_conflict=record_key alone
//   matches no unique constraint, so 'Ended At' never persisted.
// - 'Started At' is captured once per tab session; with upserts working it
//   would otherwise drift to the latest beat on every merge.

const CFG = window.H38_HEARTBEAT || {};
const APP = CFG.app || 'office';
const SESSION_KEY = 'h38-heartbeat-session';
const STARTED_KEY = 'h38-heartbeat-started-at';
const BUILD = '20261021-drive-storage-1';

function getSessionId(){
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if(!id){ id = 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2,9); sessionStorage.setItem(SESSION_KEY, id); }
    return id;
  } catch(e){ return 'sess-' + Date.now(); }
}

function getStartedAt(){
  try {
    let started = sessionStorage.getItem(STARTED_KEY);
    if(!started){ started = new Date().toISOString(); sessionStorage.setItem(STARTED_KEY, started); }
    return started;
  } catch(e){ return new Date().toISOString(); }
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

function sessionBody(patch){
  const user = getUser();
  const sessionId = getSessionId();
  return {
    business_id: getBusinessId(),
    collection: 'app_sessions',
    record_key: sessionId,
    record_status: 'active',
    payload: Object.assign({
      'Session ID': sessionId,
      'App': APP,
      'User Email': user.email || '',
      'User ID': user.id || '',
      'Started At': getStartedAt(),
      'Last Seen At': new Date().toISOString(),
    }, patch || {}),
  };
}

function authHeaders(sb, token){
  return {
    'apikey': sb.key,
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal',
  };
}

async function writeSession(patch){
  const sb = getSupabase();
  if(!sb || !getBusinessId()) return false;
  const token = await getToken();
  if(!token) return false;
  try{
    await fetch(sb.url + '/rest/v1/business_records?on_conflict=business_id,collection,record_key', {
      method: 'POST',
      headers: authHeaders(sb, token),
      body: JSON.stringify(sessionBody(patch)),
    });
    return true;
  }catch(e){ /* heartbeat is best-effort */ return false; }
}

async function beat(){
  await writeSession({});
}

let started = false;
let readinessTimer = null;
async function startWhenReady(){
  if(started) return;
  // Wait until the app has a business id AND a session token; a beat before
  // that is the 403 this sweep removes.
  if(!getBusinessId() || !(await getToken())) return;
  started = true;
  if(readinessTimer){ clearInterval(readinessTimer); readinessTimer = null; }
  // Start: record session open
  beat();
  // Heartbeat every 60s while the page is visible
  setInterval(()=>{ if(!document.hidden) beat(); }, 60000);
}

readinessTimer = setInterval(()=>{ startWhenReady(); }, 500);
window.addEventListener('h38:authoritative-startup-ready', ()=>{ startWhenReady(); });
startWhenReady();

// On close: mark ended — fetch keepalive with the same auth headers as a
// normal write (sendBeacon cannot carry them and errored on CORS).
window.addEventListener('beforeunload', ()=>{
  const sb = getSupabase();
  if(!sb || !getBusinessId()) return;
  getToken().then(token=>{
    if(!token) return;
    try{
      fetch(sb.url + '/rest/v1/business_records?on_conflict=business_id,collection,record_key', {
        method: 'POST',
        headers: authHeaders(sb, token),
        body: JSON.stringify(sessionBody({ 'Ended At': new Date().toISOString(), 'Last Seen At': new Date().toISOString() })),
        keepalive: true,
      }).catch(()=>{});
    }catch(e){}
  });
});

window.H38_APP_HEARTBEAT = Object.freeze({ build: BUILD, app: APP });
})();
