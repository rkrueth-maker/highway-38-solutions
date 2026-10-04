// H38 SMS provider setup — BUILD 20261004-sms-providers-1
//
// Provider picker + active-sender selection for Office texting.
// Ricky's decisions (2026-10-04):
//   1. ALL THREE providers are offered (Telnyx, Twilio, Plivo). Selecting one
//      prompts for THAT provider's account credentials.
//   2. The ACTIVE sender for now is Ricky's personal cell phone (interim).
//      Providers stay set-up-ready options until he picks one.
//
// ---------------------------------------------------------------------------
// CREDENTIAL SECURITY — READ THIS BEFORE TOUCHING THIS FILE
// ---------------------------------------------------------------------------
// Provider API keys/tokens must NEVER be:
//   - typed into any field in this app,
//   - stored in business_records or any other readable table,
//   - embedded in client-side code, or
//   - written to localStorage.
//
// The ONLY credential path is:
//   1. Owner clicks "Set up with Kit" on a provider card below.
//   2. This module submits an ai_handoff_tasks row (task_type
//      'sms_provider_setup', payload = {provider, requestedSecrets}) via the
//      canonical H38_AI_HANDOFF helper. The payload carries key NAMES only —
//      never key VALUES.
//   3. Kit (the in-Office AI) claims the task and opens a SECURE credential
//      entry with the owner OUTSIDE this app.
//   4. Kit stores the secrets directly on the h38-send-sms edge function via
//      the Supabase Management API. Only the edge function runtime ever sees
//      the values; the browser and the database never do.
//   5. Kit marks the task done; the provider row flips to Connected.
//
// There is deliberately NO <input type="password"> for provider keys anywhere
// in the Office client. If you are tempted to add one, re-read this comment.
// ---------------------------------------------------------------------------
(function(){
'use strict';
var BUILD='20261004-sms-providers-1';

var SENDER_PHONE='phone-bridge';
var MODULE_KEY='sms_sender';
var LS_KEY='h38-sms-sender';
var LS_REQUESTED_PREFIX='h38-sms-setup-requested-';

// ---- Provider catalog (static facts only — no secrets, no values) ----
// Costs checked 2026-10-04 (US 10DLC long code). Shown in the picker so the
// owner can compare before asking Kit to connect one.
var SMS_PROVIDER_CATALOG=[
  {id:'telnyx', name:'Telnyx', icon:'📞', recommended:true,
   cost:'~$0.007–0.009 / message', monthly:'$1.00/mo number rental',
   blurb:'Cheapest per message, pay as you go, self-serve 10DLC.',
   creds:[
     {key:'TELNYX_API_KEY', label:'API Key', secret:true, hint:'Telnyx portal → API Keys'}
   ]},
  {id:'twilio', name:'Twilio', icon:'☁️', recommended:false,
   cost:'~$0.011–0.015 / message', monthly:'$1.15/mo number rental',
   blurb:'Biggest name, most docs and examples.',
   creds:[
     {key:'TWILIO_ACCOUNT_SID', label:'Account SID', secret:false, hint:'Starts with AC… (Twilio console dashboard)'},
     {key:'TWILIO_AUTH_TOKEN', label:'Auth Token', secret:true, hint:'Twilio console → Account Info (keep private)'}
   ]},
  {id:'plivo', name:'Plivo', icon:'🌐', recommended:false,
   cost:'~$0.011–0.013 / message', monthly:'$0.50/mo number rental',
   blurb:'Middle ground on price, simple API.',
   creds:[
     {key:'PLIVO_AUTH_ID', label:'Auth ID', secret:false, hint:'Plivo console dashboard'},
     {key:'PLIVO_AUTH_TOKEN', label:'Auth Token', secret:true, hint:'Plivo console → keep private'}
   ]}
];
function catalogEntry(id){
  for(var i=0;i<SMS_PROVIDER_CATALOG.length;i++){
    if(SMS_PROVIDER_CATALOG[i].id===id) return SMS_PROVIDER_CATALOG[i];
  }
  return null;
}
function catalogIds(){ return SMS_PROVIDER_CATALOG.map(function(p){return p.id;}); }

// ---- Active sender: read (sync) ----
function snapshotModuleSettings(){
  try{
    if(typeof state!=='undefined'&&state&&state.snapshot&&state.snapshot.moduleSettings){
      return state.snapshot.moduleSettings;
    }
  }catch(e){}
  return null;
}
function activeSender(){
  // Server row wins; localStorage is the offline cache; default is the phone.
  try{
    var ms=snapshotModuleSettings();
    if(ms){
      for(var i=0;i<ms.length;i++){
        var k=String(ms[i].module_key||ms[i].moduleKey||'');
        if(k===MODULE_KEY){
          var c=ms[i].config||{};
          var s=String(c.active_sender||c.activeSender||'').toLowerCase();
          if(s===SENDER_PHONE||catalogEntry(s)) return s;
        }
      }
    }
  }catch(e){}
  try{
    var ls=String(localStorage.getItem(LS_KEY)||'').toLowerCase();
    if(ls===SENDER_PHONE||catalogEntry(ls)) return ls;
  }catch(e){}
  return SENDER_PHONE; // Ricky's decision: cell phone is the active sender for now
}
function activeSenderLabel(){
  var s=activeSender();
  if(s===SENDER_PHONE) return 'My cell phone (interim)';
  var e=catalogEntry(s);
  return e?e.name:s;
}

// ---- Active sender: write (owner/admin only, server-backed) ----
function isOwner(){
  try{
    var r=String((typeof state!=='undefined'&&state&&state.snapshot&&state.snapshot.user&&(state.snapshot.user.roleName||state.snapshot.user.role)||'')||'').toLowerCase();
    return r==='owner'||r==='administrator';
  }catch(e){ return false; }
}
function sharedClient(){
  try{
    var api=window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure&&window.H38_SUPABASE_SHARED_CLIENT.ensure();
    if(api) return api;
  }catch(e){}
  return null;
}
async function setActiveSender(senderId){
  senderId=String(senderId||'').toLowerCase();
  if(senderId!==SENDER_PHONE&&!catalogEntry(senderId)) throw new Error('Unknown sender: '+senderId);
  if(typeof state==='undefined'||!state.businessId) throw new Error('Open a business first.');
  if(!isOwner()) throw new Error('Only a business owner or administrator can change the active sender.');
  // A provider can only become active once Kit has connected it (secrets live
  // on the edge function — this client cannot verify them, so we check the
  // providers row status instead).
  if(senderId!==SENDER_PHONE){
    var cfg=(window.H38Sms&&window.H38Sms.smsProviderConfig)?window.H38Sms.smsProviderConfig():null;
    var connected=cfg&&cfg.connected&&cfg.provider===senderId;
    if(!connected) throw new Error('Set up '+senderId+' with Kit first — it is not connected yet.');
  }
  var api=sharedClient();
  var row={business_id:state.businessId,module_key:MODULE_KEY,enabled:true,
    config:{active_sender:senderId,updated_at:new Date().toISOString()},
    updated_at:new Date().toISOString()};
  if(api){
    var res=await api.from('business_module_settings').upsert(row,{onConflict:'business_id,module_key'});
    if(res.error) throw new Error('Could not save sender choice: '+res.error.message);
    try{
      var ms=snapshotModuleSettings();
      if(ms){
        var ix=-1;
        for(var i=0;i<ms.length;i++){
          if(String(ms[i].module_key||ms[i].moduleKey||'')===MODULE_KEY){ ix=i; break; }
        }
        if(ix>=0) ms[ix]=row; else ms.push(row);
      }
    }catch(e){}
  }
  try{ localStorage.setItem(LS_KEY,senderId); }catch(e){}
  return senderId;
}

// ---- Provider setup request → Kit (no credentials touch this client) ----
function setupRequested(providerId){
  try{ return localStorage.getItem(LS_REQUESTED_PREFIX+providerId)==='1'; }catch(e){ return false; }
}
async function requestProviderSetup(providerId){
  var entry=catalogEntry(providerId);
  if(!entry) throw new Error('Unknown provider: '+providerId);
  if(typeof state==='undefined'||!state.businessId) throw new Error('Open a business first.');
  if(!window.H38_AI_HANDOFF||typeof window.H38_AI_HANDOFF.submitTask!=='function'){
    throw new Error('AI handoff is not available right now. Try again in a moment.');
  }
  // Payload carries key NAMES so Kit knows what to ask for — never VALUES.
  var taskId=await window.H38_AI_HANDOFF.submitTask('sms_provider_setup',{
    businessId:state.businessId,
    provider:entry.id,
    providerName:entry.name,
    requestedSecrets:entry.creds.map(function(c){return {key:c.key,label:c.label,hint:c.hint||''};}),
    note:'Owner asked to connect '+entry.name+'. Collect credentials via the secure entry flow and store them as h38-send-sms edge function secrets via the Management API. Never write secret values to the database or chat.'
  });
  try{ localStorage.setItem(LS_REQUESTED_PREFIX+providerId,'1'); }catch(e){}
  return taskId;
}
function providerConnected(providerId){
  try{
    var cfg=(window.H38Sms&&window.H38Sms.smsProviderConfig)?window.H38Sms.smsProviderConfig():null;
    return !!(cfg&&cfg.connected&&cfg.provider===providerId);
  }catch(e){ return false; }
}

// ---- UI ----
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function pill(t){ return '<span class="pill">'+esc(t)+'</span>'; }

function setupCard(){
  try{
    var sender=activeSender();
    var phoneActive=sender===SENDER_PHONE;
    var phoneCard=
      '<div class="row"><div class="row-top"><strong>📱 My cell phone (interim)</strong>'
      +(phoneActive?pill('ACTIVE'): '<button class="secondary" data-sms-sender="'+SENDER_PHONE+'">Make active</button>')
      +'</div><small>Sends from your personal cell through the paired phone. '
      +'Longer messages may fail over the phone bridge (~100 character limit). '
      +'Fine for testing — a provider is recommended for real customer volume.</small></div>';

    var providerCards=SMS_PROVIDER_CATALOG.map(function(p){
      var connected=providerConnected(p.id);
      var requested=!connected&&setupRequested(p.id);
      var isActive=sender===p.id;
      var action;
      if(isActive) action=pill('ACTIVE');
      else if(connected) action='<button class="secondary" data-sms-sender="'+p.id+'">Make active</button>';
      else if(requested) action=pill('SETUP REQUESTED');
      else action='<button class="secondary" data-sms-setup="'+p.id+'">Set up with Kit</button>';
      var credList=p.creds.map(function(c){return esc(c.label);}).join(' + ');
      return '<div class="row"><div class="row-top"><strong>'+p.icon+' '+esc(p.name)+'</strong>'
        +'<span>'+action+(p.recommended?' '+pill('RECOMMENDED'):'')+'</span></div>'
        +'<small>'+esc(p.cost)+' · '+esc(p.monthly)+' — '+esc(p.blurb)+'<br>'
        +'Kit will ask you for: '+esc(credList)+' (collected securely, stored as edge-function secrets — never in the app or database).</small></div>';
    }).join('');

    return '<section class="card span12" id="smsProviderSetupCard"><h2>Texting provider</h2>'
      +'<p class="muted small">ACTIVE sender: <strong>'+esc(activeSenderLabel())+'</strong>. '
      +(phoneActive
        ? 'Your cell handles sends for now. Pick a provider below when you want a real business number — Kit collects the keys securely.'
        : 'Customer texts go out through '+esc(activeSenderLabel())+'.')
      +'</p>'
      +'<div class="list">'+phoneCard+providerCards+'</div>'
      +'</section>';
  }catch(e){ return ''; }
}

function bindSetupUI(){
  try{
    var root=document.getElementById('smsProviderSetupCard');
    if(!root) return;
    root.querySelectorAll('[data-sms-setup]').forEach(function(b){
      b.onclick=function(){
        var pid=b.getAttribute('data-sms-setup');
        b.disabled=true;
        requestProviderSetup(pid).then(function(){
          if(typeof toast==='function') toast('Kit will securely collect your '+pid+' credentials. Watch for the secure prompt.');
          if(typeof renderMessages==='function') renderMessages();
        }).catch(function(e){
          b.disabled=false;
          if(typeof toast==='function') toast(e.message||String(e),true);
        });
      };
    });
    root.querySelectorAll('[data-sms-sender]').forEach(function(b){
      b.onclick=function(){
        var sid=b.getAttribute('data-sms-sender');
        setActiveSender(sid).then(function(){
          if(typeof toast==='function') toast('Active sender: '+activeSenderLabel()+'.');
          if(typeof renderMessages==='function') renderMessages();
        }).catch(function(e){
          if(typeof toast==='function') toast(e.message||String(e),true);
        });
      };
    });
  }catch(e){}
}

window.H38SmsSetup={
  BUILD:BUILD,
  CATALOG:SMS_PROVIDER_CATALOG,
  PHONE_SENDER:SENDER_PHONE,
  MODULE_KEY:MODULE_KEY,
  activeSender:activeSender,
  activeSenderLabel:activeSenderLabel,
  setActiveSender:setActiveSender,
  requestProviderSetup:requestProviderSetup,
  setupRequested:setupRequested,
  providerConnected:providerConnected,
  setupCard:setupCard,
  bindSetupUI:bindSetupUI
};
})();
