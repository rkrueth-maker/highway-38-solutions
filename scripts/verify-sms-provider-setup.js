// verify-sms-provider-setup.js — tests for the SMS provider picker + active sender.
// Loads commercial-app/sms-provider.js and sms-provider-setup.js in a stubbed
// browser env. Run: node scripts/verify-sms-provider-setup.js
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const APP=path.join(__dirname,'..','commercial-app');

let pass=0, fail=0;
function ok(name,cond,extra){ if(cond){pass++;} else {fail++; console.error('FAIL: '+name+(extra?' — '+extra:''));} }

function makeSandbox(overrides){
  const store={};
  const localStorage={
    getItem:k=>(k in store?store[k]:null),
    setItem:(k,v)=>{store[k]=String(v);},
    removeItem:k=>{delete store[k];},
    _dump:()=>store
  };
  const sb={
    console, window:{}, document:{getElementById:()=>null,querySelectorAll:()=>[]},
    localStorage,
    state:{businessId:'BIZ-1',snapshot:{user:{roleName:'Owner'},moduleSettings:[]}},
    records:()=>[], v:()=> '', rowId:()=>'', queueOperation:async()=>({}),
    newId:p=>p+'-TEST1', now:()=>'2026-10-04T00:00:00Z', num:Number,
    esc:s=>String(s), toast:()=>{}, renderMessages:()=>{},
  };
  sb.window=sb; // window.window === window like browsers
  Object.assign(sb,overrides||{});
  // H38SmsSetup reads bare `state`; sms-provider reads bare `window`.
  return vm.createContext(sb);
}
function load(mod,ctx){
  const code=fs.readFileSync(path.join(APP,mod),'utf8');
  vm.runInContext(code,ctx,{filename:mod});
}

// ---------- 1. Catalog facts ----------
(function(){
  const ctx=makeSandbox(); load('sms-provider.js',ctx); load('sms-provider-setup.js',ctx);
  const S=ctx.H38SmsSetup;
  ok('catalog has 3 providers', S.CATALOG.length===3);
  const ids=S.CATALOG.map(p=>p.id).sort().join(',');
  ok('catalog ids are telnyx,twilio,plivo', ids==='plivo,telnyx,twilio', ids);
  const byId={}; S.CATALOG.forEach(p=>byId[p.id]=p);
  ok('telnyx cost note', /0\.007.*0\.009/.test(byId.telnyx.cost), byId.telnyx.cost);
  ok('twilio cost note', /0\.011.*0\.015/.test(byId.twilio.cost), byId.twilio.cost);
  ok('plivo cost note', /0\.011.*0\.013/.test(byId.plivo.cost), byId.plivo.cost);
  ok('telnyx needs 1 cred (API key)', byId.telnyx.creds.length===1 && byId.telnyx.creds[0].key==='TELNYX_API_KEY');
  ok('twilio needs SID+token', byId.twilio.creds.length===2 && byId.twilio.creds[0].key==='TWILIO_ACCOUNT_SID' && byId.twilio.creds[1].key==='TWILIO_AUTH_TOKEN');
  ok('plivo needs ID+token', byId.plivo.creds.length===2 && byId.plivo.creds[0].key==='PLIVO_AUTH_ID' && byId.plivo.creds[1].key==='PLIVO_AUTH_TOKEN');
  // No secret VALUES anywhere in the catalog — key names only.
  const catJson=JSON.stringify(S.CATALOG);
  ok('no secret values in catalog', !/(sk_|AC[0-9a-f]{20,}|xox|bearer [a-z0-9]{10})/i.test(catJson));
})();

// ---------- 2. Default active sender = phone ----------
(function(){
  const ctx=makeSandbox(); load('sms-provider.js',ctx); load('sms-provider-setup.js',ctx);
  ok('default sender is phone-bridge', ctx.H38SmsSetup.activeSender()==='phone-bridge');
  ok('default label mentions cell', /cell/i.test(ctx.H38SmsSetup.activeSenderLabel()));
})();

// ---------- 3. Sender reads from snapshot, then localStorage ----------
(function(){
  const ctx=makeSandbox();
  ctx.state.snapshot.moduleSettings=[{module_key:'sms_sender',enabled:true,config:{active_sender:'twilio'}}];
  load('sms-provider.js',ctx); load('sms-provider-setup.js',ctx);
  ok('sender from snapshot', ctx.H38SmsSetup.activeSender()==='twilio');
  ok('label resolves provider name', ctx.H38SmsSetup.activeSenderLabel()==='Twilio');
  const ctx2=makeSandbox(); ctx2.localStorage.setItem('h38-sms-sender','plivo');
  load('sms-provider.js',ctx2); load('sms-provider-setup.js',ctx2);
  ok('sender from localStorage fallback', ctx2.H38SmsSetup.activeSender()==='plivo');
})();

// ---------- 4. setActiveSender validation ----------
(async function(){
  const ctx=makeSandbox(); load('sms-provider.js',ctx); load('sms-provider-setup.js',ctx);
  const S=ctx.H38SmsSetup;
  let err='';
  try{ await S.setActiveSender('bogus'); }catch(e){ err=e.message; }
  ok('rejects unknown sender', /Unknown sender/.test(err), err);
  ctx.state.snapshot.user.roleName='Crew';
  err='';
  try{ await S.setActiveSender('phone-bridge'); }catch(e){ err=e.message; }
  ok('rejects non-owner', /owner or administrator/i.test(err), err);
  ctx.state.snapshot.user.roleName='Owner';
  err='';
  try{ await S.setActiveSender('telnyx'); }catch(e){ err=e.message; }
  ok('rejects unconnected provider', /not connected/i.test(err), err);
  const r=await S.setActiveSender('phone-bridge');
  ok('accepts phone-bridge', r==='phone-bridge');
  ok('persists to localStorage', ctx.localStorage.getItem('h38-sms-sender')==='phone-bridge');
})().then(afterAsync).catch(e=>{console.error('FAIL: async block threw',e);fail++;afterAsync();});

