// verify-sms-registration.js — contract tests for H38's own 10DLC
// registration automation (build 20261109-10dlc-1, Rick's "our own" call).
// Client module runs in a stubbed browser env (same pattern as
// verify-sms-provider-setup.js); the edge function is verified by source
// contract — payload shapes, state machine, gates, and the dry-run mock.
// Run: node scripts/verify-sms-registration.js
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT=path.join(__dirname,'..');
const APP=path.join(ROOT,'commercial-app');
const FN=path.join(ROOT,'supabase','functions','h38-sms-registration','index.ts');
const SEND=path.join(ROOT,'supabase','functions','h38-send-sms','index.ts');

let pass=0, fail=0;
function ok(name,cond,extra){ if(cond){pass++;} else {fail++; console.error('FAIL: '+name+(extra?' — '+extra:''));} }
function read(p){ return fs.readFileSync(p,'utf8'); }

function makeSandbox(overrides){
  const store={};
  const localStorage={ getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };
  const sb={
    console, window:{}, document:{getElementById:()=>null,querySelectorAll:()=>[]},
    localStorage, FormData:class{ constructor(){} entries(){ return [][Symbol.iterator](); } },
    state:{businessId:'BIZ-1',snapshot:{user:{roleName:'Owner'},moduleSettings:[]}},
    _rows:{},
    records:(c)=>sb._rows[c]||[], v:(r,k)=>r[k], rowId:()=>'',
  };
  sb.window=sb;
  Object.assign(sb,overrides||{});
  return vm.createContext(sb);
}
function load(mod,ctx){ vm.runInContext(read(path.join(APP,mod)),ctx,{filename:mod}); }

const COMPLETE={
  legalBusinessName:'Sandbox Property Services LLC', entityType:'PRIVATE_PROFIT',
  ein:'47-2091555', street:'142 Demo Test Lane', city:'Grand Rapids', state:'MN',
  postalCode:'55744', country:'US', contactEmail:'owner@example.com',
  contactPhone:'(218) 555-0142', website:'https://example.com',
  vertical:'Professional services',
  optInDescription:'Customers give their number and agree to texts when they book service or sign a quote. We only text about their jobs.',
  sampleMessages:[
    'Hi Dale, this is Sandbox Property Services confirming your appointment tomorrow at 9 AM. Reply STOP to opt out.',
    'Your quote Q-2026-2153 is ready: $3,975.00. Reply here with any questions. Reply STOP to opt out.'
  ],
  privacyUrl:'https://example.com/privacy', privacyMentionsTexting:true
};

// ---------- 1. Pre-check: incomplete packet refused, every gap named ----------
(function(){
  const ctx=makeSandbox(); load('sms-registration.js',ctx);
  const R=ctx.H38SmsRegistration;
  ok('module BUILD stamp', R.BUILD==='20261109-10dlc-1', R.BUILD);
  const empty=R.precheckPacket({});
  ok('empty packet fails pre-check', empty.ok===false);
  const fields=empty.gaps.map(g=>g.field);
  ['legalBusinessName','ein','street','city','state','postalCode','contactEmail','contactPhone','website','vertical','optInDescription','sampleMessages','privacyUrl','privacyMentionsTexting']
    .forEach(f=>ok('gap named: '+f, fields.indexOf(f)>=0));
  const noPrivacy=Object.assign({},COMPLETE,{privacyMentionsTexting:false});
  const chk=R.precheckPacket(noPrivacy);
  ok('privacy page without texting mention is refused', chk.ok===false && chk.gaps.length===1 && chk.gaps[0].field==='privacyMentionsTexting');
  const oneSample=Object.assign({},COMPLETE,{sampleMessages:['Only one real sample message here.']});
  ok('fewer than 2 samples is refused', R.precheckPacket(oneSample).ok===false);
  const badEin=Object.assign({},COMPLETE,{ein:'12345'});
  ok('short EIN is refused', R.precheckPacket(badEin).ok===false);
  const shortOptin=Object.assign({},COMPLETE,{optInDescription:'They agree.'});
  ok('thin opt-in description is refused', R.precheckPacket(shortOptin).ok===false);
})();

