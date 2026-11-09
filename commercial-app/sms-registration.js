// H38 10DLC registration — BUILD 20261109-10dlc-1
//
// Our own texting-registration automation (Rick's call, 2026-11-09: "our
// own" — do not buy Dial). The filing runs server-side in the
// h38-sms-registration edge function, using the CUSTOMER's own stored
// carrier API key, inside the customer's OWN carrier account. The customer
// keeps owning the number and the account; H38 only automates the paperwork.
//
// This module is the Office half:
//   1. PRE-CHECK — rules-based validation of the registration packet BEFORE
//      anything is filed. Every gap is named; an incomplete packet files
//      nothing. This is the bounce-prevention Dial sells — ours is rules,
//      not a black box.
//   2. STATE — the per-business registration state lives in business_records
//      (collection 'smsRegistration', one row per business, written ONLY by
//      the edge function with the service key). The client only reads it.
//   3. REQUEST — asking to file submits an ai_handoff_tasks row
//      (task_type 'sms_registration') carrying the packet and key NAMES
//      only — never credential VALUES. Kit runs the filing + status refresh
//      through the edge function, exactly like sms_provider_setup.
//
// SEND GATE: the edge-function send path refuses a business's sends until
// ITS registration state is 'approved' — in addition to the existing global
// H38_SMS_SEND_RELEASED / H38_SMS_A2P_APPROVED flags and the full
// send-check list in docs/TASK_MESSAGING_OPERATING_CONTROLS.md. Default for
// every business is NOT approved. The client render below never implies a
// business is approved when no state row exists.
(function(){
'use strict';
var BUILD='20261109-10dlc-1';

var COLLECTION='smsRegistration';
var PROVIDER='telnyx'; // Telnyx only this round; Twilio/Plivo follow the same shape.

// Statuses (server-owned): not_started | precheck_failed | filed |
// in_review | approved | rejected
var STATUS_COPY={
  not_started:{label:'Not started', next:'Fill in the registration packet below, then ask Hank to run the pre-check.'},
  precheck_failed:{label:'Pre-check found gaps', next:'Fix the gaps listed below — nothing has been filed yet.'},
  filed:{label:'Filed with Telnyx', next:'Your paperwork is in. Telnyx and the carriers are reviewing it.'},
  in_review:{label:'In review', next:'Carriers usually take 3–5 business days. Hank checks the status automatically.'},
  approved:{label:'Approved — texting is live', next:'Your registration is approved. Customer texts can send from your number.'},
  rejected:{label:'Rejected by the carrier', next:'The carrier\u2019s reason is shown below. Fix it and Hank can file again — resubmits are free.'}
};

// ---- Pre-check (pure rules — same rules the edge function enforces) ----
// packet: { legalBusinessName, entityType, ein, street, city, state,
//   postalCode, country, contactEmail, contactPhone, website, vertical,
//   optInDescription, sampleMessages:[..], privacyUrl, privacyMentionsTexting }
function precheckPacket(packet){
  packet=packet||{};
  var gaps=[];
  function need(field,label,ok){ if(!ok) gaps.push({field:field,label:label}); }
  var name=String(packet.legalBusinessName||'').trim();
  need('legalBusinessName','Legal business name (exactly as it appears on the EIN filing)',name.length>=2);
  var entity=String(packet.entityType||'').trim();
  need('entityType','Business type (LLC, corporation, sole proprietor, nonprofit, government)',
    ['PRIVATE_PROFIT','PUBLIC_PROFIT','NON_PROFIT','GOVERNMENT','SOLE_PROPRIETOR'].indexOf(entity)>=0);
  var isSoleProp=entity==='SOLE_PROPRIETOR';
  var ein=String(packet.ein||'').replace(/\D/g,'');
  if(!isSoleProp){
    need('ein','EIN — 9 digits, matching the legal name above',ein.length===9);
  } else if(packet.ein && ein.length!==9){
    gaps.push({field:'ein',label:'EIN — if you enter one it must be 9 digits (sole proprietors may file without one)'});
  }
  need('street','Business street address',String(packet.street||'').trim().length>=3);
  need('city','Business city',String(packet.city||'').trim().length>=2);
  need('state','Business state (2 letters)',/^[A-Za-z]{2}$/.test(String(packet.state||'').trim()));
  need('postalCode','Business ZIP / postal code',String(packet.postalCode||'').trim().length>=3);
  var country=String(packet.country||'US').trim().toUpperCase();
  need('country','Business country (US)',country==='US');
  need('contactEmail','Contact email the carrier can reach',/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(packet.contactEmail||'').trim()));
  var phoneDigits=String(packet.contactPhone||'').replace(/\D/g,'');
  need('contactPhone','Contact phone (10-digit US number)',phoneDigits.length===10||(phoneDigits.length===11&&phoneDigits.charAt(0)==='1'));
  need('website','Business website (live, names the business)',/^https?:\/\/[^\s.]+\.[^\s]+/i.test(String(packet.website||'').trim()));
  need('vertical','Industry (what the business does)',String(packet.vertical||'').trim().length>=2);
  need('optInDescription','Opt-in description — how customers agree to get texts (at least a sentence)',
    String(packet.optInDescription||'').trim().length>=20);
  var samples=(packet.sampleMessages||[]).map(function(s){return String(s||'').trim();}).filter(function(s){return s.length>=10;});
  need('sampleMessages','At least 2 sample messages — real examples of texts you will send',samples.length>=2);
  need('privacyUrl','Privacy page URL',/^https?:\/\/[^\s.]+\.[^\s]+/i.test(String(packet.privacyUrl||'').trim()));
  need('privacyMentionsTexting','Privacy page must mention text messaging (what you send, opt-in, STOP to opt out)',
    packet.privacyMentionsTexting===true);
  return {ok:gaps.length===0,gaps:gaps};
}

// ---- Registration state (read-only client side) ----
function registrationRow(){
  try{
    var rows=records(COLLECTION)||[];
    for(var i=0;i<rows.length;i++){
      if(String(v(rows[i],'Provider')||PROVIDER).toLowerCase()===PROVIDER) return rows[i];
    }
    return rows[0]||null;
  }catch(e){ return null; }
}
function registrationState(){
  var row=registrationRow();
  if(!row) return {status:'not_started',gaps:[],reason:'',provider:PROVIDER,brandId:'',campaignId:'',updatedAt:''};
  var gaps=[];
  try{ gaps=JSON.parse(String(v(row,'Precheck Gaps')||'[]')); if(!Array.isArray(gaps)) gaps=[]; }catch(e){ gaps=[]; }
  return {
    status:String(v(row,'Registration Status')||'not_started'),
    gaps:gaps,
    reason:String(v(row,'Carrier Reason')||''),
    provider:String(v(row,'Provider')||PROVIDER),
    brandId:String(v(row,'Brand ID')||''),
    campaignId:String(v(row,'Campaign ID')||''),
    updatedAt:String(v(row,'Last Checked')||v(row,'Filed At')||'')
  };
}
function sendAllowed(){
  // Client-side mirror for display only. The edge function is the gate.
  return registrationState().status==='approved';
}

// ---- Filing / refresh requests → Kit (no credentials touch this client) ----
function isOwner(){
  try{
    var r=String((typeof state!=='undefined'&&state&&state.snapshot&&state.snapshot.user&&(state.snapshot.user.roleName||state.snapshot.user.role)||'')||'').toLowerCase();
    return r==='owner'||r==='administrator';
  }catch(e){ return false; }
}
async function submitRegistrationTask(action,packet){
  if(typeof state==='undefined'||!state.businessId) throw new Error('Open a business first.');
  if(!isOwner()) throw new Error('Only a business owner or administrator can file the texting registration.');
  if(!window.H38_AI_HANDOFF||typeof window.H38_AI_HANDOFF.submitTask!=='function'){
    throw new Error('AI handoff is not available right now. Try again in a moment.');
  }
  var taskId=await window.H38_AI_HANDOFF.submitTask('sms_registration',{
    businessId:state.businessId,
    action:action, // 'file' | 'refresh'
    provider:PROVIDER,
    packet:packet||{},
    requestedSecrets:[{key:'TELNYX_API_KEY',label:'API Key',hint:'Telnyx portal → API Keys'}],
    note:'Run the action server-side through the h38-sms-registration edge function with the customer\u2019s own stored Telnyx key. Never write secret values to the database or chat. A filing runs the pre-check first; an incomplete packet files nothing.'
  });
  return taskId;
}
async function requestFiling(packet){
  var check=precheckPacket(packet);
  if(!check.ok){
    // Show the gaps in the card; still nothing is submitted.
    return {filed:false,precheck:check};
  }
  var taskId=await submitRegistrationTask('file',packet);
  return {filed:true,taskId:taskId,precheck:check};
}
async function requestRefresh(){
  return submitRegistrationTask('refresh',{});
}

// ---- UI: registration block inside the Texting provider card ----
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

function registrationCard(){
  try{
    var st=registrationState();
    var copy=STATUS_COPY[st.status]||STATUS_COPY.not_started;
    var gapsHtml='';
    if(st.gaps&&st.gaps.length){
      gapsHtml='<ul class="small">'+st.gaps.map(function(g){return '<li>'+esc(g.label||g)+'</li>';}).join('')+'</ul>';
    }
    var reasonHtml=st.status==='rejected'&&st.reason
      ? '<p class="small"><strong>Carrier said:</strong> '+esc(st.reason)+'</p>' : '';
    var showForm=(st.status==='not_started'||st.status==='precheck_failed'||st.status==='rejected');
    var formHtml='';
    if(showForm){
      formHtml='<form id="smsRegistrationForm">'
        +'<label>Legal business name</label><input name="legalBusinessName" required maxlength="100">'
        +'<label>Business type</label><select name="entityType">'
        +'<option value="PRIVATE_PROFIT">Private business (LLC / corporation)</option>'
        +'<option value="SOLE_PROPRIETOR">Sole proprietor</option>'
        +'<option value="PUBLIC_PROFIT">Publicly traded company</option>'
        +'<option value="NON_PROFIT">Nonprofit</option>'
        +'<option value="GOVERNMENT">Government</option></select>'
        +'<label>EIN (9 digits — sole proprietors may leave blank)</label><input name="ein" maxlength="11" autocomplete="off">'
        +'<label>Street address</label><input name="street" required maxlength="120">'
        +'<label>City</label><input name="city" required maxlength="60">'
        +'<label>State (2 letters)</label><input name="state" required maxlength="2">'
        +'<label>ZIP code</label><input name="postalCode" required maxlength="10">'
        +'<label>Contact email</label><input name="contactEmail" type="email" required maxlength="120">'
        +'<label>Contact phone</label><input name="contactPhone" type="tel" required maxlength="20">'
        +'<label>Business website</label><input name="website" type="url" required maxlength="140" placeholder="https://">'
        +'<label>Industry</label><input name="vertical" required maxlength="50" placeholder="e.g. Professional services, Construction, Healthcare">'
        +'<label>How do customers agree to get texts? (opt-in)</label><textarea name="optInDescription" required maxlength="600" placeholder="Customers give their number and agree to texts when they book or sign a quote. We only text about their jobs."></textarea>'
        +'<label>Sample message 1</label><textarea name="sample1" required maxlength="320"></textarea>'
        +'<label>Sample message 2</label><textarea name="sample2" required maxlength="320"></textarea>'
        +'<label>Privacy page URL</label><input name="privacyUrl" type="url" required maxlength="200" placeholder="https://">'
        +'<label class="small"><input type="checkbox" name="privacyMentionsTexting" value="1"> My privacy page mentions text messaging (what we send, how customers opt in, and STOP to opt out)</label>'
        +'<div class="actions"><button type="button" class="secondary" id="smsRegPrecheck">Run pre-check</button>'
        +'<button id="smsRegFile">File my registration with Hank</button></div>'
        +'<div id="smsRegPrecheckOut" class="small"></div></form>';
    }
    var refreshHtml=(st.status==='filed'||st.status==='in_review')
      ? '<div class="actions"><button type="button" class="secondary" data-sms-reg-refresh>Check status now</button></div>' : '';
    return '<div class="row" id="smsRegistrationBlock"><div class="row-top"><strong>📋 Texting registration (10DLC)</strong>'
      +'<span class="pill">'+esc(copy.label)+'</span></div>'
      +'<small>Carriers require every business to register before its texts deliver. '
      +'Hank files it inside <strong>your own Telnyx account</strong> — the number and account stay yours. '
      +esc(copy.next)+'</small>'
      +gapsHtml+reasonHtml+formHtml+refreshHtml+'</div>';
  }catch(e){ return ''; }
}

function packetFromForm(form){
  var fd=new FormData(form);
  var d=Object.fromEntries(fd.entries());
  return {
    legalBusinessName:String(d.legalBusinessName||'').trim(),
    entityType:String(d.entityType||'PRIVATE_PROFIT'),
    ein:String(d.ein||'').trim(),
    street:String(d.street||'').trim(),
    city:String(d.city||'').trim(),
    state:String(d.state||'').trim().toUpperCase(),
    postalCode:String(d.postalCode||'').trim(),
    country:'US',
    contactEmail:String(d.contactEmail||'').trim(),
    contactPhone:String(d.contactPhone||'').trim(),
    website:String(d.website||'').trim(),
    vertical:String(d.vertical||'').trim(),
    optInDescription:String(d.optInDescription||'').trim(),
    sampleMessages:[String(d.sample1||'').trim(),String(d.sample2||'').trim()],
    privacyUrl:String(d.privacyUrl||'').trim(),
    privacyMentionsTexting:d.privacyMentionsTexting==='1'
  };
}

function bindRegistrationUI(){
  try{
    var root=document.getElementById('smsRegistrationBlock');
    if(!root) return;
    var form=document.getElementById('smsRegistrationForm');
    var preBtn=document.getElementById('smsRegPrecheck');
    if(preBtn&&form){
      preBtn.onclick=function(){
        var check=precheckPacket(packetFromForm(form));
        var out=document.getElementById('smsRegPrecheckOut');
        if(!out) return;
        if(check.ok){ out.innerHTML='<strong>Pre-check passed.</strong> The packet is complete — Hank can file it.'; }
        else{
          out.innerHTML='<strong>Not ready yet — '+check.gaps.length+' gap(s):</strong><ul>'
            +check.gaps.map(function(g){return '<li>'+esc(g.label)+'</li>';}).join('')+'</ul>';
        }
      };
    }
    if(form){
      form.onsubmit=function(ev){
        ev.preventDefault();
        var packet=packetFromForm(form);
        requestFiling(packet).then(function(r){
          if(r.filed){
            if(typeof toast==='function') toast('Filing requested. Hank runs the pre-check, then files in your Telnyx account.');
            if(typeof renderMessages==='function') renderMessages();
          }else{
            var out=document.getElementById('smsRegPrecheckOut');
            if(out){
              out.innerHTML='<strong>Nothing filed — '+r.precheck.gaps.length+' gap(s) to fix first:</strong><ul>'
                +r.precheck.gaps.map(function(g){return '<li>'+esc(g.label)+'</li>';}).join('')+'</ul>';
            }
            if(typeof toast==='function') toast('Pre-check found gaps — nothing was filed.',true);
          }
        }).catch(function(e){
          if(typeof toast==='function') toast(e.message||String(e),true);
        });
      };
    }
    root.querySelectorAll('[data-sms-reg-refresh]').forEach(function(b){
      b.onclick=function(){
        b.disabled=true;
        requestRefresh().then(function(){
          if(typeof toast==='function') toast('Status check requested. Hank will refresh it from Telnyx.');
          if(typeof renderMessages==='function') renderMessages();
        }).catch(function(e){
          b.disabled=false;
          if(typeof toast==='function') toast(e.message||String(e),true);
        });
      };
    });
  }catch(e){}
}

window.H38SmsRegistration={
  BUILD:BUILD,
  PROVIDER:PROVIDER,
  COLLECTION:COLLECTION,
  STATUS_COPY:STATUS_COPY,
  precheckPacket:precheckPacket,
  registrationState:registrationState,
  sendAllowed:sendAllowed,
  requestFiling:requestFiling,
  requestRefresh:requestRefresh,
  registrationCard:registrationCard,
  bindRegistrationUI:bindRegistrationUI,
  packetFromForm:packetFromForm
};
})();