function afterAsync(){
// ---------- 5. requestProviderSetup → Kit handoff, no secrets ----------
(function(){
  const calls=[];
  const ctx=makeSandbox({H38_AI_HANDOFF:{submitTask:async(t,p)=>{calls.push({t,p});return 'task-1';}}});
  // note: submitTask must exist before module load? No — read at call time. Fine.
  load('sms-provider.js',ctx); load('sms-provider-setup.js',ctx);
  return ctx.H38SmsSetup.requestProviderSetup('twilio').then(taskId=>{
    ok('returns task id', taskId==='task-1');
    ok('one handoff call', calls.length===1);
    const c=calls[0];
    ok('task type is sms_provider_setup', c.t==='sms_provider_setup', c.t);
    ok('payload names provider', c.p.provider==='twilio');
    ok('payload lists requested secret key names',
      JSON.stringify(c.p.requestedSecrets).indexOf('TWILIO_ACCOUNT_SID')>=0 &&
      JSON.stringify(c.p.requestedSecrets).indexOf('TWILIO_AUTH_TOKEN')>=0);
    const flat=JSON.stringify(c.p);
    ok('payload carries NO secret values',
      !/(sk_live|sk_test|AC[0-9a-f]{20,}|xoxb|api[_-]?key["']\s*:\s*["'][^"']{8})/i.test(flat)
      && flat.indexOf('Auth Token","value')<0);
    ok('requested flag cached', ctx.localStorage.getItem('h38-sms-setup-requested-twilio')==='1');
  });
})().then(()=>{
// ---------- 6. setupCard HTML ----------
  const ctx=makeSandbox(); load('sms-provider.js',ctx); load('sms-provider-setup.js',ctx);
  const html=ctx.H38SmsSetup.setupCard();
  ok('card lists Telnyx', html.indexOf('Telnyx')>=0);
  ok('card lists Twilio', html.indexOf('Twilio')>=0);
  ok('card lists Plivo', html.indexOf('Plivo')>=0);
  ok('card shows costs', /0\.007/.test(html) && /0\.011/.test(html));
  ok('ACTIVE pill on phone card by default', /My cell phone[\s\S]{0,200}ACTIVE/.test(html));
  ok('phone interim note present', /100 character/.test(html));
  ok('set-up-with-Kit buttons present', (html.match(/data-sms-setup/g)||[]).length===3);
  ok('NO password inputs for provider creds', !/<input[^>]*type=["']password["']/i.test(html));
  ok('no credential values embedded', !/TELNYX_API_KEY["']?\s*[:=]\s*["'][^"']{5}/.test(html));
}).then(()=>{
// ---------- 7. sendSms routing with phone active ----------
  const queued=[];
  const ctx=makeSandbox({
    queueOperation:async(op,kind,id,payload)=>{queued.push({op,payload});return {};},
  });
  // gateway toggle ON
  ctx.H38OwnerControls={isEnabled:() => true, FEATURES:[]};
  load('sms-provider.js',ctx); load('sms-provider-setup.js',ctx);
  return ctx.H38Sms.sendSms({to:'2185550100',body:'Hi',consentStatus:'Consented',category:'reminder',purpose:'t'})
    .then(r=>{
      ok('trigger-style call queues (not immediate)', r.queued===true);
      ok('queued thread records phone-bridge provider', queued[0].payload.provider==='phone-bridge', queued[0].payload.provider);
    });
}).then(()=>{
// ---------- 8. explicit via still immediate-sends ----------
  const ctx=makeSandbox({
    queueOperation:async()=>({}),
    H38PhoneBridge:{sendSms:(to,body)=>({ok:true})},
  });
  ctx.H38OwnerControls={isEnabled:()=>true, FEATURES:[]};
  // note: window.H38PhoneBridge read inside module as window.H38PhoneBridge — our sandbox window IS the context
  ctx.H38PhoneBridge={sendSms:(to,body)=>({ok:true})};
  load('sms-provider.js',ctx); load('sms-provider-setup.js',ctx);
  return ctx.H38Sms.sendSms({to:'2185550100',body:'short test',via:'phone-bridge',consentStatus:'Consented'})
    .then(r=>{ ok('explicit via sends immediately', r.sent===true && r.via==='phone-bridge'); });
}).then(()=>{
// ---------- 9. source security scan ----------
  const src=fs.readFileSync(path.join(APP,'sms-provider-setup.js'),'utf8');
  ok('no hardcoded secrets in source',
    !/(["'])(sk_live_|sk_test_|xoxb-|AC[a-z0-9]{32})(["'])/i.test(src));
  ok('security comment block present', /CREDENTIAL SECURITY/.test(src));
  // Note: the rendered-HTML password-input check lives in test 6 (setupCard
  // output). The source intentionally *mentions* <input type="password"> in
  // its security comment to forbid it, so a source-level string scan would
  // false-positive here.
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
}).catch(e=>{ console.error('FAIL: harness error', e && e.stack || e); process.exit(1); });
}