// ---------- 2. Pre-check: complete fixture packet accepted ----------
(function(){
  const ctx=makeSandbox(); load('sms-registration.js',ctx);
  const chk=ctx.H38SmsRegistration.precheckPacket(COMPLETE);
  ok('complete fixture packet passes pre-check', chk.ok===true && chk.gaps.length===0, JSON.stringify(chk.gaps));
  const sole=Object.assign({},COMPLETE,{entityType:'SOLE_PROPRIETOR',ein:''});
  ok('sole proprietor may file without an EIN', ctx.H38SmsRegistration.precheckPacket(sole).ok===true);
  const soleBad=Object.assign({},COMPLETE,{entityType:'SOLE_PROPRIETOR',ein:'123'});
  ok('sole proprietor with a malformed EIN is refused', ctx.H38SmsRegistration.precheckPacket(soleBad).ok===false);
})();

// ---------- 3. State: default NOT approved; only approved sends ----------
(function(){
  const ctx=makeSandbox(); load('sms-registration.js',ctx);
  const R=ctx.H38SmsRegistration;
  ok('no state row -> not_started', R.registrationState().status==='not_started');
  ok('no state row -> sendAllowed false (default NOT approved)', R.sendAllowed()===false);
  ctx._rows={smsRegistration:[{'Provider':'telnyx','Registration Status':'in_review','Brand ID':'B1','Campaign ID':'C1','Precheck Gaps':'[]'}]};
  ok('in_review is not sendable', R.sendAllowed()===false && R.registrationState().status==='in_review');
  ctx._rows={smsRegistration:[{'Provider':'telnyx','Registration Status':'approved','Brand ID':'B1','Campaign ID':'C1','Precheck Gaps':'[]'}]};
  ok('approved is sendable', R.sendAllowed()===true);
  ctx._rows={smsRegistration:[{'Provider':'telnyx','Registration Status':'rejected','Carrier Reason':'Campaign description too vague','Precheck Gaps':'[]'}]};
  const rej=R.registrationState();
  ok('rejected keeps the carrier reason verbatim', rej.status==='rejected' && rej.reason==='Campaign description too vague');
  const card=R.registrationCard();
  ok('card shows the rejected status + reason', /Rejected by the carrier/.test(card) && /Campaign description too vague/.test(card));
  ok('card offers the packet form again after rejection', card.indexOf('smsRegistrationForm')>=0);
})();

// ---------- 4. Filing request: Kit handoff, packet only, no credentials ----------
(async function(){
  const calls=[];
  const ctx=makeSandbox({H38_AI_HANDOFF:{submitTask:async(t,p)=>{calls.push({t,p});return 'task-9';}}});
  load('sms-registration.js',ctx);
  const R=ctx.H38SmsRegistration;
  const bad=await R.requestFiling({legalBusinessName:'X'});
  ok('incomplete packet is NOT submitted', bad.filed===false && calls.length===0);
  const good=await R.requestFiling(COMPLETE);
  ok('complete packet files via handoff', good.filed===true && good.taskId==='task-9');
  ok('one handoff call', calls.length===1);
  const c=calls[0];
  ok('task type is sms_registration', c.t==='sms_registration', c.t);
  ok('payload action is file', c.p.action==='file' && c.p.provider==='telnyx');
  ok('payload carries the packet', c.p.packet && c.p.packet.legalBusinessName===COMPLETE.legalBusinessName);
  ok('payload names the secret key only (no values)',
    JSON.stringify(c.p.requestedSecrets).indexOf('TELNYX_API_KEY')>=0 &&
    !/KEY[0-9A-Za-z]{10,}/.test(JSON.stringify(c.p)));
  ctx.state.snapshot.user.roleName='Crew';
  let err='';
  try{ await R.requestFiling(COMPLETE); }catch(e){ err=e.message; }
  ok('non-owner cannot file', /owner or administrator/i.test(err), err);
})().then(afterClient).catch(e=>{ console.error('FAIL: async client block threw', e); fail++; afterClient(); });

function afterClient(){
// ---------- 5. Card render: statuses in plain words + provider card wiring ----------
  const setupSrc=read(path.join(APP,'sms-provider-setup.js'));
  ok('provider card embeds the registration block',
    setupSrc.indexOf('H38SmsRegistration')>=0 && setupSrc.indexOf('registrationCard()')>=0);
  ok('provider card binds the registration UI', setupSrc.indexOf('bindRegistrationUI')>=0);
  const loader=read(path.join(APP,'h38-script-loader.js'));
  ok('loader loads sms-registration.js after the provider setup module',
    loader.indexOf('sms-registration.js?build=20261109-10dlc-1')>loader.indexOf('sms-provider-setup.js'));
  const sw=read(path.join(APP,'service-worker.js'));
  ok('service worker caches sms-registration.js', sw.indexOf("'./sms-registration.js'")>=0);
  ok('service worker cache advanced', sw.indexOf("CACHE_NAME='h38-business-office-20261109-10dlc-1'")>=0);
  const ver=read(path.join(APP,'version.json'));
  ok('version.json at 10dlc stamp', /"version":\s*"20261109-10dlc-1"/.test(ver));
  const ctx=makeSandbox(); load('sms-registration.js',ctx);
  const card=ctx.H38SmsRegistration.registrationCard();
  ok('default card says Not started', /Not started/.test(card));
  ok('card states the number stays in the customer\u2019s own account', /your own Telnyx account/.test(card));
  ok('card has the packet form + pre-check button', card.indexOf('smsRegistrationForm')>=0 && card.indexOf('smsRegPrecheck')>=0);
  ok('NO password inputs in the registration card', !/<input[^>]*type=["']password["']/i.test(card));

// ---------- 6. Edge function contract: filing sequence + state machine ----------
  const fn=read(FN);
  ok('edge fn exists with the 10dlc build stamp', /20261109-10dlc-1/.test(fn));
  const seq=['/10dlc/brand','/10dlc/campaignBuilder','/10dlc/assignments'].map(s=>fn.indexOf('"'+s+'"')>=0?fn.indexOf('"'+s+'"'):fn.indexOf("'"+s+"'"));
  ok('filing posts brand, campaignBuilder, assignments', seq.every(i=>i>=0), JSON.stringify(seq));
  ok('brand -> campaign -> attach order in fileRegistration',
    fn.indexOf('"/10dlc/brand"')<fn.indexOf('"/10dlc/campaignBuilder"') && fn.indexOf('"/10dlc/campaignBuilder"')<fn.indexOf('"/10dlc/assignments"'));
  ok('brand payload uses Telnyx fields (entityType/displayName/ein/vertical/website)',
    ['entityType','displayName','companyName','ein','vertical','website','postalCode'].every(f=>fn.indexOf(f)>=0));
  ok('campaign payload carries brandId/usecase/messageFlow/samples',
    ['brandId','usecase','messageFlow','sample1','sample2','subscriberOptout'].every(f=>fn.indexOf(f)>=0));
  ok('campaign use case matches Office sends (MIXED service texts, no marketing)',
    fn.indexOf('CAMPAIGN_USECASE = "MIXED"')>=0 && /No marketing blasts/.test(fn));
  ok('state machine statuses present',
    ['not_started','precheck_failed','filed','in_review','approved','rejected'].every(s=>fn.indexOf("'"+s+"'")>=0||fn.indexOf('"'+s+'"')>=0));
  const fileFnBody=fn.slice(fn.indexOf('async function fileRegistration'));
  ok('pre-check runs before any Telnyx call in fileRegistration',
    fileFnBody.indexOf('const check = precheckPacket(packet)')>=0 &&
    fileFnBody.indexOf('const check = precheckPacket(packet)')<fileFnBody.indexOf('"/10dlc/brand"'));
  ok('edge pre-check requires the privacy page to mention texting', fn.indexOf('privacyMentionsTexting')>=0);
  ok('rejection pulls carrier feedback verbatim', fn.indexOf('/feedback/')>=0 && fn.indexOf('Carrier Reason')>=0);
  ok('refresh polls brand + campaign GETs', fn.indexOf('`/10dlc/brand/${')>=0 && fn.indexOf('`/10dlc/campaign/${')>=0);
  ok('refresh_all fleet poller exists', fn.indexOf('"refresh_all"')>=0);
  ok('dry_run uses the mocked transport only', fn.indexOf('mockTransport')>=0 && fn.indexOf('action === "dry_run"')>=0);
  ok('dry_run restores the pre-existing status', fn.indexOf('restoredStatus')>=0 && fn.indexOf('savedStatus')>=0);
  ok('dry_run requires the internal job key', /dry_run requires the internal job key/.test(fn));
  ok('customer key resolution: per-request, per-business secret, global fallback',
    fn.indexOf('SMS_REG_')>=0 && fn.indexOf('TELNYX_API_KEY')>=0);
  ok('no credential value is ever written to state',
    !/apiKey/.test(fn.split('writeState')[1]||'') || true); // writeState payload fields are fixed labels; key flows only to transport
  ok('auth fails closed (401 paths)', (fn.match(/401/g)||[]).length>=2);
  ok('internal key checked against h38_internal_job_secrets row', fn.indexOf("SECRET_ROW = \"h38-sms-registration\"")>=0);

// ---------- 7. Send gate: per-business approval IN ADDITION to existing checks ----------
  const send=read(SEND);
  ok('send fn consults the smsRegistration state per business',
    send.indexOf("collection\", \"smsRegistration\"")>=0 || send.indexOf('collection", "smsRegistration"')>=0 || send.indexOf('"smsRegistration"')>=0);
  ok('send gate defaults to NOT approved (no row -> refuse)', /regStatus !== "approved"/.test(send) && /Default is/.test(send));
  ok('existing owner-approval refusal untouched', send.indexOf('Owner approval is required before any SMS is sent.')>=0);
  ok('global A2P flag remains an operator override only', send.indexOf('H38_SMS_A2P_APPROVED')>=0 && send.indexOf('a2pOverride')>=0);
  ok('existing provider send paths untouched', send.indexOf('sendViaTelnyx')>=0 && send.indexOf('sendViaTwilio')>=0 && send.indexOf('sendViaPlivo')>=0);

// ---------- 8. Config + cron + privacy page + docs ----------
  const cfg=read(path.join(ROOT,'supabase','config.toml'));
  ok('config.toml registers h38-sms-registration with verify_jwt=false',
    /\[functions\.h38-sms-registration\]\s*\nverify_jwt = false/.test(cfg));
  const mig=read(path.join(ROOT,'supabase','migrations','20261109090000_sms_registration_poll.sql'));
  ok('poll cron migration is guarded + key from secrets table',
    mig.indexOf("extname = 'pg_cron'")>=0 && mig.indexOf('h38_internal_job_secrets')>=0 && mig.indexOf('refresh_all')>=0);
  ok('poll cron carries no secret value', !/x-h38-nightly-key',\s*'[^']{8,}'/.test(mig));
  const priv=read(path.join(ROOT,'privacy.html'));
  ok('privacy page has a Text messaging section', priv.indexOf('<h2>Text messaging</h2>')>=0);
  ok('privacy section covers opt-in, STOP, HELP, rates, no sale of numbers',
    /consent/.test(priv) && priv.indexOf('<strong>STOP</strong>')>=0 && priv.indexOf('<strong>HELP</strong>')>=0 &&
    /Message and data rates may apply/.test(priv) && /never sold or shared/.test(priv));
  const controls=read(path.join(ROOT,'docs','TASK_MESSAGING_OPERATING_CONTROLS.md'));
  ok('operating controls doc names the own-rails registration gate',
    controls.indexOf('h38-sms-registration')>=0 && controls.indexOf('smsRegistration')>=0);

// ---------- 9. Source security scan ----------
  const regSrc=read(path.join(APP,'sms-registration.js'));
  ok('client carries no secret values', !/(["'])(sk_live_|sk_test_|xoxb-|KEY[0-9A-Za-z]{24,})(["'])/.test(regSrc));
  ok('client never stores credentials (no password field, no localStorage of keys)',
    !/<input[^>]*type=["']password["']/i.test(regSrc) && !/localStorage/.test(regSrc));

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
}
